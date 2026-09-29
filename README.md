# Coğrafya Tahmin

Ülkeyi bir dünya küresinde bul, başkentini seç. Türkçe, tamamen çevrimdışı,
sunucusuz. React + TypeScript + Canvas.

![masaüstü](https://img.shields.io/badge/masaüstü-Chrome%20%2F%20Safari%20%2F%20Firefox-2c7a5b) ![durum](https://img.shields.io/badge/plan-tamamlandı-2c7a5b)

---

## Kurulum

```bash
npm install
npm run dev          # http://localhost:5180
```

Üretim derlemesi:

```bash
npm run build        # veri pipeline → tsc → vite
npm run preview
```

`npm run build` **her zaman** önce `build:data` çalıştırır. Veri dosyası elle
düzenlenmişse derleme onu yeniden üretir; elle `npm run build:data` çağırmaya
gerek yoktur.

Diğer komutlar:

| Komut | Ne yapar |
|---|---|
| `npm test` | Tip denetimi + 199 doğrulama (5 dosya) |
| `npm test isabet` | Sadece adı "isabet" ile eşleşen dosyalar |
| `npm run typecheck` | `tsc --noEmit` (testler dahil) |
| `npm run build:data` | Sadece veri pipeline'ını çalıştırır |
| `OLCEK=110m npm run build:data` | Küçük varyant — aşağıdaki "Küçük varyant" bölümüne bak |

> **Not:** Klasör adında Türkçe karakter varsa `npm init -y` çalışmaz.
> `package.json` içindeki ad ASCII'dir (`cografya-tahmin`) — sorun yok.

---

## Nasıl oynanır

1. Bir mod seç.
2. Küreyi sürükleyerek döndür, tekerlekle yakınlaştır.
3. Ülkeye tıkla → **Onayla**.
4. Başkent sorusunu cevapla (5 seçenek).

Klavye: `Enter` onaylar, `Esc` tıklamayı iptal eder.

### Modlar

| Mod | Tur | Ne yapar |
|---|---|---|
| **Kolay** | 10 | Ülke adı verilir, haritada bulursun |
| **Bayrağı Bul** | 10 | Gerçek SVG bayrak gösterilir |
| **Körlük** | 8 | İsim yok. İpuçları **kademeli** açılır, her biri puandan düşer |
| **Süreli Hız** | 20 | 60 saniyede bulabildiğin kadar |
| **Günün Ülkesi** | 1 | Her gün aynı ülke. Seri takip edilir, panoya kopyalanabilir |

### Puanlama (tur başına en fazla 175)

| Kalem | Puan |
|---|---|
| Konum | 0–100 (4000 km'de üstel düşüş) |
| Kıta | 25 (tam isabet) · 20 (doğru kıta, yanlış ülke) · 15 (komşu ülkede) |
| Başkent | 50 |
| Süre (yalnız Süreli Hız) | kalan saniye × 2 |
| İpucu (yalnız Körlük) | her ipucu 6–30 puan düşer |

Komşu ülkeye tıklamak **kabul edilir** ama ×0.7 kazanır. Puan sıfırın altına
düşmez: ceza ham puanı aşarsa kırpılır ve ekranda ikisi de gösterilir.

### Körlük modunun ipuçları

Sırayla açılır, ilki bedava:

| İpucu | Maliyet | Örnek |
|---|---|---|
| Kıta | ücretsiz | `Kuzey Amerika` |
| Konum | −6 | `ekvatorun kuzeyinde, batı yarımkürede` |
| Yaklaşık alan | −8 | `Minik bir ülke — yakınlaştırmak gerek` |
| Başkent | −12 | `8 harf · Mo······` |
| Komşular | −18 | `Gine, Fildişi Sahili, Sierra Leone` |
| Ad | −30 | `L·····a` |

### Neden bazı şeyler yapılmıyor

**Tıklamadan önce hiçbir bilgi sızmaz.** Tıkladığın ülkenin adı da, hedefe
uzaklığın da gösterilmez. Uzaklık gösterilseydi ikili aramayla hedefe
tıklardın — mesafe, "daha yakın" bilgisi demektir.

**Onayladıktan sonra geri dönülemez.** "Vazgeç" yalnızca onay öncesinde var.
Onay → cevabı gör → geri dön → yeniden dene halkası, oyunu çürütürdü.

**Haritada yazı yok.** Hiçbir etiket, ülke adı ya da başkent haritada
görünmez. Harita sadece şekiller.

---

## Klasör yapısı

```
data/
  raw/                    Natural Earth + world-atlas (indirilmiş, değiştirilmez)
  curated/
    countries.tr.json     ← elle yazılan 200 ülke kaydı
scripts/
  build-data.mjs          veri pipeline'ı + doğrulama
  test.mjs                test koşucusu (rolldown ile paketler, node'da çalıştırır)
tests/
  _yardim.ts              küçük doğrulama çerçevesi (ok/esit/toplu/ozet)
  veri.test.ts            200 ülkenin alan/geometri/bayrak bütünlüğü
  isabet.test.ts          isabet noktası + tam tıklama 100 puan + kırpma
  tiklanabilirlik.test.ts 193 ülke × 24 rotasyon, sarmalı kutu, limb reddi
  oyun.test.ts            puanlama, tolerans, seçenekler, ipuçları
  durum.test.ts           localStorage şeması, seri, yazım toleransı
src/
  lib/world.ts            world.json'u çözer, sorgular
  lib/projection.ts       küre matematiği (uzaklık, merkez, sarmalı kutu)
  game/types.ts           mod tanımları, Körlük ipuçları, günün ülkesi
  game/score.ts           puanlama
  game/basKentSecenekleri.ts  5 seçenek + zor çeldiriciler
  game/fuzzy.ts           normalizasyon + Damerau-Levenshtein
  game/useQuiz.ts         oyun durum makinesi
  game/storage.ts         localStorage, seri hesabı
  game/ses.ts             Web Audio sesleri
  components/Globe.tsx    canvas küre: çizim, sürükleme, zoom, tıklama
  App.tsx                 ekranlar ve akış
public/flags/             193 bayrak SVG (build'de kopyalanır)
```

---

## Veri pipeline'ı

`npm run build:data` şunları yapar:

1. `data/raw/` içindeki TopoJSON'ları okur (110m ve 50m).
2. `data/curated/countries.tr.json` ile **Natural Earth adı** üzerinden eşleştirir.
3. Doğrular — aşağıdakilerden biri olursa **derlemeyi durdurur**:
   - eşleşmeyen küratör anahtarı
   - yinelenen geometri
   - eksik alan
   - yinelenen ISO3
4. Hibrit geometri üretir: 110m'den 177 ülke + 50m'den 64 mikro-ülke.
5. Hazar Gölü'nü ayrı çıkarır (Natural Earth göl katmanlarında yok).
6. `flag-icons`'ten 193 bayrağı `public/flags/` altına kopyalar.
7. `src/data/world.json` yazar.

### Neden hibrit geometri?

50m verisinin tamamını her karede projekte etmek **34 ms** sürüyordu — 60 fps
bütçesinin (16.7 ms) iki katı. Sadece 110m kullanmak küçük ülkeleri
görünmez yapıyordu. İkisini birleştirip tam dünya projeksiyonunu **4.5 ms**'ye
indirdik; yakınlaştırıldığında 50m geometri devreye giriyor.

### Neden Canvas, SVG değil?

SVG'de her karede 1.000.000 karakterlik bir `d` yeniden ayrıştırılıyordu.
Canvas'a geçince kare süresi kare başına 2.7–7.4 ms aralığına indi.

### Küçük varyant (`OLCEK=110m`)

İsteğe bağlı küçük veri. 110m topolojisi mikro-ülkeleri (Monaco, San Marino, Vatikan,
Singapur…) içermez, o yüzden pipeline onları **uyarıyla** geçer ve havuzdan
düşürür — tam ölçekte aynı durum derlemeyi durdurur, çünkü orada yazım hatası
olurdu.

| | Tam (50m) | Küçük (110m) |
|---|---|---|
| `world.json` | 1134 KB | 455 KB |
| Soru havuzu | 193 ülke | 165 ülke |
| Oyunlanamayan | — | 28 mikro-ülke |
| Yakınlaştırmada detay | 50m'ye geçer | 110m'de kalır |

Küçük varyantta 28 mikro-ülke sorulamaz ve yakınlaştırınca kıyı çizgisi
pürüzsüzleşmez. Geri dönmek için `npm run build:data` (env'siz) çalıştır.

---

## Küratör tablosunu düzenlemek

`data/curated/countries.tr.json` dosyasındaki kayıtları düzenle, sonra
`npm run build:data` çalıştır.

```jsonc
"Turkey": {
  "iso3": "TUR",           // zorunlu, benzersiz
  "tr": "Türkiye",          // zorunlu, oyuncunun gördüğü ad
  "bas": "Ankara",         // zorunlu, doğru cevap
  "kita": "Asya",          // zorunlu
  "komsu": ["GRC","BGR"],  // zorunlu — ISO 3166-1 alpha-3
  "zorluk": 3,             // zorunlu, 1–5
  "alt": ["İstanbul"],     // opsiyonel — tam puanla kabul edilen alternatif başkentler
  "kitaAlt": ["Avrupa"],   // opsiyonel — sınır anlaşmazlıkları
  "bonusAlts": ["Türkiye"],// opsiyonel — %95 puanla kabul edilen yanlış yazımlar
  "_havuz": false          // opsiyonel — true ise sorulur
}
```

### Kurallar

- **Anahtar, Natural Earth adıyla birebir aynı olmalı.** `"Dem. Rep. Congo"`
  değil `"Dem. Rep. Congo"` — kısaltma, nokta, boşluk hepsi önemli.
  Doğru adı bulmak için `data/raw/countries-110m.json` dosyasındaki
  `objects.countries.geometries[].properties.name` değerlerine bak.
- `komsu` **alpha-3** kodları kullanır ve havuz dışı ülkeler için de yazılabilir
  (Güney Kore gibi). Çözülemeyen komşu sadece uyarı üretir, derlemeyi durdurmaz.
- `_not` ve `_` ile başlayan anahtarlar yorum sayılır.

### Doğrulama davranışı

Pipeline sessizce geçmez. Şunları yaparsan hata verir:

| Durup | Neden |
|---|---|
| Eşleşmeyen anahtar | Yazım hatası — ülke haritada yok |
| Yinelenen geometri | Aynı ülke iki kez tanımlanmış |
| Eksik alan | `bas`, `tr`, `kita`, `komsu` veya `zorluk` yok |
| Yinelenen ISO3 | İki ülke aynı kodu paylaşıyor |

Tek istisna: `OLCEK=110m` ile mikro-ülkelerin yokluğu hata değil uyarıdır
(bkz. "Küçük varyant").

### Bayraklar

Build, `flag-icons` paketindeki 4x3 SVG'leri `public/flags/` altına kopyalar ve
yolu meta veriye yazar. 193/193 ülkenin bayrağı var. Adlar farklı olduğu için
`build-data.mjs` içinde `BAYRAK_TAKMA` tablosu var (Türkiye → "Türkiye",
Vatikan → "Holy See", vs.).

Bayraklar `public/` altında olduğu için **bundle'a girmez** — tarayıcı soru
başına tek bayrak indirip önbelleğe alır. (Ortanca 0.36 KB gzip; en ağırı
Sırbistan 50 KB, tek seferlik.)

---

## Klavye

| Tuş | Etki |
|---|---|
| Sürükle | Küreyi döndür |
| Tekerlek | Yakınlaştır (imlecin altında) |
| `Enter` | Tıklamayı onayla |
| `Esc` | Tıklamayı iptal et |
| `🔊` / `🔇` | Ses efektlerini aç/kapat |

---

## Bilinen sınırlar

- **Masaüstü hedefli.** Dokunmatik sürükleme, pinch-zoom ve küçük ekran düzeni
  yapılmadı; telefon hedefi yok.
- **Görsel test yapılamadı.** Geliştirme ortamının tarayıcı penceresi gizli
  olduğu için Chrome `requestAnimationFrame`'i kısıtladı; gerçek fare
  sürüklemesi ve tekerlek yakınlaştırması gözle
  doğrulanamadı. Mantık ve piksel imzaları test edildi, gözle doğrulanmadı.
- **Yüzölçümü tahmini.** Körlük modundaki "yaklaşık alan" ipucu bounding box
  alanından hesaplanıyor, gerçek km² değil. Brezilya ile Arjantin gibi
  uzun ince ülkeler için biraz yanıltıcı olabilir.
- **Bayraklar harici dosya.** `public/flags/` silinirse Bayrağı Bul modu
  emoji'ye düşer (yedek tablo sadece 15 ülkeyi kapsıyor).

---

## Testler

```bash
npm test           # tip denetimi + tüm testler (~4 saniye)
npm test isabet    # sadece adı "isabet" ile eşleşen dosya
npm test -- --tip  # sadece tip denetimi
```

| Dosya | Kapsam | Doğrulama |
|---|---|---|
| `tests/veri.test.ts` | 200 ülkenin alan/geometri/bayrak bütünlüğü | 31 |
| `tests/isabet.test.ts` | `isabet` noktası, tam tıklama 100 puan, kırpma | 16 |
| `tests/tiklanabilirlik.test.ts` | 193 ülke × 24 rotasyon, sarmalı kutu, limb | 14 |
| `tests/oyun.test.ts` | Puanlama, tolerans, seçenekler, ipuçları | 61 |
| `tests/durum.test.ts` | localStorage şeması, seri, yazım toleransı | 77 |
| | **toplam** | **199** |

Testler de TypeScript ve `tsc` onları denetliyor. Node'un tip soyma özelliği
kaynak dosyalardaki uzantısız import'ları çözemediği için
(`Cannot find module .../lib/world`) `scripts/test.mjs` hepsini **rolldown**
ile paketleyip çalıştırıyor. rolldown zaten kurulu — Vite 8 onu kullanıyor,
yani projeye yeni bağımlılık eklenmiyor.

Paketlenmiş çıktı proje ağacının altına yazılıyor, çünkü `d3-geo` gibi
harici paketler çalışma anında `node_modules`'ten çözülüyor ve Node onları
sistem geçici klasöründen bulamıyor. Klasör koşucunun `finally` bloğunda
siliniyor ve `.gitignore`'da.

---

## Bilinen tuzaklar (testlerle sabitlendi)

Bunların hepsi ölçümle bulundu; testler artık geri gelmelerini yakalıyor.
Ayrıntılı anlatı: `PLAN.md` §6.

| Tuzak | Nasıl yakalandı |
|---|---|
| `geoCentroid` **alan** ağırlıklı, coğrafi değil — ada devletlerinde okyanusa düşer | 14 ülkede mükemmel tıklama 1–13 puan kaybediyordu; Kiribati 568 km, Fransa 399 km uzakta |
| Puanlama ve ipucu `centroid`'i kullanıyordu | `isabet` alanı eklendi; ölçülen kayıp 45 puan |
| `centroid` içerideyse `isabet` ona dokunmamalı | ABD 669 km, Kanada 246 km kayardı — mevcut adil davranış korundu |
| Sarmalanmış sınır kutusu (`bounds[0][0] > bounds[1][0]`) | ABD, Rusya, Yeni Zelanda, Kiribati kalıcı tıklanamazdı |
| `'İ'.toLowerCase()` birleşik nokta üretir | 8 harf → 9; `normalize("İstanbul")` 9 karaktere çıkıyordu |
| `AKISAN` tablosunda `í`, `ã`, `õ` eksikti | Brasília, Asunción, Bogotá, São Tomé, Nouméa, Yaoundé, Kudüs yanlış eşleşiyordu |
| "merkez noktası" ile "merkez antipodu" karışıyor | `rotate([0,0])` kimlik — antipot 0° çıktısı **hata değil**, doğru davranış |
| `zorluk: 6` havuz dışı ülkelerde | "sorulmaz" işareti — kasıtlı, ama `Country` tipi 1–5 diyor |
| `kutu` genişliği sarmalı ülkelerde negatif | ABD −239°, Yeni Zelanda −337° — `kutu > 100` karşılaştırmaları yanıltıcı |
| İki animasyon ayrı `setInterval` ile çalışıyordu | Küre hedefe giderken geri dönüyordu; kullanıcı sürüklemesi eziliyordu |
| `basKentSec` idempotent değildi | 5 senkron tıklama 5 tur sayıyordu |
| `sonTuruRef` bir *efektle* güncellenirse | Efektler iki tıklama arasında çalışmaz — aynı karede hâlâ `null` görünür |

## Lisans

Kod: özgür kullanım. Coğrafi veriler: [Natural Earth](https://www.naturalearthdata.com/)
(public domain). Bayraklar: [flag-icons](https://github.com/lipis/flag-icons) (MIT).
