/* =============================================================================
 * cripto.test.ts — Tests del cifrado con PIN / PIN encryption tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba el cifrado AES-GCM (cripto.ts) y el almacén cifrado
 *     (almacen.ts): ida y vuelta, PIN incorrecto, datos manipulados, salt/IV
 *     nuevos en cada cifrado y que en disco nunca queda nada en claro.
 * EN: Checks AES-GCM encryption (cripto.ts) and the encrypted store
 *     (almacen.ts): round trip, wrong PIN, tampered data, fresh salt/IV on
 *     every encryption and that nothing is ever stored in plaintext.
 * ===========================================================================*/
import { beforeEach, describe, expect, it } from "vitest";
import type { DatosBolsillo } from "../types";
import { cifrar, descifrar } from "./cripto";
import * as almacen from "./almacen";

// ES: Clave de localStorage que usa almacen.ts. / EN: localStorage key used by almacen.ts.
const CLAVE_DATOS = "bolsillo.datos.cif";

// ES: Datos mínimos válidos con un texto fácil de buscar en el blob cifrado.
// EN: Minimal valid data with a text that is easy to look for in the blob.
const datos: DatosBolsillo = {
  recurrentes: [],
  puntuales: [
    {
      id: "p1",
      concepto: "TEXTO-SECRETO",
      importe: 12.5,
      signo: "gasto",
      categoria: "Ocio",
      fecha: "2026-10-01",
    },
  ],
  deudas: [],
  planes: [],
  presupuestos: [],
  plantillas: [],
  cuentas: [],
};

describe("cifrar / descifrar", () => {
  it("descifra con el mismo PIN / decrypts with the same PIN", async () => {
    const blob = await cifrar("hola Bolsillo", "1234");
    expect(await descifrar(blob, "1234")).toBe("hola Bolsillo");
  });

  it("el blob no contiene el texto en claro / the blob has no plaintext", async () => {
    const blob = await cifrar("TEXTO-SECRETO", "1234");
    expect(blob).not.toContain("TEXTO-SECRETO");
    expect(JSON.parse(blob)).toMatchObject({ v: 1 });
  });

  it("falla con un PIN incorrecto / fails with a wrong PIN", async () => {
    const blob = await cifrar("hola", "1234");
    await expect(descifrar(blob, "4321")).rejects.toThrow();
  });

  it("falla si el cifrado se ha manipulado / fails if the ciphertext was tampered with", async () => {
    const blob = JSON.parse(await cifrar("hola", "1234"));
    // ES: Cambia el primer carácter base64 del cifrado por otro distinto.
    // EN: Swap the first base64 character of the ciphertext for a different one.
    blob.ct = (blob.ct[0] === "A" ? "B" : "A") + blob.ct.slice(1);
    await expect(descifrar(JSON.stringify(blob), "1234")).rejects.toThrow();
  });

  it("usa salt e IV nuevos en cada cifrado / uses a fresh salt and IV every time", async () => {
    const a = JSON.parse(await cifrar("igual", "1234"));
    const b = JSON.parse(await cifrar("igual", "1234"));
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.ct).not.toBe(b.ct);
  });
});

describe("almacen cifrado / encrypted store", () => {
  // ES: Disco vacío y secreto de ofuscación en cada test.
  // EN: Empty disk and the obfuscation secret for every test.
  beforeEach(() => {
    localStorage.clear();
    almacen.usarOfuscacion();
  });

  it("guarda cifrado y carga lo mismo / saves encrypted and loads it back", async () => {
    expect(almacen.hayDatos()).toBe(false);
    expect(await almacen.cargar()).toBeNull();

    await almacen.guardar(datos);
    expect(almacen.hayDatos()).toBe(true);
    expect(localStorage.getItem(CLAVE_DATOS)).not.toContain("TEXTO-SECRETO");
    expect(await almacen.cargar()).toEqual(datos);
  });

  it("con PIN solo ese PIN abre los datos / with a PIN only that PIN opens the data", async () => {
    almacen.usarSecreto("2468");
    await almacen.guardar(datos);

    expect(await almacen.secretoValido("2468")).toBe(true);
    expect(await almacen.secretoValido("0000")).toBe(false);

    // ES: Con el secreto de ofuscación ya no se puede leer.
    // EN: The obfuscation secret can no longer read it.
    almacen.usarOfuscacion();
    await expect(almacen.cargar()).rejects.toThrow();
  });

  it("sin datos cualquier PIN vale para empezar / with no data any PIN is valid", async () => {
    expect(await almacen.secretoValido("9999")).toBe(true);
  });

  it("los guardados seguidos quedan en orden / back-to-back saves keep their order", async () => {
    const primero = { ...datos, puntuales: [] };
    void almacen.guardar(primero);
    await almacen.guardar(datos);
    expect(await almacen.cargar()).toEqual(datos);
  });

  it("devuelve null si lo descifrado no es una copia válida / returns null for invalid content", async () => {
    localStorage.setItem(CLAVE_DATOS, await cifrar(JSON.stringify({ hola: 1 }), "2468"));
    almacen.usarSecreto("2468");
    expect(await almacen.cargar()).toBeNull();
  });
});
