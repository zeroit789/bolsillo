/* =============================================================================
 * index.ts — Domain types / Tipos del dominio
 * -----------------------------------------------------------------------------
 * EN: Single source of truth for Bolsillo's domain model (v2). It defines the
 *     three core entities plus all the supporting shapes that the UI, the
 *     month calculations and the encrypted persistence layer rely on.
 * ES: Única fuente de verdad del modelo de dominio de Bolsillo (v2). Define las
 *     tres entidades núcleo más todas las formas de apoyo de las que dependen la
 *     UI, los cálculos del mes y la capa de persistencia cifrada.
 *
 * EN: The three core entities are:
 *   - Recurrente: income/expense that repeats EVERY month (payroll, rent,
 *     subscription). Created once, it shows up in every month from its start.
 *   - Puntual: income/expense of a single specific month (a purchase, a sale).
 *   - Deuda: total + monthly installment; the installment counts as a fixed
 *     expense and the debt pays itself down month by month until it hits zero.
 * ES: Las tres entidades núcleo son:
 *   - Recurrente: ingreso/gasto que se repite TODOS los meses (nómina, alquiler,
 *     suscripción). Se da de alta una vez y aparece en cada mes desde su alta.
 *   - Puntual: ingreso/gasto de un mes concreto (una compra, una venta).
 *   - Deuda: total + cuota mensual; la cuota cuenta como gasto fijo y la deuda
 *     se va saldando sola mes a mes hasta llegar a cero.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Entry sign / Signo del apunte                       (Signo)
 *   2. Recurring entries / Apuntes recurrentes             (Recurrente)
 *   3. One-off entries / Apuntes puntuales                 (Puntual)
 *   4. Debts / Deudas                                      (TipoDeuda, TIPOS_DEUDA, Deuda, EstadoDeuda)
 *   5. Month line (unified row) / Línea del mes (fila unificada) (LineaMes)
 *   6. Accounts & subdivisions / Cuentas y subdivisiones   (Cuenta, Subdivision)
 *   7. Budgets, templates & plans / Presupuestos, plantillas y planes (Presupuesto, Plantilla, Plan)
 *   8. Persisted root & validation / Raíz persistida y validación (DatosBolsillo, esDatosValidos)
 * ===========================================================================*/

// ── 1. Entry sign / Signo del apunte ─────────────────────────────────────────

// EN: An entry either adds (income) or subtracts (expense). The amount itself
//     is always stored as a positive number; the sign decides direction.
// ES: Un apunte suma (ingreso) o resta (gasto). El importe se guarda siempre en
//     positivo; el signo es lo que decide la dirección.
export type Signo = "ingreso" | "gasto";

// ── 2. Recurring entries / Apuntes recurrentes ───────────────────────────────

// EN: A recurring income/expense, alive between `desde` and `hasta` (inclusive).
//     Used for everything that repeats each month (payroll, rent, subscriptions).
// ES: Gasto/ingreso recurrente, vivo entre `desde` y `hasta` (incluidos).
//     Sirve para todo lo que se repite cada mes (nómina, alquiler, suscripciones).
export interface Recurrente {
  id: string;
  concepto: string;
  importe: number; // EN: always positive / ES: siempre positivo
  signo: Signo;
  categoria: string;
  desde: string; // EN: "YYYY-MM" start month / ES: "YYYY-MM" mes de alta
  hasta: string | null; // EN: "YYYY-MM" end month (incl.) or null = open-ended / ES: "YYYY-MM" mes de baja (incl.) o null = sin fin
  diaPago?: number; // EN: day of month (1-31) for reminders; optional / ES: día del mes (1-31) para recordatorios; opcional
  comercio?: string; // EN: where it happened (Mercadona, Amazon…); optional / ES: dónde se hizo (Mercadona, Amazon…); opcional
  tags?: string[]; // EN: cross-cutting tags (#holidays…); optional / ES: etiquetas transversales (#vacaciones…); opcional
  cuenta?: string; // EN: id of the owning account; optional / ES: id de la cuenta a la que pertenece; opcional
}

// ── 3. One-off entries / Apuntes puntuales ───────────────────────────────────

// EN: A one-off entry that belongs to one specific month (single date, not a
//     recurrence). May carry a receipt image and be split across categories.
// ES: Apunte puntual que pertenece a un mes concreto (fecha única, sin recurrencia).
//     Puede llevar imagen de recibo y dividirse entre varias categorías.
export interface Puntual {
  id: string;
  concepto: string;
  importe: number;
  signo: Signo;
  categoria: string;
  fecha: string; // EN: "YYYY-MM-DD" / ES: "YYYY-MM-DD"
  comercio?: string; // EN: where it happened (Mercadona, Amazon…); optional / ES: dónde se hizo (Mercadona, Amazon…); opcional
  tags?: string[]; // EN: cross-cutting tags (#holidays…); optional / ES: etiquetas transversales (#vacaciones…); opcional
  recibo?: string; // EN: receipt image as base64 (data URL); optional / ES: imagen del recibo en base64 (data URL); opcional
  cuenta?: string; // EN: id of the owning account; optional / ES: id de la cuenta a la que pertenece; opcional
  subdivisiones?: Subdivision[]; // EN: expense split into several categories; optional / ES: gasto dividido en varias categorías; opcional
}

// ── 4. Debts / Deudas ─────────────────────────────────────────────────────────

// EN: Allowed debt types (drives icon/label in the UI and reporting buckets).
// ES: Tipos de deuda admitidos (controla icono/etiqueta en la UI y agrupaciones).
export type TipoDeuda =
  | "tarjeta"
  | "prestamo"
  | "coche"
  | "moto"
  | "hipoteca"
  | "personal"
  | "otro";

// EN: Catalog of debt types with a human-readable label and an icon. Used to
//     render selectors and badges without hard-coding strings across the UI.
// ES: Catálogo de tipos de deuda con etiqueta legible e icono. Se usa para
//     pintar selectores e insignias sin repetir cadenas por toda la UI.
export const TIPOS_DEUDA: { valor: TipoDeuda; etiqueta: string; icono: string }[] = [
  { valor: "tarjeta", etiqueta: "Tarjeta de crédito", icono: "💳" },
  { valor: "prestamo", etiqueta: "Préstamo", icono: "🏦" },
  { valor: "coche", etiqueta: "Coche", icono: "🚗" },
  { valor: "moto", etiqueta: "Moto", icono: "🏍️" },
  { valor: "hipoteca", etiqueta: "Hipoteca", icono: "🏠" },
  { valor: "personal", etiqueta: "Préstamo personal", icono: "🤝" },
  { valor: "otro", etiqueta: "Otra deuda", icono: "📄" },
];

// EN: A debt: total to repay, monthly installment, and how much was already
//     paid when it was registered (so the app can resume an in-progress debt).
// ES: Una deuda: total a pagar, cuota mensual y lo ya pagado al darla de alta
//     (así la app puede continuar una deuda que ya venía en marcha).
export interface Deuda {
  id: string;
  concepto: string;
  tipo: TipoDeuda;
  total: number; // EN: total amount to settle / ES: importe total a saldar
  cuotaMensual: number; // EN: payment for each month / ES: pago de cada mes
  pagadoInicial: number; // EN: amount already paid when registered / ES: lo que ya llevabas pagado al registrarla
  inicioMes: string; // EN: "YYYY-MM" from when it counts in the app / ES: "YYYY-MM" desde cuando cuenta en la app
  diaPago?: number; // EN: day of month (1-31) for reminders; optional / ES: día del mes (1-31) para recordatorios; opcional
}

// EN: Snapshot of a debt computed FOR a specific month (derived, not stored).
//     Feeds progress bars, fixed-expense totals and "debt finished" badges.
// ES: Estado de una deuda calculado PARA un mes concreto (derivado, no se guarda).
//     Alimenta barras de progreso, totales de gasto fijo e insignias de "saldada".
export interface EstadoDeuda {
  deuda: Deuda;
  pagado: number; // EN: total paid up to that month (incl.) / ES: total abonado hasta ese mes (incl.)
  pendiente: number; // EN: what is still owed / ES: lo que falta
  cuotaDelMes: number; // EN: amount that counts as a fixed expense that month (0 if already settled) / ES: lo que cuenta como gasto fijo ese mes (0 si ya saldada)
  terminada: boolean; // EN: pagado >= total / ES: pagado >= total
  mesesRestantes: number; // EN: installments still pending / ES: cuotas que faltan
  progreso: number; // EN: 0..100 / ES: 0..100
}

// ── 5. Month line (unified row) / Línea del mes (fila unificada) ──────────────

// EN: A single "line" of the month used to paint the list. It unifies the three
//     sources (recurrente/puntual/deuda) into one flat shape so the list view
//     does not need to know which entity produced each row.
// ES: Una "línea" del mes que se usa para pintar la lista. Unifica las tres
//     fuentes (recurrente/puntual/deuda) en una forma plana, así la vista de
//     lista no necesita saber qué entidad produjo cada fila.
export interface LineaMes {
  id: string;
  origen: "recurrente" | "puntual" | "deuda";
  concepto: string;
  categoria: string;
  signo: Signo;
  importe: number;
  fijo: boolean; // EN: true = fixed income/expense; false = one-off / ES: true = gasto/ingreso fijo; false = puntual
  fecha?: string; // EN: one-off entries only / ES: solo puntuales
  comercio?: string; // EN: optional / ES: opcional
  tags?: string[]; // EN: optional / ES: opcional
  recibo?: string; // EN: base64 image (one-off entries only); optional / ES: imagen base64 (solo puntuales); opcional
  cuenta?: string; // EN: account id; optional / ES: id de cuenta; opcional
  subdivisiones?: Subdivision[]; // EN: split expense; optional / ES: gasto dividido; opcional
}

// ── 6. Accounts & subdivisions / Cuentas y subdivisiones ──────────────────────

// EN: An account/wallet (cash, bank, card…) used to compute net worth. The
//     starting balance is the baseline on top of which movements accumulate.
// ES: Una cuenta/monedero (efectivo, banco, tarjeta…) para calcular el patrimonio.
//     El saldo inicial es la base sobre la que se acumulan los movimientos.
export interface Cuenta {
  id: string;
  nombre: string;
  saldoInicial: number; // EN: starting balance when the account is created / ES: saldo de partida al crear la cuenta
}

// EN: A subdivision of a split expense (part of the amount assigned to another
//     category). The sum of subdivisions is expected to match the parent amount.
// ES: Una subdivisión de un gasto dividido (parte del importe asignada a otra
//     categoría). La suma de subdivisiones debe cuadrar con el importe del padre.
export interface Subdivision {
  categoria: string;
  importe: number;
}

// ── 7. Budgets, templates & plans / Presupuestos, plantillas y planes ─────────

// EN: A monthly spending cap for a category (budget). Used to flag overspend.
// ES: Tope de gasto mensual para una categoría (presupuesto). Sirve para avisar
//     cuando se supera el límite.
export interface Presupuesto {
  categoria: string;
  limite: number; // EN: maximum amount per month / ES: importe máximo al mes
}

// EN: A movement template for one-click quick entry (pre-filled fields).
// ES: Plantilla de movimiento para alta rápida (un clic), con campos rellenados.
export interface Plantilla {
  id: string;
  concepto: string;
  importe: number;
  signo: Signo;
  categoria: string;
}

// EN: A savings/purchase goal for the home (e.g. "Paint the living room – 110 €").
//     Tracks target vs. accumulated so the UI can show progress toward the goal.
// ES: Un plan / meta de ahorro o de compra doméstica (ej. "Pintar el salón – 110 €").
//     Lleva objetivo vs. aportado para que la UI muestre el progreso hacia la meta.
export interface Plan {
  id: string;
  nombre: string;
  objetivo: number; // EN: amount you want to gather / ES: importe que quieres reunir
  aportado: number; // EN: amount gathered so far / ES: lo que llevas reunido
}

// ── 8. Persisted root & validation / Raíz persistida y validación ─────────────

// EN: The complete structure persisted (and encrypted) on disk. This is the root
//     object loaded at startup and saved on every change.
// ES: Estructura completa que se persiste (y se cifra) en disco. Es el objeto
//     raíz que se carga al arrancar y se guarda en cada cambio.
export interface DatosBolsillo {
  recurrentes: Recurrente[];
  puntuales: Puntual[];
  deudas: Deuda[];
  planes: Plan[];
  presupuestos: Presupuesto[];
  plantillas: Plantilla[];
  cuentas: Cuenta[];
}

// EN: Validates (loosely but enough) that an object has the shape of
//     DatosBolsillo. It guards against hydrating corrupt data (from an imported
//     backup or a damaged blob) that would leave KPIs as NaN or break the render.
//     Returns a type predicate so callers narrow `unknown` to DatosBolsillo.
// ES: Valida (de forma laxa pero suficiente) que un objeto tenga la forma de
//     DatosBolsillo. Evita hidratar datos corruptos (de una copia importada o de
//     un blob dañado) que dejarían los KPIs en NaN o romperían el render.
//     Devuelve un type predicate para que quien llama estreche `unknown` a DatosBolsillo.
export function esDatosValidos(d: unknown): d is DatosBolsillo {
  // EN: Must be a non-null object before we can inspect its keys.
  // ES: Debe ser un objeto no nulo antes de poder mirar sus claves.
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  // EN: The three core collections are mandatory and must be arrays.
  // ES: Las tres colecciones núcleo son obligatorias y deben ser arrays.
  if (!Array.isArray(o.recurrentes) || !Array.isArray(o.puntuales) || !Array.isArray(o.deudas))
    return false;
  // EN: Tiny reusable type guards used across the per-item checks below.
  // ES: Pequeños guards de tipo reutilizables en las comprobaciones por elemento de abajo.
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const str = (x: unknown) => typeof x === "string";
  const signo = (x: unknown) => x === "ingreso" || x === "gasto";
  // EN: Real month/date format checks (shield the downstream date math).
  // ES: Formato de mes/fecha real (blinda los cálculos de fechas aguas abajo).
  const mesOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}$/.test(x);
  const fechaOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x);
  // EN: Every recurring entry must have id, finite amount, valid sign/category
  //     and a valid `desde`; `hasta` is either null or a valid month.
  // ES: Cada recurrente debe tener id, importe finito, signo/categoría válidos
  //     y un `desde` válido; `hasta` es null o un mes válido.
  const rec = o.recurrentes.every(
    (r: any) => r && str(r.id) && num(r.importe) && signo(r.signo) && str(r.categoria) && mesOk(r.desde) && (r.hasta === null || mesOk(r.hasta))
  );
  // EN: Subdivisions (split expense) are optional, but if present they must be
  //     an array of { categoria:string, importe:number finite } or the
  //     per-category split would produce NaN.
  // ES: Las subdivisiones (gasto dividido) son opcionales, pero si vienen deben
  //     ser un array de { categoria:string, importe:number finito } o el reparto
  //     por categoría daría NaN.
  const subOk = (p: any) =>
    p.subdivisiones === undefined ||
    (Array.isArray(p.subdivisiones) &&
      p.subdivisiones.every((s: any) => s && str(s.categoria) && num(s.importe)));
  // EN: Every one-off entry must have id, finite amount, valid sign/category,
  //     a valid date, and (if present) valid subdivisions.
  // ES: Cada puntual debe tener id, importe finito, signo/categoría válidos,
  //     una fecha válida y (si vienen) subdivisiones válidas.
  const pun = o.puntuales.every(
    (p: any) => p && str(p.id) && num(p.importe) && signo(p.signo) && str(p.categoria) && fechaOk(p.fecha) && subOk(p)
  );
  // EN: Every debt must have id, finite total/installment/paid amounts and a
  //     valid start month.
  // ES: Cada deuda debe tener id, total/cuota/pagado finitos y un mes de inicio
  //     válido.
  const deu = o.deudas.every(
    (x: any) => x && str(x.id) && num(x.total) && num(x.cuotaMensual) && num(x.pagadoInicial) && mesOk(x.inicioMes)
  );
  // EN: planes/presupuestos/plantillas/cuentas are optional (old backups may not
  //     include them); when present, each item is validated below.
  // ES: planes/presupuestos/plantillas/cuentas son opcionales (copias antiguas
  //     no los traen); cuando vienen, cada elemento se valida aquí abajo.
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
  // EN: Valid only if every collection passes its check.
  // ES: Válido solo si todas las colecciones pasan su comprobación.
  return rec && pun && deu && pla && pre && pll && cue;
}
