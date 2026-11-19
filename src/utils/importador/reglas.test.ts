/* =============================================================================
 * reglas.test.ts — Tests de las reglas de categorización / Categorisation rule tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba categorizar y aplicarReglas (contiene X -> categoría Y, sin
 *     mayúsculas ni acentos, por prioridad y con signo opcional) y
 *     sugerirReglas, que propone reglas a partir de las correcciones del
 *     usuario: Mercadona, Bizum en las dos direcciones y recibos. Conceptos
 *     inventados.
 * EN: Checks categorizar and aplicarReglas (contains X -> category Y, ignoring
 *     case and accents, by priority and with an optional sign) and
 *     sugerirReglas, which proposes rules from the user's corrections:
 *     Mercadona, Bizum both ways and direct debits. Made-up concepts.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import {
  aplicarReglas,
  categorizar,
  esReglaCategoriaValida,
  sugerirReglas,
  tokensSignificativos,
  type Correccion,
  type ReglaCategoria,
} from "./reglas";

// ES: Reglas de ejemplo. / EN: Example rules.
const REGLAS: ReglaCategoria[] = [
  { id: "r1", contiene: "mercadona", categoria: "Supermercado", prioridad: 10 },
  { id: "r2", contiene: "Bizum", categoria: "Bizum recibido", prioridad: 10, signo: "ingreso" },
  { id: "r3", contiene: "recibo  LUZ", categoria: "Suministros", prioridad: 10 },
  { id: "r4", contiene: "Panadería", categoria: "Comida", prioridad: 10 },
];

describe("categorizar", () => {
  it("contiene, sin mayúsculas ni acentos / contains, ignoring case and accents", () => {
    expect(categorizar("COMPRA TARJ. 1234 MERCADONA ALGECIRAS", "gasto", REGLAS)?.categoria).toBe(
      "Supermercado"
    );
    expect(categorizar("Recibo   luz comercializadora", "gasto", REGLAS)?.id).toBe("r3");
    expect(categorizar("PANADERIA LA ESQUINA", "gasto", REGLAS)?.categoria).toBe("Comida");
    expect(categorizar("Gasolinera", "gasto", REGLAS)).toBeNull();
  });

  it("el signo opcional filtra / the optional sign filters", () => {
    expect(categorizar("BIZUM DE ANA", "ingreso", REGLAS)?.id).toBe("r2");
    expect(categorizar("BIZUM A LUIS", "gasto", REGLAS)).toBeNull();
  });

  it("gana la de menor prioridad y, a igualdad, la primera / the lowest priority wins and, if tied, the first", () => {
    const reglas: ReglaCategoria[] = [
      { id: "a", contiene: "amazon", categoria: "Compras", prioridad: 2 },
      { id: "b", contiene: "amazon prime", categoria: "Suscripciones", prioridad: 1 },
      { id: "c", contiene: "amazon", categoria: "Otra", prioridad: 2 },
    ];
    expect(categorizar("AMAZON PRIME 12/26", "gasto", reglas)?.id).toBe("b");
    expect(categorizar("AMAZON MKTPLACE", "gasto", reglas)?.id).toBe("a");
  });

  it("reglas desactivadas o vacías no cuentan / disabled or empty rules do not count", () => {
    const reglas: ReglaCategoria[] = [
      { id: "off", contiene: "cine", categoria: "Ocio", prioridad: 1, activa: false },
      { id: "vacia", contiene: "   ", categoria: "Todo", prioridad: 0 },
    ];
    expect(categorizar("CINE CENTRO", "gasto", reglas)).toBeNull();
  });
});

describe("aplicarReglas", () => {
  it("pone categoría y regla a cada fila sin tocar el resto / sets category and rule on each row without touching the rest", () => {
    const filas = [
      { linea: 2, concepto: "MERCADONA", signo: "gasto" as const, centimos: 1000 },
      { linea: 3, concepto: "GASOLINERA", signo: "gasto" as const, centimos: 4000 },
    ];
    expect(aplicarReglas(filas, REGLAS)).toEqual([
      { ...filas[0], categoria: "Supermercado", reglaId: "r1" },
      { ...filas[1], categoria: null, reglaId: null },
    ]);
  });
});

describe("tokensSignificativos", () => {
  it("quita palabras vacías, números, fechas y tokens cortos / drops stop words, numbers, dates and short tokens", () => {
    expect(
      tokensSignificativos("COMPRA TARJ. *1234 MERCADONA ALGECIRAS 01/02/26 de la S.L.")
    ).toEqual(["mercadona", "algeciras"]);
    expect(tokensSignificativos("Recibo de la Comunidad Ñandú")).toEqual(["comunidad", "nandu"]);
  });
});

describe("sugerirReglas", () => {
  it("propone «mercadona» tras varias correcciones y no la ciudad / proposes «mercadona» after several corrections and not the city", () => {
    const correcciones: Correccion[] = [
      { concepto: "COMPRA TARJ. 1234 MERCADONA ALGECIRAS 01/02", categoria: "Supermercado" },
      { concepto: "COMPRA TARJ. 1234 MERCADONA ALGECIRAS 08/02", categoria: "Supermercado" },
      { concepto: "Mercadona", categoria: "Supermercado" },
    ];
    expect(sugerirReglas(correcciones, [])).toEqual([
      {
        contiene: "mercadona",
        categoria: "Supermercado",
        apoyos: 3,
        ejemplos: [
          "COMPRA TARJ. 1234 MERCADONA ALGECIRAS 01/02",
          "COMPRA TARJ. 1234 MERCADONA ALGECIRAS 08/02",
          "Mercadona",
        ],
      },
    ]);
  });

  it("Bizum va a categorías distintas según el signo / Bizum goes to different categories depending on the sign", () => {
    const correcciones: Correccion[] = [
      { concepto: "BIZUM DE ANA", categoria: "Ingresos varios", signo: "ingreso" },
      { concepto: "BIZUM A LUIS", categoria: "Regalos", signo: "gasto" },
      { concepto: "BIZUM DE EVA", categoria: "Ingresos varios", signo: "ingreso" },
      { concepto: "BIZUM A PEPE", categoria: "Regalos", signo: "gasto" },
    ];
    expect(sugerirReglas(correcciones, []).map((s) => [s.contiene, s.signo, s.categoria])).toEqual([
      ["bizum", "ingreso", "Ingresos varios"],
      ["bizum", "gasto", "Regalos"],
    ]);
  });

  it("no propone si el token apunta a categorías distintas / does not propose if the token points to different categories", () => {
    const correcciones: Correccion[] = [
      { concepto: "BIZUM DE ANA", categoria: "Cenas", signo: "gasto" },
      { concepto: "BIZUM DE EVA", categoria: "Regalos", signo: "gasto" },
    ];
    expect(sugerirReglas(correcciones, [])).toEqual([]);
  });

  it("umbral configurable / configurable threshold", () => {
    const correcciones: Correccion[] = [
      { concepto: "RECIBO ENDESA ENERO", categoria: "Suministros" },
      { concepto: "RECIBO ENDESA FEBRERO", categoria: "Suministros" },
      { concepto: "RECIBO ENDESA MARZO", categoria: "Suministros" },
      { concepto: "RECIBO ENDESA ABRIL", categoria: "Otros" },
    ];
    expect(sugerirReglas(correcciones, [])).toEqual([]);
    expect(
      sugerirReglas(correcciones, [], { umbral: 0.75 }).map((s) => [s.contiene, s.apoyos])
    ).toEqual([["endesa", 3]]);
  });

  it("hacen falta al menos minVeces correcciones / at least minVeces corrections are needed", () => {
    const una: Correccion[] = [{ concepto: "LIBRERIA CENTRAL", categoria: "Libros" }];
    expect(sugerirReglas(una, [])).toEqual([]);
    expect(sugerirReglas(una, [], { minVeces: 1 }).map((s) => s.contiene)).toEqual(["libreria"]);
  });

  it("no repite lo que ya hace una regla, pero sí corrige una regla que categoriza mal / does not repeat an existing rule, but does fix one that categorises wrongly", () => {
    const correcciones: Correccion[] = [
      { concepto: "MERCADONA 1", categoria: "Supermercado" },
      { concepto: "MERCADONA 2", categoria: "Supermercado" },
    ];
    expect(sugerirReglas(correcciones, REGLAS)).toEqual([]);
    const mal: ReglaCategoria[] = [
      { id: "x", contiene: "mercadona", categoria: "Ropa", prioridad: 1 },
    ];
    expect(sugerirReglas(correcciones, mal).map((s) => s.categoria)).toEqual(["Supermercado"]);
  });
});

describe("esReglaCategoriaValida", () => {
  it("valida al leer de disco / validates when read from disk", () => {
    expect(esReglaCategoriaValida(JSON.parse(JSON.stringify(REGLAS[1])))).toBe(true);
    expect(esReglaCategoriaValida({ ...REGLAS[0], activa: false })).toBe(true);
    expect(esReglaCategoriaValida({ ...REGLAS[0], contiene: "  " })).toBe(false);
    expect(esReglaCategoriaValida({ ...REGLAS[0], signo: "otro" })).toBe(false);
    expect(esReglaCategoriaValida({ ...REGLAS[0], prioridad: Number.NaN })).toBe(false);
    expect(esReglaCategoriaValida({ ...REGLAS[0], categoria: 5 })).toBe(false);
    expect(esReglaCategoriaValida(null)).toBe(false);
  });
});
