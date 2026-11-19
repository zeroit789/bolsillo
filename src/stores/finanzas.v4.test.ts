/* =============================================================================
 * finanzas.v4.test.ts — Store de finanzas con el modelo v4 / Finance store with the v4 model
 * -----------------------------------------------------------------------------
 * ES: Integra en el store la lógica de la Tanda 3: recurrentes reales en los
 *     KPI (semanal = varias veces al mes; trimestral, anual y por cuotas),
 *     transferencias y ajustes que mueven saldos sin ser ingreso ni gasto,
 *     reglas, perfiles de banco, importación de filas y correcciones de
 *     categoría para sugerir reglas. Cada acción valida antes de guardar: un
 *     elemento mal formado bloquearía todo el guardado cifrado. Todos los
 *     datos son inventados.
 * EN: Integrates the Tanda 3 logic into the store: real recurring entries in
 *     the KPIs (weekly = several times a month; quarterly, yearly and by
 *     instalments), transfers and adjustments that move balances without
 *     being income or expense, rules, bank profiles, row import and category
 *     corrections to suggest rules. Every action validates before saving: a
 *     malformed item would block the whole encrypted save. All data is made up.
 * ===========================================================================*/
import { beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { watch } from "vue";
import { useFinanzas } from "./finanzas";
import { esDatosValidos, type Recurrente } from "../types";
import type { FilaImportada } from "../utils/importador/vistaPrevia";

beforeEach(() => {
  setActivePinia(createPinia());
});

// ES: Store con dos cuentas (Banco 1000 €, Hucha 0 €) y un mes visto fijo.
// EN: Store with two accounts (Bank 1000 €, Piggy bank 0 €) and a fixed viewed month.
function conCuentas() {
  const f = useFinanzas();
  f.addCuenta({ nombre: "Banco", saldoInicial: 1000 });
  f.addCuenta({ nombre: "Hucha", saldoInicial: 0 });
  const [banco, hucha] = f.cuentas.map((c) => c.id);
  return { f, banco, hucha };
}

// ES: Saldo de una cuenta en el patrimonio. / EN: Balance of an account in net worth.
function saldo(f: ReturnType<typeof useFinanzas>, id: string) {
  return f.patrimonio.find((x) => x.cuenta.id === id)?.saldo;
}

// ES: Recurrente de gasto de prueba. / EN: Test expense recurring entry.
function rec(extra: Partial<Recurrente>): Omit<Recurrente, "id"> {
  return {
    concepto: "Prueba",
    importe: 10,
    signo: "gasto",
    categoria: "Otros",
    desde: "2026-01",
    hasta: null,
    ...extra,
  };
}

// ES: Fila importada de prueba. / EN: Test imported row.
function fila(linea: number, concepto: string, centimos: number, signo: "ingreso" | "gasto" = "gasto"): FilaImportada {
  return { linea, fecha: "2026-02-03", concepto, centimos, importe: centimos / 100, signo };
} // prettier-ignore

describe("transferencias / transfers", () => {
  it("no cambian ingresos ni gastos del mes y sí los saldos / do not change the month's income or expenses but do change balances", () => {
    const { f, banco, hucha } = conCuentas();
    f.addPuntual({ concepto: "Súper", importe: 50, signo: "gasto", categoria: "Supermercado", fecha: "2026-02-10", cuenta: banco });
    const antes = f.resumenDe("2026-02");
    const total = f.patrimonioTotal;
    expect(f.addTransferencia({ origen: banco, destino: hucha, importe: 200, fecha: "2026-02-11" })).toBe(true);
    expect(f.resumenDe("2026-02")).toEqual(antes);
    expect(saldo(f, banco)).toBe(750);
    expect(saldo(f, hucha)).toBe(200);
    expect(f.patrimonioTotal).toBe(total);
  }); // prettier-ignore

  it("rechaza misma cuenta, importe no válido y fecha imposible / rejects same account, invalid amount and impossible date", () => {
    const { f, banco, hucha } = conCuentas();
    expect(f.addTransferencia({ origen: banco, destino: banco, importe: 5, fecha: "2026-02-01" })).toBe(false);
    expect(f.addTransferencia({ origen: banco, destino: hucha, importe: 0, fecha: "2026-02-01" })).toBe(false);
    expect(f.addTransferencia({ origen: banco, destino: hucha, importe: Number.NaN, fecha: "2026-02-01" })).toBe(false);
    expect(f.addTransferencia({ origen: banco, destino: hucha, importe: 5, fecha: "2026-02-30" })).toBe(false);
    expect(f.transferencias).toEqual([]);
  }); // prettier-ignore

  it("se redondean al céntimo y se pueden borrar / round to the cent and can be deleted", () => {
    const { f, banco, hucha } = conCuentas();
    f.addTransferencia({ origen: banco, destino: hucha, importe: 10.005, fecha: "2026-02-01" });
    expect(f.transferencias[0].importe).toBe(10.01);
    f.eliminarTransferencia(f.transferencias[0].id);
    expect(saldo(f, banco)).toBe(1000);
  });
});

describe("ajustar saldo / adjust balance", () => {
  it("deja la cuenta en el saldo del banco sin tocar el resumen / leaves the account at the bank balance without touching the summary", () => {
    const { f, banco } = conCuentas();
    f.addPuntual({ concepto: "Cena", importe: 30, signo: "gasto", categoria: "Restaurantes", fecha: "2026-02-05", cuenta: banco });
    const antes = f.resumenDe("2026-02");
    expect(f.ajustarSaldo(banco, 955.5, "2026-02-06", "Extracto")).toBe("ok");
    expect(saldo(f, banco)).toBe(955.5);
    expect(f.ajustesSaldo[0]).toMatchObject({ cuenta: banco, importe: -14.5, fecha: "2026-02-06", nota: "Extracto" });
    expect(f.resumenDe("2026-02")).toEqual(antes);
    expect(f.ajustarSaldo(banco, 955.5, "2026-02-07")).toBe("igual");
    expect(f.ajustarSaldo(banco, Number.NaN, "2026-02-07")).toBe("invalido");
    expect(f.ajustarSaldo("no-existe", 5, "2026-02-07")).toBe("invalido");
    expect(f.ajustarSaldo(banco, 5, "2026-13-01")).toBe("invalido");
  }); // prettier-ignore

  it("calcula la diferencia con el saldo hasta esa fecha / computes the difference with the balance up to that date", () => {
    const { f, banco } = conCuentas();
    f.addPuntual({ concepto: "Futuro", importe: 100, signo: "gasto", categoria: "Otros", fecha: "2026-03-01", cuenta: banco });
    expect(f.ajustarSaldo(banco, 1000, "2026-02-28")).toBe("igual");
    expect(saldo(f, banco)).toBe(900);
  }); // prettier-ignore
});

describe("recurrentes reales en los KPI / real recurring entries in the KPIs", () => {
  it("semanal: cuenta cada semana del mes / weekly: counts every week of the month", () => {
    const f = useFinanzas();
    f.addRecurrente(rec({ frecuencia: "semanal", fechaInicio: "2026-02-02", desde: "2026-02" }));
    expect(f.resumenDe("2026-02").gastosFijos).toBe(40);
    expect(f.resumenDe("2026-03").gastosFijos).toBe(50);
    f.seleccionarMes("2026-03");
    const l = f.lineasDelMes.find((x) => x.origen === "recurrente");
    expect(l).toMatchObject({ importe: 50, veces: 5, frecuencia: "semanal" });
  });

  it("trimestral: solo en sus meses y sin línea en los demás / quarterly: only in its months, no line in the rest", () => {
    const f = useFinanzas();
    f.addRecurrente(rec({ frecuencia: "trimestral", fechaInicio: "2026-01-15", importe: 90 }));
    expect(f.resumenDe("2026-01").gastosFijos).toBe(90);
    expect(f.resumenDe("2026-02").gastosFijos).toBe(0);
    expect(f.resumenDe("2026-04").gastosFijos).toBe(90);
    f.seleccionarMes("2026-02");
    expect(f.lineasDelMes).toEqual([]);
  });

  it("anual: una vez al año / yearly: once a year", () => {
    const f = useFinanzas();
    f.addRecurrente(rec({ frecuencia: "anual", fechaInicio: "2026-03-01", importe: 300 }));
    expect(f.resumenDe("2026-03").gastosFijos).toBe(300);
    expect(f.resumenDe("2026-09").gastosFijos).toBe(0);
    expect(f.resumenDe("2027-03").gastosFijos).toBe(300);
  });

  it("cuotas: deja de contar tras la última / instalments: stops after the last one", () => {
    const f = useFinanzas();
    f.addRecurrente(rec({ cuotas: 3, importe: 100 }));
    expect(["2026-01", "2026-02", "2026-03", "2026-04"].map((m) => f.resumenDe(m).gastosFijos)).toEqual([100, 100, 100, 0]);
    expect(f.historial.length).toBeGreaterThan(0);
  }); // prettier-ignore

  it("un recurrente v3 (sin campos nuevos) sigue tocando una vez al mes / a v3 recurring entry still falls once a month", () => {
    const f = useFinanzas();
    f.addRecurrente(rec({ importe: 12.5, hasta: "2026-03" }));
    expect(["2026-01", "2026-03", "2026-04"].map((m) => f.resumenDe(m).gastosFijos)).toEqual([12.5, 12.5, 0]);
  }); // prettier-ignore

  it("el mes de alta sale de fechaInicio / the start month comes from fechaInicio", () => {
    const f = useFinanzas();
    f.addRecurrente(rec({ fechaInicio: "2026-05-20", desde: "2026-01" }));
    expect(f.recurrentes[0].desde).toBe("2026-05");
    f.actualizarRecurrente(f.recurrentes[0].id, { fechaInicio: "2026-07-01" });
    expect(f.recurrentes[0].desde).toBe("2026-07");
  });
});

describe("reglas / rules", () => {
  it("alta con prioridad al final, rechaza lo mal formado y se reordenan / added last, rejects malformed and reorders", () => {
    const f = useFinanzas();
    expect(f.addRegla({ contiene: "super", categoria: "Supermercado" })).toBe(true);
    expect(f.addRegla({ contiene: "bizum", categoria: "Otros", signo: "ingreso" })).toBe(true);
    expect(f.addRegla({ contiene: "  ", categoria: "Otros" })).toBe(false);
    expect(f.reglasOrdenadas.map((r) => r.contiene)).toEqual(["super", "bizum"]);
    f.moverRegla(f.reglasOrdenadas[1].id, -1);
    expect(f.reglasOrdenadas.map((r) => r.contiene)).toEqual(["bizum", "super"]);
    f.eliminarRegla(f.reglasOrdenadas[0].id);
    expect(f.reglas.map((r) => r.contiene)).toEqual(["super"]);
    expect(f.actualizarRegla(f.reglas[0].id, { contiene: "" })).toBe(false);
    expect(f.reglas[0].contiene).toBe("super");
  });
});

describe("perfiles de banco / bank profiles", () => {
  const perfil = {
    nombre: "Mi banco",
    formatoFecha: "dma" as const,
    formatoDecimal: "coma" as const,
    columnas: { fecha: "Fecha", concepto: "Concepto", importe: "Importe" },
  };

  it("guardar con el mismo nombre sustituye; lo mal formado no entra / same name replaces; malformed is rejected", () => {
    const f = useFinanzas();
    expect(f.guardarPerfil(perfil)).not.toBeNull();
    expect(
      f.guardarPerfil({ ...perfil, nombre: " mi BANCO ", formatoDecimal: "punto" })
    ).not.toBeNull();
    expect(f.perfilesBanco).toHaveLength(1);
    expect(f.perfilesBanco[0].formatoDecimal).toBe("punto");
    expect(
      f.guardarPerfil({ ...perfil, nombre: "Otro", columnas: { fecha: "F", concepto: "C" } })
    ).toBeNull();
    f.eliminarPerfil(f.perfilesBanco[0].id);
    expect(f.perfilesBanco).toEqual([]);
  });
});

describe("importar filas / import rows", () => {
  it("crea puntuales importados con reglas en UNA sola asignación / creates imported entries with rules in ONE assignment", () => {
    const { f, banco } = conCuentas();
    f.addRegla({ contiene: "super", categoria: "Supermercado" });
    let cambios = 0;
    watch(() => f.puntuales, () => cambios++, { flush: "sync" });
    const n = f.importarFilas([fila(1, "COMPRA SUPER", 4567), fila(2, "NOMINA", 150000, "ingreso")], { cuenta: banco });
    expect(n).toBe(2);
    expect(cambios).toBe(1);
    expect(f.puntuales.map((p) => [p.categoria, p.origen, p.cuenta])).toEqual([
      ["Supermercado", "importado", banco],
      ["Otros", "importado", banco],
    ]);
    expect(f.puntuales[0].importId).toBe("2026-02-03|gasto|4567|compra super");
    expect(saldo(f, banco)).toBe(1000 - 45.67 + 1500);
  }); // prettier-ignore

  it("una cuenta que no existe no se asigna / a missing account is not assigned", () => {
    const f = useFinanzas();
    f.importarFilas([fila(1, "X", 100)], { cuenta: "no-existe" });
    expect(f.puntuales[0].cuenta).toBeUndefined();
  });
});

describe("correcciones y sugerencias / corrections and suggestions", () => {
  it("cambiar la categoría de un puntual la anota y sugiere una regla / changing a category records it and suggests a rule", () => {
    const f = useFinanzas();
    f.importarFilas([fila(1, "COMPRA TARJ MERCADONA 1", 1000), fila(2, "COMPRA TARJ MERCADONA 2", 2000)], {});
    const [a, b] = f.puntuales;
    f.actualizarPuntual(a.id, { categoria: "Otros" });
    expect(f.correcciones).toEqual([]);
    f.actualizarPuntual(a.id, { categoria: "Supermercado", concepto: "Compra de la semana" });
    f.actualizarPuntual(b.id, { categoria: "Supermercado" });
    // ES: Se anota el texto del banco (el de la huella), no el concepto editado.
    // EN: The bank text (the fingerprint's) is recorded, not the edited concept.
    expect(f.correcciones).toEqual([
      { concepto: "compra tarj mercadona 1", categoria: "Supermercado", signo: "gasto" },
      { concepto: "compra tarj mercadona 2", categoria: "Supermercado", signo: "gasto" },
    ]);
    expect(f.sugerencias.map((s) => [s.contiene, s.categoria])).toEqual([["mercadona", "Supermercado"]]);
    expect(f.crearReglaDeSugerencia(f.sugerencias[0])).toBe(true);
    expect(f.sugerencias).toEqual([]);
  }); // prettier-ignore

  it("las correcciones tienen tope / corrections are capped", () => {
    const f = useFinanzas();
    f.addPuntual({
      concepto: "X",
      importe: 1,
      signo: "gasto",
      categoria: "Otros",
      fecha: "2026-02-01",
    });
    const id = f.puntuales[0].id;
    for (let i = 0; i < 320; i++) f.actualizarPuntual(id, { categoria: i % 2 ? "Otros" : "Ocio" });
    expect(f.correcciones.length).toBe(300);
  });
});

describe("el snapshot sigue siendo válido / the snapshot stays valid", () => {
  it("tras usar todas las acciones nuevas / after using every new action", () => {
    const { f, banco, hucha } = conCuentas();
    f.addRegla({ contiene: "super", categoria: "Supermercado" });
    f.guardarPerfil({ nombre: "B", formatoFecha: "dma", formatoDecimal: "coma", columnas: { fecha: 0, concepto: 1, importe: 2 } });
    f.addTransferencia({ origen: banco, destino: hucha, importe: 5, fecha: "2026-02-01" });
    f.ajustarSaldo(banco, 1, "2026-02-02");
    f.addRecurrente(rec({ frecuencia: "semanal", fechaInicio: "2026-02-02", cuotas: 4 }));
    f.importarFilas([fila(1, "COMPRA SUPER", 4567)], { cuenta: banco });
    f.actualizarPuntual(f.puntuales[0].id, { categoria: "Otros" });
    expect(esDatosValidos(JSON.parse(JSON.stringify(f.snapshot())))).toBe(true);
  }); // prettier-ignore
});

describe("revisión: validación antes de guardar / review: validation before saving", () => {
  it("importarFilas descarta filas mal formadas sin tocar las buenas / importarFilas drops malformed rows and keeps the good ones", () => {
    const f = useFinanzas();
    const malas = [
      { ...fila(1, "MALA FECHA", 100), fecha: "2026-02-30" },
      { ...fila(2, "NAN", 100), importe: Number.NaN },
      { ...fila(3, "   ", 100) },
      { ...fila(4, "CERO", 0), importe: 0 },
    ];
    expect(f.importarFilas([...malas, fila(5, "BUENA", 250)], {})).toBe(1);
    expect(f.puntuales.map((p) => p.concepto)).toEqual(["BUENA"]);
    expect(esDatosValidos(JSON.parse(JSON.stringify(f.snapshot())))).toBe(true);
  });

  it("alta y edición de recurrentes rechazan lo que el esquema no admite / adding and editing recurring entries reject what the schema does not allow", () => {
    const f = useFinanzas();
    expect(f.addRecurrente(rec({ cuotas: 0 }))).toBe(false);
    expect(f.addRecurrente(rec({ fechaInicio: "2026-02-30" }))).toBe(false);
    expect(f.addRecurrente(rec({ importe: Number.NaN }))).toBe(false);
    expect(f.recurrentes).toEqual([]);
    expect(f.addRecurrente(rec({ cuotas: 3 }))).toBe(true);
    const id = f.recurrentes[0].id;
    expect(f.actualizarRecurrente(id, { fechaFin: "2026-13-01" })).toBe(false);
    expect(f.recurrentes[0].fechaFin).toBeUndefined();
    expect(f.actualizarRecurrente(id, { cuotas: undefined, fechaFin: "2026-12-31" })).toBe(true);
    expect(esDatosValidos(JSON.parse(JSON.stringify(f.snapshot())))).toBe(true);
  });

  it("una transferencia exige que existan las dos cuentas / a transfer requires both accounts to exist", () => {
    const { f, banco } = conCuentas();
    expect(f.addTransferencia({ origen: banco, destino: "no-existe", importe: 5, fecha: "2026-02-01" })).toBe(false);
  }); // prettier-ignore

  it("saldo de una cuenta en una fecha (sin lo posterior) / account balance on a date (without what comes later)", () => {
    const { f, banco } = conCuentas();
    f.addPuntual({ concepto: "Futuro", importe: 100, signo: "gasto", categoria: "Otros", fecha: "2026-03-01", cuenta: banco });
    expect(f.saldoCuentaEn(banco, "2026-02-28")).toBe(1000);
    expect(f.saldoCuentaEn(banco, "2026-03-01")).toBe(900);
    expect(f.saldoCuentaEn("no-existe", "2026-03-01")).toBeNull();
  }); // prettier-ignore

  it("un importe negativo heredado cuenta igual que antes en el saldo / an inherited negative amount counts as before in the balance", () => {
    const { f, banco } = conCuentas();
    f.addPuntual({ concepto: "Raro", importe: -10, signo: "gasto", categoria: "Otros", fecha: "2026-02-01", cuenta: banco });
    expect(saldo(f, banco)).toBe(1010);
  }); // prettier-ignore

  it("sabe si una cuenta tiene transferencias o ajustes / knows whether an account has transfers or adjustments", () => {
    const { f, banco, hucha } = conCuentas();
    expect(f.cuentaConMovimientosEntreCuentas(banco)).toBe(false);
    f.addTransferencia({ origen: banco, destino: hucha, importe: 5, fecha: "2026-02-01" });
    expect(f.cuentaConMovimientosEntreCuentas(hucha)).toBe(true);
    f.eliminarTransferencia(f.transferencias[0].id);
    f.ajustarSaldo(banco, 1, "2026-02-01");
    expect(f.cuentaConMovimientosEntreCuentas(banco)).toBe(true);
  });
});
