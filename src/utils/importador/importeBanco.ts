/* =============================================================================
 * importeBanco.ts — Importes de los extractos / Statement amounts
 * -----------------------------------------------------------------------------
 * ES: Convierte el importe de una celda de extracto en CÉNTIMOS ENTEROS (con
 *     signo) operando con las cifras del texto, sin pasar por ×100 en coma
 *     flotante. Así un "1.234,56" es exactamente 123456 y no 123455,99999…
 *     Formatos admitidos:
 *       - Coma decimal (lo habitual en España): "1.234,56", "1234,56", "12".
 *         El punto SOLO vale como separador de millares en grupos de tres
 *         ("1.234" = 1234 €). "1234.56" con coma decimal es un error de fila:
 *         no se adivina, porque suele indicar un perfil equivocado.
 *       - Punto decimal (si el perfil lo indica): "1,234.56", "1234.56"; la
 *         coma solo como millar en grupos de tres.
 *       - Signo: "-" o "+" delante, "-" detrás ("12,30-"), el menos Unicode
 *         (U+2212) o paréntesis contables "(12,30)". Solo una marca de signo.
 *       - Símbolo "€" o "EUR" delante o detrás y espacios (también duros).
 *       - Números (celdas numéricas de XLSX): se redondean con redondear2.
 *     Más de dos decimales: el medio céntimo se aleja del cero, igual que
 *     redondear2 ("12,345" -> 12,35; "-12,345" -> -12,35).
 *     Tope: |importe| <= IMPORTE_MAX (utils/importe.ts), como los formularios.
 *     El 0 es válido aquí; la vista previa decide que un movimiento de 0 € es
 *     un error de fila.
 * EN: Turns a statement cell amount into WHOLE CENTS (signed) by working on
 *     the digits of the text, never through a floating-point ×100. So
 *     "1.234,56" is exactly 123456 and not 123455.99999…
 *     Supported formats:
 *       - Decimal comma (usual in Spain): "1.234,56", "1234,56", "12". The dot
 *         is ONLY a thousands separator in groups of three ("1.234" = €1,234).
 *         "1234.56" with a decimal comma is a row error: no guessing, because
 *         it usually means a wrong profile.
 *       - Decimal point (when the profile says so): "1,234.56", "1234.56"; the
 *         comma only as thousands in groups of three.
 *       - Sign: "-" or "+" in front, "-" after ("12,30-"), the Unicode minus
 *         (U+2212) or accounting parentheses "(12,30)". One sign mark only.
 *       - "€" or "EUR" before or after and spaces (non-breaking ones too).
 *       - Numbers (numeric XLSX cells): rounded with redondear2.
 *     More than two decimals: half a cent goes away from zero, like redondear2
 *     ("12,345" -> 12.35; "-12,345" -> -12.35).
 *     Cap: |amount| <= IMPORTE_MAX (utils/importe.ts), like the forms.
 *     0 is valid here; the preview decides that a €0 movement is a row error.
 * ===========================================================================*/
import { IMPORTE_MAX, redondear2 } from "../importe";

// ES: Formato del separador decimal del extracto.
// EN: Decimal separator format of the statement.
export type FormatoDecimal = "coma" | "punto";

// ES: Resultado: céntimos con signo si es válido; si no, el motivo.
// EN: Result: signed cents when valid; otherwise the reason.
export type AnalisisImporteBanco =
  { tipo: "valido"; centimos: number } | { tipo: "vacio" | "invalido" | "excede" };

// ES: Tope en céntimos (99.999.999.999 cabe sin pérdida en un double).
// EN: Cap in cents (99,999,999,999 fits losslessly in a double).
const TOPE_CENTIMOS = Math.round(IMPORTE_MAX * 100);

// ES: Cuerpo numérico según el formato: entero con millares en grupos de 3 o
//     sin millares, y decimales opcionales.
// EN: Numeric body per format: integer with thousands in groups of 3 or with
//     no thousands, and optional decimals.
const CUERPO: Record<FormatoDecimal, RegExp> = {
  coma: /^(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d+))?$/,
  punto: /^(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?$/,
};

// ES: Analiza un importe de extracto (texto o número) y lo da en céntimos.
// EN: Parses a statement amount (text or number) and returns it in cents.
export function analizarImporteBanco(
  valor: string | number | null | undefined,
  formato: FormatoDecimal
): AnalisisImporteBanco {
  if (valor === null || valor === undefined) return { tipo: "vacio" };

  // ES: Números de una hoja de cálculo: se redondean como en el resto de la app.
  // EN: Numbers from a spreadsheet: rounded like everywhere else in the app.
  if (typeof valor === "number") {
    if (!Number.isFinite(valor)) return { tipo: "invalido" };
    if (Math.abs(valor) > IMPORTE_MAX + 1) return { tipo: "excede" };
    const centimos = Math.round(redondear2(valor) * 100);
    if (Math.abs(centimos) > TOPE_CENTIMOS) return { tipo: "excede" };
    return { tipo: "valido", centimos: centimos === 0 ? 0 : centimos };
  }

  // ES: El menos Unicode pasa a "-"; se recortan los espacios de los bordes
  //     (\s incluye los duros) y la moneda de delante o de detrás.
  // EN: Unicode minus becomes "-"; edge spaces are trimmed (\s includes the
  //     non-breaking ones) and so is the currency before or after.
  let t = valor.replace(/\u2212/g, "-").trim();
  if (t === "") return { tipo: "vacio" };
  t = t
    .replace(/^(€|eur)\s*/i, "")
    .replace(/\s*(€|eur)$/i, "")
    .trim();

  // ES: Marcas de signo: paréntesis, signo delante o "-" detrás. Solo una.
  //     Entre el signo y el número puede haber espacios ("- 7,00").
  // EN: Sign marks: parentheses, sign in front or "-" after. Only one. There
  //     may be spaces between the sign and the number ("- 7,00").
  let negativo = false;
  let marcas = 0;
  if (t.startsWith("(") && t.endsWith(")")) {
    t = t.slice(1, -1).trim();
    negativo = true;
    marcas++;
  }
  if (t.startsWith("-") || t.startsWith("+")) {
    negativo = t[0] === "-";
    t = t.slice(1).trim();
    marcas++;
  }
  if (t.endsWith("-")) {
    t = t.slice(0, -1).trim();
    negativo = true;
    marcas++;
  }
  if (marcas > 1) return { tipo: "invalido" };

  // ES: Espacios DENTRO del número: solo como separador de millares en grupos
  //     de tres ("1 234,56"); "1 2,34" es un error, no 12,34.
  // EN: Spaces INSIDE the number: only as a thousands separator in groups of
  //     three ("1 234,56"); "1 2,34" is an error, not 12.34.
  if (/\s/.test(t)) {
    // ES: Solo espacio normal, duro o duro estrecho; un tabulador o un salto
    //     de línea dentro del número es un error.
    // EN: Only a normal, non-breaking or narrow non-breaking space; a tab or a
    //     line break inside the number is an error.
    if (!/^\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?$/.test(t)) return { tipo: "invalido" };
    t = t.replace(/[ \u00a0\u202f]/g, "");
  }

  // ES: El resto tiene que ser un número bien formado en el formato pedido.
  // EN: The rest must be a well-formed number in the requested format.
  const m = CUERPO[formato].exec(t);
  if (!m) return { tipo: "invalido" };
  const entero = m[1].replace(/[.,]/g, "").replace(/^0+(?=\d)/, "");
  const decimales = m[2] ?? "";

  // ES: Más de 12 cifras enteras ya pasa de sobra del tope (y de lo que un
  //     double guarda exacto): se descarta sin calcular.
  // EN: More than 12 integer digits is far above the cap (and beyond what a
  //     double holds exactly): rejected without computing.
  if (entero.length > 12) return { tipo: "excede" };

  // ES: Céntimos exactos: entero × 100 + dos primeros decimales, y el tercero
  //     decide el redondeo (>= 5 sube, alejándose del cero por ir sin signo).
  // EN: Exact cents: integer × 100 + first two decimals, and the third one
  //     decides rounding (>= 5 goes up, away from zero since it is unsigned).
  let centimos = Number(entero) * 100 + Number((decimales + "00").slice(0, 2));
  if (decimales.length > 2 && Number(decimales[2]) >= 5) centimos += 1;
  if (centimos > TOPE_CENTIMOS) return { tipo: "excede" };

  // ES: Nunca -0. / EN: Never -0.
  if (centimos === 0) return { tipo: "valido", centimos: 0 };
  return { tipo: "valido", centimos: negativo ? -centimos : centimos };
}
