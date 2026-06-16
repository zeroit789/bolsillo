/* =============================================================================
 * sesion.ts — Session orchestration (boot/lock/onboarding) / Orquestación de sesión
 * -----------------------------------------------------------------------------
 * EN: Pinia store that orchestrates app boot, onboarding (welcome), screen
 *     lock and the encrypted autosave. It does NOT hold financial data itself:
 *     it decides WHICH screen to show and wires persistence around `finanzas`.
 * ES: Store de Pinia que orquesta el arranque, la bienvenida (onboarding), el
 *     bloqueo de pantalla y el guardado cifrado. NO contiene datos financieros:
 *     decide QUÉ pantalla mostrar y conecta la persistencia con `finanzas`.
 *
 * EN: Possible screen states derived from this store + ajustes:
 *       - necesitaOnboarding: first boot (show the welcome screen)
 *       - locked (bloqueoActivo && !desbloqueado): ask for the credential
 *       - unlocked (desbloqueado): app is running
 * ES: Estados de pantalla posibles según este store + ajustes:
 *       - necesitaOnboarding: primer arranque (mostrar bienvenida)
 *       - bloqueado (bloqueoActivo && !desbloqueado): pedir credencial
 *       - desbloqueado: app en marcha
 *
 * INDEX / ÍNDICE:
 *   1. Imports / Importaciones
 *   2. Store definition & reactive state / Definición del store y estado reactivo
 *   3. Autosave wiring / Conexión del guardado automático
 *   4. Load & hydrate / Carga e hidratación
 *   5. Boot decision / Decisión de arranque
 *   6. Unlock / Desbloqueo
 *   7. Lock management / Gestión del bloqueo
 *   8. Onboarding completion / Cierre de la bienvenida
 *   9. Data import / Importación de datos
 *  10. Public API / API pública
 * ===========================================================================*/

// ── 1. Imports / Importaciones ───────────────────────────────────────────────
// EN: Pinia store factory, Vue reactivity, sibling stores, storage layer,
//     demo seed data and the runtime shape validator for imported backups.
// ES: Fábrica de stores de Pinia, reactividad de Vue, stores hermanos, capa de
//     almacenamiento, datos demo de siembra y el validador de forma en runtime
//     para las copias importadas.
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useFinanzas } from "./finanzas";
import { useAjustes, type TipoBloqueo } from "./ajustes";
import * as almacen from "../utils/almacen";
import { datosDemo } from "../data/demo";
import { esDatosValidos } from "../types";

// ── 2. Store definition & reactive state / Definición del store y estado reactivo ─
// EN: `desbloqueado` gates the main UI; `necesitaOnboarding` triggers the
//     welcome flow; `error` carries an i18n key for the lock screen.
//     `guardadoActivo` is a non-reactive guard so autosave is wired only once.
// ES: `desbloqueado` habilita la UI principal; `necesitaOnboarding` dispara el
//     flujo de bienvenida; `error` lleva una clave i18n para la pantalla de
//     bloqueo. `guardadoActivo` es un guard no reactivo para conectar el
//     guardado automático una sola vez.
export const useSesion = defineStore("sesion", () => {
  const desbloqueado = ref(false);
  const necesitaOnboarding = ref(false);
  const error = ref("");
  let guardadoActivo = false;

  // ── 3. Autosave wiring / Conexión del guardado automático ──────────────────
  // EN: Enables ENCRYPTED autosave exactly once. Watches a deep snapshot of
  //     finanzas and persists it on any change; the guard prevents duplicate
  //     watchers (which would write multiple times per mutation).
  // ES: Activa el guardado automático CIFRADO una sola vez. Observa un snapshot
  //     profundo de finanzas y lo persiste ante cualquier cambio; el guard
  //     evita watchers duplicados (que escribirían varias veces por mutación).
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

  // ── 4. Load & hydrate / Carga e hidratación ────────────────────────────────
  // EN: Loads persisted data and hydrates finanzas. On a fresh install (no
  //     data) it seeds the demo dataset and persists it immediately so the
  //     blob exists from the start. Always wires autosave afterwards.
  // ES: Carga los datos persistidos e hidrata finanzas. En instalación limpia
  //     (sin datos) siembra el conjunto demo y lo persiste de inmediato para
  //     que el blob exista desde el principio. Luego conecta el guardado.
  async function cargarEHidratar() {
    const f = useFinanzas();
    const datos = await almacen.cargar();
    if (datos) {
      f.hidratar(datos);
    } else {
      f.hidratar(datosDemo());
      await almacen.guardar(f.snapshot());
    }
    activarGuardado();
  }

  // EN: Fault-tolerant wrapper over cargarEHidratar: if the stored blob is
  //     corrupt (read/decrypt throws), fall back to the demo data instead of
  //     crashing boot, and persist that recovered state.
  // ES: Envoltura tolerante a fallos sobre cargarEHidratar: si el blob guardado
  //     está corrupto (la lectura/descifrado lanza), recurre a los datos demo
  //     en vez de romper el arranque, y persiste ese estado recuperado.
  async function cargarSeguro() {
    try {
      await cargarEHidratar();
    } catch {
      const f = useFinanzas();
      f.hidratar(datosDemo());
      activarGuardado();
      await almacen.guardar(f.snapshot());
    }
  }

  // ── 5. Boot decision / Decisión de arranque ────────────────────────────────
  // EN: Entry point at app start. Applies the theme, then routes to one of the
  //     three states: onboarding (first run), locked (lock enabled), or
  //     unlocked (no lock → enter directly). Uses obfuscation as the at-rest
  //     secret whenever there is no user credential to protect the data.
  // ES: Punto de entrada al iniciar la app. Aplica el tema y luego enruta a uno
  //     de los tres estados: onboarding (primer arranque), bloqueado (bloqueo
  //     activo) o desbloqueado (sin bloqueo → entrar directo). Usa ofuscación
  //     como secreto en reposo cuando no hay credencial de usuario que proteja
  //     los datos.
  async function arrancar() {
    const ajustes = useAjustes();
    ajustes.aplicarTema();

    // EN: First run -> show welcome (with demo data in the background).
    // ES: Primer arranque -> bienvenida (con datos demo de fondo).
    if (!ajustes.configurado) {
      almacen.usarOfuscacion();
      await cargarSeguro();
      necesitaOnboarding.value = true;
      return;
    }
    // EN: Lock enabled -> stay locked and wait for the credential.
    // ES: Con bloqueo -> permanecer bloqueado y esperar la credencial.
    if (ajustes.bloqueoActivo) {
      desbloqueado.value = false;
      return;
    }
    // EN: No lock -> enter directly using the obfuscation secret.
    // ES: Sin bloqueo -> entrar directo usando el secreto de ofuscación.
    almacen.usarOfuscacion();
    await cargarSeguro();
    desbloqueado.value = true;
  }

  // ── 6. Unlock / Desbloqueo ──────────────────────────────────────────────────
  // EN: Validates the credential typed on the lock screen. On success, sets it
  //     as the active secret, loads/hydrates and flips to unlocked. On wrong
  //     credential or read failure, sets an i18n error key and returns false.
  //     Returns true only when the app is actually unlocked.
  // ES: Valida la credencial introducida en la pantalla de bloqueo. Si es
  //     correcta, la fija como secreto activo, carga/hidrata y pasa a
  //     desbloqueado. Si la credencial es incorrecta o falla la lectura, fija
  //     una clave i18n de error y devuelve false. Devuelve true solo cuando la
  //     app queda realmente desbloqueada.
  async function desbloquear(credencial: string): Promise<boolean> {
    error.value = "";
    try {
      const ok = await almacen.secretoValido(credencial);
      if (!ok) {
        // EN: i18n key, translated in PantallaBloqueo / ES: clave i18n, se traduce en PantallaBloqueo
        error.value = "credIncorrecta";
        return false;
      }
      almacen.usarSecreto(credencial);
      await cargarEHidratar();
      desbloqueado.value = true;
      return true;
    } catch {
      // EN: i18n key, translated in PantallaBloqueo / ES: clave i18n, se traduce en PantallaBloqueo
      error.value = "lecturaFallida";
      return false;
    }
  }

  // ── 7. Lock management / Gestión del bloqueo ────────────────────────────────
  // EN: Enables the lock: re-encrypts the current snapshot with the new
  //     credential and records the lock type in ajustes.
  // ES: Activa el bloqueo: re-cifra el snapshot actual con la nueva credencial
  //     y registra el tipo de bloqueo en ajustes.
  async function configurarBloqueo(tipo: TipoBloqueo, credencial: string) {
    const f = useFinanzas();
    almacen.usarSecreto(credencial);
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(true, tipo);
  }

  // EN: Disables the lock: re-encrypts with the obfuscation secret (so data is
  //     still not stored in plain text) and clears the lock in ajustes.
  // ES: Quita el bloqueo: re-cifra con el secreto de ofuscación (los datos
  //     siguen sin guardarse en claro) y limpia el bloqueo en ajustes.
  async function quitarBloqueo() {
    const f = useFinanzas();
    almacen.usarOfuscacion();
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(false, null);
  }

  // EN: Changes the credential: verifies the old one, and only if valid
  //     re-encrypts with the new secret and updates the lock type. Returns
  //     false (without touching anything) when the old credential is wrong.
  // ES: Cambia la credencial: verifica la antigua y, solo si es válida, re-cifra
  //     con el nuevo secreto y actualiza el tipo de bloqueo. Devuelve false
  //     (sin tocar nada) cuando la credencial antigua es incorrecta.
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

  // ── 8. Onboarding completion / Cierre de la bienvenida ──────────────────────
  // EN: Finishes the welcome flow: saves the trimmed name, enables the lock if
  //     the user chose one, marks ajustes as configured and enters the app
  //     (unlocked, onboarding done).
  // ES: Completa la bienvenida: guarda el nombre recortado, activa el bloqueo si
  //     el usuario eligió uno, marca ajustes como configurado y entra en la app
  //     (desbloqueada, onboarding hecho).
  async function completarOnboarding(opts: {
    nombre: string;
    bloqueo: { tipo: TipoBloqueo; credencial: string } | null;
  }) {
    const ajustes = useAjustes();
    ajustes.setNombre(opts.nombre.trim());
    if (opts.bloqueo) {
      await configurarBloqueo(opts.bloqueo.tipo, opts.bloqueo.credencial);
    }
    ajustes.marcarConfigurado();
    necesitaOnboarding.value = false;
    desbloqueado.value = true;
  }

  // ── 9. Data import / Importación de datos ───────────────────────────────────
  // EN: Imports data from a backup. Validates the SHAPE before hydrating: a
  //     tampered or foreign-app backup would inject garbage (NaN in KPIs ->
  //     corrupt blob). Then hydrates and PERSISTS with a guaranteed await,
  //     without relying on the autosave watcher being active yet. Throws if the
  //     backup is invalid.
  // ES: Importa datos de una copia. VALIDA la FORMA antes de hidratar: una copia
  //     manipulada o de otra app metería basura (NaN en KPIs -> blob corrupto).
  //     Luego hidrata y PERSISTE con un await garantizado, sin depender de que
  //     el watch automático ya esté activo. Lanza si la copia no es válida.
  async function importarDatos(datos: unknown) {
    if (!esDatosValidos(datos)) throw new Error("copia-invalida");
    const f = useFinanzas();
    f.hidratar(datos);
    await almacen.guardar(f.snapshot());
  }

  // ── 10. Public API / API pública ────────────────────────────────────────────
  // EN: Reactive flags + actions exposed to components. Internal helpers
  //     (activarGuardado, cargarEHidratar, cargarSeguro) stay private.
  // ES: Flags reactivos + acciones expuestas a los componentes. Los ayudantes
  //     internos (activarGuardado, cargarEHidratar, cargarSeguro) quedan
  //     privados.
  return {
    desbloqueado,
    necesitaOnboarding,
    error,
    arrancar,
    desbloquear,
    configurarBloqueo,
    quitarBloqueo,
    cambiarCredencial,
    completarOnboarding,
    importarDatos,
  };
});
