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
 *   3. Conexión del guardado automático / Autosave wiring
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

  // ── 3. Conexión del guardado automático / Autosave wiring ──────────────────
  // ES: Activa el guardado automático CIFRADO una sola vez. Observa un snapshot
  //     profundo de finanzas y lo persiste ante cualquier cambio; el guard
  //     evita watchers duplicados (que escribirían varias veces por mutación).
  // EN: Enables ENCRYPTED autosave exactly once. Watches a deep snapshot of
  //     finanzas and persists it on any change; the guard prevents duplicate
  //     watchers (which would write multiple times per mutation).
  function activarGuardado() {
    if (guardadoActivo) return;
    guardadoActivo = true;
    const f = useFinanzas();
    watch(
      () => f.snapshot(),
      () => {
        void almacen.guardar(f.snapshot());
      },
      { deep: true }
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
  // ES: Activa el bloqueo: re-cifra el snapshot actual con la nueva credencial
  //     y registra el tipo de bloqueo en ajustes.
  // EN: Enables the lock: re-encrypts the current snapshot with the new
  //     credential and records the lock type in ajustes.
  async function configurarBloqueo(tipo: TipoBloqueo, credencial: string) {
    const f = useFinanzas();
    almacen.usarSecreto(credencial);
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(true, tipo);
  }

  // ES: Quita el bloqueo: re-cifra con el secreto de ofuscación (los datos
  //     siguen sin guardarse en claro) y limpia el bloqueo en ajustes.
  // EN: Disables the lock: re-encrypts with the obfuscation secret (so data is
  //     still not stored in plain text) and clears the lock in ajustes.
  async function quitarBloqueo() {
    const f = useFinanzas();
    almacen.usarOfuscacion();
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(false, null);
  }

  // ES: Cambia la credencial: verifica la antigua y, solo si es válida, re-cifra
  //     con el nuevo secreto y actualiza el tipo de bloqueo. Devuelve false
  //     (sin tocar nada) cuando la credencial antigua es incorrecta.
  // EN: Changes the credential: verifies the old one, and only if valid
  //     re-encrypts with the new secret and updates the lock type. Returns
  //     false (without touching anything) when the old credential is wrong.
  async function cambiarCredencial(
    antigua: string,
    nueva: string,
    tipo: TipoBloqueo
  ): Promise<boolean> {
    const ok = await almacen.secretoValido(antigua);
    if (!ok) return false;
    const f = useFinanzas();
    almacen.usarSecreto(nueva);
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(true, tipo);
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
    const f = useFinanzas();
    f.hidratar(datos);
    await almacen.guardar(f.snapshot());
  }

  // ── 10. API pública / Public API ────────────────────────────────────────────
  // ES: Flags reactivos + acciones expuestas a los componentes. Los ayudantes
  //     internos (activarGuardado, entrar, entrarEnFallo, asegurarRescate)
  //     quedan privados.
  // EN: Reactive flags + actions exposed to components. Internal helpers
  //     (activarGuardado, entrar, entrarEnFallo, asegurarRescate) stay private.
  return {
    desbloqueado,
    necesitaOnboarding,
    error,
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
  };
});
