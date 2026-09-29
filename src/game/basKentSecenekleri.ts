/**
 * Başkent sorusu için 5 seçenekli çoktan seçmeli — 3'ü kasıtlı olarak ZOR.
 *
 * Zor seçeneğin iki kaynağı var:
 *   1. Komşu ülkelerin başkentleri  → coğrafi karışıklık (Kolombiya ≠ Venezuela)
 *   2. Yazım benzerliği yüksek başkentler → ses karışıklığı (Bern ↔ Berlin)
 * Ada ülkeleri için ikisi de yetmeyebiliyor; o zaman coğrafi yakınlık devreye
 * giriyor (Maldivler ↔ Seyşeller).
 *
 * 193 ülkede elle yazmak imkânsız olduğu için hepsi veriden türetiliyor ve
 * build/test ile doğrulanıyor.
 */

import { benzerlik, mesafe, normalize } from './fuzzy'
import type { Country } from '../lib/world'

export interface Secenek {
  /** Görünen metin — başkent adı */
  metin: string
  /** Doğru cevap mı */
  dogru: boolean
  /** Yanıltıcının neden zor seçenek olduğu. Doğru cevapda null. */
  zorluk: 'komsu' | 'benzer' | 'yakin' | 'rastgele' | null
  /** Seçeneğin ait olduğu ülke (hata ayıklamada / ipucunda kullanılır) */
  ulke: string
}

const SECENEK_SAYISI = 5
const ZOR_SECENEK_SAYISI = 3
/** Yazım benzerliği eşiği. Ölçüldü: 0.62 iyi çiftleri veriyor
 *  (Kingstown↔Kingston %89, Bern↔Berlin %67, Sana↔Astana %67) ve
 *  sahte eşleşmeleri eliyor (Vatikan↔Atina %57 — kimse bunları karıştırmaz). */
const BENZER_ESIK = 0.62
/** Mutlak mesafe sınırı: uzun kelimelerde 1 - d/uzunluk oranı yüksek çıkar,
 *  bu yüzden kaç harf değişebileceğine de sınır koyuyoruz. */
const BENZER_MESAFE_MAX = 4
/** Komsu + benzer yetmezse kaç yakın ülkeye bakılsın */
const YAKIN_ADAY = 12

/** Dünya yarıçapı (km) */
const DUNYA_YARICAPI = 6371

function kmUzaklik(a: [number, number], b: [number, number]): number {
  const r = Math.PI / 180
  const dLat = (b[1] - a[1]) * r
  const dLon = (b[0] - a[0]) * r
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * r) * Math.cos(b[1] * r) * Math.sin(dLon / 2) ** 2
  return 2 * DUNYA_YARICAPI * Math.asin(Math.sqrt(h))
}

/** Fisher-Yates — seçeneklerin sırası her soruda farklı olsun */
function karistir<T>(dizi: T[]): T[] {
  const kopya = [...dizi]
  for (let i = kopya.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[kopya[i], kopya[j]] = [kopya[j]!, kopya[i]!]
  }
  return kopya
}

/**
 * Bir ülke için 5 seçenek üretir.
 * @param havuz soru havuzundaki tüm ülkeler (yanıltıcı kaynak)
 */
export function secenekUret(hedef: Country, havuz: Country[]): Secenek[] {
  const anahtarBy = new Map(havuz.map((u) => [u.anahtar, u]))
  const kullanilan = new Set<string>()
  /** Normalize edilmiş metin bazında tekrarı engelle */
  const kullanilanMetin = new Set<string>([normalize(hedef.bas)])

  const zor: Secenek[] = []
  const ekle = (u: Country | undefined, zorluk: Secenek['zorluk']) => {
    if (!u || u.anahtar === hedef.anahtar) return false
    if (kullanilan.has(u.anahtar)) return false
    const metin = normalize(u.bas)
    if (kullanilanMetin.has(metin)) return false
    kullanilan.add(u.anahtar)
    kullanilanMetin.add(metin)
    zor.push({ metin: u.bas, dogru: false, zorluk, ulke: u.tr })
    return true
  }

  // 1) Komşular — en güçlü karışıklık kaynağı
  for (const k of hedef.komsu) ekle(anahtarBy.get(k), 'komsu')

  // 2) Yazım benzerliği yüksek başkentler
  const benzerler = havuz
    .filter((u) => u.anahtar !== hedef.anahtar)
    .map((u) => ({ u, s: benzerlik(hedef.bas, u.bas) }))
    .filter(
      (x) =>
        x.s >= BENZER_ESIK &&
        mesafe(normalize(hedef.bas), normalize(x.u.bas)) <= BENZER_MESAFE_MAX,
    )
    .sort((a, b) => b.s - a.s)
  for (const { u } of benzerler) {
    if (zor.length >= ZOR_SECENEK_SAYISI) break
    ekle(u, 'benzer')
  }

  // 3) Coğrafi yakınlık — ada ülkeleri için güvenlik ağı
  if (zor.length < ZOR_SECENEK_SAYISI) {
    const yakinlar = havuz
      .filter((u) => u.anahtar !== hedef.anahtar)
      .map((u) => ({ u, d: kmUzaklik(hedef.centroid, u.centroid) }))
      .sort((a, b) => a.d - b.d)
      .slice(0, YAKIN_ADAY)
    for (const { u } of yakinlar) {
      if (zor.length >= ZOR_SECENEK_SAYISI) break
      ekle(u, 'yakin')
    }
  }

  const secenekler: Secenek[] = [...zor.slice(0, ZOR_SECENEK_SAYISI)]

  // 4) Kalan yerleri rastgele doldur
  const bos = SECENEK_SAYISI - 1 - secenekler.length
  if (bos > 0) {
    const havuzKaristir = karistir(havuz.filter((u) => !kullanilan.has(u.anahtar)))
    for (const u of havuzKaristir) {
      if (secenekler.length >= SECENEK_SAYISI - 1) break
      if (!ekle(u, 'rastgele')) continue
      secenekler.push({ metin: u.bas, dogru: false, zorluk: 'rastgele', ulke: u.tr })
    }
  }

  secenekler.push({ metin: hedef.bas, dogru: true, zorluk: null, ulke: hedef.tr })
  return karistir(secenekler)
}

/** Kullanıcının seçtiği seçeneğe göre puan */
export function secenekPuani(secenek: Secenek | null | undefined): number {
  return secenek?.dogru ? 50 : 0
}
