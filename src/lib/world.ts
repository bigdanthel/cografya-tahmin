import { feature } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import type { Feature, MultiPolygon, Polygon } from 'geojson'
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
  /** Tam puanla kabul edilen alternatif başkentler */
  alt: string[]
  /** %95 puanla kabul edilen yazımlar (örn. ülke adıyla yanlış) */
  bonusAlts: string[]
  kita: Kita
  /** Sınır anlaşmazlıklarında de kabul edilen alternatif kıta */
  kitaAlt: Kita[]
  /** Toleranslı puanlama için komşu ülke anahtarları */
  komsu: string[]
  zorluk: 1 | 2 | 3 | 4 | 5
  /** Soru havuzunda olup olmadığı */
  havuz: boolean
  /** `public/flags/` altındaki bayrak yolu; yoksa emoji'ye düşülür */
  bayrak: string | null
  /** [lon, lat] — ülkenin küre üzerindeki ağırlık merkezi (alan ağırlıklı).
      Uzak toprakları olan ülkelerde bu OKYANUSA düşebilir (Fransa, Kiribati,
      Malezya, Norveç…). Ölçüldü: 200 ülkenin 26'sında geometri dışında. */
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
  /** Küreyi iki yarıya bölen ülke (Rusya, ABD, Fildişi Sahili…) */
  yarikure?: boolean
  /** Coğrafi şekil — runtime'da üretilir */
  shape: Feature<Polygon | MultiPolygon>
}

export type Kita = 'Avrupa' | 'Asya' | 'Afrika' | 'Kuzey Amerika' | 'Güney Amerika' | 'Okyanusya'

export interface Lake extends Feature<Polygon | MultiPolygon> {
  properties: { ad: string | null }
}

interface RawWorld {
  olcek: string
  uretim: string
  geometri: Topology<{ countries: GeometryCollection }>
  gol: Lake[]
  hazar: Feature<Polygon | MultiPolygon>[]
}

const world = raw as unknown as RawWorld

/** TopoJSON nesnesi → ülke listesi (meta veri geometriye iliştirilmiş hali) */
/** TopoJSON geometrisine iliştirilmiş küratör meta verisi (build-data.mjs yazar) */
interface MetaHam extends Omit<Country, 'shape'> {}

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

export const lakes: Lake[] = world.gol
export const hazar: Feature<Polygon | MultiPolygon>[] = world.hazar
export const olcek: string = world.olcek
export const uretim: string = world.uretim

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

/** Kıtayı tolerantlı karşılaştırır (Türkiye: Asya da Avrupa da kabul). */
export function kitaEsit(cevap: string, hedef: Country): boolean {
  return cevap === hedef.kita || hedef.kitaAlt.includes(cevap as Kita)
}
