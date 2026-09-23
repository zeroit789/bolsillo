/* =============================================================================
 * ajustes.ts — Store de ajustes / User settings store (theme/lock/name/currency/language)
 * -----------------------------------------------------------------------------
 * ES: Store de Pinia para preferencias NO sensibles: tema, configuración del
 *     bloqueo, nombre del usuario, moneda, idioma de la UI y si ya pasó por la
 *     bienvenida. Persiste en localStorage EN CLARO a propósito — nada de esto
 *     es sensible (los datos financieros reales viven cifrados aparte, ver
 *     sesion.ts/almacen).
 * EN: Pinia store for non-sensitive preferences: theme, lock configuration,
 *     user name, currency, UI language and whether onboarding is done. Persists
 *     to localStorage IN PLAIN TEXT on purpose — none of this is sensitive (the
 *     actual financial data lives encrypted elsewhere, see sesion.ts/almacen).
 *
 * ÍNDICE / INDEX:
 *   1. Importaciones / Imports
 *   2. Tipos públicos / Public types
 *   3. Forma persistida y valores por defecto / Persistence shape & defaults
 *   4. Detección de idioma / Language detection
 *   5. Carga desde almacenamiento / Load from storage
 *   6. Definición del store y estado reactivo / Store definition & reactive state
 *   7. Tema / Theme
 *   8. Setters (bloqueo/nombre/moneda/idioma/configurado) / Setters (lock/name/currency/language/configured)
 *   9. Watchers de persistencia y efectos / Persistence & side-effect watchers
 *  10. API pública / Public API
 * ===========================================================================*/

// ── 1. Importaciones / Imports ───────────────────────────────────────────────
// ES: Fábrica de stores de Pinia, reactividad de Vue y los ayudantes de formato
//     que mantienen el formateador de importes y el locale de fechas en sync
//     con las preferencias guardadas.
// EN: Pinia store factory, Vue reactivity, and the format helpers that keep the
//     amount formatter and date locale in sync with the saved preferences.
import { defineStore } from "pinia";
import { ref, watch } from "vue";
// ES: Sincroniza el formateador de importes con la moneda guardada. / EN: Sync the amount formatter with the saved currency.
import { setMoneda as setMonedaFormat, setLocaleFecha } from "../utils/format";

// ── 2. Tipos públicos / Public types ─────────────────────────────────────────
// ES: Uniones de literales string para los ajustes acotados, reutilizadas en
//     stores y componentes para manejar opciones con seguridad de tipos.
// EN: String-literal unions for the constrained settings, reused across stores
//     and components for type-safe option handling.
export type Tema = "oscuro" | "claro";
export type TipoBloqueo = "pin" | "password";
export type Idioma = "es" | "en";

// ES: Clave de localStorage bajo la que se guardan todos los ajustes como un
//     único blob JSON.
// EN: localStorage key under which all settings are stored as one JSON blob.
const CLAVE = "bolsillo.ajustes";

// ── 3. Forma persistida y valores por defecto / Persistence shape & defaults ──
// ES: Forma exacta que se escribe en localStorage. Mantenerla explícita permite
//     al cargador fusionar campos nuevos en ajustes antiguos sin romper.
// EN: Exact shape written to localStorage. Keeping it explicit lets the loader
//     merge new fields into older saved settings without breaking.
interface AjustesGuardados {
  tema: Tema;
  bloqueoActivo: boolean;
  bloqueoTipo: TipoBloqueo | null;
  nombre: string;
  moneda: string; // ES: código ISO de la moneda elegida (EUR, USD, GBP...) / EN: ISO currency code (EUR, USD, GBP...)
  idioma: Idioma; // ES: idioma de la interfaz (es / en) / EN: UI language (es / en)
  configurado: boolean; // ES: true tras completar la bienvenida / EN: true once onboarding is complete
}

// ES: Base usada en el primer arranque y como base de fusión para datos
//     guardados antiguos.
// EN: Baseline used on first run and as a merge base for legacy saved data.
const POR_DEFECTO: AjustesGuardados = {
  tema: "oscuro",
  bloqueoActivo: false,
  bloqueoTipo: null,
  nombre: "",
  moneda: "EUR",
  idioma: "es",
  configurado: false,
};

// ── 4. Detección de idioma / Language detection ───────────────────────────────
// ES: Detecta el idioma del SO (Windows) a través del webview.
//     navigator.language devuelve el locale del SO ("es-ES", "en-US"...). Si es
//     español lo dejamos en "es"; cualquier otro idioma arranca en inglés.
//     Recurre a "es" si algo falla.
// EN: Detects the OS language (Windows) through the webview. navigator.language
//     returns the OS locale ("es-ES", "en-US"...). If it is Spanish we keep
//     "es"; any other language boots in English. Falls back to "es" on error.
function detectarIdioma(): Idioma {
  try {
    const lang = (navigator.language || "es").toLowerCase();
    return lang.startsWith("es") ? "es" : "en";
  } catch {
    return "es";
  }
}

// ── 5. Carga desde almacenamiento / Load from storage ─────────────────────────
// ES: Lee los ajustes guardados. El spread sobre POR_DEFECTO rellena los campos
//     que falten en datos antiguos. Si el dato está corrupto/ausente devuelve
//     los valores por defecto; en un primer arranque real (sin nada guardado)
//     elige el idioma según el SO.
// EN: Reads the saved settings. Spreading over POR_DEFECTO backfills any fields
//     missing in older saved data. On corrupt/absent data, returns defaults; on
//     a true first run (nothing stored) it picks the language from the OS.
function cargar(): AjustesGuardados {
  try {
    const c = localStorage.getItem(CLAVE);
    // ES: El spread con POR_DEFECTO rellena campos nuevos en ajustes antiguos. / EN: Spread with POR_DEFECTO backfills new fields in older settings.
    if (c) return { ...POR_DEFECTO, ...JSON.parse(c) };
  } catch {
    /* ES: corrupto -> valores por defecto / EN: corrupt -> default values */
  }
  // ES: Primer arranque (sin ajustes guardados): idioma según el SO. / EN: First run (no saved settings): language per OS.
  return { ...POR_DEFECTO, idioma: detectarIdioma() };
}

// ── 6. Definición del store y estado reactivo / Store definition & reactive state ─
// ES: Cada preferencia se convierte en su propio ref reactivo, inicializado
//     desde los ajustes cargados, para que los componentes enlacen con cada uno
//     por separado.
// EN: Each preference becomes its own reactive ref, initialised from the loaded
//     settings, so components can bind to them individually.
export const useAjustes = defineStore("ajustes", () => {
  const inicial = cargar();
  const tema = ref<Tema>(inicial.tema);
  const bloqueoActivo = ref<boolean>(inicial.bloqueoActivo);
  const bloqueoTipo = ref<TipoBloqueo | null>(inicial.bloqueoTipo);
  const nombre = ref<string>(inicial.nombre);
  const moneda = ref<string>(inicial.moneda);
  const idioma = ref<Idioma>(inicial.idioma);
  const configurado = ref<boolean>(inicial.configurado);

  // ── 7. Tema / Theme ─────────────────────────────────────────────────────────
  // ES: Aplica el tema al documento alternando la clase que el CSS usa para
  //     invertir los colores. Se llama al arrancar y en cada cambio de tema.
  // EN: Applies the theme to the document by toggling the class the CSS uses to
  //     invert colors. Called on boot and on every theme change.
  function aplicarTema() {
    document.documentElement.classList.toggle("tema-claro", tema.value === "claro");
  }

  // ── 8. Setters (bloqueo/nombre/moneda/idioma/configurado) / Setters (lock/name/currency/language/configured) ─
  // ES: Fija el tema explícitamente. / EN: Sets the theme explicitly.
  function setTema(t: Tema) {
    tema.value = t;
  }
  // ES: Alterna entre tema oscuro y claro. / EN: Flips between dark and light theme.
  function toggleTema() {
    tema.value = tema.value === "oscuro" ? "claro" : "oscuro";
  }
  // ES: Fija si el bloqueo está activo y su tipo (pin/password o null).
  // EN: Sets whether the lock is active and its type (pin/password or null).
  function setBloqueo(activo: boolean, tipo: TipoBloqueo | null) {
    bloqueoActivo.value = activo;
    bloqueoTipo.value = tipo;
  }
  // ES: Guarda el nombre mostrado del usuario. / EN: Stores the user's display name.
  function setNombre(n: string) {
    nombre.value = n;
  }
  // ES: Guarda el código ISO de la moneda. / EN: Stores the ISO currency code.
  function setMoneda(c: string) {
    moneda.value = c;
  }
  // ES: Guarda el idioma de la interfaz. / EN: Stores the UI language.
  function setIdioma(i: Idioma) {
    idioma.value = i;
  }
  // ES: Marca la bienvenida como completada. / EN: Marks onboarding as completed.
  function marcarConfigurado() {
    configurado.value = true;
  }

  // ── 9. Watchers de persistencia y efectos / Persistence & side-effect watchers ─
  // ES: Persiste todos los ajustes en localStorage y re-aplica el tema ante
  //     CUALQUIER cambio. immediate: true lo ejecuta también una vez al
  //     arrancar, así el tema persistido se aplica aunque nada cambie en esta
  //     sesión.
  // EN: Persists all settings to localStorage and re-applies the theme on ANY
  //     change. immediate: true also runs it once at startup, so the persisted
  //     theme is applied even if nothing changes this session.
  watch(
    [tema, bloqueoActivo, bloqueoTipo, nombre, moneda, idioma, configurado],
    () => {
      localStorage.setItem(
        CLAVE,
        JSON.stringify({
          tema: tema.value,
          bloqueoActivo: bloqueoActivo.value,
          bloqueoTipo: bloqueoTipo.value,
          nombre: nombre.value,
          moneda: moneda.value,
          idioma: idioma.value,
          configurado: configurado.value,
        })
      );
      aplicarTema();
    },
    { immediate: true }
  );

  // ES: Sincroniza el formateador de importes con la moneda guardada.
  //     immediate: true -> al arrancar aplica la moneda persistida, no solo al cambiarla.
  // EN: Keeps the amount formatter in sync with the saved currency.
  //     immediate: true -> applies the persisted currency at boot, not only on change.
  watch(moneda, (m) => setMonedaFormat(m), { immediate: true });

  // ES: Sincroniza el locale de fechas con el idioma elegido (es-ES / en-US).
  // EN: Keeps the date locale in sync with the chosen language (es-ES / en-US).
  watch(idioma, (i) => setLocaleFecha(i === "en" ? "en-US" : "es-ES"), { immediate: true });

  // ── 10. API pública / Public API ─────────────────────────────────────────────
  // ES: Estado reactivo + acciones expuestas a los componentes. El cargador, los
  //     valores por defecto y los ayudantes de detección quedan privados al
  //     módulo.
  // EN: Reactive state + actions exposed to components. The loader, defaults and
  //     detection helpers stay private to the module.
  return {
    tema,
    bloqueoActivo,
    bloqueoTipo,
    nombre,
    moneda,
    idioma,
    configurado,
    aplicarTema,
    setTema,
    toggleTema,
    setBloqueo,
    setNombre,
    setMoneda,
    setIdioma,
    marcarConfigurado,
  };
});
