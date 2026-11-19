/* =============================================================================
 * extractos.ts — Extractos de prueba / Test statements
 * -----------------------------------------------------------------------------
 * ES: Extractos SINTÉTICOS (inventados de principio a fin, sin datos reales ni
 *     nombres de bancos) que imitan los formatos típicos de la banca española.
 *     Van como cadenas en TypeScript, con el BOM y los CRLF escritos a mano,
 *     para que git o un editor no los cambien sin querer.
 *       - EXTRACTO_UNA_COLUMNA: `;`, BOM, CRLF, líneas de preámbulo antes de la
 *         cabecera, fecha dd/mm/aaaa, un solo importe con signo y coma decimal,
 *         columna de saldo, pie con el saldo final.
 *       - EXTRACTO_CARGO_ABONO: `;`, comillas con `;` dentro, fecha dd-mm-aa y
 *         dos columnas (Cargo y Abono) con importes en positivo.
 *       - EXTRACTO_DEBE_HABER: tabulador, fecha aaaa-mm-dd, punto decimal con
 *         coma de millares y columnas Debe y Haber.
 * EN: SYNTHETIC statements (made up from start to end, with no real data or
 *     bank names) that mimic the usual Spanish banking formats. They are
 *     TypeScript strings, with the BOM and CRLF written by hand, so git or an
 *     editor cannot change them by accident.
 *       - EXTRACTO_UNA_COLUMNA: `;`, BOM, CRLF, preamble lines before the
 *         header, dd/mm/yyyy date, a single signed amount with decimal comma,
 *         balance column, footer with the closing balance.
 *       - EXTRACTO_CARGO_ABONO: `;`, quotes holding `;`, dd-mm-yy date and two
 *         columns (Cargo and Abono) with positive amounts.
 *       - EXTRACTO_DEBE_HABER: tab, yyyy-mm-dd date, decimal point with comma
 *         thousands and Debe and Haber columns.
 * ===========================================================================*/

// ES: Un importe por fila con signo; preámbulo y pie como los de muchas webs.
// EN: One signed amount per row; preamble and footer like many bank websites.
export const EXTRACTO_UNA_COLUMNA =
  "\ufeffMovimientos de la cuenta;;;;\r\n" +
  "Titular: PERSONA DE PRUEBA;;;;\r\n" +
  "Periodo: 01/02/2026 - 28/02/2026;;;;\r\n" +
  ";;;;\r\n" +
  "Fecha operación;Fecha valor;Concepto;Importe;Saldo\r\n" +
  "01/02/2026;02/02/2026;NOMINA EMPRESA EJEMPLO SL;1.850,00;2.350,00\r\n" +
  "03/02/2026;03/02/2026;COMPRA TARJ. 1234 SUPERMERCADO BARRIO;-45,67;2.304,33\r\n" +
  "03/02/2026;03/02/2026;COMPRA TARJ. 1234 CAFETERIA CENTRAL;-2,50;2.301,83\r\n" +
  "03/02/2026;03/02/2026;COMPRA TARJ. 1234 CAFETERIA CENTRAL;-2,50;2.299,33\r\n" +
  "05/02/2026;05/02/2026;BIZUM DE NOMBRE INVENTADO;15,00;2.314,33\r\n" +
  "10/02/2026;10/02/2026;RECIBO LUZ COMERCIALIZADORA EJEMPLO;-62,10;2.252,23\r\n" +
  "31/02/2026;31/02/2026;FECHA IMPOSIBLE;-1,00;2.251,23\r\n" +
  "12/02/2026;12/02/2026;IMPORTE ROTO;-1.23,4;2.251,23\r\n" +
  ";;;;\r\n" +
  ";;Saldo final;;2.252,23\r\n";

// ES: Dos columnas con importes en positivo; concepto con `;` entre comillas.
// EN: Two columns with positive amounts; concept with a quoted `;`.
export const EXTRACTO_CARGO_ABONO =
  "Fecha;Descripción;Cargo;Abono\n" +
  '01-02-26;"TRANSFERENCIA; ALQUILER FEBRERO";650,00;\n' +
  "02-02-26;DEVOLUCION COMPRA;;12,99\n" +
  "03-02-26;AMBAS COLUMNAS;5,00;5,00\n" +
  "04-02-26;NINGUNA COLUMNA;;\n";

// ES: Tabulador, fecha ISO, punto decimal y columnas Debe/Haber.
// EN: Tab, ISO date, decimal point and Debe/Haber columns.
export const EXTRACTO_DEBE_HABER =
  "Fecha\tConcepto\tDebe\tHaber\n" +
  "2026-02-01\tSEGURO HOGAR ANUAL\t1,234.56\t\n" +
  "2026-02-15\tINTERESES\t\t0.42\n";
