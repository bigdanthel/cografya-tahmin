/**
 * Test koşucusu — testleri paketleyip Node'un yerleşik test çalıştırıcısında
 * koşar.
 *
 * Neden bir koşucu var: testler `.ts` olarak yazılıyor ve kaynak dosyalar
 * uzantısız import kullanıyor (`from '../lib/world'`). Node'un tip soyma
 * (type-stripping) özelliği hem bu uzantısız import'ları çözemiyor
 * ("Cannot find module .../world") hem de JSON import için öznitelik
 * istiyor. Kaynak dosyalara dokunmadan (dokunmak istemiyoruz — onlar Vite
 * için yazıldı) her şey paketlenip tek bir dosyaya bağlanıyor.
 *
 * Paketleyici olarak **rolldown** kullanılıyor: zaten kurulu (Vite 8 onu
 * kullanıyor), yani projeye yeni bağımlılık eklemiyoruz. d3-geo gibi
 * harici paketler dışarıda bırakılıyor — çalışma anında çözülüyorlar.
 *
 * Kullanım:
 *   npm test              # hepsi
 *   npm test isabet       # sadece adı "isabet" ile eşleşen dosyalar
 */

import { rolldown } from 'rolldown'
import { mkdtempSync, rmSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn, spawnSync } from 'node:child_process'


const KOK = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEST_DIR = join(KOK, 'tests')

const bayraklar = process.argv.slice(2)
const filtre = bayraklar.find((a) => !a.startsWith('-'))
const sadeceTip = bayraklar.includes('--tip')

/* ── Tip denetimi ──────────────────────────────────────────────────────────
   Testler de TypeScript. `tsc -b --noEmit` src/ ve tests/ altını tarıyor,
   yani test dosyasındaki bir tip hatası build'i de kırar. Testlere girmeden
   önce burada duruyoruz: hata varsa test çalıştırmak anlamsız. */
function tipDenetle() {
  console.log('── Tip denetimi (tsc --noEmit) ─────────────────────────')
  const sonuc = spawnSync('npx', ['tsc', '-b', '--noEmit'], { cwd: KOK, stdio: 'inherit' })
  if (sonuc.status === 0) console.log('   ✓ tip denetimi temiz\n')
  return sonuc.status === 0
}

if (sadeceTip) process.exit(tipDenetle() ? 0 : 1)
if (!tipDenetle()) {
  console.error('✗ tip denetimi başarısız — testler çalıştırılmıyor')
  process.exit(1)
}

const dosyalar = readdirSync(TEST_DIR)
  .filter((f) => f.endsWith('.test.ts'))
  .filter((f) => !filtre || f.includes(filtre))
  .sort()

if (dosyalar.length === 0) {
  console.error(`Test dosyası bulunamadı: ${filtre ?? '(tümü)'}`)
  process.exit(1)
}

/* Paketlenmiş çıktı PROJE İÇİNE yazılıyor, sistemin geçici klasörüne
   değil: d3-geo gibi dışarıda bıraktığımız paketler çalışma anında
   node_modules'ten çözülüyor ve Node onları ancak proje ağacı altından
   bulabiliyor. (Geçici klasörde denendi → ERR_MODULE_NOT_FOUND.) */
const gecici = mkdtempSync(join(KOK, '.test-gecici-'))
let basarisiz = false
const sureler = []

try {
  for (const dosya of dosyalar) {
    const cikti = join(gecici, dosya.replace(/\.ts$/, '.mjs'))
    // d3-geo vb. dışarıda: çalışma anında node_modules'tan çözülür
    const paket = await rolldown({
      input: join(TEST_DIR, dosya),
      external: [/^d3-/, /^topojson-/],
      platform: 'node',
    })
    await paket.write({ file: cikti, format: 'esm' })
    await paket.close()

    console.log(`\n${'━'.repeat(64)}\n  ${dosya}\n${'━'.repeat(64)}`)
    const baslangic = Date.now()
    const kod = await new Promise((coz) => {
      const alt = spawn(process.execPath, [cikti], { stdio: 'inherit' })
      alt.on('close', (c) => coz(c ?? 1))
      alt.on('error', () => coz(1))
    })
    const sure = Date.now() - baslangic
    sureler.push({ dosya: dosya.replace('.test.ts', ''), sure, kod })
    if (kod !== 0) basarisiz = true
  }
} finally {
  if (existsSync(gecici)) rmSync(gecici, { recursive: true, force: true })
}

console.log(`\n${'═'.repeat(64)}`)
console.log('  Süreler:')
for (const s of sureler.sort((a, b) => b.sure - a.sure)) {
  console.log(`    ${s.dosya.padEnd(18)} ${(s.sure / 1000).toFixed(2)}s  ${s.kod === 0 ? '✓' : '✗'}`)
}
const toplamSure = sureler.reduce((t, s) => t + s.sure, 0)
console.log(`    ${'toplam'.padEnd(18)} ${(toplamSure / 1000).toFixed(2)}s\n`)

if (basarisiz) {
  console.log('✗ bazı test dosyaları BAŞARISIZ')
  process.exit(1)
}
console.log(`✓ ${dosyalar.length} test dosyasının hepsi geçti`)
