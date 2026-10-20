/**
 * Utilidades de serialización canónica y cálculo de huellas digitales de integridad.
 * Soporta de forma nativa y determinista:
 *  - SHA-256 (64 caracteres hex, estándar criptográfico principal para nuevos respaldos y transferencias)
 *  - FNV-1a 64-bit (16 caracteres hex, retrocompatible con versiones 1.0.0 previas)
 */

export type FingerprintAlgorithm = 'sha-256' | 'fnv1a-64';

export interface FingerprintVerificationResult {
  valid: boolean;
  algorithm: FingerprintAlgorithm;
  calculated: string;
  expected: string;
}

/**
 * Implementación determinista y pura de SHA-256 sin dependencias externas,
 * compatible con caracteres UTF-8 en cualquier entorno (Browser, Workers, Node, Vitest).
 */
export function sha256Hex(input: string): string {
  // Conversión UTF-8 a bytes
  const utf8Bytes: number[] = [];
  for (let i = 0; i < input.length; i++) {
    let charcode = input.charCodeAt(i);
    if (charcode < 0x80) {
      utf8Bytes.push(charcode);
    } else if (charcode < 0x800) {
      utf8Bytes.push(0xc0 | (charcode >> 6), 0x80 | (charcode & 0x3f));
    } else if (charcode < 0xd800 || charcode >= 0xe000) {
      utf8Bytes.push(
        0xe0 | (charcode >> 12),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    } else {
      // Pareja suplente (surrogate pair)
      i++;
      charcode = 0x10000 + (((charcode & 0x3ff) << 10) | (input.charCodeAt(i) & 0x3ff));
      utf8Bytes.push(
        0xf0 | (charcode >> 18),
        0x80 | ((charcode >> 12) & 0x3f),
        0x80 | ((charcode >> 6) & 0x3f),
        0x80 | (charcode & 0x3f)
      );
    }
  }

  // Constantes de redondeo (primeros 32 bits de las partes fraccionarias de las raíces cúbicas de los primeros 64 primos)
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2
  ];

  // Valores de hash iniciales (primeros 32 bits de las partes fraccionarias de las raíces cuadradas de los primeros 8 primos)
  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  // Relleno (Padding)
  const bitLength = utf8Bytes.length * 8;
  utf8Bytes.push(0x80);
  while ((utf8Bytes.length % 64) !== 56) {
    utf8Bytes.push(0);
  }

  // Longitud en 64 bits (Big-Endian)
  const highBits = Math.floor(bitLength / 0x100000000);
  const lowBits = bitLength >>> 0;
  for (let i = 3; i >= 0; i--) utf8Bytes.push((highBits >>> (i * 8)) & 0xff);
  for (let i = 3; i >= 0; i--) utf8Bytes.push((lowBits >>> (i * 8)) & 0xff);

  // Procesamiento por bloques de 512 bits
  const w = new Uint32Array(64);
  for (let chunk = 0; chunk < utf8Bytes.length; chunk += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = ((utf8Bytes[chunk + i * 4] ?? 0) << 24) |
             ((utf8Bytes[chunk + i * 4 + 1] ?? 0) << 16) |
             ((utf8Bytes[chunk + i * 4 + 2] ?? 0) << 8) |
             (utf8Bytes[chunk + i * 4 + 3] ?? 0);
    }

    for (let i = 16; i < 64; i++) {
      const w15 = w[i - 15] ?? 0;
      const w2 = w[i - 2] ?? 0;
      const w16 = w[i - 16] ?? 0;
      const w7 = w[i - 7] ?? 0;
      const s0 = (w15 >>> 7 | w15 << 25) ^
                 (w15 >>> 18 | w15 << 14) ^
                 (w15 >>> 3);
      const s1 = (w2 >>> 17 | w2 << 15) ^
                 (w2 >>> 19 | w2 << 13) ^
                 (w2 >>> 10);
      w[i] = (w16 + s0 + w7 + s1) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;

    for (let i = 0; i < 64; i++) {
      const ki = K[i] ?? 0;
      const wi = w[i] ?? 0;
      const S1 = (e >>> 6 | e << 26) ^ (e >>> 11 | e << 21) ^ (e >>> 25 | e << 7);
      const ch = (e & f) ^ ((~e) & g);
      const temp1 = (h + S1 + ch + ki + wi) >>> 0;
      const S0 = (a >>> 2 | a << 30) ^ (a >>> 13 | a << 19) ^ (a >>> 22 | a << 10);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const hex = (n: number) => n.toString(16).padStart(8, '0');
  return `${hex(h0)}${hex(h1)}${hex(h2)}${hex(h3)}${hex(h4)}${hex(h5)}${hex(h6)}${hex(h7)}`;
}

/**
 * Calcula un hash FNV-1a de 64 bits en formato hexadecimal (16 caracteres).
 * Mantenido para retrocompatibilidad absoluta con respaldos v1.0.0.
 */
export function fnv1a64Hex(input: string): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x811c9dc5;

  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ code, 0x01000193);
    h2 = Math.imul(h2 ^ (code >> 8), 0x01000193);
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `${hex1}${hex2}`;
}

/**
 * Calcula la huella digital canónica sobre cualquier estructura de datos.
 * Por defecto genera SHA-256 (64 caracteres hex).
 */
export function computeFingerprint(
  data: unknown,
  algorithm: FingerprintAlgorithm = 'sha-256'
): string {
  const jsonStr = canonicalJsonStringify(data);
  return algorithm === 'sha-256' ? sha256Hex(jsonStr) : fnv1a64Hex(jsonStr);
}

/**
 * Verifica la huella digital contra los datos canónicos admitiendo tanto
 * SHA-256 como FNV-1a para total compatibilidad hacia atrás.
 */
export function verifyFingerprint(
  data: unknown,
  expectedFingerprint: string,
  declaredAlgorithm?: FingerprintAlgorithm
): FingerprintVerificationResult {
  const jsonStr = canonicalJsonStringify(data);

  // Orden de comprobación según algoritmo declarado o longitud
  const candidates: FingerprintAlgorithm[] = declaredAlgorithm
    ? [declaredAlgorithm]
    : expectedFingerprint.length === 64
    ? ['sha-256', 'fnv1a-64']
    : ['fnv1a-64', 'sha-256'];

  for (const alg of candidates) {
    const calculated = alg === 'sha-256' ? sha256Hex(jsonStr) : fnv1a64Hex(jsonStr);
    if (calculated.toLowerCase() === expectedFingerprint.toLowerCase()) {
      return {
        valid: true,
        algorithm: alg,
        calculated,
        expected: expectedFingerprint,
      };
    }
  }

  const primaryAlg = declaredAlgorithm || (expectedFingerprint.length === 64 ? 'sha-256' : 'fnv1a-64');
  const calculated = primaryAlg === 'sha-256' ? sha256Hex(jsonStr) : fnv1a64Hex(jsonStr);

  return {
    valid: false,
    algorithm: primaryAlg,
    calculated,
    expected: expectedFingerprint,
  };
}

/**
 * Serializa un objeto en JSON con ordenación canónica y recursiva de claves,
 * omitiendo campos con valor undefined para consistencia matemática absoluta.
 */
export function canonicalJsonStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    return `[${obj.map(canonicalJsonStringify).join(',')}]`;
  }

  const entries = Object.entries(obj as Record<string, unknown>)
    .filter(([_, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b));

  return `{${entries
    .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJsonStringify(v)}`)
    .join(',')}}`;
}
