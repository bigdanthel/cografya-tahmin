import { geoOrthographic, geoDistance, type GeoProjection } from 'd3-geo'
import type { Country } from './world'

/**
 * Küre projeksiyonu ve etkileşim yardımcıları.
 *
 * Kritik kurallar:
 *  - clipAngle 90 → yalnızca ön yarımküre çizilir, arka yarımküre hiç boyanmaz
 *  - invert() küre kenarında null döner; bu durumda rotasyon güncellenmez
 *  - Dünya yarıkürelerine bölünen ülkeler (Rusya, ABD, Fiji) için
 *    "hangi yarımkürede" sorusu ayrıca çözülür
 */

export const YARICAP = 150

/** Küre projeksiyonunun somut tipi — d3 zincirleme çağrılarında tip kaybını önler. */
export type KureProjeksiyonu = GeoProjection

export function olustur(): KureProjeksiyonu {
  return geoOrthographic().clipAngle(90).translate([0, 0]).scale(YARICAP).precision(0.3)
}

/**
 * Bir noktanın küre merkezine olan açısal uzaklığı (derece).
 *
 * d3-geo'nun rotate() işareti tuhaftır: `rotate([λ, φ])` çağrısından sonra
 * merkezde duran coğrafi nokta (λ, φ) DEĞİL, (-λ, -φ)'dir. Düz bir
 * "lon - lam" farkı bu yüzden yanlış sonuç verir (ölçüldü: 6 senaryonun
 * 5'inde hatalı). geoDistance küresel açıyı birebir hesaplar.
 */
export function merkezUzaklik(projeksiyon: KureProjeksiyonu, lonlat: [number, number]): number {
  return (geoDistance(bakisMerkezi(projeksiyon), lonlat) * 180) / Math.PI
}

/** Küre kenarına çok yakınsa tıklamayı reddet (yapay olarak tıklanamaz bölge) */
export const LIMB_ESIK = 12 // derece

export function limbteMi(projeksiyon: KureProjeksiyonu, lonlat: [number, number]): boolean {
  return merkezUzaklik(projeksiyon, lonlat) > 90 - LIMB_ESIK
}

/**
 * Ülkeyi kürenin merkezine getirmek için gereken rotasyon.
 *
 * d3-geo'da `rotate([λ, φ])` çağrısından sonra merkezde duran coğrafi nokta
 * (λ, φ) DEĞİL, (-λ, -φ)'dir. Bu yüzden hedef daima [-lon, -lat]'tir.
 * (Eski sürümde "görünmüyorsa 180 - lon" dalı vardı; o dal ülkeyi öne
 * getirmek yerine arkaya itiyordu.)
 *
 * KAYNAK `u.isabet`, `u.centroid` DEĞİL: centroid okyanusa düşebiliyor ve
 * "Yön İpucu" o zaman boş suyun ortasını gösteriyordu.
 */
export function hedefRotasyon(u: Country): [number, number] {
  const [lon, lat] = u.isabet
  return [-lon, Math.max(-75, Math.min(75, -lat))]
}

/** Rotasyonu hedefe doğru en kısa yoldan animasyonla taşır. */
export function rotasyonYolu(
  simdiki: [number, number],
  hedef: [number, number],
  kareSayisi: number,
): [number, number][] {
  const yol: [number, number][] = []
  let [lam0, phi0] = simdiki
  const [lam1, phi1] = hedef

  // En kısa boylam yolu: 190°'lik yol -170°'den daha kısa
  let dLon = ((lam1 - lam0 + 540) % 360) - 180
  for (let i = 1; i <= kareSayisi; i++) {
    const t = i / kareSayisi
    // Yumuşatma (ease-in-out)
    const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
    yol.push([lam0 + dLon * e, phi0 + (phi1 - phi0) * e])
  }
  return yol
}

/**
 * Projeksiyonun baktığı coğrafi nokta (küre merkezi).
 *
 * d3 `rotate([λ, φ])` çağrısından sonra merkezde duran coğrafi nokta
 * `(λ, φ)` DEĞİL, `(-λ, -φ)`'dir. Düz bir "lon - lam" farkı bu yüzden yanlış
 * sonuç verir (ölçüldü: 6 senaryonun 5'inde hatalı); `geoDistance` küresel
 * açıyı birebir hesapladığı için merkez nokta bu biçimde alınır.
 *
 * TUZAK — buradan bir ürün hatası sanıldı, kayıt altına alınsın:
 * "merkez noktası" ile "merkezin antipodu" karıştırılırsa hata çıkar.
 *   · merkez nokta    = (-λ, -φ)
 *   · merkez antipodu = (merkez_lon ± 180, -merkez_lat)
 * İkisi aynı şey DEĞİLDİR. `rotate([0,0])` kimlik olduğundan merkez (0,0)
 * kalır; `-lam` da (0,0) verir ve bu DOĞRU davranıştır. Ölçümle doğrulandı:
 * merkez ne olursa olsun gerçek antipodu tam 180° uzaktadır.
 */
export function bakisMerkezi(projeksiyon: KureProjeksiyonu): [number, number] {
  const [lam, phi] = projeksiyon.rotate()
  return [-lam, -phi]
}

/**
 * Bir noktanın sınır kutusuna en kısa açısal uzaklığı (derece).
 * Boylam sarmasını (antimeridian'ı geçen ülkeler) doğru hesaplar.
 *
 * Neden gerekli: sınır kutusu ORTALAMASI büyük ülkelerde işe yaramıyor.
 * Ölçüldü: ülke tam merkeze alındığında Rusya'nın kutu ortalaması 52°,
 * ABD 88°, Kiribati 176° uzağa düşüyor — yani ülke GÖRÜNÜRKEN eleniyordu
 * ve harita maviye dönüyordu. Bu fonksiyon kutunun EN YAKIN kenarına
 * uzaklığı verir, dolayısıyla ülkenin kenarına yakınlaşınca da tutar.
 */
export function kutuUzakligi(
  merkez: [number, number],
  bounds: [[number, number], [number, number]],
): number {
  const [bati, guney] = bounds[0]
  const [dogu, kuzey] = bounds[1]
  const [mLon, mLat] = merkez

  // Enlem: kutunun içindeyse 0, değilse en yakın kenara uzaklık
  const dLat = mLat < guney ? guney - mLat : mLat > kuzey ? mLat - kuzey : 0

  // Boylam: kutu bir yay olarak düşünülür (batıdan doğuya doğru)
  const normalize = (a: number): number => ((a % 360) + 360) % 360
  let dLon: number
  if (bati <= dogu) {
    dLon = mLon < bati ? bati - mLon : mLon > dogu ? mLon - dogu : 0
  } else {
    // Sarmalı: [bati, 180] ∪ [-180, dogu] → bati'den doğuya dogu+360'a uzanan yay
    const yay = 360 - bati + dogu
    const rel = normalize(mLon - bati)
    dLon = rel <= yay ? 0 : Math.min(rel - yay, 360 - rel)
  }

  // Boylam farkını o enlemdeki mesafeye çevir
  const ortaLat = (guney + kuzey) / 2
  return Math.hypot(dLat, dLon * Math.cos((ortaLat * Math.PI) / 180))
}
