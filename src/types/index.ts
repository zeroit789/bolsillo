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
}

// Apunte puntual de un mes concreto.
export interface Puntual {
  id: string;
  concepto: string;
  importe: number;
  signo: Signo;
  categoria: string;
  fecha: string; // "YYYY-MM-DD"
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
  // planes es opcional (las copias antiguas no lo traen).
  const pla =
    o.planes === undefined ||
    (Array.isArray(o.planes) &&
      o.planes.every((x: any) => x && str(x.id) && str(x.nombre) && num(x.objetivo) && num(x.aportado)));
  return rec && pun && deu && pla;
}
