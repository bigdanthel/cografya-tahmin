import type { Country } from '../lib/world'
import type { PuanKutusu } from './score'
import type { Secenek } from './basKentSecenekleri'

/** V1'deki beş mod tek bir Question tipinin varyasyonu. */
export type Mod = 'kolay' | 'bayrak' | 'korluk' | 'hiz' | 'daily'

export interface ModTanimi {
  id: Mod
  ad: string
  ikon: string
  aciklama: string
  /** Kaç ülke sorulur */
  turSayisi: number
  /** Süre sınırı (saniye), yoksa undefined */
  sure?: number
}

export const MODLAR: ModTanimi[] = [
  {
    id: 'kolay',
    ad: 'Kolay',
    ikon: '◎',
    aciklama: 'Ülkeyi bul, başkentini seç',
    turSayisi: 10,
  },
  {
    id: 'bayrak',
    ad: 'Bayrağı Bul',
    ikon: '⚑',
    aciklama: 'Bayrağı gör, ülkeyi bul',
    turSayisi: 10,
  },
  {
    id: 'korluk',
    ad: 'Körlük',
    ikon: '◐',
    aciklama: 'Sadece ipuçları — isim yok',
    turSayisi: 8,
  },
  {
    id: 'hiz',
    ad: 'Süreli Hız',
    ikon: '⏱',
    aciklama: '60 saniyede kaç ülke',
    turSayisi: 20,
    sure: 60,
  },
  {
    id: 'daily',
    ad: 'Günün Ülkesi',
    ikon: '◈',
    aciklama: 'Her gün aynı ülke',
    turSayisi: 1,
  },
]

export interface Soru {
  hedef: Country
  /** Bu soruda ne gösterilir */
  ipucu: 'ad' | 'bayrak' | 'yok'
  /** Körlük modunda kullanıcıya verilecek ipuçları — en ucuzdan pahalıya,
      sırayla açılır (ilk olan bedava) */
  ipuclari: Ipucu[]
  /** Başkent sorusu sorulacak mı */
  basKentSorusu: boolean
  /** 5 seçenek; 3'ü kasıtlı olarak zor (komşu ülke / benzer yazım / coğrafi yakınlık) */
  secenekler: Secenek[]
}

export type Asama = 'oyun' | 'cevap' | 'sonuc'

/** Bir turun sonundaki tek satır — sonuç ekranında gösterilir. */
export interface TurSonucu {
  ulke: Country
  tiklama: [number, number] | null
  kutu: PuanKutusu
  basKentGirdi: string | null
  basKentPuan: number
  basKentTur: 'tam' | 'yakın' | 'onay' | 'yanlış' | 'bos'
  /** Ham (cezasız) puan — dağılım çubuğunda referans */
  ham: number
  toplam: number
  sureBonusu: number
  /** Körlük modunda açılan ücretli ipucu sayısı */
  ipucuSayisi: number
  /** İpuçlarının ham maliyeti (ceza tavana çarptıysa bu korunur) */
  ipucuMaliyet: number
  /** Gerçekten düşülen puan — ham puanı aşamaz */
  ipucuCezasi: number
  basarili: boolean
}

/** Günün ülkesi: tarihe bağlı deterministik seçim.
 *
 *  TARİH BİRİMİ: `toISOString()` UTC kullanır ve "bugün" oyuncunun günü
 *  olmayabilir (TR'de gece yarısından sonra UTC günü hâlâ dünkü). Seri
 *  hesabı da yerel tarihle yürüdüğü için ikisi ayrışıyordu: gece yarısından
 *  sonra ülke değişiyor ama streak "bugün"ü görmüyordu. İkisi de
 *  `bugun()`'ı kullanıyor. */
export function bugun(tarih = new Date()): string {
  const y = tarih.getFullYear()
  const a = String(tarih.getMonth() + 1).padStart(2, '0')
  const g = String(tarih.getDate()).padStart(2, '0')
  return `${y}-${a}-${g}`
}

export function gununUlkesi(havuz: Country[], tarih = new Date()): Country {
  const anahtar = bugun(tarih)
  let hash = 0
  for (let i = 0; i < anahtar.length; i++) {
    hash = (hash * 31 + anahtar.charCodeAt(i)) >>> 0
  }
  return havuz[hash % havuz.length]!
}

/* ── Körlük modu ipuçları ───────────────────────────────────────────────────
   Önceden bütün ipuçları bir anda dökülüyordu: kıta + başkentin ilk harfi +
   komşular + alan. Bu hem çok bilgi veriyordu (ilk iki ipucu çoğu ülkede
   tek başına çözüyor) hem de oyunun "keşif" tadını alıyordun — çünkü oyuncu
   sadece ipucu listesini okuyup haritaya bakıyordu.

   Şimdi ipuçları KADEMELİ: ilki (kıta) bedava, geri kalanlar kullanıcı
   isteye isteye açılıyor ve her biri puandan düşüyor. Sıralama "en az
   bilgi verenden" — yani ilk ipuçları işe yarıyor, sonuncular neredeyse
   cevabı veriyor. */

export interface Ipucu {
  etiket: string
  deger: string
  /** Kaç puandan düşüyor (0 = bedava) */
  maliyet: number
}

let _adBul: (a: string) => string | undefined = () => undefined
export function adBulAyarla(fn: (a: string) => string | undefined) {
  _adBul = fn
}
function komsuTr(anahtar: string): string | undefined {
  return _adBul(anahtar)
}

/** Bir ipucu listesini üretir; ilki bedavadır, kalanlara kademeli maliyet yazılır. */
export function korlukIpuclari(u: Country): Ipucu[] {
  const ipuclari: Ipucu[] = [
    { etiket: 'Kıta', deger: u.kita, maliyet: 0 },
    { etiket: 'Konum', deger: konumEtiketi(u), maliyet: 6 },
    { etiket: 'Yaklaşık alan', deger: alanEtiketi(u), maliyet: 8 },
    { etiket: 'Başkent', deger: basKentEtiketi(u), maliyet: 12 },
  ]

  const komsular = u.komsu
    .map((k) => komsuTr(k))
    .filter((x): x is string => Boolean(x))
  if (komsular.length) {
    ipuclari.push({
      etiket: 'Komşular',
      deger: komsular.slice(0, 4).join(', ') + (u.komsu.length > 4 ? ` (+${u.komsu.length - 4})` : ''),
      maliyet: 18,
    })
  }

  // En pahalı: ad neredeyse açık ediyor. Yine de maskesiz vermiyoruz.
  ipuclari.push({ etiket: 'Ad', deger: adMaskesi(u.tr), maliyet: 30 })
  return ipuclari
}

/** Ülkenin küre üzerindeki yarımı — "buraya bak" ipucu.
 *  Coğrafi olarak en faydalı ipuç: kıtayı zaten biliyorsun, kıtayı bilmiyorsan
 *  zaten ilk ipucu işe yarıyor. */
function konumEtiketi(u: Country): string {
  const [lon, lat] = u.centroid
  const kuzeyGuney = lat >= 0 ? 'ekvatorun kuzeyinde' : 'ekvatorun güneyinde'
  const doguBati = lon >= 0 ? 'doğu yarımkürede' : 'batı yarımkürede'
  const kutuGenislik = u.kutu[0]
  // Kutu çok genişse ülke iki yarımküreyi de kapsıyor (Rusya, ABD, Kiribati)
  const ikiYari = kutuGenislik > 100 ? ' — iki yarımküreyi de kapsıyor' : ''
  return `${kuzeyGuney}, ${doguBati}${ikiYari}`
}

/** Başkentin harf sayısı + ilk iki harfi. Tüm harfleri vermek cevabı verirdi. */
function basKentEtiketi(u: Country): string {
  const bas = u.bas
  if (bas.length <= 2) return `${bas.length} harf`
  const ilk = bas.slice(0, 2)
  return `${bas.length} harf · ${ilk}${'·'.repeat(bas.length - 2)}`
}

/** Ülke adının maskesi: harf sayısı + ilk ve son harf. */
function adMaskesi(ad: string): string {
  if (ad.length <= 2) return ad
  return `${ad[0]}${'·'.repeat(ad.length - 2)}${ad[ad.length - 1]}`
}

/** Ülke büyüklüğü — bounding box alanından kaba tahmin.
    Gerçek yüzölçümü (km²) daha iyi olurdu ama veri tabanında yok. */
function alanEtiketi(u: Country): string {
  const [genislik, yukseklik] = u.kutu
  const alan = genislik * yukseklik
  if (alan > 20000) return 'Kıta ölçeği — çok büyük'
  if (alan > 3000) return 'Büyük bir ülke'
  if (alan > 400) return 'Orta büyüklükte'
  if (alan > 20) return 'Küçük bir ülke'
  return 'Minik bir ülke — yakınlaştırmak gerek'
}
