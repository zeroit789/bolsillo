/* =============================================================================
 * copias.test.ts — Tests de los nombres de copias / Backup name tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba que los nombres de copias de Rust se leen como fechas.
 * EN: Checks that Rust backup names are read as dates.
 * ===========================================================================*/
import { describe, expect, it } from "vitest";
import { fechaLegibleCopia } from "./copias";

describe("fechaLegibleCopia", () => {
  it("diaria → fecha del día UTC / daily → UTC day date", () => {
    expect(fechaLegibleCopia("diaria-2026-11-19.bolsillo", "es-ES")).toBe("19/11/2026");
  });

  it("reciente y antes → fecha y hora / recent and before → date and time", () => {
    const esperado = new Date(1_795_046_400 * 1000).toLocaleString("es-ES");
    expect(fechaLegibleCopia("reciente-001795046400.bolsillo", "es-ES")).toBe(esperado);
    expect(fechaLegibleCopia("antes-001795046400-2.bolsillo", "es-ES")).toBe(esperado);
  });

  it("otro nombre se devuelve tal cual / any other name is returned as is", () => {
    expect(fechaLegibleCopia("raro.bolsillo")).toBe("raro.bolsillo");
  });
});
