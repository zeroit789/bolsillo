/* =============================================================================
 * comparativa.test.ts — Tests de la comparativa de meses / Month comparison tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba la variación (importe y %), el color según si subir es bueno o
 *     malo y la flecha; y el resumen mensual del store (resumenDe), que es de
 *     donde salen los dos meses comparados.
 * EN: Checks the variation (amount and %), the colour depending on whether
 *     going up is good or bad and the arrow; plus the store's monthly summary
 *     (resumenDe), which feeds the two compared months.
 * ===========================================================================*/
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { useFinanzas } from "../stores/finanzas";
import { claseVariacion, construirFila, flecha, porcentajeVariacion } from "./comparativa";

describe("porcentajeVariacion", () => {
  it("calcula la variación en % / computes the variation %", () => {
    expect(porcentajeVariacion(150, 100)).toBe(50);
    expect(porcentajeVariacion(50, 100)).toBe(-50);
  });

  it("sin base de comparación devuelve null / returns null with no comparison base", () => {
    expect(porcentajeVariacion(100, 0)).toBeNull();
  });

  it("usa el valor absoluto del mes anterior / uses the absolute previous value", () => {
    // ES: Pasar de -100 a -50 de disponible es una mejora del 50 %.
    // EN: Going from -100 to -50 available is a 50 % improvement.
    expect(porcentajeVariacion(-50, -100)).toBe(50);
  });
});

describe("construirFila / claseVariacion / flecha", () => {
  it("subir ingresos es bueno / income going up is good", () => {
    const fila = construirFila("ingresos", 1200, 1000, true);
    expect(fila.variacion).toBe(200);
    expect(fila.porcentaje).toBe(20);
    expect(claseVariacion(fila)).toBe("text-ok");
    expect(flecha(fila.variacion)).toBe("▲");
  });

  it("subir gastos es malo / expenses going up is bad", () => {
    const fila = construirFila("gastosTotales", 900, 800, false);
    expect(claseVariacion(fila)).toBe("text-danger");
  });

  it("bajar gastos es bueno / expenses going down is good", () => {
    const fila = construirFila("gastosTotales", 700, 800, false);
    expect(claseVariacion(fila)).toBe("text-ok");
    expect(flecha(fila.variacion)).toBe("▼");
  });

  it("sin cambio queda neutro / no change stays neutral", () => {
    const fila = construirFila("disponible", 300, 300, true);
    expect(claseVariacion(fila)).toBe("text-faint");
    expect(flecha(fila.variacion)).toBe("—");
  });
});

describe("resumenDe del store / store resumenDe", () => {
  // ES: Store limpio en cada test. / EN: Fresh store for every test.
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });

  it("suma ingresos, gastos y cuotas del mes / adds the month's income, expenses and installments", () => {
    const f = useFinanzas();
    f.hidratar({
      recurrentes: [
        {
          id: "r1",
          concepto: "Nómina",
          importe: 1500,
          signo: "ingreso",
          categoria: "Nómina",
          desde: "2026-01",
          hasta: null,
        },
        {
          id: "r2",
          concepto: "Alquiler",
          importe: 600,
          signo: "gasto",
          categoria: "Vivienda",
          desde: "2026-01",
          hasta: "2026-02",
        },
      ],
      puntuales: [
        {
          id: "p1",
          concepto: "Súper",
          importe: 80,
          signo: "gasto",
          categoria: "Comida",
          fecha: "2026-02-10",
        },
        {
          id: "p2",
          concepto: "Venta",
          importe: 50,
          signo: "ingreso",
          categoria: "Otros",
          fecha: "2026-02-20",
        },
        {
          id: "p3",
          concepto: "Cine",
          importe: 20,
          signo: "gasto",
          categoria: "Ocio",
          fecha: "2026-03-01",
        },
      ],
      deudas: [
        {
          id: "d1",
          concepto: "Móvil",
          tipo: "otro",
          total: 200,
          cuotaMensual: 100,
          pagadoInicial: 0,
          inicioMes: "2026-02",
        },
      ],
      planes: [],
      presupuestos: [],
      plantillas: [],
      cuentas: [],
    });

    expect(f.resumenDe("2026-02")).toEqual({
      mes: "2026-02",
      ingresos: 1550,
      gastosFijos: 700,
      gastosVariables: 80,
      totalGastos: 780,
      disponible: 770,
    });

    // ES: En marzo el alquiler ya está de baja y la deuda paga su última cuota.
    // EN: In March the rent has ended and the debt pays its last installment.
    expect(f.resumenDe("2026-03")).toMatchObject({
      ingresos: 1500,
      gastosFijos: 100,
      gastosVariables: 20,
      disponible: 1380,
    });
  });
});
