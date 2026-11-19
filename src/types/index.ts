/* =============================================================================
 * index.ts — Tipos del dominio / Domain types
 * -----------------------------------------------------------------------------
 * ES: Única fuente de verdad del modelo de dominio de Bolsillo (v2). Define las
 *     tres entidades núcleo más todas las formas de apoyo de las que dependen la
 *     UI, los cálculos del mes y la capa de persistencia cifrada.
 * EN: Single source of truth for Bolsillo's domain model (v2). It defines the
 *     three core entities plus all the supporting shapes that the UI, the
 *     month calculations and the encrypted persistence layer rely on.
 *
 * ES: Las tres entidades núcleo son:
 *   - Recurrente: ingreso/gasto que se repite TODOS los meses (nómina, alquiler,
 *     suscripción). Se da de alta una vez y aparece en cada mes desde su alta.
 *   - Puntual: ingreso/gasto de un mes concreto (una compra, una venta).
 *   - Deuda: total + cuota mensual; la cuota cuenta como gasto fijo y la deuda
 *     se va saldando sola mes a mes hasta llegar a cero.
 * EN: The three core entities are:
 *   - Recurrente: income/expense that repeats EVERY month (payroll, rent,
 *     subscription). Created once, it shows up in every month from its start.
 *   - Puntual: income/expense of a single specific month (a purchase, a sale).
 *   - Deuda: total + monthly installment; the installment counts as a fixed
 *     expense and the debt pays itself down month by month until it hits zero.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Signo del apunte                       (Signo) / Entry sign
 *   2. Apuntes recurrentes             (Recurrente) / Recurring entries
 *   3. Apuntes puntuales                 (Puntual) / One-off entries
 *   4. Deudas                                      (TipoDeuda, TIPOS_DEUDA, Deuda, EstadoDeuda) / Debts
 *   5. Línea del mes (fila unificada) (LineaMes) / Month line (unified row)
 *   6. Cuentas y subdivisiones   (Cuenta, Subdivision) / Accounts & subdivisions
 *   7. Presupuestos, plantillas y planes (Presupuesto, Plantilla, Plan) / Budgets, templates & plans
 *   8. Raíz persistida y validación (VERSION_DATOS, DatosBolsillo, esDatosValidos) / Persisted root & validation
 * ===========================================================================*/

// ── 1. Signo del apunte / Entry sign ─────────────────────────────────────────

// ES: Un apunte suma (ingreso) o resta (gasto). El importe se guarda siempre en
//     positivo; el signo es lo que decide la dirección.
// EN: An entry either adds (income) or subtracts (expense). The amount itself
//     is always stored as a positive number; the sign decides direction.
export type Signo = "ingreso" | "gasto";

// ── 2. Apuntes recurrentes / Recurring entries ───────────────────────────────

// ES: Gasto/ingreso recurrente, vivo entre `desde` y `hasta` (incluidos).
//     Sirve para todo lo que se repite cada mes (nómina, alquiler, suscripciones).
// EN: A recurring income/expense, alive between `desde` and `hasta` (inclusive).
//     Used for everything that repeats each month (payroll, rent, subscriptions).
export interface Recurrente {
  id: string;
  concepto: string;
  importe: number; // ES: siempre positivo / EN: always positive
  signo: Signo;
  categoria: string;
  desde: string; // ES: "YYYY-MM" mes de alta / EN: "YYYY-MM" start month
  hasta: string | null; // ES: "YYYY-MM" mes de baja (incl.) o null = sin fin / EN: "YYYY-MM" end month (incl.) or null = open-ended
  diaPago?: number; // ES: día del mes (1-31) para recordatorios; opcional / EN: day of month (1-31) for reminders; optional
  comercio?: string; // ES: dónde se hizo (Mercadona, Amazon…); opcional / EN: where it happened (Mercadona, Amazon…); optional
  tags?: string[]; // ES: etiquetas transversales (#vacaciones…); opcional / EN: cross-cutting tags (#holidays…); optional
  cuenta?: string; // ES: id de la cuenta a la que pertenece; opcional / EN: id of the owning account; optional
}

// ── 3. Apuntes puntuales / One-off entries ───────────────────────────────────

// ES: Apunte puntual que pertenece a un mes concreto (fecha única, sin recurrencia).
//     Puede llevar imagen de recibo y dividirse entre varias categorías.
// EN: A one-off entry that belongs to one specific month (single date, not a
//     recurrence). May carry a receipt image and be split across categories.
export interface Puntual {
  id: string;
  concepto: string;
  importe: number;
  signo: Signo;
  categoria: string;
  fecha: string; // ES: "YYYY-MM-DD" / EN: "YYYY-MM-DD"
  comercio?: string; // ES: dónde se hizo (Mercadona, Amazon…); opcional / EN: where it happened (Mercadona, Amazon…); optional
  tags?: string[]; // ES: etiquetas transversales (#vacaciones…); opcional / EN: cross-cutting tags (#holidays…); optional
  recibo?: string; // ES: imagen del recibo en base64 (data URL); opcional / EN: receipt image as base64 (data URL); optional
  cuenta?: string; // ES: id de la cuenta a la que pertenece; opcional / EN: id of the owning account; optional
  subdivisiones?: Subdivision[]; // ES: gasto dividido en varias categorías; opcional / EN: expense split into several categories; optional
}

// ── 4. Deudas / Debts ─────────────────────────────────────────────────────────

// ES: Tipos de deuda admitidos (controla icono/etiqueta en la UI y agrupaciones).
// EN: Allowed debt types (drives icon/label in the UI and reporting buckets).
export type TipoDeuda =
  "tarjeta" | "prestamo" | "coche" | "moto" | "hipoteca" | "personal" | "otro";

// ES: Catálogo de tipos de deuda con etiqueta legible e icono. Se usa para
//     pintar selectores e insignias sin repetir cadenas por toda la UI.
// EN: Catalog of debt types with a human-readable label and an icon. Used to
//     render selectors and badges without hard-coding strings across the UI.
export const TIPOS_DEUDA: { valor: TipoDeuda; etiqueta: string; icono: string }[] = [
  { valor: "tarjeta", etiqueta: "Tarjeta de crédito", icono: "💳" },
  { valor: "prestamo", etiqueta: "Préstamo", icono: "🏦" },
  { valor: "coche", etiqueta: "Coche", icono: "🚗" },
  { valor: "moto", etiqueta: "Moto", icono: "🏍️" },
  { valor: "hipoteca", etiqueta: "Hipoteca", icono: "🏠" },
  { valor: "personal", etiqueta: "Préstamo personal", icono: "🤝" },
  { valor: "otro", etiqueta: "Otra deuda", icono: "📄" },
];

// ES: Una deuda: total a pagar, cuota mensual y lo ya pagado al darla de alta
//     (así la app puede continuar una deuda que ya venía en marcha).
// EN: A debt: total to repay, monthly installment, and how much was already
//     paid when it was registered (so the app can resume an in-progress debt).
export interface Deuda {
  id: string;
  concepto: string;
  tipo: TipoDeuda;
  total: number; // ES: importe total a saldar / EN: total amount to settle
  cuotaMensual: number; // ES: pago de cada mes / EN: payment for each month
  pagadoInicial: number; // ES: lo que ya llevabas pagado al registrarla / EN: amount already paid when registered
  inicioMes: string; // ES: "YYYY-MM" desde cuando cuenta en la app / EN: "YYYY-MM" from when it counts in the app
  diaPago?: number; // ES: día del mes (1-31) para recordatorios; opcional / EN: day of month (1-31) for reminders; optional
}

// ES: Estado de una deuda calculado PARA un mes concreto (derivado, no se guarda).
//     Alimenta barras de progreso, totales de gasto fijo e insignias de "saldada".
// EN: Snapshot of a debt computed FOR a specific month (derived, not stored).
//     Feeds progress bars, fixed-expense totals and "debt finished" badges.
export interface EstadoDeuda {
  deuda: Deuda;
  pagado: number; // ES: total abonado hasta ese mes (incl.) / EN: total paid up to that month (incl.)
  pendiente: number; // ES: lo que falta / EN: what is still owed
  cuotaDelMes: number; // ES: lo que cuenta como gasto fijo ese mes (0 si ya saldada) / EN: amount that counts as a fixed expense that month (0 if already settled)
  terminada: boolean; // ES: pagado >= total / EN: pagado >= total
  mesesRestantes: number; // ES: cuotas que faltan / EN: installments still pending
  progreso: number; // ES: 0..100 / EN: 0..100
}

// ── 5. Línea del mes (fila unificada) / Month line (unified row) ──────────────

// ES: Una "línea" del mes que se usa para pintar la lista. Unifica las tres
//     fuentes (recurrente/puntual/deuda) en una forma plana, así la vista de
//     lista no necesita saber qué entidad produjo cada fila.
// EN: A single "line" of the month used to paint the list. It unifies the three
//     sources (recurrente/puntual/deuda) into one flat shape so the list view
//     does not need to know which entity produced each row.
export interface LineaMes {
  id: string;
  origen: "recurrente" | "puntual" | "deuda";
  concepto: string;
  categoria: string;
  signo: Signo;
  importe: number;
  fijo: boolean; // ES: true = gasto/ingreso fijo; false = puntual / EN: true = fixed income/expense; false = one-off
  fecha?: string; // ES: solo puntuales / EN: one-off entries only
  comercio?: string; // ES: opcional / EN: optional
  tags?: string[]; // ES: opcional / EN: optional
  recibo?: string; // ES: imagen base64 (solo puntuales); opcional / EN: base64 image (one-off entries only); optional
  cuenta?: string; // ES: id de cuenta; opcional / EN: account id; optional
  subdivisiones?: Subdivision[]; // ES: gasto dividido; opcional / EN: split expense; optional
}

// ── 6. Cuentas y subdivisiones / Accounts & subdivisions ──────────────────────

// ES: Una cuenta/monedero (efectivo, banco, tarjeta…) para calcular el patrimonio.
//     El saldo inicial es la base sobre la que se acumulan los movimientos.
// EN: An account/wallet (cash, bank, card…) used to compute net worth. The
//     starting balance is the baseline on top of which movements accumulate.
export interface Cuenta {
  id: string;
  nombre: string;
  saldoInicial: number; // ES: saldo de partida al crear la cuenta / EN: starting balance when the account is created
}

// ES: Una subdivisión de un gasto dividido (parte del importe asignada a otra
//     categoría). La suma de subdivisiones debe cuadrar con el importe del padre.
// EN: A subdivision of a split expense (part of the amount assigned to another
//     category). The sum of subdivisions is expected to match the parent amount.
export interface Subdivision {
  categoria: string;
  importe: number;
}

// ── 7. Presupuestos, plantillas y planes / Budgets, templates & plans ─────────

// ES: Tope de gasto mensual para una categoría (presupuesto). Sirve para avisar
//     cuando se supera el límite.
// EN: A monthly spending cap for a category (budget). Used to flag overspend.
export interface Presupuesto {
  categoria: string;
  limite: number; // ES: importe máximo al mes / EN: maximum amount per month
}

// ES: Plantilla de movimiento para alta rápida (un clic), con campos rellenados.
// EN: A movement template for one-click quick entry (pre-filled fields).
export interface Plantilla {
  id: string;
  concepto: string;
  importe: number;
  signo: Signo;
  categoria: string;
}

// ES: Un plan / meta de ahorro o de compra doméstica (ej. "Pintar el salón – 110 €").
//     Lleva objetivo vs. aportado para que la UI muestre el progreso hacia la meta.
// EN: A savings/purchase goal for the home (e.g. "Paint the living room – 110 €").
//     Tracks target vs. accumulated so the UI can show progress toward the goal.
export interface Plan {
  id: string;
  nombre: string;
  objetivo: number; // ES: importe que quieres reunir / EN: amount you want to gather
  aportado: number; // ES: lo que llevas reunido / EN: amount gathered so far
}

// ── 8. Raíz persistida y validación / Persisted root & validation ─────────────

// ES: Versión ACTUAL del esquema de datos. Los datos guardados sin campo
//     `version` (todo lo anterior a la 1.2.0) son la versión 1; utils/migraciones.ts
//     los lleva paso a paso hasta esta versión antes de validarlos. Súbela (y
//     añade su migración) cada vez que cambie la forma de DatosBolsillo.
// EN: CURRENT data schema version. Data saved without a `version` field
//     (everything before 1.2.0) is version 1; utils/migraciones.ts upgrades it
//     step by step to this version before validating it. Bump it (and add its
//     migration) every time the shape of DatosBolsillo changes.
export const VERSION_DATOS = 2;

// ES: Estructura completa que se persiste (y se cifra) en disco. Es el objeto
//     raíz que se carga al arrancar y se guarda en cada cambio.
// EN: The complete structure persisted (and encrypted) on disk. This is the root
//     object loaded at startup and saved on every change.
export interface DatosBolsillo {
  version: number; // ES: versión del esquema (VERSION_DATOS) / EN: schema version (VERSION_DATOS)
  recurrentes: Recurrente[];
  puntuales: Puntual[];
  deudas: Deuda[];
  planes: Plan[];
  presupuestos: Presupuesto[];
  plantillas: Plantilla[];
  cuentas: Cuenta[];
}

// ES: Valida que un objeto tenga EXACTAMENTE la forma de DatosBolsillo en la
//     versión actual: todas las colecciones y todos los campos, incluidos los
//     opcionales (comercio, tags, recibo, cuenta, diaPago…). Las copias antiguas
//     NO se validan aquí directamente: antes pasan por `migrar` (utils/migraciones.ts).
//     Las claves desconocidas se toleran (p. ej. `categoriasCustom` de las copias).
//     Devuelve un type predicate para que quien llama estreche `unknown`.
// EN: Validates that an object has EXACTLY the shape of DatosBolsillo at the
//     current version: every collection and every field, optional ones included
//     (comercio, tags, recibo, cuenta, diaPago…). Old backups are NOT validated
//     here directly: they go through `migrar` (utils/migraciones.ts) first.
//     Unknown keys are tolerated (e.g. backups' `categoriasCustom`). Returns a
//     type predicate so callers narrow `unknown`.
export function esDatosValidos(d: unknown): d is DatosBolsillo {
  // ES: Debe ser un objeto no nulo (y no un array) de la versión actual.
  // EN: Must be a non-null object (not an array) of the current version.
  if (!d || typeof d !== "object" || Array.isArray(d)) return false;
  const o = d as Record<string, unknown>;
  if (o.version !== VERSION_DATOS) return false;

  // ES: Pequeños guards de tipo reutilizables en las comprobaciones por elemento.
  // EN: Tiny reusable type guards used across the per-item checks.
  const esObjeto = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object";
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const str = (x: unknown) => typeof x === "string";
  const signo = (x: unknown) => x === "ingreso" || x === "gasto";
  // ES: Formato de mes/fecha real (blinda los cálculos de fechas aguas abajo).
  // EN: Real month/date format checks (shield the downstream date math).
  const mesOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}$/.test(x);
  const fechaOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x);
  // ES: Campos opcionales: o no están (undefined) o tienen el tipo correcto.
  // EN: Optional fields: either absent (undefined) or of the right type.
  const opt = (x: unknown, ok: (v: unknown) => boolean) => x === undefined || ok(x);
  const diaOk = (x: unknown) => Number.isInteger(x) && (x as number) >= 1 && (x as number) <= 31;
  const tagsOk = (x: unknown) => Array.isArray(x) && x.every((t) => typeof t === "string");
  const tiposDeuda: string[] = TIPOS_DEUDA.map((t) => t.valor);
  // ES: Una colección obligatoria: array cuyos elementos (objetos) pasan `ok`.
  // EN: A mandatory collection: an array whose items (objects) all pass `ok`.
  const lista = (x: unknown, ok: (e: Record<string, unknown>) => boolean) =>
    Array.isArray(x) && x.every((e: unknown) => esObjeto(e) && ok(e));

  // ES: Recurrentes: id, concepto, importe finito, signo y categoría, `desde`
  //     válido, `hasta` null o mes válido, y sus opcionales bien formados.
  // EN: Recurring entries: id, concept, finite amount, sign and category, valid
  //     `desde`, `hasta` null or a valid month, and well-formed optionals.
  const rec = lista(
    o.recurrentes,
    (r) =>
      str(r.id) &&
      str(r.concepto) &&
      num(r.importe) &&
      signo(r.signo) &&
      str(r.categoria) &&
      mesOk(r.desde) &&
      (r.hasta === null || mesOk(r.hasta)) &&
      opt(r.diaPago, diaOk) &&
      opt(r.comercio, str) &&
      opt(r.tags, tagsOk) &&
      opt(r.cuenta, str)
  );
  // ES: Las subdivisiones (gasto dividido) son opcionales, pero si vienen deben
  //     ser { categoria:string, importe:number finito } o el reparto daría NaN.
  // EN: Subdivisions (split expense) are optional, but if present they must be
  //     { categoria:string, importe:number finite } or the split would be NaN.
  const subOk = (x: unknown) =>
    Array.isArray(x) && x.every((e: unknown) => esObjeto(e) && str(e.categoria) && num(e.importe));
  // ES: Puntuales: id, concepto, importe, signo, categoría, fecha válida y sus
  //     opcionales (comercio, tags, recibo, cuenta, subdivisiones).
  // EN: One-off entries: id, concept, amount, sign, category, valid date and
  //     their optionals (comercio, tags, recibo, cuenta, subdivisiones).
  const pun = lista(
    o.puntuales,
    (p) =>
      str(p.id) &&
      str(p.concepto) &&
      num(p.importe) &&
      signo(p.signo) &&
      str(p.categoria) &&
      fechaOk(p.fecha) &&
      opt(p.comercio, str) &&
      opt(p.tags, tagsOk) &&
      opt(p.recibo, str) &&
      opt(p.cuenta, str) &&
      opt(p.subdivisiones, subOk)
  );
  // ES: Deudas: id, concepto, tipo conocido, importes finitos, mes de inicio
  //     válido y día de pago opcional.
  // EN: Debts: id, concept, known type, finite amounts, valid start month and
  //     optional payment day.
  const deu = lista(
    o.deudas,
    (x) =>
      str(x.id) &&
      str(x.concepto) &&
      tiposDeuda.includes(x.tipo as string) &&
      num(x.total) &&
      num(x.cuotaMensual) &&
      num(x.pagadoInicial) &&
      mesOk(x.inicioMes) &&
      opt(x.diaPago, diaOk)
  );
  // ES: En la versión actual el resto de colecciones también son obligatorias
  //     (la migración desde v1 las rellena con [] si faltaban).
  // EN: At the current version the remaining collections are mandatory too
  //     (the migration from v1 fills them with [] when missing).
  const pla = lista(
    o.planes,
    (x) => str(x.id) && str(x.nombre) && num(x.objetivo) && num(x.aportado)
  );
  const pre = lista(o.presupuestos, (x) => str(x.categoria) && num(x.limite));
  const pll = lista(
    o.plantillas,
    (x) => str(x.id) && str(x.concepto) && num(x.importe) && signo(x.signo) && str(x.categoria)
  );
  const cue = lista(o.cuentas, (x) => str(x.id) && str(x.nombre) && num(x.saldoInicial));
  // ES: Válido solo si todas las colecciones pasan su comprobación.
  // EN: Valid only if every collection passes its check.
  return rec && pun && deu && pla && pre && pll && cue;
}
