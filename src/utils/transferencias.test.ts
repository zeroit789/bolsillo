/* =============================================================================
 * transferencias.test.ts — Tests de transferencias y ajustes / Transfer & adjustment tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba que una transferencia entre cuentas mueve saldos pero NO cuenta
 *     como ingreso ni gasto (el resumen del mes y el patrimonio total no
 *     cambian), la validación de transferencias y el ajuste de saldo que deja
 *     una cuenta en el saldo que dice el banco. Todos los datos son inventados.
 * EN: Checks that a transfer between accounts moves balances but does NOT
 *     count as income or expense (the month summary and the total net worth
 *     stay the same), transfer validation and the balance adjustment that
 *     leaves an account at the balance the bank shows. All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import {
  crearAjusteSaldo,
  resumenMensual,
  saldosPorCuenta,
  validarTransferencia,
  type AjusteSaldo,
  type MovimientoCuenta,
  type Transferencia,
} from "./transferencias";

// ES: Cuentas y movimientos de ejemplo. / EN: Example accounts and movements.
const CUENTAS = [
  { id: "banco", saldoInicial: 1000 },
  { id: "hucha", saldoInicial: 0 },
];
const MOVIMIENTOS: MovimientoCuenta[] = [
  { cuenta: "banco", importe: 50, signo: "gasto", fecha: "2026-02-03" },
  { cuenta: "hucha", importe: 20, signo: "ingreso", fecha: "2026-02-10" },
  { importe: 100, signo: "ingreso", fecha: "2026-02-11" }, // ES: sin cuenta / EN: no account
  { cuenta: "banco", importe: 1850, signo: "ingreso", fecha: "2026-03-01" },
];
const TRANSFERENCIA: Transferencia = {
  id: "t1",
  origen: "banco",
  destino: "hucha",
  importe: 300,
  fecha: "2026-02-15",
};

// ES: Suma de saldos (patrimonio total). / EN: Sum of balances (total net worth).
const total = (s: { saldo: number }[]) => s.reduce((a, x) => a + x.saldo, 0);

describe("saldosPorCuenta", () => {
  it("la transferencia mueve saldos de una cuenta a otra / the transfer moves balances from one account to another", () => {
    expect(saldosPorCuenta(CUENTAS, MOVIMIENTOS, [TRANSFERENCIA])).toEqual([
      { id: "banco", saldo: 2500 },
      { id: "hucha", saldo: 320 },
    ]);
  });

  it("el patrimonio total no cambia con una transferencia / total net worth does not change with a transfer", () => {
    const sin = saldosPorCuenta(CUENTAS, MOVIMIENTOS);
    const con = saldosPorCuenta(CUENTAS, MOVIMIENTOS, [TRANSFERENCIA]);
    expect(total(con)).toBe(total(sin));
    expect(sin).toEqual([
      { id: "banco", saldo: 2800 },
      { id: "hucha", saldo: 20 },
    ]);
  });

  it("saldo a una fecha / balance at a date", () => {
    expect(saldosPorCuenta(CUENTAS, MOVIMIENTOS, [TRANSFERENCIA], [], "2026-02-14")).toEqual([
      { id: "banco", saldo: 950 },
      { id: "hucha", saldo: 20 },
    ]);
  });

  it("sin ruido binario / without binary noise", () => {
    const tres = [0.1, 0.1, 0.1].map((importe): MovimientoCuenta => ({
      cuenta: "hucha",
      importe,
      signo: "ingreso",
      fecha: "2026-01-01",
    }));
    expect(saldosPorCuenta(CUENTAS, tres)[1].saldo).toBe(0.3);
  });

  it("una transferencia a la misma cuenta o a una que no existe no descuadra las demás / a transfer to the same or to a missing account does not unbalance the others", () => {
    const rara: Transferencia = { ...TRANSFERENCIA, destino: "banco" };
    expect(saldosPorCuenta(CUENTAS, [], [rara])).toEqual([
      { id: "banco", saldo: 1000 },
      { id: "hucha", saldo: 0 },
    ]);
    const huerfana: Transferencia = { ...TRANSFERENCIA, destino: "borrada" };
    expect(saldosPorCuenta(CUENTAS, [], [huerfana])[0].saldo).toBe(700);
  });
});

describe("resumenMensual", () => {
  it("una transferencia NO es ingreso ni gasto / a transfer is NOT income or expense", () => {
    const sin = resumenMensual("2026-02", MOVIMIENTOS);
    const con = resumenMensual("2026-02", MOVIMIENTOS, [TRANSFERENCIA]);
    expect(sin).toEqual({
      ingresos: 120,
      gastos: 50,
      neto: 70,
      movidoEntreCuentas: 0,
      ajustes: 0,
    });
    expect(con).toEqual({ ...sin, movidoEntreCuentas: 300 });
  });

  it("solo cuenta lo del mes pedido / only counts the requested month", () => {
    expect(resumenMensual("2026-03", MOVIMIENTOS, [TRANSFERENCIA]).ingresos).toBe(1850);
    expect(resumenMensual("2026-03", MOVIMIENTOS, [TRANSFERENCIA]).movidoEntreCuentas).toBe(0);
  });
});

describe("validarTransferencia", () => {
  it("acepta una transferencia correcta / accepts a correct transfer", () => {
    expect(validarTransferencia(TRANSFERENCIA)).toEqual({ ok: true });
  });

  it("rechaza misma cuenta, cuentas vacías e importes malos / rejects same account, empty accounts and bad amounts", () => {
    expect(validarTransferencia({ ...TRANSFERENCIA, destino: "banco" })).toEqual({
      ok: false,
      error: "mismaCuenta",
    });
    expect(validarTransferencia({ ...TRANSFERENCIA, origen: " " })).toEqual({
      ok: false,
      error: "sinCuenta",
    });
    for (const importe of [0, -5, Number.NaN, 1e12]) {
      expect(validarTransferencia({ ...TRANSFERENCIA, importe })).toEqual({
        ok: false,
        error: "importe",
      });
    }
  });
});

describe("crearAjusteSaldo (conciliación) / crearAjusteSaldo (reconciliation)", () => {
  it("deja la cuenta en el saldo del banco / leaves the account at the bank balance", () => {
    const actual = saldosPorCuenta(CUENTAS, MOVIMIENTOS, [TRANSFERENCIA], [], "2026-02-28");
    expect(actual[0].saldo).toBe(650);
    const ajuste = crearAjusteSaldo("banco", actual[0].saldo, 600.5, "2026-02-28");
    expect(ajuste).toEqual({ cuenta: "banco", importe: -49.5, fecha: "2026-02-28" });
    const ajustes: AjusteSaldo[] = [{ id: "a1", ...ajuste! }];
    expect(
      saldosPorCuenta(CUENTAS, MOVIMIENTOS, [TRANSFERENCIA], ajustes, "2026-02-28")[0].saldo
    ).toBe(600.5);
  });

  it("si ya cuadra no hace falta ajuste / if it already matches no adjustment is needed", () => {
    expect(crearAjusteSaldo("banco", 650, 650.004, "2026-02-28")).toBeNull();
  });

  it("el ajuste no es ingreso ni gasto, pero se ve aparte / the adjustment is not income or expense, but it shows separately", () => {
    const ajustes: AjusteSaldo[] = [
      { id: "a1", cuenta: "banco", importe: -49.5, fecha: "2026-02-28" },
      { id: "a2", cuenta: "hucha", importe: 10, fecha: "2026-02-28" },
    ];
    const r = resumenMensual("2026-02", MOVIMIENTOS, [TRANSFERENCIA], ajustes);
    expect([r.ingresos, r.gastos, r.ajustes]).toEqual([120, 50, -39.5]);
  });
});
