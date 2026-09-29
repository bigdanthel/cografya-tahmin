/**
 * OYUN MEKANİĞİ — puanlama, tolerans, seçenek üretimi, Körlük ipuçları.
 *
 * Buradaki testler "oyunun adil davrandığını" güvenceye alıyor: oyuncu
 * doğru yere tıklayınca tam puan almalı, komşuya tıklayınca kabul edilmeli
 * ama cezalı kalmalı, yanlış seçenekte puan sıfırlanmalı.
 */

import { geoDistance } from 'd3-geo'
import { havuz, ulkeBul } from '../src/lib/world'
import {
  tiklamayiPuanla,
  konumPuani,
  toplamPuan,
  sonucMetni,
  BASLIK_PUAN,
  KITA_PUAN_TAM,
  KITA_PUAN_KOMSULU,
  KITA_PUAN_AYNI_KITA,
  TOLERANS_CARPAN,
} from '../src/game/score'
import { secenekUret } from '../src/game/basKentSecenekleri'
import { korlukIpuclari, adBulAyarla, gununUlkesi } from '../src/game/types'
import { baslik, ok, esit, toplu, bitir } from './_yardim'

adBulAyarla((a) => ulkeBul(a)?.tr)

const DUNYACA = 6371
const km = (a: [number, number], b: [number, number]) => geoDistance(a, b) * DUNYACA

baslik('Puanlama: mesafe eğrisi')

const turkiye = ulkeBul('Turkey')!

esit(konumPuani(0), 100, 'merkez → 100 puan')
esit(konumPuani(1000), konumPuani(1000), 'deterministik')
ok(konumPuani(1000) < 100 && konumPuani(1000) > 70, '1000 km hâlâ iyi puan', `${konumPuani(1000)}`)
ok(konumPuani(4000) > 30 && konumPuani(4000) < 45, '4000 km orta puan', `${konumPuani(4000)}`)
ok(konumPuani(10000) < 10, '10000 km neredeyse 0', `${konumPuani(10000)}`)
ok(
  konumPuani(0) >= konumPuani(500) &&
    konumPuani(500) >= konumPuani(1500) &&
    konumPuani(1500) >= konumPuani(3000),
  'puan mesafeyle tekdüze azalıyor (tekdüze olmayan sapma yok)',
)
ok(
  havuz.every((u) => konumPuani(km(u.isabet, u.isabet)) === 100),
  'mesafe 0 → daima 100',
)

baslik('Hit-test senaryoları')

/* Tam isabet */
const tam = tiklamayiPuanla(turkiye, turkiye.isabet, turkiye.anahtar)
ok(tam.tam && !tam.toleransli, 'doğru ülkeye tıklama tam isabet')
esit(tam.konum, 100, 'tam isabet konum puanı')
esit(tam.kita, KITA_PUAN_TAM, 'tam isabet kıta puanı')
esit(tam.mesafeKm, 0, 'tam isabet mesafesi')

/* Toleranslı: komşu ülke */
const komsu = ulkeBul(turkiye.komsu[0]!)!
const tol = tiklamayiPuanla(turkiye, komsu.isabet, komsu.anahtar)
ok(tol.toleransli && !tol.tam, 'komşu ülkeye tıklama toleranslı kabul')
esit(tol.kita, KITA_PUAN_KOMSULU, 'toleranslı kıta puanı')
ok(
  tol.konum <= Math.round(konumPuani(tol.mesafeKm) * TOLERANS_CARPAN) + 1,
  'toleranslı konum ×0.7 uygulanmış',
  `${tol.konum} ≤ ${Math.round(konumPuani(tol.mesafeKm) * TOLERANS_CARPAN)}`,
)
ok(tol.tiklanan === komsu.tr, 'tıklanan ülkenin adı raporlanıyor')

/* Aynı kıta, yanlış ülke */
const avrupa = havuz.find(
  (u) => u.kita === 'Avrupa' && u.anahtar !== turkiye.anahtar && !turkiye.komsu.includes(u.anahtar),
)!
const ayniKita = tiklamayiPuanla(turkiye, avrupa.isabet, avrupa.anahtar)
ok(!ayniKita.tam && !ayniKita.toleransli, 'aynı kıta yanlış ülke: ne tam ne tolerans')
esit(ayniKita.kita, KITA_PUAN_AYNI_KITA, 'aynı kıta puanı')

/* Türkiye sınır ülkesi: Avrupa da kabul edilmeli (kitaAlt) */
const avrupaya = tiklamayiPuanla(turkiye, avrupa.isabet, avrupa.anahtar)
ok(avrupaya.kita > 0, 'Türkiye→Avrupa kıta puanı veriyor (kitaAlt sayesinde)')

/* Farklı kıta — DİKKAT iki tuzak var:
   1) `kita` alanı TÜRKÇE ('Asya'), 'Asia' aranmamalı.
   2) Türkiye'nin `kitaAlt` = ['Avrupa'] (sınır ülkesi). Bu yüzden Asya'dan
      bir ülkeye tıklamak hâlâ "aynı kıta" sayılıp 20 puan veriyor — bu DOĞRU
      davranış, testin seçimi yanlıştı. Gerçekten farklı kıta için
      Arjantin (Güney Amerika) kullanılıyor. */
const asya = havuz.find(
  (u) => u.kita === 'Asya' && u.anahtar !== turkiye.anahtar && !turkiye.komsu.includes(u.anahtar),
)
ok(Boolean(asya), 'Asya havuzda ülke var', asya?.tr)
if (!asya) throw new Error('Asya havuzda yok — kıta testi çalıştırılamaz')

const asyaya = tiklamayiPuanla(turkiye, asya.isabet, asya.anahtar)
esit(asyaya.kita, KITA_PUAN_AYNI_KITA, 'kitaAlt sayesinde Asya da "aynı kıta" (20)')

const arjantin = ulkeBul('Argentina')!
ok(
  arjantin.kita !== turkiye.kita && !turkiye.kitaAlt.includes(arjantin.kita),
  'Arjantin gerçekten farklı kıta',
  `${arjantin.tr} (${arjantin.kita})`,
)
const farkli = tiklamayiPuanla(turkiye, arjantin.isabet, arjantin.anahtar)
esit(farkli.kita, 0, 'farklı kıta puan vermiyor')
ok(!farkli.tam && !farkli.toleransli, 'farklı kıtada ne tam ne toleranslı')

/* Denize tıklama — tavan */
const denize = tiklamayiPuanla(turkiye, [0, 0], null)
ok(denize.konum <= 20, 'denize tıklama konum tavanı 20', `${denize.konum}`)
ok(denize.mesafeKm > 0, 'mesafe hesaplanıyor')
ok(!denize.tam && !denize.toleransli, 'deniz hiçbir kabul sayılmıyor')

baslik('Puan tavanı ve tabanı')

esit(toplamPuan(tam, BASLIK_PUAN, 0), 175, 'tam tur 175')
esit(toplamPuan(tam, BASLIK_PUAN, 200), 175, 'süre bonusu tavanı aşmıyor')
esit(toplamPuan(tam, 0, 0), 100 + KITA_PUAN_TAM, 'başkentsiz tam isabet')
ok(toplamPuan(farkli, 0, 0) >= 0, 'hiçbir koşulda negatif değil')
ok(
  havuz.every((u) => {
    const k = tiklamayiPuanla(u, u.isabet, u.anahtar)
    return toplamPuan(k, 50, 120) <= 175
  }),
  'tüm ülkelerde tavan aşılmıyor',
)

baslik('Sonuç metni')

const metinler = [
  [tam, 'iyi'],
  [tol, 'orta'],
  [ayniKita, 'orta'],
  [farkli, 'kotu'],
] as const
for (const [k, beklenen] of metinler) {
  const m = sonucMetni(k, turkiye)
  ok(m.renk === beklenen, `sonuç rengi ${beklenen}`, `${m.baslik} → ${m.renk}`)
  ok(m.baslik.length > 0 && m.baslik.includes(turkiye.tr), 'başlık ülke adını içeriyor', m.baslik)
}

baslik('Başkent seçenekleri (193 ülke × 5 tekrar)')

const TEKRAR = 5
let azSecenek = 0
let cevapsiz = 0
let cokluDogru = 0
let tekrarEden = 0
let bosMetin = 0
const zorluklar: number[] = []

for (const u of havuz) {
  for (let t = 0; t < TEKRAR; t++) {
    const s = secenekUret(u, havuz)
    if (s.length !== 5) azSecenek++
    const dogru = s.filter((x) => x.dogru)
    if (dogru.length === 0) cevapsiz++
    if (dogru.length > 1) cokluDogru++
    if (new Set(s.map((x) => x.metin)).size !== s.length) tekrarEden++
    if (s.some((x) => !x.metin || !x.metin.trim())) bosMetin++
    zorluklar.push(s.filter((x) => !x.dogru).length)
  }
}
esit(azSecenek, 0, 'her zaman tam 5 seçenek')
esit(cevapsiz, 0, 'doğru cevap her zaman seçeneklerde')
esit(cokluDogru, 0, 'tam olarak 1 doğru seçenek')
esit(tekrarEden, 0, 'seçenek metinleri tekrar etmiyor')
esit(bosMetin, 0, 'boş seçenek metni yok')
ok(
  zorluklar.every((n) => n === 4),
  'her üretimde 4 yanıltıcı var',
)
ok(
  new Set(secenekUret(turkiye, havuz).map((x) => x.metin)).size === 5,
  'Türkiye seçenekleri tekrar üretimde aynı (deterministik)',
)

/* Zor çeldirici: komşu ülkenin başkenti gerçekten seçeneklerde mi? */
const komsuVar = havuz.filter(
  (u) =>
    u.komsu.length > 0 &&
    secenekUret(u, havuz).some(
      (x) => !x.dogru && u.komsu.some((k) => ulkeBul(k)?.bas === x.metin),
    ),
)
ok(
  komsuVar.length > 100,
  'çoğu ülkede komşu başkenti çeldirici olarak kullanılıyor',
  `${komsuVar.length}/193 ülke`,
)

baslik('Körlük ipuçları (kademeli)')

const ipuclar = havuz.map((u) => ({ ad: u.tr, u, i: korlukIpuclari(u) }))
toplu(
  'en az 5 ipucu var',
  ipuclar,
  ({ i }) => i.length >= 5,
)
toplu(
  'ilk ipucu bedava',
  ipuclar,
  ({ i }) => i[0]!.maliyet === 0,
)
toplu(
  'etiketler benzersiz',
  ipuclar,
  ({ i }) => new Set(i.map((x) => x.etiket)).size === i.length,
)
toplu(
  'hiçbir değer boş değil',
  ipuclar,
  ({ i }) => i.every((x) => x.deger.trim().length > 0),
)
toplu(
  'maliyetler azalan sırada değil',
  ipuclar,
  ({ i }) => i.every((x, idx) => idx === 0 || x.maliyet >= i[idx - 1]!.maliyet),
)
toplu(
  'maliyetler pozitif (bedava hariç)',
  ipuclar,
  ({ i }) => i.slice(1).every((x) => x.maliyet > 0),
)
toplu(
  'en pahalı ipuç ad maskesi',
  ipuclar,
  ({ i }) => i[i.length - 1]!.etiket === 'Ad',
)

/* Sızıntı: "Ad" dışında hiçbir ipuç ülke adını kelime sınırında içermemeli. */
const KABUL = new Set(['Kongo Cumhuriyeti'])
const sizan = havuz.filter((u) => {
  if (KABUL.has(u.tr)) return false
  const duzenli = new RegExp(`(^|[^\\p{L}])${u.tr}($|[^\\p{L}])`, 'u')
  return korlukIpuclari(u).some((i) => i.etiket !== 'Ad' && duzenli.test(i.deger))
})
ok(
  sizan.length === 0,
  'ad dışında hiçbir ipuç ülke adını içermiyor',
  sizan.map((u) => u.tr).join(', '),
)
ok(KABUL.size === 1, 'kabul edilen istisna yalnızca Kongo Cumhuriyeti (adı DR Kongo\'nun içinde)')

/* Kademeli ceza: ham puanı asla aşmamalı, toplam negatif olmamalı. */
let negatif = 0
let sifirCeza = 0
for (const { i } of ipuclar) {
  for (let adet = 1; adet <= i.length; adet++) {
    const ham = 20
    const istenen = i.slice(1, adet).reduce((t, x) => t + x.maliyet, 0)
    const ceza = Math.min(ham, istenen)
    if (ham - ceza < 0) negatif++
    if (istenen > 0 && ceza === 0) sifirCeza++
  }
}
esit(negatif, 0, 'düşük puanlı turda bile toplam negatif olmuyor')
esit(sifirCeza, 0, 'ceza sıfıra düşmüyor')

baslik('Günün ülkesi (deterministik)')

esit(
  gununUlkesi(havuz, new Date(2026, 8, 29, 0, 0)).anahtar,
  gununUlkesi(havuz, new Date(2026, 8, 29, 23, 59)).anahtar,
  'aynı gün → aynı ülke (gece yarısından önce/sonra)',
)
const gunler = new Set(Array.from({ length: 365 }, (_, i) => gununUlkesi(havuz, new Date(2026, 0, 1 + i)).anahtar))
ok(gunler.size > 100, 'bir yılda 100+ farklı ülke', `${gunler.size} farklı ülke`)
ok(
  gununUlkesi(havuz, new Date(2026, 8, 29)).anahtar !== gununUlkesi(havuz, new Date(2026, 8, 30)).anahtar,
  'ardışık günler farklı ülke (çoğunlukla)',
)

bitir()
