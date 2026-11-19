/* =============================================================================
 * recuperacion.test.ts — Datos ilegibles, migración y copias / Unreadable data, migration & backups
 * -----------------------------------------------------------------------------
 * ES: Reproduce H1 del análisis (datos que no se pueden leer y que antes se
 *     pisaban con el ejemplo) en los dos almacenes: el de la 1.1.0 en
 *     localStorage ("legado") y el fichero cifrado de la 1.2.0 (Rust simulado
 *     con rustSimulado.ts). Prueba también la migración en tres fases, que no
 *     se remigra encima de un fichero, la restauración de copias automáticas
 *     y la copia cifrada de ida y vuelta. H2 (guardado que falla) está en
 *     guardado.test.ts. Todos los datos son inventados.
 * EN: Reproduces H1 from the analysis (unreadable data that used to be
 *     overwritten with the samples) in both stores: the 1.1.0 localStorage one
 *     ("legado") and the 1.2.0 encrypted file (Rust simulated with
 *     rustSimulado.ts). It also tests the three-phase migration, that nothing
 *     is migrated on top of a file, restoring automatic backups and the
 *     encrypted backup round trip. H2 (failing save) lives in
 *     guardado.test.ts. All data is made up.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Utilidades de prueba / Test helpers
 *   2. H1 en localStorage (1.1.0) / H1 in localStorage (1.1.0)
 *   3. H1 en el fichero / H1 in the file
 *   4. Migración en tres fases / Three-phase migration
 *   5. Copias / Backups
 * ===========================================================================*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import * as almacen from "../utils/almacen";
import { cifrar } from "../utils/cripto";
import { simulador } from "../utils/rustSimulado";
import { VERSION_DATOS, type DatosBolsillo } from "../types";
import { useAjustes } from "./ajustes";
import { useFinanzas } from "./finanzas";
import { useSesion } from "./sesion";

// ── 1. Utilidades de prueba / Test helpers ────────────────────────────────────
// ES: Claves de localStorage de la 1.1.0. / EN: 1.1.0 localStorage keys.
const CLAVE_DATOS = "bolsillo.datos.cif";
const CLAVE_AJUSTES = "bolsillo.ajustes";

// ES: Datos v2 (como los dejaba la 1.1.0 + Tanda 1) con un recibo dentro.
// EN: v2 data (as 1.1.0 + Tanda 1 left it) with a receipt inside.
function datosV2(recibo = "data:image/jpeg;base64,QUJD") {
  return {
    version: 2,
    recurrentes: [
      {
        id: "r1",
        concepto: "Nómina",
        importe: 1500,
        signo: "ingreso",
        categoria: "Nómina",
        desde: "2026-01",
        hasta: null,
      },
    ],
    puntuales: [
      {
        id: "p1",
        concepto: "Súper",
        importe: 80,
        signo: "gasto",
        categoria: "Comida",
        fecha: "2026-02-10",
        recibo,
      },
    ],
    deudas: [],
    planes: [],
    presupuestos: [],
    plantillas: [],
    cuentas: [],
  };
}

// ES: Deja en localStorage un almacén de la 1.1.0 (con PIN o sin él).
// EN: Leaves a 1.1.0 store in localStorage (with or without a PIN).
async function legado(pin: string | null, datos: unknown = datosV2()) {
  localStorage.setItem(
    CLAVE_DATOS,
    await cifrar(JSON.stringify(datos), pin ?? almacen.SECRETO_OFUSCACION)
  );
  localStorage.setItem(
    CLAVE_AJUSTES,
    JSON.stringify({ bloqueoActivo: !!pin, bloqueoTipo: pin ? "pin" : null, configurado: true })
  );
}

// ES: Cerrar y volver a abrir la app: stores nuevos, mismo disco y mismo
//     localStorage, la clave de datos de Rust olvidada.
// EN: Close and reopen the app: fresh stores, same disk and localStorage,
//     Rust's data key forgotten.
async function reabrir() {
  const s = useSesion();
  await s.vaciarGuardado();
  setActivePinia(createPinia());
  almacen.usarOfuscacion();
  simulador.reiniciarProceso();
  const nueva = useSesion();
  await nueva.arrancar();
  return nueva;
}

// ES: Contenido de datos.bolsillo (simulado). / EN: datos.bolsillo content (simulated).
const enDisco = (): DatosBolsillo => JSON.parse(simulador.estado.principal!.datos);

beforeEach(() => {
  setActivePinia(createPinia());
  localStorage.clear();
  almacen.usarOfuscacion();
  simulador.reiniciar();
});

afterEach(async () => {
  if (vi.isMockFunction(localStorage.setItem)) vi.mocked(localStorage.setItem).mockRestore();
  await useSesion().vaciarGuardado();
});

// ── 2. H1 en localStorage (1.1.0) / H1 in localStorage (1.1.0) ────────────────
describe("H1 en el almacén de la 1.1.0 / H1 in the 1.1.0 store", () => {
  it.each([
    ["JSON del blob roto / broken blob JSON", "{esto no es json"],
    ["base64 roto / broken base64", JSON.stringify({ v: 1, salt: "@@@", iv: "!!", ct: "??" })],
    ["faltan campos / missing fields", JSON.stringify({ v: 1, salt: "AAAA" })],
  ])(
    "blob dañado (%s): error, sin tocar nada / damaged blob: error, nothing touched",
    async (_n, blob) => {
      localStorage.setItem(CLAVE_DATOS, blob);
      const s = useSesion();
      await s.arrancar();
      expect(s.modo).toBe("legado");
      expect(s.fallo).toBe("danado");
      expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
      // ES: Copia de rescate en localStorage y ningún fichero creado.
      // EN: Rescue copy in localStorage and no file created.
      expect(s.rescate).toMatch(/^bolsillo\.datos\.rescate\./);
      expect(simulador.estado.principal).toBeNull();
    }
  );

  it("descifra pero no valida: error invalido / decrypts but does not validate", async () => {
    await legado(null, { hola: 1 });
    const blob = localStorage.getItem(CLAVE_DATOS);
    const s = useSesion();
    await s.arrancar();
    expect(s.fallo).toBe("invalido");
    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    expect(simulador.estado.principal).toBeNull();
  });

  it("con PIN y ajustes perdidos: pide el PIN y al abrir migra con ese PIN / PIN and settings lost", async () => {
    await legado("1234");
    const blob = localStorage.getItem(CLAVE_DATOS);
    localStorage.removeItem(CLAVE_AJUSTES);
    const s = useSesion();
    await s.arrancar();
    // ES: Sin ajustes se intenta sin PIN, no abre: pantalla de error "credencial".
    // EN: Without settings it tries without a PIN, it does not open: "credencial" error screen.
    expect(s.fallo).toBe("credencial");
    expect(s.necesitaOnboarding).toBe(false);
    expect(await s.desbloquear("9999")).toBe(false);
    expect(s.error).toBe("credIncorrecta");
    expect(await s.desbloquear("1234")).toBe(true);
    // ES: Migrado con el mismo PIN; el localStorage sigue igual (no se borra).
    // EN: Migrated with the same PIN; localStorage stays the same (not deleted).
    expect(s.modo).toBe("fichero");
    expect(simulador.estado.principal!.bloqueo).toBe("pin");
    expect(simulador.estado.principal!.credencial).toBe("1234");
    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    expect(useAjustes().bloqueoActivo).toBe(true);
    expect(s.claveRecuperacion).not.toBeNull();
  });

  it("sin espacio para el rescate no se empieza de cero sin forzar / no rescue space: no restart unless forced", async () => {
    localStorage.setItem(CLAVE_DATOS, "{roto");
    const s = useSesion();
    vi.spyOn(localStorage, "setItem").mockImplementation(() => {
      throw new DOMException("lleno", "QuotaExceededError");
    });
    await s.arrancar();
    expect(s.rescateFallido).toBe(true);
    expect(s.empezarDeCero()).toBe(false);
    vi.mocked(localStorage.setItem).mockRestore();
    expect(s.empezarDeCero(true)).toBe(true);
    expect(s.necesitaOnboarding).toBe(true);
  });
});

// ── 3. H1 en el fichero / H1 in the file ─────────────────────────────────────
describe("H1 en el fichero cifrado / H1 in the encrypted file", () => {
  // ES: Primer arranque sin PIN con el ejemplo. / EN: First run without a PIN with the samples.
  async function primerArranque() {
    const s = useSesion();
    await s.arrancar();
    await s.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "ejemplo" });
  }

  it("fichero dañado: error, rescate y nunca se pisa / damaged file: error, rescue, never overwritten", async () => {
    await primerArranque();
    simulador.estado.principalRoto = "danado";
    const antes = simulador.estado.principal;
    simulador.estado.principal = null;
    const s = await reabrir();
    expect(s.fallo).toBe("danado");
    expect(s.necesitaOnboarding).toBe(false);
    expect(s.rescate).toMatch(/^rescate\/datos-/);
    expect(simulador.estado.escrituras).toBe(0);
    // ES: Empezar de cero aparta el dañado al crear el nuevo.
    // EN: Starting from scratch moves the damaged one aside when creating the new one.
    expect(s.empezarDeCero()).toBe(true);
    await s.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "vacio" });
    expect(simulador.estado.rescate.filter((r) => r.startsWith("rescate/datos-"))).toHaveLength(2);
    expect(enDisco().recurrentes).toEqual([]);
    expect(antes).not.toBeNull();
  });

  it("sin bloqueo y contenido alterado: error y rescate, no una pantalla vacía / no lock, altered content", async () => {
    await primerArranque();
    simulador.estado.cifradoAlterado = true;
    const s = await reabrir();
    expect(s.fallo).toBe("danado");
    expect(s.rescate).toMatch(/^rescate\/datos-/);
    expect(s.desbloqueado).toBe(false);
  });

  it("con PIN y contenido alterado: error de daño, no PIN incorrecto / with a PIN, altered content", async () => {
    await primerArranque();
    await useSesion().configurarBloqueo("pin", "4831");
    simulador.estado.cifradoAlterado = true;
    const s = await reabrir();
    expect(await s.desbloquear("4831")).toBe(false);
    expect(s.fallo).toBe("danado");
    expect(s.error).not.toBe("credIncorrecta");
  });

  it("fichero de una versión más nueva: error version / file from a newer version", async () => {
    await primerArranque();
    simulador.estado.principalRoto = "version";
    simulador.estado.principal = null;
    const s = await reabrir();
    expect(s.fallo).toBe("version");
  });

  it("descifra pero no valida: error invalido y la clave se olvida / decrypts but invalid: key forgotten", async () => {
    await primerArranque();
    simulador.estado.principal!.datos = JSON.stringify({ version: VERSION_DATOS, hola: 1 });
    const s = await reabrir();
    expect(s.fallo).toBe("invalido");
    expect(simulador.estado.abierta).toBeNull();
  });

  it("hubo almacén pero falta el fichero: error, nunca bienvenida ni migración / store existed but file missing", async () => {
    await primerArranque();
    simulador.estado.principal = null;
    await legado(null);
    const s = await reabrir();
    expect(s.fallo).toBe("falta");
    expect(s.necesitaOnboarding).toBe(false);
    expect(simulador.estado.principal).toBeNull();
  });

  it("importar una copia desde el error crea el almacén sin PIN / importing from the error creates the store without a PIN", async () => {
    await primerArranque();
    await useSesion().configurarBloqueo("pin", "4831");
    const s = await reabrir();
    await s.mostrarRecuperacion();
    expect(s.fallo).toBe("credencial");
    await s.importarDatos(datosV2());
    expect(s.desbloqueado).toBe(true);
    expect(useAjustes().bloqueoActivo).toBe(false);
    expect(simulador.estado.principal!.bloqueo).toBe("ninguno");
    // ES: El almacén con PIN se apartó a rescate/ (se puede recuperar con el PIN).
    // EN: The PIN store was moved to rescate/ (it can be recovered with the PIN).
    expect(simulador.estado.rescate.length).toBeGreaterThan(0);
  });
});

// ── 4. Migración en tres fases / Three-phase migration ───────────────────────
describe("migración desde localStorage / migration from localStorage", () => {
  it("sin PIN migra al arrancar, con el recibo aparte, y el origen no se borra / migrates at boot", async () => {
    await legado(null);
    const blob = localStorage.getItem(CLAVE_DATOS);
    const s = useSesion();
    await s.arrancar();
    expect(s.modo).toBe("fichero");
    expect(s.desbloqueado).toBe(true);
    expect(s.avisoMigracion).toBeNull();
    // ES: El fichero lleva la referencia, no el recibo; el recibo va aparte.
    // EN: The file carries the reference, not the receipt; the receipt lives apart.
    const p = enDisco().puntuales[0];
    expect(p.recibo).toBeUndefined();
    expect(p.reciboId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.values(simulador.estado.recibos)).toContain("data:image/jpeg;base64,QUJD");
    expect(simulador.estado.principal!.migracion?.huella).toMatch(/^[0-9a-f]{64}$/);
    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    // ES: En memoria el recibo vuelve a estar en su sitio. / EN: In memory the receipt is back in place.
    expect(useFinanzas().puntuales[0].recibo).toBe("data:image/jpeg;base64,QUJD");
    // ES: Al reabrir se lee el fichero con su recibo. / EN: On reopening the file is read with its receipt.
    await reabrir();
    expect(useFinanzas().puntuales[0].recibo).toBe("data:image/jpeg;base64,QUJD");
    expect(useFinanzas().puntuales[0].reciboId).toBeUndefined();
  });

  it("vuelvo a la 1.1.0, apunto algo y actualizo: manda el fichero y se avisa / back to 1.1.0 and up again", async () => {
    await legado(null);
    await useSesion().arrancar();
    const fichero = simulador.estado.principal!.datos;
    // ES: La 1.1.0 escribe en localStorage un apunte nuevo.
    // EN: 1.1.0 writes a new entry to localStorage.
    const conNuevo = datosV2();
    conNuevo.puntuales.push({ ...conNuevo.puntuales[0], id: "p2", concepto: "En la 1.1.0" });
    await legado(null, conNuevo);
    const s = await reabrir();
    expect(s.modo).toBe("fichero");
    expect(s.avisoLegadoNuevo).toBe(true);
    expect(simulador.estado.principal!.datos).toBe(fichero);
    expect(useFinanzas().puntuales.map((p) => p.id)).toEqual(["p1"]);
  });

  it("sin cambios en localStorage no hay aviso / no localStorage changes, no warning", async () => {
    await legado(null);
    await useSesion().arrancar();
    const s = await reabrir();
    expect(s.avisoLegadoNuevo).toBe(false);
  });

  it("si la verificación falla sigue en localStorage y se reintenta al reabrir / failed verification stays in localStorage", async () => {
    await legado(null);
    const blob = localStorage.getItem(CLAVE_DATOS);
    simulador.estado.fallarVerificacion = true;
    const s = useSesion();
    await s.arrancar();
    expect(s.modo).toBe("legado");
    expect(s.avisoMigracion).toBe("verificacion");
    expect(s.desbloqueado).toBe(true);
    expect(simulador.estado.principal).toBeNull();
    expect(simulador.estado.rescate[0]).toMatch(/^rescate\/migracion-/);
    expect(localStorage.getItem(CLAVE_DATOS)).toBe(blob);
    // ES: En legado se sigue guardando en localStorage. / EN: In legado it keeps saving to localStorage.
    useFinanzas().addPlan({ nombre: "Bici", objetivo: 300, aportado: 0 });
    expect(await s.vaciarGuardado()).toBe(true);
    expect(localStorage.getItem(CLAVE_DATOS)).not.toBe(blob);
    // ES: Otro arranque con la verificación arreglada migra (con el plan nuevo).
    // EN: Another boot with verification fixed migrates (with the new plan).
    simulador.estado.fallarVerificacion = false;
    const s2 = await reabrir();
    expect(s2.modo).toBe("fichero");
    expect(enDisco().planes.map((p) => p.nombre)).toEqual(["Bici"]);
  });

  it("datos grandes: 20 000 movimientos y recibos de 300 KB / large data", async () => {
    const d = datosV2();
    const recibo = (i: number) =>
      `data:image/jpeg;base64,${String(i).padStart(4, "0")}${"A".repeat(300_000)}`;
    d.puntuales = Array.from({ length: 20_000 }, (_, i) => ({
      id: `p${i}`,
      concepto: `Gasto ${i}`,
      importe: (i % 900) + 0.25,
      signo: "gasto",
      categoria: "Comida",
      fecha: `2026-${String((i % 12) + 1).padStart(2, "0")}-10`,
      recibo: i < 5 ? recibo(i) : (undefined as unknown as string),
    }));
    for (const p of d.puntuales)
      if (p.recibo === undefined) delete (p as { recibo?: string }).recibo;
    await legado(null, d);
    const s = useSesion();
    await s.arrancar();
    expect(s.modo).toBe("fichero");
    expect(Object.keys(simulador.estado.recibos)).toHaveLength(5);
    // ES: El principal no lleva los 1,5 MB de recibos. / EN: The main file does not carry the 1.5 MB of receipts.
    expect(simulador.estado.principal!.datos.length).toBeLessThan(4_000_000);
    expect(simulador.estado.principal!.datos).not.toContain("AAAAAAAAAA");
    await reabrir();
    expect(useFinanzas().puntuales).toHaveLength(20_000);
    expect(useFinanzas().puntuales[3].recibo).toBe(recibo(3));
  });
});

// ── 5. Copias / Backups ───────────────────────────────────────────────────────
describe("copias / backups", () => {
  it("restaurar una copia automática / restoring an automatic backup", async () => {
    const s = useSesion();
    await s.arrancar();
    await s.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "vacio" });
    const f = useFinanzas();
    for (let i = 0; i < 3; i++) {
      f.addPlan({ nombre: `Plan ${i}`, objetivo: 100, aportado: 0 });
      await s.vaciarGuardado();
    }
    const copias = await s.listarCopias();
    const recientes = copias.filter((c) => c.nombre.startsWith("reciente-"));
    // ES: La más vieja es la de la bienvenida (sin planes). / EN: The oldest is the welcome one (no plans).
    await s.restaurarCopia(recientes[recientes.length - 1].nombre);
    expect(s.desbloqueado).toBe(true);
    expect(useFinanzas().planes).toEqual([]);
    expect((await s.listarCopias()).some((c) => c.nombre.startsWith("antes-"))).toBe(true);
  });

  it("no restaura si no se puede guardar lo pendiente / does not restore if pending changes cannot be saved", async () => {
    const s = useSesion();
    await s.arrancar();
    await s.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "vacio" });
    const vieja = (await s.listarCopias())[0].nombre;
    useFinanzas().addPlan({ nombre: "Sin guardar", objetivo: 10, aportado: 0 });
    simulador.estado.fallarGuardado = true;
    await expect(s.restaurarCopia(vieja)).rejects.toThrow("guardado-pendiente");
    expect(s.desbloqueado).toBe(true);
    expect(useFinanzas().planes.map((p) => p.nombre)).toEqual(["Sin guardar"]);
    simulador.estado.fallarGuardado = false;
  });

  it("copia cifrada de ida y vuelta en una instalación limpia / encrypted backup round trip on a clean install", async () => {
    const s = useSesion();
    await s.arrancar();
    await s.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "ejemplo" });
    useFinanzas().addPuntual({
      concepto: "Con recibo",
      importe: 12,
      signo: "gasto",
      categoria: "Comida",
      fecha: "2026-03-01",
      recibo: "data:image/jpeg;base64,UkVD",
    });
    const original = JSON.parse(JSON.stringify(useFinanzas().snapshot()));
    await expect(s.exportarCopiaCifrada("corta")).rejects.toThrow("credencial-invalida");
    expect(await s.exportarCopiaCifrada("contraseña-copia")).toBe(true);
    const exportada = simulador.estado.exportadas[0];
    expect(exportada.nombre).toMatch(/\.bolsillo$/);

    // ES: Instalación limpia: bienvenida y restaurar desde la copia.
    // EN: Clean install: welcome and restore from the backup.
    simulador.reiniciar();
    localStorage.clear();
    const s2 = await reabrir();
    await s2.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "vacio" });
    simulador.estado.proximoArchivo = JSON.stringify({
      formato: "bolsillo",
      contrasena: exportada.contrasena,
      datos: exportada.datos,
    });
    expect(await s2.elegirCopiaParaImportar()).toEqual({ tipo: "cifrada" });
    await expect(s2.descifrarCopiaElegida("otra-contraseña")).rejects.toThrow("copia-credencial");
    await s2.importarDatos(await s2.descifrarCopiaElegida("contraseña-copia"));
    expect(useFinanzas().snapshot()).toEqual(original);
    expect(Object.values(simulador.estado.recibos)).toContain("data:image/jpeg;base64,UkVD");
  });

  it("se sigue importando el JSON antiguo por el diálogo / old JSON is still imported through the dialog", async () => {
    const s = useSesion();
    await s.arrancar();
    await s.completarOnboarding({ nombre: "", bloqueo: null, datosIniciales: "vacio" });
    const v1 = { recurrentes: [], puntuales: datosV2().puntuales, deudas: [] };
    simulador.estado.proximoArchivo = JSON.stringify(v1);
    const e = await s.elegirCopiaParaImportar();
    expect(e?.tipo).toBe("json");
    await s.importarDatos((e as { crudo: unknown }).crudo);
    expect(useFinanzas().puntuales[0].recibo).toBe("data:image/jpeg;base64,QUJD");
    expect(enDisco().version).toBe(VERSION_DATOS);
  });
});
