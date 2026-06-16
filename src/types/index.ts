/* ===========================================================================
   Tipos del dominio de Bolsillo (v2).
   Tres entidades:
     - Recurrente: ingreso/gasto que se repite TODOS los meses (nómina, alquiler,
       suscripción). Se da de alta una vez y aparece en cada mes desde su alta.
     - Puntual: ingreso/gasto de un mes concreto (una compra, una venta).
     - Deuda: total + cuota mensual; la cuota cuenta como gasto fijo y la deuda
       se va saldando sola mes a mes hasta llegar a cero.
   =========================================================================== */

// Un apunte suma (ingreso) o resta (gasto). El importe se guarda positivo.
export type Signo = "ingreso" | "gasto";

// Gasto/ingreso recurrente: vivo entre `desde` y `hasta` (incluidos).
export interface Recurrente {
  id: string;
  concepto: string;
  importe: number; // siempre positivo
  signo: Signo;
  categoria: string;
  desde: string; // "YYYY-MM" mes de alta
  hasta: string | null; // "YYYY-MM" mes de baja (incl.) o null = sin fin
  diaPago?: number; // día del mes (1-31) para recordatorios; opcional
  comercio?: string; // dónde se hizo (Mercadona, Amazon…); opcional
  tags?: string[]; // etiquetas transversales (#vacaciones…); opcional
  cuenta?: string; // id de la cuenta a la que pertenece; opcional
}

// Apunte puntual de un mes concreto.
export interface Puntual {
  id: string;
  concepto: string;
  importe: number;
  signo: Signo;
  categoria: string;
  fecha: string; // "YYYY-MM-DD"
  comercio?: string; // dónde se hizo (Mercadona, Amazon…); opcional
  tags?: string[]; // etiquetas transversales (#vacaciones…); opcional
  recibo?: string; // imagen del recibo en base64 (data URL); opcional
  cuenta?: string; // id de la cuenta a la que pertenece; opcional
  subdivisiones?: Subdivision[]; // gasto dividido en varias categorías; opcional
}

// Tipos de deuda admitidos.
export type TipoDeuda =
  | "tarjeta"
  | "prestamo"
  | "coche"
  | "moto"
  | "hipoteca"
  | "personal"
  | "otro";

// Catálogo de tipos de deuda con etiqueta legible e icono.
export const TIPOS_DEUDA: { valor: TipoDeuda; etiqueta: string; icono: string }[] = [
  { valor: "tarjeta", etiqueta: "Tarjeta de crédito", icono: "💳" },
  { valor: "prestamo", etiqueta: "Préstamo", icono: "🏦" },
  { valor: "coche", etiqueta: "Coche", icono: "🚗" },
  { valor: "moto", etiqueta: "Moto", icono: "🏍️" },
  { valor: "hipoteca", etiqueta: "Hipoteca", icono: "🏠" },
  { valor: "personal", etiqueta: "Préstamo personal", icono: "🤝" },
  { valor: "otro", etiqueta: "Otra deuda", icono: "📄" },
];

// Una deuda: total a pagar, cuota mensual y lo ya pagado al darla de alta.
export interface Deuda {
  id: string;
  concepto: string;
  tipo: TipoDeuda;
  total: number; // importe total a saldar
  cuotaMensual: number; // pago de cada mes
  pagadoInicial: number; // lo que ya llevabas pagado al registrarla
  inicioMes: string; // "YYYY-MM" desde cuando cuenta en la app
  diaPago?: number; // día del mes (1-31) para recordatorios; opcional
}

// Estado de una deuda calculado para un mes concreto.
export interface EstadoDeuda {
  deuda: Deuda;
  pagado: number; // total abonado hasta ese mes (incl.)
  pendiente: number; // lo que falta
  cuotaDelMes: number; // lo que cuenta como gasto fijo ese mes (0 si ya saldada)
  terminada: boolean; // pagado >= total
  mesesRestantes: number; // cuotas que faltan
  progreso: number; // 0..100
}

// Una "línea" del mes para pintar en la lista (unifica recurrente/puntual/deuda).
export interface LineaMes {
  id: string;
  origen: "recurrente" | "puntual" | "deuda";
  concepto: string;
  categoria: string;
  signo: Signo;
  importe: number;
  fijo: boolean; // true = gasto/ingreso fijo; false = puntual
  fecha?: string; // solo puntuales
  comercio?: string; // opcional
  tags?: string[]; // opcional
  recibo?: string; // imagen base64 (solo puntuales); opcional
  cuenta?: string; // id de cuenta; opcional
  subdivisiones?: Subdivision[]; // gasto dividido; opcional
}

// Una cuenta/monedero (efectivo, banco, tarjeta…) para el patrimonio.
export interface Cuenta {
  id: string;
  nombre: string;
  saldoInicial: number; // saldo de partida al crear la cuenta
}

// Una subdivisión de un gasto dividido (parte del importe en otra categoría).
export interface Subdivision {
  categoria: string;
  importe: number;
}

// Tope de gasto mensual para una categoría (presupuesto).
export interface Presupuesto {
  categoria: string;
  limite: number; // importe máximo al mes
}

// Plantilla de movimiento para alta rápida (un clic).
export interface Plantilla {
  id: string;
  concepto: string;
  importe: number;
  signo: Signo;
  categoria: string;
}

// Un plan / meta de ahorro o de compra doméstica (ej. "Pintar el salón – 110 €").
export interface Plan {
  id: string;
  nombre: string;
  objetivo: number; // importe que quieres reunir
  aportado: number; // lo que llevas reunido
}

// Estructura completa que se persiste (y se cifra) en disco.
export interface DatosBolsillo {
  recurrentes: Recurrente[];
  puntuales: Puntual[];
  deudas: Deuda[];
  planes: Plan[];
  presupuestos: Presupuesto[];
  plantillas: Plantilla[];
  cuentas: Cuenta[];
}

// Valida (de forma laxa pero suficiente) que un objeto tenga la forma de
// DatosBolsillo. Evita hidratar datos corruptos (de una copia importada o de
// un blob dañado) que dejarían los KPIs en NaN o romperían el render.
export function esDatosValidos(d: unknown): d is DatosBolsillo {
  if (!d || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  if (!Array.isArray(o.recurrentes) || !Array.isArray(o.puntuales) || !Array.isArray(o.deudas))
    return false;
  const num = (x: unknown) => typeof x === "number" && Number.isFinite(x);
  const str = (x: unknown) => typeof x === "string";
  const signo = (x: unknown) => x === "ingreso" || x === "gasto";
  // Formato de mes/fecha real (blinda los cálculos de fechas aguas abajo).
  const mesOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}$/.test(x);
  const fechaOk = (x: unknown) => typeof x === "string" && /^\d{4}-\d{2}-\d{2}/.test(x);
  const rec = o.recurrentes.every(
    (r: any) => r && str(r.id) && num(r.importe) && signo(r.signo) && str(r.categoria) && mesOk(r.desde) && (r.hasta === null || mesOk(r.hasta))
  );
  const pun = o.puntuales.every(
    (p: any) => p && str(p.id) && num(p.importe) && signo(p.signo) && str(p.categoria) && fechaOk(p.fecha)
  );
  const deu = o.deudas.every(
    (x: any) => x && str(x.id) && num(x.total) && num(x.cuotaMensual) && num(x.pagadoInicial) && mesOk(x.inicioMes)
  );
  // planes/presupuestos/plantillas son opcionales (copias antiguas no los traen).
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
  return rec && pun && deu && pla && pre && pll && cue;
}
