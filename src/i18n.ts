/* =============================================================================
 * i18n.ts — Sistema i18n propio, ligero y reactivo / Lightweight reactive i18n
 * -----------------------------------------------------------------------------
 * ES: Sistema de traducción propio, ligero y reactivo (ES/EN). Cada componente
 *     declara sus propios textos y recibe una función `t(clave)` que devuelve el
 *     texto en el idioma activo (leído de la store de ajustes). Como lee
 *     `ajustes.idioma` (un ref de Vue), al cambiar el idioma la UI se
 *     re-renderiza sola. Sin librerías externas, sin archivos centrales de
 *     traducción y sin colisiones de claves entre componentes.
 * EN: Tiny in-house internationalization system (ES/EN). Each component declares
 *     its own texts and gets back a `t(key)` function that returns the text in
 *     the active language (read from the settings store). Because it reads
 *     `ajustes.idioma` (a Vue ref), changing the language re-renders the UI on
 *     its own. No external libraries, no central translation files, no key
 *     collisions across components.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones / Imports
 *   2. Tipo del diccionario / Dictionary type
 *   3. Fábrica crearT / crearT factory
 * ===========================================================================*/

// ── 1. Importaciones / Imports ───────────────────────────────────────────────
// ES: Store de ajustes de Pinia. Solo leemos de ella `ajustes.idioma` (ref reactivo).
// EN: Pinia settings store. We only read `ajustes.idioma` from it (a reactive ref).
import { useAjustes } from "./stores/ajustes";

// ── 2. Tipo del diccionario / Dictionary type ────────────────────────────────
// ES: Un diccionario de textos: clave -> { es, en }. Cada clave mapea sus dos traducciones.
// EN: A text dictionary: key -> { es, en }. Each key maps to its two translations.
export type Mensajes = Record<string, { es: string; en: string }>;

// ── 3. Fábrica crearT / crearT factory ───────────────────────────────────────
// ES: Crea la función de traducción de un componente a partir de sus propios mensajes.
// EN: Builds the translation function for a component from its own messages.
//
// ES: Uso:   const t = crearT({ titulo: { es: "Resumen", en: "Summary" } });
//            <h1>{{ t("titulo") }}</h1>
// EN: Usage: const t = crearT({ titulo: { es: "Resumen", en: "Summary" } });
//            <h1>{{ t("titulo") }}</h1>
//
// ES: Cómo se mantiene reactiva — `useAjustes()` se resuelve una sola vez, pero
//     la `t()` devuelta lee `ajustes.idioma` en cada llamada. Como las plantillas
//     que invocan `t(...)` registran ese ref como dependencia, cambiar el idioma
//     dispara un re-render y `t()` devuelve el texto del nuevo idioma solo.
// EN: How it stays reactive — `useAjustes()` is resolved once, but the returned
//     `t()` reads `ajustes.idioma` on every call. Since templates that call
//     `t(...)` track that ref as a dependency, switching the language triggers a
//     re-render and `t()` returns the new-language text automatically.
export function crearT(msgs: Mensajes) {
  // ES: Resolvemos la store de ajustes una sola vez al ejecutar la fábrica.
  // EN: Resolve the settings store once when the factory runs.
  const ajustes = useAjustes();

  // ES: Devolvemos el traductor del componente. Se llama como t("clave") en plantillas.
  // EN: Return the per-component translator. Called as t("clave") in templates.
  return (clave: string): string => {
    // ES: Buscamos la entrada de esta clave en el diccionario.
    // EN: Look up the entry for this key in the dictionary.
    const m = msgs[clave];

    // ES: Respaldo si falta la clave — devolvemos la propia clave para que el hueco se vea en la UI.
    // EN: Missing key fallback — return the key itself so the gap is visible in the UI.
    if (!m) return clave;

    // ES: Elegimos la traducción según el idioma activo: "en" -> inglés, si no español.
    // EN: Pick the translation by active language: "en" -> English, otherwise Spanish.
    return ajustes.idioma === "en" ? m.en : m.es;
  };
}
