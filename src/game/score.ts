import { geoDistance } from 'd3-geo'
import { kabulKumesi, ulkeBul, type Country } from '../lib/world'

/** Dünya yarıçapı (km) */
const DUNYA_YARICAPI = 6371

/** Yaklaşık 4000 km'de puan ~%37'ye düşer, 8000 km'de neredeyse 0. */
const MESAFE_OLCEK = 4000

export interface PuanKutusu {
  /** Konum puanı 0–100 */
  konum: number
  /** Kıta puanı 0/25/50 */
  kita: number
  /** Başkent puanı 0–50 */
  basKent: number
  toplam: number
  /** Tıklama gerçekten hedef ülkeye mi düştü */
  tam: boolean
  /** Komşu ülke kabulüyle mi puanlandı */
  toleransli: boolean
  /** Kullanıcının tıkladığı ülkenin adı (bilmiyorsa null) */
  tiklanan: string | null
  /** Mesafe km — geri bildirim metni için */
  mesafeKm: number
}

export const BASLIK_PUAN = 50
/** Tam ülke isabetinde kıta puanı */
export const KITA_PUAN_TAM = 25
/** Komşu ülkeye tıklayıp toleranslı kabul edildiğinde */
export const KITA_PUAN_KOMSULU = 15
/** Doğru kıtada ama YANLIŞ ülkeye tıklandığında (komşu değil).
    Plan dokümanında 20 olarak belirlenmişti; kod yanlışlıkla
    KITA_PUAN_KOMSULU'yu kullanıyordu, ayrı sabit eklendi. */
export const KITA_PUAN_AYNI_KITA = 20
export const TOLERANS_CARPAN = 0.7

/** İki coğrafi nokta arası yüzey uzaklığı (km) */
export function kmUzaklik(a: [number, number], b: [number, number]): number {
  return geoDistance(a, b) * DUNYA_YARICAPI
}

/** Mesafeye bağlı konum puanı 0–100 (üstel azalma) */
export function konumPuani(mesafeKm: number): number {
  return Math.round(100 * Math.exp(-mesafeKm / MESAFE_OLCEK))
}

/**
 * Tıklamayı puanlar.
 * @param tIkNokta kullanıcının tıkladığı [lon, lat]
 * @param tiklananAnahtar tıklamanın düştüğü ülkenin anahtarı (hit layer'dan)
 */
export function tiklamayiPuanla(hedef: Country, tIkNokta: [number, number], tiklananAnahtar: string | null): PuanKutusu {
  /* Mesafe `isabet` noktasına ölçülür, `centroid`'e DEĞİL.
     Centroid alan ağırlıklı olduğu için ada devletlerinde ve uzak topraklı
     ülkelerde okyanusa düşebiliyordu; ölçüldü: Kiribati'de ülkeye tam
     tıklama 87 puan getiriyordu, Fransa'da 91. Oyuncu doğru yere tıklıyor,
     puan düşüyor, sebebi görünmüyordu. */
  const mesafeKm = kmUzaklik(tIkNokta, hedef.isabet)

  // 1. Doğrudan ülkeye mi tıklandı?
  if (tiklananAnahtar && tiklananAnahtar === hedef.anahtar) {
    return {
      konum: konumPuani(mesafeKm),
      kita: KITA_PUAN_TAM,
      basKent: 0,
      toplam: 0, // başkent puanı sonradan eklenir
      tam: true,
      toleransli: false,
      tiklanan: hedef.tr,
      mesafeKm: Math.round(mesafeKm),
    }
  }

  // 2. Toleranslı: komşu ülkeye tıklandı mı? (sınır anlaşmazlıkları)
  const kabul = kabulKumesi(hedef)
  if (tiklananAnahtar && kabul.has(tiklananAnahtar)) {
    const komşu = ulkeBul(tiklananAnahtar)
    return {
      konum: Math.round(konumPuani(mesafeKm) * TOLERANS_CARPAN),
      kita: KITA_PUAN_KOMSULU,
      basKent: 0,
      toplam: 0,
      tam: false,
      toleransli: true,
      tiklanan: komşu?.tr ?? null,
      mesafeKm: Math.round(mesafeKm),
    }
  }

  // 3. Yanlış ülke — doğru kıtada mı?
  const yanlis = tiklananAnahtar ? ulkeBul(tiklananAnahtar) : null
  let kitaPuani = 0
  if (yanlis && (yanlis.kita === hedef.kita || hedef.kitaAlt.includes(yanlis.kita))) {
    kitaPuani = KITA_PUAN_AYNI_KITA
  }

  // Uzaktan tıklama yine de bir miktar puan ver (tamamen yanlış olmasın)
  const konum = Math.round(Math.min(20, konumPuani(mesafeKm) * 0.2))

  return {
    konum,
    kita: kitaPuani,
    basKent: 0,
    toplam: 0,
    tam: false,
    toleransli: false,
    tiklanan: yanlis?.tr ?? null,
    mesafeKm: Math.round(mesafeKm),
  }
}

/** Başkent yazımı için puan: tam → 50, yakın → 40, bonus → 48, yanlış → 0 */
export function basKentPuani(tur: 'tam' | 'yakın' | 'onay' | 'yanlış', bonusMu: boolean): number {
  if (bonusMu) return Math.round(BASLIK_PUAN * 0.95)
  switch (tur) {
    case 'tam':
      return BASLIK_PUAN
    case 'yakın':
      return Math.round(BASLIK_PUAN * 0.8)
    case 'onay':
      return Math.round(BASLIK_PUAN * 0.5)
    default:
      return 0
  }
}

/** Toplam puanı hesaplar (max 175) */
export function toplamPuan(k: PuanKutusu, basKent: number, sureBonusu = 0): number {
  return Math.min(175, k.konum + k.kita + basKent + sureBonusu)
}

/** Sonuç metni — geri bildirim ekranında gösterilir. */
export function sonucMetni(k: PuanKutusu, hedef: Country): { baslik: string; renk: 'iyi' | 'orta' | 'kotu' } {
  if (k.tam) return { baslik: `Doğru! ${hedef.tr}`, renk: 'iyi' }
  if (k.toleransli) return { baslik: `Sınırda — ${hedef.tr} kabul edildi`, renk: 'orta' }
  if (k.kita > 0) return { baslik: `Doğru kıta, yanlış ülke — ${hedef.tr}`, renk: 'orta' }
  if (k.tiklanan) return { baslik: `Bu ${k.tiklanan}, ${hedef.tr} değil`, renk: 'kotu' }
  return { baslik: `${hedef.tr} burada değil`, renk: 'kotu' }
}
