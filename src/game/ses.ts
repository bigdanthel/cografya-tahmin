/**
 * Ses efektleri — Web Audio API ile, harici dosya yok.
 *
 * Tarayıcı politikası gereği ses yalnızca KULLANICI ETKİLEŞİMİ sonrasında
 * başlatılabilir. Bu yüzden `hazirla()` ilk tıklamada çağrılır.
 *
 * Sesler kasıtlı olarak kısa ve yumuşak: oyun hızlı ilerlediği için
 * her tıklamada hoparlör çınlamamalı.
 */

const ANAHTAR = 'cografya.ses.v1'

let ctx: AudioContext | null = null
let acik = true
let baslatildi = false

function tercihOku(): boolean {
  try {
    return localStorage.getItem(ANAHTAR) !== 'kapali'
  } catch {
    return true
  }
}

function tercihYaz(deger: boolean): void {
  try {
    localStorage.setItem(ANAHTAR, deger ? 'acik' : 'kapali')
  } catch {
    /* kota dolu — sessizce yoksay */
  }
}

acik = tercihOku()

/** İlk kullanıcı etkileşiminde çağrılmalı.
 *  `ton()` bunu kendi içinde yapabildiği için ayrıca çağırmak zorunlu değil —
 *  her ses bir tıklama/dokunma tetiklediği için bağlam o anda kurulur. */
export function hazirla(): void {
  if (baslatildi) return
  baslatildi = true
  try {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    ctx = new AC()
  } catch {
    ctx = null
  }
}

export function sesAcikMi(): boolean {
  return acik
}

export function sesiDegistir(): boolean {
  acik = !acik
  tercihYaz(acik)
  if (acik) hazirla()
  return acik
}

/** Tek bir ton. Zarf (envelope) ile "tık" sesini yumuşatır. */
function ton(
  frekans: number,
  sure: number,
  tip: OscillatorType = 'sine',
  hacim = 0.06,
  gecikme = 0,
  kayma = 0,
): void {
  if (!acik) return
  // Bağlam yoksa bu çağrı bir kullanıcı etkileşiminin içindedir → kurmak yasal.
  hazirla()
  if (!ctx) return
  // Sekme arka plandaysa tarayıcı bağlamı askıya alır
  if (ctx.state === 'suspended') void ctx.resume()

  const t0 = ctx.currentTime + gecikme
  const osc = ctx.createOscillator()
  const kazanc = ctx.createGain()

  osc.type = tip
  osc.frequency.setValueAtTime(frekans, t0)
  if (kayma) osc.frequency.exponentialRampToValueAtTime(Math.max(1, frekans + kayma), t0 + sure)

  // Hızlı yükseliş, yavaş düşüş — "tık" karakteri
  kazanc.gain.setValueAtTime(0.0001, t0)
  kazanc.gain.exponentialRampToValueAtTime(hacim, t0 + 0.012)
  kazanc.gain.exponentialRampToValueAtTime(0.0001, t0 + sure)

  osc.connect(kazanc).connect(ctx.destination)
  osc.start(t0)
  osc.stop(t0 + sure + 0.02)
}

export const ses = {
  /** Haritaya tıklandı — kısa, nötr */
  tikla: () => ton(420, 0.06, 'sine', 0.05),
  /** Seçenek / düğme tıklaması */
  sec: () => ton(620, 0.05, 'triangle', 0.04),
  /** Doğru cevap — yükselen iki ton (D5 → A5) */
  dogru: () => {
    ton(587.33, 0.13, 'sine', 0.06)
    ton(880, 0.18, 'sine', 0.05, 0.09)
  },
  /** Yanlış cevap — alçalan tek ton */
  yanlis: () => ton(233.08, 0.22, 'sine', 0.055, 0, -60),
  /** Sınırda kabul — ne tam doğru ne yanlış: kararsız iki ton */
  tolerans: () => {
    ton(440, 0.1, 'triangle', 0.05)
    ton(415.3, 0.1, 'triangle', 0.05, 0.12) // yarım ton aşağı
  },
  /** Tur tamamlandı — üçlü yükseliş (C5 → E5 → G5) */
  turBitti: () => {
    ton(523.25, 0.11, 'sine', 0.05)
    ton(659.25, 0.11, 'sine', 0.05, 0.08)
    ton(783.99, 0.2, 'sine', 0.05, 0.16)
  },
  /** Oyun bitti — C5'ten düşüş */
  oyunBitti: () => {
    ton(523.25, 0.18, 'sine', 0.055)
    ton(392, 0.3, 'sine', 0.05, 0.14)
  },
  /** Küre kenarına tıklandı — kısa "çarpma" */
  kenar: () => ton(160, 0.1, 'square', 0.03),
}
