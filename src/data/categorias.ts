/* ===========================================================================
   Catálogo de categorías, agrupadas y con color por grupo.
   Lista amplia para cubrir la mayoría de casos de gastos/ingresos.
   =========================================================================== */

export interface Categoria {
  nombre: string;
  grupo: string;
  color: string; // color del grupo (hex)
}

// Color por grupo (para chips y la gráfica de reparto)
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
  Personalizadas: "#b06af7", // color del grupo de categorías creadas por el usuario
};

// Lista completa de categorías.
export const CATEGORIAS: Categoria[] = [
  // Vivienda
  ...["Alquiler", "Hipoteca", "Comunidad", "Luz", "Agua", "Gas", "Internet", "Telefonía", "Mantenimiento hogar"].map(
    (n) => ({ nombre: n, grupo: "Vivienda", color: COLOR_GRUPO.Vivienda })
  ),
  // Alimentación
  ...["Supermercado", "Restaurantes", "Cafetería", "Comida a domicilio"].map((n) => ({
    nombre: n,
    grupo: "Alimentación",
    color: COLOR_GRUPO.Alimentación,
  })),
  // Transporte
  ...["Gasolina", "Transporte público", "Coche", "Moto", "Parking", "Peajes", "Taxi/VTC", "Mantenimiento vehículo"].map(
    (n) => ({ nombre: n, grupo: "Transporte", color: COLOR_GRUPO.Transporte })
  ),
  // Salud
  ...["Farmacia", "Médico", "Dentista", "Gimnasio", "Seguro de salud"].map((n) => ({
    nombre: n,
    grupo: "Salud",
    color: COLOR_GRUPO.Salud,
  })),
  // Ocio
  ...["Suscripciones", "Cine/Teatro", "Viajes", "Hobbies", "Videojuegos", "Eventos", "Deporte"].map((n) => ({
    nombre: n,
    grupo: "Ocio",
    color: COLOR_GRUPO.Ocio,
  })),
  // Compras
  ...["Ropa", "Electrónica", "Hogar", "Regalos", "Belleza", "Mascotas", "Libros"].map((n) => ({
    nombre: n,
    grupo: "Compras",
    color: COLOR_GRUPO.Compras,
  })),
  // Finanzas
  ...["Ahorro", "Inversión", "Deudas", "Comisiones", "Impuestos", "Seguros"].map((n) => ({
    nombre: n,
    grupo: "Finanzas",
    color: COLOR_GRUPO.Finanzas,
  })),
  // Personal
  ...["Educación", "Donaciones", "Familia", "Trabajo"].map((n) => ({
    nombre: n,
    grupo: "Personal",
    color: COLOR_GRUPO.Personal,
  })),
  // Ingresos
  ...["Nómina", "Ingreso extra", "Ventas", "Reembolsos", "Intereses", "Alquileres"].map((n) => ({
    nombre: n,
    grupo: "Ingresos",
    color: COLOR_GRUPO.Ingresos,
  })),
  // Otros
  { nombre: "Otros", grupo: "Otros", color: COLOR_GRUPO.Otros },
];

// Solo los nombres (para selects rápidos).
export const NOMBRES_CATEGORIA = CATEGORIAS.map((c) => c.nombre);

// Mapa nombre -> color, con respaldo gris si no existe.
const MAPA_COLOR = new Map(CATEGORIAS.map((c) => [c.nombre, c.color]));
export function colorCategoria(nombre: string): string {
  // Primero busca en las categorías base.
  const colorBase = MAPA_COLOR.get(nombre);
  if (colorBase) return colorBase;
  // Si no está en las base pero es una personalizada -> color del grupo "Personalizadas".
  if (categoriasCustom().includes(nombre)) return COLOR_GRUPO.Personalizadas;
  // Respaldo gris si no existe en ningún sitio.
  return COLOR_GRUPO.Otros;
}

/* ===========================================================================
   CATEGORÍAS PERSONALIZADAS (las crea el usuario, se guardan en localStorage).
   Clave de almacenamiento: array de strings (solo los nombres).
   =========================================================================== */
const CLAVE_CUSTOM = "bolsillo.categorias-custom";

// Lee las categorías personalizadas desde localStorage.
// Devuelve [] si no hay nada o si el contenido está corrupto.
export function categoriasCustom(): string[] {
  try {
    const crudo = localStorage.getItem(CLAVE_CUSTOM);
    if (!crudo) return [];
    const datos: unknown = JSON.parse(crudo);
    // Solo aceptamos un array de strings; cualquier otra forma -> [].
    if (!Array.isArray(datos)) return [];
    return datos.filter((x): x is string => typeof x === "string");
  } catch {
    // JSON inválido u otro error de lectura -> lista vacía.
    return [];
  }
}

// Guarda el array de personalizadas en localStorage (uso interno).
function guardarCustom(lista: string[]): void {
  localStorage.setItem(CLAVE_CUSTOM, JSON.stringify(lista));
}

// Añade una categoría personalizada.
// Normaliza con trim, ignora vacíos y duplicados (contra base y existentes).
export function agregarCategoriaCustom(nombre: string): void {
  const limpio = nombre.trim();
  if (!limpio) return; // ignora vacíos
  // No permitir duplicar una categoría base ni una personalizada ya existente.
  if (NOMBRES_CATEGORIA.includes(limpio)) return;
  const actuales = categoriasCustom();
  if (actuales.includes(limpio)) return;
  // Guarda con la nueva al final.
  guardarCustom([...actuales, limpio]);
}

// Elimina una categoría personalizada por nombre exacto.
export function eliminarCategoriaCustom(nombre: string): void {
  const actuales = categoriasCustom();
  guardarCustom(actuales.filter((c) => c !== nombre));
}

// Reemplaza toda la lista de personalizadas (al restaurar una copia de seguridad).
export function setCategoriasCustom(lista: string[]): void {
  if (!Array.isArray(lista)) return;
  guardarCustom(lista.filter((x): x is string => typeof x === "string"));
}

// Categorías agrupadas (para selects con <optgroup>).
// Lee las personalizadas en cada llamada (localStorage no es reactivo) y, si
// hay alguna, añade un grupo "Personalizadas" al final.
export function categoriasPorGrupo(): { grupo: string; items: string[] }[] {
  const mapa = new Map<string, string[]>();
  for (const c of CATEGORIAS) {
    if (!mapa.has(c.grupo)) mapa.set(c.grupo, []);
    mapa.get(c.grupo)!.push(c.nombre);
  }
  const grupos = [...mapa.entries()].map(([grupo, items]) => ({ grupo, items }));
  // Añade el grupo de personalizadas al final solo si el usuario tiene alguna.
  const custom = categoriasCustom();
  if (custom.length > 0) {
    grupos.push({ grupo: "Personalizadas", items: custom });
  }
  return grupos;
}
