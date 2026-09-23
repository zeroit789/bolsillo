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
 *   8. Raíz persistida y validación (DatosBolsillo, esDatosValidos) / Persisted root & validation
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
  | "tarjeta"
  | "prestamo"
  | "coche"
  | "moto"
  | "hipoteca"
  | "personal"
  | "otro";

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

// ES: Estructura completa que se persiste (y se cifra) en disco. Es el objeto
//     raíz que se carga al arrancar y se guarda en cada cambio.
// EN: The complete structure persisted (and encrypted) on disk. This is the root
//     object loaded at startup and saved on every change.
export interface DatosBolsillo {
  recurrentes: Recurrente[];
  puntuales: Puntual[];
  deudas: Deuda[];
  planes: Plan[];
  presupuestos: Presupuesto[];
  plantillas: Plantilla[];
  cuentas: Cuenta[];
}

// ES: Valida (de forma laxa pero suficiente) que un objeto tenga la forma de
//     DatosBolsillo. Evita hidratar datos corruptos (de una copia importada o de
//     un blob dañado) que dejarían los KPIs en NaN o romperían el render.
//     Devuelve un type predicate para que quien llama estreche `unknown` a DatosBolsillo.
// EN: Validates (loosely but enough) that an object has the shape of
//     DatosBolsillo. It guards against hydrating corrupt data (from an imported
//     backup or a damaged blob) that would leave KPIs as NaN or break the render.
//     Returns a type predicate so callers narrow `unknown` to DatosBolsillo.
export function esDatosValidos(d: unknown): d is DatosBolsillo {
  // ES: Debe ser un objeto no nulo antes de poder mirar sus claves.
  // EN: Must be a non-null object before we can inspect its keys.
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  // ES: Las tres colecciones núcleo son obligatorias y deben ser arrays.
  // EN: The three core collections are mandatory and must be arrays.
  if (!Array.isArray(o.recurrentes) || !Array.isArray(o.puntuales) || !Array.isArray(o.deudas))
    return false;
  // ES: Pequeños guards de tipo reutilizables en las comprobaciones por elemento de abajo.
  // EN: Tiny reusable type guards used across the per-item checks below.
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const str = (x: unknown) => typeof x === "string";
  const signo = (x: unknown) => x === "ingreso" || x === "gasto";
  // ES: Formato de mes/fecha real (blinda los cálculos de fechas aguas abajo).
  // EN: Real month/date format checks (shield the downstream date math).
  const mesOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}$/.test(x);
  const fechaOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x);
  // ES: Cada recurrente debe tener id, importe finito, signo/categoría válidos
  //     y un `desde` válido; `hasta` es null o un mes válido.
  // EN: Every recurring entry must have id, finite amount, valid sign/category
  //     and a valid `desde`; `hasta` is either null or a valid month.
  const rec = o.recurrentes.every(
    (r: any) => r && str(r.id) && num(r.importe) && signo(r.signo) && str(r.categoria) && mesOk(r.desde) && (r.hasta === null || mesOk(r.hasta))
  );
  // ES: Las subdivisiones (gasto dividido) son opcionales, pero si vienen deben
  //     ser un array de { categoria:string, importe:number finito } o el reparto
  //     por categoría daría NaN.
  // EN: Subdivisions (split expense) are optional, but if present they must be
  //     an array of { categoria:string, importe:number finite } or the
  //     per-category split would produce NaN.
  const subOk = (p: any) =>
    p.subdivisiones === undefined ||
    (Array.isArray(p.subdivisiones) &&
      p.subdivisiones.every((s: any) => s && str(s.categoria) && num(s.importe)));
  // ES: Cada puntual debe tener id, importe finito, signo/categoría válidos,
  //     una fecha válida y (si vienen) subdivisiones válidas.
  // EN: Every one-off entry must have id, finite amount, valid sign/category,
  //     a valid date, and (if present) valid subdivisions.
  const pun = o.puntuales.every(
    (p: any) => p && str(p.id) && num(p.importe) && signo(p.signo) && str(p.categoria) && fechaOk(p.fecha) && subOk(p)
  );
  // ES: Cada deuda debe tener id, total/cuota/pagado finitos y un mes de inicio
  //     válido.
  // EN: Every debt must have id, finite total/installment/paid amounts and a
  //     valid start month.
  const deu = o.deudas.every(
    (x: any) => x && str(x.id) && num(x.total) && num(x.cuotaMensual) && num(x.pagadoInicial) && mesOk(x.inicioMes)
  );
  // ES: planes/presupuestos/plantillas/cuentas son opcionales (copias antiguas
  //     no los traen); cuando vienen, cada elemento se valida aquí abajo.
  // EN: planes/presupuestos/plantillas/cuentas are optional (old backups may not
  //     include them); when present, each item is validated below.
  const pla =
    o.planes === undefined ||
    (Array.isArray(o.planes) &&
      o.planes.every((x: any) => x && str(x.id) && str(x.nombre) && num(x.objetivo) && num(x.aportado)));
  const pre =
    o.presupuestos === undefined ||
    (Array.isArray(o.presupuestos) &&
      o.presupuestos.every((x: any) => x && str(x.categoria) && num(x.limite)));
  const pll =
    o.plantillas === undefined ||
    (Array.isArray(o.plantillas) &&
      o.plantillas.every((x: any) => x && str(x.id) && str(x.concepto) && num(x.importe) && signo(x.signo) && str(x.categoria)));
  const cue =
    o.cuentas === undefined ||
    (Array.isArray(o.cuentas) &&
      o.cuentas.every((x: any) => x && str(x.id) && str(x.nombre) && num(x.saldoInicial)));
  // ES: Válido solo si todas las colecciones pasan su comprobación.
  // EN: Valid only if every collection passes its check.
  return rec && pun && deu && pla && pre && pll && cue;
}
