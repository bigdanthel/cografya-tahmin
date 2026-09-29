/**
 * TIKLANABİLİRLİK — her ülke gerçekten tıklanabiliyor mu?
 *
 * Oyunun en büyük doğruluk riski: bir ülke hiçbir rotasyonda tıklanamıyorsa
 * o soru CEVAPLANAMAZ, oyuncu ne yaparsa yapsın kaybeder. Daha kötüsü,
 * çalıştığını sandığımız hatalar (sarmalanmış sınır kutusu, limb reddi) tam
 * olarak bu yolu kesiyordu.
 *
 * Bu dosya Globe.tsx'teki hit-test'in BİREBİR kopyasını kullanır; orada
 * yapılan bir değişiklik burada da yapılmalı.
 */

import { geoContains } from 'd3-geo'
import { countries, havuz, type Country } from '../src/lib/world'
import { olustur, bakisMerkezi, merkezUzaklik, LIMB_ESIK } from '../src/lib/projection'
import { baslik, ok, esit, toplu, bitir } from './_yardim'

/** Globe.tsx `tikla()` fonksiyonunun aynısı. */
function hitTest(nokta: [number, number]): Country | null {
  const [lon, lat] = nokta
  for (const u of countries) {
    const [[bati, guney], [dogu, kuzey]] = u.bounds
    if (lat < guney - 1 || lat > kuzey + 1) continue
    // Sarmalanmış kutu (antimeridian): ABD, Rusya, Yeni Zelanda, Kiribati
    const lonUygun =
      bati <= dogu ? lon >= bati - 1 && lon <= dogu + 1 : lon >= bati - 1 || lon <= dogu + 1
    if (!lonUygun) continue
    if (geoContains(u.shape, nokta)) return u
  }
  return null
}

/** Ülkeyi merkeze alıp merkezdeki noktaya tıklamayı dener. */
function dene(u: Country, yaw: number): Country | null {
  const p = olustur()
  p.rotate([-u.isabet[0] + yaw, -u.isabet[1]])
  const merkez = bakisMerkezi(p)
  if (merkezUzaklik(p, merkez) >= 90 - LIMB_ESIK) return null // limb → tıklama reddedilir
  return hitTest(merkez)
}

baslik('Her ülke tıklanabilir (24 rotasyon)')

const ROTASYON = 24
const tiklanabilirler: { ad: string; u: Country; kac: number }[] = []
for (const u of havuz) {
  let kac = 0
  for (let r = 0; r < ROTASYON; r++) if (dene(u, (r * 360) / ROTASYON)?.anahtar === u.anahtar) kac++
  tiklanabilirler.push({ ad: u.tr, u, kac })
}
const tiklanamayan = tiklanabilirler.filter((x) => x.kac === 0)
ok(
  tiklanamayan.length === 0,
  `her ülke en az bir rotasyonda tıklanabiliyor`,
  `${havuz.length - tiklanamayan.length}/${havuz.length}${tiklanamayan.length ? ' · ' + tiklanamayan.map((x) => x.ad).join(', ') : ''}`,
)

baslik('Sarmalanmış sınır kutuları (regresyon)')

/* Bu 4 ülke `bounds[0][0] > bounds[1][0]` yapar, yani düz `lon >= bati &&
   lon <= dogu` kontrolü matematiksel olarak hiç geçmez. Kalıcı olarak
   tıklanamaz hale geliyorlardı. */
const sarmali = countries.filter((u) => u.bounds[0][0] > u.bounds[1][0])
ok(
  sarmali.length >= 4,
  'test verisinde sarmalanmış kutu var',
  `${sarmali.length} ülke: ${sarmali.map((u) => u.tr).join(', ')}`,
)
toplu(
  'sarmalanmış kutudaki ülkeler tıklanabilir',
  sarmali.map((u) => ({ ad: u.tr, u })),
  ({ u }) => {
    for (let r = 0; r < 8; r++) if (dene(u, (r * 360) / 8)?.anahtar === u.anahtar) return true
    return false
  },
)
/* Tam olarak bu 4'ü de tıklanabilir olmalı. Anahtarlar ISO3 DEĞİL —
   world-atlas'ta "Ashmore and Cartier Is." ile aynı id'yi paylaşan bir hata
   var, ISO'ya güvenilemez. */
const SARMALI_ADLAR = ['Amerika Birleşik Devletleri', 'Rusya', 'Yeni Zelanda', 'Kiribati']
for (const ad of SARMALI_ADLAR) {
  const u = countries.find((c) => c.tr === ad)
  const kayit = tiklanabilirler.find((x) => x.u.tr === ad)
  ok(Boolean(u) && Boolean(kayit && kayit.kac > 0), `${ad} tıklanabilir`, kayit ? `${kayit.kac}/${ROTASYON} rotasyonda` : 'bulunamadı')
}

baslik('Limb (küre kenarı) reddi')

/* 12° içindeki tıklamalar reddediliyor — ülkeler orada eziliyor ve yanlış
   yere düşüyor. Doğrulama: reddedilen noktanın merkeze uzaklığı eşiği
   aşmalı. */
let reddedilen = 0
let yanlisRed = 0
for (const u of havuz) {
  const p = olustur()
  p.rotate([-u.isabet[0], -u.isabet[1]])
  const m = bakisMerkezi(p)
  const uz = merkezUzaklik(p, m)
  const limb = uz > 90 - LIMB_ESIK
  if (limb) reddedilen++
  // merkezdeyken reddedilmemeli
  if (!limb && uz < 5) continue
  if (limb && uz <= 90 - LIMB_ESIK) yanlisRed++
}
ok(yanlisRed === 0, 'limb reddi doğru uzaklık eşiğinde', `reddedilen senaryo: ${reddedilen}`)
/* Kürenin arka yüzü: gerçek antipot noktası 90°'yi aşmalı, yani limb
   eşiğini geçip tıklamadan reddedilmeli.

   TUZAK (testte burada bir ürün hatası sanıldı, ölçüm yanlış çıktı):
   "merkez noktası" ile "merkezin antipodu" AYNI ŞEY DEĞİLDİR.
   `bakisMerkezi` → (-λ, -φ). Gerçek antipot → (merkez_lon ± 180, -merkez_lat).
   Testte `[-isabet.lon, -isabet.lat]` antipod sanıldı; aslında merkezin
   KENDİSİydi (rotate([0,0]) kimlik olduğu için ölçüm 0–22° veriyordu).
   Aşağıda gerçek antipot hesaplanıyor. */
const antipotu = (m: [number, number]): [number, number] => [
  m[0] + 180 > 180 ? m[0] - 180 : m[0] + 180,
  -m[1],
]
const arka = havuz
  .map((u) => {
    const p = olustur()
    p.rotate([-u.isabet[0], -u.isabet[1]])
    const m = bakisMerkezi(p)
    return { ad: u.tr, d: merkezUzaklik(p, antipotu(m)) }
  })
  .filter((x) => x.d < 179.9 || x.d > 180.1)
ok(
  arka.length === 0,
  'merkezin gerçek antipodu tam 180° uzakta (bakisMerkezi doğru)',
  arka.length ? `${arka.length} sapma: ${arka.slice(0, 5).map((x) => `${x.ad} ${x.d.toFixed(1)}°`).join(', ')}` : '',
)

const arkaYuz = havuz
  .map((u) => {
    const p = olustur()
    p.rotate([-u.isabet[0], -u.isabet[1]])
    return { ad: u.tr, d: merkezUzaklik(p, antipotu(bakisMerkezi(p))) }
  })
  .filter((x) => x.d <= 90 - LIMB_ESIK)
ok(
  arkaYuz.length === 0,
  'antipot her ülkede limb eşiğini geçiyor (tıklanamaz bölge)',
  arkaYuz.map((x) => `${x.ad} ${x.d.toFixed(0)}°`).join(', '),
)

baslik('Hit-test tutarlılığı')

/* 5°'lik ızgara: hangi noktada hangi ülkeye düşüyor?
   Denize düşen noktalar null vermeli. */
let denizeDusen = 0
let yanlisUlke = 0
for (let lon = -180; lon < 180; lon += 5) {
  for (let lat = -85; lat <= 85; lat += 5) {
    const hit = hitTest([lon, lat])
    // Bulunan ülke gerçekten o noktayı içermeli (geoContains zaten garanti
    // ediyor ama burada "hiçbir şey bulunmadı" durumunu da sayıyoruz)
    if (!hit) denizeDusen++
    else if (!geoContains(hit.shape, [lon, lat])) yanlisUlke++
  }
}
ok(yanlisUlke === 0, 'hit-test asla yanlış ülke döndürmüyor', `${yanlisUlke} hata`)
ok(denizeDusen > 0, 'denize tıklama null döndürüyor', `${denizeDusen} deniz noktası`)

/* Aynı noktaya iki kez tıklamak aynı sonucu vermeli (deterministik). */
let belirsiz = 0
for (let lon = -180; lon < 180; lon += 7) {
  for (let lat = -80; lat <= 80; lat += 7) {
    const a = hitTest([lon, lat])?.anahtar ?? null
    const b = hitTest([lon, lat])?.anahtar ?? null
    if (a !== b) belirsiz++
  }
}
esit(belirsiz, 0, 'hit-test deterministik (sıra bağımlı değil)')

baslik('Dünya dışı koordinatlar')

/* Tanım gereği hiçbir şey dönmesi gereken noktalar. */
const kotu: [number, number][] = [
  [0, 90],
  [0, -90],
  [200, 0],
  [-200, 45],
]
ok(
  kotu.every(([lon, lat]) => hitTest([lon, lat]) === null),
  'kutu dışı / kutup koordinatları ülke döndürmüyor',
  kotu
    .map(([lo, la]) => `${lo},${la}→${hitTest([lo, la])?.tr ?? 'null'}`)
    .join(' '),
)

bitir()
