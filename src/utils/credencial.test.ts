/* =============================================================================
 * credencial.test.ts — Tests de mínimos y PIN débil / Minimums & weak PIN tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba los mínimos de una credencial nueva y qué PIN se avisan como débiles.
 * EN: Checks the minimums of a new credential and which PINs are flagged as weak.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { pinDebil, validarCredencial } from "./credencial";

describe("validarCredencial", () => {
  it("PIN de 4 a 6 cifras / 4 to 6 digit PIN", () => {
    expect(validarCredencial("pin", "1234")).toBeNull();
    expect(validarCredencial("pin", "123456")).toBeNull();
    expect(validarCredencial("pin", "123")).toBe("pin-formato");
    expect(validarCredencial("pin", "1234567")).toBe("pin-formato");
    expect(validarCredencial("pin", "12a4")).toBe("pin-formato");
  });

  it("contraseña de al menos 8 caracteres (cuenta letras, no bytes) / password of at least 8 characters", () => {
    expect(validarCredencial("password", "corta")).toBe("password-corta");
    expect(validarCredencial("password", "1234567")).toBe("password-corta");
    expect(validarCredencial("password", "año-ñandú")).toBeNull();
    expect(validarCredencial("password", "ñññññññ")).toBe("password-corta");
  });
});

describe("pinDebil", () => {
  it.each([
    ["0000", "repetido"],
    ["111111", "repetido"],
    ["1234", "escalera"],
    ["9876", "escalera"],
    ["345678", "escalera"],
    ["1212", "patron"],
    ["123123", "patron"],
    ["2580", "comun"],
    ["1985", "año"],
    ["2026", "año"],
  ])("%s es débil (%s) / is weak", (pin, motivo) => {
    expect(pinDebil(pin)).toBe(motivo);
  });

  it.each(["4831", "73920", "506172", "1357"])("%s no se avisa / is not flagged", (pin) => {
    expect(pinDebil(pin)).toBeNull();
  });

  it("lo que no es un PIN no se evalúa / non-PINs are not evaluated", () => {
    expect(pinDebil("abcd")).toBeNull();
  });
});
