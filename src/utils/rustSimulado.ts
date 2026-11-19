/* =============================================================================
 * rustSimulado.ts — Backend Rust simulado (tests y navegador) / Simulated Rust backend
 * -----------------------------------------------------------------------------
 * ES: Imita en TypeScript los comandos de la bóveda de Rust (src-tauri/src/
 *     boveda.rs) con sus mismas reglas: nunca pisa un fichero existente, pide
 *     la credencial correcta, la clave de recuperación abre sin PIN, migración
 *     en tres fases, copias rotativas y restauración. NO cifra nada: guarda en
 *     memoria. Solo se usa:
 *       - en los tests (Vitest), y
 *       - con `pnpm dev` en un navegador normal (modo desarrollo), donde no
 *         hay Tauri. En ese caso guarda en el localStorage del navegador de
 *         desarrollo, nunca en el de la app.
 *     La app empaquetada nunca lo carga: boveda.ts falla cerrado sin Tauri.
 * EN: Mimics in TypeScript the Rust vault commands (src-tauri/src/boveda.rs)
 *     with the same rules: never overwrites an existing file, asks for the
 *     right credential, the recovery key opens without the PIN, three-phase
 *     migration, rotating backups and restore. It encrypts NOTHING: it keeps
 *     things in memory. It is only used:
 *       - in tests (Vitest), and
 *       - with `pnpm dev` in a plain browser (development mode), where there
 *         is no Tauri. There it saves to the development browser's
 *         localStorage, never the app's.
 *     The packaged app never loads it: boveda.ts fails closed without Tauri.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Estado simulado / Simulated state
 *   2. Ayudantes / Helpers
 *   3. Comandos / Commands
 *   4. Control desde los tests / Test controls
 * ===========================================================================*/

// ── 1. Estado simulado / Simulated state ─────────────────────────────────────
type Bloqueo = "ninguno" | "pin" | "password";

// ES: Un "fichero" simulado: cabecera + datos en claro (aquí no se cifra).
// EN: A simulated "file": header + plaintext data (nothing is encrypted here).
interface FicheroSim {
  bloqueo: Bloqueo;
  dekId: string;
  credencial: string | null;
  recuperacion: string | null;
  migracion: { desde: string; fecha: string; huella: string } | null;
  datos: string;
}

interface EstadoSim {
  principal: FicheroSim | null;
  // ES: principal ilegible simulado ("danado" | "version") / EN: simulated unreadable main file
  principalRoto: "danado" | "version" | null;
  marca: boolean;
  migrando: FicheroSim | null;
  copias: Record<string, FicheroSim>;
  rescate: string[];
  recibos: Record<string, string>;
  // ES: en memoria del proceso (se pierde al "reiniciar") / EN: process memory (lost on "restart")
  abierta: { dekId: string; porRecuperacion: boolean } | null;
  pendiente: boolean;
  elegida: FicheroSim | null;
  exportadas: { nombre: string; contrasena: string; datos: string }[];
  archivos: { nombre: string; bytes: Uint8Array }[];
  reloj: number;
  // ES: escrituras del principal (para contar guardados) / EN: main-file writes (to count saves)
  escrituras: number;
  // ES: fallos inyectados / EN: injected failures
  fallarGuardado: boolean;
  fallarVerificacion: boolean;
  proximoArchivo: string | null;
  cancelarDialogo: boolean;
}

function vacio(): EstadoSim {
  return {
    principal: null,
    principalRoto: null,
    marca: false,
    migrando: null,
    copias: {},
    rescate: [],
    recibos: {},
    abierta: null,
    pendiente: false,
    elegida: null,
    exportadas: [],
    archivos: [],
    reloj: 1_795_046_400,
    escrituras: 0,
    fallarGuardado: false,
    fallarVerificacion: false,
    proximoArchivo: null,
    cancelarDialogo: false,
  };
}

// ES: Clave del localStorage del navegador de DESARROLLO (nunca el de la app).
// EN: Key in the DEVELOPMENT browser's localStorage (never the app's).
const CLAVE_DEV = "bolsillo.dev.simulador";
let st: EstadoSim = vacio();
let persistir = false;

// ── 2. Ayudantes / Helpers ───────────────────────────────────────────────────
// ES: Error con el mismo código de texto que devuelve Rust.
// EN: Error with the same text code Rust returns.
function err(codigo: string): never {
  throw codigo;
}

const copiar = (f: FicheroSim): FicheroSim => ({ ...f });

function nuevoId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

// ES: Clave de recuperación simulada con el mismo aspecto (8 grupos de 4).
// EN: Simulated recovery key with the same look (8 groups of 4).
function nuevaRecuperacion(): string {
  const a = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  const s = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => a[b & 31]).join("");
  return s.match(/.{4}/g)!.join("-");
}
const normalizar = (k: string) => k.replace(/[-\s]/g, "").toUpperCase();

function credValida(b: Bloqueo, c: string | null | undefined): boolean {
  if (b === "ninguno") return true;
  if (!c) return false;
  return b === "pin" ? /^\d{4,6}$/.test(c) : [...c].length >= 8;
}

function ahora(): number {
  st.reloj += 700;
  return st.reloj;
}

// ES: Copias rotativas: igual que directorio.rs (10 recientes ≥ 10 min, 1 diaria).
// EN: Rotating backups: same as directorio.rs (10 recent ≥ 10 min, 1 daily).
function rotar(f: FicheroSim) {
  const t = ahora();
  const recientes = Object.keys(st.copias)
    .filter((n) => n.startsWith("reciente-"))
    .sort();
  const ultima = recientes.length ? Number(recientes[recientes.length - 1].slice(9, 21)) : null;
  if (ultima === null || t - ultima >= 600) {
    st.copias[`reciente-${String(t).padStart(12, "0")}.bolsillo`] = copiar(f);
    recientes.push(`reciente-${String(t).padStart(12, "0")}.bolsillo`);
  }
  const dia = new Date(t * 1000).toISOString().slice(0, 10);
  if (!st.copias[`diaria-${dia}.bolsillo`]) st.copias[`diaria-${dia}.bolsillo`] = copiar(f);
  while (recientes.length > 10) delete st.copias[recientes.shift()!];
}

function guardarPersistente() {
  if (!persistir) return;
  try {
    const { abierta: _a, pendiente: _p, elegida: _e, ...resto } = st;
    void _a;
    void _p;
    void _e;
    localStorage.setItem(CLAVE_DEV, JSON.stringify(resto));
  } catch {
    /* ES: solo desarrollo / EN: development only */
  }
}

function abierta() {
  if (!st.abierta || !st.principal) err("bloqueado");
  return st.abierta!;
}

function escribirRecibos(dekId: string, recibos: { id: string; datos: string }[] = []) {
  for (const r of recibos) {
    if (!/^[A-Za-z0-9-]{1,64}$/.test(r.id)) err("danado");
    const k = `${dekId}/${r.id}`;
    if (!(k in st.recibos)) st.recibos[k] = r.datos;
  }
}

function construir(
  datos: string,
  recibos: { id: string; datos: string }[],
  bloqueo: Bloqueo,
  credencial: string | null
): { f: FicheroSim; clave: string | null } {
  const dekId = nuevoId();
  const clave = bloqueo === "ninguno" ? null : nuevaRecuperacion();
  escribirRecibos(dekId, recibos);
  return {
    f: {
      bloqueo,
      dekId,
      credencial: bloqueo === "ninguno" ? null : credencial,
      recuperacion: clave ? normalizar(clave) : null,
      migracion: null,
      datos,
    },
    clave,
  };
}

// ES: Cambia la DEK (como rotar_dek): recibos copiados a la carpeta nueva.
// EN: Changes the DEK (like rotar_dek): receipts copied to the new folder.
function rotarDek(f: FicheroSim): FicheroSim {
  const nuevo = nuevoId();
  for (const k of Object.keys(st.recibos))
    if (k.startsWith(`${f.dekId}/`)) st.recibos[`${nuevo}/${k.split("/")[1]}`] = st.recibos[k];
  return { ...f, dekId: nuevo };
}

// ── 3. Comandos / Commands ───────────────────────────────────────────────────
type Args = Record<string, unknown>;
const comandos: Record<string, (a: Args) => unknown> = {
  estado_almacen: () => ({
    hay_fichero: st.principal !== null || st.principalRoto !== null,
    legible: st.principal !== null,
    motivo: st.principalRoto,
    bloqueo: st.principal?.bloqueo ?? null,
    tiene_recuperacion: !!st.principal?.recuperacion,
    migracion: st.principal?.migracion ?? null,
    hay_marca: st.marca,
    hay_copias: Object.keys(st.copias).length > 0,
    hay_rescate: st.rescate.some((n) => n.startsWith("rescate/datos-")),
    abierta: st.abierta !== null,
    por_recuperacion: !!st.abierta?.porRecuperacion,
  }),

  abrir_almacen: (a) => {
    if (st.principalRoto) err(st.principalRoto);
    const f = st.principal ?? err("vacio");
    if (f.bloqueo !== "ninguno" && a.credencial !== f.credencial) err("credencial");
    st.abierta = { dekId: f.dekId, porRecuperacion: false };
    return f.datos;
  },

  abrir_con_recuperacion: (a) => {
    const f = st.principal ?? err("vacio");
    const k = normalizar(String(a.clave ?? ""));
    if (k.length !== 32) err("recuperacion-formato");
    if (!f.recuperacion) err("sin-recuperacion");
    if (k !== f.recuperacion) err("credencial");
    st.abierta = { dekId: f.dekId, porRecuperacion: true };
    return f.datos;
  },

  leer_datos: () => {
    abierta();
    return st.principal!.datos;
  },

  leer_recibos: (a) => {
    const ab = abierta();
    return (a.ids as string[]).map((id) => ({
      id,
      datos: st.recibos[`${ab.dekId}/${id}`] ?? null,
    }));
  },

  guardar_datos: (a) => {
    const ab = abierta();
    if (st.fallarGuardado) err("io:disco lleno");
    escribirRecibos(ab.dekId, a.recibos as { id: string; datos: string }[]);
    st.principal = { ...st.principal!, datos: String(a.datos) };
    st.escrituras++;
    rotar(st.principal);
  },

  crear_almacen: (a) => {
    const bloqueo = a.bloqueo as Bloqueo;
    const cred = (a.credencial as string | null) ?? null;
    if (bloqueo !== "ninguno" && !credValida(bloqueo, cred)) err("credencial-invalida");
    if (st.principal || st.principalRoto) {
      if (!a.reemplazar) err("existe");
      st.rescate.push(`rescate/datos-${ahora()}.bolsillo`);
      st.principal = null;
      st.principalRoto = null;
    }
    if (st.fallarGuardado) err("io:disco lleno");
    const { f, clave } = construir(
      String(a.datos),
      a.recibos as { id: string; datos: string }[],
      bloqueo,
      cred
    );
    st.principal = f;
    st.marca = true;
    st.abierta = { dekId: f.dekId, porRecuperacion: false };
    rotar(f);
    return clave;
  },

  preparar_migracion: (a) => {
    if (st.principal || st.principalRoto) err("existe");
    const bloqueo = a.bloqueo as Bloqueo;
    const cred = (a.credencial as string | null) ?? null;
    if (bloqueo !== "ninguno" && !cred) err("credencial-invalida");
    const { f, clave } = construir(
      String(a.datos),
      a.recibos as { id: string; datos: string }[],
      bloqueo,
      cred
    );
    f.migracion = { desde: "localStorage", fecha: "2026-11-19", huella: String(a.huella) };
    st.migrando = f;
    st.pendiente = true;
    return clave;
  },

  leer_migracion: () => {
    if (!st.pendiente || !st.migrando) err("verificacion");
    // ES: Fallo inyectado: el fichero releído no coincide. / EN: Injected failure: the read-back file does not match.
    return st.fallarVerificacion ? st.migrando!.datos.replace(/\d/, "9") : st.migrando!.datos;
  },

  confirmar_migracion: () => {
    if (!st.pendiente || !st.migrando) err("verificacion");
    if (st.principal) err("existe");
    st.principal = st.migrando;
    st.migrando = null;
    st.pendiente = false;
    st.marca = true;
    st.abierta = { dekId: st.principal!.dekId, porRecuperacion: false };
    rotar(st.principal!);
  },

  cancelar_migracion: () => {
    st.pendiente = false;
    if (st.migrando) st.rescate.push(`rescate/migracion-${ahora()}.bolsillo`);
    st.migrando = null;
  },

  bloquear_almacen: () => {
    st.abierta = null;
    st.pendiente = false;
  },

  configurar_bloqueo: (a) => {
    abierta();
    const f = st.principal!;
    if (f.bloqueo !== "ninguno") err("existe");
    const bloqueo = a.bloqueo as Bloqueo;
    if (bloqueo === "ninguno" || !credValida(bloqueo, a.credencial as string)) {
      err("credencial-invalida");
    }
    if (st.fallarGuardado) err("io:disco lleno");
    const clave = nuevaRecuperacion();
    const viejo = f.dekId;
    const nuevo = rotarDek(f);
    st.principal = {
      ...nuevo,
      bloqueo,
      credencial: a.credencial as string,
      recuperacion: normalizar(clave),
    };
    for (const c of Object.values(st.copias))
      if (c.dekId === viejo && c.bloqueo === "ninguno") {
        c.bloqueo = bloqueo;
        c.credencial = a.credencial as string;
        c.recuperacion = normalizar(clave);
      }
    st.abierta = { dekId: st.principal.dekId, porRecuperacion: false };
    rotar(st.principal);
    return clave;
  },

  quitar_bloqueo: () => {
    abierta();
    if (st.fallarGuardado) err("io:disco lleno");
    st.principal = { ...st.principal!, bloqueo: "ninguno", credencial: null, recuperacion: null };
    rotar(st.principal);
  },

  cambiar_credencial: (a) => {
    const ab = abierta();
    const f = st.principal!;
    if (f.bloqueo === "ninguno") err("bloqueado");
    const bloqueo = a.bloqueo as Bloqueo;
    if (bloqueo === "ninguno" || !credValida(bloqueo, a.nueva as string)) {
      err("credencial-invalida");
    }
    if (!ab.porRecuperacion && a.antigua !== f.credencial) err("credencial");
    if (st.fallarGuardado) err("io:disco lleno");
    st.principal = { ...f, bloqueo, credencial: a.nueva as string };
    ab.porRecuperacion = false;
    rotar(st.principal);
  },

  regenerar_recuperacion: (a) => {
    abierta();
    const f = st.principal!;
    if (f.bloqueo === "ninguno") err("bloqueado");
    if (a.credencial !== f.credencial) err("credencial");
    const clave = nuevaRecuperacion();
    st.principal = { ...rotarDek(f), recuperacion: normalizar(clave) };
    st.abierta = { dekId: st.principal.dekId, porRecuperacion: false };
    rotar(st.principal);
    return clave;
  },

  rescatar_almacen: () => {
    if (!st.principal && !st.principalRoto) err("vacio");
    const n = `rescate/datos-${ahora()}.bolsillo`;
    st.rescate.push(n);
    return n;
  },

  listar_copias: () =>
    Object.keys(st.copias)
      .sort()
      .reverse()
      .map((nombre) => ({ nombre, bytes: st.copias[nombre].datos.length, segundos: 0 })),

  restaurar_copia: (a) => {
    const c = st.copias[String(a.nombre)] ?? err("sin-copia");
    if (st.principal)
      st.copias[`antes-${String(ahora()).padStart(12, "0")}.bolsillo`] = st.principal;
    st.principal = copiar(c);
    st.principalRoto = null;
    st.marca = true;
    st.abierta = null;
  },

  exportar_copia_cifrada: (a) => {
    if (!credValida("password", a.contrasena as string)) err("credencial-invalida");
    if (st.cancelarDialogo) return false;
    st.exportadas.push({
      nombre: String(a.nombre),
      contrasena: String(a.contrasena),
      datos: String(a.datos),
    });
    return true;
  },

  elegir_copia: () => {
    if (st.cancelarDialogo || st.proximoArchivo === null) return null;
    const texto = st.proximoArchivo;
    try {
      const o = JSON.parse(texto);
      if (o && o.formato === "bolsillo") {
        st.elegida = {
          bloqueo: "password",
          dekId: "copia",
          credencial: o.contrasena,
          recuperacion: null,
          migracion: null,
          datos: o.datos,
        };
        return { tipo: "cifrada", bloqueo: "password" };
      }
    } catch {
      /* ES: no es JSON: va como texto / EN: not JSON: goes as text */
    }
    st.elegida = null;
    return { tipo: "json", contenido: texto };
  },

  descifrar_copia: (a) => {
    const e = st.elegida ?? err("sin-copia");
    if (a.contrasena !== e.credencial) err("credencial");
    return e.datos;
  },

  guardar_archivo: (a) => {
    if (st.cancelarDialogo) return false;
    st.archivos.push({ nombre: "archivo", bytes: a as unknown as Uint8Array });
    return true;
  },
};

// ES: Punto de entrada con la misma forma que `invoke`. Los datos se copian
//     (como al cruzar la IPC) para que nadie comparta objetos con el "disco".
// EN: Entry point shaped like `invoke`. Data is copied (as when crossing the
//     IPC) so nobody shares objects with the "disk".
export async function simularInvoke<T>(cmd: string, args?: unknown): Promise<T> {
  const fn = comandos[cmd];
  if (!fn) throw `comando-desconocido:${cmd}`;
  const r = fn((args ?? {}) as Args);
  guardarPersistente();
  return (r === undefined ? undefined : JSON.parse(JSON.stringify(r))) as T;
}

// ── 4. Control desde los tests / Test controls ────────────────────────────────
// ES: Acceso al estado simulado para preparar casos y comprobarlos.
// EN: Access to the simulated state to set up cases and check them.
export const simulador = {
  // ES: Todo de cero (nuevo "disco"). / EN: Everything from scratch (new "disk").
  reiniciar() {
    st = vacio();
  },
  // ES: Reinicio del proceso: el disco se queda, la DEK en memoria se pierde.
  // EN: Process restart: the disk stays, the in-memory DEK is lost.
  reiniciarProceso() {
    st.abierta = null;
    st.pendiente = false;
    st.elegida = null;
  },
  get estado() {
    return st;
  },
  // ES: Navegador de desarrollo: carga y guarda en su propio localStorage.
  // EN: Development browser: loads and saves to its own localStorage.
  activarPersistencia() {
    persistir = true;
    try {
      const g = localStorage.getItem(CLAVE_DEV);
      if (g) st = { ...vacio(), ...JSON.parse(g) };
    } catch {
      /* ES: se empieza vacío / EN: start empty */
    }
  },
};
