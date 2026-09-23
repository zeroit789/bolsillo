/* =============================================================================
 * finanzas.ts — Store central de finanzas (Pinia) / Central finance store (Pinia)
 * -----------------------------------------------------------------------------
 * ES: Mantiene recurrentes, puntuales y deudas, y deriva los KPIs de cada mes.
 *     La persistencia se delega en utils/almacen (que más adelante cifra los
 *     datos). Este store es la única fuente de verdad de las finanzas.
 * EN: Holds recurring entries, one-off entries and debts, and derives each
 *     month's KPIs. Persistence is delegated to utils/almacen (which later
 *     encrypts the data). This store is the single source of truth for finances.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y tipos / Imports & types
 *   2. Estado / State
 *   3. Hidratación y snapshot / Hydration & snapshot
 *   4. Helpers de cálculo / Calculation helpers
 *   5. Getters (mes seleccionado) / Getters (selected month)
 *   6. Acciones: movimientos (recurrentes, puntuales, deudas) / Actions: entries
 *   7. Acciones: planes y metas / Actions: plans & goals
 *   8. Acciones: presupuestos por categoría / Actions: budgets
 *   9. Acciones: plantillas de alta rápida / Actions: templates
 *  10. Acciones: cuentas y patrimonio / Actions: accounts & net worth
 *  11. Acciones: varios (baja, borrado de línea, mes) / Actions: misc
 *  12. API pública del store / Public store API
 * ===========================================================================*/

// ── 1. Imports y tipos / Imports & types ─────────────────────────────────────
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
  Cuenta,
  DatosBolsillo,
  Deuda,
  EstadoDeuda,
  LineaMes,
  Plan,
  Plantilla,
  Presupuesto,
  Puntual,
  Recurrente,
} from "../types";
import { mesActual, diffMeses, sumarMeses } from "../utils/format";
import { estadoDeuda } from "../utils/deuda";

// ES: Genera un id corto resistente a colisiones (timestamp + sufijo aleatorio).
// EN: Generates a short collision-resistant id (timestamp + random suffix).
function nuevoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// ES: Resumen de KPIs de un solo mes (la forma que usan el dashboard y el historial).
// EN: KPI summary of a single month (the shape the dashboard and history use).
export interface ResumenMes {
  mes: string;
  ingresos: number;
  gastosFijos: number;
  gastosVariables: number;
  totalGastos: number;
  disponible: number;
}

export const useFinanzas = defineStore("finanzas", () => {
  // ── 2. Estado / State ──────────────────────────────────────────────────────
  // ES: Colecciones reactivas que componen todo el modelo financiero.
  // EN: Reactive collections that make up the whole financial model.
  const recurrentes = ref<Recurrente[]>([]);
  const puntuales = ref<Puntual[]>([]);
  const deudas = ref<Deuda[]>([]);
  const planes = ref<Plan[]>([]);
  const presupuestos = ref<Presupuesto[]>([]);
  const plantillas = ref<Plantilla[]>([]);
  const cuentas = ref<Cuenta[]>([]);

  // ES: El mes visto se recuerda entre sesiones; no es dato sensible, así que
  //     va en claro. Si el usuario eligió un mes concreto, al reabrir sigue ahí.
  // EN: The viewed month is remembered between sessions; it is not sensitive,
  //     so it is stored in plain text. If the user chose a specific month, it
  //     stays there after reopening the app.
  const MES_KEY = "bolsillo.mes-visto";
  // ES: Lee el mes recordado pero valida el formato YYYY-MM; cae al mes actual si
  //     falta o está malformado (evita NaN en los cálculos de fecha aguas abajo).
  // EN: Read the remembered month but validate the YYYY-MM format; fall back to the
  //     current month if missing/malformed (avoids NaN in date math downstream).
  const mesGuardado = localStorage.getItem(MES_KEY);
  const mesSeleccionado = ref<string>(
    mesGuardado && /^\d{4}-\d{2}$/.test(mesGuardado) ? mesGuardado : mesActual()
  );

  // ── 3. Hidratación y snapshot / Hydration & snapshot ─────────────────────────

  // ES: Carga los datos en el store (desde almacén o demo). Lo llama el arranque.
  //     Cada campo cae a un array vacío para que el store siempre sea válido.
  // EN: Loads data into the store (from storage or demo). Called at startup.
  //     Each field falls back to an empty array so the store is always valid.
  function hidratar(datos: DatosBolsillo) {
    recurrentes.value = datos.recurrentes ?? [];
    puntuales.value = datos.puntuales ?? [];
    deudas.value = datos.deudas ?? [];
    planes.value = datos.planes ?? [];
    presupuestos.value = datos.presupuestos ?? [];
    plantillas.value = datos.plantillas ?? [];
    cuentas.value = datos.cuentas ?? [];
  }

  // ES: Snapshot serializable de todos los datos (para guardar / exportar).
  // EN: Serializable snapshot of all data (used to save / export).
  function snapshot(): DatosBolsillo {
    return {
      recurrentes: recurrentes.value,
      puntuales: puntuales.value,
      deudas: deudas.value,
      planes: planes.value,
      presupuestos: presupuestos.value,
      plantillas: plantillas.value,
      cuentas: cuentas.value,
    };
  }

  // ── 4. Helpers de cálculo / Calculation helpers ──────────────────────────────

  // ES: ¿Está vivo el recurrente en ese mes? (ya empezó y aún no terminó).
  // EN: Is the recurring entry alive in that month? (started, not yet ended).
  function recurrenteVivo(r: Recurrente, mes: string): boolean {
    return r.desde <= mes && (r.hasta === null || mes <= r.hasta);
  }

  // ES: Recurrentes activos en un mes dado.
  // EN: Recurring entries active in a given month.
  function recurrentesEn(mes: string): Recurrente[] {
    return recurrentes.value.filter((r) => recurrenteVivo(r, mes));
  }

  // ES: Puntuales fechados dentro de un mes dado (compara el prefijo YYYY-MM).
  // EN: One-off entries dated within a given month (compares the YYYY-MM prefix).
  function puntualesEn(mes: string): Puntual[] {
    return puntuales.value.filter((p) => p.fecha.slice(0, 7) === mes);
  }

  // ES: Estado de todas las deudas en un mes dado (calculado con estadoDeuda).
  // EN: State of every debt for a given month (computed via estadoDeuda).
  function deudasEn(mes: string): EstadoDeuda[] {
    return deudas.value.map((d) => estadoDeuda(d, mes));
  }

  // ES: Calcula los KPIs de cualquier mes (lo usan el dashboard y el historial).
  //     Ingresos/gastos combinan recurrentes, puntuales y cuotas de deuda;
  //     las cuotas de deuda cuentan como gasto fijo.
  // EN: Computes the KPIs of any month (used by dashboard and history).
  //     Income/expenses combine recurring entries, one-offs and debt instalments;
  //     debt instalments are treated as fixed expenses.
  function resumenDe(mes: string): ResumenMes {
    const recs = recurrentesEn(mes);
    const punts = puntualesEn(mes);
    // ES: suma de cuotas de deuda del mes. / EN: Sum of all debt instalments due this month
    const cuotasDeuda = deudasEn(mes).reduce((acc, e) => acc + e.cuotaDelMes, 0);

    // ES: Ingresos = ingresos recurrentes + ingresos puntuales.
    // EN: Income = recurring incomes + one-off incomes.
    const ingresos =
      recs.filter((r) => r.signo === "ingreso").reduce((a, r) => a + r.importe, 0) +
      punts.filter((p) => p.signo === "ingreso").reduce((a, p) => a + p.importe, 0);

    // ES: Gastos fijos = gastos recurrentes + cuotas de deuda.
    // EN: Fixed expenses = recurring expenses + debt instalments.
    const gastosFijos =
      recs.filter((r) => r.signo === "gasto").reduce((a, r) => a + r.importe, 0) +
      cuotasDeuda;

    // ES: Gastos variables = solo gastos puntuales.
    // EN: Variable expenses = one-off expenses only.
    const gastosVariables = punts
      .filter((p) => p.signo === "gasto")
      .reduce((a, p) => a + p.importe, 0);

    const totalGastos = gastosFijos + gastosVariables;
    return {
      mes,
      ingresos,
      gastosFijos,
      gastosVariables,
      totalGastos,
      // ES: disponible = ingresos menos gastos. / EN: Available = income minus all expenses
      disponible: ingresos - totalGastos,
    };
  }

  // ── 5. Getters (mes seleccionado) / Getters (selected month) ─────────────────

  // ES: Resumen completo de KPIs del mes seleccionado actualmente.
  // EN: Full KPI summary of the currently selected month.
  const resumen = computed(() => resumenDe(mesSeleccionado.value));
  // ES: Getters de conveniencia que exponen cada KPI por separado para la UI.
  // EN: Convenience getters that expose each KPI individually for the UI.
  const ingresos = computed(() => resumen.value.ingresos);
  const gastosFijos = computed(() => resumen.value.gastosFijos);
  const gastosVariables = computed(() => resumen.value.gastosVariables);
  const totalGastos = computed(() => resumen.value.totalGastos);
  const disponible = computed(() => resumen.value.disponible);

  // ES: Estado de las deudas en el mes seleccionado.
  // EN: State of all debts in the selected month.
  const estadosDeuda = computed(() => deudasEn(mesSeleccionado.value));

  // ES: Líneas a mostrar en la lista del mes (recurrentes + cuotas de deuda + puntuales),
  //     normalizadas en una sola forma LineaMes para la UI.
  // EN: Lines to show in the month's list (recurring + debt instalments + one-offs),
  //     normalised into a single LineaMes shape for the UI.
  const lineasDelMes = computed<LineaMes[]>(() => {
    const mes = mesSeleccionado.value;
    const lineas: LineaMes[] = [];

    // ES: Los recurrentes se convierten en líneas fijas (fijo: true).
    // EN: Recurring entries become fixed lines (fijo: true).
    for (const r of recurrentesEn(mes)) {
      lineas.push({
        id: r.id,
        origen: "recurrente",
        concepto: r.concepto,
        categoria: r.categoria,
        signo: r.signo,
        importe: r.importe,
        fijo: true,
        comercio: r.comercio,
        tags: r.tags,
      });
    }
    // ES: Cada deuda con cuota distinta de cero se convierte en línea de gasto fijo.
    // EN: Each debt with a non-zero instalment becomes a fixed expense line.
    for (const e of deudasEn(mes)) {
      if (e.cuotaDelMes > 0) {
        lineas.push({
          id: e.deuda.id,
          origen: "deuda",
          concepto: `Cuota · ${e.deuda.concepto}`,
          categoria: "Deudas",
          signo: "gasto",
          importe: e.cuotaDelMes,
          fijo: true,
        });
      }
    }
    // ES: Los puntuales se convierten en líneas variables (fijo: false) con todos sus metadatos.
    // EN: One-off entries become variable lines (fijo: false) with full metadata.
    for (const p of puntualesEn(mes)) {
      lineas.push({
        id: p.id,
        origen: "puntual",
        concepto: p.concepto,
        categoria: p.categoria,
        signo: p.signo,
        importe: p.importe,
        fijo: false,
        fecha: p.fecha,
        comercio: p.comercio,
        tags: p.tags,
        recibo: p.recibo,
        cuenta: p.cuenta,
        subdivisiones: p.subdivisiones,
      });
    }
    // ES: Ordena ingresos primero, luego por importe descendente dentro de cada signo.
    // EN: Sort incomes first, then by descending amount within each sign.
    return lineas.sort((a, b) => {
      if (a.signo !== b.signo) return a.signo === "ingreso" ? -1 : 1;
      return b.importe - a.importe;
    });
  });

  // ES: Reparto de gasto por categoría en el mes seleccionado, ordenado descendente.
  //     Los gastos divididos se reparten entre sus subcategorías.
  // EN: Spending breakdown by category for the selected month, sorted descending.
  //     Split expenses are distributed across their subcategories.
  const gastoPorCategoria = computed(() => {
    const mapa = new Map<string, number>();
    for (const l of lineasDelMes.value) {
      if (l.signo !== "gasto") continue;
      // ES: Si el gasto está dividido, reparte por subcategorías; si no, su propia categoría.
      // EN: If the expense is split, allocate to each subcategory; otherwise its own category.
      if (l.subdivisiones && l.subdivisiones.length) {
        for (const s of l.subdivisiones) {
          mapa.set(s.categoria, (mapa.get(s.categoria) ?? 0) + s.importe);
        }
      } else {
        mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + l.importe);
      }
    }
    // ES: Convierte el mapa en un array ordenado de {categoria, total}.
    // EN: Convert the map to a sorted array of {categoria, total}.
    return [...mapa.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);
  });

  // ES: Reparto del gasto del mes por comercio (ranking de "dónde se va el dinero").
  //     Solo cuentan las líneas de gasto que llevan comercio.
  // EN: Spending breakdown by merchant for the month (ranking of "where the money goes").
  //     Only expense lines that carry a merchant are counted.
  const gastoPorComercio = computed(() => {
    const mapa = new Map<string, number>();
    for (const l of lineasDelMes.value) {
      if (l.signo !== "gasto" || !l.comercio) continue;
      mapa.set(l.comercio, (mapa.get(l.comercio) ?? 0) + l.importe);
    }
    return [...mapa.entries()]
      .map(([comercio, total]) => ({ comercio, total }))
      .sort((a, b) => b.total - a.total);
  });

  // ES: Meses con datos, del más reciente al más antiguo (alimenta el selector de mes).
  //     Incluye el mes actual y el siguiente para ver la próxima cuota de deudas.
  // EN: Months that have data, newest to oldest (feeds the month selector).
  //     Includes the current month and the next one to preview the upcoming debt instalment.
  const mesesDisponibles = computed(() => {
    // ES: Siembra con mes seleccionado + mes actual + mes siguiente, luego añade meses con datos.
    // EN: Seed with selected month + current month + next month, then add data months.
    const set = new Set<string>([mesSeleccionado.value, mesActual(), sumarMeses(mesActual(), 1)]);
    for (const p of puntuales.value) set.add(p.fecha.slice(0, 7));
    for (const r of recurrentes.value) set.add(r.desde);
    for (const d of deudas.value) set.add(d.inicioMes);
    return [...set].sort().reverse();
  });

  // ES: Historial: resumen de KPIs de cada mes desde el más antiguo con datos hasta hoy.
  // EN: History: KPI summary of each month from the oldest with data up to today.
  const historial = computed<ResumenMes[]>(() => {
    const meses = mesesDisponibles.value;
    if (!meses.length) return [];
    // ES: Tope superior = el mayor entre "hoy" y el mes con datos más reciente.
    // EN: Upper bound = the later of "today" and the most recent data month.
    const max = mesActual() > meses[0] ? mesActual() : meses[0];
    // ES: Tope inferior absoluto = el mes con datos más antiguo.
    // EN: Absolute lower bound = the oldest month with data.
    const minAbs = meses[meses.length - 1];
    // ES: Cap de 24 meses para no generar tablas enormes con datos muy antiguos.
    //     Math.max(0, ...) blinda contra un diffMeses negativo (si por incoherencia
    //     minAbs fuese posterior a max), que dejaría el bucle sin iterar.
    // EN: Cap at 24 months so very old data doesn't produce huge tables.
    //     Math.max(0, ...) guards against a negative diffMeses (if, due to an
    //     inconsistency, minAbs were later than max), which would leave the loop
    //     without iterating.
    const tramo = Math.max(0, Math.min(diffMeses(minAbs, max), 23));
    const lista: ResumenMes[] = [];
    // ES: Recorre desde el más antiguo del rango al más reciente, montando el resumen de cada mes.
    // EN: Walk from oldest in range to newest, building each month's summary.
    for (let i = tramo; i >= 0; i--) {
      lista.push(resumenDe(sumarMeses(max, -i)));
    }
    return lista;
  });

  // ── 6. Acciones: movimientos (recurrentes, puntuales, deudas) / Actions: entries ──

  // ES: Añade un recurrente (asigna id automáticamente).
  // EN: Add a recurring entry (auto-assigns an id).
  function addRecurrente(r: Omit<Recurrente, "id">) {
    recurrentes.value.push({ ...r, id: nuevoId() });
  }
  // ES: Añade un puntual (asigna id automáticamente).
  // EN: Add a one-off entry (auto-assigns an id).
  function addPuntual(p: Omit<Puntual, "id">) {
    puntuales.value.push({ ...p, id: nuevoId() });
  }
  // ES: Añade una deuda (asigna id automáticamente).
  // EN: Add a debt (auto-assigns an id).
  function addDeuda(d: Omit<Deuda, "id">) {
    deudas.value.push({ ...d, id: nuevoId() });
  }
  // ES: Modifica un recurrente por id, fusionando los cambios dados.
  // EN: Patch a recurring entry by id, merging the given changes.
  function actualizarRecurrente(id: string, cambios: Partial<Recurrente>) {
    const i = recurrentes.value.findIndex((r) => r.id === id);
    if (i !== -1) recurrentes.value[i] = { ...recurrentes.value[i], ...cambios };
  }
  // ES: Modifica un puntual por id, fusionando los cambios dados.
  // EN: Patch a one-off entry by id, merging the given changes.
  function actualizarPuntual(id: string, cambios: Partial<Puntual>) {
    const i = puntuales.value.findIndex((p) => p.id === id);
    if (i !== -1) puntuales.value[i] = { ...puntuales.value[i], ...cambios };
  }
  // ES: Modifica una deuda por id, fusionando los cambios dados.
  // EN: Patch a debt by id, merging the given changes.
  function actualizarDeuda(id: string, cambios: Partial<Deuda>) {
    const i = deudas.value.findIndex((d) => d.id === id);
    if (i !== -1) deudas.value[i] = { ...deudas.value[i], ...cambios };
  }
  // ES: Elimina un recurrente por id.
  // EN: Remove a recurring entry by id.
  function eliminarRecurrente(id: string) {
    recurrentes.value = recurrentes.value.filter((r) => r.id !== id);
  }
  // ES: Elimina un puntual por id.
  // EN: Remove a one-off entry by id.
  function eliminarPuntual(id: string) {
    puntuales.value = puntuales.value.filter((p) => p.id !== id);
  }
  // ES: Elimina una deuda por id.
  // EN: Remove a debt by id.
  function eliminarDeuda(id: string) {
    deudas.value = deudas.value.filter((d) => d.id !== id);
  }

  // ── 7. Acciones: planes y metas / Actions: plans & goals ─────────────────────

  // ES: Añade un plan / meta de ahorro (asigna id automáticamente).
  // EN: Add a savings plan / goal (auto-assigns an id).
  function addPlan(p: Omit<Plan, "id">) {
    planes.value.push({ ...p, id: nuevoId() });
  }
  // ES: Modifica un plan por id, fusionando los cambios dados.
  // EN: Patch a plan by id, merging the given changes.
  function actualizarPlan(id: string, cambios: Partial<Plan>) {
    const i = planes.value.findIndex((p) => p.id === id);
    if (i !== -1) planes.value[i] = { ...planes.value[i], ...cambios };
  }
  // ES: Elimina un plan por id.
  // EN: Remove a plan by id.
  function eliminarPlan(id: string) {
    planes.value = planes.value.filter((p) => p.id !== id);
  }
  // ES: Suma una cantidad a lo aportado de un plan (se permite superar la meta).
  // EN: Add an amount to a plan's contributed total (overshooting the goal is allowed).
  function aportarAPlan(id: string, cantidad: number) {
    // ES: Invariante del store: solo cantidades válidas y positivas. Evita NaN
    //     que, al persistirse cifrado, invalidaría todo el blob al recargar.
    // EN: Store invariant: only valid, positive amounts. This blocks NaN, which
    //     once persisted (encrypted) would invalidate the whole blob on reload.
    if (!Number.isFinite(cantidad) || cantidad <= 0) return;
    const i = planes.value.findIndex((p) => p.id === id);
    if (i !== -1) {
      // ES: Redondea a 2 decimales para evitar deriva de coma flotante en el total guardado.
      // EN: Round to 2 decimals to avoid floating-point drift in the saved total.
      const aportado = Math.round((planes.value[i].aportado + cantidad) * 100) / 100;
      planes.value[i] = { ...planes.value[i], aportado };
    }
  }

  // ── 8. Acciones: presupuestos por categoría / Actions: budgets ───────────────

  // ES: Fija (o reemplaza) el tope mensual de gasto de una categoría.
  //     Un límite de 0 (o menos) elimina cualquier presupuesto existente de esa categoría.
  // EN: Set (or replace) the monthly spending limit for a category.
  //     A limit of 0 (or less) removes any existing budget for that category.
  function setPresupuesto(categoria: string, limite: number) {
    // ES: Normaliza a número no negativo redondeado a 2 decimales.
    // EN: Normalise to a non-negative number rounded to 2 decimals.
    const lim = Math.round((Number(limite) || 0) * 100) / 100;
    presupuestos.value = presupuestos.value.filter((p) => p.categoria !== categoria);
    if (lim > 0) presupuestos.value.push({ categoria, limite: lim });
  }
  // ES: Elimina el presupuesto de una categoría.
  // EN: Remove the budget for a category.
  function eliminarPresupuesto(categoria: string) {
    presupuestos.value = presupuestos.value.filter((p) => p.categoria !== categoria);
  }
  // ES: Devuelve el límite presupuestario de una categoría, o null si no hay.
  // EN: Get the budget limit of a category, or null if none is set.
  function presupuestoDe(categoria: string): number | null {
    return presupuestos.value.find((p) => p.categoria === categoria)?.limite ?? null;
  }

  // ── 9. Acciones: plantillas de alta rápida / Actions: templates ──────────────

  // ES: Añade una plantilla de alta rápida (asigna id automáticamente).
  // EN: Add a quick-add template (auto-assigns an id).
  function addPlantilla(p: Omit<Plantilla, "id">) {
    plantillas.value.push({ ...p, id: nuevoId() });
  }
  // ES: Elimina una plantilla por id.
  // EN: Remove a template by id.
  function eliminarPlantilla(id: string) {
    plantillas.value = plantillas.value.filter((p) => p.id !== id);
  }
  // ES: Crea un movimiento puntual del mes a partir de una plantilla (alta rápida).
  // EN: Create a one-off entry for the current month from a template (quick add).
  function usarPlantilla(id: string) {
    const t = plantillas.value.find((p) => p.id === id);
    if (!t) return;
    // ES: Una sola instancia de Date: mes y día deben salir del MISMO instante, o el
    //     cruce de medianoche del último día del mes generaría una fecha inválida.
    // EN: Single Date instance: month and day MUST come from the SAME instant, or
    //     crossing midnight on the last day of the month would build an invalid date.
    const d = new Date();
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const hoy = `${mes}-${String(d.getDate()).padStart(2, "0")}`;
    addPuntual({ concepto: t.concepto, importe: t.importe, signo: t.signo, categoria: t.categoria, fecha: hoy });
  }

  // ── 10. Acciones: cuentas y patrimonio / Actions: accounts & net worth ───────

  // ES: Añade una cuenta (asigna id automáticamente).
  // EN: Add an account (auto-assigns an id).
  function addCuenta(c: Omit<Cuenta, "id">) {
    cuentas.value.push({ ...c, id: nuevoId() });
  }
  // ES: Modifica una cuenta por id, fusionando los cambios dados.
  // EN: Patch an account by id, merging the given changes.
  function actualizarCuenta(id: string, cambios: Partial<Cuenta>) {
    const i = cuentas.value.findIndex((c) => c.id === id);
    if (i !== -1) cuentas.value[i] = { ...cuentas.value[i], ...cambios };
  }
  // ES: Elimina una cuenta por id.
  // EN: Remove an account by id.
  function eliminarCuenta(id: string) {
    cuentas.value = cuentas.value.filter((c) => c.id !== id);
  }
  // ES: Saldo de cada cuenta = saldo inicial + neto de sus movimientos puntuales.
  //     El ingreso suma, el gasto resta; redondeado a 2 decimales.
  // EN: Balance of each account = initial balance + net of its one-off movements.
  //     Income adds, expense subtracts; rounded to 2 decimals.
  const patrimonio = computed(() =>
    cuentas.value.map((c) => {
      let saldo = c.saldoInicial;
      for (const p of puntuales.value) {
        if (p.cuenta !== c.id) continue;
        saldo += p.signo === "ingreso" ? p.importe : -p.importe;
      }
      return { cuenta: c, saldo: Math.round(saldo * 100) / 100 };
    })
  );
  // ES: Patrimonio total = suma del saldo de todas las cuentas.
  // EN: Total net worth = sum of every account balance.
  const patrimonioTotal = computed(() =>
    patrimonio.value.reduce((a, x) => a + x.saldo, 0)
  );

  // ── 11. Acciones: varios (baja, borrado de línea, mes) / Actions: misc ───────

  // ES: Da de baja un recurrente a partir de un mes (en vez de borrarlo del histórico),
  //     fijando su "hasta". Rechaza una baja anterior al alta.
  // EN: Discontinue a recurring entry from a given month onward (instead of deleting
  //     it from history), by setting its "hasta". Refuses an end date before its start.
  function darDeBajaRecurrente(id: string, mes: string) {
    const r = recurrentes.value.find((x) => x.id === id);
    if (r && mes < r.desde) return; // ES: no permitir baja anterior al alta / EN: no end before start
    actualizarRecurrente(id, { hasta: mes });
  }
  // ES: Elimina una línea de la lista según su origen (aquí solo puntual/recurrente;
  //     las deudas se gestionan desde su propia sección).
  // EN: Delete a list line according to its origin (only puntual/recurrente here;
  //     debts are managed from their own section).
  function eliminarLinea(linea: LineaMes) {
    if (linea.origen === "puntual") eliminarPuntual(linea.id);
    else if (linea.origen === "recurrente") eliminarRecurrente(linea.id);
    // ES: las deudas se gestionan desde su propia sección / EN: debts are managed from their own section
  }
  // ES: Selecciona el mes visto y lo recuerda entre sesiones (localStorage).
  // EN: Select the viewed month and remember it across sessions (localStorage).
  function seleccionarMes(mes: string) {
    mesSeleccionado.value = mes;
    localStorage.setItem(MES_KEY, mes); // ES: recuerda el mes visto / EN: remember viewed month
  }

  // ── 12. API pública del store / Public store API ─────────────────────────────
  // ES: Todo lo devuelto aquí es la superficie pública del store (estado, getters, acciones).
  // EN: Everything returned here is the store's public surface (state, getters, actions).
  return {
    // ES: estado / EN: state
    recurrentes,
    puntuales,
    deudas,
    planes,
    presupuestos,
    plantillas,
    cuentas,
    mesSeleccionado,
    // ES: hidratación / persistencia — EN: hydration / persistence
    hidratar,
    snapshot,
    // ES: getters / EN: getters
    resumen,
    ingresos,
    gastosFijos,
    gastosVariables,
    totalGastos,
    disponible,
    estadosDeuda,
    lineasDelMes,
    gastoPorCategoria,
    gastoPorComercio,
    mesesDisponibles,
    historial,
    resumenDe,
    // ES: acciones / EN: actions
    addRecurrente,
    addPuntual,
    addDeuda,
    actualizarRecurrente,
    actualizarPuntual,
    actualizarDeuda,
    eliminarRecurrente,
    eliminarPuntual,
    eliminarDeuda,
    addPlan,
    actualizarPlan,
    eliminarPlan,
    aportarAPlan,
    setPresupuesto,
    eliminarPresupuesto,
    presupuestoDe,
    addPlantilla,
    eliminarPlantilla,
    usarPlantilla,
    addCuenta,
    actualizarCuenta,
    eliminarCuenta,
    patrimonio,
    patrimonioTotal,
    darDeBajaRecurrente,
    eliminarLinea,
    seleccionarMes,
  };
});
