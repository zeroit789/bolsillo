/* ===========================================================================
   Sistema de traducción propio, ligero y reactivo (ES/EN).
   Cada componente declara sus propios textos y obtiene una función `t(clave)`
   que devuelve el texto en el idioma activo (de la store de ajustes). Como lee
   `ajustes.idioma` (un ref), al cambiar el idioma la UI se re-renderiza sola.
   No necesita librerías externas ni archivos centrales (sin colisiones).
   =========================================================================== */
import { useAjustes } from "./stores/ajustes";

// Un diccionario de textos: clave -> { es, en }.
export type Mensajes = Record<string, { es: string; en: string }>;

// Crea la función de traducción para un componente, con sus propios mensajes.
// Uso: const t = crearT({ titulo: { es: "Resumen", en: "Summary" } });
//      <h1>{{ t("titulo") }}</h1>
export function crearT(msgs: Mensajes) {
  const ajustes = useAjustes();
  return (clave: string): string => {
    const m = msgs[clave];
    if (!m) return clave; // si falta la clave, devuelve la propia clave (visible)
    return ajustes.idioma === "en" ? m.en : m.es;
  };
}
