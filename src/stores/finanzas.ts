/* ===========================================================================
   Store de Pinia: estado central de las finanzas.
   Guarda todos los movimientos y deriva los KPIs del mes seleccionado.
   Persiste en localStorage (offline, sin servidor).
   =========================================================================== */
import { defineStore } from "pinia";
import { ref, computed, watch } from "vue";
import type { Movimiento, TipoMovimiento } from "../types";
import { mesDe } from "../types";
import { mesActual } from "../utils/format";
import { movimientosDemo } from "../data/demo";

// Clave de almacenamiento en localStorage (versionada por si cambia el formato)
const CLAVE = "bolsillo.movimientos.v1";

// Carga los movimientos guardados; si no hay nada, siembra los datos demo.
function cargarInicial(): Movimiento[] {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (crudo) return JSON.parse(crudo) as Movimiento[];
  } catch {
    /* si el JSON está corrupto, caemos a los datos demo */
  }
  return movimientosDemo();
}

// Genera un id corto y único.
function nuevoId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export const useFinanzas = defineStore("finanzas", () => {
  // --- Estado ---
  const movimientos = ref<Movimiento[]>(cargarInicial());
  const mesSeleccionado = ref<string>(mesActual()); // "YYYY-MM"

  // Persistencia automática: cada cambio en los movimientos se guarda.
  watch(
    movimientos,
    (val) => localStorage.setItem(CLAVE, JSON.stringify(val)),
    { deep: true }
  );

  // --- Getters (derivados) ---

  // Lista de meses con datos, de más reciente a más antiguo (para el selector).
  const mesesDisponibles = computed(() => {
    const set = new Set(movimientos.value.map((m) => mesDe(m.fecha)));
    set.add(mesSeleccionado.value); // el mes activo siempre aparece
    return [...set].sort().reverse();
  });

  // Movimientos del mes seleccionado, ordenados por fecha descendente.
  const movimientosDelMes = computed(() =>
    movimientos.value
      .filter((m) => mesDe(m.fecha) === mesSeleccionado.value)
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
  );

  // Suma los importes de un tipo concreto dentro del mes.
  function sumaPorTipo(tipo: TipoMovimiento): number {
    return movimientosDelMes.value
      .filter((m) => m.tipo === tipo)
      .reduce((acc, m) => acc + m.importe, 0);
  }

  const ingresos = computed(() => sumaPorTipo("ingreso"));
  const gastosFijos = computed(() => sumaPorTipo("gasto-fijo"));
  const gastosVariables = computed(() => sumaPorTipo("gasto-variable"));
  const totalGastos = computed(() => gastosFijos.value + gastosVariables.value);
  const disponible = computed(() => ingresos.value - totalGastos.value);

  // Reparto de gasto por categoría (para gráficas/insights).
  const gastoPorCategoria = computed(() => {
    const mapa = new Map<string, number>();
    for (const m of movimientosDelMes.value) {
      if (m.tipo === "ingreso") continue;
      mapa.set(m.categoria, (mapa.get(m.categoria) ?? 0) + m.importe);
    }
    return [...mapa.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total);
  });

  // --- Acciones ---

  function agregar(mov: Omit<Movimiento, "id">) {
    movimientos.value.push({ ...mov, id: nuevoId() });
  }

  function actualizar(id: string, cambios: Partial<Omit<Movimiento, "id">>) {
    const i = movimientos.value.findIndex((m) => m.id === id);
    if (i !== -1) movimientos.value[i] = { ...movimientos.value[i], ...cambios };
  }

  function eliminar(id: string) {
    movimientos.value = movimientos.value.filter((m) => m.id !== id);
  }

  function seleccionarMes(mes: string) {
    mesSeleccionado.value = mes;
  }

  return {
    // estado
    movimientos,
    mesSeleccionado,
    // getters
    mesesDisponibles,
    movimientosDelMes,
    ingresos,
    gastosFijos,
    gastosVariables,
    totalGastos,
    disponible,
    gastoPorCategoria,
    // acciones
    agregar,
    actualizar,
    eliminar,
    seleccionarMes,
  };
});
