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
 *       - Nunca devuelve un número no finito: si el ×100 desborda (p. ej.
 *         1e307), el resultado es 0, igual que con NaN o Infinity.
 *       - Fuera de los empates da lo mismo que la fórmula antigua (lo prueba
 *         importe.test.ts).
 *     Por qué toPrecision(15) y no redondear desde String(x): con 15 cifras
 *     significativas se borra el ruido binario de las cuentas (3,35 × 1,5
 *     sale 5,0249999… y debe dar 5,03; desde String(x) bajaría a 5,02, y así
 *     fallaba más de un 10 % de los empates calculados en las pruebas). El
 *     precio: un valor escrito con 16 cifras justo por debajo de un empate
 *     (1,004999999999999) se toma como el empate y sube. Es aceptable porque
 *     nadie teclea 16 cifras y las cuentas reales sí producen ese ruido.
 *     Tope de importe (IMPORTE_MAX = 999.999.999,99): los formularios
 *     rechazan lo que lo pase. Con importes de ese tamaño, ×100 deja 11
 *     cifras enteras y sobran 4 para que toPrecision(15) conserve el medio
 *     céntimo; así hasta los totales de mil importes al tope (≈ 1e12) se
 *     siguen redondeando bien. Un tope de 1e12 por importe dejaba los totales
 *     sin margen (perdían céntimos a partir de unos 1e13).
 *     Formularios: usan analizarImporte, que separa vacío, válido, inválido y
 *     por encima del tope ANTES de redondear (redondear2 daría 0 con "abc" o
 *     1e307, y ese 0 podía pisar un saldo o lo pagado).
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
 *       - Never returns a non-finite number: if ×100 overflows (e.g. 1e307),
 *         the result is 0, the same as with NaN or Infinity.
 *       - Outside ties it matches the old formula (importe.test.ts proves it).
 *     Why toPrecision(15) instead of rounding from String(x): 15 significant
 *     digits wipe out the binary noise of arithmetic (3.35 × 1.5 comes out
 *     as 5.0249999… and must give 5.03; from String(x) it would drop to
 *     5.02, and that way over 10 % of the computed ties failed in testing).
 *     The price: a value typed with 16 digits just below a tie
 *     (1.004999999999999) is taken as the tie and goes up. That is acceptable
 *     because nobody types 16 digits and real arithmetic does produce noise.
 *     Amount cap (IMPORTE_MAX = 999,999,999.99): the forms reject anything
 *     above it. At that size, ×100 leaves 11 integer digits and 4 to spare
 *     so toPrecision(15) keeps the half cent; so even totals of a thousand
 *     capped amounts (≈ 1e12) still round correctly. A per-amount cap of
 *     1e12 left totals with no margin (they lost cents from about 1e13).
 *     Forms: they use analizarImporte, which tells apart empty, valid,
 *     invalid and above-cap values BEFORE rounding (redondear2 would give 0
 *     for "abc" or 1e307, and that 0 could overwrite a balance or a paid amount).
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

  // ES: Si el ×100 desbordó (n finito pero enorme, p. ej. 1e307), el
  //     resultado es Infinity: se trata como NaN/Infinity, es decir, 0.
  // EN: If ×100 overflowed (finite but huge n, e.g. 1e307), the result is
  //     Infinity: treated like NaN/Infinity, that is, 0.
  if (!Number.isFinite(resultado)) return 0;

  // ES: -0 pasa a 0 (si no, se vería "-0,00 €").
  // EN: -0 becomes 0 (otherwise "-0,00 €" would show up).
  return resultado === 0 ? 0 : resultado;
}

// ES: Importe máximo que admiten los formularios (en valor absoluto). Casi mil
//     millones da de sobra para unas finanzas personales y deja margen para
//     que los totales se sigan redondeando bien (ver la cabecera).
// EN: Largest amount the forms accept (in absolute value). Almost a billion
//     is plenty for personal finances and leaves room for totals to keep
//     rounding correctly (see the header).
export const IMPORTE_MAX = 999_999_999.99;

// ES: Texto de error ES/EN para los formularios cuando un importe pasa del
//     tope. Cada vista lo mete en su propio crearT. Si cambia IMPORTE_MAX,
//     hay que cambiar aquí la cifra (lo vigila importe.test.ts).
// EN: ES/EN error text for the forms when an amount exceeds the cap. Each
//     view puts it in its own crearT. If IMPORTE_MAX changes, the figure
//     must be changed here (importe.test.ts keeps an eye on it).
export const MENSAJE_IMPORTE_MAX = {
  es: "El importe no puede pasar de 999.999.999,99.",
  en: "The amount cannot exceed 999,999,999.99.",
};

// ES: true si `n` es un importe que se puede guardar: finito y, en valor
//     absoluto, no mayor que IMPORTE_MAX. Admite 0 y negativos (cada
//     formulario comprueba aparte el signo que necesite). Se usa con el
//     importe YA redondeado (999.999.999,995 redondea a 1e9 y no cabe).
// EN: true if `n` is an amount that can be stored: finite and, in absolute
//     value, not greater than IMPORTE_MAX. Allows 0 and negatives (each form
//     checks the sign it needs separately). Used on the ALREADY rounded
//     amount (999,999,999.995 rounds to 1e9 and does not fit).
export function importeDentroDeRango(n: number): boolean {
  return Number.isFinite(n) && Math.abs(n) <= IMPORTE_MAX;
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

// ES: Texto de error ES/EN para los formularios cuando lo escrito no es un
//     importe (letras, "Infinity", un número que no cabe en un double…).
// EN: ES/EN error text for the forms when what was typed is not an amount
//     (letters, "Infinity", a number that does not fit in a double…).
export const MENSAJE_IMPORTE_INVALIDO = {
  es: "Escribe un importe válido, por ejemplo 12,50.",
  en: "Enter a valid amount, for example 12.50.",
};

// ES: Resultado de analizarImporte. `valor` solo tiene sentido con "valido"
//     (importe ya redondeado a céntimos); en los demás casos es 0 para que
//     nunca circule un NaN ni un número enorme por error.
// EN: Result of analizarImporte. `valor` only makes sense with "valido"
//     (amount already rounded to cents); in every other case it is 0 so a NaN
//     or a huge number never travels around by mistake.
export type AnalisisImporte =
  { tipo: "valido"; valor: number } | { tipo: "vacio" | "invalido" | "excede"; valor: 0 };

// ES: Número decimal en texto, ya con la coma cambiada por punto: signo
//     opcional, cifras con o sin decimales (o solo decimales) y exponente
//     opcional. Deja fuera "0x10", "Infinity", "NaN" o "1.2.3", que Number()
//     aceptaría o convertiría en algo que nadie quiso escribir.
// EN: Decimal number as text, with the comma already turned into a dot:
//     optional sign, digits with or without decimals (or decimals only) and an
//     optional exponent. Rules out "0x10", "Infinity", "NaN" or "1.2.3", which
//     Number() would accept or turn into something nobody meant to type.
const NUMERO_DECIMAL = /^[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?$/i;

// ES: Clasifica lo que llega de un formulario ANTES de redondear, para que un
//     valor enorme o mal escrito no se convierta en un 0 válido (redondear2
//     da 0 con NaN, Infinity o 1e307):
//       - "vacio": "", solo espacios, null o undefined. Cada formulario decide
//         si vale 0 (campos opcionales) o es un error (campos obligatorios).
//       - "invalido": texto que no es un número decimal, o no finito.
//       - "excede": en valor absoluto pasa de IMPORTE_MAX una vez redondeado
//         (999.999.999,995 sube a 1e9 y no cabe).
//       - "valido": el importe redondeado a céntimos (0 y negativos incluidos;
//         el signo lo comprueba cada formulario).
//     Admite texto con coma o punto (solo cambia la primera coma, como
//     importeDesdeTexto) y números (v-model.number entrega número o "").
// EN: Classifies what comes from a form BEFORE rounding, so a huge or
//     mistyped value never becomes a valid 0 (redondear2 gives 0 for NaN,
//     Infinity or 1e307):
//       - "vacio": "", blanks only, null or undefined. Each form decides
//         whether it means 0 (optional fields) or an error (required fields).
//       - "invalido": text that is not a decimal number, or not finite.
//       - "excede": in absolute value it exceeds IMPORTE_MAX once rounded
//         (999,999,999.995 goes up to 1e9 and does not fit).
//       - "valido": the amount rounded to cents (0 and negatives included;
//         each form checks the sign).
//     Accepts text with a comma or a dot (only the first comma changes, like
//     importeDesdeTexto) and numbers (v-model.number yields a number or "").
export function analizarImporte(entrada: string | number | null | undefined): AnalisisImporte {
  // ES: Vacío: nada escrito. / EN: Empty: nothing typed.
  if (entrada === null || entrada === undefined) return { tipo: "vacio", valor: 0 };

  // ES: Paso a número: los textos se validan con la expresión de arriba.
  // EN: Conversion to a number: texts are checked with the pattern above.
  let n: number;
  if (typeof entrada === "string") {
    const texto = entrada.trim().replace(",", ".");
    if (texto === "") return { tipo: "vacio", valor: 0 };
    if (!NUMERO_DECIMAL.test(texto)) return { tipo: "invalido", valor: 0 };
    n = Number(texto);
  } else {
    n = entrada;
  }

  // ES: NaN o infinito (también "1e400", que Number lleva a Infinity).
  // EN: NaN or infinity (also "1e400", which Number turns into Infinity).
  if (!Number.isFinite(n)) return { tipo: "invalido", valor: 0 };

  // ES: Muy por encima del tope: se descarta antes de redondear, porque con
  //     valores enormes el ×100 de redondear2 desborda y daría 0.
  // EN: Far above the cap: rejected before rounding, because with huge values
  //     redondear2's ×100 overflows and would give 0.
  if (Math.abs(n) > IMPORTE_MAX + 1) return { tipo: "excede", valor: 0 };

  // ES: Cerca del tope decide el valor ya redondeado.
  // EN: Near the cap, the already rounded value decides.
  const valor = redondear2(n);
  if (!importeDentroDeRango(valor)) return { tipo: "excede", valor: 0 };
  return { tipo: "valido", valor };
}
