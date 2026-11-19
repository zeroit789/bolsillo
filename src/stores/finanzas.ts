/* =============================================================================
 * finanzas.ts — Store central de finanzas (Pinia) / Central finance store (Pinia)
 * -----------------------------------------------------------------------------
 * ES: Mantiene recurrentes, puntuales y deudas, y deriva los KPIs de cada mes.
 *     La persistencia se delega en la sesión (que cifra los datos). Este store
 *     es la única fuente de verdad de las finanzas. Desde la v4 también lleva
 *     transferencias y ajustes de saldo (mueven saldos, no son ingreso ni
 *     gasto), reglas de categoría, perfiles de banco, la importación de
 *     extractos y las correcciones que alimentan las sugerencias de reglas.
 *     Cada acción nueva valida antes de guardar: un elemento mal formado haría
 *     que la validación del guardado rechazara TODOS los datos.
 * EN: Holds recurring entries, one-off entries and debts, and derives each
 *     month's KPIs. Persistence is delegated to the session (which encrypts
 *     the data). This store is the single source of truth for finances. Since
 *     v4 it also holds transfers and balance adjustments (they move balances,
 *     they are not income or expense), category rules, bank profiles, the
 *     statement import and the corrections that feed the rule suggestions.
 *     Every new action validates before saving: a malformed item would make
 *     the save validation reject ALL the data.
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
 *  12. Acciones: transferencias y ajustes / Actions: transfers & adjustments
 *  13. Acciones: reglas, correcciones y sugerencias / Actions: rules, corrections & suggestions
 *  14. Acciones: perfiles de banco e importación / Actions: bank profiles & import
 *  15. API pública del store / Public store API
 * ===========================================================================*/

// ── 1. Imports y tipos / Imports & types ─────────────────────────────────────
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import {
  CORRECCIONES_MAX,
  esFechaValida,
  esPuntualValido,
  esRecurrenteValido,
  VERSION_DATOS,
} from "../types";
import type {
  AjusteSaldo,
  Correccion,
  Cuenta,
  DatosBolsillo,
  Deuda,
  EstadoDeuda,
  LineaMes,
  Plan,
  Plantilla,
  Presupuesto,
  PerfilBanco,
  Puntual,
  Recurrente,
  ReglaCategoria,
  Transferencia,
} from "../types";
import { mesActual, diffMeses, sumarMeses } from "../utils/format";
import { estadoDeuda } from "../utils/deuda";
import { nuevoId } from "../utils/id";
import { importeDentroDeRango, redondear2 } from "../utils/importe";
import { ocurrenciasEnMes } from "../utils/recurrencia";
import { saldosPorCuenta, validarTransferencia } from "../utils/transferencias";
import {
  esReglaCategoriaValida,
  sugerirReglas,
  type SugerenciaRegla,
} from "../utils/importador/reglas";
import { esPerfilBancoValido } from "../utils/importador/perfil";
import { normalizarTexto } from "../utils/importador/texto";
import { crearPuntualesImportados, leerHuella } from "../utils/importador/importar";
import type { FilaImportada } from "../utils/importador/vistaPrevia";

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
  // ES: Colecciones de la v4: reglas de categoría, perfiles de banco para
  //     importar extractos, transferencias entre cuentas, ajustes de saldo y
  //     correcciones de categoría (alimentan las sugerencias de reglas).
  // EN: v4 collections: category rules, bank profiles to import statements,
  //     transfers between accounts, balance adjustments and category
  //     corrections (they feed the rule suggestions).
  const reglas = ref<ReglaCategoria[]>([]);
  const perfilesBanco = ref<PerfilBanco[]>([]);
  const transferencias = ref<Transferencia[]>([]);
  const ajustesSaldo = ref<AjusteSaldo[]>([]);
  const correcciones = ref<Correccion[]>([]);

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
    reglas.value = datos.reglas ?? [];
    perfilesBanco.value = datos.perfilesBanco ?? [];
    transferencias.value = datos.transferencias ?? [];
    ajustesSaldo.value = datos.ajustesSaldo ?? [];
    correcciones.value = datos.correcciones ?? [];
  }

  // ES: Snapshot serializable de todos los datos (para guardar / exportar). Lleva
  //     la versión actual del esquema para que la carga sepa si debe migrar.
  // EN: Serializable snapshot of all data (used to save / export). It carries
  //     the current schema version so loading knows whether to migrate.
  function snapshot(): DatosBolsillo {
    return {
      version: VERSION_DATOS,
      recurrentes: recurrentes.value,
      puntuales: puntuales.value,
      deudas: deudas.value,
      planes: planes.value,
      presupuestos: presupuestos.value,
      plantillas: plantillas.value,
      cuentas: cuentas.value,
      reglas: reglas.value,
      perfilesBanco: perfilesBanco.value,
      transferencias: transferencias.value,
      ajustesSaldo: ajustesSaldo.value,
      correcciones: correcciones.value,
    };
  }

  // ── 4. Helpers de cálculo / Calculation helpers ──────────────────────────────

  // ES: Recurrentes que tocan en un mes dado, con lo que suman ese mes. Usa
  //     ocurrenciasEnMes (utils/recurrencia.ts): un semanal toca 4 o 5 veces,
  //     un trimestral o anual solo en sus meses y uno con cuotas o fecha de fin
  //     deja de tocar. Un recurrente sin los campos nuevos toca una vez cada
  //     mes entre `desde` y `hasta`, como siempre.
  // EN: Recurring entries due in a given month, with what they add up to that
  //     month. Uses ocurrenciasEnMes (utils/recurrencia.ts): a weekly one falls
  //     4 or 5 times, a quarterly or yearly one only in its months and one with
  //     instalments or an end date stops. A recurring entry without the new
  //     fields falls once every month between `desde` and `hasta`, as always.
  function recurrentesEn(mes: string): { r: Recurrente; importe: number; veces: number }[] {
    const lista: { r: Recurrente; importe: number; veces: number }[] = [];
    for (const r of recurrentes.value) {
      const o = ocurrenciasEnMes(r, mes);
      if (o.veces > 0) lista.push({ r, importe: o.importe, veces: o.veces });
    }
    return lista;
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
      recs.filter((x) => x.r.signo === "ingreso").reduce((a, x) => a + x.importe, 0) +
      punts.filter((p) => p.signo === "ingreso").reduce((a, p) => a + p.importe, 0);

    // ES: Gastos fijos = gastos recurrentes + cuotas de deuda.
    // EN: Fixed expenses = recurring expenses + debt instalments.
    const gastosFijos =
      recs.filter((x) => x.r.signo === "gasto").reduce((a, x) => a + x.importe, 0) + cuotasDeuda;

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

    // ES: Los recurrentes que tocan este mes se convierten en líneas fijas
    //     (fijo: true) con el total del mes y las veces que tocan.
    // EN: Recurring entries due this month become fixed lines (fijo: true)
    //     with the month's total and how many times they fall.
    for (const { r, importe, veces } of recurrentesEn(mes)) {
      lineas.push({
        id: r.id,
        origen: "recurrente",
        concepto: r.concepto,
        categoria: r.categoria,
        signo: r.signo,
        importe,
        fijo: true,
        comercio: r.comercio,
        tags: r.tags,
        veces,
        frecuencia: r.frecuencia ?? "mensual",
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

  // ES: Si el recurrente trae fechaInicio, su mes de alta (`desde`) es el de
  //     esa fecha: así el selector de meses, la baja y el cálculo coinciden.
  // EN: If the recurring entry has fechaInicio, its start month (`desde`) is
  //     that date's month: so the month picker, cancelling and the maths agree.
  function conDesde<T extends Partial<Recurrente>>(r: T): T {
    return r.fechaInicio && esFechaValida(r.fechaInicio)
      ? { ...r, desde: r.fechaInicio.slice(0, 7) }
      : r;
  }
  // ES: Añade un recurrente (asigna id automáticamente). false (sin guardar
  //     nada) si no pasa la validación del esquema: un recurrente mal formado
  //     haría que el guardado rechazara TODOS los datos.
  // EN: Add a recurring entry (auto-assigns an id). false (saving nothing) if
  //     it fails the schema validation: a malformed recurring entry would make
  //     the save reject ALL the data.
  function addRecurrente(r: Omit<Recurrente, "id">): boolean {
    const nuevo = { ...conDesde(r), id: nuevoId() };
    if (!esRecurrenteValido(JSON.parse(JSON.stringify(nuevo)))) return false;
    recurrentes.value.push(nuevo);
    return true;
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
  //     false (sin cambios) si el resultado no pasaría la validación del esquema.
  // EN: false (no change) if the result would fail the schema validation.
  function actualizarRecurrente(id: string, cambios: Partial<Recurrente>): boolean {
    const i = recurrentes.value.findIndex((r) => r.id === id);
    if (i === -1) return false;
    const nuevo = conDesde({ ...recurrentes.value[i], ...cambios });
    if (!esRecurrenteValido(JSON.parse(JSON.stringify(nuevo)))) return false;
    recurrentes.value[i] = nuevo;
    return true;
  }
  // ES: Modifica un puntual por id, fusionando los cambios dados.
  // EN: Patch a one-off entry by id, merging the given changes.
  //     Si cambia la categoría, se anota la corrección (para sugerir reglas).
  // EN: If the category changes, the correction is recorded (to suggest rules).
  function actualizarPuntual(id: string, cambios: Partial<Puntual>) {
    const i = puntuales.value.findIndex((p) => p.id === id);
    if (i === -1) return;
    const antes = puntuales.value[i];
    if (cambios.categoria !== undefined && cambios.categoria !== antes.categoria) {
      registrarCorreccion(antes, cambios.categoria);
    }
    puntuales.value[i] = { ...antes, ...cambios };
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
  //     Devuelve true si la ha sumado y false si la rechaza (cantidad no
  //     válida, plan inexistente o acumulado por encima del tope).
  // EN: Add an amount to a plan's contributed total (overshooting the goal is
  //     allowed). Returns true if it was added and false if it is rejected
  //     (invalid amount, missing plan or total above the cap).
  function aportarAPlan(id: string, cantidad: number): boolean {
    // ES: Invariante del store: solo cantidades válidas, positivas y dentro del
    //     tope. Evita NaN que, al persistirse cifrado, invalidaría todo el blob
    //     al recargar.
    // EN: Store invariant: only valid, positive amounts within the cap. This
    //     blocks NaN, which once persisted (encrypted) would invalidate the
    //     whole blob on reload.
    if (!Number.isFinite(cantidad) || cantidad <= 0 || !importeDentroDeRango(cantidad)) {
      return false;
    }
    const i = planes.value.findIndex((p) => p.id === id);
    if (i === -1) return false;
    // ES: Redondea a 2 decimales para evitar deriva de coma flotante en el total guardado.
    // EN: Round to 2 decimals to avoid floating-point drift in the saved total.
    const aportado = redondear2(planes.value[i].aportado + cantidad);
    // ES: El acumulado tampoco puede pasar del tope: si no, el plan ya no se
    //     podría guardar desde el editor. Se comprueba aquí para que valga
    //     venga de donde venga la aportación.
    // EN: The total cannot exceed the cap either: otherwise the plan could no
    //     longer be saved from the editor. Checked here so it holds wherever
    //     the contribution comes from.
    if (!importeDentroDeRango(aportado)) return false;
    planes.value[i] = { ...planes.value[i], aportado };
    return true;
  }

  // ── 8. Acciones: presupuestos por categoría / Actions: budgets ───────────────

  // ES: Fija (o reemplaza) el tope mensual de gasto de una categoría.
  //     Un límite de 0 (o menos) elimina cualquier presupuesto existente de esa categoría.
  // EN: Set (or replace) the monthly spending limit for a category.
  //     A limit of 0 (or less) removes any existing budget for that category.
  function setPresupuesto(categoria: string, limite: number) {
    // ES: Normaliza a número no negativo redondeado a 2 decimales.
    // EN: Normalise to a non-negative number rounded to 2 decimals.
    const lim = redondear2(Number(limite));
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
    addPuntual({
      concepto: t.concepto,
      importe: t.importe,
      signo: t.signo,
      categoria: t.categoria,
      fecha: hoy,
    });
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
  // ES: Elimina una cuenta por id. false (sin borrar) si tiene transferencias
  //     o ajustes: seguirían moviendo la otra cuenta y descuadrarían el
  //     patrimonio (ver cuentaConMovimientosEntreCuentas).
  // EN: Remove an account by id. false (nothing deleted) if it has transfers
  //     or adjustments: they would keep moving the other account and
  //     unbalance net worth (see cuentaConMovimientosEntreCuentas).
  function eliminarCuenta(id: string): boolean {
    if (cuentaConMovimientosEntreCuentas(id)) return false;
    cuentas.value = cuentas.value.filter((c) => c.id !== id);
    return true;
  }
  // ES: Saldo de cada cuenta = saldo inicial + neto de sus movimientos
  //     puntuales + transferencias (salen de una, entran en otra) + ajustes de
  //     saldo. Se suma en céntimos (utils/transferencias.ts, saldosPorCuenta).
  // EN: Balance of each account = initial balance + net of its one-off
  //     movements + transfers (out of one, into another) + balance
  //     adjustments. Summed in cents (utils/transferencias.ts, saldosPorCuenta).
  const patrimonio = computed(() => {
    const saldos = saldosPorCuenta(
      cuentas.value,
      puntuales.value,
      transferencias.value,
      ajustesSaldo.value
    );
    return cuentas.value.map((c, i) => ({ cuenta: c, saldo: saldos[i].saldo }));
  });
  // ES: Patrimonio total = suma del saldo de todas las cuentas.
  // EN: Total net worth = sum of every account balance.
  const patrimonioTotal = computed(() => patrimonio.value.reduce((a, x) => a + x.saldo, 0));

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

  // ── 12. Acciones: transferencias y ajustes / Actions: transfers & adjustments ──

  // ES: Añade una transferencia entre dos cuentas. Devuelve false (y no
  //     guarda nada) si las cuentas son la misma o faltan, el importe no vale
  //     o la fecha no existe. El importe se redondea al céntimo.
  // EN: Adds a transfer between two accounts. Returns false (and saves
  //     nothing) if the accounts are the same or missing, the amount is not
  //     valid or the date does not exist. The amount is rounded to the cent.
  function addTransferencia(t: Omit<Transferencia, "id">): boolean {
    if (!validarTransferencia(t).ok || !esFechaValida(t.fecha)) return false;
    const existe = (id: string) => cuentas.value.some((c) => c.id === id);
    if (!existe(t.origen) || !existe(t.destino)) return false;
    const concepto = t.concepto?.trim();
    transferencias.value.push({
      id: nuevoId(),
      origen: t.origen,
      destino: t.destino,
      importe: redondear2(t.importe),
      fecha: t.fecha,
      ...(concepto ? { concepto } : {}),
    });
    return true;
  }
  // ES: Elimina una transferencia por id. / EN: Remove a transfer by id.
  function eliminarTransferencia(id: string) {
    transferencias.value = transferencias.value.filter((t) => t.id !== id);
  }

  // ES: Saldo de una cuenta hasta una fecha incluida (sin lo posterior), o
  //     null si la cuenta no existe. Lo usa el formulario de ajustar saldo.
  // EN: Balance of an account up to a date included (without what comes
  //     later), or null if the account does not exist. Used by the adjust
  //     balance form.
  function saldoCuentaEn(cuentaId: string, fecha: string): number | null {
    const i = cuentas.value.findIndex((c) => c.id === cuentaId);
    if (i === -1) return null;
    return saldosPorCuenta(
      cuentas.value,
      puntuales.value,
      transferencias.value,
      ajustesSaldo.value,
      fecha
    )[i].saldo;
  }

  // ES: ¿Tiene la cuenta transferencias o ajustes? Si se borrara, esos
  //     movimientos seguirían moviendo la otra cuenta y descuadrarían el
  //     patrimonio, así que la vista pide borrarlos antes.
  // EN: Does the account have transfers or adjustments? If it were deleted,
  //     those movements would keep moving the other account and unbalance net
  //     worth, so the view asks to delete them first.
  function cuentaConMovimientosEntreCuentas(cuentaId: string): boolean {
    return (
      transferencias.value.some((t) => t.origen === cuentaId || t.destino === cuentaId) ||
      ajustesSaldo.value.some((a) => a.cuenta === cuentaId)
    );
  }

  // ES: Deja una cuenta en el saldo que dice el banco en una fecha: guarda un
  //     ajuste con la diferencia frente al saldo calculado HASTA esa fecha.
  //     "igual" si ya cuadra al céntimo; "invalido" si la cuenta no existe,
  //     el saldo o la diferencia no valen o la fecha no existe.
  // EN: Leaves an account at the balance the bank shows on a date: it saves
  //     an adjustment with the difference against the balance computed UP TO
  //     that date. "igual" if it already matches to the cent; "invalido" if
  //     the account does not exist, the balance or the difference is not
  //     valid or the date does not exist.
  function ajustarSaldo(
    cuentaId: string,
    saldoObjetivo: number,
    fecha: string,
    nota?: string
  ): "ok" | "igual" | "invalido" {
    const i = cuentas.value.findIndex((c) => c.id === cuentaId);
    if (i === -1 || !esFechaValida(fecha) || !Number.isFinite(saldoObjetivo)) return "invalido";
    if (!importeDentroDeRango(Math.abs(saldoObjetivo))) return "invalido";
    const actual = saldosPorCuenta(
      cuentas.value,
      puntuales.value,
      transferencias.value,
      ajustesSaldo.value,
      fecha
    )[i].saldo;
    const importe = redondear2(redondear2(saldoObjetivo) - actual);
    if (importe === 0) return "igual";
    if (!importeDentroDeRango(Math.abs(importe))) return "invalido";
    const n = nota?.trim();
    ajustesSaldo.value.push({
      id: nuevoId(),
      cuenta: cuentaId,
      importe,
      fecha,
      ...(n ? { nota: n } : {}),
    });
    return "ok";
  }
  // ES: Elimina un ajuste de saldo por id. / EN: Remove a balance adjustment by id.
  function eliminarAjuste(id: string) {
    ajustesSaldo.value = ajustesSaldo.value.filter((a) => a.id !== id);
  }

  // ── 13. Acciones: reglas, correcciones y sugerencias / Actions: rules, corrections & suggestions ──

  // ES: Reglas en el orden en que se aplican (prioridad; a igualdad, la lista).
  // EN: Rules in the order they apply (priority; if tied, the list).
  const reglasOrdenadas = computed(() =>
    reglas.value
      .map((r, i) => ({ r, i }))
      .sort((a, b) => a.r.prioridad - b.r.prioridad || a.i - b.i)
      .map((x) => x.r)
  );

  // ES: Añade una regla al final (la de menos prioridad). false si no es válida.
  // EN: Adds a rule at the end (the lowest priority). false if it is not valid.
  function addRegla(r: Omit<ReglaCategoria, "id" | "prioridad">): boolean {
    const prioridad = reglas.value.reduce((m, x) => Math.max(m, x.prioridad + 1), 0);
    const nueva: ReglaCategoria = {
      ...r,
      contiene: r.contiene.trim(),
      id: nuevoId(),
      prioridad,
    };
    if (!esReglaCategoriaValida(nueva)) return false;
    reglas.value.push(nueva);
    return true;
  }
  // ES: Modifica una regla; false (sin cambios) si quedaría mal formada.
  // EN: Patches a rule; false (no change) if it would end up malformed.
  function actualizarRegla(id: string, cambios: Partial<ReglaCategoria>): boolean {
    const i = reglas.value.findIndex((r) => r.id === id);
    if (i === -1) return false;
    const nueva = { ...reglas.value[i], ...cambios, id };
    if (typeof nueva.contiene === "string") nueva.contiene = nueva.contiene.trim();
    if (!esReglaCategoriaValida(nueva)) return false;
    reglas.value[i] = nueva;
    return true;
  }
  // ES: Elimina una regla por id. / EN: Remove a rule by id.
  function eliminarRegla(id: string) {
    reglas.value = reglas.value.filter((r) => r.id !== id);
  }
  // ES: Sube (-1) o baja (+1) una regla en el orden y renumera las
  //     prioridades 0, 1, 2… para que el orden quede explícito.
  // EN: Moves a rule up (-1) or down (+1) in the order and renumbers the
  //     priorities 0, 1, 2… so the order is explicit.
  function moverRegla(id: string, paso: -1 | 1) {
    const orden = [...reglasOrdenadas.value];
    const i = orden.findIndex((r) => r.id === id);
    const j = i + paso;
    if (i === -1 || j < 0 || j >= orden.length) return;
    [orden[i], orden[j]] = [orden[j], orden[i]];
    reglas.value = orden.map((r, k) => ({ ...r, prioridad: k }));
  }

  // ES: Anota que el usuario cambió la categoría de un puntual. De los
  //     importados se guarda el texto del banco (el de su huella), que es lo
  //     que verán las reglas en la próxima importación. Se guardan las
  //     CORRECCIONES_MAX más recientes.
  // EN: Records that the user changed a one-off entry's category. For
  //     imported ones the bank text (their fingerprint's) is stored, which is
  //     what rules will see on the next import. The CORRECCIONES_MAX most
  //     recent ones are kept.
  function registrarCorreccion(p: Puntual, categoria: string) {
    const huella = p.importId ? leerHuella(p.importId) : null;
    const concepto = huella ? huella.concepto : normalizarTexto(p.concepto);
    if (!concepto || !categoria) return;
    const lista = [...correcciones.value, { concepto, categoria, signo: p.signo }];
    correcciones.value = lista.slice(-CORRECCIONES_MAX);
  }

  // ES: Reglas propuestas a partir de las correcciones (utils/importador/reglas.ts).
  // EN: Rules proposed from the corrections (utils/importador/reglas.ts).
  const sugerencias = computed<SugerenciaRegla[]>(() =>
    sugerirReglas(correcciones.value, reglas.value)
  );
  // ES: Crea la regla de una sugerencia. / EN: Creates a suggestion's rule.
  function crearReglaDeSugerencia(s: SugerenciaRegla): boolean {
    return addRegla({
      contiene: s.contiene,
      categoria: s.categoria,
      ...(s.signo ? { signo: s.signo } : {}),
    });
  }

  // ── 14. Acciones: perfiles de banco e importación / Actions: bank profiles & import ──

  // ES: Guarda un perfil de banco. Si trae id de uno que existe, o hay otro
  //     con el mismo nombre (sin mayúsculas ni acentos), lo sustituye; si no,
  //     lo añade. Devuelve el id guardado o null si no es válido.
  // EN: Saves a bank profile. If it carries the id of an existing one, or
  //     another has the same name (ignoring case and accents), it replaces
  //     it; otherwise it is added. Returns the saved id or null if invalid.
  function guardarPerfil(p: Omit<PerfilBanco, "id"> & { id?: string }): string | null {
    const nombre = p.nombre.trim();
    if (!nombre) return null;
    const i = perfilesBanco.value.findIndex(
      (x) => x.id === p.id || normalizarTexto(x.nombre) === normalizarTexto(nombre)
    );
    const id = i === -1 ? nuevoId() : perfilesBanco.value[i].id;
    const perfil: PerfilBanco = { ...p, nombre, id };
    if (!esPerfilBancoValido(perfil)) return null;
    if (i === -1) perfilesBanco.value.push(perfil);
    else perfilesBanco.value[i] = perfil;
    return id;
  }
  // ES: Elimina un perfil de banco por id. / EN: Remove a bank profile by id.
  function eliminarPerfil(id: string) {
    perfilesBanco.value = perfilesBanco.value.filter((p) => p.id !== id);
  }

  // ES: Importa filas ya elegidas del extracto como puntuales (origen
  //     "importado", huella, categoría por reglas o "Otros"). Una sola
  //     asignación a `puntuales`: el guardado automático observa en
  //     profundidad y un extracto puede traer miles de filas. Una cuenta que
  //     no existe no se asigna. Devuelve cuántos apuntes se crearon.
  // EN: Imports already chosen statement rows as one-off entries ("importado"
  //     origin, fingerprint, category by rules or "Otros"). A single
  //     assignment to `puntuales`: autosave watches deeply and a statement may
  //     carry thousands of rows. A missing account is not assigned. Returns
  //     how many entries were created.
  function importarFilas(filas: FilaImportada[], opciones: { cuenta?: string }): number {
    const cuenta =
      opciones.cuenta && cuentas.value.some((c) => c.id === opciones.cuenta)
        ? opciones.cuenta
        : undefined;
    // ES: Solo entran los puntuales que pasan la validación del esquema, con
    //     importe > 0 y concepto: una fila mal formada se descarta en vez de
    //     bloquear el guardado de todo.
    // EN: Only entries that pass the schema validation, with amount > 0 and a
    //     concept, go in: a malformed row is dropped instead of blocking the
    //     whole save.
    const nuevos = crearPuntualesImportados(filas, reglas.value, { cuenta })
      .map((p) => ({ ...p, id: nuevoId() }))
      .filter(
        (p) =>
          p.concepto !== "" &&
          p.importe > 0 &&
          importeDentroDeRango(p.importe) &&
          esPuntualValido(JSON.parse(JSON.stringify(p)))
      );
    if (nuevos.length) puntuales.value = [...puntuales.value, ...nuevos];
    return nuevos.length;
  }

  // ── 15. API pública del store / Public store API ─────────────────────────────
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
    reglas,
    perfilesBanco,
    transferencias,
    ajustesSaldo,
    correcciones,
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
    // ES: v4 / EN: v4
    addTransferencia,
    eliminarTransferencia,
    saldoCuentaEn,
    cuentaConMovimientosEntreCuentas,
    ajustarSaldo,
    eliminarAjuste,
    reglasOrdenadas,
    addRegla,
    actualizarRegla,
    eliminarRegla,
    moverRegla,
    sugerencias,
    crearReglaDeSugerencia,
    guardarPerfil,
    eliminarPerfil,
    importarFilas,
  };
});
