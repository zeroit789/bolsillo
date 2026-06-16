/* ===========================================================================
   Store de Pinia: estado central de las finanzas (v2).
   Mantiene recurrentes, puntuales y deudas, y deriva los KPIs de cada mes.
   La persistencia se delega en utils/almacen (que más adelante cifra los datos).
   =========================================================================== */
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type {
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

function nuevoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

// Resumen de KPIs de un mes.
export interface ResumenMes {
  mes: string;
  ingresos: number;
  gastosFijos: number;
  gastosVariables: number;
  totalGastos: number;
  disponible: number;
}

export const useFinanzas = defineStore("finanzas", () => {
  // --- Estado ---
  const recurrentes = ref<Recurrente[]>([]);
  const puntuales = ref<Puntual[]>([]);
  const deudas = ref<Deuda[]>([]);
  const planes = ref<Plan[]>([]);
  const presupuestos = ref<Presupuesto[]>([]);
  const plantillas = ref<Plantilla[]>([]);
  const mesSeleccionado = ref<string>(mesActual());

  // Carga los datos en el store (desde almacén o demo). Lo llama el arranque.
  function hidratar(datos: DatosBolsillo) {
    recurrentes.value = datos.recurrentes ?? [];
    puntuales.value = datos.puntuales ?? [];
    deudas.value = datos.deudas ?? [];
    planes.value = datos.planes ?? [];
    presupuestos.value = datos.presupuestos ?? [];
    plantillas.value = datos.plantillas ?? [];
  }

  // Snapshot serializable de todos los datos (para guardar / exportar).
  function snapshot(): DatosBolsillo {
    return {
      recurrentes: recurrentes.value,
      puntuales: puntuales.value,
      deudas: deudas.value,
      planes: planes.value,
      presupuestos: presupuestos.value,
      plantillas: plantillas.value,
    };
  }

  // --- Helpers de cálculo ---

  // ¿Está vivo el recurrente en ese mes?
  function recurrenteVivo(r: Recurrente, mes: string): boolean {
    return r.desde <= mes && (r.hasta === null || mes <= r.hasta);
  }

  // Recurrentes activos en un mes.
  function recurrentesEn(mes: string): Recurrente[] {
    return recurrentes.value.filter((r) => recurrenteVivo(r, mes));
  }

  // Puntuales de un mes.
  function puntualesEn(mes: string): Puntual[] {
    return puntuales.value.filter((p) => p.fecha.slice(0, 7) === mes);
  }

  // Estado de todas las deudas en un mes.
  function deudasEn(mes: string): EstadoDeuda[] {
    return deudas.value.map((d) => estadoDeuda(d, mes));
  }

  // Calcula los KPIs de cualquier mes (lo usan el dashboard y el historial).
  function resumenDe(mes: string): ResumenMes {
    const recs = recurrentesEn(mes);
    const punts = puntualesEn(mes);
    const cuotasDeuda = deudasEn(mes).reduce((acc, e) => acc + e.cuotaDelMes, 0);

    const ingresos =
      recs.filter((r) => r.signo === "ingreso").reduce((a, r) => a + r.importe, 0) +
      punts.filter((p) => p.signo === "ingreso").reduce((a, p) => a + p.importe, 0);

    const gastosFijos =
      recs.filter((r) => r.signo === "gasto").reduce((a, r) => a + r.importe, 0) +
      cuotasDeuda;

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
      disponible: ingresos - totalGastos,
    };
  }

  // --- Getters del mes seleccionado ---
  const resumen = computed(() => resumenDe(mesSeleccionado.value));
  const ingresos = computed(() => resumen.value.ingresos);
  const gastosFijos = computed(() => resumen.value.gastosFijos);
  const gastosVariables = computed(() => resumen.value.gastosVariables);
  const totalGastos = computed(() => resumen.value.totalGastos);
  const disponible = computed(() => resumen.value.disponible);

  // Estado de las deudas en el mes seleccionado.
  const estadosDeuda = computed(() => deudasEn(mesSeleccionado.value));

  // Líneas a mostrar en la lista del mes (recurrentes + puntuales + cuotas deuda).
  const lineasDelMes = computed<LineaMes[]>(() => {
    const mes = mesSeleccionado.value;
    const lineas: LineaMes[] = [];

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
      });
    }
    // Ingresos primero, luego por importe descendente.
    return lineas.sort((a, b) => {
      if (a.signo !== b.signo) return a.signo === "ingreso" ? -1 : 1;
      return b.importe - a.importe;
    });
  });

  // Reparto de gasto por categoría en el mes seleccionado.
  const gastoPorCategoria = computed(() => {
    const mapa = new Map<string, number>();
    for (const l of lineasDelMes.value) {
      if (l.signo !== "gasto") continue;
      mapa.set(l.categoria, (mapa.get(l.categoria) ?? 0) + l.importe);
    }
    return [...mapa.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);
  });

  // Reparto del gasto del mes por comercio (para el ranking "dónde se va el dinero").
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

  // Meses con datos, del más reciente al más antiguo (para el selector).
  const mesesDisponibles = computed(() => {
    // Incluye el mes actual y el siguiente (para ver la próxima cuota de deudas).
    const set = new Set<string>([mesSeleccionado.value, mesActual(), sumarMeses(mesActual(), 1)]);
    for (const p of puntuales.value) set.add(p.fecha.slice(0, 7));
    for (const r of recurrentes.value) set.add(r.desde);
    for (const d of deudas.value) set.add(d.inicioMes);
    return [...set].sort().reverse();
  });

  // Historial: resumen de cada mes desde el más antiguo con datos hasta hoy.
  const historial = computed<ResumenMes[]>(() => {
    const meses = mesesDisponibles.value;
    if (!meses.length) return [];
    const max = mesActual() > meses[0] ? mesActual() : meses[0];
    const minAbs = meses[meses.length - 1];
    // Cap de 24 meses para no generar tablas enormes con datos muy antiguos.
    const tramo = Math.min(diffMeses(minAbs, max), 23);
    const lista: ResumenMes[] = [];
    for (let i = tramo; i >= 0; i--) {
      lista.push(resumenDe(sumarMeses(max, -i)));
    }
    return lista;
  });

  // --- Acciones ---
  function addRecurrente(r: Omit<Recurrente, "id">) {
    recurrentes.value.push({ ...r, id: nuevoId() });
  }
  function addPuntual(p: Omit<Puntual, "id">) {
    puntuales.value.push({ ...p, id: nuevoId() });
  }
  function addDeuda(d: Omit<Deuda, "id">) {
    deudas.value.push({ ...d, id: nuevoId() });
  }
  function actualizarRecurrente(id: string, cambios: Partial<Recurrente>) {
    const i = recurrentes.value.findIndex((r) => r.id === id);
    if (i !== -1) recurrentes.value[i] = { ...recurrentes.value[i], ...cambios };
  }
  function actualizarPuntual(id: string, cambios: Partial<Puntual>) {
    const i = puntuales.value.findIndex((p) => p.id === id);
    if (i !== -1) puntuales.value[i] = { ...puntuales.value[i], ...cambios };
  }
  function actualizarDeuda(id: string, cambios: Partial<Deuda>) {
    const i = deudas.value.findIndex((d) => d.id === id);
    if (i !== -1) deudas.value[i] = { ...deudas.value[i], ...cambios };
  }
  function eliminarRecurrente(id: string) {
    recurrentes.value = recurrentes.value.filter((r) => r.id !== id);
  }
  function eliminarPuntual(id: string) {
    puntuales.value = puntuales.value.filter((p) => p.id !== id);
  }
  function eliminarDeuda(id: string) {
    deudas.value = deudas.value.filter((d) => d.id !== id);
  }
  // --- Planes / metas ---
  function addPlan(p: Omit<Plan, "id">) {
    planes.value.push({ ...p, id: nuevoId() });
  }
  function actualizarPlan(id: string, cambios: Partial<Plan>) {
    const i = planes.value.findIndex((p) => p.id === id);
    if (i !== -1) planes.value[i] = { ...planes.value[i], ...cambios };
  }
  function eliminarPlan(id: string) {
    planes.value = planes.value.filter((p) => p.id !== id);
  }
  // Suma una cantidad a lo aportado de un plan (sin pasar de... se permite superar).
  function aportarAPlan(id: string, cantidad: number) {
    // Invariante en el store: solo cantidades válidas y positivas (evita NaN
    // que, al persistirse cifrado, invalidaría todo el blob al recargar).
    if (!Number.isFinite(cantidad) || cantidad <= 0) return;
    const i = planes.value.findIndex((p) => p.id === id);
    if (i !== -1) {
      const aportado = Math.round((planes.value[i].aportado + cantidad) * 100) / 100;
      planes.value[i] = { ...planes.value[i], aportado };
    }
  }
  // --- Presupuestos por categoría (topes mensuales) ---
  function setPresupuesto(categoria: string, limite: number) {
    const lim = Math.round((Number(limite) || 0) * 100) / 100;
    presupuestos.value = presupuestos.value.filter((p) => p.categoria !== categoria);
    if (lim > 0) presupuestos.value.push({ categoria, limite: lim });
  }
  function eliminarPresupuesto(categoria: string) {
    presupuestos.value = presupuestos.value.filter((p) => p.categoria !== categoria);
  }
  function presupuestoDe(categoria: string): number | null {
    return presupuestos.value.find((p) => p.categoria === categoria)?.limite ?? null;
  }
  // --- Plantillas de alta rápida ---
  function addPlantilla(p: Omit<Plantilla, "id">) {
    plantillas.value.push({ ...p, id: nuevoId() });
  }
  function eliminarPlantilla(id: string) {
    plantillas.value = plantillas.value.filter((p) => p.id !== id);
  }
  // Crea un movimiento puntual del mes a partir de una plantilla (alta rápida).
  function usarPlantilla(id: string) {
    const t = plantillas.value.find((p) => p.id === id);
    if (!t) return;
    const hoy = `${mesActual()}-${String(new Date().getDate()).padStart(2, "0")}`;
    addPuntual({ concepto: t.concepto, importe: t.importe, signo: t.signo, categoria: t.categoria, fecha: hoy });
  }

  // Da de baja un recurrente a partir de un mes (en vez de borrarlo del histórico).
  function darDeBajaRecurrente(id: string, mes: string) {
    const r = recurrentes.value.find((x) => x.id === id);
    if (r && mes < r.desde) return; // no permitir baja anterior al alta
    actualizarRecurrente(id, { hasta: mes });
  }
  // Elimina una línea de la lista según su origen.
  function eliminarLinea(linea: LineaMes) {
    if (linea.origen === "puntual") eliminarPuntual(linea.id);
    else if (linea.origen === "recurrente") eliminarRecurrente(linea.id);
    // las deudas se gestionan desde su propia sección
  }
  function seleccionarMes(mes: string) {
    mesSeleccionado.value = mes;
  }

  return {
    // estado
    recurrentes,
    puntuales,
    deudas,
    planes,
    presupuestos,
    plantillas,
    mesSeleccionado,
    // hidratación / persistencia
    hidratar,
    snapshot,
    // getters
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
    // acciones
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
    darDeBajaRecurrente,
    eliminarLinea,
    seleccionarMes,
  };
});
