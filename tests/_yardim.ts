/**
 * Test yardımcıları — küçük doğrulama çerçevesi.
 *
 * Node'un yerleşik `node:test` yerine bunu kullanıyoruz çünkü:
 *  - Türkçe başlıklar ve okunur hata çıktısı istiyoruz
 *  - Bir doğrulama başarısız olduğunda TÜM sebepleri tek yerde toplamak
 *    istiyoruz (193 ülke × 24 rotasyon gibi toplu kontrollerde ilk hatada
 *    durmak teşhisi zorlaştırıyor)
 */

let gecti = 0
const hatalar: string[] = []
let bolum = ''

export function baslik(ad: string): void {
  bolum = ad
  console.log(`\n── ${ad} ${'─'.repeat(Math.max(0, 58 - ad.length))}`)
}

export function ok(kosul: boolean, ad: string, ayrinti = ''): boolean {
  if (kosul) {
    gecti++
    if (ayrinti) console.log(`   ✓ ${ad}${ayrinti ? `  ${ayrinti}` : ''}`)
    return true
  }
  const sat = `   ✗ ${ad}${ayrinti ? `  ${ayrinti}` : ''}`
  hatalar.push(`${bolum} → ${sat.trim()}`)
  console.log(sat)
  return false
}

export function esit<T>(a: T, b: T, ad: string): boolean {
  return ok(Object.is(a, b), ad, a === b ? '' : `beklenen ${String(b)}, gelen ${String(a)}`)
}

/** Kayan nokta toleranslı karşılaştırma. */
export function yakin(a: number, b: number, tolerans = 1e-6, ad = ''): boolean {
  return ok(Math.abs(a - b) <= tolerans, ad, Math.abs(a - b) <= tolerans ? '' : `${a} ≠ ${b}`)
}

/** Koşullu başlık — koşul sağlanmıyorsa atlanır. */
export function kosul(sa: boolean): void {
  if (!sa) bolum += ' (atlandı)'
}

/** Toplu kontrol: `u` her eleman için `dogrula(eleman)` çalıştırılır.
    Boşsa veya hepsi geçtiyse tek satır "✓ n/N" basar. */
export function toplu<T extends { ad: string }>(
  etiket: string,
  elemanlar: T[],
  dogrula: (e: T) => boolean,
  adet = 6,
): void {
  const basarisiz: string[] = []
  for (const e of elemanlar) {
    if (!dogrula(e)) basarisiz.push(e.ad)
  }
  ok(
    basarisiz.length === 0,
    `${etiket} (${elemanlar.length - basarisiz.length}/${elemanlar.length})`,
    basarisiz.length ? `başarısız: ${basarisiz.slice(0, adet).join(', ')}${basarisiz.length > adet ? ` +${basarisiz.length - adet}` : ''}` : '',
  )
}

export function ozet(): void {
  console.log(`\n${'═'.repeat(64)}`)
  if (hatalar.length === 0) {
    console.log(`✓ ${gecti} doğrulama geçti`)
    return
  }
  console.log(`✗ ${hatalar.length} doğrulama BAŞARISIZ (${gecti} geçti)\n`)
  for (const h of hatalar) console.log(`  ${h}`)
}

/** Test betiği bittiğinde çağrılır.
 *
 *  Çıkış kodu BURADA ayarlanmıyor: `process` Node tipi gerektiriyor ve projede
 *  `@types/node` kurulu değil (tarayıcı için yazılmış bir proje, ek bağımlılık
 *  istemiyoruz). Bunun yerine hata fırlatılıyor; `scripts/test.mjs` alt sürecin
 *  çıkış kodunu zaten okuyor. */
export function bitir(): void {
  ozet()
  if (hatalar.length) throw new Error(`${hatalar.length} doğrulama başarısız`)
}
