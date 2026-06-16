/* =============================================================================
 * i18n.ts — Lightweight reactive i18n / Sistema i18n propio, ligero y reactivo
 * -----------------------------------------------------------------------------
 * EN: Tiny in-house internationalization system (ES/EN). Each component declares
 *     its own texts and gets back a `t(key)` function that returns the text in
 *     the active language (read from the settings store). Because it reads
 *     `ajustes.idioma` (a Vue ref), changing the language re-renders the UI on
 *     its own. No external libraries, no central translation files, no key
 *     collisions across components.
 * ES: Sistema de traducción propio, ligero y reactivo (ES/EN). Cada componente
 *     declara sus propios textos y recibe una función `t(clave)` que devuelve el
 *     texto en el idioma activo (leído de la store de ajustes). Como lee
 *     `ajustes.idioma` (un ref de Vue), al cambiar el idioma la UI se
 *     re-renderiza sola. Sin librerías externas, sin archivos centrales de
 *     traducción y sin colisiones de claves entre componentes.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports / Importaciones
 *   2. Dictionary type / Tipo del diccionario
 *   3. crearT factory / Fábrica crearT
 * ===========================================================================*/

// ── 1. Imports / Importaciones ───────────────────────────────────────────────
// EN: Pinia settings store. We only read `ajustes.idioma` from it (a reactive ref).
// ES: Store de ajustes de Pinia. Solo leemos de ella `ajustes.idioma` (ref reactivo).
import { useAjustes } from "./stores/ajustes";

// ── 2. Dictionary type / Tipo del diccionario ────────────────────────────────
// EN: A text dictionary: key -> { es, en }. Each key maps to its two translations.
// ES: Un diccionario de textos: clave -> { es, en }. Cada clave mapea sus dos traducciones.
export type Mensajes = Record<string, { es: string; en: string }>;

// ── 3. crearT factory / Fábrica crearT ───────────────────────────────────────
// EN: Builds the translation function for a component from its own messages.
// ES: Crea la función de traducción de un componente a partir de sus propios mensajes.
//
// EN: Usage: const t = crearT({ titulo: { es: "Resumen", en: "Summary" } });
//            <h1>{{ t("titulo") }}</h1>
// ES: Uso:   const t = crearT({ titulo: { es: "Resumen", en: "Summary" } });
//            <h1>{{ t("titulo") }}</h1>
//
// EN: How it stays reactive — `useAjustes()` is resolved once, but the returned
//     `t()` reads `ajustes.idioma` on every call. Since templates that call
//     `t(...)` track that ref as a dependency, switching the language triggers a
//     re-render and `t()` returns the new-language text automatically.
// ES: Cómo se mantiene reactiva — `useAjustes()` se resuelve una sola vez, pero
//     la `t()` devuelta lee `ajustes.idioma` en cada llamada. Como las plantillas
//     que invocan `t(...)` registran ese ref como dependencia, cambiar el idioma
//     dispara un re-render y `t()` devuelve el texto del nuevo idioma solo.
export function crearT(msgs: Mensajes) {
  // EN: Resolve the settings store once when the factory runs.
  // ES: Resolvemos la store de ajustes una sola vez al ejecutar la fábrica.
  const ajustes = useAjustes();

  // EN: Return the per-component translator. Called as t("clave") in templates.
  // ES: Devolvemos el traductor del componente. Se llama como t("clave") en plantillas.
  return (clave: string): string => {
    // EN: Look up the entry for this key in the dictionary.
    // ES: Buscamos la entrada de esta clave en el diccionario.
    const m = msgs[clave];

    // EN: Missing key fallback — return the key itself so the gap is visible in the UI.
    // ES: Respaldo si falta la clave — devolvemos la propia clave para que el hueco se vea en la UI.
    if (!m) return clave;

    // EN: Pick the translation by active language: "en" -> English, otherwise Spanish.
    // ES: Elegimos la traducción según el idioma activo: "en" -> inglés, si no español.
    return ajustes.idioma === "en" ? m.en : m.es;
  };
}
