/* =============================================================================
 * prettier.config.js — Formato del código / Code formatting
 * -----------------------------------------------------------------------------
 * ES: Config de Prettier. Los valores siguen el estilo que ya tenía el código
 *     (comillas dobles, punto y coma, líneas de hasta 100 columnas y coma final
 *     solo donde la admite ES5) para que el primer formateo cambie lo mínimo.
 * EN: Prettier config. The values follow the style the code already had (double
 *     quotes, semicolons, lines up to 100 columns and trailing commas only where
 *     ES5 allows them) so the first formatting pass changes as little as possible.
 * ===========================================================================*/

/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  semi: true,
  singleQuote: false,
  trailingComma: "es5",
  // ES: Fin de línea LF en todos los sistemas (va a juego con .gitattributes).
  // EN: LF line endings on every OS (matches .gitattributes).
  endOfLine: "lf",
};
