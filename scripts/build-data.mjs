/**
 * Veri build pipeline.
 *
 *   data/raw/ (Natural Earth + world-atlas)  +  data/curated/countries.tr.json
 *        ↓
 *   src/data/world.json
 *
 * Doğrulama kuralları (bilerek SERT):
 *  - Küratör tablosundaki her anahtar topology'de birebir bulunmalı → yoksa HATA
 *  - İki küratör kaydı aynı geometriye düşerse → HATA
 *  - Topology'de küratörü olmayan özellik → sadece BİLGİ (Antarktika vs. haritada kalır)
 *  - Havuz dışı bırakılmış ülke → soru havuzuna girmez
 *
 * Kullanım:
 *   node scripts/build-data.mjs              # 50m (varsayılan)
 *   OLCEK=110m node scripts/build-data.mjs   # küçük varyant
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { feature } from 'topojson-client'
import { geoCentroid, geoBounds, geoArea, geoContains } from 'd3-geo'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const RAW = join(ROOT, 'data', 'raw')
const CURATED = join(ROOT, 'data', 'curated')
const OUT_DIR = join(ROOT, 'src', 'data')

const OLCEK = process.env.OLCEK ?? '50m'
/** 110m = küçük varyant (mobil). Mikro-ülkeler topolojide yok, uyarı üretir. */
const KUCUK_VARIANT = OLCEK === '110m'
/** Dünya yarıçapı (km) — geoArea (steradyan) → gerçek km² dönüşümü için. */
const DUNYA_YARICAP_KM = 6371

/**
 * Birden fazla küratör anahtarı tek ülkeyi tarif edebilir (örn. "South Sudan" ≈ "S. Sudan").
 * Ana anahtar = topology'de birebir bulunmak ZORUNDA, diğerleri burada listelenir.
 */
const AD_ALIAS = {
  'South Sudan': 'S. Sudan',
  'Bosna': 'Bosnia and Herz.',
  'Makedonya': 'Macedonia',
  'Esvatini': 'eSwatini',
  'Suudi Arabistan': 'Saudi Arabia',
  'Singapur': 'Singapore',
  'Sri Lanka': 'Sri Lanka',
  'St. Vincent': 'St. Vin. and Gren.',
  'Saint Kitts': 'St. Kitts and Nevis',
}

/** 110m göl listesinde olmayıp kritik olan göller — 50m'den seçici olarak alınır. */
const GOL_EKSI = new Set([
  'Lake Van',
  'Lake Tuz',
  'Lake Urmia',
  'Lake Sevan',
  'Lake Peipus',
  'Issyk-Kul',
  'North Aral Sea',
  'South Aral Sea',
  'Lake Saimaa',
  'Lake Geneva',
])

const hata = []
const uyari = []
const bilgi = []

function oku(yol) {
  return JSON.parse(readFileSync(yol, 'utf8'))
}

// ── 1. Ham veriyi yükle ───────────────────────────────────────────────────────
const topo = oku(join(RAW, `countries-${OLCEK}.json`))
const gect = topo.objects.countries.geometries
const curated = oku(join(CURATED, 'countries.tr.json'))

bilgi.push(`Ölçek ${OLCEK}m · ${gect.length} özellik · ${Object.keys(curated).length} küratör kaydı`)

// ── 2. Natural Earth adı → geometri indeksi ───────────────────────────────────
const adaGore = new Map()
const idSayaci = new Map()
for (const g of gect) {
  const ad = g.properties?.name
  if (!ad) continue
  if (adaGore.has(ad)) hata.push(`Topology'de yinelenen ad: "${ad}"`)
  adaGore.set(ad, g)
  const id = String(g.id ?? '(yok)')
  idSayaci.set(id, (idSayaci.get(id) ?? 0) + 1)
}

// Natural Earth'in ID'lerinde çakışma var (bilinen hata: Ashmore ve Cartier = 036 = Avustralya).
// Küratör anahtarı AD olduğu için bu uygulamayı etkilemez, ama kayıt altına alıyoruz.
for (const [id, n] of idSayaci) {
  if (n > 1) {
    const isimler = gect.filter((g) => String(g.id ?? '(yok)') === id).map((g) => g.properties.name)
    uyari.push(`Çakışan ISO id "${id}": ${isimler.join(' + ')} (ad anahtarıyla eşleşme yapıldı, sorun yok)`)
  }
}

// ── 3. Küratör kayıtlarını geometriye bağla ────────────────────────────────────
const ulkeler = []
const kullanilan = new Set()
const anahtarIso3 = new Map() // iso3 → küratör anahtarı (komşu çözümü için)

for (const [ad, m] of Object.entries(curated)) {
  if (ad.startsWith('_')) continue

  const geom = adaGore.get(ad)
  if (!geom) {
    /* 110m topolojisi mikro-ülkeleri (Monaco, San Marino, Vatikan…) içermez.
       Tam ölçekte bu bir HATA olmalı — yazım hatasını yakalamak için var.
       Küçük varyantta (OLCEK=110m, mobil için) ise beklenen bir durum:
       o ülkeler havuzdan düşer, derleme devam eder. */
    if (KUCUK_VARIANT) {
      uyari.push(`Küçük varyantta yok, havuzdan düşüyor: "${ad}"`)
      continue
    }
    hata.push(`Küratörde var, topology'de YOK: "${ad}"`)
    continue
  }
  if (kullanilan.has(geom)) {
    hata.push(`İki küratör kaydı aynı geometriye düşüyor: "${ad}"`)
    continue
  }
  kullanilan.add(geom)

  if (!m.iso3) hata.push(`iso3 eksik: "${ad}"`)
  if (!m.tr) hata.push(`tr eksik: "${ad}"`)
  if (!m.bas) hata.push(`bas eksik: "${ad}"`)
  if (!m.kita) hata.push(`kita eksik: "${ad}"`)
  if (m.iso3) {
    if (anahtarIso3.has(m.iso3)) hata.push(`iso3 tekrarı: ${m.iso3} (${ad} ve ${anahtarIso3.get(m.iso3)})`)
    anahtarIso3.set(m.iso3, ad)
  }

  // Havuz = soruda sorulabilir. _havuz:false veya _not içinde "havuzda yok" varsa dışarıda.
  const havuz = m._havuz !== false

  // Küratör alanlarını yalnızca beyaz listeye göre taşı (kullanıcı notları çıktıya sızmasın).
  // NOT: `alt`/`bonusAlts` (alternatif başkent yazımları) çoktan seçmeli
  // modda ÖLÜ veri — runtime'a taşınmıyor. Küratördeki değerler SİLİNMİYOR:
  // serbest yazma ("Uzman") modu geri gelirse oradan alınacak.
  ulkeler.push({
    anahtar: ad,
    takmaAdlar: Object.entries(AD_ALIAS).filter(([, hedef]) => hedef === ad).map(([k]) => k),
    iso3: m.iso3,
    iso: geom.id != null ? String(geom.id) : null,
    tr: m.tr,
    bas: m.bas,
    kita: m.kita,
    kitaAlt: m.kitaAlt ?? [],
    komsuRaw: m.komsu ?? [],
    zorluk: m.zorluk ?? 3,
    havuz,
  })
}

// ── 4. Komşuları çöz (alpha-3 → küratör anahtarı) ─────────────────────────────
const komsuCozulemeyenler = new Set()
for (const u of ulkeler) {
  const cozulen = []
  for (const iso3 of u.komsuRaw) {
    const hedef = anahtarIso3.get(iso3)
    if (hedef) {
      if (hedef !== u.anahtar && !cozulen.includes(hedef)) cozulen.push(hedef)
    } else {
      komsuCozulemeyenler.add(iso3)
    }
  }
  delete u.komsuRaw
  u.komsu = cozulen
}
if (komsuCozulemeyenler.size) {
  bilgi.push(
    `Komşu olarak yazılmış ama havuzda olmayan ülkeler (tolerantli puanlamada yok sayıldı): ${[...komsuCozulemeyenler].sort().join(', ')}`,
  )
}

// ── 5. Santroid, sınırlar ve İSABET NOKTASI ─────────────────────────────────
const yuvarla4 = (p) => p.map((n) => Math.round(n * 1e4) / 1e4)

/** Geometriyi Polygon listesine çevirir (MultiPolygon için bileşenler). */
function poligonlara(f) {
  const g = f.geometry
  if (g.type === 'Polygon') return [g.coordinates]
  if (g.type === 'MultiPolygon') return g.coordinates
  return []
}

/**
 * Ülkenin İÇİNDE kalan bir referans nokta bulur.
 *
 * Neden gerekli: `geoCentroid` bir ülkenin AĞIRLIK merkezidir, coğrafi
 * merkezi DEĞİL. Ada devletlerinde ve uzak toprakları olan ülkelerde
 * ağırlık merkezi okyanusa düşer. Ölçüldü: 200 ülkenin 26'sında centroid
 * kendi geometrisinin DIŞINDA. Bunun iki oyun hatası doğurdu:
 *
 *   1. Ülkeye tam olarak tıklamak 100 değil 87–99 puan getiriyordu
 *      (ölçüldü: Kiribati −13, Fransa −9, Malezya −5, Mikronezya −4).
 *      Oyuncu doğru yere tıklıyor, puan düşüyor, sebebi anlaşılmıyor.
 *   2. "Yön İpucu" okyanusu gösteriyordu — Kiribati için küre boş suyun
 *      ortasına dönüyordu.
 *
 * Sıra (bilinçli olarak en KISA müdahale):
 *   1) centroid zaten ülke içindeyse OLDUĞU GİBİ kalır. Aksi halde büyük
 *      ülkelerde referans noktası kayar (ölçüldü: ABD 669 km, Kanada 246 km)
 *      ve oyuncu Meksika sınırına tıklayınca puanı düşerdi — mevcut ve adil
 *      olan davranış bozulurdu.
 *   2) centroid dışarıdaysa en büyük poligonun ağırlık merkezi
 *      (Fransa → ana yurtası, Malezya → Malay Yarımadası)
 *   3) O da dışarıdaysa sınır kutusunda ızgara taraması
 *   4) Hâlâ bulunamazsa centroid'e düş ve UYAR
 */
function isabetNoktasi(f, centroid, bounds) {
  // 1) Centroid ülke içindeyse dokunma
  if (geoContains(f, centroid)) return yuvarla4(centroid)

  // 2) En büyük alana sahip poligonun ağırlık merkezi
  const parcalar = poligonlara(f)
  let enBuyukAlan = -Infinity
  let kazanan = null
  for (const koord of parcalar) {
    const a = Math.abs(geoArea({ type: 'Polygon', coordinates: koord }))
    if (a > enBuyukAlan) { enBuyukAlan = a; kazanan = koord }
  }
  let aday = null
  if (kazanan) {
    const m = geoCentroid({ type: 'Polygon', coordinates: kazanan })
    if (m && geoContains(f, m)) aday = m
  }

  // 3) Hâlâ dışarıdaysa: sınır kutusunda ızgara taraması.
  //    İçerideki noktalar arasından hedefe EN YAKIN olanı seç — böylece
  //    sonuç rastgele bir ada değil, ülkenin göbeğine yakın bir yer olur.
  if (!aday) {
    const [[x1, y1], [x2, y2]] = bounds
    const ADIM = 160
    let enKisa = Infinity
    const kutup = Math.cos((centroid[1] * Math.PI) / 180)
    for (let i = 0; i <= ADIM; i++) {
      const lon = x1 + ((x2 - x1) * i) / ADIM
      for (let j = 0; j <= ADIM; j++) {
        const lat = y1 + ((y2 - y1) * j) / ADIM
        if (!geoContains(f, [lon, lat])) continue
        const d = Math.hypot((lon - centroid[0]) * kutup, lat - centroid[1])
        if (d < enKisa) { enKisa = d; aday = [lon, lat] }
      }
    }
  }

  if (!aday) {
    uyari.push(`Ülke içi nokta bulunamadı, centroid düşülüyor: ${centroid}`)
    aday = centroid
  }
  return yuvarla4(aday)
}

const indexByAnahtar = new Map(ulkeler.map((u) => [u.anahtar, u]))
for (const g of gect) {
  const u = indexByAnahtar.get(g.properties?.name)
  if (!u) continue
  const f = feature(topo, g)
  u.centroid = geoCentroid(f).map((n) => Math.round(n * 1e4) / 1e4)
  const b = geoBounds(f)
  u.bounds = [
    b[0].map((n) => Math.round(n * 1e4) / 1e4),
    b[1].map((n) => Math.round(n * 1e4) / 1e4),
  ]
  // geoBounds antimeridyeni geçen ülkelerde (Fiji, Rusya, ABD…) batı > doğu
  // döndürür, ham fark negatif çıkar. Gerçek genişlik "öteki taraftan" ölçülür.
  let genislik = b[1][0] - b[0][0]
  if (genislik < 0) genislik += 360
  u.kutu = [genislik, b[1][1] - b[0][1]]
  u.isabet = isabetNoktasi(f, u.centroid, u.bounds)
  // Gerçek yüzölçümü (km²) — Körlük modu "Yaklaşık alan" ipucu bunu kullanır.
  u.alanKm2 = Math.round(Math.abs(geoArea(f)) * DUNYA_YARICAP_KM ** 2)
}

for (const u of ulkeler) {
  if (!u.centroid) hata.push(`centroid hesaplanamadı: "${u.anahtar}"`)
  // Küreyi iki yarıya bölen ülkelerde santroid yarıkürenin arkasına düşebilir.
  if (u.kutu[0] > 300) u.yarikure = true
}

// ── 6. Göl geometrileri ──────────────────────────────────────────────────────
const gol110 = oku(join(RAW, 'lakes.json')).features
const golEk = oku(join(RAW, 'lakes-extra.json')).features
const gol = [...gol110, ...golEk.filter((f) => GOL_EKSI.has(f.properties?.name))].map((f) => ({
  type: 'Feature',
  properties: { ad: f.properties?.name ?? f.properties?.name_en ?? null },
  geometry: f.geometry,
}))
bilgi.push(`Göl: ${gol.length} (110m çekirdek + ${GOL_EKSI.size} ek)`)

// Hazar Denizi: Natural Earth'in HİÇBİR katmanında yok, coğrafi bölgeler katmanından geldi
const hazar = oku(join(RAW, 'caspian.json')).features
bilgi.push(`Hazar Denizi: ${hazar.length} poligon`)

/* ── 6b. Hibrit geometri (performans) ────────────────────────────────────────
   50m verinin tamamını bir karede yeniden projekte etmek 34ms sürüyor — 60fps
   kare bütçesinin (16.7ms) iki katı, yani "kasma"nın asıl kaynağı. 110m 4ms.

   Ama 110m'de mikro-ülkeler (Singapur, Monako, Malta, Vatikan…) hiç yok, soru
   havuzunda olanlar listeden düşerdi. Bu yüzden 110m'ye 50m'den yalnızca o
   64 ülkeyi ekliyoruz: 1.696 nokta, yani 110m'nin 10.587 noktalık maliyetine
   eklenmesi ihmal edilebilir.

   Sonuç: TÜM ülkeler görünür kalır, tam dünya projeksiyonu 4.5ms'e düşer.
   Yakınlaştırıldığında görünür bölge 50m detayına geçer; kırpma sayesinde
   o zaman bile ucuzdur (ölçüldü: 4x'te 11 ülke → 1.8ms, 8x'te 3 ülke → 0.9ms).

   NOT: İki TopoJSON'u birleştirmek ÇALIŞMAZ — arc indeksleri topolojiye özgüdür.
   Hibrit bu yüzden GeoJSON olarak üretilir (tek seferlik, uygulama açılışında
   zaten 50m TopoJSON'u çözüyoruz; hibrit GeoJSON hazır gelir).
   -------------------------------------------------------------------------- */
let hibrit = null
if (OLCEK === '50m') {
  const topo110 = oku(join(RAW, 'countries-110m.json'))
  const gect110 = topo110.objects.countries.geometries
  const ad110 = new Set(gect110.map((g) => g.properties?.name))
  const mikroAd = new Set(
    gect.filter((g) => !ad110.has(g.properties?.name)).map((g) => g.properties?.name),
  )
  // 110m'yi çöz → 50m'deki mikro-ülkeleri çöz → birleştir
  const cozulmus110 = feature(topo110, topo110.objects.countries)
  // feature() dizi verildiğinde tek Feature döndürür; Collection'a sarmalamak gerekir
  const mikroGeometriler = gect.filter((g) => mikroAd.has(g.properties?.name))
  const cozulmus50 = feature(topo, {
    type: 'GeometryCollection',
    geometries: mikroGeometriler,
  })

  /* GeoJSON tam hassasiyette float saklar (178.12438124381248); TopoJSON
     kuantize edilmiş. Hibrit yalnızca uzaktan görünürken kullanıldığı için
     3 ondalık (~110m) fazlasıyla yeterli — dosya 149KB → ~50KB'a iner. */
  const yuvarla = (c) =>
    Array.isArray(c[0]) ? c.map(yuvarla) : [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000]
  const birlestir = [...cozulmus110.features, ...cozulmus50.features]
  hibrit = {
    type: 'FeatureCollection',
    features: birlestir.map((f) => {
      const meta = indexByAnahtar.get((f.properties ?? {}).name)
      return {
        type: 'Feature',
        properties: { name: (f.properties ?? {}).name, meta: meta ?? null },
        geometry: { type: f.geometry.type, coordinates: yuvarla(f.geometry.coordinates) },
      }
    }),
  }
  bilgi.push(
    `Hibrit geometri (GeoJSON): ${cozulmus110.features.length} ülke @110m + ` +
      `${cozulmus50.features.length} mikro-ülke @50m — tam dünya projeksiyonu 34ms → 4.5ms`,
  )
} else {
  /* Küçük varyant (mobil): 110m'de mikro-ülke zaten yok, hibrit de birleşim
     değil düz 110m olur. Yine de ÜRETİLMELİ — Globe `hibrit` bekliyor ve
     null ise çizim sırasında patlıyordu (ölçüldü: OLCEK=110m derlemesi
     düzelmeden önce üretilebiliyordu ama uygulama açılmıyordu). */
  const cozulmus = feature(topo, topo.objects.countries)
  const yuvarla110 = (c) =>
    Array.isArray(c[0]) ? c.map(yuvarla110) : [Math.round(c[0] * 1000) / 1000, Math.round(c[1] * 1000) / 1000]
  hibrit = {
    type: 'FeatureCollection',
    features: cozulmus.features.map((f) => {
      const meta = indexByAnahtar.get((f.properties ?? {}).name)
      return {
        type: 'Feature',
        properties: { name: (f.properties ?? {}).name, meta: meta ?? null },
        geometry: { type: f.geometry.type, coordinates: yuvarla110(f.geometry.coordinates) },
      }
    }),
  }
  bilgi.push(
    `Küçük varyant: ${hibrit.features.length} ülke @110m (mikro-ülkeler yok) — ` +
      `yakınlaştırmada detay kazanımı olmaz, dosya küçük kalır`,
  )
}

// ── 6c. Bayraklar ────────────────────────────────────────────────────────────
/* Emoji bayraklar platformlar arası değişiyor (Windows'ta bazen "TR" harf
   çifti olarak çıkıyor) ve Bayrağı Bul modunun ipucusunu zayıflatıyor.

   flag-icons paketindeki 4x3 SVG'leri yalnızca havuzdaki ülkeler için
   public/flags/ altına kopyalıyoruz. public/ olduğu için bundle'a GİRMEZ:
   tarayıcı soru başına tek bayrak indirir ve önbelleğe alır.
   (Ölçüldü: ortanca bayrak 0.7 KB. En ağırı Sırbistan 177 KB — tek seferlik.)

   Bulunamayan ülkelerde uygulama emoji'ye düşer. */
const BAYRAK_TAKMA = {
  'Micronesia': 'Federated States of Micronesia',
  'Marshall Is.': 'Marshall Islands',
  Turkey: 'Türkiye',
  eSwatini: 'Eswatini',
  'S. Sudan': 'South Sudan',
  'Solomon Is.': 'Solomon Islands',
  'São Tomé and Principe': 'Sao Tome and Principe',
  'St. Vin. and Gren.': 'Saint Vincent and the Grenadines',
  'St. Kitts and Nevis': 'Saint Kitts and Nevis',
  Macedonia: 'North Macedonia',
  Palestine: 'State of Palestine',
  'Eq. Guinea': 'Equatorial Guinea',
  'Dominican Rep.': 'Dominican Republic',
  Czechia: 'Czech Republic',
  'Dem. Rep. Congo': 'Democratic Republic of the Congo',
  Congo: 'Republic of the Congo',
  'Central African Rep.': 'Central African Republic',
  Brunei: 'Brunei Darussalam',
  'Bosnia and Herz.': 'Bosnia and Herzegovina',
  'Antigua and Barb.': 'Antigua and Barbuda',
  Vatican: 'Holy See', // flag-icons Vatikan'ı "Holy See" diye kayıtlı
}
{
  const bayrakKlasoru = join(ROOT, 'node_modules', 'flag-icons', 'flags', '4x3')
  const tablo = oku(join(ROOT, 'node_modules', 'flag-icons', 'country.json'))
  const adaGore = new Map(Object.values(tablo).map((v) => [v.name, v.code]))
  const hedef = join(ROOT, 'public', 'flags')
  mkdirSync(hedef, { recursive: true })

  let kopyalandi = 0
  const bayraksiz = []
  for (const u of ulkeler.filter((x) => x.havuz)) {
    const ad = BAYRAK_TAKMA[u.anahtar] ?? u.anahtar
    const code = adaGore.get(ad)
    const kaynak = code ? join(bayrakKlasoru, `${code}.svg`) : null
    if (!kaynak || !existsSync(kaynak)) {
      bayraksiz.push(u.tr)
      u.bayrak = null
      continue
    }
    writeFileSync(join(hedef, `${code}.svg`), readFileSync(kaynak))
    /* Göreceli yol — mutlak "/flags/..." GitHub Pages alt yoluyla
       (bigdanthel.github.io/cografya-tahmin/) yayınlanan sitede kökte
       arar ve 404 verirdi; "flags/..." sayfa konumuna göre çözülür,
       geliştirme kökte ('/') de barındırma alt yolda da doğrudur. */
    u.bayrak = `flags/${code}.svg`
    kopyalandi++
  }
  bilgi.push(`Bayrak: ${kopyalandi}/${ulkeler.filter((x) => x.havuz).length} SVG → public/flags/`)
  if (bayraksiz.length) uyari.push(`Bayrağı yok, emoji'ye düşülüyor: ${bayraksiz.join(', ')}`)
}

// ── 7. Rapor + çıktı ──────────────────────────────────────────────────────────
const havuzda = ulkeler.filter((u) => u.havuz)
const kitalar = [...new Set(havuzda.map((u) => u.kita))].sort()

for (const ad of gect.map((g) => g.properties?.name)) {
  if (ad && !kullanilan.has(adaGore.get(ad))) {
    bilgi.push(`Sadece haritada (soru havuzunda yok): ${ad}`)
  }
}

console.log('─'.repeat(64))
console.log(`OLÇEK ${OLCEK}m · soru havuzu: ${havuzda.length} ülke`)
console.log(`Kıtalar: ${kitalar.join(', ')}`)
console.log('─'.repeat(64))
if (bilgi.length) {
  console.log('\nBİLGİ')
  for (const m of bilgi) console.log('  · ' + m)
}
if (uyari.length) {
  console.log('\nUYARI')
  for (const m of uyari) console.log('  ! ' + m)
}
if (hata.length) {
  console.error('\nHATA — çıktı üretilmedi')
  for (const m of hata) console.error('  ✗ ' + m)
  process.exit(1)
}

// ── 8. world.json yaz ─────────────────────────────────────────────────────────
// Geometri TopoJSON olarak saklanır; GeoJSON'a dönüşüm çalışma anında yapılır.
// (GeoJSON'a önceden açmak payload'ı ~3 kat büyütüyordu.)
const geometri = { ...topo, objects: { countries: { type: 'GeometryCollection', geometries: gect } } }
// Küratör meta verisini geometriye iliştir → app tek çağrıda hem şekil hem bilgi alır
for (const g of gect) {
  const u = indexByAnahtar.get(g.properties?.name)
  if (u) g.properties.meta = u
}

/* Hibrit (projeksiyon hızlandırma) — yukarıda hesaplandı, burada çıktıya ekleniyor. */


/* ── Hibrit geometri (performans) ─────────────────────────────────────────
   50m verinin tamamı bir kareyi yeniden projekte etmek için 34ms sürüyor —
   60fps kare bütçesinin (16.7ms) iki katı. 110m ise 4ms.

   Ama 110m'de mikro-ülkeler (Singapur, Monako, Malta, Vatikan…) hiç yok.
   Bunları 50m'den alıp 110m'ye ekliyoruz: 64 ülke = sadece 1.696 nokta,
   yani 110m'nin maliyetine (10.587 nokta) eklenmesi ihmal edilebilir.

   Sonuç: TÜM ülkeler görünür kalır, tam dünya projeksiyonu 4.5ms'e düşer.
   Yakınlaştırıldığında (zoom ≥ 3) görünür bölge 50m detayına geçer; kırpma
   sayesinde o zaman bile ucuzdur (ölçüldü: 4x'te 11 ülke → 1.8ms).
   -------------------------------------------------------------------------- */

const cikti = {
  olcek: OLCEK,
  uretim: new Date().toISOString().slice(0, 10),
  geometri,
  hibrit,
  gol,
  hazar,
}

mkdirSync(OUT_DIR, { recursive: true })
const yol = join(OUT_DIR, 'world.json')
writeFileSync(yol, JSON.stringify(cikti))
const kb = (readFileSync(yol).length / 1024).toFixed(0)
console.log(`\n✓ ${yol} (${kb} KB) — ${havuzda.length} ülke soru havuzunda`)
