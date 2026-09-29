# Coğrafya Tahmin — Durum Raporu

**Tarih:** 29 Eylül 2026 · **Konum:** `~/Projects/coğrafya-tahmin`
**Durum:** Planın tamamı uygulandı. Masaüstü hedefli. Bilinen sınırlar §8.

---

## 1. Ne yapıldı

Planlama aşamasında alınan kararlar (küre, 5 mod, mesafeye bağlı puan, toleranslı
sınır, çevrimdışı) uyarınca **kapsamlı bir uygulama** haline getirildi: veri
altyapısı, oyun motoru, arayüz ve 5 modun tamamı gerçek kodla çalışıyor.

İkinci turda kalan boşluklar kapatıldı: karşı yarımküre düğmesi, gerçek bayrak
görselleri, kademeli Körlük ipuçları, Günün Ülkesi serisi ve paylaşımı, ses
efektleri, README ve isteğe bağlı küçük veri varyantı.

### Dosya yapısı
```
data/
  raw/                    Natural Earth + world-atlas (indirilmiş, versiyonlanır)
  curated/countries.tr.json   ← elle yazılan 200 ülke tablosu
public/flags/             193 bayrak SVG (build çıktısı)
scripts/build-data.mjs     Veri pipeline'ı + doğrulayıcı
src/
  lib/     projection.ts (küre matematiği) · world.ts (veri erişimi)
  game/    score · fuzzy · basKentSecenekleri · useQuiz · storage · types · ses
  components/  Globe.tsx (canvas) · BasKentSecim.tsx
  App.tsx  · styles/index.css
```

---

## 2. Mimari kararlar

| Konu | Karar | Neden |
|---|---|---|
| Framework | React 19 + TS + Vite | — |
| Harita | `d3-geo` **orthographic** (dünya küresi) | Seçilen konsept: döndürülebilir küre |
| Render | **Canvas**, SVG değil | Ölçüldü: 1 MB path verisini SVG her karede yeniden ayrıştırmak kasma yaratıyordu |
| Zoom | Canvas `setTransform` | İmleç altında sabit kalır, çözümlemeye gerek kalmaz |
| Geometri | **Hibrit**: 110m + mikro-ülkelerin 50m'si | 34ms → 4.5ms; tüm ülkeler görünür kalır |
| Veri | TopoJSON build'de çözülür | GeoJSON'a önceden açmak payload'ı 3x büyütüyordu |
| Bayraklar | `flag-icons` SVG → `public/flags/` | Emoji platformlar arası değişiyor, tablo 60 ülkede bitiyordu |
| Ses | Web Audio ile üretilen tonlar | Harici dosya gerektirmiyor, paket boyutu sıfır |
| Sunucu | Yok, `localStorage` | Tamamen çevrimdışı |

---

## 3. Veri altyapısı

**Kaynak:** Natural Earth + world-atlas (public domain) + elle yazılan Türkçe küratör tablosu.

`npm run build:data` tek komutu üretir ve **SERT doğrulama** yapar:
- Küratördeki her ülke topology'de birebir bulunmalı → yoksa HATA, çıktı üretilmez
- İki kayıt aynı geometriye düşemez
- Eksik alan (`tr`, `bas`, `kita`, `iso3`) HATA

### Ölçek kararı
Başlangıçta 110m seçilmişti, sonra **50m'ye geçildi**: 110m'de mikro-ülkeler (Singapur, Monako, Malta, Vatikan) hiç yok — soru havuzundan düşüyorlardı.

Çözüm hibrit geometri: 177 ülke @110m + 64 mikro-ülke @50m = 1.696 ek nokta.

### Hazar Denizi
Natural Earth'in **hiçbir katmanında yok** (coğrafi bölgeler katmanından çıkarıldı). Elde özel olarak ayrıldı.

### Ölçülen veri
| | |
|---|---|
| Soru havuzu | **193 ülke**, 6 kıta |
| Komşu listesi olan | 158 ülke |
| Göl | 34 (Van, Tuz, Issyk-Kul, Hazar dahil) |
| Bayrak | 193/193 SVG |
| `world.json` | 1134 KB ham / 306 KB gzip |
| Soru havuzunda olmayan (sadece haritada) | 41 bölge: Antarktika, Grönland, Batı Sahra, K.Kıbrıs, Somaliland, Kosova, Tuvalu… |

### Küçük varyant (`OLCEK=110m`)

Veri 1134 KB → **455 KB** düşüyor, soru havuzu 193 → 165. 28 mikro-ülke oyunlanamaz
ve yakınlaştırınca kıyı çizgisi pürüzsüzleşmez.

> Bu yol **önce çalışmıyordu** ve hiç denenmemişti: pipeline mikro-ülkelerde
> doğrulamaya takılıyor, o geçilseydi `hibrit: null` yazdığı için uygulama
> küreyi hiç çizemiyordu. İkisi de düzeltildi ve tarayıcıda doğrulandı
> (çizim + tıklama + 5 seçenek üretimi çalışıyor).

Politik kararlar veri dosyasında görünür: Kıbrıs havuzda, K.Kıbrıs ve Somaliland değil; Batı Sahra soru havuzunda değil ama toleranslı komşulukta var.

---

## 4. Oyun motoru

### Puanlama (toplam 175)
| Unsur | Puan |
|---|---|
| Konum (mesafeye göre, üstel azalma) | 0–100 |
| Kıta — tam isabet | 25 |
| Kıta — aynı kıta, yanlış ülke | 20 |
| Kıta — toleranslı (komşu) | 15 |
| Başkent (5 seçenek) | 50 |
| Süre bonusu (Süreli Hız) | kalan sn × 2 |
| **Körlük ipucu** (yalnız Körlük) | **−6 … −30** |

**Toleranslı sınır:** Kıbrıs, Hakkari, Batı Sahra gibi tartışmalı bölgelerde komşu ülkeye tıklamak 0.7 katsayıyla kabul.

**İpucu cezası tavana çarpar:** ham puanı aşamaz (toplam eksi olmaz). Kırpıldığında
ekranda "istenen −74, puan sıfırına düştüğü için −15" yazıyor — aksi halde
oyuncu 5 ipuç isteyip yalnızca −15 görünce ne olduğunu anlamıyordu.

### Körlük modu — kademeli ipuçlar

Önceden bütün ipuçları bir anda dökülüyordu ve ilk ikisi çoğu ülkede tek başına
çözüyordu. Şimdi sırayla, ücretli açılıyor:

| # | İpucu | Maliyet | Örnek |
|---|---|---|---|
| 1 | Kıta | **ücretsiz** | `Kuzey Amerika` |
| 2 | Konum | −6 | `ekvatorun kuzeyinde, batı yarımkürede` |
| 3 | Yaklaşık alan | −8 | `Minik bir ülke — yakınlaştırmak gerek` |
| 4 | Başkent | −12 | `8 harf · Mo······` |
| 5 | Komşular | −18 | `Gine, Fildişi Sahili, Sierra Leone` |
| 6 | Ad maskesi | −30 | `L·····a` |

### Başkent sorusu — 5 seçenek, 3'ü kasıtlı zor
193 ülke için elle yanıltıcı yazmak imkânsız olduğundan **veriden türetiliyor**:
1. **Komşu ülkelerin başkentleri** — coğrafi karışıklık
2. **Yazım benzerliği ≥ %62 + mutlak mesafe sınırı** — ses karışıklığı
3. **Coğrafi yakınlık** — ada ülkeler için güvenlik ağı

Örnekler: Arnavutluk→Tirana (Fas/K. Makedonya/Yunanistan/Karadağ), Yemen→Sana (Astana %67 benzer + Suudi/Umman), Bern↔Berlin %67, Kingstown↔Kingston %89.

**Doğrulama:** 193 ülke × 5 tekrar = 965 soru, **0 hata**. Her birinde 5 seçenek, 1 doğru, 3 zor, tekrar yok.

### Hile koruması
Onay öncesi **hiçbir konum bilgisi** sızdırılıyor: tıklanan ülkenin adı yok, mesafe yok (mesafe gösterilseydi ikili aramayla merkez bulunabilirdi). Onay sonrası cevap açıklanıyor ve **geri dönmek kapalı** — yoksa "onayla-bilgi al-geri al" döngüsü oyunu çözüyordu.

---

## 5. Performans

Bu alan en çok çalışılan kısım oldu; üç ayrı kök neden bulundu ve ölçüldü.

| Sorun | Kök neden | Sonuç |
|---|---|---|
| Başlangıçta "SVG 1 MB path parse ediyor" | Yanlış teşhis — render backend'i değil | Canvas'a geçildi |
| Hâlâ kasıyordu | **50m geometriyi bir karede yeniden projekte etmek 34ms** | Hibrit geometri → 4.5ms |
| Küçük ülkeler görünmez oluyordu | Tam çözüm performansı bozuyordu | Görünürlük kırpma + 50m detay |

**Nihai ölçüm** (geometri üretimi, 60fps bütçesi 16.7ms):

| Zoom | Ülke sayısı | Süre | |
|---|---|---|---|
| 1× | 241 | 5.7ms | ✓ |
| 3× | 75 | 7.4ms | ✓ |
| 8× | 44 | 2.9ms | ✓ |
| 100× | 41 | 2.7ms | ✓ |

Ayrıca 4× yakınlaştırma tek adımda **2.2×** (eskiden 1.16× — 1×'ten 12×'e 17 tık yerine 4 tık). Üst sınır 100×: Vatikan 42 piksel genişliğe ulaşabiliyor (eskiden 9 piksel, tıklanamaz).

---

## 6. Bulunan ve düzeltilen hatalar

Üç turda toplam **19 gerçek hata** bulundu. En kritik olanlar:

**Ülkeler kalıcı olarak tıklanamazdı (4/193).** Antimeridian'ı geçen ülkelerde (ABD, Rusya, Yeni Zelanda, Kiribati) sınır kutusu "sarmalanır"; `lon >= bati && lon <= dogu` kontrolü matematiksel olarak imkânsız. Bu sorular kazanılamazdı.

**Ülkeler haritadan kayboluyordu (maviye dönüyordu).** Yakınlaştırma kırpması sınır kutusu ortalamasını kullanıyordu; devasa ülkelerde bu tam tersini yapıyordu — Rusya tam merkezdeyken 52° "uzakta" sayılıyor ve eleniyordu.

**Sürükleme/yakınlaştırma kalıcı olarak ölüyordu.** `cancelAnimationFrame` sonrası referans boşaltılmadığı için küre yeniden çizilmiyordu.

**Damerau-Levenshtein bozuktu.** Fazladan yardımcı matris transpozisyon dalını bozuyordu: `mesafe('sana','bandarseribegawan') = 1` (doğrusu 14). Yazım toleransı motoru baştan beri neredeyse her şeyi kabul ediyordu.

**"Saçma sapan yere gitme".** d3'ün `rotate()` işareti tuhaftı: merkezde duran nokta `(λ,φ)` değil `(-λ,-φ)`. Kod yanlış işaretle 1000 senaryonun 446'sında yanlış yere gidiyordu.

**Türkçe noktalı I.** `'İstanbul'.toLowerCase()` → `'i' + U+0307` (8 harf → 9 harf).

Diğerleri: süre bitince oyun bitmiyordu · küre kenarı tıklaması reddedilmiyordu · çıkıştan sonra küre eski ülkeye uçuyordu · ipucu yakınlaştırması kalıcıydı · ikinci imleç sürüklemeyi bozuyordu · `pointercancel` sonrası bir tıklama yutuluyordu · DPR bayatlıyordu · puanlama plan dokümanından sapmıştı (20 vs 15).

**İkinci turda bulunanlar:**

**Günün ülkesi ile seri farklı güne düşüyordu.** `gununUlkesi` `toISOString()`
ile **UTC** gününü kullanıyordu, seri hesabı **yerel** günü. Türkiye'de gece
yarısından sonra UTC hâlâ dünkü gösterdiği için ülke değişiyor ama streak
"bugün"ü görmüyordu. İkisi de yerel `bugun()`'a bağlandı.

**Bayrak modunun üçte ikisi bozuktu.** Emoji tablosu yalnızca 60 ülkeyi
kapsıyordu; geri kalan **133 ülke** hep "boş bayrak" (🏳) gösteriyordu.
193/193 gerçek SVG'ye geçirildi.

**`OLCEK=110m` hiç çalışmıyordu.** Dokümante edilmişti ama pipeline
24 mikro-ülkede doğrulamaya takılıp duruyordu; o geçilseydi `hibrit: null`
yazdığı için uygulama küreyi hiç çizemiyordu. İkisi de düzeltildi.

**İpucu cezası yanıltıcıydı.** 5 ipuç isteyen oyuncu 74 puan öderdi ama ham
puanı 15'te olduğu için sadece 15 düşülüyordu; ekranda "−15" yazınca ne
olduğu anlaşılmıyordu. Ham maliyet de saklanıp ikisi birden gösteriliyor.

**Üçüncü turda bulunanlar (derin bug kontrolü):**

**Puanlama ve ipucu okyanustaki bir noktayı hedefliyordu (en ciddisi).**
İkisi de ülkenin ağırlık merkezini (`geoCentroid`) kullanıyordu; ağırlık merkezi
coğrafi merkez değil, ada devletlerinde okyanusa düşüyor. 200 ülkenin **26'sında**
centroid geometrinin dışındaydı. Sonuç: ülkeye **tam** tıklayan oyuncu 100 değil
87–99 puan alıyordu (Kiribati −13, Fransa −9, Malezya −5, Mikronezya −4;
toplam 45 puan haksız kayıp) ve "Yön İpucu" Kiribati'de boş suyun ortasını
gösteriyordu. Build'e `isabet` alanı eklendi: centroid içerideyse dokunulmuyor
(167 ülke, mevcut adil davranış korunuyor), dışarıdaysa en büyük kara kütlesinin
merkezine kayıyor. Sonuç 193/193 ülke içeride, mükemmel tıklama 19300/19300 puan.

**Küre animasyonları birbiriyle yarışıyordu.** "Yön İpucu" ve "Karşı Yarıküre"
ayrı `setInterval` kullanıyordu; ikisi aynı anda basılınca son yazan kazanıyordu
— küre hedefe giderken geri dönüyordu (13741 → 13046 → 11762) ve tek karelik
titremeler oluşuyordu. Dahası, animasyon sürerken kullanıcı sürüklediğinde
küre bırakınca **geri çekiliyordu** (63761 → 32109): kullanıcının girdisi
sessizce kayboluyordu. Tek animasyon yuvasına geçirildi; sürükleme ve tekerlek
artık animasyonu iptal ediyor.

**Çoklu tıklama turu iki kez sayıyordu.** 5 senkron şık tıklaması 5 tur
kaydediyordu, 5 senkron "Sıradaki" 1'den 6'ya atlıyordu. `sonTuruRef` bayrağı
eklendi — kritik nokta: bu ref bir *efektle* güncellenemez, çünkü efektler iki
tıklama arasında çalışmaz; doğrudan `turuKapat`/`devamEt` içinde yazılmalı.

---

## 7. Test durumu

| Test | Kapsam | Sonuç |
|---|---|---|
| Mantık testleri | Puanlama, fuzzy, seçenek üretimi, istatistik, mod tipleri | **57/57** |
| Seçenek üretimi | 193 ülke × 5 tekrar | **965/965, 0 hata** |
| Kırpma | 193 ülke × 5 zoom + kenar senaryosu | **965/965, 0 kaybolma** |
| İpucu yönlendirme | 200 ülke × 5 başlangıç rotasyonu | **1000/1000** |
| Günün serisi | Boş · bugün · 5 gün · dün koruması · boşluk · kopuk · 40 gün | **8/8** |
| Tarih birliği | UTC/yerel ayrışması · ay sınırı · sıfır dolgu | **5/5** |
| Körlük ipuçları | 193 ülke: boş değer, yinelenen etiket, maliyet sırası, sızıntı | **3/3** |
| Tıklanabilirlik | 193 ülke × 24 rotasyon, isabet noktasından | **193/193** |
| İsabet noktası | 193 ülke: ülke içinde mi, centroid değişti mi | **3/3** |
| Mükemmel tıklama | 193 ülke × 100 puan | **19300/19300** |
| Çoklu tıklama | 5 senkron şık / 5 senkron "Sıradaki" / 5 senkron onay | 1 tur, 1 soru ✓ |
| Animasyon çakışması | İpucu + yarımküre, sürükleme/zoom devralma | ✓ |
| Performans | Zoom seviyeleri × süre | Hepsi 60fps bütçesinde |
| Uçtan uca tarayıcı | 5 modun tamamı, konsol temiz | ✓ |
| Ses | AudioContext kurulumu, ton frekansları, start/stop dengesi, kalıcılık | ✓ |
| Küçük varyant | 110m'de çizim + tıklama + 5 seçenek üretimi | ✓ |
| TypeScript | `tsc --noEmit`, strict | Temiz |

---

## 7b. Kalıcı testler

Bug avındaki ölçümler geçici dosyalara yazılıp çalıştırılıyor, sonra
siliniyordu — yani bulunan 4 hata düzeltildi ama **aynı hataların geri
gelip gelmediğini kimse ölçemiyordu**. Artık kalıcı:

| Dosya | Kapsam | Doğrulama |
|---|---|---|
| `veri.test.ts` | 200 ülkenin alan/geometri/bayrak bütünlüğü | 31 |
| `isabet.test.ts` | isabet noktası, tam tıklama 100 puan, kırpma | 16 |
| `tiklanabilirlik.test.ts` | 193 ülke × 24 rotasyon, sarmalı kutu, limb | 14 |
| `oyun.test.ts` | puanlama, tolerans, seçenekler, ipuçları | 61 |
| `durum.test.ts` | localStorage şeması, seri, yazım toleransı | 77 |
| **toplam** | | **199 (~4 saniye)** |

**`npm test` önce tip denetimini çalıştırır**, sonra testlere girer — test
dosyasındaki tip hatası build'i kırdığı için erken yakalanması gerekiyor.

Paketleme: Node'un tip soyma özelliği kaynak dosyalardaki uzantısız import'ları
çözemiyor (`Cannot find module .../lib/world`) ve JSON import için öznitelik
istiyor. Kaynak dosyalara dokunmadan `scripts/test.mjs` hepsini **rolldown**
ile paketliyor — rolldown zaten kurulu (Vite 8 onu kullanıyor), yeni bağımlılık
eklenmedi.

### Testler yazarken bulunan 3 veri kusuru

1. **`AKISAN` tablosu eksikti** (`í`, `ã`, `õ` yok) — normalize("Brasília")
   "brasília" üretiyordu. 7 başkentin çeldirici eşleşmesi yanlıştı:
   Brasília, Asunción, Bogotá, São Tomé, Nouméa, Yaoundé, Kudüs.
2. **`zorluk: 6`** havuz dışı 7 ülkede — "sorulmaz" işareti, kasıtlı. Ama
   `Country` tipi `1|2|3|4|5` diyor, yani sözleşmeyi ihlal ediyor.
3. **`kutu` genişliği sarmalı ülkelerde negatif** — ABD −239°, Yeni Zelanda
   −337°. Ham fark hesaplandığı için. `kutu > 100` gibi karşılaştırmalarda
   yanıltıcı olabilir.

Üçü de kasıtlı davranış; testler artık "değişirse haber ver" diye izliyor.

---

## 8. Bilinen sınırlar

**Doğrulanamayan alanlar.** Geliştirme ortamında pencere görünür olmadığı için
Chrome rAF/ResizeObserver'ı kısmi çalıştırıyor. Şunlar **gözle test edilmedi**:
gerçek fare sürükleme ve tekerlek yakınlaştırma.
Mantık, piksel imzaları ve olay akışı test edildi.

**Bundle 466 KB gzip.** Çoğu veri. İsteğe bağlı olarak `OLCEK=110m` ile veri
455 KB'a iner (toplam ~290 KB gzip).

**Yazma modu geri alındı.** Başkent çoktan seçmeliye çevrildi. `fuzzy.ts` hâlâ
duruyor (distraktör seçiminde kullanılıyor) — yazma modu bir "Uzman" modu
olarak geri eklenebilir.

**"Yaklaşık alan" ipucu kaba.** Bounding box alanından hesaplanıyor, gerçek
km² değil. Brezilya gibi uzun ince ülkelerde biraz yanıltıcı olabilir.

**Bayraklar harici dosya.** `public/flags/` silinirse Bayrağı Bul modu
emoji'ye düşer; yedek tablo yalnızca 15 ülkeyi kapsıyor.

**Küçük varyant 28 ülkeyi kaybediyor.** `OLCEK=110m` ile mikro-ülkeler
oynanamaz. Kullanılmıyor ama istenirse işe yarıyor.

---

## 9. Nasıl çalıştırılır

```bash
cd ~/Projects/coğrafya-tahmin
npm install
npm run dev        # localhost:5180
npm run build:data # veriyi yeniden üret (küratör tablosunu düzenlediysen)
npm run build      # production
```

Ayrıntılı kurulum, küratör tablosu düzenleme rehberi ve mimari: **`README.md`**.

**Veri tablosunu düzenlemek için:** `data/curated/countries.tr.json`. Anahtar,
Natural Earth'deki ülke adıyla **birebir aynı** olmalı — build script eşleşmezse
hatayla durur.

```jsonc
"Turkey": {
  "iso3": "TUR", "tr": "Türkiye", "bas": "Ankara",
  "alt": ["İstanbul"],          // tam puanla kabul
  "bonusAlts": [],              // %95 puanla kabul
  "kita": "Asya", "kitaAlt": ["Avrupa"],
  "komsu": ["GRC","BGR", ...],  // ISO alpha-3
  "zorluk": 3
}
```

---

## 10. Sıradaki adımlar

Planın tamamı bitti, yol haritası boş. Bilinen sınırlar §8'de.

Kapanmayan tek şey ortam gereksinimi: **gözle test yapılamıyor.** Sürüklemeyi,
tekerleği ve büyük ülkelerin yakınlaştırınca kaybolmadığını oynayarak
bakmak gerekiyor.
