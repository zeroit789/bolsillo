/* =============================================================================
 * cripto.ts — AES-GCM encryption helpers / Utilidades de cifrado AES-GCM
 * -----------------------------------------------------------------------------
 * EN: Encrypts/decrypts data with the Web Crypto API (AES-GCM 256). The key is
 *     derived from a secret (user PIN/password, or an obfuscation secret when
 *     there is no credential) via PBKDF2. So the data stored on disk cannot be
 *     read in plaintext: only the app, with the right secret, can decrypt it.
 * ES: Cifra/descifra datos con la Web Crypto API (AES-GCM 256). La clave se
 *     deriva de un secreto (PIN/contraseña del usuario, o un secreto de
 *     ofuscación si no hay credencial) mediante PBKDF2. Así los datos guardados
 *     en disco no se pueden leer en claro: solo la app, con el secreto correcto.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Text codecs / Codificadores de texto
 *   2. Base64 <-> bytes / Base64 <-> bytes
 *   3. Key derivation (PBKDF2) / Derivación de clave (PBKDF2)
 *   4. Encrypted blob shape / Forma del blob cifrado
 *   5. Encrypt / Cifrar
 *   6. Decrypt / Descifrar
 * ===========================================================================*/

// ── 1. Text codecs / Codificadores de texto ──────────────────────────────────
// EN: Reused encoder/decoder to convert between strings and UTF-8 bytes.
// ES: Codificador/decodificador reutilizados para pasar de string a bytes UTF-8.
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── 2. Base64 <-> bytes / Base64 <-> bytes ───────────────────────────────────
// EN: Encodes a byte array as a base64 string (so binary fits in JSON/string).
// ES: Codifica un array de bytes como string base64 (para meter binario en JSON).
function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
// EN: Decodes a base64 string back into the original byte array.
// ES: Decodifica un string base64 de vuelta al array de bytes original.
function deBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ── 3. Key derivation (PBKDF2) / Derivación de clave (PBKDF2) ─────────────────
// EN: Derives an AES-GCM key from a secret + salt using PBKDF2-SHA256. The salt
//     makes each encryption unique (the same secret yields a different key), and
//     150k iterations slow brute-force attacks on the secret.
// ES: Deriva una clave AES-GCM a partir de un secreto + salt con PBKDF2-SHA256.
//     El salt hace única cada cifra (el mismo secreto da clave distinta) y las
//     150k iteraciones ralentizan el ataque de fuerza bruta sobre el secreto.
async function derivarClave(secreto: string, salt: Uint8Array): Promise<CryptoKey> {
  // EN: Import the raw secret as PBKDF2 base material (not usable to encrypt yet).
  // ES: Importa el secreto crudo como material base PBKDF2 (aún no cifra nada).
  const base = await crypto.subtle.importKey("raw", enc.encode(secreto), "PBKDF2", false, [
    "deriveKey",
  ]);
  // EN: Stretch the base material with salt+iterations into a real AES-GCM key.
  // ES: Estira el material base con salt+iteraciones hasta una clave AES-GCM real.
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── 4. Encrypted blob shape / Forma del blob cifrado ──────────────────────────
// EN: Shape of the stored blob. v=format version; salt/iv/ct are base64. The
//     salt and iv are NOT secret (they travel with the ciphertext), but must be
//     unique per encryption; the secret is what stays private.
// ES: Forma del blob guardado. v=versión de formato; salt/iv/ct van en base64.
//     El salt y el iv NO son secretos (viajan junto al cifrado), pero deben ser
//     únicos por cifra; lo que se mantiene en privado es el secreto.
interface BlobCifrado {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

// ── 5. Encrypt / Cifrar ───────────────────────────────────────────────────────
// EN: Encrypts text with the given secret and returns the serialized blob. A
//     fresh random salt (16B) and IV (12B, AES-GCM standard) are generated on
//     every call so two encryptions of the same data never look alike.
// ES: Cifra un texto con el secreto dado y devuelve el blob serializado. En cada
//     llamada se genera un salt aleatorio (16B) y un IV (12B, estándar AES-GCM)
//     nuevos, de modo que dos cifras del mismo dato nunca son iguales.
export async function cifrar(texto: string, secreto: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivarClave(secreto, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, enc.encode(texto));
  // EN: Pack version + salt + iv + ciphertext (all base64) into one JSON string.
  // ES: Empaqueta versión + salt + iv + cifrado (todo base64) en un string JSON.
  const blob: BlobCifrado = {
    v: 1,
    salt: aBase64(salt),
    iv: aBase64(iv),
    ct: aBase64(new Uint8Array(ct)),
  };
  return JSON.stringify(blob);
}

// ── 6. Decrypt / Descifrar ────────────────────────────────────────────────────
// EN: Decrypts a blob with the given secret. Re-derives the key from the blob's
//     own salt, then decrypts. Throws if the secret is wrong or the data was
//     tampered with: AES-GCM's auth tag verifies integrity and fails closed.
// ES: Descifra un blob con el secreto dado. Re-deriva la clave usando el salt del
//     propio blob y luego descifra. Lanza error si el secreto es incorrecto o el
//     dato fue alterado: la etiqueta de autenticación de AES-GCM verifica la
//     integridad y falla cerrando.
export async function descifrar(blobStr: string, secreto: string): Promise<string> {
  const blob = JSON.parse(blobStr) as BlobCifrado;
  const clave = await derivarClave(secreto, deBase64(blob.salt));
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: deBase64(blob.iv) },
    clave,
    deBase64(blob.ct)
  );
  return dec.decode(pt);
}
