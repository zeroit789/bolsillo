/* =============================================================================
 * partes.test.ts — Tests del gasto dividido / Split-expense tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba validarPartes y totalPartes (utils/partes.ts). Reproduce el
 *     fallo de la revisión: una parte negativa rebajaba el total con el que se
 *     comprobaba el tope y luego se descartaba al guardar, así que
 *     600.000.000 + 600.000.000 − 300.000.000 pasaba con un total de 900 M y
 *     guardaba partes por 1.200 M. Todos los datos son inventados.
 * EN: Checks validarPartes and totalPartes (utils/partes.ts). Reproduces the
 *     review finding: a negative part lowered the total checked against the
 *     cap and was then dropped on save, so 600,000,000 + 600,000,000 −
 *     300,000,000 passed with a 900 M total and saved parts worth 1,200 M.
 *     All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { totalPartes, validarPartes } from "./partes";

describe("validarPartes", () => {
  it("una parte negativa se rechaza y no rebaja el total / a negative part is rejected and does not lower the total", () => {
    const r = validarPartes([
      { categoria: "Comida", importe: "600000000" },
      { categoria: "Ocio", importe: "600000000" },
      { categoria: "Casa", importe: "-300000000" },
    ]);
    expect(r).toEqual({ ok: false, error: "negativa" });
  });

  it("el total sale exactamente de las partes que se guardan / the total comes exactly from the parts that are saved", () => {
    const r = validarPartes([
      { categoria: "Comida", importe: "12,345" },
      { categoria: "Ocio", importe: "" },
      { categoria: "Casa", importe: "7.5" },
      { categoria: "Ropa", importe: "0" },
    ]);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // ES: Las vacías y las de 0 se descartan, como antes.
    // EN: Empty and 0 parts are dropped, as before.
    expect(r.subdivisiones).toEqual([
      { categoria: "Comida", importe: 12.35 },
      { categoria: "Casa", importe: 7.5 },
    ]);
    expect(r.total).toBe(19.85);
    const suma = r.subdivisiones.reduce((a, p) => a + p.importe, 0);
    expect(Math.round(suma * 100) / 100).toBe(r.total);
  });

  it("dos partes que caben dan un total que pasa del tope / two parts that fit give a total above the cap", () => {
    const r = validarPartes([
      { categoria: "Comida", importe: "600000000" },
      { categoria: "Ocio", importe: "600000000" },
    ]);
    expect(r).toEqual({ ok: false, error: "excede" });
  });

  it("una parte por encima del tope o enorme se rechaza (no se vuelve 0) / a part above the cap or huge is rejected (it does not become 0)", () => {
    for (const enorme of ["1000000000", "1e307"]) {
      const r = validarPartes([
        { categoria: "Comida", importe: "10" },
        { categoria: "Ocio", importe: "20" },
        { categoria: "Casa", importe: enorme },
      ]);
      expect(r, enorme).toEqual({ ok: false, error: "excede" });
    }
  });

  it("una parte que no es un número se rechaza (no se descarta en silencio) / a non-numeric part is rejected (not silently dropped)", () => {
    const r = validarPartes([
      { categoria: "Comida", importe: "10" },
      { categoria: "Ocio", importe: "20" },
      { categoria: "Casa", importe: "abc" },
    ]);
    expect(r).toEqual({ ok: false, error: "invalida" });
  });

  it("hacen falta al menos 2 partes mayores que 0 / at least 2 parts above 0 are needed", () => {
    expect(
      validarPartes([
        { categoria: "Comida", importe: "10" },
        { categoria: "Ocio", importe: "" },
      ])
    ).toEqual({ ok: false, error: "pocas" });
  });
});

describe("totalPartes", () => {
  it("suma solo lo que se guardaría (sin negativas, vacías ni inválidas) / sums only what would be saved (no negative, empty or invalid parts)", () => {
    expect(
      totalPartes([
        { categoria: "Comida", importe: "600000000" },
        { categoria: "Ocio", importe: "600000000" },
        { categoria: "Casa", importe: "-300000000" },
        { categoria: "Ropa", importe: "abc" },
        { categoria: "Otros", importe: "" },
      ])
    ).toBe(1_200_000_000);
  });
});
