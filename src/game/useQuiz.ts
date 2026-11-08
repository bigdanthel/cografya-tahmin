import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { havuz, type Country } from '../lib/world'
import { tiklamayiPuanla, toplamPuan, BASLIK_PUAN, YON_IPUCU_CEZASI, type PuanKutusu } from './score'
import { secenekUret, type Secenek } from './basKentSecenekleri'
import { korlukIpuclari, agirlikliSecim, gununUlkesi, type ModTanimi, type Soru, type TurSonucu, type Asama, type Ipucu } from './types'
import { ses } from './ses'
import { yukle, kaydet, turEkle, dailyKaydet, type Istatistik } from './storage'

function soruUret(u: Country, modId: string): Soru {
  const ipucu: Soru['ipucu'] = modId === 'korluk' ? 'yok' : modId === 'bayrak' ? 'bayrak' : 'ad'
  const basKentSorusu = modId !== 'hiz'
  return {
    hedef: u,
    ipucu,
    ipuclari: modId === 'korluk' ? korlukIpuclari(u) : [],
    basKentSorusu,
    // Seçenekler soru oluşturulurken hazırlanır; yeniden render'da değişmez
    secenekler: basKentSorusu ? secenekUret(u, havuz) : [],
  }
}

export interface QuizApi {
  asama: Asama
  mod: ModTanimi | null
  soru: Soru | undefined
  sira: number
  turSayisi: number
  tiklama: [number, number] | null
  /** Tıklama anında hesaplanan konum puanı */
  konumKutusu: PuanKutusu | null
  sonTuru: TurSonucu | null
  turSonuclari: TurSonucu[]
  istatistik: Istatistik
  kalanSure: number | null
  /** Küre kenarına tıklama uyarısı görünür mü */
  limbdeUyarisi: boolean
  bitis: boolean
  toplamPuan: number
  dogruSayisi: number
  toleransliSayisi: number
  /** Şu ana kadar açılmış ipuçları (Körlük modunda 1'den başlar) */
  gorulenIpuclari: Ipucu[]
  /** Sıradaki ipucunun maliyeti; başka ipucu kalmadıysa null */
  siradakiIpucu: Ipucu | null
  /** Bu turda toplam ipuç cezası */
  ipucuCezasi: number
  ipucuAl: () => void
  /** "Yön İpucu" bu turda kullanıldı mı (kalıcı ceza — bkz. yonIpucuBildir) */
  yonIpucuKullanildi: boolean
  /** Küreyi hedefe döndüren "Yön İpucu" düğmesine basıldığını bildirir;
      turda ilk kullanımda kalıcı bir puan cezası uygular. Körlük modunda
      çağırmadan önce arayüz düğmeyi zaten gizler/kapatır. */
  yonIpucuBildir: () => void
  /** Her `baslat()` çağrısında artar — Günün Ülkesi'nde mod.id ve sira
      "Tekrar oyna"da DEĞİŞMEDİĞİ için (tek soru, hep 0), App.tsx'teki
      hedefGoster/yariKure sıfırlama efekti bu sayaç olmadan tetiklenmiyordu. */
  oyunNo: number
  baslat: (mod: ModTanimi) => void
  tikla: (nokta: [number, number], ulke: Country | null, limbde: boolean) => void
  tiklamayiOnayla: () => void
  /** Tıklamayı geri al, oyun aşamasına dön, yeniden seçime izin ver */
  tiklamayiIptalEt: () => void
  /** Başkent sorusunu atla, turu kapat (konum puanı korunur) */
  basKentiAtla: () => void
  /** Başkent seçeneği seçildi (çoktan seçmeli) */
  basKentSec: (secenek: Secenek) => void
  devamEt: () => void
  cikis: () => void
}

export function useQuiz(): QuizApi {
  const [mod, setMod] = useState<ModTanimi | null>(null)
  const [asama, setAsama] = useState<Asama>('oyun')
  const [sorular, setSorular] = useState<Soru[]>([])
  const [sira, setSira] = useState(0)
  const [tiklama, setTiklama] = useState<[number, number] | null>(null)
  const [sonTuru, setSonTuru] = useState<TurSonucu | null>(null)
  /** Tıklama anında hesaplanan konum puanı — geri bildirim kartı hemen görünsün */
  const [konumKutusu, setKonumKutusu] = useState<PuanKutusu | null>(null)
  const [turSonuclari, setTurSonuclari] = useState<TurSonucu[]>([])
  const [istatistik, setIstatistik] = useState<Istatistik>(() => yukle())
  const [kalanSure, setKalanSure] = useState<number | null>(null)
  /** Küre kenarına tıklandı — kullanıcıya kısa uyarı göster */
  const [limbdeUyarisi, setLimbdeUyarisi] = useState(false)
  /** Bu turda açılan ipucu sayısı (Körlük modunda; ilki bedava) */
  const [ipucuAdedi, setIpucuAdedi] = useState(1)
  /** "Yön İpucu" bu turda kullanıldı mı — kullanılınca kalıcı, ceza turuKapat'ta uygulanır */
  const [yonIpucuKullanildi, setYonIpucuKullanildi] = useState(false)
  const yonIpucuKullanildiRef = useRef(false)
  yonIpucuKullanildiRef.current = yonIpucuKullanildi
  const [oyunNo, setOyunNo] = useState(0)

  // Zamanlayıcı, güncel tur bilgisine erişmesi için ref
  const kalanSureRef = useRef<number | null>(null)
  kalanSureRef.current = kalanSure

  /* Bu turun kapandı mı bayrağı.
     Aynı karede (batched) gelen çoklu tıklamalar hem turu iki kez
     kapatabiliyor hem de "Sıradaki" birden fazla soru atlatabiliyordu
     (ölçüldü: senkron 5 tıklama turu 5 kez, soruyu 1'den 6'ya atlatıyordu).

     DİKKAT: bu ref bir EFFECT ile güncellenemez — efektler render'dan
     sonra, iki tıklama arasında çalışmaz, yani aynı karede hâlâ `null`
     görünürdü. Doğrudan `turuKapat`/`devamEt` içinde yazılır. */
  const sonTuruRef = useRef<TurSonucu | null>(null)
  /** Kenar uyarısını kapatan zamanlayıcı — art arda iki kenar tıklamasında
      ilki ikincinin uyarısını erken kapatmasın diye önceki iptal edilir. */
  const limbZamanlayiciRef = useRef<number | null>(null)

  useEffect(() => {
    kaydet(istatistik)
  }, [istatistik])

  const soru = sorular[sira]
  const turSayisi = sorular.length

  // ── Tur başlat ─────────────────────────────────────────────────────────
  const baslat = useCallback(
    (secilen: ModTanimi) => {
      const sec = (gorulen: Set<string>): Country => {
        if (secilen.id === 'daily') return gununUlkesi(havuz)
        // Önce hiç sorulmamış ve doğru bilinmeyenler
        const yeni = havuz.filter(
          (c) => !gorulen.has(c.anahtar) && !(istatistik.ulkeBazli[c.anahtar]?.dogru ?? 0),
        )
        const kalan = havuz.filter((c) => !gorulen.has(c.anahtar))
        const aday = yeni.length ? yeni : kalan.length ? kalan : havuz
        // Kolay modda zorluk ağırlıklı seçim (kolay ülkeler daha sık);
        // diğer modlarda uniform — zorluk çeşitliliği oyunun parçası.
        return secilen.id === 'kolay' ? agirlikliSecim(aday) : aday[Math.floor(Math.random() * aday.length)]!
      }

      const gorulen = new Set<string>()
      const list: Soru[] = []
      const adet = secilen.id === 'daily' ? 1 : secilen.turSayisi
      for (let i = 0; i < adet; i++) {
        const u = sec(gorulen)
        gorulen.add(u.anahtar)
        list.push(soruUret(u, secilen.id))
      }

      setMod(secilen)
      setSorular(list)
      setSira(0)
      setAsama('oyun')
      setTiklama(null)
      setKonumKutusu(null)
      setSonTuru(null)
      setTurSonuclari([])
      setKalanSure(secilen.sure ?? null)
      setIpucuAdedi(1)
      setYonIpucuKullanildi(false)
      setOyunNo((n) => n + 1)
      sonTuruRef.current = null
    },
    [istatistik],
  )

  const cikis = useCallback(() => {
    setMod(null)
    setSorular([])
    setSira(0)
    setAsama('oyun')
    setTiklama(null)
    setSonTuru(null)
    setTurSonuclari([])
    setKalanSure(null)
    setIpucuAdedi(1)
    setYonIpucuKullanildi(false)
    sonTuruRef.current = null
  }, [])

  // ── Süre sayacı ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!mod?.sure || mod.id === 'daily' || asama === 'sonuc') return
    if (kalanSure === null || kalanSure <= 0) return
    const id = window.setInterval(() => {
      setKalanSure((s) => (s === null || s <= 1 ? 0 : s - 1))
    }, 1000)
    return () => window.clearInterval(id)
  }, [mod, asama, kalanSure])

  /* Süre dolduğunda ve oyuncu henüz tıklamamışsa oyunu bitir.
     Sayaç 0'a indiğinde yukarıdaki efekt erken dönüyor ve asama'yı değiştiren
     tek yer turuKapat() içindeydi — o da yalnızca tur TAMAMLANINCA çalışıyor.
     Sonuç: süre bittikten sonra oyun sonsuza dek oynanabiliyordu, üstelik
     saat rozeti de kayboluyordu.

     YALNIZCA 'oyun' aşamasındayken zorlar: oyuncu son sorunun cevap kartını
     ('cevap') okurken zaman dolarsa onu 'sonuc'a fırlatmaz — devamEt() zaten
     sureBitti'yi görüp oraya geçirir (bkz. turuKapat/devamEt). */
  useEffect(() => {
    if (!mod?.sure || mod.id === 'daily') return
    if (kalanSure !== 0 || asama !== 'oyun') return
    setAsama('sonuc')
  }, [mod, kalanSure, asama])

  // ── Tıklama ────────────────────────────────────────────────────────────
  /** Küre kenarına tıklamayı reddet — orada ülke korkunç şekilde ezilir ve
      yanlış ülkeye denk gelme ihtimali çok yüksektir. */
  const tikla = useCallback(
    (nokta: [number, number], ulke: Country | null, limbde = false) => {
      if (asama !== 'oyun' || tiklama || !soru) return
      // Kıtadaki küçük/uzak ülkeler küre kenarında tıklanamaz hale gelir;
      // kullanıcı en azından doğru yeri görebilsin diye tıklama yok sayılır.
      if (limbde) {
        setLimbdeUyarisi(true)
        ses.kenar()
        if (limbZamanlayiciRef.current !== null) window.clearTimeout(limbZamanlayiciRef.current)
        limbZamanlayiciRef.current = window.setTimeout(() => {
          limbZamanlayiciRef.current = null
          setLimbdeUyarisi(false)
        }, 2200)
        return
      }
      const kutu = tiklamayiPuanla(soru.hedef, nokta, ulke?.anahtar ?? null)
      setKonumKutusu(kutu)
      setTiklama(nokta)
      ses.tikla()
    },
    [asama, tiklama, soru],
  )

  // ── Körlük modu ipuçları ────────────────────────────────────────────────
  /* Kademeli: ilk ipucu (kıta) bedava, sonrakiler puan karşılığında açılır.
     Ceza tur kapanırken düşülür — kullanıcı "ne kadar ipucu istedim"
     diye düşünmeden tek tek açabilsin diye. */
  const ipucuSayaciRef = useRef(1)
  ipucuSayaciRef.current = ipucuAdedi

  const ipucuAl = useCallback(() => {
    if (asama !== 'oyun' || !soru) return
    if (ipucuSayaciRef.current >= soru.ipuclari.length) return
    setIpucuAdedi((n) => n + 1)
    ses.sec()
  }, [asama, soru])

  /* Yön İpucu bir kez kullanılınca ceza kalıcıdır — kapatıp tekrar açmak
     (kamera zaten gösterildiği için) ek ceza getirmez, ama geri de alınmaz. */
  const yonIpucuBildir = useCallback(() => {
    if (asama !== 'oyun' || yonIpucuKullanildiRef.current) return
    setYonIpucuKullanildi(true)
  }, [asama])

  const gorulenIpuclari = useMemo(
    () => (soru ? soru.ipuclari.slice(0, ipucuAdedi) : []),
    [soru, ipucuAdedi],
  )
  const siradakiIpucu = useMemo(
    () => (soru && ipucuAdedi < soru.ipuclari.length ? soru.ipuclari[ipucuAdedi]! : null),
    [soru, ipucuAdedi],
  )
  const ipucuCezasi = useMemo(
    () => (soru ? soru.ipuclari.slice(1, ipucuAdedi).reduce((t, i) => t + i.maliyet, 0) : 0),
    [soru, ipucuAdedi],
  )

  // ── Turu kapat ve sonucu kaydet ─────────────────────────────────────────
  const turuKapat = useCallback(
    (basGirdi: string, basPuan: number, basTur: TurSonucu['basKentTur'], kutu: PuanKutusu) => {
      if (!soru || !tiklama) return
      /* Çift çağrı koruması — tek bir merkezi yerde: basKentSec, basKentiAtla
         ve tiklamayiOnayla'nın (başkentsiz modlarda) doğrudan çağırdığı yol
         AYNI turu iki kez kapatabiliyordu (ölçüldü: senkron 5 tıklama turu
         iki kez saydı). Fonksiyon senkron olduğu için ikinci çağrı, ilkinin
         sonTuruRef'i yazmasından SONRA çalışır — burada erken dönmek yeterli. */
      if (sonTuruRef.current) return
      /* Süre bonusu yalnızca gerçekten doğru/toleranslı isabette verilir —
         yanlış bir tıklama bile kalan süreyle ödüllendirilmemeli. */
      const dogruIsabet = kutu.tam || kutu.toleransli
      const sureB =
        soru.basKentSorusu || !dogruIsabet
          ? 0
          : Math.max(0, Math.round((kalanSureRef.current ?? 0) * 2))
      const ham = toplamPuan(kutu, basPuan, sureB)
      const istenenIpucu = soru.ipuclari.slice(1, ipucuSayaciRef.current).reduce((t, i) => t + i.maliyet, 0)
      const istenenYon = yonIpucuKullanildiRef.current ? YON_IPUCU_CEZASI : 0
      const istenen = istenenIpucu + istenenYon
      /* Ceza ham puanı aşamaz — "ipucu isteyip eksi puan almak" olmamalı.
         Kırpıldığında ekranda ikisi de gösteriliyor, yoksa oyuncu 5 ipuç
         isteyip yalnızca −15 görünce ne olduğunu anlamıyor. */
      const ceza = Math.min(ham, istenen)
      const toplam = ham - ceza
      const sonuc: TurSonucu = {
        ulke: soru.hedef,
        tiklama,
        kutu,
        basKentGirdi: basGirdi || null,
        basKentPuan: basPuan,
        basKentTur: basTur,
        ham,
        toplam,
        sureBonusu: sureB,
        ipucuSayisi: Math.max(0, ipucuSayaciRef.current - 1) + (yonIpucuKullanildiRef.current ? 1 : 0),
        ipucuMaliyet: istenen,
        ipucuCezasi: ceza,
        /* Toleranslı (komşuya tıklama) kabul PUAN verir ama "tam doğru"
           sayılmaz: seriyi artırmaz, ülkeyi havuzdan düşürmez — oyuncu
           ülkeyi gerçekten bilmiş olmuyor. */
        basarili: kutu.tam,
      }
      setSonTuru(sonuc)
      sonTuruRef.current = sonuc
      /* Günün Ülkesi: sonucu sakla ki streak/rozet günler arası taşınsın. */
      if (mod?.id === 'daily') {
        setIstatistik((o) => dailyKaydet(o, soru.hedef.anahtar, toplam, sonuc.basarili))
      }
      setTurSonuclari((o) => [...o, sonuc])
      setIstatistik((o) => turEkle(o, soru.hedef.anahtar, sonuc.basarili, toplam))

      /* Sonuç HER ZAMAN önce 'cevap' aşamasında gösterilir — son turda da,
         Günün Ülkesi'nde de. Oyuncu doğru/yanlış vurgusunu ve puan
         dağılımını görmeden özet ekranına atlanmıyordu (bkz. devamEt). */
      setAsama('cevap')
      window.setTimeout(() => {
        if (kutu.tam) ses.dogru()
        else if (kutu.toleransli) ses.tolerans()
        else ses.yanlis()
      }, 140)
    },
    [soru, tiklama, mod],
  )

  /** Haritada tıklandı → başkent aşamasına geç (ya da turu direkt kapat) */
  const tiklamayiOnayla = useCallback(() => {
    if (!soru || !tiklama || !konumKutusu) return
    if (!soru.basKentSorusu) {
      turuKapat('', 0, 'bos', konumKutusu)
    } else {
      setAsama('cevap')
    }
  }, [soru, tiklama, konumKutusu, turuKapat])

  /* Başkent sorusunu atla — konum puanı alınmış durumda, kullanıcı devam
     etmek isteyebilir. Başkent puanı 0 kalır (doğru bir ceza değil,
     soruyu cevaplamamanın bedeli). */
  const basKentiAtla = useCallback(() => {
    if (!soru || !tiklama || !konumKutusu) return
    turuKapat('', 0, 'bos', konumKutusu)
  }, [soru, tiklama, konumKutusu, turuKapat])

  /* Tıklamayı geri al — kullanıcı fikrini değiştirmek istiyorsa yeniden seçebilsin.
     Durum temizleme ve aşamaya dönüş TEK işlemde olmalı: ayrı ayrı çağrılırsa
     küre kilitli kalır ve kullanıcı sıkışır. */
  const tiklamayiIptalEt = useCallback(() => {
    setTiklama(null)
    setKonumKutusu(null)
    setSonTuru(null)
    sonTuruRef.current = null
    setAsama('oyun')
  }, [])

  // ── Başkent değerlendir ────────────────────────────────────────────────
  /* Çoktan seçmeli: doğru/yanlış ikili. Serbest yazma döneminde kademeli
     puanlama vardı (tam / yakın / onay) ama 5 seçenekli modda anlamlı değil —
     kullanıcı bildiğini ya da bilmediğini seçiyor. */
  const basKentSec = useCallback(
    (secenek: Secenek) => {
      if (!soru || !konumKutusu || soru.secenekler.length === 0) return
      /* Aynı tur için ikinci kez puan yazılmasını engelle.
         Arayüz şıkları `aciklandi` ile devre dışı bırakıyor ama bu, iki
         tıklamanın aynı kare içinde (batched) gelmesi hâlinde garanti değil —
         ölçüldü: senkron 5 tıklama 5 tur kaydediyordu. */
      if (sonTuruRef.current) return
      turuKapat(
        secenek.metin,
        secenek.dogru ? BASLIK_PUAN : 0,
        secenek.dogru ? 'tam' : 'yanlış',
        konumKutusu,
      )
    },
    [soru, konumKutusu, turuKapat],
  )

  const devamEt = useCallback(() => {
    if (asama === 'sonuc') return
    /* Aynı turda birden fazla "Sıradaki" → soru atlanıyordu (ölçüldü:
       senkron 5 tıklama 1'den 6'ya atladı). */
    if (sonTuruRef.current === null) return
    /* Son soruyu mu kapattık, yoksa süre mi doldu? Cevap kartı (turuKapat)
       artık HER ZAMAN önce gösterildiği için bu karar buraya taşındı —
       oyuncu "Sonuçları gör →" ile ilerleyince asıl geçiş burada olur. */
    const sonTuruMu = sira + 1 >= sorular.length
    const sureBitti = (kalanSureRef.current ?? 1) <= 0
    sonTuruRef.current = null
    setTiklama(null)
    setKonumKutusu(null)
    setSonTuru(null)
    setIpucuAdedi(1)
    setYonIpucuKullanildi(false)
    if (sonTuruMu || sureBitti) {
      setAsama('sonuc')
      window.setTimeout(() => ses.oyunBitti(), 220)
    } else {
      ses.turBitti()
      setSira((s) => s + 1)
      setAsama('oyun')
    }
  }, [asama, sira, sorular.length])

  const bitis = asama === 'sonuc'

  const toplamPuanHavuz = useMemo(() => turSonuclari.reduce((t, x) => t + x.toplam, 0), [turSonuclari])
  const dogruSayisi = useMemo(() => turSonuclari.filter((t) => t.kutu.tam).length, [turSonuclari])
  const toleransliSayisi = useMemo(() => turSonuclari.filter((t) => t.kutu.toleransli).length, [turSonuclari])

  return {
    asama,
    mod,
    soru,
    sira,
    turSayisi,
    tiklama,
    konumKutusu,
    sonTuru,
    turSonuclari,
    istatistik,
    kalanSure,
    limbdeUyarisi,
    bitis,
    toplamPuan: toplamPuanHavuz,
    dogruSayisi,
    toleransliSayisi,
    gorulenIpuclari,
    siradakiIpucu,
    ipucuCezasi,
    ipucuAl,
    yonIpucuKullanildi,
    yonIpucuBildir,
    oyunNo,
    baslat,
    tikla,
    tiklamayiOnayla,
    tiklamayiIptalEt,
    basKentiAtla,
    basKentSec,
    devamEt,
    cikis,
  }
}
