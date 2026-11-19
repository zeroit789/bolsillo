/* =============================================================================
 * importe.ts — Redondeo de importes a céntimos / Rounding amounts to cents
 * -----------------------------------------------------------------------------
 * ES: Único sitio donde se redondean importes en euros a 2 decimales. Antes
 *     había un Math.round(x * 100) / 100 repartido por stores, utilidades y
 *     vistas, con tres fallos: 1,005 daba 1 (en binario 1,005 es 1,00499…),
 *     los empates negativos no eran simétricos a los positivos y podía salir
 *     -0, NaN o Infinity. Reglas de redondear2:
 *       - Medio céntimo se aleja del cero (redondeo comercial): 1,005 -> 1,01
 *         y -2,345 -> -2,35.
 *       - NaN, Infinity y -Infinity -> 0: un importe no puede ser infinito, y
 *         los formularios ya rechazan 0 como importe no válido.
 *       - Nunca devuelve -0 (se mostraría como "-0,00 €").
 *       - Fuera de los empates da lo mismo que la fórmula antigua (lo prueba
 *         importe.test.ts).
 * EN: The single place where euro amounts are rounded to 2 decimals. There
 *     used to be a Math.round(x * 100) / 100 scattered across stores, utils
 *     and views, with three flaws: 1.005 gave 1 (in binary 1.005 is
 *     1.00499…), negative ties weren't symmetric with positive ones, and it
 *     could yield -0, NaN or Infinity. redondear2 rules:
 *       - Half a cent goes away from zero (commercial rounding): 1.005 -> 1.01
 *         and -2.345 -> -2.35.
 *       - NaN, Infinity and -Infinity -> 0: an amount can't be infinite, and
 *         the forms already reject 0 as an invalid amount.
 *       - Never returns -0 (it would show as "-0,00 €").
 *       - Outside ties it matches the old formula (importe.test.ts proves it).
 * ===========================================================================*/

// ES: Redondea un importe a céntimos con las reglas de la cabecera.
// EN: Rounds an amount to cents following the rules in the header.
export function redondear2(n: number): number {
  // ES: NaN o infinito no son importes: se tratan como 0.
  // EN: NaN or infinity are not amounts: treated as 0.
  if (!Number.isFinite(n)) return 0;

  // ES: Se trabaja con el valor absoluto para que el empate se aleje del cero
  //     en ambos signos (Math.round sube siempre hacia +∞: -234,5 -> -234).
  // EN: Work with the absolute value so ties go away from zero for both signs
  //     (Math.round always goes toward +∞: -234.5 -> -234).
  const signo = n < 0 ? -1 : 1;

  // ES: toPrecision(15) quita el ruido binario de la multiplicación
  //     (1,005 * 100 = 100,49999999999999 -> 100,5) antes de redondear.
  //     15 cifras significativas es lo que un double guarda sin pérdida.
  // EN: toPrecision(15) removes the binary noise of the multiplication
  //     (1.005 * 100 = 100.49999999999999 -> 100.5) before rounding.
  //     15 significant digits is what a double holds losslessly.
  const centimos = Math.round(Number((Math.abs(n) * 100).toPrecision(15)));
  const resultado = (signo * centimos) / 100;

  // ES: -0 pasa a 0 (si no, se vería "-0,00 €").
  // EN: -0 becomes 0 (otherwise "-0,00 €" would show up).
  return resultado === 0 ? 0 : resultado;
}

// ES: Convierte lo que escribe el usuario ("12,50", "12.50" o un número) en un
//     importe redondeado a céntimos. Solo cambia la primera coma por un punto,
//     como hacían los formularios. Lo que no es un número da 0.
// EN: Turns what the user types ("12,50", "12.50" or a number) into an amount
//     rounded to cents. Only the first comma becomes a dot, as the forms used
//     to do. Anything that is not a number gives 0.
export function importeDesdeTexto(valor: string | number): number {
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : Number(valor);
  return redondear2(n);
}
