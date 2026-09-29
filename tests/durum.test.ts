/**
 * KALICI DURUM VE YAZIM — localStorage şeması, seri hesabı, fuzzy eşleşme.
 *
 * Bu dosya oyunun "hafızası". localStorage'a elle dokunulmuş ya da eski
 * sürümden kalma bir şema varsa oyun çökmeden devam etmeli.
 */

import {
  BOS_ISTATISTIK,
  dailyKaydet,
  dailyPaylasMetni,
  gununSerisi,
  turEkle,
  yukle,
} from '../src/game/storage'
import { bugun } from '../src/game/types'
import { normalize, mesafe, benzerlik } from '../src/game/fuzzy'
import { baslik, ok, esit, bitir } from './_yardim'

const gun = (n: number) => new Date(2026, 8, 30 - n, 12, 0, 0) // 30 Eylül 2026'dan n gün geri

baslik('Şema dayanıklılığı')

/* localStorage'ı taklit et — testler gerçek tarayıcı olmadan çalışsın. */
class SahteDepo {
  private veri = new Map<string, string>()
  getItem(k: string) {
    return this.veri.get(k) ?? null
  }
  setItem(k: string, v: string) {
    this.veri.set(k, v)
  }
  removeItem(k: string) {
    this.veri.delete(k)
  }
  clear() {
    this.veri.clear()
  }
}
const depo = new SahteDepo()
;(globalThis as { localStorage?: unknown }).localStorage = depo

depo.clear()
esit(yukle().tur, 0, 'boş depo sıfır istatistik veriyor')
esit(Object.keys(yukle().dailyGecmisi).length, 0, 'boş depoda dailyGecmisi boş nesne')

/* Eski şema: dailyGecmisi yok (uygulamaya eklendikten önce kaydedilmiş) */
depo.clear()
depo.setItem(
  'cografya.v1',
  JSON.stringify({ tur: 12, puan: 2400, daily: { tarih: '2026-09-28', anahtar: 'Turkey', puan: 90 } }),
)
const eski = yukle()
esit(eski.tur, 12, 'eski şemadaki tur korunuyor')
esit(eski.daily?.puan, 90, 'eski şemadaki daily korunuyor')
esit(Object.keys(eski.dailyGecmisi).length, 0, 'eksik dailyGecmisi boş nesneyle tamamlanıyor')
esit(Object.keys(eski.ulkeBazli).length, 0, 'eksik ulkeBazli boş nesneyle tamamlanıyor')

/* Bozuk JSON */
depo.clear()
depo.setItem('cografya.v1', '{bu bozuk json')
ok(yukle().tur === 0, 'bozuk JSON yakalanıyor, varsayılana düşülüyor')
depo.setItem('cografya.v1', 'null')
ok(yukle().tur === 0, '"null" JSON yakalanıyor')
depo.setItem('cografya.v1', '[]')
ok(yukle().tur === 0, 'dizi JSON yakalanıyor')

/* Açıkça null alanlar */
depo.clear()
depo.setItem('cografya.v1', JSON.stringify({ tur: 5, dailyGecmisi: null, ulkeBazli: null }))
const nuluAlanlar = yukle()
esit(nuluAlanlar.tur, 5, 'geçerli alanlar korunuyor')
esit(Object.keys(nuluAlanlar.dailyGecmisi).length, 0, 'dailyGecmisi:null → boş nesne')
esit(Object.keys(nuluAlanlar.ulkeBazli).length, 0, 'ulkeBazli:null → boş nesne')

baslik('Tur istatistikleri')

depo.clear()
let ist = BOS_ISTATISTIK
ist = turEkle(ist, 'Turkey', true, 120)
ist = turEkle(ist, 'France', true, 90)
ist = turEkle(ist, 'Italy', true, 110)
esit(ist.seri, 3, 'seri ardışık doğrularla artıyor')
esit(ist.enUzunSeri, 3, 'en uzun seri güncelleniyor')
ist = turEkle(ist, 'Japan', false, 10)
esit(ist.seri, 0, 'yanlış cevap seriyi sıfırlıyor')
esit(ist.enUzunSeri, 3, 'en uzun seri korunuyor')
esit(ist.tur, 4, 'tur sayısı artıyor')
esit(ist.puan, 120 + 90 + 110 + 10, 'puan birikiyor')
esit(ist.dogru, 3, 'doğru sayısı yalnızca başarılı turları sayıyor')
esit(ist.ulkeBazli['Turkey']?.toplam, 1, 'ülke bazlı istatistik tutuluyor')
esit(ist.ulkeBazli['Turkey']?.dogru, 1, 'ülke bazlı doğru sayısı tutuluyor')
ist = turEkle(ist, 'Turkey', false, 5)
esit(ist.ulkeBazli['Turkey']?.toplam, 2, 'aynı ülke ikinci kez sorulduğunda sayac artıyor')
esit(ist.ulkeBazli['Turkey']?.dogru, 1, 'hatalı cevap doğru sayacını artırmıyor')

baslik('Günün ülkesi serisi')

/* Seri kuralı: bugün oynanmışsa bugünden, oynanmamışsa DÜN oynanmışsa
   dünden geriye sayılır. Böylece akşam oynayıp sabah unutan kullanıcının
   serisi sıfırlanmış görünmez. */
let s = BOS_ISTATISTIK
esit(gununSerisi(s, gun(0)), 0, 'boş geçmiş → seri 0')
s = dailyKaydet(s, 'X', 100, true, gun(0))
esit(gununSerisi(s, gun(0)), 1, 'bugün oynandı → 1')

let bes = BOS_ISTATISTIK
for (let i = 4; i >= 0; i--) bes = dailyKaydet(bes, 'X', 100, true, gun(i))
esit(gununSerisi(bes, gun(0)), 5, '5 gün üst üste → 5')
esit(gununSerisi(bes, gun(1)), 4, '4 Eylül\'den bakınca → 4')
esit(gununSerisi(bes, gun(-1)), 5, 'bugün oynanmadı, dün oynanmış → 5 korunur')
esit(gununSerisi(bes, gun(7)), 0, '1 hafta sonra, arada boşluk → 0')

let kopuk = BOS_ISTATISTIK
for (const i of [0, 1, 2, 5]) kopuk = dailyKaydet(kopuk, 'X', 100, true, gun(i))
esit(gununSerisi(kopuk, gun(0)), 3, 'boşluktan önceki günler → boşlukta durur')

let uzun = BOS_ISTATISTIK
for (let i = 0; i < 40; i++) uzun = dailyKaydet(uzun, 'X', 100, true, gun(i))
esit(gununSerisi(uzun, gun(0)), 40, '40 gün → 40')
/* Başarısızlık seriyi bozmaz (Wordle mantığı: oynanması yeterli) */
let basarisiz = BOS_ISTATISTIK
for (let i = 0; i < 3; i++) basarisiz = dailyKaydet(basarisiz, 'X', 10, false, gun(i))
esit(gununSerisi(basarisiz, gun(0)), 3, 'başarısız günler de seriyi artırıyor')

baslik('Tarih sınırları')

esit(bugun(new Date(2026, 8, 30)), '2026-09-30', 'Eylül')
esit(bugun(new Date(2026, 11, 5)), '2026-12-05', 'Aralık')
esit(bugun(new Date(2027, 0, 1)), '2027-01-01', 'yıl sınırı')
esit(bugun(new Date(2028, 1, 29)), '2028-02-29', 'artık yıl 29 Şubat')
esit(bugun(new Date(2026, 0, 5)), '2026-01-05', 'sıfır dolgulu ay')

/* Seri yıl sınırını geçebilmeli */
let yil = BOS_ISTATISTIK
for (const d of [new Date(2026, 11, 31), new Date(2027, 0, 1), new Date(2027, 0, 2)]) {
  yil = dailyKaydet(yil, 'X', 100, true, d)
}
esit(gununSerisi(yil, new Date(2027, 0, 2)), 3, '31 Ara → 1 Oca → 2 Oca: seri 3')

/* Artık yılda 29 Şubat */
let artik = BOS_ISTATISTIK
for (const d of [new Date(2028, 1, 29), new Date(2028, 1, 28), new Date(2028, 1, 27)]) {
  artik = dailyKaydet(artik, 'X', 100, true, d)
}
esit(gununSerisi(artik, new Date(2028, 1, 29)), 3, 'artık yıl Şubat → seri 3')

baslik('Paylaşım metni')

const m1 = dailyPaylasMetni(bes, 'Türkiye', true, gun(1))
ok(m1.includes('Türkiye'), 'ülke adı metinde')
ok(m1.includes('4 gün'), 'seri metinde', m1.split('\n').find((l) => l.includes('Seri')) ?? '')
ok(m1.includes('✅'), 'başarılı → ✅')
ok(m1.includes('/ 175'), 'puan tavanı metinde')
ok(m1.split('\n').length >= 4, 'çok satırlı')
const m2 = dailyPaylasMetni(bes, 'Japonya', false, gun(1))
ok(m2.includes('❌') && !m2.includes('✅'), 'başarısız → ❌')
const m3 = dailyPaylasMetni(BOS_ISTATISTIK, 'Fransa', true, gun(1))
ok(!m3.includes('Seri:'), 'seri yokken "Seri:" satırı çıkmıyor')
ok(m3.includes('Fransa'), 'seri olmasa da ülke adı var')

baslik('Yazım normalizasyonu')

const esitNormalize: [string, string][] = [
  ['istanbul', 'İstanbul'],
  ['İSTANBUL', 'istanbul'],
  ['Türkiye', 'turkiye'],
  ['Kıbrıs', 'kibris'],
  ['Iğdır', 'igdir'],
  ['Şanlıurfa', 'sanliurfa'],
  ['Çin', 'cin'],
  ['Washington, D.C.', 'washington dc'],
  ['Åland', 'aland'],
  ['Brasília', 'brasilia'],
]
for (const [a, b] of esitNormalize) {
  ok(normalize(a) === normalize(b), `normalize("${a}") === normalize("${b}")`, `"${normalize(a)}"`)
}
/* Noktalı I tuzağı: 'İ'.toLowerCase() 'i' + U+0307 üretir, 8 harf → 9 */
ok(normalize('İstanbul').length === 8, 'İstanbul 8 harf kalıyor (birleşik nokta yok)', `${normalize('İstanbul').length} harf`)

/* Regresyon: AKISAN tablosunda `í`, `ã`, `õ` eksikti. Veride geçen
   karakterlerin TAMAMI normalize edilebilmeli — eksik her harf bir
   başkenti yanlış eşleştiriyor (çeldirici seçimi bu tabloya dayanıyor). */
import { countries } from '../src/lib/world'
const veridekiAksanlar = new Set<string>()
for (const u of countries) for (const ch of u.tr + u.bas) if (/[^\x00-\x7F]/.test(ch)) veridekiAksanlar.add(ch)
const indirgenmeyen = [...veridekiAksanlar].filter((ch) => normalize(ch).length > 1 && !/^[a-z]$/.test(normalize(ch)))
ok(
  indirgenmeyen.length === 0,
  `veride geçen ${veridekiAksanlar.size} aksanlı karakterin hepsi indirgeniyor`,
  indirgenmeyen.join(' '),
)
console.log(`   · veride geçen aksanlı karakterler: ${[...veridekiAksanlar].sort().join(' ')}`)

/* Her ülke adı ve başkenti normalize edilebilmeli */
const normalizeEdilemeyen = countries.filter(
  (u) => normalize(u.tr) !== normalize(u.tr.toLowerCase()) || normalize(u.bas).length === 0,
)
ok(normalizeEdilemeyen.length === 0, 'tüm ülke adları normalize edilebiliyor', normalizeEdilemeyen.map((u) => u.tr).join(', '))

baslik('Mesafe (Damerau-Levenshtein)')

/* Tek matrix şart: fazladan `t` matrisi transpozisyon dalını bozuyordu,
   `mesafe('sana','bandarseribegowan')` = 1 dönüyordu (doğrusu 14). */
esit(mesafe('sana', 'bandarseribegowan'), 14, 'uzağa yakın kelimeler doğru mesafe')
esit(mesafe('abc', 'abc'), 0, 'aynı kelime 0')
esit(mesafe('', 'abc'), 3, 'boş string')
esit(mesafe('abc', ''), 3, 'ters boş string')
esit(mesafe('ba', 'ab'), 1, 'transpozisyon 1 (klasik Levenshtein 2 derdi)')
esit(mesafe('kitap', 'kitab'), 1, 'son harf eksik 1')
esit(mesafe('kin', 'in'), 1, 'ilk harf eksik 1')
esit(mesafe('abc', 'abcd'), 1, 'son harf fazla 1')
ok(mesafe('merhaba', 'merhaba') === 0, 'aynı')
ok(
  mesafe(normalize('Ankara'), normalize('ankara')) === 0,
  'normalize sonrası aynı → mesafe 0',
  `${normalize('Ankara')}`,
)

baslik('Benzerlik')

ok(benzerlik('Ankara', 'Ankara') === 1, 'aynı kelime → 1')
ok(benzerlik('Ankara', 'Ankar') > benzerlik('Ankara', 'Londra'), 'benzer yazım > uzak yazım')
ok(
  benzerlik('Kingstown', 'Kingston') > 0.85,
  'Kingstown↔Kingston çok benzer (belgelenen çeldirici çifti)',
  benzerlik('Kingstown', 'Kingston').toFixed(2),
)
ok(
  benzerlik('Bern', 'Berlin') > 0.6,
  'Bern↔Berlin benzer (belgelenen çeldirici çifti)',
  benzerlik('Bern', 'Berlin').toFixed(2),
)
ok(benzerlik('Sana', 'Astana') > 0.6, 'Sana↔Astana benzer', benzerlik('Sana', 'Astana').toFixed(2))
ok(benzerlik('', 'Ankara') === 0, 'boş girdi → 0')
ok(benzerlik('Ankara', '') === 0, 'ters boş girdi → 0')

bitir()
