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
import { VERSION_DATOS, type DatosBolsillo } from "../types";
import { cifrar, descifrar } from "./cripto";
import * as almacen from "./almacen";

// ES: Clave de localStorage que usa almacen.ts. / EN: localStorage key used by almacen.ts.
const CLAVE_DATOS = "bolsillo.datos.cif";

// ES: Datos mínimos válidos con un texto fácil de buscar en el blob cifrado.
// EN: Minimal valid data with a text that is easy to look for in the blob.
const datos: DatosBolsillo = {
  version: VERSION_DATOS,
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
    expect(await almacen.leer()).toEqual({ estado: "vacio" });

    await almacen.guardar(datos);
    expect(almacen.hayDatos()).toBe(true);
    expect(localStorage.getItem(CLAVE_DATOS)).not.toContain("TEXTO-SECRETO");
    expect(await almacen.leer()).toEqual({ estado: "ok", datos });
  });

  it("con PIN solo ese PIN abre los datos / with a PIN only that PIN opens the data", async () => {
    almacen.usarSecreto("2468");
    await almacen.guardar(datos);

    expect(await almacen.secretoValido("2468")).toBe(true);
    expect(await almacen.secretoValido("0000")).toBe(false);

    // ES: Con el secreto de ofuscación ya no se puede leer.
    // EN: The obfuscation secret can no longer read it.
    //     AES-GCM no distingue credencial mala de cifrado alterado: "credencial".
    // EN: AES-GCM cannot tell a wrong credential from altered ciphertext: "credencial".
    almacen.usarOfuscacion();
    expect(await almacen.leer()).toEqual({ estado: "credencial" });
  });

  it("sin datos cualquier PIN vale para empezar / with no data any PIN is valid", async () => {
    expect(await almacen.secretoValido("9999")).toBe(true);
  });

  it("los guardados seguidos quedan en orden / back-to-back saves keep their order", async () => {
    const primero = { ...datos, puntuales: [] };
    void almacen.guardar(primero);
    await almacen.guardar(datos);
    expect(await almacen.leer()).toEqual({ estado: "ok", datos });
  });

  it("descifra pero no valida: invalido / decrypts but invalid: invalido", async () => {
    localStorage.setItem(CLAVE_DATOS, await cifrar(JSON.stringify({ hola: 1 }), "2468"));
    almacen.usarSecreto("2468");
    expect(await almacen.leer()).toEqual({ estado: "invalido" });
  });

  it("de una versión más nueva: version / from a newer version: version", async () => {
    const futuro = { ...datos, version: VERSION_DATOS + 1 };
    localStorage.setItem(CLAVE_DATOS, await cifrar(JSON.stringify(futuro), "2468"));
    expect(await almacen.leer("2468")).toEqual({ estado: "version" });
  });

  it.each([
    ["JSON roto / broken JSON", "{roto"],
    ["no es objeto / not an object", "[1,2]"],
    ["faltan campos / missing fields", JSON.stringify({ v: 1, salt: "AAAA" })],
    ["base64 roto / broken base64", JSON.stringify({ v: 1, salt: "@@", iv: "@@", ct: "@@" })],
    [
      "tamaños imposibles / impossible sizes",
      JSON.stringify({ v: 1, salt: "AAAA", iv: "AAAA", ct: "AAAA" }),
    ],
  ])("sobre dañado (%s): danado sin pedir secreto / damaged envelope", async (_n, blob) => {
    localStorage.setItem(CLAVE_DATOS, blob);
    expect(almacen.sobreLegible()).toBe(false);
    expect(await almacen.leer()).toEqual({ estado: "danado" });
  });

  it("v1 sin versión se migra al leer / unversioned v1 is migrated on read", async () => {
    // ES: Forma de la 1.1.0: sin version ni colecciones opcionales.
    // EN: 1.1.0 shape: no version nor optional collections.
    const v1 = { recurrentes: [], puntuales: datos.puntuales, deudas: [] };
    localStorage.setItem(CLAVE_DATOS, await cifrar(JSON.stringify(v1), "2468"));
    expect(await almacen.leer("2468")).toEqual({ estado: "ok", datos });
  });

  it("rescate: copia el blob sin pisar ni duplicar / rescue: copies the blob without overwriting or duplicating", async () => {
    await almacen.guardar(datos);
    const blob = localStorage.getItem(CLAVE_DATOS);
    const fecha = new Date("2026-11-19T09:30:00Z");
    // ES: Un rescate previo distinto con la misma fecha no se pisa.
    // EN: A different earlier rescue with the same date is not overwritten.
    localStorage.setItem(almacen.PREFIJO_RESCATE + "2026-11-19T09-30-00", "anterior");
    const clave = almacen.crearRescate(fecha);
    expect(clave).toBe(almacen.PREFIJO_RESCATE + "2026-11-19T09-30-00-2");
    expect(localStorage.getItem(clave)).toBe(blob);
    expect(localStorage.getItem(almacen.PREFIJO_RESCATE + "2026-11-19T09-30-00")).toBe("anterior");
    // ES: Mismo contenido: devuelve el rescate existente. / EN: Same content: returns the existing one.
    expect(almacen.crearRescate(new Date("2027-01-01T00:00:00Z"))).toBe(clave);
  });
});
