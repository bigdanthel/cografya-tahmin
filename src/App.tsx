import { useEffect, useState } from 'react'
import { Globe } from './components/Globe'
import { BasKentSecim } from './components/BasKentSecim'
import { BayrakSecim } from './components/BayrakSecim'
import { useQuiz } from './game/useQuiz'
import { MODLAR, adBulAyarla, bugun, type ModTanimi } from './game/types'
import { sonucMetni, BASLIK_PUAN, YON_IPUCU_CEZASI } from './game/score'
import { sesAcikMi, sesiDegistir } from './game/ses'
import { gununSerisi, dailyPaylasMetni, panoyaKopyala } from './game/storage'
import { ulkeBul, type Country } from './lib/world'

/* Bayrak modu — gerçek SVG bayraklar.
   Build sırasında flag-icons paketinden havuzdaki 194 ülkenin 4x3 SVG'si
   `public/flags/` altına kopyalanır, yol meta veriye yazılır. Bundle'a girmez:
   tarayıcı soru başına tek bayrak indirir ve önbelleğe alır.
   (Emoji tablosu daha önce yalnızca 60 ülkeyi kapsıyordu, gerisi boştu.)
   Bayrağı olmayan ülke için aşağıdaki emoji haritasına düşülür. */
const BAYRAK_EMOJI: Record<string, string> = {
  TUR: '🇹🇷', DEU: '🇩🇪', FRA: '🇫🇷', GBR: '🇬🇧', ITA: '🇮🇹', ESP: '🇪🇸', RUS: '🇷🇺',
  USA: '🇺🇸', CAN: '🇨🇦', MEX: '🇲🇽', BRA: '🇧🇷', ARG: '🇦🇷', CHN: '🇨🇳', JPN: '🇯🇵',
}

/* alt/aria-label ülke adını İÇERMEZ — bu, soru aşamasında gösterilen
   bayrağın cevabı sızdırmasını engeller (görsel yüklenemezse tarayıcı
   alt metnini gösterir, ekran okuyucu ise onu doğrudan okur). */
function Bayrak({ ulke }: { ulke: Country }) {
  if (ulke.bayrak) {
    return (
      <img
        className="bayrak-gorsel"
        src={ulke.bayrak}
        alt="Bayrak"
        width={132}
        height={99}
        draggable={false}
      />
    )
  }
  return (
    <div className="bayrak-gorsel bayrak-emoji" role="img" aria-label="Bayrak">
      {BAYRAK_EMOJI[ulke.iso3] ?? '🏳'}
    </div>
  )
}

export default function App() {
  const q = useQuiz()
  const [hedefGoster, setHedefGoster] = useState<Country | null>(null)
  const [yariKure, setYariKure] = useState(false)

  // korlukIpuclari ülke adına ihtiyaç duyuyor
  useEffect(() => {
    adBulAyarla((a) => ulkeBul(a)?.tr)
  }, [])

  /* Cevap sonrası kamera HAREKET EDİLMEZ.
     Kullanıcı doğru ülkeyi az önce tıkladı — zaten ekranda. Otomatik döndürme
     hem yön duygusunu bozuyor hem de küreyi "saçma sapan" bir yere götürüyordu.
     Doğru cevap, haritada yerinde yeşil vurgu olarak gösterilir; görmek isteyen
     "Yön İpucu" butonuna basar (o kullanıcı isteğidir).

     NOT: sadece asama'ya bağlıydı. Çıkış'a basıp yeni oyuna başlayınca asama
     zaten 'oyun' olduğu için efekt tetiklenmiyor ve önceki turun ülkesine
     uçuyordu. Artık tüm oyun durumu değiştiğinde temizleniyor. */
  const oyunKimligi = q.mod?.id ?? 'yok'
  useEffect(() => {
    setHedefGoster(null)
  }, [oyunKimligi, q.sira, q.oyunNo])

  /* yariKure ("Karşı Yarıküre") ayrı bir efektte: yalnızca YENİ OYUN
     başladığında sıfırlanır (mod değişince ya da q.oyunNo artınca — bkz.
     yukarıdaki yoruma benzer, Günün Ülkesi "Tekrar oyna"da mod.id/sira hiç
     değişmiyor). `q.sira`'yı bağımlılığa katmak turdan tura da tetikleyip
     kullanıcı hiç dokunmamışken düğmeyi her turda kapatıyordu (küre de
     buna bağlı olarak her turda gereksiz 180° geri dönüyordu). */
  useEffect(() => {
    setYariKure(false)
  }, [oyunKimligi, q.oyunNo])

  /* Klavye: Enter = onayla, Escape = iptal.
     Hook'lar koşulsuz çağrılmalı — bu effect erken return'lardan ÖNCE durmalı.
     useQuiz.tiklamayiIptalEt() temizleme + aşamaya dönüşü tek seferde yapar,
     böylece küre kilitli kalmaz. */
  useEffect(() => {
    const tus = (e: KeyboardEvent) => {
      const hedefEl = e.target as HTMLElement
      if (hedefEl?.tagName === 'INPUT' || hedefEl?.tagName === 'TEXTAREA') return
      if (e.key === 'Enter' && q.tiklama && q.asama === 'oyun') {
        e.preventDefault()
        q.tiklamayiOnayla()
      }
      if (e.key === 'Escape' && q.tiklama && !q.sonTuru && q.asama === 'oyun') {
        e.preventDefault()
        q.tiklamayiIptalEt()
      }
    }
    window.addEventListener('keydown', tus)
    return () => window.removeEventListener('keydown', tus)
  }, [q])

  // ── Mod seçimi ekranı ───────────────────────────────────────────────────
  if (!q.mod) {
    return (
      <div className="uyg">
        <UstBar q={q} />
        <div className="ana">
          <div className="acilis">
            <h1>Coğrafya Tahmin</h1>
            <p>
              Ülkeyi dünya küresinde bul, başkentini yaz.
              <br />
              Dünyada tek doğru yer var.
            </p>
            <div className="mod-liste">
              {MODLAR.map((m) => (
                <ModSatiri key={m.id} m={m} q={q} />
              ))}
            </div>
            {q.istatistik.tur > 0 && (
              <div className="acilis-alt">
                {q.istatistik.tur} tur oynandı · ortalama{' '}
                {Math.round(q.istatistik.puan / q.istatistik.tur)} puan
                {q.istatistik.enUzunSeri > 1 && ` · en uzun seri ${q.istatistik.enUzunSeri}`}
              </div>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── Oyun ekranı ────────────────────────────────────────────────────────
  if (q.bitis) return <SonucEkrani q={q} />

  const s = q.soru
  if (!s) return null

  const cevapAsama = q.asama === 'cevap'

  /* Başkent/bayrak şıkları, konum onaylandıktan sonra cevap açıklanana
     kadar durur. Cevap açıklandıktan sonra da görünür kalır (doğru/yanlış
     işareti için). */
  const ikinciSoru = s.basKentSorusu || s.bayrakSorusu
  const ikinciSecenekSayisi = s.basKentSorusu ? s.secenekler.length : s.bayrakSecenekleri.length
  const cevapAsamasiGorunur =
    cevapAsama && (!ikinciSoru || !q.sonTuru || ikinciSecenekSayisi > 0)

  /* Kullanıcının seçtiği şık — sonuç metninden geri çözüyoruz ki
     state'e fazladan alan eklemeyelim. Başkentte metin, bayrakta ülke adı
     araması yapılır (bkz. useQuiz.bayrakSec). */
  const secilenSecenek = q.sonTuru?.basKentGirdi
    ? (s.secenekler.find((x) => x.metin === q.sonTuru?.basKentGirdi) ?? null)
    : null
  const secilenBayrak = q.sonTuru?.basKentGirdi
    ? (s.bayrakSecenekleri.find((x) => x.ulke === q.sonTuru?.basKentGirdi) ?? null)
    : null

  return (
    <div className="uyg">
      <UstBar q={q} />
      <div className="ana">
        <div className="kure-sarici">
          <Globe
            vurgula={cevapAsama ? s.hedef : null}
            pin={q.tiklama}
            onTikla={q.tikla}
            hedefiGoster={hedefGoster}
            kilitli={cevapAsama}
            digerYariKure={yariKure}
            className="globe"
          />

          {cevapAsama ? <CevapAsamasi q={q} /> : <SoruKarti q={q} />}

          {/* Başkent sorusu — 5 seçenek, 3'ü kasıtlı olarak zor.
              Seçim yapıldıktan sonra şıklar KALIR: doğru cevap yeşil,
              yanlış seçim kırmızı işaretlenir. Kullanıcı hangi şıkkı
              kaçırdığını görerek öğrenir. */}
          {cevapAsamasiGorunur && s.basKentSorusu && (
            <div className="bas-kent-serit">
              <div className="bas-kent-etiket">{s.hedef.tr} başkenti</div>
              <BasKentSecim
                secenekler={s.secenekler}
                onSecim={q.basKentSec}
                secilen={secilenSecenek}
                aciklandi={Boolean(q.sonTuru)}
              />
            </div>
          )}

          {/* Bayrağı Tanı — konum onaylandıktan sonra 5 bayraktan doğru
              olanı seç. Şıklar kalkmaz: doğru yeşil ✓, yanlış kırmızı ✕. */}
          {cevapAsamasiGorunur && s.bayrakSorusu && (
            <div className="bas-kent-serit">
              <div className="bas-kent-etiket">{s.hedef.tr} bayrağı</div>
              <BayrakSecim
                secenekler={s.bayrakSecenekleri}
                onSecim={q.bayrakSec}
                secilen={secilenBayrak}
                aciklandi={Boolean(q.sonTuru)}
              />
            </div>
          )}

          {!cevapAsama && q.limbdeUyarisi && (
            <div className="limb-uyari" role="alert">
              Kürenin kenarına tıkladın — orada ülkeler çok eziliyor, tıklama
              yanlış yere düşer. Küreyi biraz döndür.
            </div>
          )}

          <div className="kure-arac">
            <button
              className="arac-btn"
              onClick={q.tiklamayiOnayla}
              disabled={!q.tiklama || cevapAsama}
              title="Tıklamayı onayla (Enter)"
            >
              ✓ Onayla
            </button>
            {/* Vazgeç YALNIZCA onay öncesi. Konum onaylandıktan sonra geri
                dönmek, cevabı gördükten sonra yeniden denemeye çevirirdi. */}
            {q.tiklama && !cevapAsama && (
              <button
                className="arac-btn"
                onClick={q.tiklamayiIptalEt}
                title="Tıklamayı iptal et, yeniden seç (Esc)"
              >
                ✕ Vazgeç
              </button>
            )}
            <span className="arac-btn-ayirac" />
            <button
              className={`arac-btn${yariKure ? ' arac-btn-acik' : ''}`}
              onClick={() => setYariKure((v) => !v)}
              title="Küreyi 180° çevir — diğer yarımküreyi de gör"
            >
              ◑ Karşı Yarıküre
            </button>
            {q.mod?.id !== 'korluk' && (
              <button
                className="arac-btn"
                onClick={() => {
                  q.yonIpucuBildir()
                  setHedefGoster((h) => (h ? null : s.hedef))
                }}
                disabled={!s || cevapAsama}
                title={
                  q.yonIpucuKullanildi
                    ? `Bu tur için −${YON_IPUCU_CEZASI} puan zaten uygulandı`
                    : `Hedef ülkeyi göster (−${YON_IPUCU_CEZASI} puan)`
                }
              >
                ◎ Yön İpucu{q.yonIpucuKullanildi ? ` (−${YON_IPUCU_CEZASI})` : ''}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Üst bar ──────────────────────────────────────────────────────────── */

function UstBar({ q }: { q: ReturnType<typeof useQuiz> }) {
  const [sesAcikDurum, setSesAcikDurum] = useState(sesAcikMi)
  return (
    <div className="ust-bar">
      <div className="logo">
        <span className="logo-gok" />
        Coğrafya Tahmin
      </div>
      <div className="ust-alan">
        {q.mod && <span className="puan">{`${q.sira + 1}/${q.turSayisi}`}</span>}
        {q.kalanSure !== null && q.kalanSure > 0 && (
          <span className={`puan${q.kalanSure <= 10 ? ' puan-seri' : ''}`} style={q.kalanSure <= 10 ? { borderColor: 'var(--vurgu)', color: 'var(--vurgu)', background: '#fbeeec' } : undefined}>
            {`⏱ ${q.kalanSure}`}
          </span>
        )}
        {q.turSonuclari.length > 0 && (
          <span className="puan">
            toplam <strong>{q.toplamPuan}</strong>
          </span>
        )}
        <button
          className="arac-btn ses-btn"
          onClick={() => setSesAcikDurum(sesiDegistir())}
          title={sesAcikDurum ? 'Ses efektlerini kapat' : 'Ses efektlerini aç'}
          aria-label={sesAcikDurum ? 'Ses efektlerini kapat' : 'Ses efektlerini aç'}
        >
          {sesAcikDurum ? '🔊' : '🔇'}
        </button>
        {q.mod && (
          <button className="arac-btn" onClick={q.cikis}>
            Çıkış
          </button>
        )}
      </div>
    </div>
  )
}

/* ── Mod satırı ───────────────────────────────────────────────────────── */

function ModSatiri({ m, q }: { m: ModTanimi; q: ReturnType<typeof useQuiz> }) {
  const istatistik = q.istatistik
  const seri = m.id === 'daily' ? gununSerisi(istatistik) : 0
  const bugunOynandi = m.id === 'daily' && istatistik.daily?.tarih === bugun()
  return (
    <button className="mod-btn" onClick={() => q.baslat(m)}>
      <span className="mod-ikon">{m.ikon}</span>
      <span className="mod-metin">
        <span className="mod-ad">{m.ad}</span>
        <span className="mod-aciklama">{m.aciklama}</span>
      </span>
      {m.id === 'daily' && (
        <span className="mod-istatistik">
          {bugunOynandi ? `✓ ${istatistik.daily!.puan}` : seri > 0 ? `🔥 ${seri}` : ''}
        </span>
      )}
    </button>
  )
}

/* ── Soru kartı ───────────────────────────────────────────────────────── */

function SoruKarti({ q }: { q: ReturnType<typeof useQuiz> }) {
  const s = q.soru!
  return (
    <div className="soru-kart">
      {s.ipucu === 'ad' && (
        <>
          <div className="soru-etiket">Bu ülke nerede?</div>
          <h2 className="soru-adi">{s.hedef.tr}</h2>
        </>
      )}

      {/* Başkentten Bul: soru BAŞKENT adıdır, ülke gizli. Kıta/zorluk
          rozetleri normal akışta görünmeye devam eder. */}
      {s.ipucu === 'bas' && (
        <>
          <div className="soru-etiket">Bu başkent hangi ülkenin?</div>
          <h2 className="soru-adi">{s.hedef.bas}</h2>
        </>
      )}

      {s.ipucu === 'bayrak' && (
        <>
          <div className="soru-etiket">Bu bayrak hangi ülkenin?</div>
          <Bayrak ulke={s.hedef} />
        </>
      )}

      {s.ipucu === 'yok' && (
        <>
          <div className="soru-etiket">
            Sadece ipuçları
            {q.gorulenIpuclari.length > 1 && (
              <span className="soru-etiket-ceza">−{q.ipucuCezasi} puan</span>
            )}
          </div>
          <div className="soru-meta">
            {q.gorulenIpuclari.map((i) => (
              <span key={i.etiket} className="rozet rozet-ipucu">
                {i.etiket}: {i.deger}
              </span>
            ))}
          </div>
          {/* Kademeli ipuç: her basışta bir tane daha açılır, puan düşer.
              En ucuz ipuç (kıta) bedavadır; en pahalısı (ad maskesi)
              neredeyse cevabı verdiği için 30 puan. */}
          {q.siradakiIpucu && (
            <button
              className="ipucu-btn"
              onClick={q.ipucuAl}
              disabled={q.asama !== 'oyun'}
              title={`${q.siradakiIpucu.etiket} ipucunu aç`}
            >
              ✦ {q.siradakiIpucu.etiket} ipucunu aç (−{q.siradakiIpucu.maliyet})
            </button>
          )}
        </>
      )}

      <div className="soru-meta">
        <span className="rozet rozet-kita">{s.hedef.kita}</span>
        <span className="rozet rozet-zorluk" title="Zorluk">
          {[1, 2, 3, 4, 5].map((i) => (
            <i key={i} className={i <= s.hedef.zorluk ? 'dolu' : ''} />
          ))}
        </span>
      </div>

      {q.tiklama && (
        <>
          <div className="soru-eylem">
            <button className="ana-btn" onClick={q.tiklamayiOnayla}>
              ✓ Tıklamayı onayla
            </button>
            <button className="ana-btn ana-btn-ikincil" onClick={q.tiklamayiIptalEt}>
              ✕ Vazgeç
            </button>
          </div>
          {/* Konum bilgisi GİZLENİR. Tıklanan ülkenin adı ya da merkeze
              uzaklığı burada gösterilirse kullanıcı harita bilgisi olmadan
              deneme-yanılma ile isabet eder (uzaklık = ikili arama). */}
          <div className="soru-not">Enter onaylar · Esc iptal eder</div>
        </>
      )}
    </div>
  )
}

/* ── Geri bildirim kartı ──────────────────────────────────────────────── */

/* ── Cevap aşaması ───────────────────────────────────────────────────────
   Konum onaylandı. Artık geri dönüş YOK: tıklamayı değiştirmek, cevabı
   gördükten sonra deneme-yanılmaya çevirirdi. Onay öncesinde (oyun aşamasında)
   "Vazgeç" hâlâ var, yani henüz bağlanmadan fikir değiştirilebilir.

   Burada konumun doğru/yanlış olduğu ve kaç puan alındığı AÇIKÇA söylenir,
   ardından başkent sorusu (veya atla) gelir. */
function CevapAsamasi({ q }: { q: ReturnType<typeof useQuiz> }) {
  if (q.sonTuru) return <GeriKarti q={q} />
  const s = q.soru!
  const k = q.konumKutusu
  if (!k) return null

  const sonuc = sonucMetni(k, s.hedef)
  const puan = k.konum + k.kita
  // Tavan her modda 175'tir — toplamPuan() bu kırpmayı koşulsuz uygular.
  const tavan = 175

  return (
    <div className="geri">
      <div className={`geri-bas geri-bas-${sonuc.renk}`} aria-live="polite">
        <div className="geri-baslik">{sonuc.baslik}</div>
        <div className="geri-alt">
          {k.tam
            ? `Doğru yerdesin — ${k.mesafeKm} km uzakta.`
            : k.toleransli
              ? 'Sınırda sayıldı, komşu ülkeye tıklamışsın.'
              : `Doğru yer burası değil. Merkeze ${k.mesafeKm} km.`}
        </div>
      </div>

      <div className="puan-satir">
        <span className={`puan-toplam puan-toplam-${sonuc.renk}`}>{puan}</span>
        <span style={{ fontSize: 12, color: 'var(--soluk)' }}>/ {tavan} puan</span>
        <span className="puan-dagilim">
          {k.konum} konum
          {k.kita > 0 && ` + ${k.kita} kıta`}
          {(s.basKentSorusu || s.bayrakSorusu) &&
            ` + ${s.bayrakSorusu ? 'bayrak' : 'başkent'}`}
        </span>
      </div>

      {(s.basKentSorusu || s.bayrakSorusu) && (
        <div className="geri-eylem">
          <button className="ana-btn ana-btn-ikincil geri-geri-btn" onClick={q.basKentiAtla}>
            {s.bayrakSorusu ? 'Bayrağı atla' : 'Başkenti atla'}
          </button>
        </div>
      )}
    </div>
  )
}

function GeriKarti({ q }: { q: ReturnType<typeof useQuiz> }) {
  const s = q.soru!
  const k = q.konumKutusu
  const t = q.sonTuru
  if (!k || !t) return null

  const sonuc = sonucMetni(k, s.hedef)

  const sonTurMu = q.sira + 1 >= q.turSayisi || q.kalanSure === 0

  return (
    <div className="geri">
      <div className={`geri-bas geri-bas-${sonuc.renk}`} aria-live="polite">
        <div className="geri-baslik">{sonuc.baslik}</div>
        <div className="geri-alt">
          {k.tam
            ? `${k.mesafeKm} km uzakta — neredeyse tam merkez.`
            : `Merkeze ${k.mesafeKm} km.`}
        </div>
      </div>

      <div className="geri-detal">
        <div className="detay-satir">
          <span className="detay-etiket">Konum</span>
          <span className="detay-deger">{k.konum} / 100</span>
        </div>

        {k.tiklanan && (
          <div className="detay-satir">
            <span className="detay-etiket">Tıkladığın</span>
            <span className="detay-deger">{k.tiklanan}</span>
          </div>
        )}

        {s.basKentSorusu && (
          <div className="detay-satir">
            <span className="detay-etiket">Başkent</span>
            {t.basKentTur === 'bos' ? (
              <span className="detay-ipucu">yazılmadı</span>
            ) : (
              <>
                <span className="detay-deger">{s.hedef.bas}</span>
                {t.basKentGirdi && t.basKentGirdi !== s.hedef.bas && (
                  <span className="detay-ipucu">sen: {t.basKentGirdi}</span>
                )}
                <span className="detay-ipucu" style={{ marginLeft: 'auto' }}>
                  +{t.basKentPuan} / {BASLIK_PUAN}
                </span>
              </>
            )}
          </div>
        )}

        {/* Bayrağı Tanı: ikinci sorunun sonucu. Doğru = hedefin bayrağı
            (ülke adı zaten soruda verildi); "sen: X" karıştırılan bayrağın
            ülkesini gösterir. */}
        {s.bayrakSorusu && (
          <div className="detay-satir">
            <span className="detay-etiket">Bayrak</span>
            {t.basKentTur === 'bos' ? (
              <span className="detay-ipucu">seçilmedi</span>
            ) : (
              <>
                <span className="detay-deger">{s.hedef.tr}</span>
                {t.basKentGirdi && t.basKentGirdi !== s.hedef.tr && (
                  <span className="detay-ipucu">sen: {t.basKentGirdi}</span>
                )}
                <span className="detay-ipucu" style={{ marginLeft: 'auto' }}>
                  +{t.basKentPuan} / {BASLIK_PUAN}
                </span>
              </>
            )}
          </div>
        )}

        {s.ipucu === 'yok' && (
          <div className="detay-satir">
            <span className="detay-etiket">İpuçları</span>
            <span className="detay-ipucu">
              {q.gorulenIpuclari.map((i) => `${i.etiket}: ${i.deger}`).join(' · ')}
            </span>
          </div>
        )}

        {t.ipucuCezasi > 0 && (
          <div className="detay-satir">
            <span className="detay-etiket">İpucu cezası</span>
            <span className="detay-ipucu" style={{ color: 'var(--kotu)' }}>
              {t.ipucuSayisi} ipucu
              {t.ipucuCezasi < t.ipucuMaliyet
                ? ` · istenen −${t.ipucuMaliyet}, puan sıfırına düştüğü için −${t.ipucuCezasi}`
                : ` · −${t.ipucuCezasi}`}
            </span>
          </div>
        )}
      </div>

      <div className="puan-satir">
        <span className={`puan-toplam puan-toplam-${sonuc.renk}`}>{t.toplam}</span>
        <span style={{ fontSize: 12, color: 'var(--soluk)' }}>/ 175</span>
        <span className="puan-dagilim">
          {k.konum} konum
          {k.kita > 0 && ` + ${k.kita} kıta`}
          {t.basKentPuan > 0 &&
            ` + ${t.basKentPuan} ${s.bayrakSorusu ? 'bayrak' : 'başkent'}`}
          {t.sureBonusu > 0 && ` + ${t.sureBonusu} süre`}
          {t.ipucuCezasi > 0 && ` − ${t.ipucuCezasi} ipucu`}
        </span>
      </div>

      <div className="geri-eylem">
        <button className="ana-btn" onClick={q.devamEt} autoFocus>
          {sonTurMu ? 'Sonuçları gör →' : 'Sıradaki →'}
        </button>
      </div>
    </div>
  )
}

/* ── Sonuç ekranı ─────────────────────────────────────────────────────── */

function SonucEkrani({ q }: { q: ReturnType<typeof useQuiz> }) {
  const mod = q.mod!
  const [paylasildi, setPaylasildi] = useState(false)
  const basariOrani = q.turSonuclari.length
    ? Math.round((q.dogruSayisi / q.turSonuclari.length) * 100)
    : 0
  const baslik =
    mod.id === 'hiz'
      ? q.kalanSure === 0
        ? 'Süre doldu!'
        : 'Süreli tur bitti'
      : basariOrani >= 80
        ? 'Harika!'
        : basariOrani >= 50
          ? 'İyi gidiyor'
          : 'Tekrar dene'

  const tur = q.turSonuclari[0]
  const seri = mod.id === 'daily' ? gununSerisi(q.istatistik) : 0

  const paylas = async () => {
    if (!tur) return
    const metin = dailyPaylasMetni(q.istatistik, tur.ulke.tr, tur.basarili)
    const ok = await panoyaKopyala(metin)
    setPaylasildi(ok)
    if (ok) window.setTimeout(() => setPaylasildi(false), 2400)
  }

  return (
    <div className="uyg">
      <UstBar q={q} />
      <div className="ana">
        <div className="sonuc">
          <h1 className="sonuc-baslik">{baslik}</h1>
          <p className="sonuc-ozet">
            {q.dogruSayisi} tam isabet · {q.toleransliSayisi} sınırda kabul
          </p>

          {mod.id === 'daily' && (
            <div className="gunun-rozet">
              <div className="gunun-rozet-ikon">{seri >= 30 ? '🏆' : seri >= 7 ? '⭐️' : '📍'}</div>
              <div className="gunun-rozet-metin">
                <strong>
                  {seri} günlük seri
                  {seri === 0 && ' — bugün ilk gün'}
                </strong>
                <span>
                  {tur?.ulke.tr} · {tur?.toplam} puan
                </span>
              </div>
              <button className="ana-btn ana-btn-ikincil gunun-paylas" onClick={paylas}>
                {paylasildi ? '✓ Kopyalandı' : 'Paylaş'}
              </button>
            </div>
          )}

          <div className="sonuc-istatistik">
            <div className="istatistik-kutu">
              <div className="istatistik-deger">{q.toplamPuan}</div>
              <div className="istatistik-etiket">toplam puan</div>
            </div>
            <div className="istatistik-kutu">
              <div className="istatistik-deger">{basariOrani}%</div>
              <div className="istatistik-etiket">isabet</div>
            </div>
            <div className="istatistik-kutu">
              <div className="istatistik-deger">
                {q.turSonuclari.length
                  ? Math.round(q.toplamPuan / q.turSonuclari.length)
                  : 0}
              </div>
              <div className="istatistik-etiket">ortalama</div>
            </div>
          </div>

          <div className="sezim-liste">
            {q.turSonuclari.map((t, i) => (
              <div key={i} className="sezim-satir">
                <span className={t.kutu.tam ? 'sezim-ok' : t.kutu.toleransli ? '' : 'sezim-yok'}>
                  {t.kutu.tam ? '●' : t.kutu.toleransli ? '◐' : '○'}
                </span>
                <span className="sezim-ad">{t.ulke.tr}</span>
                <span className="sezim-skor">{t.toplam}</span>
              </div>
            ))}
          </div>

          <div className="sonuc-eylem">
            <button className="ana-btn ana-btn-ikincil" onClick={q.cikis}>
              Mod seç
            </button>
            <button className="ana-btn" onClick={() => q.baslat(mod)}>
              Tekrar oyna
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
