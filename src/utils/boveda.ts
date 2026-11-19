/* =============================================================================
 * boveda.ts — Almacén cifrado en fichero (puente con Rust) / Encrypted file store (Rust bridge)
 * -----------------------------------------------------------------------------
 * ES: Puente del frontend con la bóveda de Rust (src-tauri/src/boveda.rs).
 *     Rust cifra, descifra y escribe en disco; aquí se preparan los datos:
 *       - Recibos: en memoria cada apunte lleva su recibo como data URL (lo
 *         que pintan las vistas). En disco van aparte, cifrados, uno por
 *         fichero, y el apunte solo guarda `reciboId`. Al guardar se envían
 *         solo los recibos que aún no están en disco; al abrir se cargan todos.
 *         Si falta el fichero de un recibo, el apunte conserva su `reciboId`
 *         (nunca se pierde la referencia).
 *       - Cola: todas las escrituras van de una en una y en orden; el estado
 *         se serializa AL ENCOLAR (lo escrito es exactamente ese instante).
 *       - Sin Tauri: en tests y en `pnpm dev` (desarrollo) se usa el simulador
 *         (rustSimulado.ts, solo en memoria y sin cifrar); en la app
 *         empaquetada sin Tauri falla cerrado ("sin-tauri") y nunca escribe en
 *         localStorage.
 * EN: Frontend bridge to the Rust vault (src-tauri/src/boveda.rs). Rust
 *     encrypts, decrypts and writes to disk; here the data is prepared:
 *       - Receipts: in memory each entry carries its receipt as a data URL
 *         (what the views paint). On disk they live apart, encrypted, one per
 *         file, and the entry only keeps `reciboId`. On save only the receipts
 *         not yet on disk are sent; on open all of them are loaded. If a
 *         receipt file is missing, the entry keeps its `reciboId` (the
 *         reference is never lost).
 *       - Queue: every write runs one at a time and in order; the state is
 *         serialized AT ENQUEUE time (what is written is exactly that instant).
 *       - Without Tauri: tests and `pnpm dev` (development) use the simulator
 *         (rustSimulado.ts, memory only and unencrypted); the packaged app
 *         without Tauri fails closed ("sin-tauri") and never writes to
 *         localStorage.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Tipos y errores / Types & errors
 *   2. Llamar a Rust / Calling Rust
 *   3. Recibos: separar y unir / Receipts: split & join
 *   4. Cola de escrituras / Write queue
 *   5. Estado, abrir y guardar / State, open & save
 *   6. Crear y migrar / Create & migrate
 *   7. Bloqueo y credenciales / Lock & credentials
 *   8. Copias / Backups
 *   9. Comparación profunda / Deep comparison
 * ===========================================================================*/
import { invoke, isTauri } from "@tauri-apps/api/core";
import { esDatosValidos, type DatosBolsillo, type Puntual } from "../types";
import { prepararDatos } from "./migraciones";

// ── 1. Tipos y errores / Types & errors ──────────────────────────────────────
export type Bloqueo = "ninguno" | "pin" | "password";

// ES: Estado del almacén (lo que devuelve Rust, en camelCase).
// EN: Store state (what Rust returns, in camelCase).
export interface EstadoAlmacen {
  hayFichero: boolean;
  legible: boolean;
  motivo: "danado" | "version" | null;
  bloqueo: Bloqueo | null;
  tieneRecuperacion: boolean;
  migracion: { desde: string; fecha: string; huella: string } | null;
  hayMarca: boolean;
  hayCopias: boolean;
  hayRescate: boolean;
  abierta: boolean;
  porRecuperacion: boolean;
  // ES: copias que aún tienen la protección anterior / EN: backups that still have the previous protection
  copiasPendientes: number;
}

// ES: ¿Se está usando el simulador (desarrollo en navegador, sin cifrado)?
// EN: Is the simulator in use (browser development, unencrypted)?
export function esSimulado(): boolean {
  return !isTauri() && import.meta.env.DEV && import.meta.env.MODE !== "test";
}

// ES: Copia automática listada. / EN: Listed automatic backup.
export interface InfoCopia {
  nombre: string;
  bytes: number;
  segundos: number;
  // ES: "ninguno" | "pin" | "password" (null si no se pudo leer) / EN: lock type (null if unreadable)
  bloqueo: string | null;
}

// ES: Error con el código de texto que devuelve Rust ("credencial", "danado",
//     "existe", "io:…", "sin-tauri"…).
// EN: Error with the text code Rust returns ("credencial", "danado",
//     "existe", "io:…", "sin-tauri"…).
export class ErrorBoveda extends Error {
  constructor(public readonly codigo: string) {
    super(codigo);
    this.name = "ErrorBoveda";
  }
}

// ── 2. Llamar a Rust / Calling Rust ──────────────────────────────────────────
// ES: Llama a un comando de Rust; sin Tauri, al simulador (solo en desarrollo
//     y tests). Los errores de Rust llegan como texto y se envuelven.
// EN: Calls a Rust command; without Tauri, the simulator (development and
//     tests only). Rust errors arrive as text and are wrapped.
async function invocar<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  try {
    if (isTauri()) return await invoke<T>(cmd, args);
    if (import.meta.env.DEV || import.meta.env.MODE === "test") {
      const { simularInvoke } = await import("./rustSimulado");
      return await simularInvoke<T>(cmd, args);
    }
  } catch (e) {
    throw new ErrorBoveda(typeof e === "string" ? e : e instanceof Error ? e.message : "interno");
  }
  throw new ErrorBoveda("sin-tauri");
}

// ES: Pasa el estado de Rust (snake_case) a camelCase.
// EN: Converts the Rust state (snake_case) to camelCase.
function aEstado(r: Record<string, unknown>): EstadoAlmacen {
  return {
    hayFichero: !!r.hay_fichero,
    legible: !!r.legible,
    motivo: (r.motivo as EstadoAlmacen["motivo"]) ?? null,
    bloqueo: (r.bloqueo as Bloqueo | null) ?? null,
    tieneRecuperacion: !!r.tiene_recuperacion,
    migracion: (r.migracion as EstadoAlmacen["migracion"]) ?? null,
    hayMarca: !!r.hay_marca,
    hayCopias: !!r.hay_copias,
    hayRescate: !!r.hay_rescate,
    abierta: !!r.abierta,
    porRecuperacion: !!r.por_recuperacion,
    copiasPendientes: Number(r.copias_pendientes ?? 0),
  };
}

// ── 3. Recibos: separar y unir / Receipts: split & join ───────────────────────
// ES: data URL → id del recibo (para no volver a enviar el mismo recibo).
// EN: data URL → receipt id (so the same receipt is not sent again).
const idPorRecibo = new Map<string, string>();
// ES: ids ya escritos en disco y ids cuyo fichero faltaba al abrir.
// EN: ids already written to disk and ids whose file was missing on open.
const enDisco = new Set<string>();
const faltantes = new Set<string>();

// ES: Recibo para enviar a Rust. / EN: Receipt to send to Rust.
interface ReciboEntrada {
  id: string;
  datos: string;
}

// ES: Forma de disco: cada recibo en memoria pasa a `reciboId` y se apunta
//     para enviarlo si aún no está en disco. Un `reciboId` sin recibo se
//     conserva siempre: en memoria solo lo llevan los recibos cuyo fichero
//     falta (al cargar uno, su `reciboId` se quita) o los que vienen así en una
//     copia importada; nunca se pierde la referencia.
// EN: Disk shape: each in-memory receipt becomes `reciboId` and is noted to be
//     sent if it is not on disk yet. A `reciboId` without a receipt is always
//     kept: in memory only receipts whose file is missing carry it (loading
//     one removes its `reciboId`) or the ones coming like that in an imported
//     backup; the reference is never lost.
export function separarRecibos(datos: DatosBolsillo): {
  disco: DatosBolsillo;
  nuevos: ReciboEntrada[];
} {
  const nuevos: ReciboEntrada[] = [];
  const vistos = new Set<string>();
  const puntuales = datos.puntuales.map((p): Puntual => {
    const { recibo, reciboId, ...resto } = p;
    if (recibo) {
      let id = idPorRecibo.get(recibo);
      if (!id) {
        id = crypto.randomUUID();
        idPorRecibo.set(recibo, id);
      }
      if (!enDisco.has(id) && !vistos.has(id)) {
        nuevos.push({ id, datos: recibo });
        vistos.add(id);
      }
      return { ...resto, reciboId: id };
    }
    return reciboId ? { ...resto, reciboId } : resto;
  });
  return { disco: { ...datos, puntuales }, nuevos };
}

// ES: Une los recibos leídos de disco a los apuntes (forma de memoria).
// EN: Joins the receipts read from disk to the entries (memory shape).
async function unirRecibos(datos: DatosBolsillo): Promise<DatosBolsillo> {
  const ids = [...new Set(datos.puntuales.map((p) => p.reciboId).filter((x): x is string => !!x))];
  if (ids.length === 0) return datos;
  const leidos = await invocar<{ id: string; datos: string | null }[]>("leer_recibos", { ids });
  const porId = new Map(leidos.map((r) => [r.id, r.datos]));
  const puntuales = datos.puntuales.map((p): Puntual => {
    if (!p.reciboId) return p;
    const recibo = porId.get(p.reciboId);
    if (!recibo) {
      faltantes.add(p.reciboId);
      return p;
    }
    idPorRecibo.set(recibo, p.reciboId);
    enDisco.add(p.reciboId);
    const { reciboId: _id, ...resto } = p;
    void _id;
    return { ...resto, recibo };
  });
  return { ...datos, puntuales };
}

// ES: Olvida lo aprendido de los recibos (al bloquear o cambiar de almacén).
// EN: Forgets what was learned about receipts (on lock or store change).
function olvidarRecibos() {
  idPorRecibo.clear();
  enDisco.clear();
  faltantes.clear();
}

// ── 4. Cola de escrituras / Write queue ───────────────────────────────────────
let cola: Promise<unknown> = Promise.resolve();

// ES: Ejecuta `op` cuando terminen las anteriores (bien o mal). Quien espera
//     ve SU error; la cola solo lo traga para seguir viva.
// EN: Runs `op` when the previous ones finish (well or not). The awaiter sees
//     ITS error; the queue only swallows it to stay alive.
function enCola<T>(op: () => Promise<T>): Promise<T> {
  const r = cola.then(op, op);
  cola = r.catch(() => {});
  return r;
}

// ES: Serializa y valida YA (al encolar) la forma de disco de unos datos.
// EN: Serializes and validates NOW (at enqueue time) the disk shape of some data.
function preparar(datos: DatosBolsillo): { json: string; nuevos: ReciboEntrada[] } {
  const { disco, nuevos } = separarRecibos(datos);
  const json = JSON.stringify(disco);
  if (!esDatosValidos(JSON.parse(json))) throw new ErrorBoveda("datos-no-validos");
  return { json, nuevos };
}

// ES: Texto JSON de disco → datos de memoria (migrar + validar + recibos).
// EN: Disk JSON text → memory data (migrate + validate + receipts).
async function aMemoria(json: string): Promise<DatosBolsillo> {
  return unirRecibos(prepararDatos(JSON.parse(json)));
}

// ── 5. Estado, abrir y guardar / State, open & save ──────────────────────────
export async function estado(): Promise<EstadoAlmacen> {
  return aEstado(await invocar<Record<string, unknown>>("estado_almacen"));
}

// ES: Abre con la credencial (o sin ella si no hay bloqueo). Lanza ErrorBoveda
//     ("credencial", "danado", "version", "vacio") o ErrorDatos si el
//     contenido no valida (lo trata la sesión).
// EN: Opens with the credential (or without it if there is no lock). Throws
//     ErrorBoveda ("credencial", "danado", "version", "vacio") or ErrorDatos
//     if the content does not validate (the session handles it).
export async function abrir(credencial?: string): Promise<DatosBolsillo> {
  olvidarRecibos();
  const json = await invocar<string>("abrir_almacen", { credencial: credencial ?? null });
  return aMemoria(json);
}

export async function abrirConRecuperacion(clave: string): Promise<DatosBolsillo> {
  olvidarRecibos();
  return aMemoria(await invocar<string>("abrir_con_recuperacion", { clave }));
}

// ES: Guarda unos datos (recibos nuevos primero; Rust escribe el principal al final).
// EN: Saves some data (new receipts first; Rust writes the main file last).
export function guardar(datos: DatosBolsillo): Promise<void> {
  let p: { json: string; nuevos: ReciboEntrada[] };
  try {
    p = preparar(datos);
  } catch (e) {
    return Promise.reject(e);
  }
  return enCola(async () => {
    await invocar("guardar_datos", { datos: p.json, recibos: p.nuevos });
    for (const r of p.nuevos) enDisco.add(r.id);
  });
}

// ── 6. Crear y migrar / Create & migrate ──────────────────────────────────────
// ES: Crea el almacén (bienvenida, empezar de cero, importar desde el error).
//     Devuelve la clave de recuperación si hay bloqueo.
// EN: Creates the store (welcome, start from scratch, import from the error).
//     Returns the recovery key if there is a lock.
export function crear(
  datos: DatosBolsillo,
  bloqueo: Bloqueo,
  credencial: string | null,
  reemplazar: boolean,
  origen: string
): Promise<string | null> {
  olvidarRecibos();
  let p: { json: string; nuevos: ReciboEntrada[] };
  try {
    p = preparar(datos);
  } catch (e) {
    return Promise.reject(e);
  }
  return enCola(async () => {
    const clave = await invocar<string | null>("crear_almacen", {
      datos: p.json,
      recibos: p.nuevos,
      bloqueo,
      credencial,
      reemplazar,
      origen,
    });
    for (const r of p.nuevos) enDisco.add(r.id);
    return clave;
  });
}

// ES: Huella SHA-256 (hex) de un texto: identifica el blob de localStorage
//     migrado para saber después si alguien lo cambió (p. ej. con la 1.1.0).
// EN: SHA-256 fingerprint (hex) of a text: identifies the migrated
//     localStorage blob to know later whether someone changed it (e.g. 1.1.0).
export async function huella(texto: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(h), (b) => b.toString(16).padStart(2, "0")).join("");
}

// ES: Migración en tres fases desde localStorage:
//       1. Rust escribe datos.bolsillo.migrando y lo verifica por bytes
//          (volviendo a derivar desde la credencial y abriendo con la clave
//          de recuperación).
//       2. Aquí se relee por el camino normal (descifrar + migrar + validar)
//          y se compara en profundidad con los datos de origen.
//       3. Solo si coincide, Rust lo renombra a datos.bolsillo y deja la marca.
//     Si algo falla se cancela (el .migrando se aparta a rescate/) y se lanza:
//     el localStorage sigue siendo la verdad y NUNCA se borra.
// EN: Three-phase migration from localStorage:
//       1. Rust writes datos.bolsillo.migrando and verifies it by bytes
//          (deriving again from the credential and opening with the
//          recovery key).
//       2. Here it is read back through the normal path (decrypt + migrate +
//          validate) and deep-compared with the source data.
//       3. Only if it matches, Rust renames it to datos.bolsillo and leaves
//          the marker.
//     If anything fails it is cancelled (the .migrando is moved to rescate/)
//     and it throws: localStorage stays the truth and is NEVER deleted.
export function migrar(
  datos: DatosBolsillo,
  bloqueo: Bloqueo,
  credencial: string | null,
  huellaOrigen: string
): Promise<string | null> {
  olvidarRecibos();
  let p: { json: string; nuevos: ReciboEntrada[] };
  try {
    p = preparar(datos);
  } catch (e) {
    return Promise.reject(e);
  }
  const esperado = JSON.parse(p.json) as unknown;
  // ES: Origen congelado al llamar (como JSON: sin undefined ni referencias vivas).
  // EN: Source frozen at call time (as JSON: no undefined nor live references).
  const origen = JSON.parse(JSON.stringify(datos)) as unknown;
  return enCola(async () => {
    try {
      const clave = await invocar<string | null>("preparar_migracion", {
        datos: p.json,
        recibos: p.nuevos,
        bloqueo,
        credencial,
        huella: huellaOrigen,
      });
      const releido = prepararDatos(JSON.parse(await invocar<string>("leer_migracion")));
      if (!igualesProfundo(releido, esperado)) throw new ErrorBoveda("verificacion");
      // ES: Y con los recibos vueltos a poner en su sitio, igual que el origen.
      // EN: And with the receipts put back in place, equal to the source.
      const porId = new Map(p.nuevos.map((r) => [r.id, r.datos]));
      const unido = {
        ...releido,
        puntuales: releido.puntuales.map((x) => {
          if (!x.reciboId || !porId.has(x.reciboId)) return x;
          const { reciboId, ...resto } = x;
          return { ...resto, recibo: porId.get(reciboId) };
        }),
      };
      if (!igualesProfundo(unido, origen)) throw new ErrorBoveda("verificacion");
      await invocar("confirmar_migracion");
      for (const r of p.nuevos) enDisco.add(r.id);
      return clave;
    } catch (e) {
      await invocar("cancelar_migracion").catch(() => {});
      throw e instanceof ErrorBoveda ? e : new ErrorBoveda("verificacion");
    }
  });
}

// ── 7. Bloqueo y credenciales / Lock & credentials ────────────────────────────
// ES: Olvida la clave de datos en Rust y lo aprendido de los recibos.
// EN: Forgets the data key in Rust and what was learned about receipts.
export function bloquear(): Promise<void> {
  return enCola(async () => {
    await invocar("bloquear_almacen");
    olvidarRecibos();
  });
}

// ES: Activa el bloqueo (cambia la clave de datos). Devuelve la clave de
//     recuperación nueva, que hay que enseñar una vez.
// EN: Enables the lock (changes the data key). Returns the new recovery key,
//     which must be shown once.
export function configurarBloqueo(bloqueo: "pin" | "password", credencial: string) {
  return enCola(() => invocar<string>("configurar_bloqueo", { bloqueo, credencial }));
}

export function quitarBloqueo() {
  return enCola(() => invocar<void>("quitar_bloqueo"));
}

// ES: Cambia la credencial. `antigua` puede ser null si se abrió con la clave
//     de recuperación.
// EN: Changes the credential. `antigua` may be null if it was opened with the
//     recovery key.
export function cambiarCredencial(
  antigua: string | null,
  bloqueo: "pin" | "password",
  nueva: string
) {
  return enCola(() => invocar<void>("cambiar_credencial", { antigua, bloqueo, nueva }));
}

export function regenerarRecuperacion(credencial: string) {
  return enCola(() => invocar<string>("regenerar_recuperacion", { credencial }));
}

// ── 8. Copias / Backups ───────────────────────────────────────────────────────
// ES: Copia del principal a rescate/ (sin moverlo). / EN: Copy of the main file to rescate/ (without moving it).
export function rescatar() {
  return enCola(() => invocar<string>("rescatar_almacen"));
}

export function listarCopias() {
  return invocar<InfoCopia[]>("listar_copias");
}

// ES: Abre y descifra una copia automática SIN publicarla y valida su
//     contenido (migrar + validar). Lanza si no abre o no es válida.
// EN: Opens and decrypts an automatic backup WITHOUT publishing it and
//     validates its content (migrate + validate). Throws if it does not open
//     or is not valid.
export async function probarCopia(nombre: string, credencial: string | null): Promise<void> {
  prepararDatos(JSON.parse(await invocar<string>("probar_copia", { nombre, credencial })));
}

// ES: Restaura una copia automática ya probada: queda abierta con ella y
//     devuelve sus datos en forma de memoria (con sus recibos).
// EN: Restores an already tested automatic backup: it is left open with it
//     and returns its data in memory shape (with its receipts).
export function restaurarCopia(
  nombre: string,
  credencial: string | null
): Promise<{ datos: DatosBolsillo; estado: EstadoAlmacen }> {
  return enCola(async () => {
    olvidarRecibos();
    const r = await invocar<{ datos: string; estado: Record<string, unknown> }>("restaurar_copia", {
      nombre,
      credencial,
    });
    return { datos: await aMemoria(r.datos), estado: aEstado(r.estado) };
  });
}

// ES: Exporta una copia cifrada con contraseña propia; `datos` va con los
//     recibos dentro (la copia es autosuficiente). false si se cancela.
// EN: Exports a backup encrypted with its own password; `datos` carries the
//     receipts inside (the backup is self-contained). false if cancelled.
export function exportarCopiaCifrada(datos: unknown, contrasena: string, nombre: string) {
  return invocar<boolean>("exportar_copia_cifrada", {
    datos: JSON.stringify(datos),
    contrasena,
    nombre,
  });
}

// ES: Resultado de elegir un fichero para importar. / EN: Result of picking a file to import.
export type CopiaElegida =
  { tipo: "json"; contenido: string } | { tipo: "cifrada"; bloqueo: Bloqueo } | null;

export function elegirCopia() {
  return invocar<CopiaElegida>("elegir_copia");
}

// ES: Descifra la copia elegida y devuelve su contenido ya parseado (sin
//     validar: la sesión lo pasa por migrar + validar).
// EN: Decrypts the picked backup and returns its content already parsed
//     (not validated: the session runs it through migrate + validate).
export async function descifrarCopia(contrasena: string): Promise<unknown> {
  return JSON.parse(await invocar<string>("descifrar_copia", { contrasena }));
}

// ── 9. Comparación profunda / Deep comparison ─────────────────────────────────
// ES: Igualdad estructural de valores JSON (el orden de las claves no cuenta).
// EN: Structural equality of JSON values (key order does not matter).
export function igualesProfundo(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null || typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    const bb = b as unknown[];
    return a.length === bb.length && a.every((x, i) => igualesProfundo(x, bb[i]));
  }
  const oa = a as Record<string, unknown>;
  const ob = b as Record<string, unknown>;
  const ka = Object.keys(oa).filter((k) => oa[k] !== undefined);
  const kb = Object.keys(ob).filter((k) => ob[k] !== undefined);
  return ka.length === kb.length && ka.every((k) => igualesProfundo(oa[k], ob[k]));
}
