/* =============================================================================
 * importar.test.ts — Tests del paso final de la importación / Final import step tests
 * -----------------------------------------------------------------------------
 * ES: Huella de cada fila (reconoce el mismo movimiento al reimportar aunque
 *     se edite el concepto), qué filas entran por defecto según sus marcas de
 *     duplicado y cómo se convierten en puntuales con la categoría de las
 *     reglas. Todos los datos son inventados.
 * EN: Fingerprint of each row (recognises the same movement when re-importing
 *     even if the concept is edited), which rows go in by default according
 *     to their duplicate flags and how they become one-off entries with the
 *     rules' category. All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { IMPORT_ID_MAX, type Puntual } from "../../types";
import { detectarDuplicados, type MarcaDuplicado } from "./duplicados";
import {
  comparablesDe,
  crearPuntualesImportados,
  filasAImportar,
  huellaFila,
  leerHuella,
  marcarDuplicados,
} from "./importar";
import type { ReglaCategoria } from "./reglas";
import type { FilaImportada } from "./vistaPrevia";

// ES: Fila importada de prueba. / EN: Test imported row.
function fila(linea: number, concepto: string, centimos: number, signo: "ingreso" | "gasto" = "gasto", fecha = "2026-02-03"): FilaImportada {
  return { linea, fecha, concepto, centimos, importe: centimos / 100, signo };
} // prettier-ignore

describe("huella / fingerprint", () => {
  it("fecha, signo, céntimos y concepto normalizado / date, sign, cents and normalised concept", () => {
    expect(huellaFila(fila(1, "  Café   CENTRAL ", 250))).toBe("2026-02-03|gasto|250|cafe central");
  });

  it("se lee de vuelta, también con | en el concepto / reads back, even with | in the concept", () => {
    expect(leerHuella(huellaFila(fila(1, "A|B", 1234, "ingreso")))).toEqual({
      fecha: "2026-02-03",
      signo: "ingreso",
      importe: 12.34,
      concepto: "a|b",
    });
    expect(leerHuella("roto")).toBeNull();
    expect(leerHuella("2026-02-03|otro|5|x")).toBeNull();
  });

  it("nunca pasa del tope / never exceeds the cap", () => {
    expect(huellaFila(fila(1, "x".repeat(2000), 1)).length).toBeLessThanOrEqual(IMPORT_ID_MAX);
  });
});

describe("comparablesDe / comparablesDe", () => {
  it("un puntual importado se compara con su texto de banco aunque se edite / an imported one compares with its bank text even if edited", () => {
    const original = fila(1, "COMPRA SUPER BARRIO", 4567);
    const editado: Puntual = {
      id: "p1",
      concepto: "La compra de la semana",
      importe: 45.67,
      signo: "gasto",
      categoria: "Supermercado",
      fecha: "2026-02-04",
      origen: "importado",
      importId: huellaFila(original),
    };
    const marcas = detectarDuplicados(
      [fila(9, "Compra súper barrio", 4567)],
      comparablesDe([editado])
    );
    expect(marcas).toEqual([{ linea: 9, tipo: "apuntado", id: "p1", dias: 0 }]);
  });

  it("un puntual a mano se compara tal cual / a manual one compares as is", () => {
    const manual: Puntual = {
      id: "p2",
      concepto: "Cafe central",
      importe: 2.5,
      signo: "gasto",
      categoria: "Restaurantes",
      fecha: "2026-02-03",
    };
    expect(comparablesDe([manual])).toEqual([
      { id: "p2", fecha: "2026-02-03", concepto: "Cafe central", importe: 2.5, signo: "gasto" },
    ]);
  });
});

describe("filasAImportar / filasAImportar", () => {
  const filas = [fila(1, "A", 100), fila(2, "B", 200), fila(3, "B", 200)];
  const marcas: MarcaDuplicado[] = [
    { linea: 1, tipo: "apuntado", id: "p1", dias: 0 },
    { linea: 3, tipo: "fichero", lineaOriginal: 2 },
  ];

  it("por defecto salta lo ya apuntado y deja lo repetido en el fichero / by default skips what is entered and keeps file repeats", () => {
    expect(filasAImportar(filas, marcas, new Map()).map((f) => f.linea)).toEqual([2, 3]);
  });

  it("el usuario puede incluir un duplicado o excluir cualquier fila / the user can include a duplicate or exclude any row", () => {
    const decision = new Map([
      [1, true],
      [3, false],
    ]);
    expect(filasAImportar(filas, marcas, decision).map((f) => f.linea)).toEqual([1, 2]);
  });
});

describe("crearPuntualesImportados / crearPuntualesImportados", () => {
  const reglas: ReglaCategoria[] = [
    { id: "g1", contiene: "super", categoria: "Supermercado", prioridad: 1 },
    { id: "g2", contiene: "bizum", categoria: "Otros ingresos", prioridad: 2, signo: "ingreso" },
  ];

  it("categoría por reglas, origen importado, huella y cuenta / category by rules, imported origin, fingerprint and account", () => {
    const r = crearPuntualesImportados(
      [fila(1, " COMPRA SUPER ", 4567), fila(2, "BIZUM DE ALGUIEN", 1500, "ingreso"), fila(3, "BIZUM A ALGUIEN", 900)],
      reglas,
      { cuenta: "c1" }
    );
    expect(r).toEqual([
      { concepto: "COMPRA SUPER", importe: 45.67, signo: "gasto", categoria: "Supermercado", fecha: "2026-02-03", cuenta: "c1", origen: "importado", importId: "2026-02-03|gasto|4567|compra super" },
      { concepto: "BIZUM DE ALGUIEN", importe: 15, signo: "ingreso", categoria: "Otros ingresos", fecha: "2026-02-03", cuenta: "c1", origen: "importado", importId: "2026-02-03|ingreso|1500|bizum de alguien" },
      { concepto: "BIZUM A ALGUIEN", importe: 9, signo: "gasto", categoria: "Otros", fecha: "2026-02-03", cuenta: "c1", origen: "importado", importId: "2026-02-03|gasto|900|bizum a alguien" },
    ]);
  }); // prettier-ignore

  it("sin cuenta no pone el campo y respeta la categoría por defecto dada / without account the field is absent and the given default is used", () => {
    const [p] = crearPuntualesImportados([fila(1, "NADA", 100)], [], {
      categoriaPorDefecto: "Compras",
    });
    expect(p.cuenta).toBeUndefined();
    expect(p.categoria).toBe("Compras");
  });
});

describe("marcarDuplicados / marcarDuplicados", () => {
  // ES: Puntual de prueba. / EN: Test one-off entry.
  const p = (id: string, concepto: string, importe: number, extra: Partial<Puntual> = {}): Puntual => ({
    id, concepto, importe, signo: "gasto", categoria: "Otros", fecha: "2026-02-03", ...extra,
  }); // prettier-ignore

  it("con cuenta destino solo mira esa cuenta y lo que no tiene cuenta / with a destination account it only looks at that account and unassigned items", () => {
    const filas = [fila(1, "CUOTA", 500), fila(2, "CUOTA", 500)];
    const otra = p("a", "CUOTA", 5, { cuenta: "otra" });
    const sinCuenta = p("b", "CUOTA", 5);
    const marcas = marcarDuplicados(filas, [otra, sinCuenta], { cuenta: "banco" });
    expect(marcas.filter((m) => m.tipo === "apuntado")).toEqual([
      { linea: 1, tipo: "apuntado", id: "b", dias: 0 },
    ]);
    // ES: Sin cuenta destino se mira todo. / EN: Without a destination account everything is checked.
    expect(marcarDuplicados(filas, [otra, sinCuenta], {}).filter((m) => m.tipo === "apuntado")).toHaveLength(2);
  }); // prettier-ignore

  it("la búsqueda tolerante no reutiliza un apunte ya emparejado / the tolerant pass does not reuse an already paired entry", () => {
    const filas = [fila(1, "CAFE CENTRAL", 250), fila(2, "OTRO TEXTO", 250, "gasto", "2026-02-04")];
    const manual = p("m", "cafe central", 2.5);
    const marcas = marcarDuplicados(filas, [manual], { manuales: true });
    expect(marcas).toEqual([{ linea: 1, tipo: "apuntado", id: "m", dias: 0 }]);
  });

  it("la búsqueda tolerante encuentra lo apuntado a mano con otro texto y otro día / the tolerant pass finds hand-entered items with other text and day", () => {
    const filas = [fila(1, "COMPRA TARJ 1234 PANADERIA", 180, "gasto", "2026-02-05")];
    const manual = p("m", "Pan", 1.8);
    expect(marcarDuplicados(filas, [manual], {})).toEqual([]);
    expect(marcarDuplicados(filas, [manual], { manuales: true })).toEqual([
      { linea: 1, tipo: "apuntado", id: "m", dias: 2 },
    ]);
  });

  it("un concepto larguísimo se reconoce al reimportar / a very long concept is recognised on re-import", () => {
    const largo = "COMPRA ".repeat(150);
    const f = fila(1, largo, 999);
    const importado = p("i", largo, 9.99, { origen: "importado", importId: huellaFila(f) });
    expect(marcarDuplicados([f], [importado], {})).toEqual([
      { linea: 1, tipo: "apuntado", id: "i", dias: 0 },
    ]);
  });
});
