/* =============================================================================
 * almacen.ts — Almacén persistente cifrado / Encrypted persistent store
 * -----------------------------------------------------------------------------
 * ES: Almacén persistente de los datos financieros, SIEMPRE cifrado en disco.
 *     Mantiene en memoria el "secreto" activo (derivado de la credencial del
 *     usuario o de un secreto de ofuscación) y cifra/descifra con él. Los ajustes
 *     (tema, config de bloqueo) NO son sensibles y van en claro en otro sitio.
 * EN: Persistent store for the financial data, ALWAYS encrypted on disk. Keeps
 *     the active "secret" in memory (derived from the user credential or from an
 *     obfuscation secret) and encrypts/decrypts with it. Settings (theme, lock
 *     config) are not sensitive and are stored in plaintext elsewhere.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Constantes y secreto activo / Constants & active secret
 *   2. Cambiar el secreto activo / Switch the active secret
 *   3. Comprobar si hay datos / Existence check
 *   4. Cargar y descifrar / Load & decrypt
 *   5. Cola de guardado serializado / Serialized save queue
 *   6. Validación del secreto / Secret validation
 * ===========================================================================*/
import { esDatosValidos, type DatosBolsillo } from "../types";
import { cifrar, descifrar } from "./cripto";

// ── 1. Constantes y secreto activo / Constants & active secret ────────────────
// ES: Clave de localStorage bajo la que se guarda el blob de datos cifrado.
// EN: localStorage key under which the encrypted data blob is stored.
const CLAVE_DATOS = "bolsillo.datos.cif";

// ES: Secreto usado cuando el usuario NO ha puesto credencial. No da seguridad
//     fuerte (está en el binario), pero evita que los datos se vean en claro.
// EN: Secret used when the user has NOT set a credential. It gives no strong
//     security (it lives in the binary), but keeps data from being plaintext.
const SECRETO_OFUSCACION = "bolsillo::ofuscacion::v1::Z3r0";

// ES: Secreto activo en memoria (nunca se persiste en disco).
// EN: Active secret held in memory (never persisted to disk).
let secretoActual: string = SECRETO_OFUSCACION;

// ── 2. Cambiar el secreto activo / Switch the active secret ───────────────────
// ES: Vuelve al secreto de ofuscación (p.ej. al quitar la credencial el usuario).
// EN: Revert to the obfuscation secret (e.g. when the user removes the credential).
export function usarOfuscacion() {
  secretoActual = SECRETO_OFUSCACION;
}
// ES: Fija el secreto activo al secreto derivado de la credencial del usuario.
// EN: Set the active secret to the user's credential-derived secret.
export function usarSecreto(s: string) {
  secretoActual = s;
}

// ── 3. Comprobar si hay datos / Existence check ───────────────────────────────
// ES: ¿Hay datos ya guardados en disco? / EN: Is there already data saved on disk?
export function hayDatos(): boolean {
  return localStorage.getItem(CLAVE_DATOS) !== null;
}

// ── 4. Cargar y descifrar / Load & decrypt ────────────────────────────────────
// ES: Carga y descifra los datos. Devuelve null si no hay nada guardado o si el
//     contenido descifrado no tiene la forma esperada (corrupto). Lanza error si
//     el secreto no es válido (credencial incorrecta) — AES-GCM falla al descifrar.
// EN: Loads and decrypts the data. Returns null if nothing is saved or the
//     decrypted content does not have the expected shape (corrupt). Throws if
//     the secret is wrong (bad credential) — AES-GCM fails to decrypt.
export async function cargar(): Promise<DatosBolsillo | null> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (!blob) return null;
  const json = await descifrar(blob, secretoActual);
  const datos = JSON.parse(json);
  return esDatosValidos(datos) ? datos : null;
}

// ── 5. Cola de guardado serializado / Serialized save queue ───────────────────
// ES: Cola para SERIALIZAR los guardados: como cifrar es async (PBKDF2 + AES), dos
//     guardados solapados podrían escribir en orden inverso y dejar en disco un
//     blob que no corresponde al último estado (o cifrado con un secreto antiguo).
//     La cola garantiza que se cifra y escribe de uno en uno, en orden, con el
//     secreto vigente.
// EN: Queue to SERIALIZE saves: since encrypting is async (PBKDF2 + AES), two
//     overlapping saves could write out of order and leave on disk a blob that
//     does not match the latest state (or encrypted with an old secret). The
//     queue guarantees encrypt-and-write happens one at a time, in order, with
//     the current secret.
let cola: Promise<void> = Promise.resolve();

// ES: Encola un guardado. Captura el secreto vigente Y serializa el estado AL
//     ENCOLAR (no al ejecutar). Serializar aquí "congela" el estado del momento
//     del encolado: aunque el estado reactivo siga mutando antes de que la cola
//     llegue a cifrarlo (snapshot devuelve refs vivas), el blob escrito
//     corresponde exactamente a este instante. Y el secreto no depende del orden
//     de resolución frente a cambios de secreto.
// EN: Enqueues a save. Captures the current secret AND serializes the state AT
//     ENQUEUE time (not at execution). Serializing here "freezes" the state of
//     this moment: even if the reactive state keeps mutating before the queue
//     reaches the encrypt step (snapshot returns live refs), the written blob
//     matches exactly this instant. And the secret no longer depends on the
//     resolution order versus secret changes.
export function guardar(datos: DatosBolsillo): Promise<void> {
  const secreto = secretoActual;
  const json = JSON.stringify(datos);
  // ES: Ejecuta este guardado tras el anterior (haya ido bien o mal) para serializar
  //     las escrituras. `resultado` refleja el resultado de ESTA escritura y es lo
  //     que devolvemos — así quien hace await de guardar() SÍ ve su error (p.ej.
  //     almacenamiento lleno). `cola` solo traga errores para mantener viva la
  //     cadena de los siguientes guardados, nunca para ocultar el fallo a quien espera.
  // EN: Run this save after the previous one finishes (success OR failure) to keep
  //     writes serialized. `resultado` reflects THIS write's outcome and is what we
  //     return — so a caller awaiting guardar() DOES see its error (e.g. storage
  //     full). `cola` swallows errors only to keep the chain alive for next saves,
  //     never to mask the failure from the awaiter.
  const ejecutar = async () => {
    const blob = await cifrar(json, secreto);
    localStorage.setItem(CLAVE_DATOS, blob);
  };
  const resultado = cola.then(ejecutar, ejecutar);
  cola = resultado.catch(() => {});
  return resultado;
}

// ── 6. Validación del secreto / Secret validation ─────────────────────────────
// ES: Comprueba si un secreto puede descifrar los datos actuales (para validar
//     la credencial al desbloquear). true si descifra, false si no.
// EN: Checks whether a secret can decrypt the current data (to validate the
//     credential on unlock). true if it decrypts, false if it does not.
export async function secretoValido(secreto: string): Promise<boolean> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  // ES: No hay datos aún: cualquier secreto sirve para empezar.
  // EN: No data yet: any secret works to start from scratch.
  if (!blob) return true;
  try {
    await descifrar(blob, secreto);
    return true;
  } catch {
    return false;
  }
}
