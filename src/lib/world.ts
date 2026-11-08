import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import raw from '../data/world.json'

/** Bir ülkenin oyun için gereken tüm bilgiler. */
export interface Country {
  /** Natural Earth adı — geometri eşleştirme anahtarı */
  anahtar: string
  /** Türkçe konuşma dilinde aynı ülkeyi gösteren alternatif anahtarlar */
  takmaAdlar: string[]
  iso3: string
  iso: string | null
  /** Türkçe ad */
  tr: string
  /** Başkent (doğru cevap) */
  bas: string
  /* NOT: küratör tablosundaki `alt`/`bonusAlts` (alternatif başkent yazımları)
     çoktan seçmeli modda kullanılmadığı için runtime'a taşınmıyor (bkz.
     build-data.mjs beyaz listesi). Değerler küratörde SAKLI — serbest yazma
     ("Uzman") modu geri gelirse oradan alınacak, o yüzden silinmiyor. */
  kita: Kita
  /** Sınır anlaşmazlıklarında de kabul edilen alternatif kıta */
  kitaAlt: Kita[]
  /** Toleranslı puanlama için komşu ülke anahtarları */
  komsu: string[]
  /** 1-5 = soru zorluğu; 6 = havuz dışı bölge işareti (bkz. `havuz`) */
  zorluk: 1 | 2 | 3 | 4 | 5 | 6
  /** Soru havuzunda olup olmadığı */
  havuz: boolean
  /** `public/flags/` altındaki bayrak yolu; yoksa emoji'ye düşülür */
  bayrak: string | null
  /** [lon, lat] — ülkenin küre üzerindeki ağırlık merkezi (alan ağırlıklı).
      Uzak toprakları olan ülkelerde bu OKYANUSA düşebilir (Fransa, Kiribati,
      Malezya, Norveç…). Ölçüldü: 201 ülkenin 29'unda geometri dışında (havuzda 26). */
  centroid: [number, number]
  /** [lon, lat] — ÜLKENİN İÇİNDE kalan referans nokta. Puanlama ve "Yön
      İpucu" BUNU kullanır. `centroid` içerideyse ikisi aynıdır; değilse
      en büyük kara kütlesinin merkezine (gerekirse ızgara taramasıyla)
      kaydırılır. Build'de hesaplanır, çalışma anında aranmaz. */
  isabet: [number, number]
  /** [[batı, güney], [doğu, kuzey]] */
  bounds: [[number, number], [number, number]]
  /** Bounding box genişliği/yüksekliği (derece) */
  kutu: [number, number]
  /** Gerçek yüzölçüm (km²) — geoArea × Dünya yarıçapı². Körlük "Yaklaşık alan" ipucu bunu kullanır. */
  alanKm2: number
  /** Küreyi iki yarıya bölen ülke (Rusya, ABD, Fildişi Sahili…) */
  yarikure?: boolean
  /** Coğrafi şekil — runtime'da üretilir */
  shape: Feature<Polygon | MultiPolygon>
}

export type Kita = 'Avrupa' | 'Asya' | 'Afrika' | 'Kuzey Amerika' | 'Güney Amerika' | 'Okyanusya'

interface RawWorld {
  geometri: Topology<{ countries: GeometryCollection }>
  hibrit: FeatureCollection<Polygon | MultiPolygon>
}

const world = raw as unknown as RawWorld

/** TopoJSON nesnesi → ülke listesi (meta veri geometriye iliştirilmiş hali) */
/** TopoJSON geometrisine iliştirilmiş küratör meta verisi (build-data.mjs yazar) */
type MetaHam = Omit<Country, 'shape'>

function ulkeleriCoz(topology: Topology<{ countries: GeometryCollection }>): Country[] {
  const geometriler = topology.objects.countries.geometries
  const metaAl = (g: (typeof geometriler)[number]): MetaHam | undefined => {
    const p = g.properties as { meta?: MetaHam } | null | undefined
    return p?.meta
  }
  return geometriler
    .filter((g) => Boolean(metaAl(g)))
    .map((g) => {
      const m = metaAl(g)!
      return { ...m, shape: feature(topology, g) as Country['shape'] }
    })
}

export const countries: Country[] = ulkeleriCoz(world.geometri)

// ── Sorgular ──────────────────────────────────────────────────────────────────

export const byAnahtar = new Map(countries.map((c) => [c.anahtar, c]))

const byIso3 = new Map<string, Country>()
const byTr = new Map<string, Country>()
for (const c of countries) {
  byIso3.set(c.iso3, c)
  byTr.set(c.tr, c)
  for (const a of c.takmaAdlar) byTr.set(a, c)
}

export const havuz: Country[] = countries.filter((c) => c.havuz)

/** Ülkeyi çeşitli yollarla bulur. Bulamazsa undefined. */
export function ulkeBul(anahtar: string): Country | undefined {
  return byAnahtar.get(anahtar) ?? byIso3.get(anahtar) ?? byTr.get(anahtar)
}

/** Bir ülkenin toleranslı kabul kümesi: kendisi + komşuları. */
export function kabulKumesi(c: Country): Set<string> {
  return new Set([c.anahtar, ...c.komsu])
}

/* ── Hit-test geometrisi ───────────────────────────────────────────────────
   Küre uzaktayken HİBRİT (110m gövde + 50m mikro-ülkeler), yakınlaştırınca
   50m detay ÇİZİLİR — ama isabet testi eskiden her zaman 50m `shape` ile
   yapılıyordu. Kıyıya yakın tıklamalarda görünen kara ile sayılan ülke
   teorik olarak ayrışıyordu (110m kıyı çizgisi 50m'den farklıdır).
   `gorselSekil` çizimde görüneni döndürür; `detayMi`, Globe'daki çizim
   eşiğiyle aynı olmalı (ekran yarıçapı ≥ YARICAP·3). */
const hibritHarita = new Map<string, Feature<Polygon | MultiPolygon>>()
for (const f of world.hibrit.features ?? []) {
  const a = (f.properties as { meta?: { anahtar?: string } } | null)?.meta?.anahtar
  if (a) hibritHarita.set(a, f)
}

/** Tıklama anında test edilecek şekil: uzaktayken hibrit, yakında tam detay.
 *  Hibritte karşılığı yoksa (küçük varyantta mikro-ülkeler) `shape`'e düşülür. */
export function gorselSekil(ulke: Country, detayMi: boolean): Feature<Polygon | MultiPolygon> {
  if (!detayMi) return hibritHarita.get(ulke.anahtar) ?? ulke.shape
  return ulke.shape
}

/** Kıtayı tolerantlı karşılaştırır (Türkiye: Asya da Avrupa da kabul). */
export function kitaEsit(cevap: string, hedef: Country): boolean {
  return cevap === hedef.kita || hedef.kitaAlt.includes(cevap as Kita)
}
