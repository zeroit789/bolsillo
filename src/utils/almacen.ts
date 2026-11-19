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
 *   4. Leer y clasificar el resultado / Read & classify the outcome
 *   5. Cola de guardado serializado / Serialized save queue
 *   6. Validación del secreto / Secret validation
 *   7. Copias de rescate / Rescue copies
 * ===========================================================================*/
import { esDatosValidos, type DatosBolsillo } from "../types";
import { cifrar, descifrar, leerSobre, ErrorSobreDanado } from "./cripto";
import { prepararDatos, ErrorDatos } from "./migraciones";

// ── 1. Constantes y secreto activo / Constants & active secret ────────────────
// ES: Clave de localStorage bajo la que se guarda el blob de datos cifrado.
// EN: localStorage key under which the encrypted data blob is stored.
const CLAVE_DATOS = "bolsillo.datos.cif";

// ES: Secreto usado cuando el usuario NO ha puesto credencial. No da seguridad
//     fuerte (está en el binario), pero evita que los datos se vean en claro.
// EN: Secret used when the user has NOT set a credential. It gives no strong
//     security (it lives in the binary), but keeps data from being plaintext.
export const SECRETO_OFUSCACION = "bolsillo::ofuscacion::v1::Z3r0";

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

// ── 4. Leer y clasificar el resultado / Read & classify the outcome ───────────
// ES: Resultado de leer el almacén. Se clasifica por la ETAPA que falla:
//       - "vacio": no hay blob guardado.
//       - "danado": el sobre (JSON, campos, base64, tamaños) está roto. Daño seguro.
//       - "credencial": AES-GCM no descifra. Puede ser credencial incorrecta O
//         cifrado alterado: con AES-GCM esos dos casos NO se distinguen.
//       - "invalido": descifra, pero el contenido no es JSON o no valida ni tras migrar.
//       - "version": lo escribió una versión más nueva de Bolsillo.
//       - "ok": datos listos (ya migrados a la versión actual).
// EN: Result of reading the store. It is classified by the STAGE that fails:
//       - "vacio": no blob stored.
//       - "danado": the envelope (JSON, fields, base64, sizes) is broken. Certain damage.
//       - "credencial": AES-GCM does not decrypt. It may be a wrong credential OR
//         an altered ciphertext: with AES-GCM those two cases CANNOT be told apart.
//       - "invalido": it decrypts, but the content is not JSON or does not
//         validate even after migrating.
//       - "version": it was written by a newer Bolsillo version.
//       - "ok": data ready (already migrated to the current version).
export type ResultadoLectura =
  | { estado: "ok"; datos: DatosBolsillo }
  | { estado: "vacio" | "danado" | "credencial" | "invalido" | "version" };

// ES: ¿El sobre guardado tiene una forma legible? Se comprueba SIN secreto, así
//     que sirve al arrancar, antes de pedir la credencial. true si no hay blob.
// EN: Does the stored envelope have a readable shape? Checked WITHOUT a secret,
//     so it works at boot, before asking for the credential. true if no blob.
export function sobreLegible(): boolean {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (blob === null) return true;
  try {
    leerSobre(blob);
    return true;
  } catch {
    return false;
  }
}

// ES: Lee, descifra (con el secreto dado o el activo), migra y valida. Nunca
//     lanza por datos malos: devuelve el estado para que la sesión decida, y
//     NUNCA escribe nada en disco.
// EN: Reads, decrypts (with the given secret or the active one), migrates and
//     validates. It never throws on bad data: it returns the state so the
//     session decides, and it NEVER writes anything to disk.
export async function leer(secreto: string = secretoActual): Promise<ResultadoLectura> {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (blob === null) return { estado: "vacio" };
  // ES: Etapa 1+2: sobre y descifrado. / EN: Stage 1+2: envelope and decryption.
  let json: string;
  try {
    json = await descifrar(blob, secreto);
  } catch (e) {
    return { estado: e instanceof ErrorSobreDanado ? "danado" : "credencial" };
  }
  // ES: Etapa 3: contenido en claro (JSON, migración, validación).
  // EN: Stage 3: plaintext content (JSON, migration, validation).
  try {
    return { estado: "ok", datos: prepararDatos(JSON.parse(json)) };
  } catch (e) {
    return { estado: e instanceof ErrorDatos && e.motivo === "version" ? "version" : "invalido" };
  }
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
// ES: `secreto` permite cifrar con uno distinto del activo (al cambiar la
//     credencial: primero se guarda con la nueva y solo si va bien se activa).
// EN: `secreto` allows encrypting with one other than the active one (when
//     changing the credential: save with the new one first, activate it only
//     if that worked).
// ES: Antes de cifrar comprueba que lo que se va a escribir (ya pasado por JSON)
//     es válido: si un fallo de la app produjera algo ilegible (p. ej. un
//     Infinity que JSON convierte en null), el guardado falla y avisa, pero el
//     blob bueno anterior se queda en disco en vez de bloquear el próximo arranque.
// EN: Before encrypting it checks that what will be written (already through
//     JSON) is valid: if an app bug produced something unreadable (e.g. an
//     Infinity that JSON turns into null), the save fails and warns, but the
//     previous good blob stays on disk instead of blocking the next boot.
export function guardar(datos: DatosBolsillo, secreto: string = secretoActual): Promise<void> {
  const json = JSON.stringify(datos);
  if (!esDatosValidos(JSON.parse(json))) return Promise.reject(new Error("datos-no-validos"));
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
//     la credencial antigua al cambiarla). true si descifra, false si no.
// EN: Checks whether a secret can decrypt the current data (to validate the old
//     credential when changing it). true if it decrypts, false if it does not.
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

// ── 7. Copias de rescate / Rescue copies ──────────────────────────────────────
// ES: Prefijo de las copias de rescate: el blob tal cual (cifrado) bajo una clave
//     con la fecha. Nunca se borran ni se pisan desde la app.
// EN: Prefix of the rescue copies: the blob as is (encrypted) under a key with
//     the date. The app never deletes nor overwrites them.
export const PREFIJO_RESCATE = "bolsillo.datos.rescate.";

// ES: Devuelve el blob guardado tal cual (para descargarlo si no cabe el rescate).
// EN: Returns the stored blob as is (to download it if the rescue does not fit).
export function blobCrudo(): string | null {
  return localStorage.getItem(CLAVE_DATOS);
}

// ES: Copia el blob actual a una clave de rescate nueva y devuelve su nombre.
//     - Si ya existe un rescate con el mismo contenido, devuelve ese (no duplica
//       en cada arranque y no llena el almacenamiento).
//     - Nunca pisa un rescate anterior: si la clave existe, añade un sufijo.
//     - Lanza si no hay blob o si no cabe (QuotaExceededError): quien llama
//       debe avisar y NO seguir como si hubiera copia.
// EN: Copies the current blob to a new rescue key and returns its name.
//     - If a rescue with the same content already exists, returns it (no
//       duplicate on every boot and no filling up storage).
//     - Never overwrites an earlier rescue: if the key exists, adds a suffix.
//     - Throws if there is no blob or it does not fit (QuotaExceededError):
//       the caller must warn and NOT go on as if there were a copy.
export function crearRescate(ahora: Date = new Date()): string {
  const blob = localStorage.getItem(CLAVE_DATOS);
  if (blob === null) throw new Error("sin-datos");
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(PREFIJO_RESCATE) && localStorage.getItem(k) === blob) return k;
  }
  // ES: Fecha legible y válida como clave: 2026-11-19T09-30-00. / EN: Readable date usable as a key.
  const base = PREFIJO_RESCATE + ahora.toISOString().slice(0, 19).replace(/:/g, "-");
  let clave = base;
  for (let n = 2; localStorage.getItem(clave) !== null; n++) clave = `${base}-${n}`;
  localStorage.setItem(clave, blob);
  return clave;
}
