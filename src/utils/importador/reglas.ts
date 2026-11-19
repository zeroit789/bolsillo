/* =============================================================================
 * reglas.ts — Reglas de categorización / Categorisation rules
 * -----------------------------------------------------------------------------
 * ES: Reglas «si el concepto contiene X, la categoría es Y» para categorizar
 *     solas las filas importadas, y sugerencia de reglas nuevas a partir de
 *     las correcciones que hace el usuario.
 *       - Comparación sin mayúsculas, acentos ni espacios de más
 *         (normalizarTexto), como subcadena del concepto.
 *       - Orden determinista: gana la regla de MENOR `prioridad`; a igualdad,
 *         la que va antes en la lista. Las reglas con `activa: false` o con el
 *         texto vacío no cuentan. `signo` opcional: la regla solo vale para
 *         ingresos o solo para gastos (Bizum recibido frente a Bizum enviado).
 *       - sugerirReglas: trocea cada concepto corregido en palabras
 *         significativas (sin palabras vacías de banco como "compra", "tarj",
 *         "recibo"; sin números, fechas ni referencias; 3 letras o más). Si una
 *         palabra sale en al menos `minVeces` correcciones y al menos el
 *         `umbral` de ellas van a la misma categoría, propone la regla. Si con
 *         todas juntas no hay acuerdo pero lo hay separando ingresos y gastos,
 *         propone una regla por signo. No propone lo que ya haría una regla
 *         existente ni una palabra cuyas correcciones ya cubre otra sugerencia
 *         más amplia de la misma categoría (el nombre de la ciudad junto al del
 *         comercio).
 *     Las reglas son JSON plano para guardarlas cifradas con los datos;
 *     esReglaCategoriaValida las valida al leerlas de disco.
 * EN: «If the concept contains X, the category is Y» rules to categorise
 *     imported rows on their own, and suggestion of new rules from the
 *     corrections the user makes.
 *       - Comparison ignoring case, accents and extra spaces (normalizarTexto),
 *         as a substring of the concept.
 *       - Deterministic order: the rule with the LOWEST `prioridad` wins; if
 *         tied, the one earlier in the list. Rules with `activa: false` or
 *         empty text do not count. Optional `signo`: the rule only applies to
 *         income or only to expenses (Bizum received versus Bizum sent).
 *       - sugerirReglas: splits every corrected concept into meaningful words
 *         (no bank stop words such as "compra", "tarj", "recibo"; no numbers,
 *         dates or references; 3 letters or more). If a word shows up in at
 *         least `minVeces` corrections and at least `umbral` of them go to the
 *         same category, the rule is proposed. If all together do not agree
 *         but they do once income and expenses are split, one rule per sign is
 *         proposed. It does not propose what an existing rule would already do,
 *         nor a word whose corrections are already covered by a broader
 *         suggestion of the same category (the city name next to the shop's).
 *     Rules are plain JSON to store them encrypted with the data;
 *     esReglaCategoriaValida validates them when read from disk.
 * ===========================================================================*/
import { normalizarTexto } from "./texto";
import type { SignoMovimiento } from "./vistaPrevia";

// ── 1. Tipos / Types ─────────────────────────────────────────────────────────

// ES: Regla guardada. / EN: Saved rule.
export interface ReglaCategoria {
  id: string;
  contiene: string; // ES: texto a buscar en el concepto / EN: text to look for in the concept
  categoria: string;
  prioridad: number; // ES: menor = se mira antes / EN: lower = checked first
  signo?: SignoMovimiento; // ES: solo ingresos o solo gastos / EN: income only or expenses only
  activa?: boolean; // ES: false = desactivada (por defecto, activa) / EN: false = disabled (active by default)
}

// ES: Corrección del usuario: a este concepto le puso esta categoría.
// EN: User correction: this concept was given this category.
export interface Correccion {
  concepto: string;
  categoria: string;
  signo?: SignoMovimiento;
}

// ES: Regla propuesta, con cuántas correcciones la apoyan y algunos ejemplos.
// EN: Proposed rule, with how many corrections back it and a few examples.
export interface SugerenciaRegla {
  contiene: string;
  categoria: string;
  signo?: SignoMovimiento;
  apoyos: number;
  ejemplos: string[];
}

// ES: Opciones de sugerirReglas. / EN: sugerirReglas options.
export interface OpcionesSugerencia {
  minVeces?: number; // ES: correcciones mínimas (2) / EN: minimum corrections (2)
  umbral?: number; // ES: proporción mínima a la misma categoría (1 = todas) / EN: minimum share to the same category (1 = all)
  maxEjemplos?: number; // ES: ejemplos por sugerencia (3) / EN: examples per suggestion (3)
}

// ── 2. Aplicar reglas / Applying rules ───────────────────────────────────────

// ES: Reglas utilizables ordenadas por prioridad (estable: a igualdad, el
//     orden de la lista). Se normaliza el texto una sola vez.
// EN: Usable rules sorted by priority (stable: if tied, list order). The text
//     is normalised only once.
function ordenar(reglas: ReglaCategoria[]): { regla: ReglaCategoria; texto: string }[] {
  return reglas
    .map((regla, i) => ({ regla, i, texto: normalizarTexto(regla.contiene) }))
    .filter((r) => r.regla.activa !== false && r.texto !== "")
    .sort((a, b) => a.regla.prioridad - b.regla.prioridad || a.i - b.i);
}

// ES: Primera regla que encaja con el concepto y el signo, o null.
// EN: First rule matching the concept and the sign, or null.
export function categorizar(
  concepto: string,
  signo: SignoMovimiento,
  reglas: ReglaCategoria[]
): ReglaCategoria | null {
  const c = normalizarTexto(concepto);
  for (const { regla, texto } of ordenar(reglas)) {
    if (regla.signo && regla.signo !== signo) continue;
    if (c.includes(texto)) return regla;
  }
  return null;
}

// ES: Aplica las reglas a una lista de filas: cada una sale con `categoria` y
//     `reglaId` (null si ninguna encaja). No modifica las filas de entrada.
// EN: Applies the rules to a list of rows: each comes out with `categoria`
//     and `reglaId` (null if none matches). Input rows are not modified.
export function aplicarReglas<T extends { concepto: string; signo: SignoMovimiento }>(
  filas: T[],
  reglas: ReglaCategoria[]
): (T & { categoria: string | null; reglaId: string | null })[] {
  return filas.map((f) => {
    const r = categorizar(f.concepto, f.signo, reglas);
    return { ...f, categoria: r ? r.categoria : null, reglaId: r ? r.id : null };
  });
}

// ── 3. Sugerir reglas / Suggesting rules ─────────────────────────────────────

// ES: Palabras vacías (ya normalizadas): artículos y preposiciones, la jerga
//     de los extractos que sale en casi todos los conceptos y los meses (con
//     sus abreviaturas), que son fechas.
// EN: Stop words (already normalised): articles and prepositions, the
//     statement jargon that shows up in almost every concept and the months
//     (with their abbreviations), which are dates.
const VACIAS = new Set([
  "del", "las", "los", "por", "para", "con", "sin", "sus", "una", "uno",
  "compra", "compras", "tarj", "tarjeta", "pago", "pagos", "recibo", "recibos",
  "cargo", "abono", "adeudo", "transferencia", "transf", "trf", "operacion",
  "ref", "referencia", "num", "fecha", "concepto", "slu", "cia", "eur", "euros",
  "internet", "online", "web", "cajero", "comision", "favor",
  "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
  "septiembre", "setiembre", "octubre", "noviembre", "diciembre",
  "ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "sept", "oct", "nov", "dic",
]); // prettier-ignore

// ES: Palabras significativas de un concepto, en orden y sin repetir: 3 o más
//     caracteres, sin cifras (números, fechas, tarjetas, referencias) y fuera
//     de las palabras vacías.
// EN: Meaningful words of a concept, in order and without repeats: 3 or more
//     characters, no digits (numbers, dates, cards, references) and outside
//     the stop words.
export function tokensSignificativos(concepto: string): string[] {
  const vistos = new Set<string>();
  for (const t of normalizarTexto(concepto).split(/[^a-z0-9]+/)) {
    if (t.length < 3 || /\d/.test(t) || VACIAS.has(t)) continue;
    vistos.add(t);
  }
  return [...vistos];
}

// ES: Propone reglas a partir de las correcciones (ver cabecera). Resultado
//     ordenado por apoyos (de más a menos) y, a igualdad, por aparición.
// EN: Proposes rules from the corrections (see header). Result sorted by
//     support (most first) and, if tied, by appearance.
export function sugerirReglas(
  correcciones: Correccion[],
  reglasExistentes: ReglaCategoria[],
  opciones: OpcionesSugerencia = {}
): SugerenciaRegla[] {
  const minVeces = Math.max(1, opciones.minVeces ?? 2);
  const umbral = opciones.umbral ?? 1;
  const maxEjemplos = opciones.maxEjemplos ?? 3;

  // ES: Índice palabra -> correcciones que la contienen, en orden de aparición.
  // EN: Index word -> corrections containing it, in order of appearance.
  const porToken = new Map<string, number[]>();
  correcciones.forEach((c, i) => {
    for (const t of tokensSignificativos(c.concepto)) {
      const lista = porToken.get(t) ?? [];
      lista.push(i);
      porToken.set(t, lista);
    }
  });

  // ES: Candidata: palabra, categoría, signo opcional y correcciones que la apoyan.
  // EN: Candidate: word, category, optional sign and corrections backing it.
  type Candidata = { token: string; categoria: string; signo?: SignoMovimiento; apoyo: number[] };
  const candidatas: Candidata[] = [];

  // ES: Categoría mayoritaria de un grupo de correcciones si llega al umbral.
  // EN: Majority category of a group of corrections if it reaches the threshold.
  const mayoritaria = (grupo: number[]): { categoria: string; apoyo: number[] } | null => {
    if (grupo.length < minVeces) return null;
    const por = new Map<string, number[]>();
    for (const i of grupo) {
      const lista = por.get(correcciones[i].categoria) ?? [];
      lista.push(i);
      por.set(correcciones[i].categoria, lista);
    }
    let mejor: { categoria: string; apoyo: number[] } | null = null;
    for (const [categoria, apoyo] of por) {
      if (!mejor || apoyo.length > mejor.apoyo.length) mejor = { categoria, apoyo };
    }
    if (!mejor || mejor.apoyo.length < minVeces) return null;
    return mejor.apoyo.length / grupo.length >= umbral ? mejor : null;
  };

  for (const [token, grupo] of porToken) {
    const todas = mayoritaria(grupo);
    if (todas) {
      candidatas.push({ token, ...todas });
      continue;
    }
    // ES: Sin acuerdo general: se prueba por separado ingresos y gastos.
    // EN: No overall agreement: income and expenses are tried separately.
    for (const signo of ["ingreso", "gasto"] as const) {
      const r = mayoritaria(grupo.filter((i) => correcciones[i].signo === signo));
      if (r) candidatas.push({ token, signo, ...r });
    }
  }

  // ES: Las más apoyadas primero (a igualdad, por aparición) para que la
  //     palabra del comercio gane a la de la ciudad que la acompaña.
  // EN: Most supported first (if tied, by appearance) so the shop's word beats
  //     the city word next to it.
  candidatas.sort((a, b) => b.apoyo.length - a.apoyo.length || a.apoyo[0] - b.apoyo[0]);

  const aceptadas: Candidata[] = [];
  for (const c of candidatas) {
    // ES: Ya lo hace una regla existente con todas sus correcciones.
    // EN: An existing rule already does it for all its corrections.
    const cubierta = c.apoyo.every((i) => {
      const signo = correcciones[i].signo ?? c.signo;
      const conceptoCorregido = correcciones[i].concepto;
      const signos: SignoMovimiento[] = signo ? [signo] : ["ingreso", "gasto"];
      return signos.every(
        (s) => categorizar(conceptoCorregido, s, reglasExistentes)?.categoria === c.categoria
      );
    });
    if (cubierta) continue;
    // ES: Sus correcciones ya las cubre otra sugerencia aceptada igual.
    // EN: Its corrections are already covered by an equal accepted suggestion.
    const redundante = aceptadas.some(
      (a) =>
        a.categoria === c.categoria &&
        a.signo === c.signo &&
        c.apoyo.every((i) => a.apoyo.includes(i))
    );
    if (redundante) continue;
    aceptadas.push(c);
  }

  return aceptadas.map((c) => ({
    contiene: c.token,
    categoria: c.categoria,
    ...(c.signo ? { signo: c.signo } : {}),
    apoyos: c.apoyo.length,
    ejemplos: c.apoyo.slice(0, maxEjemplos).map((i) => correcciones[i].concepto),
  }));
}

// ── 4. Validación al leer de disco / Validation when read from disk ──────────

// ES: true si `x` es una ReglaCategoria bien formada.
// EN: true if `x` is a well-formed ReglaCategoria.
export function esReglaCategoriaValida(x: unknown): x is ReglaCategoria {
  if (!x || typeof x !== "object" || Array.isArray(x)) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.contiene === "string" &&
    o.contiene.trim() !== "" &&
    typeof o.categoria === "string" &&
    typeof o.prioridad === "number" &&
    Number.isFinite(o.prioridad) &&
    (o.signo === undefined || o.signo === "ingreso" || o.signo === "gasto") &&
    (o.activa === undefined || typeof o.activa === "boolean")
  );
}
