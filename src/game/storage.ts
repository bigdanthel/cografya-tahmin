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

export function yukle(): Istatistik {
  try {
    const ham = localStorage.getItem(ANAHTAR)
    if (!ham) return { ...BOS_ISTATISTIK }
    const veri = JSON.parse(ham) as Partial<Istatistik>
    return {
      ...BOS_ISTATISTIK,
      ...veri,
      ulkeBazli: veri.ulkeBazli ?? {},
      dailyGecmisi: veri.dailyGecmisi ?? {},
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
