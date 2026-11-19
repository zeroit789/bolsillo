/* =============================================================================
 * importe.test.ts — Tests del redondeo de importes / Amount rounding tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba redondear2 e importeDesdeTexto (utils/importe.ts), el único
 *     sitio donde se redondean importes a céntimos: errores de coma flotante,
 *     empates (x,xx5) en positivos y negativos, -0, NaN e Infinity, y que en
 *     todo lo que no es un empate da lo mismo que la fórmula antigua
 *     Math.round(x * 100) / 100.
 * EN: Checks redondear2 and importeDesdeTexto (utils/importe.ts), the single
 *     place where amounts are rounded to cents: floating-point errors, ties
 *     (x.xx5) for positives and negatives, -0, NaN and Infinity, and that for
 *     everything that is not a tie it matches the old formula
 *     Math.round(x * 100) / 100.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { importeDesdeTexto, redondear2 } from "./importe";

// ES: Fórmula que había repartida por el código antes de este módulo.
// EN: Formula that was scattered across the code before this module.
const formulaAntigua = (n: number): number => Math.round(n * 100) / 100;

describe("redondear2", () => {
  it("corrige el error de coma flotante / fixes the floating-point error", () => {
    expect(redondear2(0.1 + 0.2)).toBe(0.3);
    expect(redondear2(1234.567)).toBe(1234.57);
    expect(redondear2(12.5)).toBe(12.5);
  });

  it("los empates suben aunque el binario quede por debajo / ties round up even when the binary value is just below", () => {
    // ES: 1.005 en binario es 1.00499999…; un humano espera 1,01.
    // EN: 1.005 in binary is 1.00499999…; a person expects 1.01.
    expect(redondear2(1.005)).toBe(1.01);
    expect(redondear2(1.255)).toBe(1.26);
    expect(redondear2(8.675)).toBe(8.68);
  });

  it("negativos: el empate se aleja del cero, simétrico a los positivos / negatives: ties go away from zero, mirroring positives", () => {
    expect(redondear2(-2.345)).toBe(-2.35);
    expect(redondear2(-0.005)).toBe(-0.01);
    expect(redondear2(-1.005)).toBe(-1.01);
    expect(redondear2(-12.344)).toBe(-12.34);
  });

  it("nunca devuelve -0 / never returns -0", () => {
    expect(Object.is(redondear2(-0), 0)).toBe(true);
    expect(Object.is(redondear2(-0.004), 0)).toBe(true);
  });

  it("NaN e Infinity pasan a 0 (un importe no puede ser infinito) / NaN and Infinity become 0 (an amount can't be infinite)", () => {
    expect(redondear2(Number.NaN)).toBe(0);
    expect(redondear2(Number.POSITIVE_INFINITY)).toBe(0);
    expect(redondear2(Number.NEGATIVE_INFINITY)).toBe(0);
  });

  it("los céntimos exactos no cambian / exact cents stay the same", () => {
    // ES: Todo importe en céntimos de -2.000 € a 2.000 € sale idéntico.
    // EN: Every cent amount from -2,000 € to 2,000 € comes out unchanged.
    for (let c = -200_000; c <= 200_000; c++) {
      const x = c / 100;
      if (redondear2(x) !== x) throw new Error(`${x} -> ${redondear2(x)}`);
    }
  });

  it("fuera de los empates coincide con la fórmula antigua / outside ties it matches the old formula", () => {
    // ES: Importes con 3 decimales (milésimas) que no acaban en 5, y sumas típicas.
    // EN: Amounts with 3 decimals (thousandths) not ending in 5, plus typical sums.
    for (let m = -200_000; m <= 200_000; m++) {
      if (Math.abs(m) % 10 === 5) continue;
      const x = m / 1000;
      const nueva = redondear2(x);
      const antigua = formulaAntigua(x) + 0; // ES: + 0 convierte -0 en 0 / EN: + 0 turns -0 into 0
      if (nueva !== antigua) throw new Error(`${x}: ${nueva} != ${antigua}`);
    }
    expect(redondear2(19.99 + 5.01 + 0.1)).toBe(formulaAntigua(19.99 + 5.01 + 0.1));
    expect(redondear2(1500 - 80.5 - 3.33)).toBe(formulaAntigua(1500 - 80.5 - 3.33));
  });
});

describe("importeDesdeTexto", () => {
  it("acepta coma o punto decimal / accepts a decimal comma or dot", () => {
    expect(importeDesdeTexto("12,50")).toBe(12.5);
    expect(importeDesdeTexto("12.345")).toBe(12.35);
    expect(importeDesdeTexto(" 7 ")).toBe(7);
    expect(importeDesdeTexto(1.005)).toBe(1.01);
  });

  it("lo que no es un número da 0 / anything that is not a number gives 0", () => {
    expect(importeDesdeTexto("abc")).toBe(0);
    expect(importeDesdeTexto("")).toBe(0);
    expect(importeDesdeTexto("1e999")).toBe(0);
  });
});
