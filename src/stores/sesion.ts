/* =============================================================================
 * sesion.ts — Orquestación de sesión / Session orchestration (boot/lock/onboarding)
 * -----------------------------------------------------------------------------
 * ES: Store de Pinia que orquesta el arranque, la bienvenida (onboarding), el
 *     bloqueo de pantalla y el guardado cifrado. NO contiene datos financieros:
 *     decide QUÉ pantalla mostrar y conecta la persistencia con `finanzas`.
 * EN: Pinia store that orchestrates app boot, onboarding (welcome), screen
 *     lock and the encrypted autosave. It does NOT hold financial data itself:
 *     it decides WHICH screen to show and wires persistence around `finanzas`.
 *
 * ES: Estados de pantalla posibles según este store + ajustes:
 *       - necesitaOnboarding: no hay datos guardados (mostrar bienvenida)
 *       - fallo: los datos no se pueden leer (pantalla de error y rescate)
 *       - bloqueado (bloqueoActivo && !desbloqueado): pedir credencial
 *       - desbloqueado: app en marcha
 * EN: Possible screen states derived from this store + ajustes:
 *       - necesitaOnboarding: there is no saved data (show the welcome screen)
 *       - fallo: the data cannot be read (error screen and rescue)
 *       - locked (bloqueoActivo && !desbloqueado): ask for the credential
 *       - unlocked (desbloqueado): app is running
 *
 * ÍNDICE / INDEX:
 *   1. Importaciones / Imports
 *   2. Definición del store y estado reactivo / Store definition & reactive state
 *   3. Guardado automático que avisa / Autosave that warns
 *   4. Entrada, fallos y rescate / Entry, failures & rescue
 *   5. Decisión de arranque / Boot decision
 *   6. Desbloqueo / Unlock
 *   7. Gestión del bloqueo / Lock management
 *   8. Cierre de la bienvenida / Onboarding completion
 *   9. Importación de datos / Data import
 *  10. API pública / Public API
 * ===========================================================================*/

// ── 1. Importaciones / Imports ───────────────────────────────────────────────
// ES: Fábrica de stores de Pinia, reactividad de Vue, stores hermanos, capa de
//     almacenamiento, datos iniciales (ejemplo o vacío) y la preparación de
//     datos (migrar + validar) para las copias importadas.
// EN: Pinia store factory, Vue reactivity, sibling stores, storage layer,
//     initial data (samples or empty) and data preparation (migrate +
//     validate) for imported backups.
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useFinanzas } from "./finanzas";
import { useAjustes, type TipoBloqueo } from "./ajustes";
import * as almacen from "../utils/almacen";
import { datosDemo, datosVacios } from "../data/demo";
import type { DatosBolsillo } from "../types";
import { prepararDatos, ErrorDatos } from "../utils/migraciones";

// ES: Motivos por los que los datos guardados no se pueden abrir (ver almacen.leer).
// EN: Reasons why the stored data cannot be opened (see almacen.leer).
export type FalloDatos = "danado" | "credencial" | "invalido" | "version";

// ES: Estado del guardado: "ok" (todo en disco), "pendiente" (cambios a la espera
//     del debounce), "guardando" o "error" (el último intento falló).
// EN: Save state: "ok" (all on disk), "pendiente" (changes waiting for the
//     debounce), "guardando" (saving) or "error" (the last attempt failed).
export type EstadoGuardado = "ok" | "pendiente" | "guardando" | "error";

// ── 2. Definición del store y estado reactivo / Store definition & reactive state ─
// ES: `desbloqueado` habilita la UI principal; `necesitaOnboarding` dispara el
//     flujo de bienvenida; `error` lleva una clave i18n para la pantalla de
//     bloqueo. `guardadoActivo` es un guard no reactivo para conectar el
//     guardado automático una sola vez.
// EN: `desbloqueado` gates the main UI; `necesitaOnboarding` triggers the
//     welcome flow; `error` carries an i18n key for the lock screen.
//     `guardadoActivo` is a non-reactive guard so autosave is wired only once.
export const useSesion = defineStore("sesion", () => {
  const desbloqueado = ref(false);
  const necesitaOnboarding = ref(false);
  const error = ref("");
  // ES: Motivo del fallo de lectura (null = sin fallo), clave de la copia de
  //     rescate creada y si no se pudo crear (falta de espacio).
  // EN: Read failure reason (null = no failure), key of the rescue copy made
  //     and whether it could not be made (out of space).
  const fallo = ref<FalloDatos | null>(null);
  const rescate = ref<string | null>(null);
  const rescateFallido = ref(false);
  let guardadoActivo = false;

  // ── 3. Guardado automático que avisa / Autosave that warns ──────────────────
  // ES: Cada cambio en finanzas suma 1 a `cambios`; un guardado que termina bien
  //     sube `guardados` hasta el número de cambios que incluía. Si no coinciden
  //     hay cambios sin guardar. Los guardados se agrupan con un debounce de
  //     300 ms; si uno falla (p. ej. almacenamiento lleno) el estado pasa a
  //     "error", se muestra un aviso persistente y se reintenta con espera
  //     creciente (2 s, 4 s, 8 s… hasta 60 s), además del botón "Reintentar".
  //     `operando` pausa el guardado automático mientras se cambia la
  //     credencial o se importa, para que ningún guardado con el secreto viejo
  //     llegue después del nuevo.
  // EN: Every change in finanzas adds 1 to `cambios`; a save that succeeds
  //     raises `guardados` up to the number of changes it included. If they
  //     differ there are unsaved changes. Saves are grouped with a 300 ms
  //     debounce; if one fails (e.g. storage full) the state becomes "error", a
  //     persistent warning is shown and it is retried with growing waits (2 s,
  //     4 s, 8 s… up to 60 s), besides the "Retry" button. `operando` pauses
  //     autosave while the credential changes or an import runs, so no save
  //     with the old secret can land after the new one.
  const RETARDO_GUARDADO_MS = 300;
  const REINTENTO_MAX_MS = 60_000;
  const estadoGuardado = ref<EstadoGuardado>("ok");
  let cambios = 0;
  let guardados = 0;
  let intentos = 0;
  let operando = false;
  let temporizador: ReturnType<typeof setTimeout> | undefined;
  let reintento: ReturnType<typeof setTimeout> | undefined;

  // ES: Cancela el debounce y el reintento pendientes. / EN: Cancels the pending debounce and retry.
  function cancelarTemporizadores() {
    clearTimeout(temporizador);
    clearTimeout(reintento);
    temporizador = undefined;
    reintento = undefined;
  }

  // ES: Programa un guardado dentro de 300 ms (salvo con el guardado en pausa).
  // EN: Schedules a save in 300 ms (unless saving is paused).
  function programarGuardado() {
    if (operando) return;
    clearTimeout(temporizador);
    temporizador = setTimeout(() => void guardarAhora(), RETARDO_GUARDADO_MS);
  }

  // ES: Anota un guardado correcto que incluía hasta el cambio `hasta`.
  // EN: Records a successful save that included up to change `hasta`.
  function marcarGuardado(hasta: number) {
    if (hasta > guardados) guardados = hasta;
    intentos = 0;
    estadoGuardado.value = cambios === guardados ? "ok" : "pendiente";
  }

  // ES: Anota un guardado fallido: estado de error y reintento con espera creciente.
  // EN: Records a failed save: error state and retry with a growing wait.
  function marcarFallo() {
    estadoGuardado.value = "error";
    intentos++;
    if (operando) return;
    clearTimeout(reintento);
    const espera = Math.min(1000 * 2 ** intentos, REINTENTO_MAX_MS);
    reintento = setTimeout(() => void guardarAhora(), espera);
  }

  // ES: Guarda YA lo que haya pendiente con el secreto activo. Devuelve true si
  //     todo quedó en disco (o no había nada que guardar) y false si falló.
  // EN: Saves whatever is pending NOW with the active secret. Returns true if
  //     everything reached disk (or there was nothing to save), false if it failed.
  async function guardarAhora(): Promise<boolean> {
    cancelarTemporizadores();
    if (cambios === guardados) {
      if (estadoGuardado.value !== "guardando") estadoGuardado.value = "ok";
      return true;
    }
    const hasta = cambios;
    estadoGuardado.value = "guardando";
    try {
      await almacen.guardar(useFinanzas().snapshot());
      marcarGuardado(hasta);
      return true;
    } catch {
      marcarFallo();
      return false;
    }
  }

  // ES: Vacía el guardado pendiente (al cerrar, antes de cambiar la credencial,
  //     al importar o desde el botón "Reintentar"). Es la API pública.
  // EN: Flushes the pending save (on close, before changing the credential, on
  //     import or from the "Retry" button). This is the public API.
  async function vaciarGuardado(): Promise<boolean> {
    if (operando) return false;
    return guardarAhora();
  }

  // ES: Ejecuta una operación con el guardado automático en pausa (cambio de
  //     credencial, importación). Al terminar, si quedó algo pendiente, se
  //     programa con el secreto que haya quedado activo.
  // EN: Runs an operation with autosave paused (credential change, import).
  //     When done, if something is still pending, it is scheduled with the
  //     secret left active.
  async function conGuardadoEnPausa<T>(op: () => Promise<T>): Promise<T> {
    operando = true;
    cancelarTemporizadores();
    try {
      return await op();
    } finally {
      operando = false;
      if (cambios !== guardados) {
        if (estadoGuardado.value === "error") marcarFallo();
        else programarGuardado();
      }
    }
  }

  // ES: Activa el guardado automático CIFRADO una sola vez. El watcher es
  //     síncrono (flush "sync") para contar cada cambio en el momento: así un
  //     vaciado inmediato nunca cree que no hay nada pendiente.
  // EN: Enables ENCRYPTED autosave exactly once. The watcher is synchronous
  //     (flush "sync") so every change is counted at once: an immediate flush
  //     never thinks there is nothing pending.
  function activarGuardado() {
    if (guardadoActivo) return;
    guardadoActivo = true;
    const f = useFinanzas();
    watch(
      () => f.snapshot(),
      () => {
        cambios++;
        if (estadoGuardado.value !== "error") estadoGuardado.value = "pendiente";
        programarGuardado();
      },
      { deep: true, flush: "sync" }
    );
  }

  // ── 4. Entrada, fallos y rescate / Entry, failures & rescue ─────────────────
  // ES: Entra en la app con unos datos ya leídos y validados: hidrata, conecta
  //     el guardado, limpia cualquier fallo y marca la app como configurada
  //     (si hay datos, no tiene sentido volver a mostrar la bienvenida).
  // EN: Enters the app with already read and validated data: hydrates, wires
  //     autosave, clears any failure and marks the app as configured (if there
  //     is data, showing the welcome again makes no sense).
  function entrar(datos: DatosBolsillo) {
    const ajustes = useAjustes();
    useFinanzas().hidratar(datos);
    activarGuardado();
    // ES: Lo hidratado coincide con el disco: nada pendiente.
    // EN: What was hydrated matches the disk: nothing pending.
    cancelarTemporizadores();
    guardados = cambios;
    intentos = 0;
    estadoGuardado.value = "ok";
    fallo.value = null;
    error.value = "";
    if (!ajustes.configurado) ajustes.marcarConfigurado();
    desbloqueado.value = true;
  }

  // ES: Garantiza que existe una copia de rescate del blob actual (una sola por
  //     contenido). Devuelve false si no cabe: entonces NO se debe seguir con
  //     nada que sobrescriba los datos sin que el usuario lo fuerce.
  // EN: Ensures a rescue copy of the current blob exists (one per content).
  //     Returns false if it does not fit: then nothing that overwrites the data
  //     must go ahead unless the user forces it.
  function asegurarRescate(): boolean {
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

  // ES: Pasa a la pantalla de error de datos. NUNCA siembra ejemplo ni escribe
  //     el blob principal. Con daño o datos no válidos se hace ya la copia de
  //     rescate; con "credencial" no (los datos pueden estar bien y solo faltar
  //     el PIN): la copia se hará antes de cualquier opción destructiva.
  // EN: Switches to the data error screen. It NEVER seeds samples nor writes
  //     the main blob. On damage or invalid data the rescue copy is made right
  //     away; on "credencial" it is not (the data may be fine and only the PIN
  //     be missing): the copy is made before any destructive option.
  function entrarEnFallo(tipo: FalloDatos) {
    fallo.value = tipo;
    desbloqueado.value = false;
    if (tipo !== "credencial") asegurarRescate();
  }

  // ── 5. Decisión de arranque / Boot decision ────────────────────────────────
  // ES: Punto de entrada al iniciar la app:
  //       1. Sin blob → bienvenida (nada se guarda hasta que el usuario elige).
  //       2. Sobre dañado → pantalla de error (antes de pedir PIN, para no
  //          responder "credencial incorrecta" a unos datos rotos).
  //       3. Bloqueo activo → pantalla de bloqueo.
  //       4. Sin bloqueo → se lee con el secreto de ofuscación; si no abre o no
  //          valida → pantalla de error, nunca datos de ejemplo encima.
  //     La bienvenida depende de que NO haya blob, no de `ajustes.configurado`:
  //     si se pierden los ajustes, los datos no se pisan.
  // EN: Entry point at app start:
  //       1. No blob → welcome (nothing is saved until the user chooses).
  //       2. Damaged envelope → error screen (before asking for a PIN, so a
  //          broken blob does not answer "wrong credential").
  //       3. Lock enabled → lock screen.
  //       4. No lock → read with the obfuscation secret; if it does not open or
  //          validate → error screen, never sample data on top.
  //     The welcome depends on there being NO blob, not on `ajustes.configurado`:
  //     if the settings are lost, the data is not overwritten.
  async function arrancar() {
    const ajustes = useAjustes();
    ajustes.aplicarTema();

    if (!almacen.hayDatos()) {
      almacen.usarOfuscacion();
      necesitaOnboarding.value = true;
      return;
    }
    if (!almacen.sobreLegible()) {
      entrarEnFallo("danado");
      return;
    }
    if (ajustes.bloqueoActivo) {
      desbloqueado.value = false;
      return;
    }
    almacen.usarOfuscacion();
    const r = await almacen.leer();
    if (r.estado === "ok") entrar(r.datos);
    else if (r.estado === "vacio") necesitaOnboarding.value = true;
    else entrarEnFallo(r.estado);
  }

  // ── 6. Desbloqueo / Unlock ──────────────────────────────────────────────────
  // ES: Prueba una credencial (pantalla de bloqueo o de error). Si abre y valida,
  //     la fija como secreto activo y entra; si los ajustes se habían perdido,
  //     vuelve a marcar el bloqueo (PIN si son 4-6 dígitos, si no contraseña)
  //     para que la próxima vez se pida. Si no abre → "credIncorrecta" (puede
  //     ser también un cifrado alterado: no se puede distinguir). Si abre pero
  //     no valida o es de una versión nueva → pantalla de error con rescate.
  // EN: Tries a credential (lock or error screen). If it opens and validates,
  //     it becomes the active secret and the app is entered; if the settings
  //     were lost, the lock is set again (PIN if 4-6 digits, else password) so
  //     it is asked next time. If it does not open → "credIncorrecta" (it may
  //     also be altered ciphertext: they cannot be told apart). If it opens but
  //     does not validate or is from a newer version → error screen with rescue.
  async function desbloquear(credencial: string): Promise<boolean> {
    error.value = "";
    try {
      const r = await almacen.leer(credencial);
      if (r.estado === "ok") {
        almacen.usarSecreto(credencial);
        const ajustes = useAjustes();
        if (!ajustes.bloqueoActivo)
          ajustes.setBloqueo(true, /^\d{4,6}$/.test(credencial) ? "pin" : "password");
        entrar(r.datos);
        return true;
      }
      if (r.estado === "credencial") {
        // ES: clave i18n, se traduce en la pantalla / EN: i18n key, translated on screen
        error.value = "credIncorrecta";
        return false;
      }
      if (r.estado === "vacio") {
        error.value = "lecturaFallida";
        return false;
      }
      entrarEnFallo(r.estado);
      return false;
    } catch {
      error.value = "lecturaFallida";
      return false;
    }
  }

  // ES: Desde la pantalla de bloqueo: abre las opciones de recuperación (importar
  //     copia o empezar de cero) sin tocar nada todavía.
  // EN: From the lock screen: opens the recovery options (import a backup or
  //     start from scratch) without touching anything yet.
  function mostrarRecuperacion() {
    entrarEnFallo("credencial");
  }

  // ES: Opción "empezar de cero" de la pantalla de error: exige la copia de
  //     rescate (salvo que el usuario fuerce tras ser avisado), quita el bloqueo
  //     antiguo y lleva a la bienvenida. El blob ilegible no se toca hasta que
  //     la bienvenida guarde los datos nuevos.
  // EN: "Start from scratch" option of the error screen: requires the rescue
  //     copy (unless the user forces it after being warned), removes the old
  //     lock and goes to the welcome. The unreadable blob is not touched until
  //     the welcome saves the new data.
  function empezarDeCero(forzar = false): boolean {
    if (!asegurarRescate() && !forzar) return false;
    almacen.usarOfuscacion();
    useAjustes().setBloqueo(false, null);
    fallo.value = null;
    error.value = "";
    necesitaOnboarding.value = true;
    return true;
  }

  // ── 7. Gestión del bloqueo / Lock management ────────────────────────────────
  // ES: Re-cifra los datos con un secreto nuevo de forma SEGURA: con el guardado
  //     automático en pausa, primero guarda con el secreto nuevo y solo si va
  //     bien lo activa (y quien llama actualiza los ajustes). Si falla, lanza y
  //     no cambia nada: ni el secreto activo ni los ajustes, así que lo que hay
  //     en disco sigue cuadrando con lo que dicen los ajustes.
  // EN: Re-encrypts the data with a new secret SAFELY: with autosave paused, it
  //     first saves with the new secret and only if that works activates it (and
  //     the caller updates the settings). If it fails it throws and changes
  //     nothing: neither the active secret nor the settings, so the disk still
  //     matches what the settings say.
  async function recifrar(secretoNuevo: string, activar: () => void) {
    await conGuardadoEnPausa(async () => {
      const hasta = cambios;
      try {
        await almacen.guardar(useFinanzas().snapshot(), secretoNuevo);
      } catch (e) {
        if (cambios !== guardados) estadoGuardado.value = "error";
        throw e;
      }
      activar();
      marcarGuardado(hasta);
    });
  }

  // ES: Activa el bloqueo con la credencial dada. Lanza si no se pudo guardar.
  // EN: Enables the lock with the given credential. Throws if it could not save.
  async function configurarBloqueo(tipo: TipoBloqueo, credencial: string) {
    await recifrar(credencial, () => {
      almacen.usarSecreto(credencial);
      useAjustes().setBloqueo(true, tipo);
    });
  }

  // ES: Quita el bloqueo: re-cifra con el secreto de ofuscación (los datos
  //     siguen sin guardarse en claro) y limpia el bloqueo en ajustes.
  // EN: Disables the lock: re-encrypts with the obfuscation secret (so data is
  //     still not stored in plain text) and clears the lock in ajustes.
  async function quitarBloqueo() {
    await recifrar(almacen.SECRETO_OFUSCACION, () => {
      almacen.usarOfuscacion();
      useAjustes().setBloqueo(false, null);
    });
  }

  // ES: Cambia la credencial: verifica la antigua y, solo si es válida, re-cifra
  //     con la nueva. Devuelve false (sin tocar nada) si la antigua no abre los
  //     datos; lanza si el guardado con la nueva falla (y la antigua sigue valiendo).
  // EN: Changes the credential: verifies the old one and, only if valid,
  //     re-encrypts with the new one. Returns false (touching nothing) if the
  //     old one does not open the data; throws if saving with the new one fails
  //     (and the old one keeps working).
  async function cambiarCredencial(
    antigua: string,
    nueva: string,
    tipo: TipoBloqueo
  ): Promise<boolean> {
    const ok = await almacen.secretoValido(antigua);
    if (!ok) return false;
    await recifrar(nueva, () => {
      almacen.usarSecreto(nueva);
      useAjustes().setBloqueo(true, tipo);
    });
    return true;
  }

  // ── 8. Cierre de la bienvenida / Onboarding completion ──────────────────────
  // ES: Completa la bienvenida: carga los datos elegidos (ejemplo o vacío),
  //     los GUARDA cifrados (con la credencial elegida o con ofuscación) y solo
  //     si el guardado va bien registra el bloqueo, marca la app como
  //     configurada y entra. Si el guardado falla, lanza y no cambia de pantalla.
  // EN: Finishes the welcome: loads the chosen data (samples or empty), SAVES
  //     it encrypted (with the chosen credential or obfuscation) and only if
  //     the save works records the lock, marks the app as configured and
  //     enters. If the save fails it throws and stays on the welcome screen.
  async function completarOnboarding(opts: {
    nombre: string;
    bloqueo: { tipo: TipoBloqueo; credencial: string } | null;
    datosIniciales: "ejemplo" | "vacio";
  }) {
    const ajustes = useAjustes();
    const datos = opts.datosIniciales === "ejemplo" ? datosDemo() : datosVacios();
    const secreto = opts.bloqueo?.credencial;
    if (secreto) await almacen.guardar(datos, secreto);
    else {
      almacen.usarOfuscacion();
      await almacen.guardar(datos);
    }
    if (secreto) almacen.usarSecreto(secreto);
    ajustes.setNombre(opts.nombre.trim());
    ajustes.setBloqueo(!!opts.bloqueo, opts.bloqueo?.tipo ?? null);
    necesitaOnboarding.value = false;
    entrar(datos);
  }

  // ── 9. Importación de datos / Data import ───────────────────────────────────
  // ES: Importa una copia. Pasa SIEMPRE por migrar + validar (las copias
  //     antiguas sin versión se migran, no se rechazan). Errores: "copia-invalida"
  //     o "copia-version" (copia de una versión más nueva). Desde la pantalla de
  //     error exige antes la copia de rescate (o `forzar`), guarda con
  //     ofuscación y quita el bloqueo antiguo, porque su credencial no se conoce.
  //     El guardado se espera: si falla, lanza y no se da por importada.
  // EN: Imports a backup. It ALWAYS goes through migrate + validate (old
  //     unversioned backups are migrated, not rejected). Errors: "copia-invalida"
  //     or "copia-version" (backup from a newer version). From the error screen
  //     it first requires the rescue copy (or `forzar`), saves with obfuscation
  //     and removes the old lock, because its credential is unknown. The save is
  //     awaited: if it fails, it throws and the import does not count.
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
      almacen.usarOfuscacion();
      await almacen.guardar(datos);
      useAjustes().setBloqueo(false, null);
      entrar(datos);
      return;
    }
    await hidratarYGuardar(datos);
  }

  // ES: Sustituye todos los datos y los guarda ya, con el guardado automático en
  //     pausa. Si falla, los datos quedan en pantalla pero el estado pasa a
  //     "error" (aviso y reintento) y se lanza para que la vista no dé el
  //     cambio por hecho.
  // EN: Replaces all the data and saves it now, with autosave paused. If it
  //     fails, the data stays on screen but the state becomes "error" (warning
  //     and retry) and it throws so the view does not treat it as done.
  async function hidratarYGuardar(datos: DatosBolsillo) {
    await conGuardadoEnPausa(async () => {
      const f = useFinanzas();
      f.hidratar(datos);
      const hasta = cambios;
      try {
        await almacen.guardar(f.snapshot());
      } catch (e) {
        estadoGuardado.value = "error";
        throw e;
      }
      marcarGuardado(hasta);
    });
  }

  // ES: Botones de Ajustes "Empezar de cero" y "Cargar ejemplo": sustituyen
  //     todos los datos por un conjunto vacío o por el de ejemplo (la vista
  //     pide confirmación antes).
  // EN: Settings buttons "Start from scratch" and "Load samples": replace all
  //     the data with an empty set or the sample one (the view asks for
  //     confirmation first).
  async function reemplazarDatos(tipo: "ejemplo" | "vacio") {
    await hidratarYGuardar(tipo === "ejemplo" ? datosDemo() : datosVacios());
  }

  // ── 10. API pública / Public API ────────────────────────────────────────────
  // ES: Flags reactivos + acciones expuestas a los componentes. Los ayudantes
  //     internos (activarGuardado, guardarAhora, recifrar, entrar,
  //     entrarEnFallo, asegurarRescate) quedan privados.
  // EN: Reactive flags + actions exposed to components. Internal helpers
  //     (activarGuardado, guardarAhora, recifrar, entrar, entrarEnFallo,
  //     asegurarRescate) stay private.
  return {
    desbloqueado,
    necesitaOnboarding,
    error,
    estadoGuardado,
    vaciarGuardado,
    fallo,
    rescate,
    rescateFallido,
    arrancar,
    desbloquear,
    mostrarRecuperacion,
    empezarDeCero,
    configurarBloqueo,
    quitarBloqueo,
    cambiarCredencial,
    completarOnboarding,
    importarDatos,
    reemplazarDatos,
  };
});
