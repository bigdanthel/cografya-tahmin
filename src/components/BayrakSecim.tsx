import { useState } from 'react'
import type { BayrakSecenek } from '../game/bayrakSecenekleri'

export interface BayrakSecimProps {
  secenekler: BayrakSecenek[]
  /** Kullanıcı seçim yaptığında */
  onSecim: (secenek: BayrakSecenek) => void
  /** Cevap açıklandıktan sonra seçilen şıkkı sabitle */
  secilen: BayrakSecenek | null
  /** Doğru/yanlış sonucu belli mi? */
  aciklandi: boolean
}

/**
 * Bayrağı Tanı sorusu — 5 seçenekli çoktan seçmeli, görsel bayraklarla.
 *
 * `BasKentSecim` ile aynı sözleşme: seçenekler soru üretilirken hazırlanır
 * (render'da değişmez), cevap turda sabitlenir, seçimden sonra şıklar
 * KALIR — doğru bayrak yeşil ✓, yanlış seçim kırmızı ✕ işaretlenir.
 * Kullanıcı hangi bayrağı karıştırdığını görerek öğrenir.
 *
 * alt metni ÜLKE ADINI İÇERMEZ — görüntü yüklenemezse tarayıcı alt metnini,
 * ekran okuyucu ise onu söyler; o metin cevabı sızdıramaz (Bayrağı Bul
 * modundaki sızıntı düzeltmesiyle aynı ilke — bkz. App.tsx `Bayrak`).
 */
export function BayrakSecim({ secenekler, onSecim, secilen, aciklandi }: BayrakSecimProps) {
  /* Seçilen şık, metin değil kimlik nesnesi olarak tutulur — `secim === s`
     böylece gerçekten eşleşir. */
  const [gecici, setGecici] = useState<BayrakSecenek | null>(null)
  const secim = aciklandi ? secilen : gecici

  if (secenekler.length === 0) return null

  return (
    <div className="bayrak-sec" role="radiogroup" aria-label="Bayrak seçenekleri">
      {secenekler.map((s, i) => {
        const secili = secim === s
        const dogruCevap = aciklandi && s.dogru
        const yanlisSecim = aciklandi && secili && !s.dogru
        const sinif = [
          'bayrak-secenek',
          secili ? 'bayrak-secili' : '',
          dogruCevap ? 'bayrak-dogru' : '',
          yanlisSecim ? 'bayrak-yanlis' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            key={s.ulke}
            className={sinif}
            role="radio"
            aria-checked={secili}
            aria-label={`Bayrak — seçenek ${String.fromCharCode(65 + i)}`}
            disabled={aciklandi}
            onClick={() => {
              setGecici(s)
              onSecim(s)
            }}
          >
            {s.bayrak ? (
              <img
                className="bayrak-secimg"
                src={s.bayrak}
                alt="Bayrak"
                draggable={false}
              />
            ) : (
              <span className="bayrak-secimg bayrak-secemoji" role="img" aria-label="Bayrak">
                🏳
              </span>
            )}
            {dogruCevap && <span className="bayrak-isaret">✓</span>}
            {yanlisSecim && <span className="bayrak-isaret">✕</span>}
          </button>
        )
      })}
    </div>
  )
}
