# Coğrafya Tahmin — Plan Dokümanı

> Bir web oyunu: ülkenin adı (veya bayrağı) söylenir, kullanıcı **dünya küresi üzerinde**
> doğru yeri bulup tıklar ve **başkentini 5 seçenekten seçer**. Tamamen çevrimdışı çalışır.

**Durum:** V1 oynanabilir · **Güncelleme:** 2026-09-29
**Bu belge artık yaşayan bir belgedir:** aşağıdaki "Değişiklikler" bölümü, planın
uygulama sırasında neden değiştiğini kayda geçirir. Yeni kararlar buraya eklenir.

---

## 1. Kararlar (güncel)

| Konu | Karar | Durum |
|---|---|---|
| Framework | React 19 + TypeScript (strict) + Vite | Uygulandı |
| Harita kütüphanesi | `d3-geo` (`geoOrthographic`) + `topojson-client` | Uygulandı |
| Render | **Canvas** — SVG değil | Değişti, bkz. §6.1 |
| Projeksiyon | Döndürülebilir dünya küresi | Uygulandı |
| Etkileşim | Sürükleyerek döndür + tekerlekle yakınlaştır (imleç altında sabit) | Uygulandı |
| Görsel dil | Arazi bej, sınırlar siyah, su mavi, **haritada hiçbir yazı yok** | Uygulandı |
| Puanlama | Mesafeye bağlı kısmi puan (`geoDistance` + üstel azalma) | Uygulandı |
| Başkent girişi | **5 seçenekli çoktan seçmeli**, 3'ü kasıtlı zor | Değişti, bkz. §6.2 |
| Soru havuzu | **193 bağımsız devlet** (Antarktika hariç) | Uygulandı |
| Sınır anlaşmazlıkları | Tolerantlı — komşu ülkeye tıklamak da kabul (×0.7) | Uygulandı |
| V1 modları | Kolay · Bayrağı Bul · Körlük · Süreli Hız · Günün Ülkesi | Uygulandı |
| Körlük ipuçları | **Kademeli**: ilki bedava, her biri 6–30 puan düşer | Uygulandı |
| Bayrak görselleri | `flag-icons` 4x3 SVG → `public/flags/` (build kopyalar) | Uygulandı |
| Ses | Web Audio ile üretilen tonlar, harici dosya yok, aç/kapa düğmesi | Uygulandı |
| Günün Ülkesi serisi | `dailyGecmisi` + tarih sıralı seri, panoya kopyalanabilir metin | Uygulandı |
| Backend | Yok. Tek `localStorage` anahtarı (`cografya.v1`) + ses tercihi | Uygulandı |
| Platform | Masaüstü (Chrome/Safari/Firefox) | Uygulandı |
| Dil | Arayüz + ülke adları + başkent adları Türkçe | Uygulandı |

**Eksik olan kararlar:** yok — yol haritasındaki maddelerin hepsi kapandı.

---

## 2. Veri

### 2.1 Kaynaklar

| Veri | Kaynak | Lisans |
|---|---|---|
| Ülke geometrisi | [world-atlas](https://github.com/topojson/world-atlas) 50m + 110m | Public domain |
| Göller | Natural Earth `ne_110m_lakes` + 50m'den seçici | Public domain |
| **Hazar Denizi** | Natural Earth `ne_50m_geography_marine_polys` | Public domain |
| Türkçe isimler + başkentler | **Elle küratörlenmiş tablo** (§2.3) | — |
| Bayraklar | `flag-icons` 4x3 SVG → `public/flags/` (build kopyalar) | Uygulandı |

> **Hazar Denizi neden ayrı?** Natural Earth'in göl katmanlarında **yok** —
> ancak `geography_marine_polys` katmanında bulundu. Ayrı dosyaya çıkarıldı.
> (Deniz geometrisi hiç kullanılmıyor: kürenin kendisi deniz.)

### 2.2 Ölçek kararı (başlangıçta 110m, sonra 50m)

110m'de mikro-ülkeler (Singapur, Monako, Malta, Vatikan) **hiç yok** — soru
havuzundan düşüyorlardı. Tam 50m ise bir karede 34ms sürüyordu (60fps bütçesinin
iki katı).

Çözüm: **hibrit geometri.** 177 ülke @110m + 64 mikro-ülke @50m = 1.696 ek nokta.
Tam dünya projeksiyonu **4.5ms**'ye düştü, tüm ülkeler görünür kaldı.

```
Zoom < 3×  → hibrit geometri (110m gövde + mikro-ülkeler)
Zoom ≥ 3×  → ekrana sığan ülkeler 50m detayıyla
```

| Zoom | Ülke sayısı | Süre |
|---|---|---|
| 1× | 241 | 5.7ms |
| 3× | 75 | 7.4ms |
| 8× | 44 | 2.9ms |
| 100× | 41 | 2.7ms |

### 2.3 Küratör tablo şeması (gerçek)

`data/curated/countries.tr.json` · **200 kayıt**, 193'ü soru havuzunda.

> **Anahtar = Natural Earth'deki ülke adıyla BİREBİR aynı olmalı.**
> (ISO sayısal kod DEĞİL — world-atlas'ta `Ashmore and Cartier Is.` yanlışlıkla
> Avustralya'nın id'si `036` ile çakışıyor. Ad anahtarı bu tuzağı doğal çözer.)

```jsonc
"Turkey": {
  "iso3": "TUR",           // 200/200 — zorunlu
  "tr": "Türkiye",          // 200/200 — zorunlu
  "bas": "Ankara",          // 200/200 — zorunlu
  "kita": "Asya",           // 200/200 — zorunlu
  "komsu": ["GRC", ...],    // 200/200 — ISO alpha-3; zorunlu (boş olabilir)
  "zorluk": 1,              // 200/200 — 1..5
  "alt": ["İstanbul"],      // 83 kayıt — tam puanla kabul edilen başkentler
  "bonusAlts": [],          // 2 kayıt — %95 puanla kabul
  "kitaAlt": ["Avrupa"],    // 5 kayıt — sınır geçişçi (Türkiye, Rusya, Kıbrıs…)
  "_havuz": false,          // 7 kayıt — soru havuzunda olmasın
  "_not": "..."             // 8 kayıt — insan notu, çıktıya sızmaz
}
```

Havuz dışı: Cayman Adaları, Cook Adaları, Curaçao, Falkland Adaları,
Yeni Kaledonya, Saint Helena, **Batı Sahra** (komşulukta tolerantlı kabul edilir).

Politik kararlar veri dosyasında görünür: **Kıbrıs havuzda**, K.Kıbrıs ve
Somaliland değil, Kosova ve Tuvalu soru havuzunda yok (Tuvalu geometride bile yok).

### 2.4 Build pipeline

```bash
npm run build:data    # data/raw + data/curated → src/data/world.json
```

**SERT doğrulama** — çıktı üretilmeden hata verir:
- Küratördeki her anahtar topology'de birebir bulunmalı
- İki kayıt aynı geometriye düşemez
- Eksik alan (`iso3`/`tr`/`bas`/`kita`/`komsu`/`zorluk`) hata
- `iso3` tekrarı hata
- `caspian.json` **YAML** — gelmiyorsa o ülke havuzdan düşer

**Bayrak kopyalama** — `flag-icons`'ten havuzdaki her ülke için 4x3 SVG
`public/flags/` altına yazılır, yol meta veriye girer. `BAYRAK_TAKMA` tablosu
ad farklarını çözer (22 kayıt).

**Küçük varyant** — `OLCEK=110m` ile mikro-ülkelerin yokluğu hata değil
uyarıdır ve `hibrit` düz 110m olarak üretilir. Bkz. §6.6.

Çıktı: `src/data/world.json` · 1134 KB ham / **306 KB gzip**
(Hibrit GeoJSON 3 ondalığa yuvarlanır: kuantize edilmemiş float'lar dosyayı
455 KB'ye çıkarıyordu.)

---

## 3. Küre etkileşimi

### 3.1 Döndürme — küre "spin"

Rotasyon her karede **sürükleme başındaki** rotasyona + o ana kadarki **toplam**
sürükleme mesafesi uygulanarak hesaplanır.

```ts
dLam = (toplamDx / zoomK / 150) * (180/π)
dPhi = (toplamDy / zoomK / 150) * (180/π)
rotate = [basRotasyon[0] - dLam, clamp(basRotasyon[1] + dPhi, ±85)]
```

Kümülatif olduğu için kare hızından bağımsızdır; **ölçüldü: sapma 0.000°**
(1px–3px adım boyutlarında, tüm konumlarda).

> ❌ **Yapılmayan:** her karede iki noktayı ayrı rotasyonlarla invert edip fark almak.
> Kendi kendini besleyen bir döngü kurup küreyi yerinde salındırıyor.
> ❌ **Yapılmayan:** kare başına delta'yı sabit tabana eklemek — dönüş birikmiyor.

### 3.2 Yakınlaştırma — canvas transform

Zoom projeksiyon ölçeğini değil, **canvas transform'unu** değiştirir
(`ctx.translate(cx+zoom.x, cy+zoom.y); ctx.scale(zoom.k, zoom.k)`).
Böylece imlecin altındaki coğrafi nokta kaymaz ve **hiçbir lineer olmayan çözüm
gerekmez** (Newton denendi, kenarda 100px sapıyor).

- Duyarlılık üstel: `k = k · exp(-deltaY · 0.008)` → fare tığı ≈ **2.2×** (1×'ten 12×'e 4 tık)
- Aralık **0.85× – 100×** (Vatikan 0.5° genişlikte 42px olur; 22×'te 9px'ti)
- Çizgi kalınlıkları `1/k` ile ölçeklenir → ekranda sabit

### 3.3 Çözülen problemler

| # | Problem | Durum |
|---|---|---|
| 1 | Küre kenarında `invert()` null döner | ✅ Korunuyor |
| 2 | Doğru ülke kürenin arkasında kalır | ✅ **Çözüldü** — "Karşı Yarıküre" 180° çevirme düğmesi |
| 3 | Limb'e yakın tıklama yanlış yere düşer | ✅ Reddediliyor + kullanıcı uyarısı (12° eşiği) |
| 4 | Limb artefaktı (düz kesik kenar) | ✅ `clipAngle(90)` + küre kenarı halkası |
| 5 | Cevabı göstermek | ✅ `rotate([-lon, -lat])` + 46 karelik yumuşak animasyon + en fazla 6× yakınlaştırma |

> **"Karşı Yarıküre" neden ayrı uygulandı?** `rotasyonYolu` 180°'yi "en kısa
> yola" çekip yönü atıyordu; bilinçli bir 180° dönüş için ayrı ve doğrudan
> interpolasyon yazıldı (54 kare, ease-in-out). Düğme **cevabı vermez** —
> sadece bakılan yarımküreyi değiştirir, kullanıcı yine kendi bulur.
> Tarayıcıda piksel imzasıyla doğrulandı: bir basışta diğer yarımküre,
> ikinci basışta tam başlangıç konumu.

> ⚠️ **d3 işareti tuzağı:** `rotate([λ, φ])` çağrısından sonra merkezde duran
> coğrafi nokta `(λ, φ)` **değil**, `(-λ, -φ)`'dir. Merkez uzaklığı düz farkla
> hesaplanırsa 6 senaryonun 5'inde yanlış sonuç verir; `geoDistance([-λ,-φ], p)`
> kullanılmalıdır. Bir de "görünmüyorsa `180 - lon`" dalı ülkeyi öne değil **arkaya**
> itiyordu (1000 senaryonun 446'sı yanlıştı). Her zaman `-lon`.

### 3.4 Hit-test

Tıklamada, 200 ülkeyi sırayla `geoContains` ile taramak yerine:
1. Sınır kutusu ön filtresi (+1° pay)
2. Yalnızca adaylar için `geoContains`

> ⚠️ **Sarmalanmış sınır kutusu:** antimeridian'ı geçen ülkelerde
> `bounds[0][0] > bounds[1][0]` olur (ABD, Rusya, Yeni Zelanda, Kiribati).
> `lon >= bati && lon <= dogu` kontrolü bu durumda **hiç geçmez** — o ülkeler
> kalıcı olarak tıklanamaz olur. Sarmalı durumda `||` ile kontrol edilir.

### 3.5 Görünürlük kırpma (zoom ≥ 3×)

Ülke ya **alan merkezine** yakınsa ya da **sınır kutusuna** en kısa uzaklığı küçükse
tutulur (`kutuUzakligi`, boylam sarmasını hesaplar).

> ⚠️ **Tek başına kutu ORTALAMASI devasa ülkeleri eler:** ölçüldü — ülke tam
> merkezdeyken Rusya 52°, ABD 88°, Kiribati 176° "uzakta" sayılıyor, harita
> maviye dönüyordu. Doğrulama: 193 ülke × 5 zoom = 965 senaryo, 0 kaybolma.

---

## 4. Oyun motoru

### 4.1 Puanlama (toplam 175)

```ts
uzaklikKm = geoDistance(tiklama, hedefMerkez) × 6371
konum     = round(100 × exp(-uzaklikKm / 4000))    // üstel azalma
```

| Durum | Puan |
|---|---|
| Konum (mesafeyle) | 0–100 |
| Tam ülke isabeti — kıta puanı | +25 |
| Aynı kıta, yanlış ülke | +20 |
| Toleranslı (komşu ülke) — kıta puanı | +15 |
| Yanlış kıta | +0 |
| Denize tıklamada konum tavanı | 20 |
| Başkent (doğru seçim) | +50 |
| Süre bonusu (Süreli Hız) | + kalan sn × 2 |
| Toleranslı kabul | puan × 0.7 |
| Başkenti atlama | +0 (tur yine kapanır) |
| **Körlük ipucu** (yalnız Körlük modu) | **−6 … −30, ham puanı aşamaz** |

> **İpucu cezası tavana çarpar.** Ceza ham puanı aşamaz (toplam eksi olmaz).
> Kırpıldığında ikisi de saklanır ve ekranda yazılır ("istenen −74, puan
> sıfırına düştüğü için −15") — aksi halde oyuncu 5 ipuç isteyip yalnızca
> −15 görünce ne olduğunu anlamıyordu.

### 4.3 Körlük modu — kademeli ipuçlar

Önceden bütün ipuçları bir anda dökülüyordu: kıta + başkentin ilk harfi +
komşular + alan. İlk iki ipuç çoğu ülkede tek başına çözdüğü için oyunun
"keşif" tadı kalmıyordu.

Şimdi **sırayla, ücretli** açılıyor. Sıralama "en az bilgi verenden":

| # | İpucu | Maliyet | Örnek |
|---|---|---|---|
| 1 | Kıta | **ücretsiz** | `Kuzey Amerika` |
| 2 | Konum | −6 | `ekvatorun kuzeyinde, batı yarımkürede` |
| 3 | Yaklaşık alan | −8 | `Minik bir ülke — yakınlaştırmak gerek` |
| 4 | Başkent | −12 | `8 harf · Mo······` |
| 5 | Komşular | −18 | `Gine, Fildişi Sahili, Sierra Leone` |
| 6 | Ad maskesi | −30 | `L·····a` |

> **Konum ipucu neden en değerlisi?** Kıtayı zaten biliyorsan ilk ipucu işe
> yarıyor; bilmiyorsan zaten ilk ipucu sana söylüyor. Konum ipucu ise ikisini
> birden tamamlıyor ve iki yarımküreyi ayırt ettiriyor.

**Sızıntı denetimi:** 193 ülkenin hiçbirinde, "Ad" dışındaki hiçbir ipuç
ülkenin adını kelime sınırında içermiyor. Tek istisna **Kongo Cumhuriyeti** —
adı zaten "Kongo Cumhuriyeti (DR Kongo)" komşu adının içinde geçiyor, yani
kaçınılmaz. Doğrulama: kelime sınırı + regex, alt dize eşleşmesi değil
(Nijer'in komşusu "Ni**jer**ya" — farklı ülke, alt dize testi yanlış alarm
üretiyordu).

Doğrulama: 193 ülke × tüm ipuçları = boş değer yok, yinelenen etiket yok,
maliyetler artan sırada, ilk ipucu bedava. Ülke başına 5–6 ipuç.

### 4.2 Başkent sorusu — 5 seçenek, 3 zor

193 ülke için elle yanıltıcı yazmak imkânsız; hepsi **veriden türetiliyor**:

1. **Komşu ülkelerin başkentleri** — coğrafi karışıklık
2. **Yazım benzerliği ≥ %62 ve mesafe ≤ 4** — ses karışıklığı
   (Kingstown↔Kingston %89 · Bern↔Berlin %67 · Sana↔Astana %67 · Manila↔Manama)
3. **Coğrafi yakınlık** — ada ülkeler için (Vanuatu→Suva/Honiara/Yaren)

Doğrulama: 193 ülke × 5 tekrar = **965 soru, 0 hata.** Her birinde 5 seçenek,
1 doğru, 3 zor, metin tekrarı yok. Seçenekler **soru üretilirken** hazırlanır
(render'da değişmez), karıştırılır, metin bazında tekrar elenir.

Seçimden sonra şıklar **kalkmaz** — doğru cevap yeşil ✓, seçilen yanlış kırmızı ✕.

### 4.4 Hile koruması

Onay öncesi **hiçbir konum bilgisi sızdırılmaz**: tıklanan ülkenin adı yok,
mesafe yok. (Mesafe gösterilseydi ikili aramayla merkez bulunabilirdi.)

Onaydan sonra **geri dönüş kapalı** — yoksa "onayla → cevabı gör → geri dön →
tekrar dene" döngüsü oyunu çözüyordu. `Vazgeç` yalnızca **onay öncesinde** var.

### 4.5 Akış

```
oyun ──tıkla──▶ onaylı değil: [✓ Onayla] [✕ Vazgeç]
      │
      └──onayla──▶ cevap: doğru/yanlış + puan açıklanır
                      + başkent 5 seçeneği, [Başkenti atla]
                          │
                          └──▶ sonuç: tam puan + "Sıradaki →"
```

---

## 5. Modlar

| Mod | Tur | Süre | Notlar |
|---|---|---|---|
| **Kolay** | 10 | — | Ad + başkent seçimi |
| **Bayrağı Bul** | 10 | — | Gerçek SVG bayrak (`public/flags/`, 193/193) |
| **Körlük** | 8 | — | Kademeli ipuçlar (§4.3), her biri puandan düşer |
| **Süreli Hız** | 20 | 60 sn | Başkent sorusu **yok**; süre bitince tur kapanır |
| **Günün Ülkesi** | 1 | — | Tarih hash'i → deterministik ülke · seri takip edilir |

Soru havuzundan seçim: önce hiç sorulmamış **ve** daha önce doğru bilinmemiş ülkeler.

**Kalıcı durum:** `cografya.v1` →
`{ tur, puan, seri, enUzunSeri, dogru, ulkeBazli, daily, dailyGecmisi }`
· Ses tercihi ayrı anahtarda: `cografya.ses.v1`

### 5.1 Günün Ülkesi serisi

`dailyGecmisi` her gün için bir kayıt tutar (`"YYYY-AA-GG"` → sonuç). Seri
geriye doğru sayılır.

**Kural:** bugün oynanmışsa bugünden, oynanmamışsa **dün oynanmışsa dünden**
başlanır. Yani ertesi gün oynanmaya başlayınca seri ölmez — kullanıcı akşam
oynayıp sabah unuttuğunda rozet sıfırlanmış görünmemeli.

> **Tarih birliği (gerçek hata).** `gununUlkesi` `toISOString()` ile **UTC**
> gününü kullanıyordu, seri hesabı **yerel** günü. Türkiye'de gece yarısından
> sonra UTC hâlâ dünkü gösterdiği için ülke değişiyor ama streak "bugün"ü
> görmüyordu. İkisi de `bugun()`'a bağlandı (yerel). Doğrulama: 29 Eylül
> 02:00 yerel → yerel `2026-09-29`, UTC `2026-09-28` — ayrışma teyit edildi.

**Seri doğrulaması:** boş → 0 · bugün → 1 · 5 gün üst üste → 5 · bugün
oynanmadı + dün oynanmış → 5 korunur · 2 gün boşluk → 0 · kopuk günlar →
boşlukta durur · 40 gün → 40.

**Paylaşım:** metin olarak panoya kopyalanır (resim üretmiyor — her yerde
çalışır, kopyala-yapıştır). `navigator.clipboard` + eski `execCommand` yedeği.
Rozet eşiği: 7 gün ⭐️ · 30 gün 🏆.

**Seri doğru cevap verilse mi artar?** Hayır — oynanması yeterli (Wordle
mantığı). Paylaşım metninde başarısızlık `❌` ile görünür.

### 5.2 Ses

Web Audio API ile üretilen tonlar — **hiç ses dosyası yok**, paket boyutu sıfır.
Zarf (gain envelope) ile "tık" karakteri veriliyor, oyun hızlı ilerlediği için
her ses kısa ve yumuşak.

| Olay | Ses |
|---|---|
| Haritaya tıklama | 420 Hz sine |
| Düğme / seçenek | 620 Hz triangle |
| Doğru cevap | D5 → A5 yükseliş |
| Yanlış cevap | Bb2 alçalan |
| Sınırda kabul | A4 → yarım ton aşağı |
| Tur bitti | C5 → E5 → G5 |
| Oyun bitti | C5 → G4 düşüş |
| Küre kenarı | 160 Hz kısa |

> **Tarayıcı politikası:** `AudioContext` yalnızca kullanıcı etkileşimi
> sonrasında kurulabilir. Bu yüzden `hazirla()` her sesin içinden çağrılıyor
> (ilk ses bir tıklamadan geldiği için bağlam o anda kurulur) — ayrıca
> çağırmak zorunlu değil. Askıya alınmış sekmede `resume()` deniyor.
> Tercih `cografya.ses.v1`'e yazılıyor.

---

## 6. Uygulama sırasında değişen kararlar

### 6.1 SVG → Canvas

*Başlangıç ölçümü:* kara katmanı tek bir path olarak **1.000.000 karakter**
uzunluğundaydı ve tarayıcı her karede bu string'i yeniden ayrıştırıyordu.
200 hit path'i de her karede yeniden hesaplanıyordu.

Canvas'a geçildi → raster maliyeti 0.1ms.

> ⚠️ **İlk teşhis yanlıştı:** Canvas'a geçince de kasma sürdü. Gerçek sebep
> render backend'i değil, **50m geometriyi yeniden projekte etmenin 34ms
> sürmesiydi** (§2.2 hibrit çözümü).

### 6.2 Yazma → çoktan seçmeli

Kullanıcı isteğiyle değişti. Serbest yazma + fuzzy onay önerisi yerine
5 seçenek + 3 zor yanıltıcı geldi.

`fuzzy.ts` silinmedi — **distraktör seçiminde** kullanılıyor. Yazma modu
ileride "Uzman" modu olarak geri eklenebilir.

### 6.3 Düzeltilen gerçek hatalar (19)

| # | Hata | Etki |
|---|---|---|
| 1 | Sarmalanmış sınır kutusu → ön filtre | **4 ülke kalıcı tıklanamaz** |
| 2 | Kutu ortalamasıyla kırpma | **Ülkeler haritadan kayboluyor** (Rusya mavi) |
| 3 | `cancelAnimationFrame` sonrası ref boşalmamış | Sürükleme/zoom kalıcı ölü |
| 4 | `onTikla` her render'da yeniden kayıt | Dinleyiciler her turda sökülüyor |
| 5 | Damerau-Levenshtein'de fazladan `t` matrisi | **Yazım toleransı bozuk** (`sana`↔`bandarseribegawan` = 1) |
| 6 | d3 `rotate()` işareti ters uygulanmış | **1000 senaryonun 446'sı yanlış yere** |
| 7 | `'İ'.toLowerCase()` birleşik nokta üretir | 8 harf → 9 harf |
| 8 | Süre bitince `asama` değişmiyor | **Süreli Hız sonsuza dek oynanabiliyor** |
| 9 | `limbde` hesaplanıp atılıyor | Küre kenarı tıklaması reddedilmiyor |
| 10 | `pointercancel` `donuyorRef`'i temizlemiyor | Sonraki tıkama yutuluyor |
| 11 | Sürükleme `pointerId` ile kilitli değil | İkinci imleç küreyi zıplatıyordu |
| 12 | `KITA_PUAN_TAM` hiç kullanılmıyor | Aynı kıta 15 yerine 20 olmalıydı |
| 13 | `gununUlkesi` UTC, seri hesabı yerel tarih | Gece yarısından sonra ülke değişiyor, streak görmüyor |
| 14 | `OLCEK=110m` mikro-ülkelerde doğrulamaya takılıyordu | Varyant **hiç üretilemiyordu** |
| 15 | Küçük varyantta `hibrit` alanı `null` yazılıyordu | Derleme geçiyor, uygulama küreyi çizemiyordu |
| 16 | Puanlama ve ipucu `centroid`'i kullanıyordu | **14 ülkede mükemmel tıklama 1–13 puan kaybediyordu**, ipucu okyanusu gösteriyordu |
| 17 | "Yön İpucu" ve "Karşı Yarıküre" ayrı `setInterval` ile animasyon yapıyordu | Aynı anda basılınca **küre titriyor**, hedefe giderken geri dönüyordu |
| 18 | Animasyon, kullanıcı sürüklemesini/tekerleğini ezdiyordu | Küre bırakınca **geri çekiliyor**, kullanıcının girdisi kayboluyordu |
| 19 | `basKentSec` / `devamEt` idempotent değildi | Aynı karede gelen tıklamalar **turu 5 kez sayıyor**, soruyu 5 atlatıyordu |

### 6.4 Emoji bayrak → gerçek SVG

Emoji tablosu yalnızca **60 ülkeyi** kapsıyordu; geri kalan 133 ülke hep "boş
bayrak" (🏳) gösteriyordu — Bayrağı Bul modunu fiilen bozuyordu.

`flag-icons` paketindeki 4x3 SVG'ler build'de `public/flags/` altına
kopyalanıyor. **22 takma ad** gerekti (`flag-icons` İngilizce adları Natural
Earth'den farklı): Türkiye'nin kaydı "Türkiye", Vatikan'ınki "Holy See" olarak
duruyor. 193/193 çözüldü.

**Maliyet ölçümü:** bundle +2 KB (bayraklar `public/`'de olduğu için bundle'a
girmiyor; tarayıcı soru başına tek bayrak indirip önbelleğe alıyor).

| | gzip |
|---|---|
| Ortanca bayrak | **0.36 KB** |
| p95 | 11 KB |
| En ağır (Sırbistan) | 50 KB — tek seferlik |
| 10 soruluk tipik oyun | ~1.5 KB |

Kısaltma (boşluk temizleme) yalnızca %3 kazandırdı — boyut yol verisinde.


### 6.7 Derin bug kontrolü — isabet noktası (en ciddisi)

Puanlama ve "Yön İpucu", ülkenin **ağırlık merkezini** (`geoCentroid`) kullanıyordu.
Ağırlık merkezi coğrafi merkez değildir: ada devletlerinde ve uzak toprakları olan
ülkelerde **okyanusa düşer**. Ölçüldü: 200 ülkenin **26'sında** centroid kendi
geometrisinin dışında. İki oyun hatası doğurdu:

| Hata | Ölçüm |
|---|---|
| Ülkeye **tam olarak** tıklamak 100 değil 87–99 puan getiriyordu | Kiribati −13, Fransa −9, Malezya −5, Mikronezya −4 (toplam 45 puan haksız kayıp) |
| "Yön İpucu" **okyanusu** gösteriyordu | Kiribati için küre boş suyun ortasına dönüyordu |

Oyuncu doğru yere tıklıyor, puan düşüyor, sebebi görünmüyordu. Kiribati'nin
merkezi 1177 km, Fransa'nınki 825 km uzaktaydı (Fransa'nın ağırlığı Fransız
Guyana ve Réunion'u içeri çekiyor).

**Çözüm — build'de `isabet` alanı:** Ülkenin *içinde* kalan bir referans nokta.
Sıra bilinçli olarak **en kısa müdahale**:

1. centroid ülke içindeyse **olduğu gibi kalır** (167 ülke). Aksi halde büyük
   ülkelerde referans kayıyordu: ölçüldü — ABD 669 km, Kanada 246 km, Şili 191 km.
   Mevcut ve adil davranış bozulurdu.
2. centroid dışarıdaysa **en büyük poligonun** ağırlık merkezi
   (Fransa → ana yurtası, Malezya → Malay Yarımadası)
3. O da dışarıdaysa sınır kutusunda 160×160 ızgara taraması
4. Hâlâ bulunamazsa centroid'e düş + build uyarısı

Sonuç: **193/193** ülkenin isabet noktası içeride, mükemmel tıklama
**19300/19300** puan, ipucu her zaman kara gösteriyor, kırpma bozulmadı
(0 kaybolma), build süresi 1.7 s.

### 6.8 Küre animasyonları birbiriyle yarışıyordu

"Yön İpucu" ve "Karşı Yarıküre" **kendi bağımsız `setInterval`** animasyonlarını
çalıştırıyordu. İkisi aynı anda basılınca ikisi de `p.rotate()` çağırıyor,
son yazan kazanıyordu.

**Ölçülen:** küre hedefe giderken **geri dönüyordu** — kara piksel sayısı
13741 → 13046 → 11762 (tek yönlü olmalıydı) ve tek karelik görüntü
titremeleri oluşuyordu.

Daha kötüsü: animasyon sürerken kullanıcı küreyi sürüklüyordu. Sürükleme
çalışıyor, ama **bırakınca animasyon küreyi geri çekiyordu** —
ölçüldü: 48187 → 63761 (kullanıcı sürükledi) → 32109 (animasyon geri aldı).
Kullanıcının girdisi sessizce kayboluyordu. Tekerlekle yakınlaştırma da
aynı şekilde eziliyordu.

**Çözüm — tek animasyon yuvası:** `animasyonuOynat()` her yeni animasyonda
öncekini iptal ediyor; sürükleme ve tekerlek de animasyonu iptal ediyor.
Kullanıcı girdisi **her zaman** kazanıyor. Bileşen kapanırken interval da
düşüyor (sızıntı yok).

### 6.9 Çoklu tıklama turu iki kez sayıyordu

`basKentSec` ve `devamEt` idempotent değildi. Arayüz şıkları cevaplanınca
devre dışı bırakıyordu ama aynı karede (batched) gelen tıklamalarda bu garanti
değil.

**Ölçülen:** 5 senkron şık tıklaması **5 tur** kaydediyordu (1 olmalı),
5 senkron "Sıradaki" **1'den 6'ya** atlıyordu (2 olmalı).

**Çözüm:** `sonTuruRef` bayrağı. DİKKAT: bu ref bir *efektle* güncellenemez —
efektler render'dan sonra, iki tıklama arasında çalışmaz, yani aynı karede
hâlâ `null` görünürdü. Doğrudan `turuKapat`/`devamEt` içinde yazılır.

### 6.5 Tüm ipuçlarını bir anda gösterme → kademeli

Oyuncu "keşfet" yerine ipucu listesini okuyup haritaya bakıyordu: ilk iki ipuç
çoğu ülkede tek başına çözüyordu. Kademeli açma + puandan düşme, hangi ipucun
ne kadar değerli olduğunu oyuncuya da gösteriyor. Bkz. §4.3.

### 6.6 Küçük varyant (`OLCEK=110m`) gerçekten çalışır hale getirildi

README'de `OLCEK=110m` mobil için anlatılıyordu ama **hiç çalışmıyordu**:
pipeline 24 mikro-ülkede doğrulamaya takılıp duruyordu, hatta o doğrulama
geçirilseydi `hibrit: null` yazdığı için uygulama küreyi çizemiyordu.

İkisi de düzeltildi: `KUCUK_VARIANT` bayrağı mikro-ülke yokluğunu uyarıya
çeviriyor, küçük varyant `hibrit`'i düz 110m olarak üretiyor. Sonuç:

| | Tam (50m) | Küçük (110m) |
|---|---|---|
| `world.json` | 1134 KB | 455 KB |
| Soru havuzu | 193 | 165 |
| Oyunlanamayan | — | 28 mikro-ülke |
| Yakınlaştırmada detay | 50m'ye geçer | 110m'de kalır |

Tarayıcıda doğrulandı: küre çiziliyor (161 renk), tıklama çalışıyor, 5 seçenek
üretiliyor.

---

## 7. Dosya yapısı (gerçek)

```
coğrafya-tahmin/
├── README.md · PLAN.md · DURUM-RAPORU.md
├── index.html · package.json · tsconfig.json · vite.config.ts
├── data/
│   ├── raw/                          countries-{50m,110m}.json · lakes*.json · caspian.json
│   └── curated/countries.tr.json     200 kayıt — elle yazılan, oyunun kalbi
├── public/flags/                     193 bayrak SVG (build çıktısı)
├── scripts/
│   ├── build-data.mjs            pipeline + sert doğrulama
│   └── test.mjs                   test koşucusu (rolldown ile paketler)
├── tests/                         199 doğrulama, 5 dosya
│   ├── _yardim.ts                 küçük doğrulama çerçevesi
│   ├── veri · isabet · tiklanabilirlik · oyun · durum
└── src/
    ├── lib/projection.ts             küre matematiği, merkez/kutu uzaklıkları
    ├── lib/world.ts                  veri erişimi, sorgular
    ├── game/score.ts                 mesafe → puan
    ├── game/basKentSecenekleri.ts    zor yanıltıcı üretimi
    ├── game/fuzzy.ts                 normalize + Damerau
    ├── game/useQuiz.ts               state machine + kademeli ipuçları
    ├── game/storage.ts               localStorage + seri hesabı + paylaşım
    ├── game/ses.ts                   Web Audio tonları
    ├── game/types.ts                 mod tanımları, ipuç üretimi, günün ülkesi
    ├── components/Globe.tsx          canvas küre
    ├── components/BasKentSecim.tsx   5 seçenek
    ├── App.tsx                       akış + ekranlar
    ├── styles/index.css
    └── data/world.json               build çıktısı
```

---

## 8. Riskler — güncel

| Risk | Durum |
|---|---|
| Mikro-ülkeler tıklanamaz | ✅ **Çözüldü** — 100× zoom, Vatikan 42px |
| Küratör tablosunda hata | ✅ Build script eşleşmezse hata veriyor |
| Anti-meridian bölmeleri | ✅ **Çözüldü** (2 hata düzeltildi) |
| Performans | ✅ **Çözüldü** — 34ms → 4.5ms |
| Limb artefaktları | ✅ Gözle doğrulanmadı, kod doğru |
| Karşı yarımküre eksik | ✅ **Çözüldü** — 180° çevirme düğmesi |
| Bayrak modu bozuk | ✅ **Çözüldü** — 133 ülke boş bayrak gösteriyordu |
| Körlük ipuçları yetersiz | ✅ **Çözüldü** — 4 ipuç → 6 kademeli ipuç |
| Günün Ülkesi sonucu kaydedilmiyordu | ✅ **Çözüldü** — `dailyGecmisi` + seri |
| `OLCEK=110m` çalışmıyordu | ✅ **Çözüldü** — 2 hata (bkz. §6.6) |
| Bundle 466 KB gzip | ⚠️ Masaüstü için sorun değil; `OLCEK=110m` ile 455 KB veriye iner |
| **Doğrulanamayan alanlar** | ⚠️ Geliştirme ortamında pencere görünür değil; Chrome rAF/ResizeObserver kısmi çalışıyor. **Gerçek fare sürükleme ve tekerlek yakınlaştırma gözle test edilmedi.** |
| Kısa adlı ülke ipuçları | ⚠️ "Ad" ipucu 4 harften kısaysa (Peru, Kuba, Çin) neredeyse cevabı veriyor — 30 puanlık cezası bunu bir ölçüde dengeliyor |

---

## 9. Yol haritası

### Yapılacaklar
Yol haritası boş — planın tamamı uygulandı.

### Tamamlandı
- [x] "Karşı Yarıküre" butonu — 180° çevirir, cevabı vermez
- [x] Gerçek bayrak görselleri — 193/193 SVG
- [x] Körlük modu ipuçlarını zenginleştir — 6 kademeli, bedava ilk + puan maliyeti
- [x] Günün Ülkesi: seri rozeti + panoya kopyalanabilir sonuç metni
- [x] Günün Ülkesi sonucunun kaydedilmesi
- [x] Ses efektleri — Web Audio, harici dosya yok
- [x] `README.md` — kurulum, küratör tablosu rehberi, mimari
- [x] `OLCEK=110m` küçük varyantı gerçekten çalışır hale getirildi

### Yapılmadı (bilinçli)
- Mobil/touch arayüzü — hedef masaüstü
- Havuz dışı bölgeler (41 adet haritada ama sorulmuyor) — kapsam kararı
- Ayarlar ekranı, dil seçimi
- Küresel liderlik tablosu — sunucu yok, bilinçli
- Paylaşım kartı **görseli** — metin yeterli, resim üretmek sunucu gerektirir

---

## 10. Test durumu

| Test | Kapsam | Sonuç |
|---|---|---|
| Mantık | Puanlama · fuzzy · seçenek · istatistik · modlar | **57/57** |
| Seçenek üretimi | 193 ülke × 5 | **965/965** |
| Kırpma | 193 ülke × 5 zoom + kenar | **965/965** |
| İpucu yönlendirme | 200 ülke × 5 rotasyon | **1000/1000** |
| Günün serisi | Boş · bugün · 5 gün · dün koruması · boşluk · kopuk · 40 gün | **8/8** |
| Tarih birliği | UTC/yerel ayrışması · ay sınırı · sıfır dolgu | **5/5** |
| Körlük ipuçları | 193 ülke: boş değer, yinelenen etiket, maliyet sırası, sızıntı | **3/3** |
| Performans | 5 zoom seviyesi | 60fps bütçesinde |
| Uçtan uca | Kolay + Körlük + Günün Ülkesi turu, konsol temiz | ✓ |
| Ses | AudioContext kurulumu, ton frekansları, start/stop dengesi, kalıcılık | ✓ |
| Küçük varyant | 110m'de çizim + tıklama + seçenek üretimi | ✓ |
| Tip denetimi | `tsc --noEmit` strict (src + tests) | Temiz |
| **Kalıcı test paketi** | `npm test` — 5 dosya, tip denetimi dahil | **199 doğrulama, ~4s** |
