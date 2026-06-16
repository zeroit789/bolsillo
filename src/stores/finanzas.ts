/* =============================================================================
 * finanzas.ts — Central finance store (Pinia) / Store central de finanzas (Pinia)
 * -----------------------------------------------------------------------------
 * EN: Holds recurring entries, one-off entries and debts, and derives each
 *     month's KPIs. Persistence is delegated to utils/almacen (which later
 *     encrypts the data). This store is the single source of truth for finances.
 * ES: Mantiene recurrentes, puntuales y deudas, y deriva los KPIs de cada mes.
 *     La persistencia se delega en utils/almacen (que más adelante cifra los
 *     datos). Este store es la única fuente de verdad de las finanzas.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & types / Imports y tipos
 *   2. State / Estado
 *   3. Hydration & snapshot / Hidratación y snapshot
 *   4. Calculation helpers / Helpers de cálculo
 *   5. Getters (selected month) / Getters (mes seleccionado)
 *   6. Actions: entries / Acciones: movimientos (recurrentes, puntuales, deudas)
 *   7. Actions: plans & goals / Acciones: planes y metas
 *   8. Actions: budgets / Acciones: presupuestos por categoría
 *   9. Actions: templates / Acciones: plantillas de alta rápida
 *  10. Actions: accounts & net worth / Acciones: cuentas y patrimonio
 *  11. Actions: misc / Acciones: varios (baja, borrado de línea, mes)
 *  12. Public store API / API pública del store
 * ===========================================================================*/

// ── 1. Imports & types / Imports y tipos ─────────────────────────────────────
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

// EN: Generates a short collision-resistant id (timestamp + random suffix).
// ES: Genera un id corto resistente a colisiones (timestamp + sufijo aleatorio).
function nuevoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// EN: KPI summary of a single month (the shape the dashboard and history use).
// ES: Resumen de KPIs de un solo mes (la forma que usan el dashboard y el historial).
export interface ResumenMes {
  mes: string;
  ingresos: number;
  gastosFijos: number;
  gastosVariables: number;
  totalGastos: number;
  disponible: number;
}

export const useFinanzas = defineStore("finanzas", () => {
  // ── 2. State / Estado ──────────────────────────────────────────────────────
  // EN: Reactive collections that make up the whole financial model.
  // ES: Colecciones reactivas que componen todo el modelo financiero.
  const recurrentes = ref<Recurrente[]>([]);
  const puntuales = ref<Puntual[]>([]);
  const deudas = ref<Deuda[]>([]);
  const planes = ref<Plan[]>([]);
  const presupuestos = ref<Presupuesto[]>([]);
  const plantillas = ref<Plantilla[]>([]);
  const cuentas = ref<Cuenta[]>([]);

  // EN: The viewed month is remembered between sessions; it is not sensitive,
  //     so it is stored in plain text. If the user chose a specific month, it
  //     stays there after reopening the app.
  // ES: El mes visto se recuerda entre sesiones; no es dato sensible, así que
  //     va en claro. Si el usuario eligió un mes concreto, al reabrir sigue ahí.
  const MES_KEY = "bolsillo.mes-visto";
  const mesSeleccionado = ref<string>(localStorage.getItem(MES_KEY) || mesActual());

  // ── 3. Hydration & snapshot / Hidratación y snapshot ─────────────────────────

  // EN: Loads data into the store (from storage or demo). Called at startup.
  //     Each field falls back to an empty array so the store is always valid.
  // ES: Carga los datos en el store (desde almacén o demo). Lo llama el arranque.
  //     Cada campo cae a un array vacío para que el store siempre sea válido.
  function hidratar(datos: DatosBolsillo) {
    recurrentes.value = datos.recurrentes ?? [];
    puntuales.value = datos.puntuales ?? [];
    deudas.value = datos.deudas ?? [];
    planes.value = datos.planes ?? [];
    presupuestos.value = datos.presupuestos ?? [];
    plantillas.value = datos.plantillas ?? [];
    cuentas.value = datos.cuentas ?? [];
  }

  // EN: Serializable snapshot of all data (used to save / export).
  // ES: Snapshot serializable de todos los datos (para guardar / exportar).
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

  // ── 4. Calculation helpers / Helpers de cálculo ──────────────────────────────

  // EN: Is the recurring entry alive in that month? (started, not yet ended).
  // ES: ¿Está vivo el recurrente en ese mes? (ya empezó y aún no terminó).
  function recurrenteVivo(r: Recurrente, mes: string): boolean {
    return r.desde <= mes && (r.hasta === null || mes <= r.hasta);
  }

  // EN: Recurring entries active in a given month.
  // ES: Recurrentes activos en un mes dado.
  function recurrentesEn(mes: string): Recurrente[] {
    return recurrentes.value.filter((r) => recurrenteVivo(r, mes));
  }

  // EN: One-off entries dated within a given month (compares the YYYY-MM prefix).
  // ES: Puntuales fechados dentro de un mes dado (compara el prefijo YYYY-MM).
  function puntualesEn(mes: string): Puntual[] {
    return puntuales.value.filter((p) => p.fecha.slice(0, 7) === mes);
  }

  // EN: State of every debt for a given month (computed via estadoDeuda).
  // ES: Estado de todas las deudas en un mes dado (calculado con estadoDeuda).
  function deudasEn(mes: string): EstadoDeuda[] {
    return deudas.value.map((d) => estadoDeuda(d, mes));
  }

  // EN: Computes the KPIs of any month (used by dashboard and history).
  //     Income/expenses combine recurring entries, one-offs and debt instalments;
  //     debt instalments are treated as fixed expenses.
  // ES: Calcula los KPIs de cualquier mes (lo usan el dashboard y el historial).
  //     Ingresos/gastos combinan recurrentes, puntuales y cuotas de deuda;
  //     las cuotas de deuda cuentan como gasto fijo.
  function resumenDe(mes: string): ResumenMes {
    const recs = recurrentesEn(mes);
    const punts = puntualesEn(mes);
    // EN: Sum of all debt instalments due this month / ES: suma de cuotas de deuda del mes.
    const cuotasDeuda = deudasEn(mes).reduce((acc, e) => acc + e.cuotaDelMes, 0);

    // EN: Income = recurring incomes + one-off incomes.
    // ES: Ingresos = ingresos recurrentes + ingresos puntuales.
    const ingresos =
      recs.filter((r) => r.signo === "ingreso").reduce((a, r) => a + r.importe, 0) +
      punts.filter((p) => p.signo === "ingreso").reduce((a, p) => a + p.importe, 0);

    // EN: Fixed expenses = recurring expenses + debt instalments.
    // ES: Gastos fijos = gastos recurrentes + cuotas de deuda.
    const gastosFijos =
      recs.filter((r) => r.signo === "gasto").reduce((a, r) => a + r.importe, 0) +
      cuotasDeuda;

    // EN: Variable expenses = one-off expenses only.
    // ES: Gastos variables = solo gastos puntuales.
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
      // EN: Available = income minus all expenses / ES: disponible = ingresos menos gastos.
      disponible: ingresos - totalGastos,
    };
  }

  // ── 5. Getters (selected month) / Getters (mes seleccionado) ─────────────────

  // EN: Full KPI summary of the currently selected month.
  // ES: Resumen completo de KPIs del mes seleccionado actualmente.
  const resumen = computed(() => resumenDe(mesSeleccionado.value));
  // EN: Convenience getters that expose each KPI individually for the UI.
  // ES: Getters de conveniencia que exponen cada KPI por separado para la UI.
  const ingresos = computed(() => resumen.value.ingresos);
  const gastosFijos = computed(() => resumen.value.gastosFijos);
  const gastosVariables = computed(() => resumen.value.gastosVariables);
  const totalGastos = computed(() => resumen.value.totalGastos);
  const disponible = computed(() => resumen.value.disponible);

  // EN: State of all debts in the selected month.
  // ES: Estado de las deudas en el mes seleccionado.
  const estadosDeuda = computed(() => deudasEn(mesSeleccionado.value));

  // EN: Lines to show in the month's list (recurring + debt instalments + one-offs),
  //     normalised into a single LineaMes shape for the UI.
  // ES: Líneas a mostrar en la lista del mes (recurrentes + cuotas de deuda + puntuales),
  //     normalizadas en una sola forma LineaMes para la UI.
  const lineasDelMes = computed<LineaMes[]>(() => {
    const mes = mesSeleccionado.value;
    const lineas: LineaMes[] = [];

    // EN: Recurring entries become fixed lines (fijo: true).
    // ES: Los recurrentes se convierten en líneas fijas (fijo: true).
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
    // EN: Each debt with a non-zero instalment becomes a fixed expense line.
    // ES: Cada deuda con cuota distinta de cero se convierte en línea de gasto fijo.
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
    // EN: One-off entries become variable lines (fijo: false) with full metadata.
    // ES: Los puntuales se convierten en líneas variables (fijo: false) con todos sus metadatos.
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
    // EN: Sort incomes first, then by descending amount within each sign.
    // ES: Ordena ingresos primero, luego por importe descendente dentro de cada signo.
    return lineas.sort((a, b) => {
      if (a.signo !== b.signo) return a.signo === "ingreso" ? -1 : 1;
      return b.importe - a.importe;
    });
  });

  // EN: Spending breakdown by category for the selected month, sorted descending.
  //     Split expenses are distributed across their subcategories.
  // ES: Reparto de gasto por categoría en el mes seleccionado, ordenado descendente.
  //     Los gastos divididos se reparten entre sus subcategorías.
  const gastoPorCategoria = computed(() => {
    const mapa = new Map<string, number>();
    for (const l of lineasDelMes.value) {
      if (l.signo !== "gasto") continue;
      // EN: If the expense is split, allocate to each subcategory; otherwise its own category.
      // ES: Si el gasto está dividido, reparte por subcategorías; si no, su propia categoría.
      if (l.subdivisiones && l.subdivisiones.length) {
        for (const s of l.subdivisiones) {
          mapa.set(s.categoria, (mapa.get(s.categoria) ?? 0) + s.importe);
        }
      } else {
        mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + l.importe);
      }
    }
    // EN: Convert the map to a sorted array of {categoria, total}.
    // ES: Convierte el mapa en un array ordenado de {categoria, total}.
    return [...mapa.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);
  });

  // EN: Spending breakdown by merchant for the month (ranking of "where the money goes").
  //     Only expense lines that carry a merchant are counted.
  // ES: Reparto del gasto del mes por comercio (ranking de "dónde se va el dinero").
  //     Solo cuentan las líneas de gasto que llevan comercio.
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

  // EN: Months that have data, newest to oldest (feeds the month selector).
  //     Includes the current month and the next one to preview the upcoming debt instalment.
  // ES: Meses con datos, del más reciente al más antiguo (alimenta el selector de mes).
  //     Incluye el mes actual y el siguiente para ver la próxima cuota de deudas.
  const mesesDisponibles = computed(() => {
    // EN: Seed with selected month + current month + next month, then add data months.
    // ES: Siembra con mes seleccionado + mes actual + mes siguiente, luego añade meses con datos.
    const set = new Set<string>([mesSeleccionado.value, mesActual(), sumarMeses(mesActual(), 1)]);
    for (const p of puntuales.value) set.add(p.fecha.slice(0, 7));
    for (const r of recurrentes.value) set.add(r.desde);
    for (const d of deudas.value) set.add(d.inicioMes);
    return [...set].sort().reverse();
  });

  // EN: History: KPI summary of each month from the oldest with data up to today.
  // ES: Historial: resumen de KPIs de cada mes desde el más antiguo con datos hasta hoy.
  const historial = computed<ResumenMes[]>(() => {
    const meses = mesesDisponibles.value;
    if (!meses.length) return [];
    // EN: Upper bound = the later of "today" and the most recent data month.
    // ES: Tope superior = el mayor entre "hoy" y el mes con datos más reciente.
    const max = mesActual() > meses[0] ? mesActual() : meses[0];
    // EN: Absolute lower bound = the oldest month with data.
    // ES: Tope inferior absoluto = el mes con datos más antiguo.
    const minAbs = meses[meses.length - 1];
    // EN: Cap at 24 months so very old data doesn't produce huge tables.
    //     Math.max(0, ...) guards against a negative diffMeses (if, due to an
    //     inconsistency, minAbs were later than max), which would leave the loop
    //     without iterating.
    // ES: Cap de 24 meses para no generar tablas enormes con datos muy antiguos.
    //     Math.max(0, ...) blinda contra un diffMeses negativo (si por incoherencia
    //     minAbs fuese posterior a max), que dejaría el bucle sin iterar.
    const tramo = Math.max(0, Math.min(diffMeses(minAbs, max), 23));
    const lista: ResumenMes[] = [];
    // EN: Walk from oldest in range to newest, building each month's summary.
    // ES: Recorre desde el más antiguo del rango al más reciente, montando el resumen de cada mes.
    for (let i = tramo; i >= 0; i--) {
      lista.push(resumenDe(sumarMeses(max, -i)));
    }
    return lista;
  });

  // ── 6. Actions: entries / Acciones: movimientos (recurrentes, puntuales, deudas) ──

  // EN: Add a recurring entry (auto-assigns an id).
  // ES: Añade un recurrente (asigna id automáticamente).
  function addRecurrente(r: Omit<Recurrente, "id">) {
    recurrentes.value.push({ ...r, id: nuevoId() });
  }
  // EN: Add a one-off entry (auto-assigns an id).
  // ES: Añade un puntual (asigna id automáticamente).
  function addPuntual(p: Omit<Puntual, "id">) {
    puntuales.value.push({ ...p, id: nuevoId() });
  }
  // EN: Add a debt (auto-assigns an id).
  // ES: Añade una deuda (asigna id automáticamente).
  function addDeuda(d: Omit<Deuda, "id">) {
    deudas.value.push({ ...d, id: nuevoId() });
  }
  // EN: Patch a recurring entry by id, merging the given changes.
  // ES: Modifica un recurrente por id, fusionando los cambios dados.
  function actualizarRecurrente(id: string, cambios: Partial<Recurrente>) {
    const i = recurrentes.value.findIndex((r) => r.id === id);
    if (i !== -1) recurrentes.value[i] = { ...recurrentes.value[i], ...cambios };
  }
  // EN: Patch a one-off entry by id, merging the given changes.
  // ES: Modifica un puntual por id, fusionando los cambios dados.
  function actualizarPuntual(id: string, cambios: Partial<Puntual>) {
    const i = puntuales.value.findIndex((p) => p.id === id);
    if (i !== -1) puntuales.value[i] = { ...puntuales.value[i], ...cambios };
  }
  // EN: Patch a debt by id, merging the given changes.
  // ES: Modifica una deuda por id, fusionando los cambios dados.
  function actualizarDeuda(id: string, cambios: Partial<Deuda>) {
    const i = deudas.value.findIndex((d) => d.id === id);
    if (i !== -1) deudas.value[i] = { ...deudas.value[i], ...cambios };
  }
  // EN: Remove a recurring entry by id.
  // ES: Elimina un recurrente por id.
  function eliminarRecurrente(id: string) {
    recurrentes.value = recurrentes.value.filter((r) => r.id !== id);
  }
  // EN: Remove a one-off entry by id.
  // ES: Elimina un puntual por id.
  function eliminarPuntual(id: string) {
    puntuales.value = puntuales.value.filter((p) => p.id !== id);
  }
  // EN: Remove a debt by id.
  // ES: Elimina una deuda por id.
  function eliminarDeuda(id: string) {
    deudas.value = deudas.value.filter((d) => d.id !== id);
  }

  // ── 7. Actions: plans & goals / Acciones: planes y metas ─────────────────────

  // EN: Add a savings plan / goal (auto-assigns an id).
  // ES: Añade un plan / meta de ahorro (asigna id automáticamente).
  function addPlan(p: Omit<Plan, "id">) {
    planes.value.push({ ...p, id: nuevoId() });
  }
  // EN: Patch a plan by id, merging the given changes.
  // ES: Modifica un plan por id, fusionando los cambios dados.
  function actualizarPlan(id: string, cambios: Partial<Plan>) {
    const i = planes.value.findIndex((p) => p.id === id);
    if (i !== -1) planes.value[i] = { ...planes.value[i], ...cambios };
  }
  // EN: Remove a plan by id.
  // ES: Elimina un plan por id.
  function eliminarPlan(id: string) {
    planes.value = planes.value.filter((p) => p.id !== id);
  }
  // EN: Add an amount to a plan's contributed total (overshooting the goal is allowed).
  // ES: Suma una cantidad a lo aportado de un plan (se permite superar la meta).
  function aportarAPlan(id: string, cantidad: number) {
    // EN: Store invariant: only valid, positive amounts. This blocks NaN, which
    //     once persisted (encrypted) would invalidate the whole blob on reload.
    // ES: Invariante del store: solo cantidades válidas y positivas. Evita NaN
    //     que, al persistirse cifrado, invalidaría todo el blob al recargar.
    if (!Number.isFinite(cantidad) || cantidad <= 0) return;
    const i = planes.value.findIndex((p) => p.id === id);
    if (i !== -1) {
      // EN: Round to 2 decimals to avoid floating-point drift in the saved total.
      // ES: Redondea a 2 decimales para evitar deriva de coma flotante en el total guardado.
      const aportado = Math.round((planes.value[i].aportado + cantidad) * 100) / 100;
      planes.value[i] = { ...planes.value[i], aportado };
    }
  }

  // ── 8. Actions: budgets / Acciones: presupuestos por categoría ───────────────

  // EN: Set (or replace) the monthly spending limit for a category.
  //     A limit of 0 (or less) removes any existing budget for that category.
  // ES: Fija (o reemplaza) el tope mensual de gasto de una categoría.
  //     Un límite de 0 (o menos) elimina cualquier presupuesto existente de esa categoría.
  function setPresupuesto(categoria: string, limite: number) {
    // EN: Normalise to a non-negative number rounded to 2 decimals.
    // ES: Normaliza a número no negativo redondeado a 2 decimales.
    const lim = Math.round((Number(limite) || 0) * 100) / 100;
    presupuestos.value = presupuestos.value.filter((p) => p.categoria !== categoria);
    if (lim > 0) presupuestos.value.push({ categoria, limite: lim });
  }
  // EN: Remove the budget for a category.
  // ES: Elimina el presupuesto de una categoría.
  function eliminarPresupuesto(categoria: string) {
    presupuestos.value = presupuestos.value.filter((p) => p.categoria !== categoria);
  }
  // EN: Get the budget limit of a category, or null if none is set.
  // ES: Devuelve el límite presupuestario de una categoría, o null si no hay.
  function presupuestoDe(categoria: string): number | null {
    return presupuestos.value.find((p) => p.categoria === categoria)?.limite ?? null;
  }

  // ── 9. Actions: templates / Acciones: plantillas de alta rápida ──────────────

  // EN: Add a quick-add template (auto-assigns an id).
  // ES: Añade una plantilla de alta rápida (asigna id automáticamente).
  function addPlantilla(p: Omit<Plantilla, "id">) {
    plantillas.value.push({ ...p, id: nuevoId() });
  }
  // EN: Remove a template by id.
  // ES: Elimina una plantilla por id.
  function eliminarPlantilla(id: string) {
    plantillas.value = plantillas.value.filter((p) => p.id !== id);
  }
  // EN: Create a one-off entry for the current month from a template (quick add).
  // ES: Crea un movimiento puntual del mes a partir de una plantilla (alta rápida).
  function usarPlantilla(id: string) {
    const t = plantillas.value.find((p) => p.id === id);
    if (!t) return;
    // EN: Single Date instance: month and day MUST come from the SAME instant, or
    //     crossing midnight on the last day of the month would build an invalid date.
    // ES: Una sola instancia de Date: mes y día deben salir del MISMO instante, o el
    //     cruce de medianoche del último día del mes generaría una fecha inválida.
    const d = new Date();
    const mes = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const hoy = `${mes}-${String(d.getDate()).padStart(2, "0")}`;
    addPuntual({ concepto: t.concepto, importe: t.importe, signo: t.signo, categoria: t.categoria, fecha: hoy });
  }

  // ── 10. Actions: accounts & net worth / Acciones: cuentas y patrimonio ───────

  // EN: Add an account (auto-assigns an id).
  // ES: Añade una cuenta (asigna id automáticamente).
  function addCuenta(c: Omit<Cuenta, "id">) {
    cuentas.value.push({ ...c, id: nuevoId() });
  }
  // EN: Patch an account by id, merging the given changes.
  // ES: Modifica una cuenta por id, fusionando los cambios dados.
  function actualizarCuenta(id: string, cambios: Partial<Cuenta>) {
    const i = cuentas.value.findIndex((c) => c.id === id);
    if (i !== -1) cuentas.value[i] = { ...cuentas.value[i], ...cambios };
  }
  // EN: Remove an account by id.
  // ES: Elimina una cuenta por id.
  function eliminarCuenta(id: string) {
    cuentas.value = cuentas.value.filter((c) => c.id !== id);
  }
  // EN: Balance of each account = initial balance + net of its one-off movements.
  //     Income adds, expense subtracts; rounded to 2 decimals.
  // ES: Saldo de cada cuenta = saldo inicial + neto de sus movimientos puntuales.
  //     El ingreso suma, el gasto resta; redondeado a 2 decimales.
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
  // EN: Total net worth = sum of every account balance.
  // ES: Patrimonio total = suma del saldo de todas las cuentas.
  const patrimonioTotal = computed(() =>
    patrimonio.value.reduce((a, x) => a + x.saldo, 0)
  );

  // ── 11. Actions: misc / Acciones: varios (baja, borrado de línea, mes) ───────

  // EN: Discontinue a recurring entry from a given month onward (instead of deleting
  //     it from history), by setting its "hasta". Refuses an end date before its start.
  // ES: Da de baja un recurrente a partir de un mes (en vez de borrarlo del histórico),
  //     fijando su "hasta". Rechaza una baja anterior al alta.
  function darDeBajaRecurrente(id: string, mes: string) {
    const r = recurrentes.value.find((x) => x.id === id);
    if (r && mes < r.desde) return; // EN: no end before start / ES: no permitir baja anterior al alta
    actualizarRecurrente(id, { hasta: mes });
  }
  // EN: Delete a list line according to its origin (only puntual/recurrente here;
  //     debts are managed from their own section).
  // ES: Elimina una línea de la lista según su origen (aquí solo puntual/recurrente;
  //     las deudas se gestionan desde su propia sección).
  function eliminarLinea(linea: LineaMes) {
    if (linea.origen === "puntual") eliminarPuntual(linea.id);
    else if (linea.origen === "recurrente") eliminarRecurrente(linea.id);
    // EN: debts are managed from their own section / ES: las deudas se gestionan desde su propia sección
  }
  // EN: Select the viewed month and remember it across sessions (localStorage).
  // ES: Selecciona el mes visto y lo recuerda entre sesiones (localStorage).
  function seleccionarMes(mes: string) {
    mesSeleccionado.value = mes;
    localStorage.setItem(MES_KEY, mes); // EN: remember viewed month / ES: recuerda el mes visto
  }

  // ── 12. Public store API / API pública del store ─────────────────────────────
  // EN: Everything returned here is the store's public surface (state, getters, actions).
  // ES: Todo lo devuelto aquí es la superficie pública del store (estado, getters, acciones).
  return {
    // EN: state / ES: estado
    recurrentes,
    puntuales,
    deudas,
    planes,
    presupuestos,
    plantillas,
    cuentas,
    mesSeleccionado,
    // EN: hydration / persistence — ES: hidratación / persistencia
    hidratar,
    snapshot,
    // EN: getters / ES: getters
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
    // EN: actions / ES: acciones
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
