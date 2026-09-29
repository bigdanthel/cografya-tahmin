/**
 * VERİ BÜTÜNLÜĞÜ — build çıktısının doğru olduğunu doğrular.
 *
 * `world.json` build sırasında üretiliyor; içeriği kaynak kodda görünmüyor.
 * Bu testler, build'deki bir değişikliğin sessizce veriyi bozmasını engelliyor.
 * Veri bozulursa oyun yanlış sorular sorar ve kimse fark etmez.
 */

import { geoContains, geoArea, geoBounds } from 'd3-geo'
import { countries, havuz, ulkeBul } from '../src/lib/world'
import { baslik, ok, esit, toplu, bitir } from './_yardim'

/** `toplu()` her elemanın `ad` alanını hata listesinde gösteriyor. */
const hepsi = countries.map((u) => ({ ad: u.tr, u }))
const havuzHepsi = havuz.map((u) => ({ ad: u.tr, u }))

baslik('Kapsam')

esit(countries.length, 200, 'toplam 200 ülke kaydı')
esit(havuz.length, 193, 'soru havuzunda 193 ülke')
ok(havuz.length < countries.length, 'havuz tüm ülkelerden küçük (7 ülke haritada ama sorulmuyor)')
ok(havuz.every((u) => u.havuz), 'havuz filtresi doğru çalışıyor')

baslik('Kimlik alanları')

toplu('iso3 benzersiz', hepsi, ({ u }) => countries.filter((x) => x.iso3 === u.iso3).length === 1)
toplu('iso3 üç büyük harf', hepsi, ({ u }) => /^[A-Z]{3}$/.test(u.iso3))
toplu('türkçe ad dolu', hepsi, ({ u }) => u.tr.trim().length > 1)
toplu('başkent dolu', hepsi, ({ u }) => u.bas.trim().length > 0)
toplu('anahtar (Natural Earth adı) dolu', hepsi, ({ u }) => u.anahtar.trim().length > 0)
toplu('geçerli kıta', hepsi, ({ u }) =>
  ['Avrupa', 'Asya', 'Afrika', 'Kuzey Amerika', 'Güney Amerika', 'Okyanusya'].includes(u.kita),
)

/* TUZAK: 7 havuz dışı ülkenin zorluğu 6'dır ("sorulmaz" işareti). Bunlar
   haritada görünür ama soru havuzunda yoktur. Test ilk yazıldığında 1-5
   kuralını TÜM ülkeleri uyguladı ve 193/200 dedi — oysa kasıtlı bir
   işaretleme. Not: `Country.zorluk` tipi 1|2|3|4|5 diyor ama derleme
   `KUCUK_VARIANT`ta 6 üretiyor; karşılaştırma için genişletiliyor. */
const zorluk6 = countries.filter((u) => (u.zorluk as number) === 6)
ok(
  zorluk6.length > 0 && zorluk6.every((u) => !u.havuz),
  'zorluk 6 yalnızca havuz dışı ülkelerde ("sorulmaz")',
  `${zorluk6.length} ülke: ${zorluk6.map((u) => u.tr).join(', ')}`,
)
ok(
  havuzHepsi.every(({ u }) => [1, 2, 3, 4, 5].includes(u.zorluk)),
  'havuzdaki ülkelerde zorluk 1-5 arası',
)

/* Türkçe ad ve başkent benzersiz olmalı — aksi halde kullanıcı hangisini
   bulacağını bilemez, çoktan seçmeli soru da belirsizleşir. */
const tekrarliTr = [...adSay(countries, (u) => u.tr)].filter(([, n]) => n > 1)
ok(tekrarliTr.length === 0, 'türkçe adlar benzersiz', tekrarliTr.map(([a, n]) => `${a}×${n}`).join(', '))
const ayniBas = [...adSay(countries, (u) => u.bas)].filter(([, n]) => n > 1)
ok(
  ayniBas.length === 0,
  'başkentler benzersiz (çoktan seçmeli soru belirsizleşmez)',
  ayniBas.map(([b, n]) => `${b}×${n}`).join(', '),
)

function adSay(liste: typeof countries, al: (u: (typeof liste)[number]) => string): [string, number][] {
  const m = new Map<string, number>()
  for (const u of liste) {
    const k = al(u)
    m.set(k, (m.get(k) ?? 0) + 1)
  }
  return [...m.entries()]
}

baslik('Komşuluk')

toplu('komşu anahtarları çözülebilir', hepsi, ({ u }) => u.komsu.every((k) => Boolean(ulkeBul(k))))
const kendiKomsusu = countries.filter((u) => u.komsu.includes(u.anahtar))
ok(kendiKomsusu.length === 0, 'ülke kendi komşusu olarak listelenmiyor', kendiKomsusu.map((u) => u.tr).join(', '))
const komsusuz = havuz.filter((u) => u.komsu.length === 0)
ok(
  komsusuz.length > 0 && komsusuz.length < 60,
  'Ada/izole ülkeler komşusuz (toleranslı kabul onlarda çalışmıyor)',
  `${komsusuz.length} ülke: ${komsusuz.slice(0, 5).map((u) => u.tr).join(', ')}…`,
)

baslik('Geometri')

toplu('sınır kutusu geçerli', hepsi, ({ u }) => {
  const [[x1, y1], [x2, y2]] = u.bounds
  return x1 >= -181 && x1 <= 181 && x2 >= -181 && x2 <= 181 && y1 >= -91 && y1 <= 91 && y2 >= -91 && y2 <= 91
})
toplu('kutu yüksekliği her yerde pozitif', hepsi, ({ u }) => u.kutu[1] > 0)
toplu('geometri sıfır alan değil', hepsi, ({ u }) => geoArea(u.shape) > 0)
toplu('isabet noktası ülke içinde', hepsi, ({ u }) => geoContains(u.shape, u.isabet))
/* bounds veriden türetilmiş olmalı — elle yazılmışsa kayabilir */
toplu('bounds geoBounds ile uyumlu', hepsi, ({ u }) => {
  const b = geoBounds(u.shape)
  return Math.abs(b[0][0] - u.bounds[0][0]) < 0.01 && Math.abs(b[1][1] - u.bounds[1][1]) < 0.01
})

/* TUZAK: sarmalanmış sınır kutulu ülkelerde (antimeridian'ı geçen ABD,
   Rusya, Yeni Zelanda, Kiribati) `bounds[1][0] - bounds[0][0]` NEGATİF çıkar:
   ölçüldü — ABD −239°, Yeni Zelanda −337°. `kutu` ham fark olduğu için
   negatif kalıyor ve "kutu > 100" gibi karşılaştırmalar yanıltıcı olabilir.
   Havuzdaki hiçbir ülke sarmalanmış kutulu değil (hepsi tek yarımküre). */
const sarmali = countries.filter((u) => u.bounds[0][0] > u.bounds[1][0])
ok(
  sarmali.every((u) => u.kutu[0] < 0),
  'sarmalanmış kutularda kutu genişliği negatif (beklenen, izleniyor)',
  sarmali.map((u) => `${u.tr} ${u.kutu[0].toFixed(0)}°`).join(', '),
)
toplu(
  'sarmalanmış olmayanlarda kutu genişliği pozitif',
  countries.filter((u) => u.bounds[0][0] <= u.bounds[1][0]).map((u) => ({ ad: u.tr, u })),
  ({ u }) => u.kutu[0] > 0,
)
/* Bu 4 ülke havuzda ve sorulabiliyor — sarmalanmış kutu onları tıklanamaz
   yapmamalı (bkz. tiklanabilirlik.test.ts, bu dosya orayı sınıyor).
   Burada sadece "kaç tane var" sayıyoruz ki sayı değişirse fark edilsin. */
const sarmaliHavuzda = havuz.filter((u) => u.bounds[0][0] > u.bounds[1][0])
ok(
  sarmaliHavuzda.length === sarmali.length,
  'sarmalanmış kutulu ülkelerin hepsi soru havuzunda (regresyon koruması)',
  `${sarmaliHavuzda.length}/${sarmali.length}: ${sarmaliHavuzda.map((u) => u.tr).join(', ')}`,
)

baslik('Bayraklar')

const bayraksiz = havuz.filter((u) => !u.bayrak)
ok(bayraksiz.length === 0, 'her havuz ülkesinin bayrağı var', bayraksiz.map((u) => u.tr).join(', '))
toplu('bayrak yolu /flags/ altında ve .svg', havuzHepsi, ({ u }) =>
  Boolean(u.bayrak && u.bayrak.startsWith('/flags/') && u.bayrak.endsWith('.svg')),
)
ok(
  new Set(havuz.map((u) => u.bayrak)).size === havuz.length,
  'bayrak dosyaları benzersiz (iki ülke aynı dosyayı paylaşmıyor)',
)

baslik('Yarıküre işareti')

/* bounds 300°'yi aşıyorsa ülke küreyi ikiye böler. */
const ikiYari = countries.filter((u) => u.yarikure)
ok(
  ikiYari.length > 0 &&
    ikiYari.every((u) => u.kutu[0] > 300 || u.bounds[1][0] - u.bounds[0][0] < 0),
  'yarikure işareti sadece gerçekten iki yarımküreye yayılan ülkelerde',
  `${ikiYari.length} ülke: ${ikiYari.map((u) => u.tr).join(', ')}`,
)

baslik('Havuz dışı ülkeler')

const havuzDisi = countries.filter((u) => !u.havuz)
esit(havuzDisi.length, 7, '7 ülke haritada ama sorulmuyor')
ok(
  havuzDisi.every((u) => Boolean(ulkeBul(u.anahtar))),
  'havuz dışı ülkeler yine de haritada (veri kaybı yok)',
  havuzDisi.map((u) => u.tr).join(', '),
)

bitir()
