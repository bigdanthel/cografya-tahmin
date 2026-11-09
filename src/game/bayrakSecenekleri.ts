/**
 * Bayrağı Tanı modu için 5 seçenekli çoktan seçmeli — ülke adı verilir,
 * kullanıcı doğru bayrağı seçmelidir (Bayrağı Bul'un tersi).
 *
 * Çeldiriciler `basKentSecenekleri` ile aynı felsefede veriden türetilir:
 *   1) Komşu ülkelerin bayrakları → coğrafi karışıklık
 *   2) Aynı kıtadan rastgele bayraklar → bölgesel stil benzerliği
 *   3) Kalan yer havuzdan rastgele
 *
 * Bilinçli kısaltma: renk-bazlı "benzer bayrak" çeldiricisi (Çad ↔ Romanya,
 * Endonezya ↔ Monako gibi) bu sürümde yok — o kaynak yalnızca coğrafya
 * bilgisine dayanamaz; SVG renk imzası çözümü ileride build-time
 * eklenebilir (bkz. PLAN §5).
 *
 * Ada ülkelerinin komşusu olmadığı için 1. kaynak her ülkede dolmaz;
 * 3. kaynak güvenlik ağıdır. Havuzdaki 194/194 ülkenin SVG bayrağı var,
 * `bayrak: null` yalnızca savunmacı olarak kalır (bileşende emoji yedeği).
 */

import { karistir } from './basKentSecenekleri'
import type { Country } from '../lib/world'

export interface BayrakSecenek {
  /** Seçeneğin ait olduğu ülkenin TÜRKÇE adı — doğru cevap hedefin kendisi */
  ulke: string
  /** `public/flags/` altındaki SVG yolu; null → bileşen emoji yedeği gösterir */
  bayrak: string | null
  /** Yanıltıcının kaynağı. Doğru cevapta null. */
  zorluk: 'komsu' | 'kita' | 'rastgele' | null
  /** Doğru cevap mı */
  dogru: boolean
}

const SECENEK_SAYISI = 5
/** Kasıtlı olarak zor (komşu/kıta) çeldirici sayısı; kalan tek yer rastgele */
const ZOR_SECENEK_SAYISI = 3

/**
 * Bir ülke için 5 bayrak seçeneği üretir.
 * @param havuz soru havuzundaki tüm ülkeler (çeldirici kaynağı)
 */
export function bayrakSecenekUret(hedef: Country, havuz: Country[]): BayrakSecenek[] {
  // `komsu` runtime'da anahtar-bazlıdır (bkz. Country.komsu dokümanı)
  const byAnahtar = new Map(havuz.map((u) => [u.anahtar, u]))
  const kullanilan = new Set<string>([hedef.anahtar])
  const secenekler: BayrakSecenek[] = []

  const ekle = (u: Country | undefined, kaynak: NonNullable<BayrakSecenek['zorluk']>): boolean => {
    /* Havuz dışı komşu (ör. Batı Sahra) bayraksız olabilir — eklemez,
       sonraki aday doldurur (bkz. dosya üstü not). */
    if (!u || kullanilan.has(u.anahtar)) return false
    kullanilan.add(u.anahtar)
    secenekler.push({ ulke: u.tr, bayrak: u.bayrak, dogru: false, zorluk: kaynak })
    return true
  }

  // 1) Komşular — coğrafi karışıklık (en güçlü kaynak)
  for (const k of hedef.komsu) {
    if (secenekler.length >= ZOR_SECENEK_SAYISI) break
    ekle(byAnahtar.get(k), 'komsu')
  }

  // 2) Aynı kıta — bölgesel bayrak stilleri birbirine benzeyebilir
  if (secenekler.length < ZOR_SECENEK_SAYISI) {
    const kitalilar = karistir(havuz.filter((u) => u.kita === hedef.kita))
    for (const u of kitalilar) {
      if (secenekler.length >= ZOR_SECENEK_SAYISI) break
      ekle(u, 'kita')
    }
  }

  // 3) Kalan yerler rastgele — havuz tükense de sonsuz döngüye girme
  while (secenekler.length < SECENEK_SAYISI - 1) {
    let eklendi = false
    const havuzKaristir = karistir(havuz)
    for (const u of havuzKaristir) {
      if (ekle(u, 'rastgele')) {
        eklendi = true
        break
      }
    }
    if (!eklendi) break
  }

  secenekler.push({
    ulke: hedef.tr,
    bayrak: hedef.bayrak,
    dogru: true,
    zorluk: null,
  })
  return karistir(secenekler)
}
