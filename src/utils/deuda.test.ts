/* =============================================================================
 * deuda.test.ts — Tests de la amortización de deudas / Debt amortization tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba estadoDeuda y seSaldaEnMes: cuotas aplicadas mes a mes, última
 *     cuota parcial, meses antes del inicio, deuda sin cuota y total a 0.
 * EN: Checks estadoDeuda and seSaldaEnMes: installments applied month by
 *     month, final partial installment, months before the start, debt with no
 *     installment and a zero total.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import type { Deuda } from "../types";
import { estadoDeuda, seSaldaEnMes } from "./deuda";

// ES: Deuda de ejemplo: 1000 € con 300 €/mes desde enero de 2026, 100 € ya pagados.
//     Pagos: ene 400, feb 700, mar 1000 (en marzo la cuota es parcial: 300 -> 300).
// EN: Sample debt: 1000 € at 300 €/month from January 2026, 100 € already paid.
//     Payments: Jan 400, Feb 700, Mar 1000 (March gets the remaining 300).
function deuda(cambios: Partial<Deuda> = {}): Deuda {
  return {
    id: "d1",
    concepto: "Préstamo",
    tipo: "prestamo",
    total: 1000,
    cuotaMensual: 300,
    pagadoInicial: 100,
    inicioMes: "2026-01",
    ...cambios,
  };
}

describe("estadoDeuda", () => {
  it("no aplica cuotas antes del mes de inicio / applies nothing before the start month", () => {
    const e = estadoDeuda(deuda(), "2025-12");
    expect(e.pagado).toBe(100);
    expect(e.pendiente).toBe(900);
    expect(e.cuotaDelMes).toBe(0);
    expect(e.terminada).toBe(false);
    expect(e.mesesRestantes).toBe(3);
    expect(e.progreso).toBe(10);
  });

  it("aplica una cuota en el mes de inicio / applies one installment in the start month", () => {
    const e = estadoDeuda(deuda(), "2026-01");
    expect(e.pagado).toBe(400);
    expect(e.pendiente).toBe(600);
    expect(e.cuotaDelMes).toBe(300);
    expect(e.mesesRestantes).toBe(2);
    expect(e.progreso).toBe(40);
  });

  it("cobra solo lo pendiente en la última cuota / charges only the balance on the last installment", () => {
    // ES: Al inicio de marzo quedan 300; con total 950 quedarían 250 (cuota parcial).
    // EN: At the start of March 300 is left; with a 950 total only 250 is left (partial).
    const e = estadoDeuda(deuda({ total: 950 }), "2026-03");
    expect(e.cuotaDelMes).toBe(250);
    expect(e.pagado).toBe(950);
    expect(e.pendiente).toBe(0);
    expect(e.terminada).toBe(true);
    expect(e.progreso).toBe(100);
  });

  it("no cobra nada una vez saldada / charges nothing once settled", () => {
    const e = estadoDeuda(deuda(), "2026-06");
    expect(e.pagado).toBe(1000);
    expect(e.pendiente).toBe(0);
    expect(e.cuotaDelMes).toBe(0);
    expect(e.terminada).toBe(true);
    expect(e.mesesRestantes).toBe(0);
  });

  it("sin cuota mensual nunca avanza / never advances with no installment", () => {
    const e = estadoDeuda(deuda({ cuotaMensual: 0 }), "2027-01");
    expect(e.pagado).toBe(100);
    expect(e.cuotaDelMes).toBe(0);
    expect(e.mesesRestantes).toBe(0);
  });

  it("total 0 cuenta como saldada al 100 % / a zero total counts as settled at 100 %", () => {
    const e = estadoDeuda(deuda({ total: 0, pagadoInicial: 0 }), "2026-01");
    expect(e.terminada).toBe(true);
    expect(e.progreso).toBe(100);
    expect(e.cuotaDelMes).toBe(0);
  });

  it("cruza bien el cambio de año / handles the year boundary", () => {
    const e = estadoDeuda(deuda({ inicioMes: "2025-11", pagadoInicial: 0 }), "2026-01");
    expect(e.pagado).toBe(900);
    expect(e.cuotaDelMes).toBe(300);
  });
});

describe("seSaldaEnMes", () => {
  it("solo es true en el mes en que se salda / is true only in the settling month", () => {
    const d = deuda();
    expect(seSaldaEnMes(d, "2026-02")).toBe(false);
    expect(seSaldaEnMes(d, "2026-03")).toBe(true);
    expect(seSaldaEnMes(d, "2026-04")).toBe(false);
  });

  it("una deuda ya pagada al registrarla no avisa / a debt already paid off never fires", () => {
    expect(seSaldaEnMes(deuda({ pagadoInicial: 1000 }), "2026-01")).toBe(false);
  });
});
