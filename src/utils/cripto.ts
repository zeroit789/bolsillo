/* =============================================================================
 * cripto.ts — Utilidades de cifrado AES-GCM / AES-GCM encryption helpers
 * -----------------------------------------------------------------------------
 * ES: Cifra/descifra datos con la Web Crypto API (AES-GCM 256). La clave se
 *     deriva de un secreto (PIN/contraseña del usuario, o un secreto de
 *     ofuscación si no hay credencial) mediante PBKDF2. Así los datos guardados
 *     en disco no se pueden leer en claro: solo la app, con el secreto correcto.
 * EN: Encrypts/decrypts data with the Web Crypto API (AES-GCM 256). The key is
 *     derived from a secret (user PIN/password, or an obfuscation secret when
 *     there is no credential) via PBKDF2. So the data stored on disk cannot be
 *     read in plaintext: only the app, with the right secret, can decrypt it.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Codificadores de texto / Text codecs
 *   2. Base64 <-> bytes / Base64 <-> bytes
 *   3. Derivación de clave (PBKDF2) / Key derivation (PBKDF2)
 *   4. Forma del blob cifrado / Encrypted blob shape
 *   5. Cifrar / Encrypt
 *   6. Leer el sobre sin secreto / Read the envelope without a secret
 *   7. Descifrar / Decrypt
 * ===========================================================================*/

// ── 1. Codificadores de texto / Text codecs ──────────────────────────────────
// ES: Codificador/decodificador reutilizados para pasar de string a bytes UTF-8.
// EN: Reused encoder/decoder to convert between strings and UTF-8 bytes.
const enc = new TextEncoder();
const dec = new TextDecoder();

// ── 2. Base64 <-> bytes / Base64 <-> bytes ───────────────────────────────────
// ES: Codifica un array de bytes como string base64 (para meter binario en JSON).
// EN: Encodes a byte array as a base64 string (so binary fits in JSON/string).
function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
// ES: Decodifica un string base64 de vuelta al array de bytes original.
// EN: Decodes a base64 string back into the original byte array.
function deBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ── 3. Derivación de clave (PBKDF2) / Key derivation (PBKDF2) ─────────────────
// ES: Deriva una clave AES-GCM a partir de un secreto + salt con PBKDF2-SHA256.
//     El salt hace única cada cifra (el mismo secreto da clave distinta) y las
//     150k iteraciones ralentizan el ataque de fuerza bruta sobre el secreto.
// EN: Derives an AES-GCM key from a secret + salt using PBKDF2-SHA256. The salt
//     makes each encryption unique (the same secret yields a different key), and
//     150k iterations slow brute-force attacks on the secret.
async function derivarClave(secreto: string, salt: Uint8Array): Promise<CryptoKey> {
  // ES: Importa el secreto crudo como material base PBKDF2 (aún no cifra nada).
  // EN: Import the raw secret as PBKDF2 base material (not usable to encrypt yet).
  const base = await crypto.subtle.importKey("raw", enc.encode(secreto), "PBKDF2", false, [
    "deriveKey",
  ]);
  // ES: Estira el material base con salt+iteraciones hasta una clave AES-GCM real.
  // EN: Stretch the base material with salt+iterations into a real AES-GCM key.
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// ── 4. Forma del blob cifrado / Encrypted blob shape ──────────────────────────
// ES: Forma del blob guardado. v=versión de formato; salt/iv/ct van en base64.
//     El salt y el iv NO son secretos (viajan junto al cifrado), pero deben ser
//     únicos por cifra; lo que se mantiene en privado es el secreto.
// EN: Shape of the stored blob. v=format version; salt/iv/ct are base64. The
//     salt and iv are NOT secret (they travel with the ciphertext), but must be
//     unique per encryption; the secret is what stays private.
interface BlobCifrado {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

// ── 5. Cifrar / Encrypt ───────────────────────────────────────────────────────
// ES: Cifra un texto con el secreto dado y devuelve el blob serializado. En cada
//     llamada se genera un salt aleatorio (16B) y un IV (12B, estándar AES-GCM)
//     nuevos, de modo que dos cifras del mismo dato nunca son iguales.
// EN: Encrypts text with the given secret and returns the serialized blob. A
//     fresh random salt (16B) and IV (12B, AES-GCM standard) are generated on
//     every call so two encryptions of the same data never look alike.
export async function cifrar(texto: string, secreto: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivarClave(secreto, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, enc.encode(texto));
  // ES: Empaqueta versión + salt + iv + cifrado (todo base64) en un string JSON.
  // EN: Pack version + salt + iv + ciphertext (all base64) into one JSON string.
  const blob: BlobCifrado = {
    v: 1,
    salt: aBase64(salt),
    iv: aBase64(iv),
    ct: aBase64(new Uint8Array(ct)),
  };
  return JSON.stringify(blob);
}

// ── 6. Leer el sobre sin secreto / Read the envelope without a secret ───────────
// ES: Error de "sobre dañado": el blob guardado no tiene la forma de un cifrado
//     de Bolsillo (JSON ilegible, faltan campos, base64 roto o tamaños de salt/IV
//     imposibles). Se detecta SIN secreto, así que es daño seguro, no una
//     credencial mala.
// EN: "Damaged envelope" error: the stored blob does not have the shape of a
//     Bolsillo ciphertext (unreadable JSON, missing fields, broken base64 or
//     impossible salt/IV sizes). It is detected WITHOUT a secret, so it is
//     certain damage, not a wrong credential.
export class ErrorSobreDanado extends Error {
  constructor() {
    super("sobre-danado");
    this.name = "ErrorSobreDanado";
  }
}

// ES: Sobre ya decodificado: los bytes listos para derivar la clave y descifrar.
// EN: Decoded envelope: the bytes ready to derive the key and decrypt.
interface SobreDecodificado {
  salt: Uint8Array;
  iv: Uint8Array;
  ct: Uint8Array;
}

// ES: Lee y comprueba la estructura del blob sin descifrarlo. Lanza
//     ErrorSobreDanado si algo no cuadra. Ojo: un `ct` alterado con la forma
//     correcta pasa esta prueba; eso solo se ve al descifrar, y entonces no se
//     puede distinguir de una credencial incorrecta (AES-GCM falla igual).
// EN: Reads and checks the blob structure without decrypting it. Throws
//     ErrorSobreDanado if anything is off. Note: an altered `ct` with the right
//     shape passes this check; that only shows up when decrypting, and then it
//     cannot be told apart from a wrong credential (AES-GCM fails the same way).
export function leerSobre(blobStr: string): SobreDecodificado {
  let blob: unknown;
  try {
    blob = JSON.parse(blobStr);
  } catch {
    throw new ErrorSobreDanado();
  }
  if (!blob || typeof blob !== "object") throw new ErrorSobreDanado();
  const b = blob as Record<string, unknown>;
  if (
    b.v !== 1 ||
    typeof b.salt !== "string" ||
    typeof b.iv !== "string" ||
    typeof b.ct !== "string"
  )
    throw new ErrorSobreDanado();
  try {
    const sobre = { salt: deBase64(b.salt), iv: deBase64(b.iv), ct: deBase64(b.ct) };
    // ES: salt de 16 B, IV de 12 B y al menos la etiqueta de 16 B de AES-GCM.
    // EN: 16-byte salt, 12-byte IV and at least AES-GCM's 16-byte tag.
    if (sobre.salt.length !== 16 || sobre.iv.length !== 12 || sobre.ct.length < 16)
      throw new ErrorSobreDanado();
    return sobre;
  } catch {
    // ES: atob lanza con caracteres que no son base64. / EN: atob throws on non-base64 characters.
    throw new ErrorSobreDanado();
  }
}

// ── 7. Descifrar / Decrypt ────────────────────────────────────────────────────
// ES: Descifra un blob con el secreto dado. Primero comprueba el sobre (lanza
//     ErrorSobreDanado si está roto); luego re-deriva la clave con el salt del
//     propio blob y descifra. Si el secreto es incorrecto O el cifrado fue
//     alterado, AES-GCM falla cerrando (la etiqueta no cuadra) y lanza otro
//     error: esos dos casos no se pueden distinguir entre sí.
// EN: Decrypts a blob with the given secret. It first checks the envelope
//     (throws ErrorSobreDanado if broken); then re-derives the key from the
//     blob's own salt and decrypts. If the secret is wrong OR the ciphertext
//     was altered, AES-GCM fails closed (the tag does not match) and throws a
//     different error: those two cases cannot be told apart.
export async function descifrar(blobStr: string, secreto: string): Promise<string> {
  const sobre = leerSobre(blobStr);
  const clave = await derivarClave(secreto, sobre.salt);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: sobre.iv }, clave, sobre.ct);
  return dec.decode(pt);
}
