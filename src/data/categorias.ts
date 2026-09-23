/* =============================================================================
 * categorias.ts — Catálogo de categorías y personalizadas / Categories catalog & custom ones
 * -----------------------------------------------------------------------------
 * ES: Catálogo central de categorías de gasto/ingreso. Las categorías van
 *     agrupadas y cada grupo tiene un color (usado por los chips y la gráfica de
 *     reparto). También gestiona las categorías personalizadas creadas por el
 *     usuario, guardadas en localStorage.
 * EN: Central catalog of expense/income categories. Categories are grouped, each
 *     group has a color (used by chips and the distribution chart). Also handles
 *     user-created custom categories persisted in localStorage.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Tipo Categoria / Category type
 *   2. Colores por grupo / Group colors
 *   3. Catálogo de categorías base / Base categories catalog
 *   4. Derivados (nombres y color) / Derived helpers (names & color lookup)
 *   5. Categorías personalizadas (localStorage) / Custom categories (localStorage)
 *   6. Categorías agrupadas para selects / Grouped categories for selects
 * ===========================================================================*/

// ── 1. Tipo Categoria / Category type ────────────────────────────────────────
// ES: Forma de una entrada de categoría: su nombre, el grupo al que pertenece y
//     el color del grupo (hex) reutilizado en los elementos visuales.
// EN: Shape of a single category entry: its name, the group it belongs to, and
//     the group color (hex) reused for visual elements.
export interface Categoria {
  nombre: string;
  grupo: string;
  color: string; // ES: color del grupo (hex) / EN: group color (hex)
}

// ── 2. Colores por grupo / Group colors ──────────────────────────────────────
// ES: Un color hex por grupo, usado para los chips y la gráfica de reparto.
// EN: One hex color per group, used for chips and the distribution chart.
export const COLOR_GRUPO: Record<string, string> = {
  Vivienda: "#7c6af7",
  Alimentación: "#52d67a",
  Transporte: "#4fc4cf",
  Salud: "#f76a6a",
  Ocio: "#f7c948",
  Compras: "#ef8fd0",
  Finanzas: "#6aa6f7",
  Personal: "#c08cf9",
  Ingresos: "#52d67a",
  Otros: "#9aa0ac",
  // ES: color del grupo de categorías creadas por el usuario
  // EN: color of the group of categories created by the user
  Personalizadas: "#b06af7",
};

// ── 3. Catálogo de categorías base / Base categories catalog ──────────────────
// ES: Lista completa de categorías integradas. Cada bloque mapea una lista de
//     nombres a un grupo + su color. Lista amplia para cubrir la mayoría de
//     casos de gasto/ingreso.
// EN: Full list of built-in categories. Each block maps a list of names to one
//     group + its color. Wide list to cover most expense/income cases.
export const CATEGORIAS: Categoria[] = [
  // ES: Vivienda / EN: Housing
  ...["Alquiler", "Hipoteca", "Comunidad", "Luz", "Agua", "Gas", "Internet", "Telefonía", "Mantenimiento hogar"].map(
    (n) => ({ nombre: n, grupo: "Vivienda", color: COLOR_GRUPO.Vivienda })
  ),
  // ES: Alimentación / EN: Food
  ...["Supermercado", "Restaurantes", "Cafetería", "Comida a domicilio"].map((n) => ({
    nombre: n,
    grupo: "Alimentación",
    color: COLOR_GRUPO.Alimentación,
  })),
  // ES: Transporte / EN: Transport
  ...["Gasolina", "Transporte público", "Coche", "Moto", "Parking", "Peajes", "Taxi/VTC", "Mantenimiento vehículo"].map(
    (n) => ({ nombre: n, grupo: "Transporte", color: COLOR_GRUPO.Transporte })
  ),
  // ES: Salud / EN: Health
  ...["Farmacia", "Médico", "Dentista", "Gimnasio", "Seguro de salud"].map((n) => ({
    nombre: n,
    grupo: "Salud",
    color: COLOR_GRUPO.Salud,
  })),
  // ES: Ocio / EN: Leisure
  ...["Suscripciones", "Cine/Teatro", "Viajes", "Hobbies", "Videojuegos", "Eventos", "Deporte"].map((n) => ({
    nombre: n,
    grupo: "Ocio",
    color: COLOR_GRUPO.Ocio,
  })),
  // ES: Compras / EN: Shopping
  ...["Ropa", "Electrónica", "Hogar", "Regalos", "Belleza", "Mascotas", "Libros"].map((n) => ({
    nombre: n,
    grupo: "Compras",
    color: COLOR_GRUPO.Compras,
  })),
  // ES: Finanzas / EN: Finance
  ...["Ahorro", "Inversión", "Deudas", "Comisiones", "Impuestos", "Seguros"].map((n) => ({
    nombre: n,
    grupo: "Finanzas",
    color: COLOR_GRUPO.Finanzas,
  })),
  // ES: Personal / EN: Personal
  ...["Educación", "Donaciones", "Familia", "Trabajo"].map((n) => ({
    nombre: n,
    grupo: "Personal",
    color: COLOR_GRUPO.Personal,
  })),
  // ES: Ingresos / EN: Income
  ...["Nómina", "Ingreso extra", "Ventas", "Reembolsos", "Intereses", "Alquileres"].map((n) => ({
    nombre: n,
    grupo: "Ingresos",
    color: COLOR_GRUPO.Ingresos,
  })),
  // ES: Otros (categoría comodín única) / EN: Other (single catch-all category)
  { nombre: "Otros", grupo: "Otros", color: COLOR_GRUPO.Otros },
];

// ── 4. Derivados (nombres y color) / Derived helpers (names & color lookup) ───
// ES: Solo los nombres, útil para selects/desplegables rápidos.
// EN: Just the names, handy for quick selects/dropdowns.
export const NOMBRES_CATEGORIA = CATEGORIAS.map((c) => c.nombre);

// ES: mapa nombre -> color, construido una vez desde el catálogo base para
//     búsquedas rápidas.
// EN: name -> color map, built once from the base catalog for fast lookups.
const MAPA_COLOR = new Map(CATEGORIAS.map((c) => [c.nombre, c.color]));

// ES: Devuelve el color para un nombre de categoría. Recurre al color del grupo
//     personalizadas, y luego a gris si el nombre es desconocido.
// EN: Returns the color for a category name. Falls back to the custom group
//     color, then to gray if the name is unknown.
export function colorCategoria(nombre: string): string {
  // ES: Primero busca en las categorías base. / EN: First look it up in the base categories
  const colorBase = MAPA_COLOR.get(nombre);
  if (colorBase) return colorBase;
  // ES: Si no está en las base pero es una personalizada -> color del grupo "Personalizadas".
  // EN: If not in base but it is a custom one -> "Personalizadas" group color.
  if (categoriasCustom().includes(nombre)) return COLOR_GRUPO.Personalizadas;
  // ES: Respaldo gris si no existe en ningún sitio. / EN: Gray fallback when it does not exist anywhere
  return COLOR_GRUPO.Otros;
}

// ── 5. Categorías personalizadas (localStorage) / Custom categories (localStorage) ──
// ES: Categorías creadas por el usuario, guardadas en localStorage como un array
//     de strings (solo los nombres).
// EN: User-created categories, stored in localStorage as an array of strings
//     (only the names).
const CLAVE_CUSTOM = "bolsillo.categorias-custom";

// ES: Lee las categorías personalizadas desde localStorage. Devuelve [] si no
//     hay nada o si el contenido está corrupto.
// EN: Reads the custom categories from localStorage. Returns [] if there is
//     nothing or if the stored content is corrupt.
export function categoriasCustom(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE_CUSTOM);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    // ES: Solo aceptamos un array de strings; cualquier otra forma -> [].
    // EN: Only accept an array of strings; any other shape -> [].
    if (!Array.isArray(datos)) return [];
    return datos.filter((x): x is string => typeof x === "string");
  } catch {
    // ES: JSON inválido u otro error de lectura -> lista vacía.
    // EN: Invalid JSON or other read error -> empty list.
    return [];
  }
}

// ES: Guarda el array de personalizadas en localStorage (uso interno).
// EN: Saves the custom array into localStorage (internal use only).
function guardarCustom(lista: string[]): void {
  localStorage.setItem(CLAVE_CUSTOM, JSON.stringify(lista));
}

// ES: Añade una categoría personalizada. La normaliza con trim, ignora vacíos y
//     duplicados (contra base y existentes).
// EN: Adds a custom category. Trims it, ignores empties and duplicates (checked
//     against both base and existing custom ones).
export function agregarCategoriaCustom(nombre: string): void {
  const limpio = nombre.trim();
  if (!limpio) return; // ES: ignora vacíos / EN: ignore empties
  // ES: No permitir duplicar una categoría base ni una personalizada ya existente.
  // EN: Do not allow duplicating a base category nor an existing custom one.
  if (NOMBRES_CATEGORIA.includes(limpio)) return;
  const actuales = categoriasCustom();
  if (actuales.includes(limpio)) return;
  // ES: Guarda con la nueva al final. / EN: Save with the new one appended at the end
  guardarCustom([...actuales, limpio]);
}

// ES: Elimina una categoría personalizada por nombre exacto.
// EN: Removes a custom category by exact name.
export function eliminarCategoriaCustom(nombre: string): void {
  const actuales = categoriasCustom();
  guardarCustom(actuales.filter((c) => c !== nombre));
}

// ES: Reemplaza toda la lista de personalizadas (al restaurar una copia de seguridad).
// EN: Replaces the whole custom list (used when restoring a backup).
export function setCategoriasCustom(lista: string[]): void {
  if (!Array.isArray(lista)) return;
  guardarCustom(lista.filter((x): x is string => typeof x === "string"));
}

// ── 6. Categorías agrupadas para selects / Grouped categories for selects ─────
// ES: Categorías agrupadas (para selects con <optgroup>). Lee las personalizadas
//     en cada llamada (localStorage no es reactivo) y, si hay alguna, añade un
//     grupo "Personalizadas" al final.
// EN: Categories grouped for <optgroup> selects. Reads custom ones on every
//     call (localStorage is not reactive) and, if any exist, appends a
//     "Personalizadas" group at the end.
export function categoriasPorGrupo(): { grupo: string; items: string[] }[] {
  const mapa = new Map<string, string[]>();
  for (const c of CATEGORIAS) {
    if (!mapa.has(c.grupo)) mapa.set(c.grupo, []);
    mapa.get(c.grupo)!.push(c.nombre);
  }
  const grupos = [...mapa.entries()].map(([grupo, items]) => ({ grupo, items }));
  // ES: Añade el grupo de personalizadas al final solo si el usuario tiene alguna.
  // EN: Append the custom group at the end only if the user has any.
  const custom = categoriasCustom();
  if (custom.length > 0) {
    grupos.push({ grupo: "Personalizadas", items: custom });
  }
  return grupos;
}
