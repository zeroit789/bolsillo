/* ===========================================================================
   Datos DEMO genéricos para que la app arranque con contenido de ejemplo.
   IMPORTANTE: son datos inventados de muestra, NO pertenecen a nadie real.
   Se generan sobre el mes actual para que el dashboard tenga sentido al abrir.
   =========================================================================== */
import type { Movimiento } from "../types";
import { mesActual } from "../utils/format";

// Genera un id corto y único sin dependencias externas.
function nuevoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Construye los movimientos de ejemplo anclados al mes en curso.
export function movimientosDemo(): Movimiento[] {
  const mes = mesActual(); // "YYYY-MM"
  const f = (dia: number) => `${mes}-${String(dia).padStart(2, "0")}`;

  return [
    // Ingreso
    { id: nuevoId(), concepto: "Nómina", importe: 1800, tipo: "ingreso", categoria: "Nómina", fecha: f(1) },

    // Gastos fijos (recurrentes)
    { id: nuevoId(), concepto: "Alquiler", importe: 650, tipo: "gasto-fijo", categoria: "Alquiler", fecha: f(1) },
    { id: nuevoId(), concepto: "Fibra + móvil", importe: 45, tipo: "gasto-fijo", categoria: "Internet", fecha: f(3) },
    { id: nuevoId(), concepto: "Suscripciones", importe: 25, tipo: "gasto-fijo", categoria: "Suscripciones", fecha: f(5) },
    { id: nuevoId(), concepto: "Gimnasio", importe: 30, tipo: "gasto-fijo", categoria: "Salud", fecha: f(5) },

    // Gastos variables (puntuales)
    { id: nuevoId(), concepto: "Compra semanal", importe: 95, tipo: "gasto-variable", categoria: "Comida", fecha: f(8) },
    { id: nuevoId(), concepto: "Gasolina", importe: 60, tipo: "gasto-variable", categoria: "Transporte", fecha: f(10) },
    { id: nuevoId(), concepto: "Cena fuera", importe: 38, tipo: "gasto-variable", categoria: "Ocio", fecha: f(14) },
    { id: nuevoId(), concepto: "Compra semanal", importe: 88, tipo: "gasto-variable", categoria: "Comida", fecha: f(16) },
  ];
}
