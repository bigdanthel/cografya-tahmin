import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { geoPath, geoContains, geoDistance, geoBounds, geoCentroid, type GeoPath } from 'd3-geo'
import { feature } from 'topojson-client'
import type { Feature, FeatureCollection, Polygon, MultiPolygon } from 'geojson'
import { countries, gorselSekil, type Country } from '../lib/world'
import {
  KureProjeksiyonu,
  olustur as projeksiyonOlustur,
  YARICAP,
  limbteMi,
  hedefRotasyon,
  bakisMerkezi,
  kutuUzakligi,
  rotasyonYolu,
} from '../lib/projection'
import rawWorld from '../data/world.json'
import type { LineString } from 'geojson'

/* ── Görsel dil ───────────────────────────────────────────────────────────
   Haritada tek bir yazı yok. Renkler kasıtlı olarak düz:
   bej arazi, siyah sınır, mavi su. Gölge küreye hacim verir.
   ------------------------------------------------------------------------ */

const RENK = {
  denizIc: '#b4d0e4',
  denizDis: '#7ba8cc',
  arazi: '#f2ead8',
  kiyi: '#e3d8c0',
  gol: '#96bcd8',
  sinir: '#1a1a1a',
  kenar: '#0d1b28',
  vurgu: '#2f7d46',
  vurguKenar: '#1c5330',
  pin: '#c8452f',
} as const

/** Ekran çözünürlüğü sınırı — 2x'in üstüne çıkmak kazanç vermez, maliyeti artırır */
const AZAMI_DPR = 2

/* ── Yakınlaştırma ─────────────────────────────────────────────────────────
   Zoom, canvas transform'u olarak uygulanır (projeksiyon ölçeği sabit kalır).
   Böylece imlecin altındaki nokta KAYBOLMAZ, üstelik herhangi bir lineer/
   lineer olmayan çözüm (Newton vb.) gerekmez — setTransform zaten imleç
   etrafında ölçekler.

   Duyarlılık: üstel. Bir fare tığı ≈ 2.2x, trackpad ise kare başına ~%2
   (yumuşak, sürekli kontrol).
   -------------------------------------------------------------------------- */

const ZOOM_MUL = 0.008 // üstel katsayı
const ZOOM_ASGARI = 0.85
const ZOOM_MAKS = 100 // mikro-ülkeler: Vatikan 0.5° genişlikte 42px olur
/** Bu zoom'un üstünde görünür bölge 50m detayına geçer */
const ZOOM_DETAY = 3

export interface GlobeProps {
  vurgula?: Country | null
  pin?: [number, number] | null
  onTikla?: (nokta: [number, number], ulke: Country | null, limbde: boolean) => void
  hedefiGoster?: Country | null
  kilitli?: boolean
  /** true = küreyi karşı yarımküreye çevir (kullanıcı düğmeye bastığında) */
  digerYariKure?: boolean
  className?: string
}

interface Katmanlar {
  /** Hızlı taban: 110m (177 ülke) + 50m mikro-ülkeler — tam dünya için 4.5ms */
  hizli: FeatureCollection<Polygon | MultiPolygon>
  /** Tam detay: 50m, sadece yakınlaştırıldığında görünür bölge için kullanılır */
  detay: FeatureCollection<Polygon | MultiPolygon>
  /** 50m geometrileri — görünürlük kırpma için ayrı ayrı. Küratör meta verisi
      olmayan bölgeler de (Grönland, Tayvan, Kosova, K.Kıbrıs,
      Antarktika…) burada yer alır — bounds/centroid'leri mount'ta d3-geo ile
      hesaplanır, böylece onlar da aynı açısal-mesafe kırpmasına girer ve
      zoom≥3×'te hem kaybolmazlar hem de her karede koşulsuz çizilip
      performans bütçesini baltalamazlar. */
  detayParcalar: {
    anahtar: string
    bounds: [[number, number], [number, number]]
    centroid: [number, number]
    feature: Feature<Polygon | MultiPolygon>
  }[]
  gol: FeatureCollection<Polygon | MultiPolygon>
}

interface Zoom {
  k: number
  x: number
  y: number
}

export function Globe({
  vurgula,
  pin,
  onTikla,
  hedefiGoster,
  kilitli,
  digerYariKure,
  className,
}: GlobeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const sarmaRef = useRef<HTMLDivElement>(null)
  const projeksiyonRef = useRef<KureProjeksiyonu>(projeksiyonOlustur())
  const yolRef = useRef<GeoPath>(geoPath(projeksiyonRef.current))
  /* Küre yarıçapı artık kapsayıcı boyutuna göre dinamik (bkz. olcekle()) —
     sabit 150px, geniş ekranda küreyi küçük bırakıyordu. YARICAP sabiti
     yalnızca ilk kare için varsayılan değer. */
  const yaricapRef = useRef(YARICAP)
  const zoomRef = useRef<Zoom>({ k: 1, x: 0, y: 0 })
  const vurgulaRef = useRef<Country | null>(null)
  const pinRef = useRef<[number, number] | null>(null)
  const kilitliRef = useRef(false)
  const kareRef = useRef<number | null>(null)
  const donuyorRef = useRef(false)
  /* onTikla her turda yeni bir fonksiyon kimliği alıyor (useCallback bağımlılıkları
     değişiyor). Etkileşim efektini onun bağımlılığı yapmak, her turda tüm dinleyici
     kayıtlarını söküp yeniden kuruyordu — hem pahalı, hem de bekleyen bir rAF
     iptal edilip referansta ölü bir kimlik bırakıyordu (bkz. cizErtele).
     Bu yüzden geri çağrıyı bir ref'te tutuyoruz; efekt bir kez kurulur. */
  const onTiklaRef = useRef(onTikla)
  onTiklaRef.current = onTikla
  const [hazir, setHazir] = useState(false)

  vurgulaRef.current = vurgula ?? null
  pinRef.current = pin ?? null
  kilitliRef.current = Boolean(kilitli)

  // ── Geometrileri bir kez çöz ────────────────────────────────────────────
  const katman = useMemo<Katmanlar>(() => {
    const w = rawWorld as unknown as {
      geometri: unknown
      /** Hızlı taban, GEOJSON olarak hazır gelir (build'de üretildi) */
      hibrit: FeatureCollection<Polygon | MultiPolygon>
      gol: { geometry: Polygon | MultiPolygon }[]
      hazar: { geometry: Polygon | MultiPolygon }[]
    }

    // 50m TopoJSON → GeoJSON (yakınlaştırınca kullanılır)
    const topo = w.geometri as unknown as Parameters<typeof feature>[0]
    const obj = (
      topo as unknown as { objects: { countries: Parameters<typeof feature>[1] } }
    ).objects.countries
    const detay = feature(topo, obj) as unknown as FeatureCollection<Polygon | MultiPolygon>

    // Görünürlük kırpma için 50m parçaları + sınırları + gerçek alan merkezi
    const metaHarita = new Map(countries.map((c) => [c.anahtar, c]))
    let ekstraNo = 0
    const detayParcalar = detay.features.map((f) => {
      const anahtar = (f.properties as { meta?: { anahtar: string } } | null)?.meta?.anahtar
      const m = anahtar ? metaHarita.get(anahtar) : undefined
      if (anahtar && m) return { anahtar, bounds: m.bounds, centroid: m.centroid, feature: f }
      // Küratör tablosunda karşılığı olmayan bölgeler (Grönland, Tayvan,
      // Kosova, K.Kıbrıs, Antarktika…): meta yok, bounds/centroid
      // burada bir kereliğine (mount'ta) d3-geo ile hesaplanır — böylece bunlar
      // da aynı açısal-mesafe kırpmasına girip zoom≥3×'te ne kaybolur ne de
      // her karede koşulsuz çizilip performans bütçesini baltalar.
      const bounds = geoBounds(f) as [[number, number], [number, number]]
      const centroid = geoCentroid(f) as [number, number]
      return { anahtar: anahtar ?? `__ekstra_${ekstraNo++}`, bounds, centroid, feature: f }
    })

    const gol: FeatureCollection<Polygon | MultiPolygon> = {
      type: 'FeatureCollection',
      features: [
        ...w.gol.map((l) => ({ type: 'Feature' as const, properties: {}, geometry: l.geometry })),
        ...w.hazar.map((h) => ({ type: 'Feature' as const, properties: {}, geometry: h.geometry })),
      ],
    }
    return { hizli: w.hibrit, detay, detayParcalar, gol }
  }, [])

  // ── Çizim (Canvas) ──────────────────────────────────────────────────────
  const ciz = useCallback(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const p = projeksiyonRef.current
    const yol = yolRef.current
    const z = zoomRef.current
    const dpr = canvas.width / (canvas.clientWidth || 1) || 1

    const cx = canvas.clientWidth / 2
    const cy = canvas.clientHeight / 2

    // Ekran pikseli → cihaz pikseli → zoom transformu → küre uzayı
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    ctx.translate(cx + z.x, cy + z.y)
    ctx.scale(z.k, z.k)

    // Zoom yaparken çizgi kalınlıkları ekranda sabit kalsın
    const lw = 1 / z.k

    /* Hangi geometri çizilecek?
       - Uzaktayken (zoom < 3): HİBRİT geometri. 50m'nin tamamı bir karede
         34ms sürüyor (60fps bütçesinin iki katı); hibrit 4.5ms.
       - Yakınlaştırınca: yalnızca EKRANA SIĞAN ülkeler 50m detayıyla. Kırpma
         sayesinde 4x'te ~11 ülke (1.8ms), 8x'te ~3 ülke (0.9ms) kalıyor. */
    let karaKoleksiyon: FeatureCollection<Polygon | MultiPolygon>
    const R = yaricapRef.current
    /* Eşik `z.k`'nin kendisi değil, kürenin EKRANDAKİ gerçek yarıçapı
       (R·z.k) olmalı: R artık kapsayıcıya göre dinamik (bkz. yaricapRef),
       geniş ekranda YARICAP=150'den çok daha büyük olabiliyor. Eşiği ham
       `z.k < ZOOM_DETAY` ile sabitlemek, R büyüdüğünde ZOOM_DETAY'a
       ulaşıldığı anda görünür açısal yarıçapın (aşağıdaki `acisalYaricap`)
       artık ~90° değil çok daha küçük çıkmasına yol açıyordu — hibrit
       katmandan kırpılmış detay katmanına geçişte harita aniden büyük
       ölçüde maviye (denize) dönüyordu. `YARICAP·ZOOM_DETAY` sabit bir
       ekran-pikseli eşiği olduğu için geçiş noktasında `acisalYaricap`
       her zaman R'den bağımsız olarak aynı (≈90°) çıkar. */
    if (R * z.k < YARICAP * ZOOM_DETAY) {
      karaKoleksiyon = katman.hizli
    } else {
      // Görüş alanının merkezden açısal yarıçapı → bu açıdaki ülkeler yeter
      const yaricap = R * z.k
      const gorusYaricap = Math.hypot(canvas.clientWidth, canvas.clientHeight) / 2
      const oran = Math.min(0.9999, gorusYaricap / yaricap)
      const acisalYaricap = (Math.asin(oran) * 180) / Math.PI + 12 // +12° pay
      const C = bakisMerkezi(p)
      const secilen = katman.detayParcalar.filter(({ bounds, centroid }) => {
        /* İKİ ölçüt birlikte: ülke ya alan merkezine yakınsa (küçük ülkeler,
           ülkeyi merkeze aldığımızda) ya da sınır kutusuna yakınsa (büyük
           ülkeler, kenarına yakınlaştığımızda) tutulmalı.

           Tek başına kutu ORTALAMASI kullanmak devasa ülkelerde ülkeyi eler:
           ölçüldü — Rusya merkezdeyken ortalama 52°, ABD 88°, Kiribati 176°
           uzağa düşüyor ve harita maviye dönüyordu. */
        const dMerkez = geoDistance(C, centroid) * (180 / Math.PI)
        if (dMerkez < acisalYaricap) return true
        return kutuUzakligi(C, bounds) < acisalYaricap
      })
      karaKoleksiyon = { type: 'FeatureCollection', features: secilen.map((s) => s.feature) }
    }

    // 1 — Küre gövdesi (deniz)
    const g = ctx.createRadialGradient(-R * 0.35, -R * 0.32, R * 0.05, 0, 0, R)
    g.addColorStop(0, RENK.denizIc)
    g.addColorStop(0.62, RENK.denizIc)
    g.addColorStop(1, RENK.denizDis)
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.fillStyle = g
    ctx.fill()

    // 2 — Kara (bej) + kıyı çizgisi
    const karaD = yol(karaKoleksiyon)
    if (karaD) {
      const path = new Path2D(karaD)
      ctx.fillStyle = RENK.arazi
      ctx.fill(path)
      ctx.strokeStyle = RENK.kiyi
      ctx.lineWidth = 0.9 * lw
      ctx.lineJoin = 'round'
      ctx.stroke(path)
    }

    // 3 — Ülke sınırları (siyah) — aynı geometri, sadece stroke
    if (karaD) {
      const path = new Path2D(karaD)
      ctx.strokeStyle = RENK.sinir
      ctx.lineWidth = 0.45 * lw
      ctx.stroke(path)
    }

    // 4 — Göller + Hazar
    const golD = yol(katman.gol)
    if (golD) {
      ctx.beginPath()
      ctx.fillStyle = RENK.gol
      ctx.fill(new Path2D(golD))
    }

    // 5 — Doğru cevap vurgusu
    const v = vurgulaRef.current
    if (v) {
      const vD = yol(v.shape)
      if (vD) {
        const path = new Path2D(vD)
        ctx.fillStyle = RENK.vurgu
        ctx.globalAlpha = 0.4
        ctx.fill(path)
        ctx.globalAlpha = 1
        ctx.strokeStyle = RENK.vurguKenar
        ctx.lineWidth = 1.8 * lw
        ctx.stroke(path)
      }
    }

    // 6 — Küre iç gölgesi + kenar (hacim)
    const golge = ctx.createRadialGradient(0, 0, R * 0.66, 0, 0, R)
    golge.addColorStop(0, 'rgba(13,27,40,0)')
    golge.addColorStop(0.93, 'rgba(13,27,40,0.26)')
    golge.addColorStop(1, 'rgba(13,27,40,0.4)')
    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.fillStyle = golge
    ctx.fill()

    ctx.beginPath()
    ctx.arc(0, 0, R, 0, Math.PI * 2)
    ctx.strokeStyle = RENK.kenar
    ctx.lineWidth = 1.4 * lw
    ctx.stroke()

    // 7 — Yanlış cevap çizgisi (cevap aşamasında) + kullanıcı pini
    const p1 = pinRef.current
    const hv = vurgulaRef.current
    if (p1 && hv) {
      /* Cevap aşaması: vurgula (doğru ülke) + pin (kullanıcının tıkladığı
         yer) birlikte hazır. İstenen — seçtiğin yerle DOĞRU YER arasında
         kırmızı hat. Hat geoPath ile çizilir: projection clipAngle=90 ve
         d3 örnekleme sayesinde çizgi küre yüzeyini izleyen geodezi (büyük
         çember) olur; arka yarımküreye geçersek ufukta KESİLİR.
         (Eskiden çizgi (0,0) — kürenin ekran mercanı — ile pini
         birleştiriyordu; bağladığı hiçbir şey yoktu, gözle testte
         "saçma sapan bir yerde" görünüyordu. 2026-11-08.) */
      const hatGeometri: LineString = { type: 'LineString', coordinates: [p1, hv.isabet] }
      const hat = yol(hatGeometri)
      if (hat) {
        ctx.save()
        ctx.setLineDash([6 * lw, 4 * lw])
        ctx.strokeStyle = RENK.pin
        ctx.globalAlpha = 0.9
        ctx.lineWidth = 1.6 * lw
        ctx.lineJoin = 'round'
        ctx.lineCap = 'round'
        ctx.stroke(new Path2D(hat))
        ctx.restore()
      }
    }

    /* d3'ün orthographic projeksiyonu arka yarımküreyi KIRPMAZ (clipAngle
       yalnızca dolgu/çizgi geometrisine uygulanır, tek bir noktaya değil) —
       arkadaki nokta öne aynalanmış çizilirdi. Küre döndürülünce pin başka
       bir ülkenin üstünde görünüyordu; merkeze açısal uzaklık 90°'yi
       geçiyorsa pin görünür yarımkürede değildir, çizme. */
    if (p1 && geoDistance(bakisMerkezi(p), p1) <= Math.PI / 2) {
      const n = p([p1[0], p1[1]])
      if (n) {
        ctx.save()
        ctx.beginPath()
        ctx.arc(n[0], n[1], 4 * lw, 0, Math.PI * 2)
        ctx.fillStyle = RENK.pin
        ctx.fill()
        ctx.strokeStyle = '#fff'
        ctx.lineWidth = 1.2 * lw
        ctx.stroke()
        ctx.restore()
      }
    }
  }, [katman])

  const cizErtele = useCallback(() => {
    if (kareRef.current !== null) return
    kareRef.current = requestAnimationFrame(() => {
      kareRef.current = null
      ciz()
    })
  }, [ciz])

  /* ── Animasyon denetleyicisi ────────────────────────────────────────────
     ÖNCEKİ DURUM: "Yön İpucu" ve "Karşı Yarıküre" kendi `setInterval`
     animasyonlarını bağımsız çalıştırıyordu. Aynı anda ikisi birden
     basıldığında ikisi de `p.rotate()` çağırıyor, son yazan kazanıyordu —
     ölçüldü: küre hedefe giderken geri dönüyor (karakter sayısı
     13741 → 13046 → 11762) ve tek karelik görüntü titremeleri oluyordu.

     AYRICA: kullanıcı animasyon sürerken küreyi sürüklediğinde sürükleme
     anında çalışıyor, bırakınca animasyon küreyi geri çekiyordu
     (ölçüldü: 48187 → 63761 kullanıcı sürükledi → 32109 animasyon geri aldı).
     Kullanıcının girdisi her zaman kazanmalı.

     Çözüm: tek bir animasyon yuvası. Yeni animasyon eskisini iptal eder;
     sürükleme ve tekerlek de animasyonu iptal eder. */
  const animasyonRef = useRef<number | null>(null)
  const animasyonuDurdur = useCallback(() => {
    if (animasyonRef.current !== null) {
      window.clearInterval(animasyonRef.current)
      animasyonRef.current = null
    }
  }, [])

  /** Kare kare rotasyon (ve isteğe bağlı zoom) animasyonu oynatır. */
  const animasyonuOynat = useCallback(
    (adim: (t: number) => void, kare: number) => {
      animasyonuDurdur()
      let i = 0
      animasyonRef.current = window.setInterval(() => {
        i++
        if (i > kare) {
          animasyonuDurdur()
          return
        }
        adim(i / kare)
        ciz()
      }, 16)
    },
    [animasyonuDurdur, ciz],
  )

  // ── Canvas boyutlandırma ────────────────────────────────────────────────
  const olcekle = useCallback(() => {
    const sarma = sarmaRef.current
    const canvas = canvasRef.current
    if (!sarma || !canvas) return
    const r = sarma.getBoundingClientRect()
    if (r.width < 2 || r.height < 2) return
    const dpr = Math.min(window.devicePixelRatio || 1, AZAMI_DPR)
    canvas.width = Math.round(r.width * dpr)
    canvas.height = Math.round(r.height * dpr)
    canvas.style.width = `${r.width}px`
    canvas.style.height = `${r.height}px`
    // Küre yarıçapı kapsayıcıya göre — sabit 150px genişte küreyi küçük
    // bırakıyordu (bkz. yaricapRef yorumu). Kısa kenarın ~%45'i.
    const yeniYaricap = Math.max(60, Math.min(r.width, r.height) * 0.45)
    if (Math.abs(yeniYaricap - yaricapRef.current) > 0.5) {
      yaricapRef.current = yeniYaricap
      projeksiyonRef.current.scale(yeniYaricap)
    }
    ciz()
  }, [ciz])

  useEffect(() => {
    olcekle()
    const sarma = sarmaRef.current
    if (!sarma) return
    const gozlemci = new ResizeObserver(olcekle)
    gozlemci.observe(sarma)
    return () => gozlemci.disconnect()
  }, [olcekle])

  // ── Yakınlaştırma + döndürme + tıklama ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const p = projeksiyonRef.current

    /** Ekran koordinatı → küre uzayı (zoom transformu ters çevrilir) */
    const kureUzayi = (clientX: number, clientY: number): [number, number] => {
      const b = canvas.getBoundingClientRect()
      const z = zoomRef.current
      const cx = b.width / 2
      const cy = b.height / 2
      return [(clientX - b.left - cx - z.x) / z.k, (clientY - b.top - cy - z.y) / z.k]
    }

    /* Zoom imleç altında sabit kalır: imlecin küre uzayındaki konumu
       değişmeden kalan x/y'yi yeniden hesapla. */
    const tekerlek = (ev: WheelEvent) => {
      ev.preventDefault()
      // Kullanıcı girdisi animasyonu her zaman yener
      animasyonuDurdur()
      const z = zoomRef.current
      const b = canvas.getBoundingClientRect()
      const cx = b.width / 2
      const cy = b.height / 2
      // İmlecin küre uzayındaki konumu (mevcut zoom ile)
      const gx = (ev.clientX - b.left - cx - z.x) / z.k
      const gy = (ev.clientY - b.top - cy - z.y) / z.k

      /* deltaMode: 0 = piksel (çoğu fare/trackpad — varsayılan davranış),
         1 = DOM_DELTA_LINE (bazı Firefox/Windows kurulumları — ~16px/satır),
         2 = DOM_DELTA_PAGE. Normalize etmezsek satır modunda bir tık yalnızca
         ~%2 zoom yapıyordu (deltaY≈3 iken piksel bekleniyordu). */
      const deltaPiksel =
        ev.deltaMode === 1 ? ev.deltaY * 16 : ev.deltaMode === 2 ? ev.deltaY * b.height : ev.deltaY

      const yeniK = Math.max(ZOOM_ASGARI, Math.min(ZOOM_MAKS, z.k * Math.exp(-deltaPiksel * ZOOM_MUL)))
      if (yeniK === z.k) return
      // Aynı coğrafi nokta imlecin altında kalsın
      zoomRef.current = {
        k: yeniK,
        x: ev.clientX - b.left - cx - gx * yeniK,
        y: ev.clientY - b.top - cy - gy * yeniK,
      }
      cizErtele()
    }
    canvas.addEventListener('wheel', tekerlek, { passive: false })

    /* Döndürme — küre "spin" etkileşimi.
       Rotasyon her karede sürükleme BAŞINDAKİ rotasyona + o ana kadarki TOPLAM
       sürükleme mesafesi uygulanarak hesaplanır: kümülatif olduğu için kare
       hızından bağımsızdır ve hata birikmez.

       Sürükleme tek bir pointerId ile kilitlidir. Aksi halde ikinci bir parmak
       başlangıç noktasını ezer ve küre zıplardı. */
    let surukleyenId: number | null = null
    let basX = 0
    let basY = 0
    let basRotasyon: [number, number] = [0, 0]
    /** Sürükleme başladı mı (hareket eşiğini geçti mi) */
    let adayId: number | null = null
    /** En az bir pointerdown geldi mi — tikla()'daki konum koruması
        basX/basY'yi kullanır; ilk basıştan önce anlamsız koordinat
        karşılaştırmasına girmemek için tutulur. */
    let bastiMi = false
    /** Son sürükleme bırakışının zaman damgası. Bırakışın hemen ardından
        gelen "click" seçim yapmasın diye tikla() 350ms penceresi içinde
        gelen click'i yutar. Her YENİ pointerdown sayacı sıfırlar — hızlı
        oynayıcı bırakıştan hemen sonra gelen gerçek tıklamasını kaybetmesin. */
    let sonSuruBitti = 0

    /** Sürüklemeyi temizler — pointerId hangisi olursa olsun. */
    const suruklemeyiBirak = (ev: PointerEvent | null) => {
      if (ev && surukleyenId !== null && canvas.hasPointerCapture?.(surukleyenId)) {
        canvas.releasePointerCapture(surukleyenId)
      }
      surukleyenId = null
      adayId = null
      canvas.style.cursor = 'grab'
    }

    const onPointerDown = (ev: PointerEvent) => {
      if (ev.button !== 0) return
      if (surukleyenId !== null) return // zaten sürüklüyoruz, ikinci parmak yoksay
      adayId = ev.pointerId
      basX = ev.clientX
      basY = ev.clientY
      bastiMi = true
      /* Yeni bir jest başladı: önceki bırakışın zaman koruması artık geçersiz
         (yoksa hızlı oynayıcı "bırakış → hemen tıklama" serisinde tıklamasını
         kaybederdi). */
      sonSuruBitti = 0
    }

    const onPointerMove = (ev: PointerEvent) => {
      // Düğme bırakılmış ama pointermove geldi (pencere dışında bırakma gibi).
      // Önceden sadece bayrakları sıfırlıyorduk; imleç 'grabbing'de kalıyor ve
      // pointer capture sızmış oluyordu.
      if (!ev.buttons) {
        /* Capture sessizce kaybolursa (pencere dışında bırakma gibi) buraya
           pointerup HİÇ gelmez: etkileşimi burada bitirip, sürükleme engaged
           idiysa bırakış zamanını işaretleriz — sonra gelen click seçim
           yapmasın diye. Bayrak da temizlenir ki sonraki GERÇEK tıklama
           yutulmasın (bayrağı tüketen click hiç gelmiyor çünkü). */
        if (surukleyenId !== null || adayId !== null) {
          if (donuyorRef.current) sonSuruBitti = Date.now()
          donuyorRef.current = false
          suruklemeyiBirak(ev)
        }
        return
      }
      if (surukleyenId === null) {
        if (adayId !== ev.pointerId) return
        // Tıklama mı sürükleme mi ayrımı — 3px eşiği
        if (Math.hypot(ev.clientX - basX, ev.clientY - basY) < 3) return
        surukleyenId = ev.pointerId
        donuyorRef.current = true
        /* Kullanıcı küreyi ele geçirdi: çalışan animasyon varsa iptal et.
           Yoksa ipucu/yarımküre animasyonu sürüklemeyi bitirip küreyi geri
           çekiyordu (ölçüldü: 63761 → 32109). */
        animasyonuDurdur()
        canvas.style.cursor = 'grabbing'
        const rot = p.rotate()
        basRotasyon = [rot[0], rot[1]]
        /* Pointer capture SONRA denenir: fırlarsa (işaretçi artık aktif
           değil — sentetik girdi ya da iptal edilmiş nokta gibi durumlarda
           NotFoundError) temel rotasyon en azından güncel kalmış olur.
           Eski sırada fırlama basRotasyon'u eski halinde bırakıyor,
           küre bırakınca sıçrıyordu. */
        try {
          canvas.setPointerCapture?.(ev.pointerId)
        } catch {
          /* capture başarısız olabilir; etkileşim yine çalışır */
        }
        return
      }
      // Başka bir parmak hareket ediyorsa yoksay
      if (ev.pointerId !== surukleyenId) return

      // Sürükleme başından bu yana TOPLAM mesafe
      const toplamDx = ev.clientX - basX
      const toplamDy = ev.clientY - basY

      // Ekran piksel → küre uzayı pikseli → coğrafi derece.
      // Orthographic'de küre yarıçapı R ise 2R küre pikseli 360°'ye denk gelir.
      const z = zoomRef.current
      const derece = 180 / Math.PI
      const dereceX = (toplamDx / z.k / yaricapRef.current) * derece
      const dereceY = (toplamDy / z.k / yaricapRef.current) * derece

      p.rotate([
        /* YÖN — "tut ve çek" (grab): yakaladığın yüzey noktası imleçle birlikte
           hareket eder. d3 rotate()'ın konvansiyonu merkeze gelen noktayı
           (−λ, −φ) yapar; bunun anlamı λ artınca görünür içeriğin SAĞA
           kaymasıdır. Sağa sürükleme içeriği sağa taşımak istiyorsa λ
           ARTMALI, içerik aşağı kaymalıysa merkez enlemi (−φ) artmalı —
           yani φ AZALMALI:
           yatay λ0 + dereceX, dikey φ0 − dereceY.
           (Eskiden işaretler tersydi: sağa sürükleyince dünya sola,
           yukarı çekince aşağı akıyordu; gözle testte fark edildi,
           2026-11-08.) */
        basRotasyon[0] + dereceX,
        Math.max(-85, Math.min(85, basRotasyon[1] - dereceY)),
      ])
      cizErtele()
    }

    const onPointerUp = (ev: PointerEvent) => {
      if (ev.pointerId === surukleyenId || ev.pointerId === adayId) {
        if (donuyorRef.current) {
          /* Sürükleme bırakıldı: arkasından gelen click tikla()'da konum ve
             zaman korumasıyla yutulur. Bayrağı burada temizliyoruz — click
             hiç gelmezse (pencere dışına bırakış gibi) bayrak true kalarak
             SONRAKİ gerçek tıklamayı yutacaktı. */
          sonSuruBitti = Date.now()
          donuyorRef.current = false
        }
        suruklemeyiBirak(ev)
      }
      // pointercancel arkasından click GELMEZ; donuyorRef'i temizlemezsek
      // bir sonraki geçerli tıklama yutulur.
      if (ev.type === 'pointercancel') donuyorRef.current = false
    }

    const tikla = (ev: MouseEvent) => {
      /* Bırakış-koruması — üç faktör, tarayıcı olay sırasına güvenmez:
         1) KONUM: click'in koordinatları basış (basX/basY) ile aynı yerde
            olmalı. Sürükleme sonrası gelen click BIRAKMA noktasında
            yayınlanır; mesafe >6px ise bu bir sürüklemeydi.
         2) ZAMAN: son bırakıştan <350ms gelen click yutulur — küçük
            gezinmelerde koordinat farkı 6px altında kalabilir.
         3) BAYRAK: pointercancel / etkileşim-kaybı yolları için kalan bayrak. */
      if (bastiMi && Math.hypot(ev.clientX - basX, ev.clientY - basY) > 6) return
      if (Date.now() - sonSuruBitti < 350) return
      if (donuyorRef.current) {
        donuyorRef.current = false
        return
      }
      if (kilitliRef.current) return
      if (!p.invert) return
      const n = p.invert(kureUzayi(ev.clientX, ev.clientY))
      if (!n) return
      const nokta: [number, number] = [n[0], n[1]]

      /* Hit-test tıklama anında. Önce ucuz sınır-kutusu ön filtresi, sonra
         yalnızca adaylar için geoContains — ÇİZİLEN geometriyle
         (`gorselSekil`): uzaktayken hibrit (110m) görünür, her zaman 50m
         `shape` ile test etmek kıyı şeridinde görünenle sayılanı
         ayrıştırıyordu. Eşik, çizimdekiyle aynı (R·k ≥ YARICAP·ZOOM_DETAY).
         Sınır kutusu 50m'den gelir; +1° pay 110m farkını örter.

         DİKKAT — sarmalanmış sınır kutusu: antimeridian'ı geçen ülkelerde
         (ABD, Rusya, Yeni Zelanda, Kiribati) bounds[0][0] > bounds[1][0] olur.
         "lon >= bati && lon <= dogu" kontrolü bu durumda HİÇ geçmez, yani o
         ülkeler kalıcı olarak tıklanamaz olurdu. Aşağıdaki bakış, kutuyu
         iki aralığa bölerek bu durumu düzeltir. */
      let ulke: Country | null = null
      const [lon, lat] = nokta
      const detayMi = yaricapRef.current * zoomRef.current.k >= YARICAP * ZOOM_DETAY
      for (const u of countries) {
        const [[bati, guney], [dogu, kuzey]] = u.bounds
        if (lat < guney - 1 || lat > kuzey + 1) continue
        const lonUygun = bati <= dogu ? lon >= bati - 1 && lon <= dogu + 1 : lon >= bati - 1 || lon <= dogu + 1
        if (!lonUygun) continue
        if (geoContains(gorselSekil(u, detayMi), nokta)) {
          ulke = u
          break
        }
      }
      const limbde = limbteMi(p, nokta)
      onTiklaRef.current?.(nokta, ulke, limbde)
    }

    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', onPointerUp)
    canvas.addEventListener('pointercancel', onPointerUp)
    canvas.addEventListener('click', tikla)
    canvas.style.cursor = 'grab'

    setHazir(true)
    /* Ekran çözünürlüğü değişince (başka monitöre sürükleme, tarayıcı yakınlaştırma)
       ResizeObserver tetiklenmez — CSS boyutu değişmediği için. Böylece canvas
       eski device-piksel boyutunda kalır ve bulanık çizim olur. */
    window.addEventListener('resize', olcekle)
    return () => {
      window.removeEventListener('resize', olcekle)
      canvas.removeEventListener('wheel', tekerlek)
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', onPointerUp)
      canvas.removeEventListener('pointercancel', onPointerUp)
      canvas.removeEventListener('click', tikla)
      /* Bekleyen kareyi iptal ederken referansı da BOŞALTMALIYIZ. Yoksa
         kareRef kalıcı olarak ölü bir kimlik tutar, cizErtele her çağrıda
         erken döner ve sürükleme/yakınlaştırma hiç yeniden çizmez. */
      if (kareRef.current !== null) {
        cancelAnimationFrame(kareRef.current)
        kareRef.current = null
      }
      suruklemeyiBirak(null)
      donuyorRef.current = false
    }
  }, [ciz, cizErtele, olcekle, animasyonuDurdur])

  // Bileşen kapanırken animasyon da dursun (setInterval sızıntısı)
  useEffect(() => () => animasyonuDurdur(), [animasyonuDurdur])

  useEffect(() => {
    if (hazir) ciz()
  }, [pin, vurgula, hazir, ciz])

  /* Karşı yarımküre — küreyi 180° çevir.
     Küre tek seferde dünyanın yarısını gösterdiği için doğru ülke arkada
     kalabiliyor ve oyuncu sıkışıyordu. Bu düğme cevabı HİÇ VERMEZ: sadece
     bakılan yarımküreyi değiştirir, kullanıcı yine kendi bulur.

     Yön sabit: her basışta küre aynı yöne döner. (rotasyonYolu 180°'yi "en kısa
     yol"a çekip yönü atıyordu; burada bilerek doğrudan interpolasyon yapılıyor.) */
  const oncekiYariKureRef = useRef(false)
  useEffect(() => {
    if (!hazir) return
    const hedefDurum = digerYariKure ?? false
    if (hedefDurum === oncekiYariKureRef.current) return
    oncekiYariKureRef.current = hedefDurum

    const p = projeksiyonRef.current
    const [lam0, phi0] = p.rotate()

    animasyonuOynat((t) => {
      // Yumuşatma (ease-in-out) — başta ve sonda yavaş
      const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
      p.rotate([lam0 - 180 * e, phi0])
    }, 54)
  }, [digerYariKure, hazir, animasyonuOynat])

  /* Hedef ülkeyi animasyonla göster — sadece kullanıcı "Yön İpucu"na bastığında.
     Cevap sonrası OTOMATİK çalışmaz: kullanıcı doğru ülkeyi az önce tıkladı,
     harita zaten doğru yerde; otomatik hareket yön duygusunu bozuyordu.

     YAKINLAŞTIRMA: Ülkeyi ~200px genişliğinde göstermeye çalışır, ama en fazla
     6x. Sınırsız yakınlaştırma küreyi "boşluğa" sokuyordu (küçük ülkelerde
     420/0.5 = 840x hesaplanıyordu). */
  useEffect(() => {
    if (!hedefiGoster || !hazir) return
    const p = projeksiyonRef.current
    const [lam0, phi0] = p.rotate()
    /* d3 rotate([λ, φ]) çağrısından sonra merkezde duran nokta (-λ, -φ) olur;
       bu yüzden hedef daima [-lon, -lat]. "Görünmüyorsa 180 - lon" dalı
       ülkeyi öne değil ARKAYA itiyordu (1000 senaryonun 446'sı yanlış).
       KAYNAK `isabet`, `centroid` değil: centroid okyanusa düşüyordu ve
       ipucu boş suyu gösteriyordu. Yol bir kez hesaplanır, kare başına
       yeniden üretilmez. */
    const yol = rotasyonYolu([lam0, phi0], hedefRotasyon(hedefiGoster), 46)
    /* Derece başına piksel = yarıçap × radyan/derece (bir derecelik yay
       uzunluğu R·θ'dir, θ=π/180). Eskiden YARICAP/180 kullanılıyordu — π
       kat küçük çıkıyor, bu da hedefK'yı π kat BÜYÜK hesaplayıp neredeyse
       her ülkede 6x tavanına yapıştırıyordu. */
    const pxBasinaDerece = (yaricapRef.current * Math.PI) / 180
    const hedefK = Math.max(1, Math.min(6, 200 / (hedefiGoster.kutu[0] * pxBasinaDerece)))
    const basZoom = zoomRef.current

    animasyonuOynat((t) => {
      const n = yol[Math.min(yol.length - 1, Math.floor(t * yol.length))]
      if (n) p.rotate(n)
      // Yumuşatma: başta hızlı, sonda yavaş
      const e = 1 - (1 - t) ** 2
      zoomRef.current = { k: basZoom.k + (hedefK - basZoom.k) * e, x: 0, y: 0 }
    }, 46)
  }, [hedefiGoster, hazir, animasyonuOynat])

  /* İpucu bittikten / tur değiştikten sonra yakınlaştırmayı geri al.
     Yoksa 1. turda ipucu kullanıldıktan sonra küre 6x kalıyor ve döndürme
     6 kat yavaşlıyor (döndürme `1 / z.k` ile ölçekleniyor) — oyun boyunca
     giderek zorlaşıyordu. */
  const sonIpucuRef = useRef<Country | null>(null)
  useEffect(() => {
    if (hedefiGoster) {
      sonIpucuRef.current = hedefiGoster
      return
    }
    if (sonIpucuRef.current) {
      sonIpucuRef.current = null
      /* hedefiGoster efekti (yukarıda) bir animasyon başlatmış olabilir;
         onu iptal etmezsek 46 karelik interval bu sıfırlamadan HEMEN sonra
         zoomRef'i tekrar hedefe doğru yazmaya devam ediyordu — küre 6x'te
         "takılı" kalmış gibi görünüyordu. */
      animasyonuDurdur()
      const z = zoomRef.current
      if (z.k !== 1 || z.x !== 0 || z.y !== 0) {
        zoomRef.current = { k: 1, x: 0, y: 0 }
        ciz()
      }
    }
  }, [hedefiGoster, ciz, animasyonuDurdur])

  return (
    <div ref={sarmaRef} className={className}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label="Dünya küresi. Ülke adları haritada yazılı değildir."
      />
    </div>
  )
}
