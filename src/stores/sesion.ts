/* =============================================================================
 * sesion.ts — Orquestación de sesión / Session orchestration (boot/lock/onboarding)
 * -----------------------------------------------------------------------------
 * ES: Store de Pinia que orquesta el arranque, la bienvenida, el bloqueo y el
 *     guardado. NO contiene datos financieros: decide QUÉ pantalla mostrar y
 *     conecta la persistencia con `finanzas`. Desde la 1.2.0 hay dos modos:
 *       - "fichero": el almacén cifrado en disco que gestiona Rust
 *         (utils/boveda.ts). Es el modo normal. El tipo de bloqueo sale de la
 *         cabecera del fichero, no de localStorage.
 *       - "legado": los datos siguen en localStorage (1.1.0) porque aún no se
 *         han migrado (falta el PIN) o porque la migración no se pudo
 *         verificar. En cuanto se leen bien, se migran en tres fases; el
 *         localStorage nunca se borra.
 *     Estados de pantalla (con ajustes):
 *       - necesitaOnboarding: no hay datos (bienvenida)
 *       - fallo: los datos no se pueden leer (pantalla de error y rescate)
 *       - bloqueado (bloqueoActivo && !desbloqueado): pedir credencial
 *       - desbloqueado: app en marcha
 * EN: Pinia store that orchestrates boot, onboarding, lock and saving. It does
 *     NOT hold financial data: it decides WHICH screen to show and wires
 *     persistence around `finanzas`. Since 1.2.0 there are two modes:
 *       - "fichero": the encrypted on-disk store managed by Rust
 *         (utils/boveda.ts). The normal mode. The lock type comes from the
 *         file header, not from localStorage.
 *       - "legado": the data is still in localStorage (1.1.0) because it has
 *         not been migrated yet (the PIN is missing) or because the migration
 *         could not be verified. As soon as it is read correctly, it is
 *         migrated in three phases; localStorage is never deleted.
 *     Screen states (with ajustes): see the list above.
 *
 * ÍNDICE / INDEX:
 *   1. Importaciones y tipos / Imports & types
 *   2. Estado reactivo / Reactive state
 *   3. Guardado automático que avisa / Autosave that warns
 *   4. Entrada, bloqueo y fallos / Entry, lock & failures
 *   5. Migración desde localStorage / Migration from localStorage
 *   6. Decisión de arranque / Boot decision
 *   7. Desbloqueo y recuperación / Unlock & recovery
 *   8. Gestión del bloqueo / Lock management
 *   9. Bienvenida, importación y reemplazo / Onboarding, import & replace
 *  10. Copias / Backups
 *  11. API pública / Public API
 * ===========================================================================*/

// ── 1. Importaciones y tipos / Imports & types ───────────────────────────────
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useFinanzas } from "./finanzas";
import { useAjustes, type TipoBloqueo } from "./ajustes";
import * as almacen from "../utils/almacen";
import * as boveda from "../utils/boveda";
import { ErrorBoveda, type EstadoAlmacen } from "../utils/boveda";
import { datosDemo, datosVacios } from "../data/demo";
import { categoriasCustom, setCategoriasCustom } from "../data/categorias";
import type { DatosBolsillo } from "../types";
import { prepararDatos, ErrorDatos } from "../utils/migraciones";
import { validarCredencial } from "../utils/credencial";
import { crearAutobloqueo } from "../utils/autobloqueo";

// ES: Motivos por los que los datos guardados no se pueden abrir. "falta":
//     hubo un almacén (marca, copias o rescate) pero no está el fichero;
//     "entorno": no hay backend de Tauri (no debería pasar en la app).
// EN: Reasons why the stored data cannot be opened. "falta": there was a
//     store (marker, backups or rescue) but the file is missing; "entorno":
//     there is no Tauri backend (it should not happen in the app).
export type FalloDatos = "danado" | "credencial" | "invalido" | "version" | "falta" | "entorno";

// ES: Estado del guardado. / EN: Save state.
export type EstadoGuardado = "ok" | "pendiente" | "guardando" | "error";

// ES: Dónde viven los datos ahora mismo. / EN: Where the data lives right now.
export type ModoAlmacen = "fichero" | "legado";

// ES: Tipo de bloqueo de una credencial de la 1.1.0 (si los ajustes no lo dicen).
// EN: Lock type of a 1.1.0 credential (when the settings do not say).
const tipoDe = (c: string): TipoBloqueo => (/^\d{4,6}$/.test(c) ? "pin" : "password");

// ES: Código de un error (ErrorBoveda, ErrorDatos o Error). / EN: Code of an error.
function codigo(e: unknown): string {
  if (e instanceof ErrorBoveda) return e.codigo;
  if (e instanceof ErrorDatos) return e.motivo;
  return e instanceof Error ? e.message : "interno";
}

export const useSesion = defineStore("sesion", () => {
  // ── 2. Estado reactivo / Reactive state ────────────────────────────────────
  const desbloqueado = ref(false);
  const necesitaOnboarding = ref(false);
  // ES: clave i18n del último error de credencial / EN: i18n key of the last credential error
  const error = ref("");
  const fallo = ref<FalloDatos | null>(null);
  const rescate = ref<string | null>(null);
  const rescateFallido = ref(false);
  const modo = ref<ModoAlmacen>("fichero");
  // ES: Clave de recuperación recién creada, pendiente de enseñar UNA vez.
  //     Se queda aquí hasta que la interfaz llame a olvidarClaveRecuperacion().
  // EN: Recovery key just created, waiting to be shown ONCE. It stays here
  //     until the UI calls olvidarClaveRecuperacion().
  const claveRecuperacion = ref<string | null>(null);
  const tieneRecuperacion = ref(false);
  // ES: Abierta con la clave de recuperación: hay que poner PIN nuevo.
  // EN: Opened with the recovery key: a new PIN must be set.
  const porRecuperacion = ref(false);
  // ES: Hay datos en localStorage distintos de los migrados (p. ej. se volvió
  //     a usar la 1.1.0): no se importan solos, se avisa.
  // EN: There is localStorage data different from the migrated one (e.g. 1.1.0
  //     was used again): it is not imported automatically, a warning is shown.
  const avisoLegadoNuevo = ref(false);
  // ES: Código de error si la migración no se pudo verificar (sigue en legado).
  // EN: Error code if the migration could not be verified (stays in legado).
  const avisoMigracion = ref<string | null>(null);
  // ES: Se bloqueó o restauró antes de confirmar la clave de recuperación
  //     recién creada: ya no se enseña (estaba sobre la pantalla bloqueada) y
  //     se avisa para generar otra.
  // EN: It was locked or restored before confirming the newly created
  //     recovery key: it is no longer shown (it was over the locked screen)
  //     and a warning asks to generate another one.
  const claveNoConfirmada = ref(false);
  // ES: El autobloqueo no pudo bloquear (no se pudo guardar): se bloqueará en
  //     cuanto un guardado salga bien.
  // EN: Auto-lock could not lock (saving failed): it will lock as soon as a
  //     save succeeds.
  const bloqueoPendiente = ref(false);
  // ES: Copias que aún conservan la protección anterior (lo dice Rust).
  // EN: Backups that still keep the previous protection (Rust says so).
  const copiasPendientes = ref(0);
  // ES: El fichero cambió en disco desde que se abrió: no se pisa.
  // EN: The file changed on disk since it was opened: it is not overwritten.
  const conflicto = ref(false);
  // ES: Sustitución de datos en curso (importar, restaurar, reemplazar): la
  //     interfaz se cubre y no se puede editar nada hasta que acabe.
  // EN: Data replacement in progress (import, restore, replace): the UI is
  //     covered and nothing can be edited until it ends.
  const trabajando = ref(false);
  let guardadoActivo = false;
  // ES: Al crear el almacén desde la pantalla de error, el fichero anterior se
  //     aparta a rescate/ (nunca se pisa).
  // EN: When creating the store from the error screen, the previous file is
  //     moved to rescate/ (never overwritten).
  let reemplazarAlCrear = false;
  // ES: Se está bloqueando o restaurando: no se acepta desbloquear a la vez.
  // EN: Locking or restoring is in progress: unlocking at the same time is refused.
  let cerrandoSesion = false;

  // ── 3. Guardado automático que avisa / Autosave that warns ──────────────────
  // ES: Cada cambio en finanzas suma 1 a `cambios`; un guardado correcto sube
  //     `guardados` hasta los cambios que incluía. Debounce de 300 ms; si falla,
  //     estado "error", aviso y reintento creciente (2 s … 60 s). `operando`
  //     pausa el guardado mientras corre una operación (credencial, importar,
  //     reemplazar): ni el debounce ni un reintento escriben durante ella.
  //     `bloqueando` hace que el vaciado de memoria al bloquear no cuente como
  //     cambio (si contara, se guardaría un conjunto vacío encima).
  // EN: Every change in finanzas adds 1 to `cambios`; a good save raises
  //     `guardados` up to the changes it included. 300 ms debounce; on failure,
  //     "error" state, warning and growing retry (2 s … 60 s). `operando`
  //     pauses saving while an operation runs (credential, import, replace):
  //     neither the debounce nor a retry writes during it. `bloqueando` keeps
  //     the memory wipe on lock from counting as a change (if it did, an empty
  //     set would be saved on top).
  const RETARDO_GUARDADO_MS = 300;
  const REINTENTO_MAX_MS = 60_000;
  const estadoGuardado = ref<EstadoGuardado>("ok");
  let cambios = 0;
  let guardados = 0;
  let intentos = 0;
  let operando = false;
  let bloqueando = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let reintento: ReturnType<typeof setTimeout> | undefined;

  function cancelarTemporizadores() {
    clearTimeout(temporizador);
    clearTimeout(reintento);
    temporizador = undefined;
    reintento = undefined;
  }

  function programarGuardado() {
    if (operando || bloqueando) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => void guardarAhora(), RETARDO_GUARDADO_MS);
  }

  function marcarGuardado(hasta: number) {
    if (hasta > guardados) guardados = hasta;
    intentos = 0;
    estadoGuardado.value = cambios === guardados ? "ok" : "pendiente";
    // ES: Un autobloqueo que no pudo hacerse se retoma tras un guardado bueno.
    // EN: An auto-lock that could not be done is resumed after a good save.
    if (bloqueoPendiente.value && cambios === guardados && !operando) {
      setTimeout(() => void solicitarBloqueo(), 0);
    }
  }

  function marcarFallo() {
    estadoGuardado.value = "error";
    intentos++;
    if (operando || bloqueando) return;
    clearTimeout(reintento);
    const espera = Math.min(1000 * 2 ** intentos, REINTENTO_MAX_MS);
    reintento = setTimeout(() => void guardarAhora(), espera);
  }

  // ES: Escribe unos datos en el almacén del modo actual.
  // EN: Writes some data to the current mode's store.
  function persistir(datos: DatosBolsillo): Promise<void> {
    return modo.value === "fichero" ? boveda.guardar(datos) : almacen.guardar(datos);
  }

  // ES: Guarda YA lo pendiente. true si todo quedó en disco (o no había nada).
  //     Durante una operación o un bloqueo no escribe (lo retoma la operación
  //     al terminar): así un reintento nunca adelanta datos viejos a un reemplazo.
  // EN: Saves what is pending NOW. true if everything reached disk (or there
  //     was nothing). During an operation or a lock it does not write (the
  //     operation resumes it when done): a retry never overtakes a replacement
  //     with old data.
  async function guardarAhora(): Promise<boolean> {
    cancelarTemporizadores();
    if (cambios === guardados) {
      if (estadoGuardado.value !== "guardando") estadoGuardado.value = "ok";
      return true;
    }
    if (operando || bloqueando) return false;
    const hasta = cambios;
    estadoGuardado.value = "guardando";
    try {
      await persistir(useFinanzas().snapshot());
      marcarGuardado(hasta);
      return true;
    } catch (e) {
      if (codigo(e) === "conflicto") conflicto.value = true;
      marcarFallo();
      return false;
    }
  }

  // ES: Vacía lo pendiente (al cerrar, antes de bloquear, desde "Reintentar").
  //     Espera antes a la operación en curso y repite hasta 3 veces si entran
  //     cambios mientras se guarda.
  // EN: Flushes what is pending (on close, before locking, from "Retry"). It
  //     first waits for the running operation and repeats up to 3 times if
  //     changes arrive while saving.
  async function vaciarGuardado(): Promise<boolean> {
    await colaOperaciones;
    for (let i = 0; i < 3; i++) {
      if (!(await guardarAhora())) return false;
      if (cambios === guardados) return true;
    }
    return cambios === guardados;
  }

  // ES: Ejecuta una operación con el guardado en pausa y de una en una (cola).
  //     Al terminar, si quedó algo pendiente, se programa.
  // EN: Runs an operation with saving paused and one at a time (queue). When
  //     done, if something is still pending, it is scheduled.
  let colaOperaciones: Promise<unknown> = Promise.resolve();
  function conGuardadoEnPausa<T>(op: () => Promise<T>): Promise<T> {
    const turno = colaOperaciones.then(async () => {
      operando = true;
      cancelarTemporizadores();
      try {
        return await op();
      } finally {
        operando = false;
        if (cambios !== guardados && !bloqueando) {
          if (estadoGuardado.value === "error") marcarFallo();
          else programarGuardado();
        }
      }
    });
    colaOperaciones = turno.catch(() => {});
    return turno;
  }

  // ES: Conecta el guardado automático una sola vez (watcher síncrono para
  //     contar cada cambio en el momento).
  // EN: Wires autosave exactly once (synchronous watcher so every change is
  //     counted at once).
  function activarGuardado() {
    if (guardadoActivo) return;
    guardadoActivo = true;
    const f = useFinanzas();
    watch(
      () => f.snapshot(),
      () => {
        if (bloqueando) return;
        cambios++;
        if (estadoGuardado.value !== "error") estadoGuardado.value = "pendiente";
        programarGuardado();
      },
      { deep: true, flush: "sync" }
    );
  }

  // ── 4. Entrada, bloqueo y fallos / Entry, lock & failures ──────────────────
  // ES: Autobloqueo por inactividad (minutos en ajustes; solo con bloqueo).
  // EN: Inactivity auto-lock (minutes in settings; only with a lock).
  const autobloqueo = crearAutobloqueo({
    minutos: () => useAjustes().minutosAutobloqueo,
    alExpirar: () => void solicitarBloqueo(),
  });

  // ES: Petición de bloqueo que no se pierde: si ahora no se puede (no se
  //     pudo guardar), queda pendiente (con aviso) y se reintenta tras el
  //     siguiente guardado bueno.
  // EN: Lock request that is not lost: if it cannot be done now (saving
  //     failed), it stays pending (with a warning) and is retried after the
  //     next good save.
  async function solicitarBloqueo() {
    if (!desbloqueado.value) {
      bloqueoPendiente.value = false;
      return;
    }
    const ok = await bloquearAhora();
    bloqueoPendiente.value = !ok && desbloqueado.value && useAjustes().bloqueoActivo;
  }

  // ES: La clave de recuperación sin confirmar nunca queda en pantalla ni en
  //     memoria al bloquear o restaurar: se avisa para generar otra.
  // EN: The unconfirmed recovery key never stays on screen nor in memory when
  //     locking or restoring: a warning asks to generate another one.
  function retirarClaveRecuperacion() {
    if (claveRecuperacion.value) {
      claveRecuperacion.value = null;
      claveNoConfirmada.value = true;
    }
  }

  // ES: Ajustes ← cabecera del fichero (la cabecera manda).
  // EN: Settings ← file header (the header rules).
  function sincronizarAjustes(bloqueo: boveda.Bloqueo | null) {
    const ajustes = useAjustes();
    const activo = bloqueo === "pin" || bloqueo === "password";
    const tipo = activo ? (bloqueo as TipoBloqueo) : null;
    if (ajustes.bloqueoActivo !== activo || ajustes.bloqueoTipo !== tipo) {
      ajustes.setBloqueo(activo, tipo);
    }
  }

  // ES: Entra con datos ya leídos y validados: hidrata sin contarlo como cambio,
  //     limpia fallos, marca la app como configurada y arranca el autobloqueo.
  // EN: Enters with already read and validated data: hydrates without counting
  //     it as a change, clears failures, marks the app as configured and
  //     starts the auto-lock.
  function entrar(datos: DatosBolsillo) {
    const ajustes = useAjustes();
    activarGuardado();
    cerrandoSesion = false;
    bloqueoPendiente.value = false;
    conflicto.value = false;
    bloqueando = true;
    useFinanzas().hidratar(datos);
    bloqueando = false;
    cancelarTemporizadores();
    guardados = cambios;
    intentos = 0;
    estadoGuardado.value = "ok";
    fallo.value = null;
    error.value = "";
    if (!ajustes.configurado) ajustes.marcarConfigurado();
    desbloqueado.value = true;
    if (modo.value === "fichero" && ajustes.bloqueoActivo) autobloqueo.iniciar();
    else autobloqueo.parar();
  }

  // ES: "Bloquear ahora" (y autobloqueo). Orden: vaciar lo pendiente; si no se
  //     puede guardar NO se bloquea (se perderían cambios); olvidar la clave en
  //     Rust; vaciar la memoria sin contarlo como cambio; y por último mostrar
  //     el bloqueo. Solo con PIN o contraseña y en modo fichero.
  // EN: "Lock now" (and auto-lock). Order: flush what is pending; if it cannot
  //     be saved it does NOT lock (changes would be lost); forget the key in
  //     Rust; wipe memory without counting it as a change; and finally show
  //     the lock. Only with a PIN or password and in file mode.
  async function bloquearAhora(): Promise<boolean> {
    if (modo.value !== "fichero" || !useAjustes().bloqueoActivo || !desbloqueado.value) {
      return false;
    }
    if (!(await vaciarGuardado())) return false;
    return conGuardadoEnPausa(async () => {
      // ES: Primero se oculta la app (ya no se puede editar nada) y después
      //     se guarda lo que entrara entre el vaciado y este turno; si no se
      //     puede, se vuelve a la app sin bloquear.
      // EN: First the app is hidden (nothing can be edited any more) and then
      //     whatever came in between the flush and this turn is saved; if it
      //     cannot be, it goes back to the app without locking.
      cerrandoSesion = true;
      desbloqueado.value = false;
      if (!(await guardarFinalEnPausa())) {
        desbloqueado.value = true;
        cerrandoSesion = false;
        return false;
      }
      bloqueando = true;
      cancelarTemporizadores();
      autobloqueo.parar();
      try {
        await boveda.bloquear();
      } catch {
        // ES: Rust no pudo olvidar la clave: no se finge un bloqueo; se vuelve
        //     a la app con todo como estaba y se puede reintentar.
        // EN: Rust could not forget the key: no fake lock; back to the app
        //     with everything as it was, and it can be retried.
        bloqueando = false;
        cerrandoSesion = false;
        desbloqueado.value = true;
        autobloqueo.iniciar();
        return false;
      }
      retirarClaveRecuperacion();
      almacen.usarOfuscacion();
      useFinanzas().hidratar(datosVacios());
      guardados = cambios;
      estadoGuardado.value = "ok";
      porRecuperacion.value = false;
      bloqueando = false;
      cerrandoSesion = false;
      return true;
    });
  }

  // ES: Guarda lo pendiente dentro de una operación (con la app ya oculta).
  //     true si no queda nada sin guardar.
  // EN: Saves what is pending inside an operation (with the app already
  //     hidden). true if nothing is left unsaved.
  async function guardarFinalEnPausa(): Promise<boolean> {
    if (cambios === guardados) return true;
    const hasta = cambios;
    try {
      await persistir(useFinanzas().snapshot());
    } catch {
      estadoGuardado.value = "error";
      return false;
    }
    marcarGuardado(hasta);
    return cambios === guardados;
  }

  // ES: Garantiza la copia de rescate antes de algo destructivo. En modo
  //     fichero siempre es true: Rust aparta el fichero anterior a rescate/
  //     al crear uno nuevo y nunca lo pisa. En legado, copia en localStorage.
  // EN: Ensures the rescue copy before anything destructive. In file mode it
  //     is always true: Rust moves the previous file to rescate/ when creating
  //     a new one and never overwrites it. In legado, a localStorage copy.
  function asegurarRescate(): boolean {
    if (modo.value === "fichero") return true;
    if (rescate.value) return true;
    try {
      rescate.value = almacen.crearRescate();
      rescateFallido.value = false;
      return true;
    } catch {
      rescateFallido.value = true;
      return false;
    }
  }

  // ES: Pasa a la pantalla de error. Nunca siembra ejemplo ni escribe datos.
  //     Con daño o datos no válidos se hace ya una copia de rescate (en
  //     fichero, una copia en rescate/ hecha por Rust); con "credencial" no.
  // EN: Switches to the error screen. It never seeds samples nor writes data.
  //     On damage or invalid data a rescue copy is made right away (in file
  //     mode, a copy in rescate/ made by Rust); not on "credencial".
  async function entrarEnFallo(tipo: FalloDatos) {
    fallo.value = tipo;
    desbloqueado.value = false;
    autobloqueo.parar();
    if (tipo === "credencial" || tipo === "falta" || tipo === "entorno") return;
    if (modo.value === "legado") {
      asegurarRescate();
      return;
    }
    try {
      rescate.value = await boveda.rescatar();
      rescateFallido.value = false;
    } catch {
      rescateFallido.value = true;
    }
  }

  // ── 5. Migración desde localStorage / Migration from localStorage ───────────
  // ES: Migra unos datos leídos de localStorage al fichero (tres fases en
  //     boveda.migrar) y entra. Si la migración falla, se sigue en legado con
  //     aviso: los datos están bien en localStorage y no se pierde nada.
  // EN: Migrates data read from localStorage to the file (three phases in
  //     boveda.migrar) and enters. If the migration fails, it goes on in
  //     legado with a warning: the data is fine in localStorage and nothing is
  //     lost.
  async function migrarYEntrar(datos: DatosBolsillo, credencial: string | null) {
    const ajustes = useAjustes();
    const tipo = credencial ? (ajustes.bloqueoTipo ?? tipoDe(credencial)) : null;
    try {
      const blob = almacen.blobCrudo() ?? "";
      const clave = await boveda.migrar(
        datos,
        tipo ?? "ninguno",
        credencial,
        await boveda.huella(blob)
      );
      modo.value = "fichero";
      avisoMigracion.value = null;
      // ES: El almacén heredado ya no necesita la credencial en memoria.
      // EN: The legacy store no longer needs the credential in memory.
      almacen.usarOfuscacion();
      claveRecuperacion.value = clave;
      tieneRecuperacion.value = !!clave;
      sincronizarAjustes(tipo ?? "ninguno");
    } catch (e) {
      modo.value = "legado";
      avisoMigracion.value = codigo(e);
    }
    entrar(datos);
  }

  // ES: ¿Hay en localStorage datos distintos de los que se migraron?
  // EN: Is there localStorage data different from what was migrated?
  async function comprobarLegado(e: EstadoAlmacen) {
    const blob = almacen.blobCrudo();
    if (blob === null) {
      avisoLegadoNuevo.value = false;
      return;
    }
    avisoLegadoNuevo.value = (await boveda.huella(blob)) !== e.migracion?.huella;
  }

  // ── 6. Decisión de arranque / Boot decision ────────────────────────────────
  // ES: Al iniciar:
  //       1. Hay fichero: si no se lee → error; si se lee, la cabecera fija el
  //          bloqueo (aunque se hayan perdido los ajustes) y se abre sin PIN
  //          o se pide la credencial. El localStorage ya no se migra encima.
  //       2. No hay fichero pero sí marca, copias o rescate → error "falta"
  //          (nunca bienvenida ni migración: podría pisar algo).
  //       3. No hay fichero pero sí datos en localStorage → modo legado y
  //          migración en cuanto se lean.
  //       4. Nada → bienvenida.
  // EN: At start:
  //       1. There is a file: if unreadable → error; if readable, the header
  //          sets the lock (even if the settings were lost) and it opens
  //          without a PIN or asks for the credential. localStorage is no
  //          longer migrated on top.
  //       2. No file but a marker, backups or rescue → "falta" error (never
  //          welcome nor migration: it could overwrite something).
  //       3. No file but localStorage data → legado mode and migration as
  //          soon as it is read.
  //       4. Nothing → welcome.
  async function arrancar() {
    const ajustes = useAjustes();
    ajustes.aplicarTema();
    let e: EstadoAlmacen;
    try {
      e = await boveda.estado();
    } catch {
      await entrarEnFallo("entorno");
      return;
    }
    tieneRecuperacion.value = e.tieneRecuperacion;
    copiasPendientes.value = e.copiasPendientes;
    if (e.hayFichero) {
      modo.value = "fichero";
      if (!e.legible) {
        await entrarEnFallo(e.motivo === "version" ? "version" : "danado");
        return;
      }
      sincronizarAjustes(e.bloqueo);
      await comprobarLegado(e);
      if (e.bloqueo !== "ninguno") {
        desbloqueado.value = false;
        return;
      }
      // ES: Sin bloqueo no hay credencial que pedir: si no abre, es la
      //     pantalla de error (nunca una pantalla vacía).
      // EN: Without a lock there is no credential to ask for: if it does not
      //     open, it is the error screen (never a blank screen).
      if (!(await abrirFichero()) && !fallo.value) await entrarEnFallo("danado");
      return;
    }
    if (e.hayMarca || e.hayCopias || e.hayRescate) {
      modo.value = "fichero";
      await entrarEnFallo("falta");
      return;
    }
    if (almacen.hayDatos()) {
      modo.value = "legado";
      await arrancarLegado();
      return;
    }
    modo.value = "fichero";
    almacen.usarOfuscacion();
    necesitaOnboarding.value = true;
  }

  // ES: Arranque con datos de la 1.1.0 en localStorage (lógica de la Tanda 1).
  // EN: Boot with 1.1.0 data in localStorage (Tanda 1 logic).
  async function arrancarLegado() {
    const ajustes = useAjustes();
    if (!almacen.sobreLegible()) {
      await entrarEnFallo("danado");
      return;
    }
    if (ajustes.bloqueoActivo) {
      desbloqueado.value = false;
      return;
    }
    almacen.usarOfuscacion();
    const r = await almacen.leer();
    if (r.estado === "ok") await migrarYEntrar(r.datos, null);
    else if (r.estado === "vacio") necesitaOnboarding.value = true;
    else await entrarEnFallo(r.estado);
  }

  // ES: Abre el fichero (con credencial o sin ella) y entra; clasifica fallos.
  //     true si entró.
  // EN: Opens the file (with or without a credential) and enters; classifies
  //     failures. true if it entered.
  async function abrirFichero(credencial?: string, recuperacion?: string): Promise<boolean> {
    try {
      const datos = recuperacion
        ? await boveda.abrirConRecuperacion(recuperacion)
        : await boveda.abrir(credencial);
      porRecuperacion.value = !!recuperacion;
      entrar(datos);
      return true;
    } catch (e) {
      const c = codigo(e);
      if (c === "credencial") {
        error.value = recuperacion ? "recuperacionIncorrecta" : "credIncorrecta";
      } else if (c === "recuperacion-formato" || c === "recuperacion-comprobacion") {
        error.value = c === "recuperacion-formato" ? "recuperacionFormato" : "recuperacionErrata";
      } else if (c === "sin-recuperacion") {
        error.value = "sinRecuperacion";
      } else if (c === "danado" || c === "version" || c === "invalido") {
        // ES: Si descifró pero no valida, la clave quedó en Rust: se olvida.
        // EN: If it decrypted but does not validate, the key stayed in Rust: forget it.
        await boveda.bloquear().catch(() => {});
        await entrarEnFallo(c);
      } else {
        error.value = "lecturaFallida";
      }
      return false;
    }
  }

  // ── 7. Desbloqueo y recuperación / Unlock & recovery ───────────────────────
  // ES: Prueba una credencial (pantalla de bloqueo o de error). En legado lee
  //     localStorage y, si abre, migra al fichero con esa misma credencial.
  // EN: Tries a credential (lock or error screen). In legado it reads
  //     localStorage and, if it opens, migrates to the file with that same
  //     credential.
  async function desbloquear(credencial: string): Promise<boolean> {
    error.value = "";
    if (cerrandoSesion) return false;
    if (modo.value === "fichero") return abrirFichero(credencial);
    try {
      const r = await almacen.leer(credencial);
      if (r.estado === "ok") {
        almacen.usarSecreto(credencial);
        const ajustes = useAjustes();
        if (!ajustes.bloqueoActivo) ajustes.setBloqueo(true, tipoDe(credencial));
        await migrarYEntrar(r.datos, credencial);
        return true;
      }
      if (r.estado === "credencial") {
        error.value = "credIncorrecta";
        return false;
      }
      if (r.estado === "vacio") {
        error.value = "lecturaFallida";
        return false;
      }
      await entrarEnFallo(r.estado);
      return false;
    } catch {
      error.value = "lecturaFallida";
      return false;
    }
  }

  // ES: Abre con la clave de recuperación (PIN olvidado). Después hay que
  //     poner credencial nueva con restablecerCredencial().
  // EN: Opens with the recovery key (forgotten PIN). Afterwards a new
  //     credential must be set with restablecerCredencial().
  async function desbloquearConRecuperacion(clave: string): Promise<boolean> {
    error.value = "";
    if (cerrandoSesion) return false;
    if (modo.value !== "fichero") {
      error.value = "sinRecuperacion";
      return false;
    }
    return abrirFichero(undefined, clave);
  }

  // ES: "¿Has olvidado el PIN?" desde la pantalla de bloqueo. En legado
  //     prueba antes la ofuscación (un "quitar PIN" de la 1.1.0 a medias); en
  //     fichero lleva a la pantalla de error sin tocar nada.
  // EN: "Forgot the PIN?" from the lock screen. In legado it first tries the
  //     obfuscation (a half-done 1.1.0 "remove PIN"); in file mode it goes to
  //     the error screen without touching anything.
  async function mostrarRecuperacion() {
    if (modo.value === "fichero") {
      await entrarEnFallo("credencial");
      return;
    }
    const r = await almacen.leer(almacen.SECRETO_OFUSCACION);
    if (r.estado === "ok") {
      almacen.usarOfuscacion();
      useAjustes().setBloqueo(false, null);
      await migrarYEntrar(r.datos, null);
      return;
    }
    await entrarEnFallo(
      r.estado === "invalido" || r.estado === "version" ? r.estado : "credencial"
    );
  }

  // ES: "Empezar de cero" de la pantalla de error. En fichero, el almacén
  //     anterior se apartará a rescate/ al crear el nuevo; en legado exige la
  //     copia de rescate en localStorage (salvo `forzar`).
  // EN: "Start from scratch" from the error screen. In file mode, the previous
  //     store will be moved to rescate/ when creating the new one; in legado
  //     it requires the localStorage rescue copy (unless `forzar`).
  function empezarDeCero(forzar = false): boolean {
    if (!asegurarRescate() && !forzar) return false;
    almacen.usarOfuscacion();
    useAjustes().setBloqueo(false, null);
    reemplazarAlCrear = true;
    modo.value = "fichero";
    fallo.value = null;
    error.value = "";
    necesitaOnboarding.value = true;
    return true;
  }

  // ── 8. Gestión del bloqueo / Lock management ───────────────────────────────
  // ES: Comprueba una credencial nueva (mínimos) y que estemos en fichero.
  // EN: Checks a new credential (minimums) and that we are in file mode.
  function exigirCredencialNueva(tipo: TipoBloqueo, valor: string) {
    if (validarCredencial(tipo, valor)) throw new Error("credencial-invalida");
    if (modo.value !== "fichero") throw new Error("migracion-pendiente");
  }

  // ES: Activa el bloqueo. Rust cambia la clave de datos y crea una clave de
  //     recuperación (queda en `claveRecuperacion` para enseñarla). Lanza si
  //     falla; entonces no cambia nada.
  // EN: Enables the lock. Rust changes the data key and creates a recovery key
  //     (kept in `claveRecuperacion` to be shown). Throws on failure; then
  //     nothing changes.
  async function configurarBloqueo(tipo: TipoBloqueo, credencial: string): Promise<string> {
    exigirCredencialNueva(tipo, credencial);
    return conGuardadoEnPausa(async () => {
      const clave = await boveda.configurarBloqueo(tipo, credencial);
      useAjustes().setBloqueo(true, tipo);
      copiasPendientes.value = (await boveda.estado()).copiasPendientes;
      claveRecuperacion.value = clave;
      tieneRecuperacion.value = true;
      autobloqueo.iniciar();
      return clave;
    });
  }

  // ES: Quita el bloqueo (los datos quedan solo ofuscados).
  // EN: Removes the lock (the data is left only obfuscated).
  async function quitarBloqueo() {
    if (modo.value !== "fichero") throw new Error("migracion-pendiente");
    await conGuardadoEnPausa(async () => {
      await boveda.quitarBloqueo();
      useAjustes().setBloqueo(false, null);
      tieneRecuperacion.value = false;
      autobloqueo.parar();
    });
  }

  // ES: Cambia la credencial. false (sin tocar nada) si la antigua no vale;
  //     lanza si la nueva no cumple los mínimos o falla la escritura. Si se
  //     abrió con la clave de recuperación, la antigua no se pide.
  // EN: Changes the credential. false (touching nothing) if the old one is
  //     wrong; throws if the new one is below the minimums or the write
  //     fails. If opened with the recovery key, the old one is not asked.
  async function cambiarCredencial(
    antigua: string,
    nueva: string,
    tipo: TipoBloqueo
  ): Promise<boolean> {
    exigirCredencialNueva(tipo, nueva);
    return conGuardadoEnPausa(async () => {
      try {
        await boveda.cambiarCredencial(porRecuperacion.value ? null : antigua, tipo, nueva);
      } catch (e) {
        if (codigo(e) === "credencial") return false;
        throw e;
      }
      useAjustes().setBloqueo(true, tipo);
      porRecuperacion.value = false;
      return true;
    });
  }

  // ES: Tras abrir con la clave de recuperación: PIN o contraseña nuevos sin
  //     pedir el antiguo. La clave de recuperación sigue valiendo.
  // EN: After opening with the recovery key: new PIN or password without the
  //     old one. The recovery key keeps working.
  function restablecerCredencial(tipo: TipoBloqueo, nueva: string): Promise<boolean> {
    if (!porRecuperacion.value) return Promise.reject(new Error("sin-recuperacion"));
    return cambiarCredencial("", nueva, tipo);
  }

  // ES: Genera otra clave de recuperación (la anterior deja de valer). Pide la
  //     credencial actual. Devuelve la nueva (también en `claveRecuperacion`).
  // EN: Generates another recovery key (the previous one stops working). Asks
  //     for the current credential. Returns the new one (also in
  //     `claveRecuperacion`).
  async function regenerarClaveRecuperacion(credencial: string): Promise<string> {
    if (modo.value !== "fichero") throw new Error("migracion-pendiente");
    return conGuardadoEnPausa(async () => {
      const clave = await boveda.regenerarRecuperacion(credencial);
      claveRecuperacion.value = clave;
      claveNoConfirmada.value = false;
      copiasPendientes.value = (await boveda.estado()).copiasPendientes;
      tieneRecuperacion.value = true;
      return clave;
    });
  }

  // ES: La interfaz ya enseñó la clave de recuperación: se olvida de la memoria.
  // EN: The UI already showed the recovery key: it is dropped from memory.
  function olvidarClaveRecuperacion() {
    claveRecuperacion.value = null;
  }

  // ── 9. Bienvenida, importación y reemplazo / Onboarding, import & replace ──
  // ES: Completa la bienvenida: crea el almacén en fichero con los datos
  //     elegidos y, solo si va bien, registra el bloqueo y entra. Lanza si la
  //     credencial no cumple los mínimos o falla la escritura.
  // EN: Finishes the welcome: creates the file store with the chosen data and,
  //     only if that works, records the lock and enters. Throws if the
  //     credential is below the minimums or the write fails.
  async function completarOnboarding(opts: {
    nombre: string;
    bloqueo: { tipo: TipoBloqueo; credencial: string } | null;
    datosIniciales: "ejemplo" | "vacio";
  }) {
    const ajustes = useAjustes();
    if (opts.bloqueo && validarCredencial(opts.bloqueo.tipo, opts.bloqueo.credencial)) {
      throw new Error("credencial-invalida");
    }
    const datos = opts.datosIniciales === "ejemplo" ? datosDemo() : datosVacios();
    const clave = await boveda.crear(
      datos,
      opts.bloqueo?.tipo ?? "ninguno",
      opts.bloqueo?.credencial ?? null,
      reemplazarAlCrear,
      "bienvenida"
    );
    reemplazarAlCrear = false;
    modo.value = "fichero";
    claveRecuperacion.value = clave;
    tieneRecuperacion.value = !!clave;
    ajustes.setNombre(opts.nombre.trim());
    ajustes.setBloqueo(!!opts.bloqueo, opts.bloqueo?.tipo ?? null);
    necesitaOnboarding.value = false;
    entrar(datos);
  }

  // ES: Importa una copia (JSON antiguo o el contenido de una copia cifrada ya
  //     descifrada). Pasa SIEMPRE por migrar + validar. Desde la pantalla de
  //     error crea un almacén nuevo sin PIN (el anterior se aparta a rescate/).
  // EN: Imports a backup (old JSON or the content of an already decrypted
  //     encrypted backup). It ALWAYS goes through migrate + validate. From the
  //     error screen it creates a new store without a PIN (the previous one
  //     is moved to rescate/).
  async function importarDatos(crudo: unknown, forzar = false) {
    let datos: DatosBolsillo;
    try {
      datos = prepararDatos(crudo);
    } catch (e) {
      throw new Error(
        e instanceof ErrorDatos && e.motivo === "version" ? "copia-version" : "copia-invalida"
      );
    }
    if (fallo.value) {
      if (!asegurarRescate() && !forzar) throw new Error("sin-rescate");
      await boveda.crear(datos, "ninguno", null, true, "importacion");
      modo.value = "fichero";
      reemplazarAlCrear = false;
      tieneRecuperacion.value = false;
      useAjustes().setBloqueo(false, null);
      entrar(datos);
      return;
    }
    await hidratarYGuardar(datos);
  }

  // ES: Importa una copia con sus categorías propias: si la copia trae
  //     `categoriasCustom` y no es una lista de textos, se rechaza entera
  //     ("copia-invalida"). Las categorías se escriben SOLO después de que los
  //     datos estén publicados; si esa escritura falla, se lanza
  //     "categorias-no-guardadas" (los datos ya están importados).
  // EN: Imports a backup with its custom categories: if the backup carries
  //     `categoriasCustom` and it is not a list of strings, the whole backup is
  //     rejected ("copia-invalida"). The categories are written ONLY after the
  //     data is published; if that write fails, "categorias-no-guardadas" is
  //     thrown (the data is already imported).
  async function importarCopiaCompleta(crudo: unknown, forzar = false) {
    const cats =
      crudo && typeof crudo === "object"
        ? (crudo as { categoriasCustom?: unknown }).categoriasCustom
        : undefined;
    if (cats !== undefined && !(Array.isArray(cats) && cats.every((c) => typeof c === "string"))) {
      throw new Error("copia-invalida");
    }
    await importarDatos(crudo, forzar);
    if (!cats) return;
    try {
      setCategoriasCustom(cats as string[]);
    } catch {
      throw new Error("categorias-no-guardadas");
    }
  }

  // ES: Sustituye todos los datos: PRIMERO se guardan y SOLO si va bien se
  //     ponen en pantalla. Si falla, la pantalla y lo pendiente siguen como
  //     estaban y se lanza para que la vista no lo dé por hecho.
  // EN: Replaces all the data: FIRST it is saved and ONLY if that works is it
  //     put on screen. If it fails, the screen and what was pending stay as
  //     they were and it throws so the view does not treat it as done.
  //     Durante la operación la interfaz está cubierta (`trabajando`): nada se
  //     edita entre guardar y publicar. Antes se guarda lo pendiente del
  //     estado anterior (si no se puede, no se sustituye nada) y al final solo
  //     se da por guardada la revisión que se escribió de verdad.
  // EN: During the operation the UI is covered (`trabajando`): nothing is
  //     edited between saving and publishing. What was pending in the
  //     previous state is saved first (if it cannot be, nothing is replaced)
  //     and at the end only the revision really written counts as saved.
  async function hidratarYGuardar(datos: DatosBolsillo) {
    trabajando.value = true;
    try {
      if (!(await vaciarGuardado())) throw new Error("guardado-pendiente");
      await conGuardadoEnPausa(async () => {
        if (!(await guardarFinalEnPausa())) throw new Error("guardado-pendiente");
        await persistir(datos);
        useFinanzas().hidratar(datos);
        // ES: El vaciado de antes y lo hidratado coinciden con el disco.
        // EN: The previous flush and what was hydrated match the disk.
        marcarGuardado(cambios);
      });
    } finally {
      trabajando.value = false;
    }
  }

  // ES: "Empezar de cero" y "Cargar ejemplo" de Ajustes. / EN: Settings "Start from scratch" and "Load samples".
  async function reemplazarDatos(tipo: "ejemplo" | "vacio") {
    await hidratarYGuardar(tipo === "ejemplo" ? datosDemo() : datosVacios());
  }

  // ── 10. Copias / Backups ────────────────────────────────────────────────────
  // ES: Copias automáticas (más nueva primero). / EN: Automatic backups (newest first).
  function listarCopias() {
    return boveda.listarCopias();
  }

  // ES: Restaura una copia automática: guarda antes lo pendiente (si no puede,
  //     lanza "guardado-pendiente" y no toca nada), Rust deja el
  //     principal actual como "antes-…" y el almacén queda bloqueado; después
  //     se vuelve a arrancar (pide la credencial que tuviera esa copia).
  // EN: Restores an automatic backup: first saves what is pending, Rust keeps
  //     the current main file as "antes-…" and the store is left locked; then
  //     it boots again (asks for the credential that backup had).
  async function restaurarCopia(nombre: string, credencial: string | null = null) {
    trabajando.value = true;
    try {
      // ES: 1. Se abre, descifra y valida la copia SIN publicarla: una copia
      //        dañada o con otra credencial no toca nada.
      // EN: 1. The backup is opened, decrypted and validated WITHOUT
      //        publishing it: a damaged backup or one with another credential
      //        touches nothing.
      try {
        await boveda.probarCopia(nombre, credencial);
      } catch (e) {
        const c = codigo(e);
        throw new Error(
          c === "credencial"
            ? "copia-credencial"
            : c === "version"
              ? "copia-version"
              : "copia-invalida"
        );
      }
      // ES: 2. Lo pendiente se guarda antes (si no se puede, no se restaura).
      // EN: 2. What is pending is saved first (if it cannot be, nothing is restored).
      if (desbloqueado.value && !(await vaciarGuardado())) throw new Error("guardado-pendiente");
      await conGuardadoEnPausa(async () => {
        if (desbloqueado.value && !(await guardarFinalEnPausa())) {
          throw new Error("guardado-pendiente");
        }
        // ES: 3. Rust publica (el actual queda como "antes-…") y la deja abierta.
        // EN: 3. Rust publishes (the current one stays as "antes-…") and leaves it open.
        const datos = await boveda.restaurarCopia(nombre, credencial);
        retirarClaveRecuperacion();
        porRecuperacion.value = false;
        const e = await boveda.estado();
        sincronizarAjustes(e.bloqueo);
        tieneRecuperacion.value = e.tieneRecuperacion;
        copiasPendientes.value = e.copiasPendientes;
        modo.value = "fichero";
        necesitaOnboarding.value = false;
        entrar(datos);
      });
    } finally {
      trabajando.value = false;
    }
  }

  // ES: Exporta una copia cifrada con contraseña propia (mín. 8), con los
  //     recibos y las categorías propias dentro. false si se cancela.
  // EN: Exports a backup encrypted with its own password (min. 8), with the
  //     receipts and custom categories inside. false if cancelled.
  async function exportarCopiaCifrada(contrasena: string): Promise<boolean> {
    if (validarCredencial("password", contrasena)) throw new Error("credencial-invalida");
    const hoy = new Date().toISOString().slice(0, 10);
    return boveda.exportarCopiaCifrada(
      { ...useFinanzas().snapshot(), categoriasCustom: categoriasCustom() },
      contrasena,
      `Bolsillo - copia ${hoy}.bolsillo`
    );
  }

  // ES: Abre el diálogo para elegir una copia. JSON antiguo → su contenido ya
  //     parseado (la vista lo importa con importarDatos); cifrada → hay que
  //     pedir la contraseña y llamar a descifrarCopiaElegida. null si se cancela.
  // EN: Opens the dialog to pick a backup. Old JSON → its content already
  //     parsed (the view imports it with importarDatos); encrypted → the
  //     password must be asked and descifrarCopiaElegida called. null if
  //     cancelled.
  async function elegirCopiaParaImportar(): Promise<
    { tipo: "json"; crudo: unknown } | { tipo: "cifrada" } | null
  > {
    const e = await boveda.elegirCopia();
    if (!e) return null;
    if (e.tipo === "cifrada") return { tipo: "cifrada" };
    try {
      return { tipo: "json", crudo: JSON.parse(e.contenido) };
    } catch {
      throw new Error("copia-invalida");
    }
  }

  // ES: Descifra la copia elegida. Lanza "copia-credencial" si la contraseña
  //     no abre. Devuelve el contenido para importarDatos.
  // EN: Decrypts the picked backup. Throws "copia-credencial" if the password
  //     does not open it. Returns the content for importarDatos.
  async function descifrarCopiaElegida(contrasena: string): Promise<unknown> {
    try {
      return await boveda.descifrarCopia(contrasena);
    } catch (e) {
      throw new Error(codigo(e) === "credencial" ? "copia-credencial" : codigo(e));
    }
  }

  // ── 11. API pública / Public API ────────────────────────────────────────────
  return {
    desbloqueado,
    necesitaOnboarding,
    error,
    estadoGuardado,
    vaciarGuardado,
    fallo,
    rescate,
    rescateFallido,
    modo,
    claveRecuperacion,
    tieneRecuperacion,
    porRecuperacion,
    avisoLegadoNuevo,
    avisoMigracion,
    claveNoConfirmada,
    bloqueoPendiente,
    copiasPendientes,
    conflicto,
    trabajando,
    arrancar,
    desbloquear,
    desbloquearConRecuperacion,
    mostrarRecuperacion,
    empezarDeCero,
    bloquearAhora,
    registrarActividad: autobloqueo.actividad,
    configurarBloqueo,
    quitarBloqueo,
    cambiarCredencial,
    restablecerCredencial,
    regenerarClaveRecuperacion,
    olvidarClaveRecuperacion,
    completarOnboarding,
    importarDatos,
    importarCopiaCompleta,
    reemplazarDatos,
    listarCopias,
    restaurarCopia,
    exportarCopiaCifrada,
    elegirCopiaParaImportar,
    descifrarCopiaElegida,
  };
});
