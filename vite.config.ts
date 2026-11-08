import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/* Barındırma tabanı — GitHub Pages proje sayfası kökte DEĞİL, alt yolda
   yayınlanır (bigdanthel.github.io/cografya-tahmin/). Taban yazılmazsa
   Vite asset URL'lerini köke yazar; alt yolda açılan sayfa index.html'e
   erişemez ve BOŞ sayfa kalır (ölçüldü: deploy'da boşluk).
   Geliştirme aynı '/'; barındırma derlemesi:
     TABAN=/cografya-tahmin/ npm run build
   Bayrak yolunun göreceli olması şart — bkz. build-data.mjs. */
const TABAN = process.env.TABAN ?? '/'

export default defineConfig({
  base: TABAN,
  plugins: [react()],
  server: { port: 5180, open: false },
  build: { target: 'es2022' },
})
