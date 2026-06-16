/* ===========================================================================
   Cifrado de datos con Web Crypto (AES-GCM 256).
   La clave se deriva de un secreto (PIN/contraseña del usuario, o un secreto
   de ofuscación si no hay credencial) mediante PBKDF2. Así los datos guardados
   en disco no se pueden leer en claro: solo la app, con el secreto correcto.
   =========================================================================== */

const enc = new TextEncoder();
const dec = new TextDecoder();

// --- base64 <-> bytes ---
function aBase64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function deBase64(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// Deriva una clave AES-GCM a partir de un secreto y un salt (PBKDF2-SHA256).
async function derivarClave(secreto: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", enc.encode(secreto), "PBKDF2", false, [
    "deriveKey",
  ]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt, iterations: 150_000, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

// Estructura del blob cifrado que se guarda (todo en base64).
interface BlobCifrado {
  v: 1;
  salt: string;
  iv: string;
  ct: string;
}

// Cifra un texto con el secreto dado y devuelve el blob serializado (string).
export async function cifrar(texto: string, secreto: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const clave = await derivarClave(secreto, salt);
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, clave, enc.encode(texto));
  const blob: BlobCifrado = {
    v: 1,
    salt: aBase64(salt),
    iv: aBase64(iv),
    ct: aBase64(new Uint8Array(ct)),
  };
  return JSON.stringify(blob);
}

// Descifra un blob con el secreto dado. Lanza error si el secreto es incorrecto
// o el dato está corrupto (AES-GCM verifica la integridad).
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
