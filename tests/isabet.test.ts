/**
 * İSABET NOKTASI — puanlamanın ve "Yön İpucu"nun referans noktası.
 *
 * Bu test dosyası özellikle önemli: `isabet` alanı build sırasında
 * hesaplanıp `world.json`'a yazılıyor, yani kaynak kodda görünmüyor.
 * Hesaplamadaki küçük bir değişiklik (mesela ızgara taramasında ADIM
 * düşmesi) 14 ülkede mükemmel tıklama puanını sessizce bozabilir.
 */

import { geoContains } from 'd3-geo'
import { havuz, countries } from '../src/lib/world'
import { tiklamayiPuanla } from '../src/game/score'
import { baslik, ok, esit, toplu, bitir } from './_yardim'

baslik('İsabet noktası: geometri içinde mi?')

/* 1) Her ülkenin isabet noktası kendi geometrisi içinde olmalı. */
toplu(
  'isabet noktası ülke içinde',
  havuz.map((u) => ({ ad: u.tr, u })),
  ({ u }) => geoContains(u.shape, u.isabet),
)

/* 2) Alan biçimi doğru mu? [lon, lat], sayı, sonlu. */
const bozukAlan = havuz.filter(
  (u) =>
    !Array.isArray(u.isabet) ||
    u.isabet.length !== 2 ||
    u.isabet.some((n) => typeof n !== 'number' || !Number.isFinite(n)),
)
ok(bozukAlan.length === 0, 'her ülkede geçerli [lon, lat] alanı var', bozukAlan.map((u) => u.tr).join(', '))

/* 3) Enlem [-90, 90] aralığında olmalı (kutu taraması kaçırabilir). */
const bozukEnlem = havuz.filter((u) => u.isabet[1] < -90 || u.isabet[1] > 90)
ok(bozukEnlem.length === 0, 'isabet enlemi geçerli aralıkta', bozukEnlem.map((u) => `${u.tr} ${u.isabet[1]}`).join(', '))

baslik('Müdahale disiplini: gereksiz kayma olmamalı')

/* 4) centroid ülke içindeyse isabet noktası DEĞİŞMEMELİ.
      Aksi halde büyük ülkelerde mevcut adil davranış bozulurdu:
      ölçüldü — ABD 669 km, Kanada 246 km, Şili 191 km kayardı.
      Bu, build'deki sıralamanın 1. adımını (önce centroid'i dene)
      koruyan test. */
const icerideCevrimsiz = havuz.filter(
  (u) => geoContains(u.shape, u.centroid) && (u.isabet[0] !== u.centroid[0] || u.isabet[1] !== u.centroid[1]),
)
ok(
  icerideCevrimsiz.length === 0,
  'centroid ülke içindeyse isabet noktası aynı kalıyor',
  icerideCevrimsiz.map((u) => u.tr).join(', '),
)

/* 5) centroid DIŞARIDAYSA isabet noktası kaymış olmalı (yani gerçekten
      düzeltme uygulanıyor). Bu iki kural birlikte "yalnızca gereken yeri
      değiştir" ilkesini güvenceye alıyor. */
const disarida = havuz.filter((u) => !geoContains(u.shape, u.centroid))
const duzeltilmemis = disarida.filter(
  (u) => u.isabet[0] === u.centroid[0] && u.isabet[1] === u.centroid[1],
)
ok(
  duzeltilmemis.length === 0,
  `centroid dışarıdaki ${disarida.length} ülkenin hepsi düzeltilmiş`,
  duzeltilmemis.map((u) => u.tr).join(', '),
)

baslik('Aday doğruluk: hangi yöntem neyi düzeltti?')

/* 6) Rapor: hangi ülkeler hangi yöntemle düzeltildi.
      Tamamı 2. adım (en büyük poligon) veya 3. adım (ızgara) olmalı. */
const yuzdeKayan = disarida.length
  ? ((disarida.length - duzeltilmemis.length) / disarida.length) * 100
  : 100
ok(yuzdeKayan === 100, 'düzeltme oranı %100', `%${yuzdeKayan.toFixed(0)}`)

baslik('Mükemmel tıklama = 100 puan')

/* 7) Ülkeye tam olarak (isabet noktasına) tıklamak 100 konum puanı vermeli.
      Bu, hatanın kendisinin regresyon testi: eskiden 14 ülkede
      87–99 puan geliyordu (Kiribati −13, Fransa −9). */
const tamIsabetler = havuz.map((u) => {
  const kutu = tiklamayiPuanla(u, u.isabet, u.anahtar)
  return { ad: u.tr, u, puan: kutu.konum, tam: kutu.tam, mesafe: kutu.mesafeKm }
})
const yuzdeKalan = tamIsabetler.filter((x) => x.puan < 100)
ok(
  yuzdeKalan.length === 0,
  'her ülkede tam tıklama 100 puan',
  yuzdeKalan.map((x) => `${x.ad} ${x.puan}`).join(', '),
)
ok(
  tamIsabetler.every((x) => x.tam),
  'tam tıklama "tam isabet" olarak işaretleniyor',
)
ok(
  tamIsabetler.every((x) => x.mesafe === 0),
  'tam tıklama mesafesi 0 km',
  tamIsabetler.filter((x) => x.mesafe !== 0).slice(0, 3).map((x) => `${x.ad}:${x.mesafe}km`).join(', '),
)

/* 8) Toplam: 19300/19300 */
const toplamPuan = tamIsabetler.reduce((t, x) => t + x.puan, 0)
esit(toplamPuan, havuz.length * 100, 'mükemmel tıklama toplamı 193 ülke × 100')

baslik('Regresyon: bilinen kötü durumlar')

/* 9) Ölçülen kayıpların kayıt altına alınması. Bu ülkeler okyanustaki
      centroid yüzünden etkileniyordu; isabet noktasıyla düzeltildi. */
const HAYALET_KUTU: [string, number][] = [
  // [anahtar, eski(en düşük) konum puanı]
  ['Kiribati', 87],
  ['France', 91],
  ['Malaysia', 95],
  ['Micronesia', 96],
]
const hayaletler = HAYALET_KUTU.map(([k, eskiPuan]) => {
  const u = countries.find((c) => c.anahtar === k)
  return { ad: u?.tr ?? k, bulundu: Boolean(u), puan: u ? tiklamayiPuanla(u, u.isabet, u.anahtar).konum : -1, eskiPuan }
})
for (const h of hayaletler) {
  ok(h.bulundu && h.puan === 100, `${h.ad}: eskiden ${h.eskiPuan} → şimdi 100`, h.bulundu ? '' : 'ülke bulunamadı')
}

baslik('Tolerans ve komşuluk etkilenmemeli')

/* 10) İsabet noktası değişince komşu kabulü bozulmamalı. */
const tolTestleri = havuz
  .filter((u) => u.komsu.length > 0)
  .slice(0, 40)
  .map((hedef) => {
    const komsu = countries.find((c) => c.anahtar === hedef.komsu[0])
    if (!komsu) return null
    const kutu = tiklamayiPuanla(hedef, komsu.isabet, komsu.anahtar)
    return { ad: `${hedef.tr}→${komsu.tr}`, ok: kutu.toleransli && !kutu.tam, puan: kutu.konum }
  })
  .filter((x): x is { ad: string; ok: boolean; puan: number } => x !== null)
toplu(
  'komşu ülkeye tıklama toleranslı kabul ediliyor',
  tolTestleri,
  (x) => x.ok,
)

baslik('Kırpma (culling) etkilenmemiş mi?')

/* 11) Görünürlük kırpması `centroid` kullanıyor (doğru olan bu — büyük
      ülkeler için kutu ortalaması zaten bir tuzaktı). İsabet noktası
      değiştiğinde kırpma bozulmamalı. */
import { olustur, bakisMerkezi, kutuUzakligi } from '../src/lib/projection'
import { geoDistance } from 'd3-geo'

const kaybolan: string[] = []
for (const zoom of [3, 8, 30, 100]) {
  const yaricap = 150 * zoom
  const gorus = Math.hypot(1000, 700) / 2
  const acisal = (Math.asin(Math.min(0.9999, gorus / yaricap)) * 180) / Math.PI + 12
  for (const u of havuz) {
    const p = olustur()
    p.rotate([-u.centroid[0], -u.centroid[1]])
    const C = bakisMerkezi(p)
    const tutuldu =
      geoDistance(C, u.centroid) * (180 / Math.PI) < acisal || kutuUzakligi(C, u.bounds) < acisal
    if (!tutuldu) kaybolan.push(`${u.tr}@${zoom}x`)
  }
}
ok(kaybolan.length === 0, 'hiçbir ülke yakınlaştırmada kaybolmuyor (4 zoom seviyesi)', kaybolan.slice(0, 5).join(', '))

bitir()
