/* =============================================================================
 * ajustes.ts — User settings store (theme/lock/name/currency/language) / Store de ajustes
 * -----------------------------------------------------------------------------
 * EN: Pinia store for non-sensitive preferences: theme, lock configuration,
 *     user name, currency, UI language and whether onboarding is done. Persists
 *     to localStorage IN PLAIN TEXT on purpose — none of this is sensitive (the
 *     actual financial data lives encrypted elsewhere, see sesion.ts/almacen).
 * ES: Store de Pinia para preferencias NO sensibles: tema, configuración del
 *     bloqueo, nombre del usuario, moneda, idioma de la UI y si ya pasó por la
 *     bienvenida. Persiste en localStorage EN CLARO a propósito — nada de esto
 *     es sensible (los datos financieros reales viven cifrados aparte, ver
 *     sesion.ts/almacen).
 *
 * INDEX / ÍNDICE:
 *   1. Imports / Importaciones
 *   2. Public types / Tipos públicos
 *   3. Persistence shape & defaults / Forma persistida y valores por defecto
 *   4. Language detection / Detección de idioma
 *   5. Load from storage / Carga desde almacenamiento
 *   6. Store definition & reactive state / Definición del store y estado reactivo
 *   7. Theme / Tema
 *   8. Setters (lock/name/currency/language/configured) / Setters (bloqueo/nombre/moneda/idioma/configurado)
 *   9. Persistence & side-effect watchers / Watchers de persistencia y efectos
 *  10. Public API / API pública
 * ===========================================================================*/

// ── 1. Imports / Importaciones ───────────────────────────────────────────────
// EN: Pinia store factory, Vue reactivity, and the format helpers that keep the
//     amount formatter and date locale in sync with the saved preferences.
// ES: Fábrica de stores de Pinia, reactividad de Vue y los ayudantes de formato
//     que mantienen el formateador de importes y el locale de fechas en sync
//     con las preferencias guardadas.
import { defineStore } from "pinia";
import { ref, watch } from "vue";
// EN: Sync the amount formatter with the saved currency. / ES: Sincroniza el formateador de importes con la moneda guardada.
import { setMoneda as setMonedaFormat, setLocaleFecha } from "../utils/format";

// ── 2. Public types / Tipos públicos ─────────────────────────────────────────
// EN: String-literal unions for the constrained settings, reused across stores
//     and components for type-safe option handling.
// ES: Uniones de literales string para los ajustes acotados, reutilizadas en
//     stores y componentes para manejar opciones con seguridad de tipos.
export type Tema = "oscuro" | "claro";
export type TipoBloqueo = "pin" | "password";
export type Idioma = "es" | "en";

// EN: localStorage key under which all settings are stored as one JSON blob.
// ES: Clave de localStorage bajo la que se guardan todos los ajustes como un
//     único blob JSON.
const CLAVE = "bolsillo.ajustes";

// ── 3. Persistence shape & defaults / Forma persistida y valores por defecto ──
// EN: Exact shape written to localStorage. Keeping it explicit lets the loader
//     merge new fields into older saved settings without breaking.
// ES: Forma exacta que se escribe en localStorage. Mantenerla explícita permite
//     al cargador fusionar campos nuevos en ajustes antiguos sin romper.
interface AjustesGuardados {
  tema: Tema;
  bloqueoActivo: boolean;
  bloqueoTipo: TipoBloqueo | null;
  nombre: string;
  moneda: string; // EN: ISO currency code (EUR, USD, GBP...) / ES: código ISO de la moneda elegida (EUR, USD, GBP...)
  idioma: Idioma; // EN: UI language (es / en) / ES: idioma de la interfaz (es / en)
  configurado: boolean; // EN: true once onboarding is complete / ES: true tras completar la bienvenida
}

// EN: Baseline used on first run and as a merge base for legacy saved data.
// ES: Base usada en el primer arranque y como base de fusión para datos
//     guardados antiguos.
const POR_DEFECTO: AjustesGuardados = {
  tema: "oscuro",
  bloqueoActivo: false,
  bloqueoTipo: null,
  nombre: "",
  moneda: "EUR",
  idioma: "es",
  configurado: false,
};

// ── 4. Language detection / Detección de idioma ───────────────────────────────
// EN: Detects the OS language (Windows) through the webview. navigator.language
//     returns the OS locale ("es-ES", "en-US"...). If it is Spanish we keep
//     "es"; any other language boots in English. Falls back to "es" on error.
// ES: Detecta el idioma del SO (Windows) a través del webview.
//     navigator.language devuelve el locale del SO ("es-ES", "en-US"...). Si es
//     español lo dejamos en "es"; cualquier otro idioma arranca en inglés.
//     Recurre a "es" si algo falla.
function detectarIdioma(): Idioma {
  try {
    const lang = (navigator.language || "es").toLowerCase();
    return lang.startsWith("es") ? "es" : "en";
  } catch {
    return "es";
  }
}

// ── 5. Load from storage / Carga desde almacenamiento ─────────────────────────
// EN: Reads the saved settings. Spreading over POR_DEFECTO backfills any fields
//     missing in older saved data. On corrupt/absent data, returns defaults; on
//     a true first run (nothing stored) it picks the language from the OS.
// ES: Lee los ajustes guardados. El spread sobre POR_DEFECTO rellena los campos
//     que falten en datos antiguos. Si el dato está corrupto/ausente devuelve
//     los valores por defecto; en un primer arranque real (sin nada guardado)
//     elige el idioma según el SO.
function cargar(): AjustesGuardados {
  try {
    const c = localStorage.getItem(CLAVE);
    // EN: Spread with POR_DEFECTO backfills new fields in older settings. / ES: El spread con POR_DEFECTO rellena campos nuevos en ajustes antiguos.
    if (c) return { ...POR_DEFECTO, ...JSON.parse(c) };
  } catch {
    /* EN: corrupt -> default values / ES: corrupto -> valores por defecto */
  }
  // EN: First run (no saved settings): language per OS. / ES: Primer arranque (sin ajustes guardados): idioma según el SO.
  return { ...POR_DEFECTO, idioma: detectarIdioma() };
}

// ── 6. Store definition & reactive state / Definición del store y estado reactivo ─
// EN: Each preference becomes its own reactive ref, initialised from the loaded
//     settings, so components can bind to them individually.
// ES: Cada preferencia se convierte en su propio ref reactivo, inicializado
//     desde los ajustes cargados, para que los componentes enlacen con cada uno
//     por separado.
export const useAjustes = defineStore("ajustes", () => {
  const inicial = cargar();
  const tema = ref<Tema>(inicial.tema);
  const bloqueoActivo = ref<boolean>(inicial.bloqueoActivo);
  const bloqueoTipo = ref<TipoBloqueo | null>(inicial.bloqueoTipo);
  const nombre = ref<string>(inicial.nombre);
  const moneda = ref<string>(inicial.moneda);
  const idioma = ref<Idioma>(inicial.idioma);
  const configurado = ref<boolean>(inicial.configurado);

  // ── 7. Theme / Tema ─────────────────────────────────────────────────────────
  // EN: Applies the theme to the document by toggling the class the CSS uses to
  //     invert colors. Called on boot and on every theme change.
  // ES: Aplica el tema al documento alternando la clase que el CSS usa para
  //     invertir los colores. Se llama al arrancar y en cada cambio de tema.
  function aplicarTema() {
    document.documentElement.classList.toggle("tema-claro", tema.value === "claro");
  }

  // ── 8. Setters (lock/name/currency/language/configured) / Setters (bloqueo/nombre/moneda/idioma/configurado) ─
  // EN: Sets the theme explicitly. / ES: Fija el tema explícitamente.
  function setTema(t: Tema) {
    tema.value = t;
  }
  // EN: Flips between dark and light theme. / ES: Alterna entre tema oscuro y claro.
  function toggleTema() {
    tema.value = tema.value === "oscuro" ? "claro" : "oscuro";
  }
  // EN: Sets whether the lock is active and its type (pin/password or null).
  // ES: Fija si el bloqueo está activo y su tipo (pin/password o null).
  function setBloqueo(activo: boolean, tipo: TipoBloqueo | null) {
    bloqueoActivo.value = activo;
    bloqueoTipo.value = tipo;
  }
  // EN: Stores the user's display name. / ES: Guarda el nombre mostrado del usuario.
  function setNombre(n: string) {
    nombre.value = n;
  }
  // EN: Stores the ISO currency code. / ES: Guarda el código ISO de la moneda.
  function setMoneda(c: string) {
    moneda.value = c;
  }
  // EN: Stores the UI language. / ES: Guarda el idioma de la interfaz.
  function setIdioma(i: Idioma) {
    idioma.value = i;
  }
  // EN: Marks onboarding as completed. / ES: Marca la bienvenida como completada.
  function marcarConfigurado() {
    configurado.value = true;
  }

  // ── 9. Persistence & side-effect watchers / Watchers de persistencia y efectos ─
  // EN: Persists all settings to localStorage and re-applies the theme on ANY
  //     change. immediate: true also runs it once at startup, so the persisted
  //     theme is applied even if nothing changes this session.
  // ES: Persiste todos los ajustes en localStorage y re-aplica el tema ante
  //     CUALQUIER cambio. immediate: true lo ejecuta también una vez al
  //     arrancar, así el tema persistido se aplica aunque nada cambie en esta
  //     sesión.
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

  // EN: Keeps the amount formatter in sync with the saved currency.
  //     immediate: true -> applies the persisted currency at boot, not only on change.
  // ES: Sincroniza el formateador de importes con la moneda guardada.
  //     immediate: true -> al arrancar aplica la moneda persistida, no solo al cambiarla.
  watch(moneda, (m) => setMonedaFormat(m), { immediate: true });

  // EN: Keeps the date locale in sync with the chosen language (es-ES / en-US).
  // ES: Sincroniza el locale de fechas con el idioma elegido (es-ES / en-US).
  watch(idioma, (i) => setLocaleFecha(i === "en" ? "en-US" : "es-ES"), { immediate: true });

  // ── 10. Public API / API pública ─────────────────────────────────────────────
  // EN: Reactive state + actions exposed to components. The loader, defaults and
  //     detection helpers stay private to the module.
  // ES: Estado reactivo + acciones expuestas a los componentes. El cargador, los
  //     valores por defecto y los ayudantes de detección quedan privados al
  //     módulo.
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
