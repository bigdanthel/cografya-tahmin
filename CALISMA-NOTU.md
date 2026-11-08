# Çalışma Notu

Bu dosya, oturumdan bağımsız olarak bilinmesi gerekenleri toplar.
Kodla ilgili her şey `README.md` ve `PLAN.md`'de.

---

## Bu ortamda neler yapılabiliyor, neler yapılamıyor

**Tarayıcı penceresi görünür değil.** Bu yüzden Chrome
`requestAnimationFrame`'i kısmen kısıtlar ve `ResizeObserver` tam tetiklenmez.

| Yapılabilir | Yapılamaz |
|---|---|
| DOM okuma/yazma | Gerçek fare sürüklemesi |
| `dispatchEvent` ile sentetik olay | Gerçek tekerlek/pinch |
| Canvas piksel okuma (imza karşılaştırma) | Kullanıcının gördüğü şeyi görme |
| Konsol okuma, ölçüm, sayısal doğrulama | Görsel kalite değerlendirmesi |
| Uzun senaryoları otomatik oynatma | — |

**Sonuç:** etkileşimler *sentetik olaylarla* test ediliyor ve **sayısal
ölçümle** doğrulanıyor (piksel imzası, kara piksel sayısı, ülke bazlı sayaçlar).
Gözle test — sürüklemenin akıcılığı, yakınlaştırmanın hissi, büyük ülkelerin
gerçekten kaybolmadığının teyidi — **kullanıcının oynayarak yapması gerekiyor.**

---

## Ölçüm yöntemi: gözle bakma, say

Kullanıcı göremeyince tek yol sayısal kanıt üretmek. Bu oturumda işe yarayan
üç desen:

**1. Piksel imzası** — değişim var mı diye bakmak için:
```js
const imza = () => {
  const d = ctx.getImageData(x, y, 90, 90).data
  let h = 2166136261
  for (let i = 0; i < d.length; i += 53) { h ^= d[i]; h = Math.imul(h, 16777619) }
  return (h >>> 0).toString(16)
}
```
Tek kare çözünürlüğü **yetersiz** — 90×90'lik okyanus yaması dönüşte
değişmiyor. Küreyi ölçüyorsan tüm canvas'ı tara:
```js
const kara = () => {   // bej kara pikselleri — dönüşte kesin değişir
  const d = ctx.getImageData(0, 0, c.width, c.height).data
  let n = 0
  for (let i = 0; i < d.length; i += 32) {
    if (d[i] > 180 && d[i+1] > 160 && d[i+2] > 130 && d[i] > d[i+2] + 8) n++
  }
  return n
}
```

**2. Olay sırası** — animasyon yarışı gibi durumlar için kare kare imza dizisi
al, tekrar eden değer var mı bak. `A → B → A` deseni iki animasyonun
çakıştığını kanıtlar.

**3. Kayıtlı veriden say** — en güvenilir yol. 193 ülkeyi × 24 rotasyon
tarayıp her birinin tıklanabilirliğini ölçmek, ekrana bakmaktan kesin.

**4. Çizimi senkron tetikle** — sürükleme/animasyon çizimi `cizErtele`
ile rAF'e ertelenir; bu ortamda rAF kesik olduğundan piksel okuması
**eski kareyi** görür (sahte çelişkiler üretir). Ölçümden hemen önce:
```js
window.dispatchEvent(new Event('resize'))
```
`resize → olcekle → ciz()` zinciri senkron çalışır, okuma taze olur
(2026-11-08 gözle test turunda sürükleme yönü doğrulaması bu desenle
yapıldı: sola çekince merkez 35°E arazi, sağa çekince Körfez suyu).

> **Tuzak:** ölçümün kendisi hatalıysa ürün hatası sanılan sahte bulgular
> üretir. Bu oturumda üç kez oldu (normalize'a ham girdi, ASCII/UTF-8 kaynak
> adı, sınır ötesi boylam). Şüphede kalınca **önce ölçümü doğrula.**

---

## Görsel doğrulama yapılan işler (dünya.json'daki alanlar)

`src/data/world.json` build'de üretiliyor, içeriği kaynak kodda **görünmüyor**.
Kontrol etmek için:

```bash
node -e "
const w = require('./src/data/world.json')
const g = w.geometri.objects.countries.geometries.filter(x => x.properties?.meta).map(x => x.properties.meta)
console.log(g.length, 'ülke |', g.filter(m => m.isabet).length, 'isabet noktası |', g.filter(m => m.havuz).length, 'havuzda')
"
```

Sürüm kontrolünde **yok** (`.gitignore`) — her `npm run build`'de yeniden üretiliyor.

---

## Sık karşılaşılan tuzaklar

| Tuzak | Not |
|---|---|
| `geoCentroid` **alan** ağırlıklı | Coğrafi merkez değil. Ada devletlerinde okyanusa düşer → `isabet` alanı var |
| Klasör adında Türkçe karakter | `npm init -y` çalışmaz; `package.json` adı ASCII (`cografya-tahmin`) |
| Vite 8 esbuild kullanmıyor | **rolldown** kullanıyor. `npx esbuild` hâlâ çalışır ama projede kurulu değil |
| Node tip soyma uzantısız import çözemiyor | Test koşucusu rolldown ile paketliyor |
| Test çıktısı geçici klasöre yazılırsa | `d3-geo` çözülemez (`ERR_MODULE_NOT_FOUND`) — proje ağacına yaz |
| Anahtarlar ISO3 değil, **Natural Earth adı** | `world-atlas`'ta `Ashmore and Cartier Is.` ile aynı id çakışması var |
| `kita` alanı Türkçe | `'Asya'`, `'Avrupa'` — `'Asia'` aramak sessizce `undefined` verir |
| Türkçe değişken adları rolldown'da sorun çıkarabilir | Testlerde ASCII isimler kullan |

---

## Çalışma tercihi

Kullanıcı işleri **numaralı sırayla** verir ve sırayı bozmamayı ister
("önce ikinciyi yap, o bitince birinciyi yap"). Biten işi uçtan uca doğrula,
özetle, sonra **onay beklemeden sıradakine geçme**.

Değişiklik yapmadan önce ölç. "Görünüyor" deme, say.
