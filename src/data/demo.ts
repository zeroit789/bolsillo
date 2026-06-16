/* ===========================================================================
   Datos DEMO genéricos (inventados, de nadie real) para que la app arranque
   con contenido. Incluye recurrentes, puntuales y un par de deudas de ejemplo.
   =========================================================================== */
import type { DatosBolsillo } from "../types";
import { mesActual, sumarMeses } from "../utils/format";

function nuevoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function datosDemo(): DatosBolsillo {
  const mes = mesActual();
  const haceMeses = (n: number) => sumarMeses(mes, -n);
  const dia = (d: number) => `${mes}-${String(d).padStart(2, "0")}`;

  return {
    // Recurrentes (se repiten cada mes desde su alta)
    recurrentes: [
      { id: nuevoId(), concepto: "Nómina", importe: 1800, signo: "ingreso", categoria: "Nómina", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Alquiler", importe: 650, signo: "gasto", categoria: "Alquiler", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Fibra + móvil", importe: 45, signo: "gasto", categoria: "Internet", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Suscripciones", importe: 25, signo: "gasto", categoria: "Suscripciones", desde: haceMeses(5), hasta: null },
      { id: nuevoId(), concepto: "Gimnasio", importe: 30, signo: "gasto", categoria: "Gimnasio", desde: haceMeses(3), hasta: null },
    ],
    // Puntuales del mes en curso
    puntuales: [
      { id: nuevoId(), concepto: "Compra semanal", importe: 95, signo: "gasto", categoria: "Supermercado", fecha: dia(8) },
      { id: nuevoId(), concepto: "Gasolina", importe: 60, signo: "gasto", categoria: "Gasolina", fecha: dia(10) },
      { id: nuevoId(), concepto: "Cena fuera", importe: 38, signo: "gasto", categoria: "Restaurantes", fecha: dia(14) },
      { id: nuevoId(), concepto: "Venta de segunda mano", importe: 50, signo: "ingreso", categoria: "Ventas", fecha: dia(15) },
    ],
    // Deudas de ejemplo
    deudas: [
      { id: nuevoId(), concepto: "Coche", tipo: "coche", total: 12000, cuotaMensual: 280, pagadoInicial: 3500, inicioMes: haceMeses(5) },
      { id: nuevoId(), concepto: "Tarjeta de crédito", tipo: "tarjeta", total: 1500, cuotaMensual: 150, pagadoInicial: 300, inicioMes: haceMeses(3) },
    ],
    // Planes / metas de ejemplo
    planes: [
      { id: nuevoId(), nombre: "Vacaciones de verano", objetivo: 800, aportado: 250 },
      { id: nuevoId(), nombre: "Pintar el salón", objetivo: 120, aportado: 40 },
    ],
    // Presupuestos de ejemplo (topes por categoría)
    presupuestos: [
      { categoria: "Comida", limite: 350 },
      { categoria: "Ocio", limite: 100 },
    ],
    // Plantillas de alta rápida
    plantillas: [
      { id: nuevoId(), concepto: "Café", importe: 1.5, signo: "gasto", categoria: "Cafetería" },
      { id: nuevoId(), concepto: "Gasolina", importe: 50, signo: "gasto", categoria: "Gasolina" },
      { id: nuevoId(), concepto: "Compra súper", importe: 60, signo: "gasto", categoria: "Supermercado" },
    ],
  };
}
