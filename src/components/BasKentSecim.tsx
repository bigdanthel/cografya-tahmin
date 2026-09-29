import { useState } from 'react'
import type { Secenek } from '../game/basKentSecenekleri'

export interface BasKentSecimProps {
  secenekler: Secenek[]
  /** Kullanıcı seçim yaptığında */
  onSecim: (secenek: Secenek) => void
  /** Cevap açıklandıktan sonra seçilen şıkkı sabitle */
  secilen: Secenek | null
  /** Doğru/yanlış sonucu belli mi? */
  aciklandi: boolean
}

/**
 * Başkent sorusu — 5 seçenekli çoktan seçmeli.
 *
 * Seçenekler soru üretilirken hazırlanır; 3'ü kasıtlı olarak zordur:
 * komşu ülkenin başkenti, yazım olarak benzeyen başkent ya da coğrafi
 * yakınlık. Yanıt öğrenilene kadar geri alınamaz (cevap turda sabitlenir).
 */
export function BasKentSecim({ secenekler, onSecim, secilen, aciklandi }: BasKentSecimProps) {
  /* Seçilen şık, metin değil Secenek NESNESİ olarak tutulur. Metin tutsak
     `secim === s` her zaman false olur ve seçili şık hiç vurgulanmaz. */
  const [gecici, setGecici] = useState<Secenek | null>(null)
  const secim = aciklandi ? secilen : gecici

  if (secenekler.length === 0) return null

  return (
    <div className="bks" role="radiogroup" aria-label="Başkent seçenekleri">
      {secenekler.map((s, i) => {
        const secili = secim === s
        const dogruCevap = aciklandi && s.dogru
        const yanlisSecim = aciklandi && secili && !s.dogru
        const sinif = [
          'bks-secenek',
          secili ? 'bks-secili' : '',
          dogruCevap ? 'bks-dogru' : '',
          yanlisSecim ? 'bks-yanlis' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <button
            key={`${s.metin}-${s.ulke}-${i}`}
            className={sinif}
            role="radio"
            aria-checked={secili}
            disabled={aciklandi}
            onClick={() => {
              setGecici(s)
              onSecim(s)
            }}
          >
            <span className="bks-harf" aria-hidden>
              {String.fromCharCode(65 + i)}
            </span>
            <span className="bks-metin">{s.metin}</span>
            {aciklandi && dogruCevap && <span className="bks-isaret">✓</span>}
            {aciklandi && yanlisSecim && <span className="bks-isaret">✕</span>}
          </button>
        )
      })}
    </div>
  )
}
