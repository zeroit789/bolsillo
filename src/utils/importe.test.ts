/* =============================================================================
 * importe.test.ts — Tests del redondeo de importes / Amount rounding tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba redondear2 e importeDesdeTexto (utils/importe.ts), el único
 *     sitio donde se redondean importes a céntimos: errores de coma flotante,
 *     empates (x,xx5) en positivos y negativos, -0, NaN e Infinity, y que en
 *     todo lo que no es un empate da lo mismo que la fórmula antigua
 *     Math.round(x * 100) / 100. También analizarImporte, que clasifica lo
 *     que llega de los formularios (vacío, válido, inválido, por encima del
 *     tope) antes de redondear.
 * EN: Checks redondear2 and importeDesdeTexto (utils/importe.ts), the single
 *     place where amounts are rounded to cents: floating-point errors, ties
 *     (x.xx5) for positives and negatives, -0, NaN and Infinity, and that for
 *     everything that is not a tie it matches the old formula
 *     Math.round(x * 100) / 100. Also analizarImporte, which classifies what
 *     comes from the forms (empty, valid, invalid, above the cap) before
 *     rounding.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import {
  IMPORTE_MAX,
  MENSAJE_IMPORTE_INVALIDO,
  MENSAJE_IMPORTE_MAX,
  analizarImporte,
  importeDentroDeRango,
  importeDesdeTexto,
  redondear2,
} from "./importe";

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

describe("redondear2 con importes enormes / redondear2 with huge amounts", () => {
  it("nunca devuelve un número no finito aunque el ×100 desborde / never returns a non-finite number even if ×100 overflows", () => {
    // ES: 1e307 es finito, pero 1e307 * 100 es Infinity.
    // EN: 1e307 is finite, but 1e307 * 100 is Infinity.
    for (const n of [1e307, -1e307, Number.MAX_VALUE, -Number.MAX_VALUE]) {
      expect(Number.isFinite(redondear2(n))).toBe(true);
      expect(redondear2(n)).toBe(0);
    }
    expect(importeDesdeTexto("1e307")).toBe(0);
  });
});

describe("IMPORTE_MAX e importeDentroDeRango / IMPORTE_MAX and importeDentroDeRango", () => {
  it("el tope es 999.999.999,99 / the cap is 999,999,999.99", () => {
    expect(IMPORTE_MAX).toBe(999_999_999.99);
  });

  it("acepta de -IMPORTE_MAX a IMPORTE_MAX, cero incluido / accepts -IMPORTE_MAX to IMPORTE_MAX, zero included", () => {
    expect(importeDentroDeRango(0)).toBe(true);
    expect(importeDentroDeRango(12.5)).toBe(true);
    expect(importeDentroDeRango(IMPORTE_MAX)).toBe(true);
    expect(importeDentroDeRango(-IMPORTE_MAX)).toBe(true);
  });

  it("rechaza lo que pasa del tope y lo no finito / rejects what exceeds the cap and non-finite values", () => {
    expect(importeDentroDeRango(1_000_000_000)).toBe(false);
    expect(importeDentroDeRango(-1_000_000_000)).toBe(false);
    expect(importeDentroDeRango(1e12)).toBe(false);
    expect(importeDentroDeRango(Number.NaN)).toBe(false);
    expect(importeDentroDeRango(Number.POSITIVE_INFINITY)).toBe(false);
    expect(importeDentroDeRango(Number.NEGATIVE_INFINITY)).toBe(false);
  });

  it("se valida el importe ya redondeado / the already rounded amount is validated", () => {
    // ES: 999.999.999,995 redondea a 1.000.000.000, que pasa del tope.
    // EN: 999,999,999.995 rounds to 1,000,000,000, which exceeds the cap.
    expect(importeDentroDeRango(importeDesdeTexto("999999999,995"))).toBe(false);
    expect(importeDentroDeRango(importeDesdeTexto("999999999,994"))).toBe(true);
  });

  it("el mensaje de error muestra el tope en los dos idiomas / the error message shows the cap in both languages", () => {
    expect(MENSAJE_IMPORTE_MAX.es).toContain("999.999.999,99");
    expect(MENSAJE_IMPORTE_MAX.en).toContain("999,999,999.99");
  });
});

describe("redondear2 cerca del tope y casos límite de toPrecision(15) / redondear2 near the cap and toPrecision(15) edge cases", () => {
  it("los céntimos exactos junto al tope no cambian / exact cents near the cap stay the same", () => {
    // ES: Los últimos 2.000 € antes del tope, céntimo a céntimo, en ambos signos.
    // EN: The last 2,000 € below the cap, cent by cent, for both signs.
    const tope = Math.round(IMPORTE_MAX * 100);
    for (let c = tope - 200_000; c <= tope; c++) {
      const x = c / 100;
      if (redondear2(x) !== x) throw new Error(`${x} -> ${redondear2(x)}`);
      if (redondear2(-x) !== -x) throw new Error(`${-x} -> ${redondear2(-x)}`);
    }
  });

  it("junto al tope el medio céntimo sube y el resto baja / near the cap half a cent goes up and the rest goes down", () => {
    expect(redondear2(999_999_999.985)).toBe(999_999_999.99);
    expect(redondear2(999_999_999.984)).toBe(999_999_999.98);
    expect(redondear2(-999_999_999.985)).toBe(-999_999_999.99);
    expect(redondear2(-999_999_999.984)).toBe(-999_999_999.98);
    expect(redondear2(123_456_789.125)).toBe(123_456_789.13);
    expect(redondear2(123_456_789.124)).toBe(123_456_789.12);
  });

  it("un valor a menos de 15 cifras del empate cuenta como empate (decisión aceptada) / a value within 15 digits of a tie counts as a tie (accepted decision)", () => {
    // ES: 1.004999999999999 (16 cifras) no se distingue del ruido binario de
    //     1,005 con 15 cifras: se trata como 1,005 y sube. Es el precio de
    //     arreglar los empates calculados (ver la cabecera de importe.ts).
    // EN: 1.004999999999999 (16 digits) can't be told apart from the binary
    //     noise of 1.005 with 15 digits: it is treated as 1.005 and goes up.
    //     That is the price of fixing computed ties (see importe.ts header).
    expect(redondear2(1.004999999999999)).toBe(1.01);
    // ES: Con 15 cifras o menos sí se distingue y baja.
    // EN: With 15 digits or fewer it is told apart and goes down.
    expect(redondear2(1.00499999999999)).toBe(1);
    expect(redondear2(1.0049)).toBe(1);
  });

  it("los empates que salen de una cuenta suben / ties produced by arithmetic go up", () => {
    // ES: 3,35 × 1,5 = 5,025 exacto, pero en binario sale 5,0249999…; con
    //     String(x) bajaría a 5,02. toPrecision(15) lo deja en 5,03.
    // EN: 3.35 × 1.5 = 5.025 exactly, but in binary it is 5.0249999…; with
    //     String(x) it would go down to 5.02. toPrecision(15) gives 5.03.
    expect(redondear2(3.35 * 1.5)).toBe(5.03);
    // ES: Barrido: productos importe × porcentaje cuyo valor exacto es un empate.
    // EN: Sweep: amount × percentage products whose exact value is a tie.
    for (let a = 1; a < 20_000; a += 7) {
      for (let p = 1; p < 400; p += 3) {
        const exacto = a * p; // ES: en diezmilésimas / EN: in ten-thousandths
        if (exacto % 100 !== 50) continue;
        const esperado = (Math.floor(exacto / 100) + 1) / 100;
        const obtenido = redondear2((a / 100) * (p / 100));
        if (obtenido !== esperado)
          throw new Error(`${a}/100 × ${p}/100: ${obtenido} != ${esperado}`);
      }
    }
  });
});

// ES: analizarImporte separa vacío, válido, inválido y por encima del tope ANTES
//     de redondear. Antes, "1e307" o "abc" acababan en 0 y se guardaban como un
//     0 válido (podían pisar un saldo inicial o lo pagado de una deuda).
// EN: analizarImporte tells apart empty, valid, invalid and above the cap
//     BEFORE rounding. Before, "1e307" or "abc" ended up as 0 and were saved
//     as a valid 0 (they could overwrite a starting balance or a debt's paid amount).
describe("analizarImporte", () => {
  it("vacío: cadena vacía, solo espacios, null y undefined / empty: empty string, blanks, null and undefined", () => {
    expect(analizarImporte("")).toEqual({ tipo: "vacio", valor: 0 });
    expect(analizarImporte("   ")).toEqual({ tipo: "vacio", valor: 0 });
    expect(analizarImporte(null)).toEqual({ tipo: "vacio", valor: 0 });
    expect(analizarImporte(undefined)).toEqual({ tipo: "vacio", valor: 0 });
  });

  it("válido: texto con coma o punto y números, redondeado a céntimos / valid: text with comma or dot and numbers, rounded to cents", () => {
    expect(analizarImporte("12,50")).toEqual({ tipo: "valido", valor: 12.5 });
    expect(analizarImporte(" 12.505 ")).toEqual({ tipo: "valido", valor: 12.51 });
    expect(analizarImporte("-3,2")).toEqual({ tipo: "valido", valor: -3.2 });
    expect(analizarImporte(7.125)).toEqual({ tipo: "valido", valor: 7.13 });
    expect(analizarImporte("1e3")).toEqual({ tipo: "valido", valor: 1000 });
  });

  it("el cero es un valor válido, no un vacío / zero is a valid value, not an empty one", () => {
    expect(analizarImporte("0")).toEqual({ tipo: "valido", valor: 0 });
    expect(analizarImporte(0)).toEqual({ tipo: "valido", valor: 0 });
    // ES: -0 y lo que redondea a 0 dan 0, nunca -0. / EN: -0 and what rounds to 0 give 0, never -0.
    expect(analizarImporte("-0,001")).toEqual({ tipo: "valido", valor: 0 });
    expect(Object.is(analizarImporte(-0).valor, 0)).toBe(true);
  });

  it("inválido: texto que no es un número o no finito / invalid: non-numeric or non-finite text", () => {
    for (const x of ["abc", "12abc", "1,2,3", "0x10", "Infinity", "-Infinity", "NaN", "1e400"]) {
      expect(analizarImporte(x), x).toEqual({ tipo: "invalido", valor: 0 });
    }
    expect(analizarImporte(Number.NaN)).toEqual({ tipo: "invalido", valor: 0 });
    expect(analizarImporte(Number.POSITIVE_INFINITY)).toEqual({ tipo: "invalido", valor: 0 });
  });

  it("excede: por encima del tope, también si ×100 desborda / exceeds: above the cap, also when ×100 overflows", () => {
    // ES: 1e307 es finito, pero redondear2 lo convertía en 0. / EN: 1e307 is finite, but redondear2 turned it into 0.
    expect(analizarImporte("1e307")).toEqual({ tipo: "excede", valor: 0 });
    expect(analizarImporte(1e307)).toEqual({ tipo: "excede", valor: 0 });
    expect(analizarImporte(-1e307)).toEqual({ tipo: "excede", valor: 0 });
    expect(analizarImporte("1000000000")).toEqual({ tipo: "excede", valor: 0 });
    // ES: 999.999.999,995 redondea a 1e9 y no cabe. / EN: 999,999,999.995 rounds to 1e9 and does not fit.
    expect(analizarImporte("999999999,995")).toEqual({ tipo: "excede", valor: 0 });
  });

  it("el tope exacto cabe, en los dos signos / the exact cap fits, for both signs", () => {
    expect(analizarImporte("999999999,99")).toEqual({ tipo: "valido", valor: IMPORTE_MAX });
    expect(analizarImporte(-IMPORTE_MAX)).toEqual({ tipo: "valido", valor: -IMPORTE_MAX });
  });

  it("el mensaje de importe inválido existe en los dos idiomas / the invalid-amount message exists in both languages", () => {
    expect(MENSAJE_IMPORTE_INVALIDO.es.length).toBeGreaterThan(0);
    expect(MENSAJE_IMPORTE_INVALIDO.en.length).toBeGreaterThan(0);
  });
});
