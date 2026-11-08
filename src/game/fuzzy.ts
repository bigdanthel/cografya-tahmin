/**
 * Başkent çeldiricisi seçerken "yazım benzerliği" ölçütü — normalizasyon +
 * Damerau-Levenshtein (basKentSecenekleri.ts çağırıyor).
 */

/** Türkçe ve yaygın yabancı aksanları ASCII'ye indirger.
 *
 *  Kapsam veriden geliyor: `world.json`'daki 201 ülkenin ad ve başkentlerinde
 *  geçen aksanlı karakterlerin tamamı. Ölçüldü — başlangıçta `í`, `ã`, `õ`
 *  eksikti, bu yüzden `normalize("Brasília")` "brasília" üretiyordu ve
 *  Türkçe yazım "Brasília" ile ASCII "Brasilia" eşleşmiyordu. Çeldirici
 *  seçimi ve yazım toleransı bu tabloya dayandığı için eksik her harf
 *  bir başkenti yanlış eşleştiriyor. */
const AKISAN: Record<string, string> = {
  // Türkçe
  ç: 'c', Ç: 'c', ğ: 'g', Ğ: 'g', ı: 'i', İ: 'i', ö: 'o', Ö: 'o',
  ş: 's', Ş: 's', ü: 'u', Ü: 'u',
  // Batı Avrupa / Portekizce
  â: 'a', Â: 'a', à: 'a', á: 'a', ä: 'a', å: 'a', ã: 'a',
  é: 'e', è: 'e', ê: 'e', ë: 'e',
  í: 'i', î: 'i', ï: 'i',
  ó: 'o', ô: 'o', õ: 'o', ø: 'o',
  ú: 'u', ù: 'u', û: 'u',
  ñ: 'n', ß: 'ss', æ: 'ae', œ: 'oe', ý: 'y', ÿ: 'y', þ: 'th', ð: 'd',
  // Orta ve Doğu Avrupa
  ć: 'c', č: 'c', ď: 'd', đ: 'd', ē: 'e', ě: 'e',
  ī: 'i', ł: 'l', ń: 'n', ň: 'n', ő: 'o', ř: 'r',
  ś: 's', ŝ: 's', ș: 's', ţ: 't', ť: 't',
  ū: 'u', ů: 'u', ű: 'u', ų: 'u', ź: 'z', ż: 'z', ž: 'z',
  ą: 'a', ę: 'e',
}

/** Kaldırılan noktalama — "Washington, D.C." → washingtondc */
const NOKTALAMA = /[.,'"'’´`\-_/\\()[\]{}!?:;*+&%$#@<>|~^°]/g

/** Ana normalizasyon. Karşılaştırma öncesi her iki tarafa da uygulanır. */
export function normalize(s: string): string {
  // Türkçe'nin noktalı I sorunu: 'İ'.toLowerCase() JavaScript'te 'i' + U+0307
  // (birleşik nokta) üretir, yani 8 harflik "İstanbul" 9 harfe çıkar ve
  // "istanbul" ile eşitlenmez. Önce noktalı I'yi düz 'i'ye indirgiyoruz.
  const duzlesmis = s.replace(/İ/g, 'i')
  let out = ''
  for (const ch of duzlesmis.toLowerCase()) out += AKISAN[ch] ?? ch
  // Kalan birleşik aksan işaretlerini at (normalize edilmemiş girişler için)
  out = out.replace(/[̀-ͯ]/g, '')
  return out.replace(NOKTALAMA, '').replace(/\s+/g, '').replace(/ı/g, 'i')
}

/**
 * Damerau-Levenshtein mesafesi.
 * Klasik Levenshtein bitişik harf takasını (angara → ankara) 2 hata sayar.
 * Damerau bunu 1 sayar — kullanıcı yazım hatası yapmamıştır, sadece eli kaymıştır.
 */
export function mesafe(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length

  const m = a.length
  const n = b.length
  /* Optimal String Alignment (Damerau'nun basit sürümü) — tek matris yeter.
     ÖNEMLİ: Transpozisyon dalı d[i-2][j-2] + 1 kullanır. Burada ayrı bir "t"
     matrisi kullanmak sonucu bozuyordu: t çoğu hücrede 0 olduğu için
     mesafe neredeyse her zaman 1 dönüyordu ("sana" ↔ "bandarseribegawan"
     = 1). Ölçüldü ve düzeltildi. */
  const d: number[][] = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))

  for (let i = 0; i <= m; i++) d[i]![0] = i
  for (let j = 0; j <= n; j++) d[0]![j] = j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      let val = Math.min(
        d[i - 1]![j]! + 1, // silme
        d[i]![j - 1]! + 1, // ekleme
        d[i - 1]![j - 1]! + cost, // değiştirme
      )
      // Bitişik iki harf yer değiştirdiyse tek işlem yeter
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, d[i - 2]![j - 2]! + 1)
      }
      d[i]![j] = val
    }
  }
  return d[m]![n]!
}

/** 0–1 arası benzerlik. Klasik ölçek: 1 - mesafe / enUzunMetin. */
export function benzerlik(hamA: string, hamB: string): number {
  const a = normalize(hamA)
  const b = normalize(hamB)
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const d = mesafe(a, b)
  return Math.max(0, 1 - d / Math.max(a.length, b.length))
}
