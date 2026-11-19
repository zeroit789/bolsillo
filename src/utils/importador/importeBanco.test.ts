/* =============================================================================
 * importeBanco.test.ts — Tests de importes de extractos / Statement amount tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba analizarImporteBanco con los formatos que traen los extractos:
 *     coma decimal española con o sin millares, signo delante o detrás,
 *     paréntesis, símbolo de euro, espacios duros, punto decimal si el perfil
 *     lo indica, números de una hoja XLSX y el tope de importe. Siempre en
 *     céntimos enteros. Todos los datos son inventados.
 * EN: Checks analizarImporteBanco with the formats statements bring: Spanish
 *     decimal comma with or without thousands, sign before or after,
 *     parentheses, euro symbol, non-breaking spaces, decimal point when the
 *     profile says so, numbers from an XLSX sheet and the amount cap. Always in
 *     whole cents. All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { analizarImporteBanco } from "./importeBanco";

// ES: Atajo: céntimos de un importe válido o el tipo de fallo.
// EN: Shortcut: cents of a valid amount or the failure type.
function c(valor: string | number | null | undefined, formato: "coma" | "punto" = "coma") {
  const r = analizarImporteBanco(valor, formato);
  return r.tipo === "valido" ? r.centimos : r.tipo;
}

describe("analizarImporteBanco con coma decimal / with decimal comma", () => {
  it("formatos españoles habituales / usual Spanish formats", () => {
    expect(c("1.234,56")).toBe(123456);
    expect(c("-1.234,56")).toBe(-123456);
    expect(c("1234,56 €")).toBe(123456);
    expect(c("(12,30)")).toBe(-1230);
    expect(c("+12,30")).toBe(1230);
    expect(c("12,30-")).toBe(-1230);
    expect(c("12")).toBe(1200);
    expect(c("0,5")).toBe(50);
    expect(c("1.234.567,89")).toBe(123456789);
    expect(c("EUR -3,10")).toBe(-310);
    expect(c("-3,10 EUR")).toBe(-310);
  });

  it("signo menos Unicode y espacios duros / Unicode minus sign and non-breaking spaces", () => {
    expect(c("\u22121.234,56\u00a0€")).toBe(-123456);
    expect(c("1\u202f234,56")).toBe(123456);
    expect(c("- 7,00")).toBe(-700);
  });

  it("más de dos decimales: medio céntimo se aleja del cero / more than two decimals: half a cent goes away from zero", () => {
    expect(c("12,345")).toBe(1235);
    expect(c("-12,345")).toBe(-1235);
    expect(c("12,344")).toBe(1234);
    expect(c("0,999")).toBe(100);
  });

  it("el punto solo vale como millar en grupos de tres / the dot is only a thousands mark in groups of three", () => {
    expect(c("1.234")).toBe(123400);
    expect(c("1234.56")).toBe("invalido");
    expect(c("1.23,45")).toBe("invalido");
    expect(c("12.3456,00")).toBe("invalido");
  });

  it("rechaza lo que no es un importe / rejects what is not an amount", () => {
    expect(c("abc")).toBe("invalido");
    expect(c("1,2,3")).toBe("invalido");
    expect(c("--5")).toBe("invalido");
    expect(c("-(5,00)")).toBe("invalido");
    expect(c("-5,00-")).toBe("invalido");
    expect(c("-")).toBe("invalido");
    expect(c("€")).toBe("invalido");
    expect(c("1e5")).toBe("invalido");
    expect(c("0x10")).toBe("invalido");
  });

  it("los espacios dentro del número solo valen como millares de tres / spaces inside the number are only valid as thousands of three", () => {
    expect(c("1 234,56")).toBe(123456);
    expect(c("1 234 567,89 €")).toBe(123456789);
    expect(c("1 2,34")).toBe("invalido");
    expect(c("12 34,00")).toBe("invalido");
    expect(c("1 234,5 6")).toBe("invalido");
  });

  it("vacío / empty", () => {
    expect(c("")).toBe("vacio");
    expect(c("   ")).toBe("vacio");
    expect(c(null)).toBe("vacio");
    expect(c(undefined)).toBe("vacio");
  });

  it("cero es válido (quien llama decide) / zero is valid (the caller decides)", () => {
    expect(c("0,00")).toBe(0);
    expect(c("-0,00")).toBe(0);
  });

  it("respeta el tope de importe / honours the amount cap", () => {
    expect(c("999.999.999,99")).toBe(99999999999);
    expect(c("-999.999.999,99")).toBe(-99999999999);
    expect(c("999.999.999,995")).toBe("excede");
    expect(c("1.000.000.000,00")).toBe("excede");
    expect(c("123456789012345678901234567890")).toBe("excede");
  });
});

describe("analizarImporteBanco con punto decimal / with decimal point", () => {
  it("formatos con punto / dot formats", () => {
    expect(c("1,234.56", "punto")).toBe(123456);
    expect(c("-1,234.56", "punto")).toBe(-123456);
    expect(c("1234.56", "punto")).toBe(123456);
    expect(c("(12.30)", "punto")).toBe(-1230);
    expect(c("1,234", "punto")).toBe(123400);
    expect(c("1.234,56", "punto")).toBe("invalido");
    expect(c("12,30", "punto")).toBe("invalido");
  });
});

describe("analizarImporteBanco con números (celdas XLSX) / with numbers (XLSX cells)", () => {
  it("convierte a céntimos sin ruido binario / converts to cents without binary noise", () => {
    expect(c(-1234.56)).toBe(-123456);
    expect(c(1.005)).toBe(101);
    expect(c(0.1 + 0.2)).toBe(30);
    expect(c(12)).toBe(1200);
  });

  it("no finitos y fuera del tope / non-finite and above the cap", () => {
    expect(c(Number.NaN)).toBe("invalido");
    expect(c(Number.POSITIVE_INFINITY)).toBe("invalido");
    expect(c(1e12)).toBe("excede");
  });
});
