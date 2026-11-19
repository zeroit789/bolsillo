/* =============================================================================
 * recurrencia.test.ts — Tests de recurrentes reales / Real recurring entry tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba ocurrenciasEnMes: compatibilidad exacta con el recurrente
 *     mensual de hoy (sin `frecuencia`), frecuencias semanal (4 o 5 en el mes
 *     con fechas exactas), mensual, trimestral y anual, días 31 y 29 de
 *     febrero, inicio a mitad de mes, fin por fecha o por cuotas y el
 *     invariante «la suma de todo el rango es cuotas × importe».
 *     Todos los datos son inventados.
 * EN: Checks ocurrenciasEnMes: exact compatibility with today's monthly
 *     recurring entry (no `frecuencia`), weekly (4 or 5 in the month with
 *     exact dates), monthly, quarterly and yearly frequencies, day 31 and
 *     29 February, mid-month start, end by date or by instalments and the
 *     invariant «the sum over the whole range is instalments × amount».
 *     All data is made up.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { cobrosProximos, ocurrenciasEnMes, type RecurrenteProgramable } from "./recurrencia";

// ES: Fechas del mes de un recurrente (atajo). / EN: Month dates of an entry (shortcut).
const fechas = (r: RecurrenteProgramable, mes: string) => ocurrenciasEnMes(r, mes).fechas;

// ES: Lista de meses "AAAA-MM" entre dos (incluidos).
// EN: List of "YYYY-MM" months between two (inclusive).
function meses(desde: string, hasta: string): string[] {
  const lista: string[] = [];
  let [a, m] = desde.split("-").map(Number);
  for (;;) {
    const mes = `${a}-${String(m).padStart(2, "0")}`;
    lista.push(mes);
    if (mes === hasta) return lista;
    m++;
    if (m === 13) {
      m = 1;
      a++;
    }
  }
}

describe("compatibilidad con el recurrente mensual actual / compatibility with today's monthly entry", () => {
  // ES: Copia literal de recurrenteVivo (stores/finanzas.ts) para comparar.
  // EN: Literal copy of recurrenteVivo (stores/finanzas.ts) to compare with.
  const recurrenteVivo = (r: { desde: string; hasta: string | null }, mes: string) =>
    r.desde <= mes && (r.hasta === null || mes <= r.hasta);

  const casos: RecurrenteProgramable[] = [
    { importe: 1200, desde: "2025-03", hasta: null },
    { importe: 9.99, desde: "2025-12", hasta: "2026-02" },
    { importe: 50, desde: "2026-01", hasta: "2026-01", diaPago: 31 },
    { importe: 700, desde: "2024-11", hasta: "2027-06", diaPago: 1 },
    { importe: 30, desde: "2026-02", hasta: null, diaPago: 30 },
  ];

  it("sin frecuencia: una vez cada mes vivo, ni más ni menos / without frequency: once per live month, no more no less", () => {
    for (const r of casos) {
      for (const mes of meses("2024-01", "2028-12")) {
        const o = ocurrenciasEnMes(r, mes);
        expect(o.veces, `${JSON.stringify(r)} ${mes}`).toBe(recurrenteVivo(r, mes) ? 1 : 0);
        expect(o.importe).toBe(recurrenteVivo(r, mes) ? r.importe : 0);
      }
    }
  });

  it("el día de pago fija la fecha y se recorta al final del mes / the payment day sets the date and is clipped to month end", () => {
    expect(fechas({ importe: 30, desde: "2026-02", hasta: null, diaPago: 30 }, "2026-02")).toEqual([
      "2026-02-28",
    ]);
    expect(fechas({ importe: 30, desde: "2026-02", hasta: null }, "2026-03")).toEqual([
      "2026-03-01",
    ]);
  });
});

describe("mensual, trimestral y anual / monthly, quarterly and yearly", () => {
  it("día 31 se recorta al último día sin saltarse el mes / day 31 is clipped to the last day without skipping the month", () => {
    const r: RecurrenteProgramable = {
      importe: 10,
      desde: "2026-01",
      hasta: null,
      frecuencia: "mensual",
      fechaInicio: "2026-01-31",
    };
    expect(fechas(r, "2026-01")).toEqual(["2026-01-31"]);
    expect(fechas(r, "2026-02")).toEqual(["2026-02-28"]);
    expect(fechas(r, "2026-03")).toEqual(["2026-03-31"]);
    expect(fechas(r, "2026-04")).toEqual(["2026-04-30"]);
    expect(fechas(r, "2028-02")).toEqual(["2028-02-29"]);
  });

  it("anual el 29 de febrero / yearly on 29 February", () => {
    const r: RecurrenteProgramable = {
      importe: 300,
      desde: "2028-02",
      hasta: null,
      frecuencia: "anual",
      fechaInicio: "2028-02-29",
    };
    expect(fechas(r, "2028-02")).toEqual(["2028-02-29"]);
    expect(fechas(r, "2029-02")).toEqual(["2029-02-28"]);
    expect(fechas(r, "2032-02")).toEqual(["2032-02-29"]);
    expect(fechas(r, "2028-03")).toEqual([]);
    expect(fechas(r, "2027-02")).toEqual([]);
  });

  it("trimestral cada tres meses desde el inicio / quarterly every three months from the start", () => {
    const r: RecurrenteProgramable = {
      importe: 90,
      desde: "2026-01",
      hasta: null,
      frecuencia: "trimestral",
      fechaInicio: "2026-01-15",
    };
    const conCobro = meses("2026-01", "2026-12").filter((m) => fechas(r, m).length > 0);
    expect(conCobro).toEqual(["2026-01", "2026-04", "2026-07", "2026-10"]);
    expect(fechas(r, "2027-01")).toEqual(["2027-01-15"]);
  });

  it("inicio a mitad de mes con día de pago anterior: empieza el siguiente ciclo / mid-month start with an earlier payment day: starts next cycle", () => {
    const mensual: RecurrenteProgramable = {
      importe: 20,
      desde: "2026-01",
      hasta: null,
      diaPago: 5,
      fechaInicio: "2026-01-20",
    };
    expect(fechas(mensual, "2026-01")).toEqual([]);
    expect(fechas(mensual, "2026-02")).toEqual(["2026-02-05"]);
    const trimestral = { ...mensual, frecuencia: "trimestral" as const };
    expect(fechas(trimestral, "2026-01")).toEqual([]);
    expect(fechas(trimestral, "2026-02")).toEqual([]);
    expect(fechas(trimestral, "2026-04")).toEqual(["2026-04-05"]);
  });
});

describe("semanal / weekly", () => {
  const lunes: RecurrenteProgramable = {
    importe: 9.99,
    desde: "2026-01",
    hasta: null,
    frecuencia: "semanal",
    fechaInicio: "2026-01-05",
  };

  it("4 o 5 veces según el mes, con fechas exactas / 4 or 5 times depending on the month, with exact dates", () => {
    expect(fechas(lunes, "2026-01")).toEqual([
      "2026-01-05",
      "2026-01-12",
      "2026-01-19",
      "2026-01-26",
    ]);
    expect(fechas(lunes, "2026-02")).toEqual([
      "2026-02-02",
      "2026-02-09",
      "2026-02-16",
      "2026-02-23",
    ]);
    const marzo = ocurrenciasEnMes(lunes, "2026-03");
    expect(marzo.fechas).toEqual([
      "2026-03-02",
      "2026-03-09",
      "2026-03-16",
      "2026-03-23",
      "2026-03-30",
    ]);
    expect(marzo.veces).toBe(5);
    expect(marzo.centimos).toBe(4995);
    expect(marzo.importe).toBe(49.95);
  });

  it("cruza el cambio de hora sin perder días / crosses the DST change without losing days", () => {
    // ES: En España la hora cambia el 29-3-2026 y el 25-10-2026.
    // EN: In Spain clocks change on 29-3-2026 and 25-10-2026.
    expect(fechas(lunes, "2026-04")[0]).toBe("2026-04-06");
    expect(fechas(lunes, "2026-11")[0]).toBe("2026-11-02");
  });

  it("empieza a mitad de mes / starts mid-month", () => {
    expect(fechas({ ...lunes, fechaInicio: "2026-01-15" }, "2026-01")).toEqual([
      "2026-01-15",
      "2026-01-22",
      "2026-01-29",
    ]);
  });

  it("antes del inicio no hay nada / nothing before the start", () => {
    expect(ocurrenciasEnMes(lunes, "2025-12").veces).toBe(0);
  });
});

describe("fin por fecha o por cuotas / end by date or by instalments", () => {
  it("cuotas que acaban a mitad de mes (semanal) / instalments ending mid-month (weekly)", () => {
    const r: RecurrenteProgramable = {
      importe: 25,
      desde: "2026-01",
      hasta: null,
      frecuencia: "semanal",
      fechaInicio: "2026-01-05",
      cuotas: 6,
    };
    expect(ocurrenciasEnMes(r, "2026-01").veces).toBe(4);
    expect(fechas(r, "2026-02")).toEqual(["2026-02-02", "2026-02-09"]);
    expect(ocurrenciasEnMes(r, "2026-03").veces).toBe(0);
  });

  it("cuotas mensuales y trimestrales / monthly and quarterly instalments", () => {
    const mensual: RecurrenteProgramable = {
      importe: 100,
      desde: "2026-01",
      hasta: null,
      diaPago: 10,
      cuotas: 3,
    };
    expect(meses("2025-12", "2026-06").map((m) => ocurrenciasEnMes(mensual, m).veces)).toEqual([
      0, 1, 1, 1, 0, 0, 0,
    ]);
    const trimestral: RecurrenteProgramable = {
      importe: 100,
      desde: "2026-01",
      hasta: null,
      frecuencia: "trimestral",
      fechaInicio: "2026-01-15",
      cuotas: 2,
    };
    expect(fechas(trimestral, "2026-04")).toEqual(["2026-04-15"]);
    expect(fechas(trimestral, "2026-07")).toEqual([]);
  });

  it("las cuotas cuentan desde el primer cobro real / instalments count from the first real charge", () => {
    const r: RecurrenteProgramable = {
      importe: 20,
      desde: "2026-01",
      hasta: null,
      diaPago: 5,
      fechaInicio: "2026-01-20",
      cuotas: 2,
    };
    expect(meses("2026-01", "2026-04").map((m) => fechas(r, m))).toEqual([
      [],
      ["2026-02-05"],
      ["2026-03-05"],
      [],
    ]);
  });

  it("fin por fecha exacta o por mes / end by exact date or by month", () => {
    const semanal: RecurrenteProgramable = {
      importe: 5,
      desde: "2026-01",
      hasta: null,
      frecuencia: "semanal",
      fechaInicio: "2026-01-05",
      fechaFin: "2026-01-20",
    };
    expect(fechas(semanal, "2026-01")).toEqual(["2026-01-05", "2026-01-12", "2026-01-19"]);
    expect(fechas(semanal, "2026-02")).toEqual([]);
    const mensual: RecurrenteProgramable = {
      importe: 5,
      desde: "2026-01",
      hasta: null,
      diaPago: 5,
      fechaFin: "2026-03-04",
    };
    expect(fechas(mensual, "2026-02")).toEqual(["2026-02-05"]);
    expect(fechas(mensual, "2026-03")).toEqual([]);
    expect(fechas({ ...mensual, fechaFin: undefined, hasta: "2026-02" }, "2026-03")).toEqual([]);
  });

  it("invariante: la suma de todo el rango es cuotas × importe / invariant: the sum over the range is instalments × amount", () => {
    const configuraciones: RecurrenteProgramable[] = [
      { importe: 12.34, desde: "2026-01", hasta: null, frecuencia: "semanal", fechaInicio: "2026-01-29", cuotas: 17 },
      { importe: 12.34, desde: "2026-01", hasta: null, frecuencia: "mensual", fechaInicio: "2026-01-31", cuotas: 13 },
      { importe: 12.34, desde: "2026-01", hasta: null, frecuencia: "trimestral", fechaInicio: "2026-11-30", cuotas: 7 },
      { importe: 12.34, desde: "2028-02", hasta: null, frecuencia: "anual", fechaInicio: "2028-02-29", cuotas: 5 },
      { importe: 12.34, desde: "2026-01", hasta: null, diaPago: 3, fechaInicio: "2026-01-20", cuotas: 4 },
    ]; // prettier-ignore
    for (const r of configuraciones) {
      let veces = 0;
      let centimos = 0;
      for (const mes of meses("2025-01", "2036-12")) {
        const o = ocurrenciasEnMes(r, mes);
        veces += o.veces;
        centimos += o.centimos;
      }
      expect(veces, JSON.stringify(r)).toBe(r.cuotas);
      expect(centimos).toBe((r.cuotas ?? 0) * 1234);
    }
  });

  it("cuotas no válidas o mes mal escrito: nada / invalid instalments or badly written month: nothing", () => {
    const base: RecurrenteProgramable = { importe: 5, desde: "2026-01", hasta: null };
    expect(ocurrenciasEnMes({ ...base, cuotas: 0 }, "2026-01").veces).toBe(0);
    expect(ocurrenciasEnMes({ ...base, cuotas: -2 }, "2026-01").veces).toBe(0);
    expect(ocurrenciasEnMes(base, "2026-13").veces).toBe(0);
    expect(ocurrenciasEnMes(base, "enero").veces).toBe(0);
  });

  it("fechas imposibles o día de pago fuera de rango: nada, sin adivinar / impossible dates or out-of-range payment day: nothing, no guessing", () => {
    const base: RecurrenteProgramable = { importe: 5, desde: "2026-01", hasta: null };
    // ES: Date.UTC llevaría el 30-2 al 2-3 y movería el inicio o alargaría el fin.
    // EN: Date.UTC would turn 30-2 into 2-3 and move the start or extend the end.
    for (const mes of ["2026-02", "2026-03", "2026-04"]) {
      expect(ocurrenciasEnMes({ ...base, fechaInicio: "2026-02-30" }, mes).veces).toBe(0);
      expect(ocurrenciasEnMes({ ...base, fechaFin: "2026-02-30" }, mes).veces).toBe(0);
      expect(ocurrenciasEnMes({ ...base, fechaInicio: "2026-02-03x" }, mes).veces).toBe(0);
    }
    for (const diaPago of [0, 32, 1.5, -1]) {
      expect(ocurrenciasEnMes({ ...base, diaPago }, "2026-02").veces).toBe(0);
    }
    expect(ocurrenciasEnMes({ ...base, desde: "2026-1" }, "2026-02").veces).toBe(0);
    // ES: Años 0000-0099: Date.UTC los llevaría a 1900-1999.
    // EN: Years 0000-0099: Date.UTC would turn them into 1900-1999.
    expect(ocurrenciasEnMes({ ...base, desde: "0099-01" }, "0099-01").veces).toBe(0);
    expect(ocurrenciasEnMes({ ...base, fechaInicio: "0050-01-01" }, "2026-02").veces).toBe(0);
  });
});

describe("cobros próximos / upcoming charges", () => {
  it("devuelve los cobros entre hoy y dentro de N días, cruzando el mes / returns the charges from today to N days ahead, across months", () => {
    const semanal: RecurrenteProgramable = {
      importe: 5,
      desde: "2026-01",
      hasta: null,
      frecuencia: "semanal",
      fechaInicio: "2026-01-29",
    };
    expect(cobrosProximos(semanal, "2026-01-29", 3)).toEqual(["2026-01-29"]);
    expect(cobrosProximos(semanal, "2026-02-03", 3)).toEqual(["2026-02-05"]);
    const mensual: RecurrenteProgramable = {
      importe: 5,
      desde: "2026-01",
      hasta: null,
      diaPago: 1,
    };
    expect(cobrosProximos(mensual, "2026-01-30", 3)).toEqual(["2026-02-01"]);
    expect(cobrosProximos(mensual, "2026-01-20", 3)).toEqual([]);
  });

  it("respeta el fin por cuotas y una fecha mal escrita no da nada / respects the instalment end and a malformed date gives nothing", () => {
    const r: RecurrenteProgramable = {
      importe: 5,
      desde: "2026-01",
      hasta: null,
      diaPago: 1,
      cuotas: 1,
    };
    expect(cobrosProximos(r, "2026-01-30", 3)).toEqual([]);
    expect(cobrosProximos(r, "2026-13-01", 3)).toEqual([]);
  });
});
