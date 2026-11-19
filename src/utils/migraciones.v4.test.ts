/* =============================================================================
 * migraciones.v4.test.ts — Tests de la migración v3 → v4 / v3 → v4 migration tests
 * -----------------------------------------------------------------------------
 * ES: La v4 (1.2.0, uso real) añade las colecciones `reglas`, `perfilesBanco`,
 *     `transferencias`, `ajustesSaldo` y `correcciones`, los campos opcionales
 *     de recurrente (`frecuencia`, `fechaInicio`, `fechaFin`, `cuotas`) y de
 *     puntual (`origen`, `importId`). Unos datos v3 sin nada de esto migran sin
 *     cambiar ningún apunte, y todo lo nuevo se valida de forma estricta para
 *     que nada mal formado llegue a disco. Todos los datos son inventados.
 * EN: v4 (1.2.0, real use) adds the `reglas`, `perfilesBanco`,
 *     `transferencias`, `ajustesSaldo` and `correcciones` collections, the
 *     optional recurring fields (`frecuencia`, `fechaInicio`, `fechaFin`,
 *     `cuotas`) and the one-off ones (`origen`, `importId`). v3 data without
 *     any of this migrates without changing any entry, and everything new is
 *     strictly validated so nothing malformed reaches disk. All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { esDatosValidos, VERSION_DATOS } from "../types";
import { migrar, prepararDatos } from "./migraciones";

// ES: Datos v3 mínimos con un apunte de cada tipo. / EN: Minimal v3 data with one entry of each kind.
function v3(cambios: Record<string, unknown> = {}) {
  return {
    version: 3,
    recurrentes: [
      {
        id: "r1",
        concepto: "Nómina",
        importe: 1500,
        signo: "ingreso",
        categoria: "Nómina",
        desde: "2026-01",
        hasta: null,
        diaPago: 28,
      },
    ],
    puntuales: [
      {
        id: "p1",
        concepto: "Súper",
        importe: 80,
        signo: "gasto",
        categoria: "Supermercado",
        fecha: "2026-02-10",
        cuenta: "c1",
      },
    ],
    deudas: [],
    planes: [],
    presupuestos: [],
    plantillas: [],
    cuentas: [{ id: "c1", nombre: "Banco", saldoInicial: 100 }],
    ...cambios,
  };
}

// ES: Datos ya en la versión actual, con un cambio aplicado a la raíz.
// EN: Data already at the current version, with a change applied to the root.
function actual(cambios: Record<string, unknown> = {}) {
  return { ...prepararDatos(v3()), ...cambios } as Record<string, unknown>;
}

// ES: Datos actuales con un campo cambiado en el primer recurrente o puntual.
// EN: Current data with a field changed in the first recurring or one-off entry.
function conCampo(lista: "recurrentes" | "puntuales", campo: string, valor: unknown) {
  const d = actual() as Record<string, Record<string, unknown>[]>;
  return { ...d, [lista]: [{ ...d[lista][0], [campo]: valor }] };
}

describe("migración v3 → v4 / v3 → v4 migration", () => {
  it("la versión actual es la 4 / the current version is 4", () => {
    expect(VERSION_DATOS).toBe(4);
  });

  it("v3 sin campos nuevos migra sin tocar apuntes y con colecciones vacías / v3 migrates untouched with empty collections", () => {
    const entrada = v3();
    const d = prepararDatos(entrada);
    expect(d.version).toBe(4);
    expect(d.recurrentes).toEqual(entrada.recurrentes);
    expect(d.puntuales).toEqual(entrada.puntuales);
    expect(d.cuentas).toEqual(entrada.cuentas);
    expect(d.reglas).toEqual([]);
    expect(d.perfilesBanco).toEqual([]);
    expect(d.transferencias).toEqual([]);
    expect(d.ajustesSaldo).toEqual([]);
    expect(d.correcciones).toEqual([]);
  });

  it("no muta la entrada / does not mutate the input", () => {
    const entrada = v3();
    const copia = JSON.parse(JSON.stringify(entrada));
    migrar(entrada);
    expect(entrada).toEqual(copia);
  });

  it("una v1 llega hasta la v4 / a v1 reaches v4", () => {
    const d = prepararDatos({ recurrentes: [], puntuales: [], deudas: [] });
    expect(d.version).toBe(4);
    expect(d.reglas).toEqual([]);
  });

  it("ida y vuelta por JSON de unos datos v4 completos / JSON round trip of full v4 data", () => {
    const completo = actual({
      reglas: [{ id: "g1", contiene: "super", categoria: "Supermercado", prioridad: 1 }],
      perfilesBanco: [
        {
          id: "b1",
          nombre: "Banco de prueba",
          formatoFecha: "dma",
          formatoDecimal: "coma",
          columnas: { fecha: "Fecha", concepto: "Concepto", importe: "Importe" },
          firma: ["fecha", "concepto", "importe"],
        },
      ],
      transferencias: [{ id: "t1", origen: "c1", destino: "c2", importe: 50, fecha: "2026-02-11" }],
      ajustesSaldo: [{ id: "a1", cuenta: "c1", importe: -3.5, fecha: "2026-02-12" }],
      correcciones: [{ concepto: "COMPRA SUPER", categoria: "Supermercado", signo: "gasto" }],
      recurrentes: [
        {
          id: "r2",
          concepto: "Gimnasio",
          importe: 9.99,
          signo: "gasto",
          categoria: "Deporte",
          desde: "2026-02",
          hasta: null,
          frecuencia: "semanal",
          fechaInicio: "2026-02-03",
          fechaFin: "2026-12-31",
          cuotas: 10,
        },
      ],
      puntuales: [
        {
          id: "p2",
          concepto: "Café",
          importe: 2.5,
          signo: "gasto",
          categoria: "Restaurantes",
          fecha: "2026-02-03",
          origen: "importado",
          importId: "2026-02-03|gasto|250|cafe",
        },
      ],
    });
    expect(esDatosValidos(completo)).toBe(true);
    const vuelta = prepararDatos(JSON.parse(JSON.stringify(completo)));
    expect(vuelta).toEqual(completo);
  });
});

describe("validación v4 / v4 validation", () => {
  it("rechaza que falte una colección nueva / rejects a missing new collection", () => {
    for (const k of ["reglas", "perfilesBanco", "transferencias", "ajustesSaldo", "correcciones"]) {
      const d = actual();
      delete d[k];
      expect(esDatosValidos(d), k).toBe(false);
    }
  });

  it.each([
    ["frecuencia desconocida / unknown frequency", "frecuencia", "diaria"],
    ["fechaInicio imposible / impossible start", "fechaInicio", "2026-02-30"],
    ["fechaFin mal formada / malformed end", "fechaFin", "2026-12"],
    ["cuotas 0 / zero instalments", "cuotas", 0],
    ["cuotas decimales / decimal instalments", "cuotas", 2.5],
    ["cuotas texto / text instalments", "cuotas", "3"],
  ])("recurrente: rechaza %s / recurring: rejects", (_n, campo, valor) => {
    expect(esDatosValidos(conCampo("recurrentes", campo, valor))).toBe(false);
  });

  it("recurrente: acepta los campos nuevos bien formados / recurring: accepts well-formed new fields", () => {
    for (const [campo, valor] of [
      ["frecuencia", "trimestral"],
      ["fechaInicio", "2026-01-15"],
      ["fechaFin", "2027-01-15"],
      ["cuotas", 12],
    ] as const) {
      expect(esDatosValidos(conCampo("recurrentes", campo, valor)), campo).toBe(true);
    }
  });

  it.each([
    ["origen desconocido / unknown origin", "origen", "banco"],
    ["importId vacío / empty importId", "importId", ""],
    ["importId no texto / non-text importId", "importId", 5],
  ])("puntual: rechaza %s / one-off: rejects", (_n, campo, valor) => {
    expect(esDatosValidos(conCampo("puntuales", campo, valor))).toBe(false);
  });

  it("puntual: acepta origen manual e importado / one-off: accepts manual and imported origin", () => {
    expect(esDatosValidos(conCampo("puntuales", "origen", "manual"))).toBe(true);
    expect(esDatosValidos(conCampo("puntuales", "origen", "importado"))).toBe(true);
  });

  it.each([
    ["regla sin texto / rule without text", "reglas", { id: "g", contiene: " ", categoria: "X", prioridad: 0 }],
    ["perfil con media pareja / profile with half a pair", "perfilesBanco", {
      id: "b", nombre: "B", formatoFecha: "dma", formatoDecimal: "coma",
      columnas: { fecha: "F", concepto: "C", cargo: "Cargo" },
    }],
    ["transferencia con importe 0 / transfer with zero amount", "transferencias", {
      id: "t", origen: "c1", destino: "c2", importe: 0, fecha: "2026-02-01",
    }],
    ["transferencia con fecha imposible / transfer with impossible date", "transferencias", {
      id: "t", origen: "c1", destino: "c2", importe: 5, fecha: "2026-02-30",
    }],
    ["ajuste con importe NaN / adjustment with NaN", "ajustesSaldo", {
      id: "a", cuenta: "c1", importe: Number.NaN, fecha: "2026-02-01",
    }],
    ["corrección sin categoría / correction without category", "correcciones", { concepto: "X" }],
  ])("rechaza %s / rejects", (_n, coleccion, elemento) => {
    expect(esDatosValidos(actual({ [coleccion]: [elemento] }))).toBe(false);
  }); // prettier-ignore
});
