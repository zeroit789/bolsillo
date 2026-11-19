/* =============================================================================
 * texto.test.ts — Tests del texto de los extractos / Statement text tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba normalizarTexto (comparar conceptos sin mayúsculas, acentos ni
 *     espacios de más) y decodificarBytes (UTF-8 con o sin BOM y, si no es
 *     UTF-8 válido, Windows-1252, que es como exportan muchos bancos).
 *     Todos los datos son inventados.
 * EN: Checks normalizarTexto (compare concepts ignoring case, accents and extra
 *     spaces) and decodificarBytes (UTF-8 with or without BOM and, when it is
 *     not valid UTF-8, Windows-1252, which is how many banks export).
 *     All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { decodificarBytes, normalizarTexto } from "./texto";

describe("normalizarTexto", () => {
  it("quita mayúsculas, acentos y espacios de más / drops case, accents and extra spaces", () => {
    expect(normalizarTexto("  Panadería   MUÑOZ\t ")).toBe("panaderia munoz");
  });

  it("la ñ y la ü se comparan sin diacríticos / ñ and ü are compared without diacritics", () => {
    expect(normalizarTexto("Pingüino Ñandú")).toBe(normalizarTexto("PINGUINO NANDU"));
  });

  it("los espacios duros cuentan como espacios / non-breaking spaces count as spaces", () => {
    expect(normalizarTexto("Recibo\u00a0luz")).toBe("recibo luz");
  });
});

describe("decodificarBytes", () => {
  it("UTF-8 con BOM: quita el BOM / UTF-8 with BOM: drops the BOM", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode("Fecha;Línea")]);
    expect(decodificarBytes(bytes)).toBe("Fecha;Línea");
  });

  it("UTF-8 sin BOM / UTF-8 without BOM", () => {
    expect(decodificarBytes(new TextEncoder().encode("Café"))).toBe("Café");
  });

  it("Windows-1252 si no es UTF-8 válido / Windows-1252 when it is not valid UTF-8", () => {
    // ES: "Línea €" en Windows-1252: í = 0xED, € = 0x80.
    // EN: "Línea €" in Windows-1252: í = 0xED, € = 0x80.
    const bytes = new Uint8Array([0x4c, 0xed, 0x6e, 0x65, 0x61, 0x20, 0x80]);
    expect(decodificarBytes(bytes)).toBe("Línea €");
  });

  it("acepta un ArrayBuffer / accepts an ArrayBuffer", () => {
    const bytes = new TextEncoder().encode("Hola");
    expect(decodificarBytes(bytes.buffer)).toBe("Hola");
  });
});
