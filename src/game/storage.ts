/**
 * Kalıcı durum — sunucu yok, her şey localStorage'da.
 * Şema sürümlü: ileride biçim değişirse anahtarlar çakışmaz.
 */

import { bugun } from './types'

const ANAHTAR = 'cografya.v1'

/** Günün Ülkesi kaydı — seri hesabı için tarih anahtarıyla saklanır. */
export interface DailyKayit {
  ulke: string
  puan: number
  basarili: boolean
}

export interface Istatistik {
  /** Toplam oynanan tur */
  tur: number
  /** Birikmiş puan */
  puan: number
  /** Güncel seri */
  seri: number
  /** En uzun seri */
  enUzunSeri: number
  /** Toplam doğru konum tespiti */
  dogru: number
  /** Ülke bazlı doğruluk — hangi ülkeleri bilmiyorum? */
  ulkeBazli: Record<string, { dogru: number; toplam: number }>
  /** Günün ülkesi: bugünkü son durum (rozet ekranı için) */
  daily: { tarih: string; anahtar: string; puan: number } | null
  /** Günün Ülkesi geçmişi — "YYYY-AA-GG" → sonuç. Seri buradan hesaplanır. */
  dailyGecmisi: Record<string, DailyKayit>
}

export const BOS_ISTATISTIK: Istatistik = {
  tur: 0,
  puan: 0,
  seri: 0,
  enUzunSeri: 0,
  dogru: 0,
  ulkeBazli: {},
  daily: null,
  dailyGecmisi: {},
}

/** Kayıttan gelen sayısal alanı sonlu sayıya indirger.
 *  JSON.parse her şeyi kabul eder: `tur: "5"` (string), `puan: "abc"`,
 *  `NaN`, null, taşan kayan nokta … Bunlardan birkaçı olduğu gibi geçseydi
 *  `istatistik.puan + puan` string-birleştirme ("abc120") ve
 *  `undefined + 0 → NaN` üretirdi; arayüz "NaN tur oynandı" gösteriyordu.
 *  Bozuk alanı varsayılana düşürmek, zararsız (kayıt eski/elle düzenlenmiş
 *  olabilir) tek davranış. */
function sayi(deger: unknown, varsayilan = 0): number {
  if (typeof deger === 'number') return Number.isFinite(deger) ? deger : varsayilan
  /* Yalnızca sayı-sal metin ("90") sayıya çevirilir: Number('') ve
     Number([3]) gibi tuhaf dönüşümler (tek elemanlı dizinin değeri)
     buraya sızmaz. */
  if (typeof deger !== 'string' || deger.trim() === '' || /[eE+-]|0x/.test(deger)) {
    return varsayilan
  }
  const n = Number(deger)
  return Number.isFinite(n) ? n : varsayilan
}

export function yukle(): Istatistik {
  try {
    const ham = localStorage.getItem(ANAHTAR)
    if (!ham) return { ...BOS_ISTATISTIK }
    const veri = JSON.parse(ham) as Partial<Istatistik>
    /* Spread etmek yerine alanları ELEMEYEREK kopyalıyoruz: yalnızca
       şemadaki alanlar, yalnızca geçerli tipler. Spread `__proto__`
       anahtarını bile kendi alan olarak tanımlayıp prototipi kirletmez,
       ama yanlış tipli alanları da olduğu gibi taşır — o yüzden açıkça
       seçiyoruz. */
    const ulkeBazli: Record<string, { dogru: number; toplam: number }> = {}
    for (const [k, v] of Object.entries(veri.ulkeBazli ?? {})) {
      if (typeof v !== 'object' || v === null) continue
      const g = v as { dogru?: unknown; toplam?: unknown }
      ulkeBazli[k] = { dogru: sayi(g.dogru), toplam: sayi(g.toplam) }
    }
    const dailyGecmisi: Record<string, DailyKayit> = {}
    for (const [k, v] of Object.entries(veri.dailyGecmisi ?? {})) {
      if (typeof v !== 'object' || v === null) continue
      const g = v as { ulke?: unknown; puan?: unknown; basarili?: unknown }
      dailyGecmisi[k] = { ulke: String(g.ulke ?? ''), puan: sayi(g.puan), basarili: Boolean(g.basarili) }
    }
    const daily = (() => {
      if (typeof veri.daily !== 'object' || veri.daily === null) return null
      const g = veri.daily as { tarih?: unknown; anahtar?: unknown; puan?: unknown }
      if (typeof g.tarih !== 'string') return null
      return { tarih: g.tarih, anahtar: String(g.anahtar ?? ''), puan: sayi(g.puan) }
    })()
    return {
      tur: sayi(veri.tur),
      puan: sayi(veri.puan),
      seri: sayi(veri.seri),
      enUzunSeri: sayi(veri.enUzunSeri),
      dogru: sayi(veri.dogru),
      ulkeBazli,
      daily,
      dailyGecmisi,
    }
  } catch {
    return { ...BOS_ISTATISTIK }
  }
}

export function kaydet(istatistik: Istatistik): void {
  try {
    localStorage.setItem(ANAHTAR, JSON.stringify(istatistik))
  } catch {
    // Kota dolu veya özel mod — oyun yine de çalışır, sadece kayıt olmaz
  }
}

export function turEkle(
  istatistik: Istatistik,
  ulkeAnahtar: string,
  basarili: boolean,
  puan: number,
): Istatistik {
  const seri = basarili ? istatistik.seri + 1 : 0
  const mevcut = istatistik.ulkeBazli[ulkeAnahtar] ?? { dogru: 0, toplam: 0 }
  return {
    ...istatistik,
    tur: istatistik.tur + 1,
    puan: istatistik.puan + puan,
    seri,
    enUzunSeri: Math.max(istatistik.enUzunSeri, seri),
    dogru: istatistik.dogru + (basarili ? 1 : 0),
    ulkeBazli: {
      ...istatistik.ulkeBazli,
      [ulkeAnahtar]: { dogru: mevcut.dogru + (basarili ? 1 : 0), toplam: mevcut.toplam + 1 },
    },
  }
}

/* ── Günün Ülkesi ────────────────────────────────────────────────────────── */

function gunOnce(tarih: Date): string {
  const d = new Date(tarih)
  d.setDate(d.getDate() - 1)
  return bugun(d)
}

export function dailyKaydet(
  istatistik: Istatistik,
  ulkeAnahtar: string,
  puan: number,
  basarili: boolean,
  tarih = new Date(),
): Istatistik {
  const t = bugun(tarih)
  // Bugün zaten kaydedilmişse üzerine YAZMA — mod tekrar oynanabiliyor
  // (bilinçli olarak engellenmiyor) ama ilk sonuç kalıcı olmalı, yoksa
  // oyuncu cevabı gördükten sonra yeniden oynayıp puanı/streak'i değiştirebilir.
  if (istatistik.dailyGecmisi[t]) return istatistik
  return {
    ...istatistik,
    daily: { tarih: t, anahtar: ulkeAnahtar, puan },
    dailyGecmisi: {
      ...istatistik.dailyGecmisi,
      [t]: { ulke: ulkeAnahtar, puan, basarili },
    },
  }
}

/* Seri kuralı: bugün oynanmışsa bugünden, oynanmamışsa DÜN oynanmışsa dünden
   geriye sayılır. Yani "seri" ertesi gün oynanmaya başlayınca ölmez —
   kullanıcı akşam oynayıp sabah unuttuğunda sıfırlanmış görünmesin. */
export function gununSerisi(istatistik: Istatistik, tarih = new Date()): number {
  const g = istatistik.dailyGecmisi
  if (Object.keys(g).length === 0) return 0
  const bugunStr = bugun(tarih)
  const dunStr = gunOnce(tarih)
  let imlec = g[bugunStr] ? bugunStr : g[dunStr] ? dunStr : null
  if (!imlec) return 0

  let seri = 0
  const d = new Date(tarih)
  if (imlec === dunStr) d.setDate(d.getDate() - 1)
  for (let i = 0; i < 400; i++) {
    const anahtar = bugun(d)
    if (!g[anahtar]) break
    seri++
    d.setDate(d.getDate() - 1)
  }
  return seri
}

/** Paylaşılabilir metin — kopyala-yapıştır, resim üretmeye gerek yok. */
export function dailyPaylasMetni(
  istatistik: Istatistik,
  ulkeTr: string,
  basarili: boolean,
  tarih = new Date(),
): string {
  const seri = gununSerisi(istatistik, tarih)
  const bugunku = istatistik.dailyGecmisi[bugun(tarih)]
  const puan = bugunku?.puan ?? 0
  const rozet = seri >= 30 ? '🏆' : seri >= 7 ? '⭐️' : '📍'
  const durum = basarili ? '✅' : '❌'
  const satirlar = [
    `${rozet} Günün Ülkesi — ${bugun(tarih)}`,
    `${durum} ${ulkeTr}`,
    `Puan: ${puan} / 175`,
  ]
  if (seri > 1) satirlar.push(`Seri: ${seri} gün 🔥`)
  satirlar.push('', 'Coğrafya Tahmin · dünya küresinde ülke bul')
  return satirlar.join('\n')
}

/** Panoya kopyalar. Eski API'ye düşer. */
export async function panoyaKopyala(metin: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(metin)
      return true
    }
  } catch {
    /* aşağıya düş */
  }
  try {
    const alan = document.createElement('textarea')
    alan.value = metin
    alan.setAttribute('readonly', '')
    alan.style.position = 'fixed'
    alan.style.opacity = '0'
    document.body.appendChild(alan)
    alan.select()
    const ok = document.execCommand('copy')
    document.body.removeChild(alan)
    return ok
  } catch {
    return false
  }
}
