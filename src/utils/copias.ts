/* =============================================================================
 * copias.ts — Nombres de las copias automáticas / Automatic backup names
 * -----------------------------------------------------------------------------
 * ES: Convierte el nombre de una copia automática de Rust en una fecha legible:
 *       reciente-<segundos Unix>.bolsillo   → fecha y hora locales
 *       antes-<segundos Unix>[-n].bolsillo  → fecha y hora locales
 *       diaria-AAAA-MM-DD.bolsillo          → fecha (día UTC)
 *     Si el nombre no tiene esa forma, se devuelve tal cual.
 * EN: Turns a Rust automatic backup name into a readable date (see the forms
 *     above). If the name does not have that shape, it is returned as is.
 * ===========================================================================*/

// ES: Fecha legible de una copia; `locale` para los tests (por defecto, el del sistema).
// EN: Readable date of a backup; `locale` for tests (by default, the system one).
export function fechaLegibleCopia(nombre: string, locale?: string): string {
  const diaria = /^diaria-(\d{4})-(\d{2})-(\d{2})\.bolsillo$/.exec(nombre);
  if (diaria) {
    const [, a, m, d] = diaria;
    return new Date(Date.UTC(+a, +m - 1, +d)).toLocaleDateString(locale, { timeZone: "UTC" });
  }
  const segundos = /^(?:reciente|antes)-(\d{12})(?:-\d+)?\.bolsillo$/.exec(nombre);
  if (segundos) return new Date(Number(segundos[1]) * 1000).toLocaleString(locale);
  return nombre;
}
