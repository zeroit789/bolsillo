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
  return MAPA_COLOR.get(nombre) ?? COLOR_GRUPO.Otros;
}

// Categorías agrupadas (para selects con <optgroup>).
export function categoriasPorGrupo(): { grupo: string; items: string[] }[] {
  const mapa = new Map<string, string[]>();
  for (const c of CATEGORIAS) {
    if (!mapa.has(c.grupo)) mapa.set(c.grupo, []);
    mapa.get(c.grupo)!.push(c.nombre);
  }
  return [...mapa.entries()].map(([grupo, items]) => ({ grupo, items }));
}
