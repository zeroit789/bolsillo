/* =============================================================================
 * almacen.ts — Encrypted persistent store / Almacén persistente cifrado
 * -----------------------------------------------------------------------------
 * EN: Persistent store for the financial data, ALWAYS encrypted on disk. Keeps
 *     the active "secret" in memory (derived from the user credential or from an
 *     obfuscation secret) and encrypts/decrypts with it. Settings (theme, lock
 *     config) are not sensitive and are stored in plaintext elsewhere.
 * ES: Almacén persistente de los datos financieros, SIEMPRE cifrado en disco.
 *     Mantiene en memoria el "secreto" activo (derivado de la credencial del
 *     usuario o de un secreto de ofuscación) y cifra/descifra con él. Los ajustes
 *     (tema, config de bloqueo) NO son sensibles y van en claro en otro sitio.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Constants & active secret / Constantes y secreto activo
 *   2. Switch the active secret / Cambiar el secreto activo
 *   3. Existence check / Comprobar si hay datos
 *   4. Load & decrypt / Cargar y descifrar
 *   5. Serialized save queue / Cola de guardado serializado
 *   6. Secret validation / Validación del secreto
 * ===========================================================================*/
import { esDatosValidos, type DatosBolsillo } from "../types";
import { cifrar, descifrar } from "./cripto";

// ── 1. Constants & active secret / Constantes y secreto activo ────────────────
// EN: localStorage key under which the encrypted data blob is stored.
// ES: Clave de localStorage bajo la que se guarda el blob de datos cifrado.
const CLAVE_DATOS = "bolsillo.datos.cif";

// EN: Secret used when the user has NOT set a credential. It gives no strong
//     security (it lives in the binary), but keeps data from being plaintext.
// ES: Secreto usado cuando el usuario NO ha puesto credencial. No da seguridad
//     fuerte (está en el binario), pero evita que los datos se vean en claro.
const SECRETO_OFUSCACION = "bolsillo::ofuscacion::v1::Z3r0";

// EN: Active secret held in memory (never persisted to disk).
// ES: Secreto activo en memoria (nunca se persiste en disco).
let secretoActual: string = SECRETO_OFUSCACION;

// ── 2. Switch the active secret / Cambiar el secreto activo ───────────────────
// EN: Revert to the obfuscation secret (e.g. when the user removes the credential).
// ES: Vuelve al secreto de ofuscación (p.ej. al quitar la credencial el usuario).
export function usarOfuscacion() {
  secretoActual = SECRETO_OFUSCACION;
}
// EN: Set the active secret to the user's credential-derived secret.
// ES: Fija el secreto activo al secreto derivado de la credencial del usuario.
export function usarSecreto(s: string) {
  secretoActual = s;
}

// ── 3. Existence check / Comprobar si hay datos ───────────────────────────────
// EN: Is there already data saved on disk? / ES: ¿Hay datos ya guardados en disco?
export function hayDatos(): boolean {
  return localStorage.getItem(CLAVE_DATOS) !== null;
}

// ── 4. Load & decrypt / Cargar y descifrar ────────────────────────────────────
// EN: Loads and decrypts the data. Returns null if nothing is saved or the
//     decrypted content does not have the expected shape (corrupt). Throws if
//     the secret is wrong (bad credential) — AES-GCM fails to decrypt.
// ES: Carga y descifra los datos. Devuelve null si no hay nada guardado o si el
//     contenido descifrado no tiene la forma esperada (corrupto). Lanza error si
//     el secreto no es válido (credencial incorrecta) — AES-GCM falla al descifrar.
export async function cargar(): Promise<DatosBolsillo | null> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (!blob) return null;
  const json = await descifrar(blob, secretoActual);
  const datos = JSON.parse(json);
  return esDatosValidos(datos) ? datos : null;
}

// ── 5. Serialized save queue / Cola de guardado serializado ───────────────────
// EN: Queue to SERIALIZE saves: since encrypting is async (PBKDF2 + AES), two
//     overlapping saves could write out of order and leave on disk a blob that
//     does not match the latest state (or encrypted with an old secret). The
//     queue guarantees encrypt-and-write happens one at a time, in order, with
//     the current secret.
// ES: Cola para SERIALIZAR los guardados: como cifrar es async (PBKDF2 + AES), dos
//     guardados solapados podrían escribir en orden inverso y dejar en disco un
//     blob que no corresponde al último estado (o cifrado con un secreto antiguo).
//     La cola garantiza que se cifra y escribe de uno en uno, en orden, con el
//     secreto vigente.
let cola: Promise<void> = Promise.resolve();

// EN: Enqueues a save. Captures the current secret AND serializes the state AT
//     ENQUEUE time (not at execution). Serializing here "freezes" the state of
//     this moment: even if the reactive state keeps mutating before the queue
//     reaches the encrypt step (snapshot returns live refs), the written blob
//     matches exactly this instant. And the secret no longer depends on the
//     resolution order versus secret changes.
// ES: Encola un guardado. Captura el secreto vigente Y serializa el estado AL
//     ENCOLAR (no al ejecutar). Serializar aquí "congela" el estado del momento
//     del encolado: aunque el estado reactivo siga mutando antes de que la cola
//     llegue a cifrarlo (snapshot devuelve refs vivas), el blob escrito
//     corresponde exactamente a este instante. Y el secreto no depende del orden
//     de resolución frente a cambios de secreto.
export function guardar(datos: DatosBolsillo): Promise<void> {
  const secreto = secretoActual;
  const json = JSON.stringify(datos);
  cola = cola
    // EN: Swallow a previous failure so one bad save doesn't break the chain.
    // ES: Traga un fallo previo para que un guardado malo no rompa la cadena.
    .catch(() => {})
    .then(async () => {
      const blob = await cifrar(json, secreto);
      localStorage.setItem(CLAVE_DATOS, blob);
    });
  return cola;
}

// ── 6. Secret validation / Validación del secreto ─────────────────────────────
// EN: Checks whether a secret can decrypt the current data (to validate the
//     credential on unlock). true if it decrypts, false if it does not.
// ES: Comprueba si un secreto puede descifrar los datos actuales (para validar
//     la credencial al desbloquear). true si descifra, false si no.
export async function secretoValido(secreto: string): Promise<boolean> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  // EN: No data yet: any secret works to start from scratch.
  // ES: No hay datos aún: cualquier secreto sirve para empezar.
  if (!blob) return true;
  try {
    await descifrar(blob, secreto);
    return true;
  } catch {
    return false;
  }
}
