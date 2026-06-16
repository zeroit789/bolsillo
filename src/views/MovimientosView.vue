<script setup lang="ts">
/* Vista Movimientos: lista del mes (fijos + variables + cuotas de deuda) y alta. */
import { ref, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro, fechaLegible, mesActual } from "../utils/format";
import type { LineaMes, Signo } from "../types";
import ModalMovimiento from "../components/ModalMovimiento.vue";

const f = useFinanzas();
const modal = ref(false);

// --- Buscador / filtro ---
const busqueda = ref("");
const filtroTipo = ref<"todos" | "ingreso" | "fijo" | "variable">("todos");

const lineasFiltradas = computed<LineaMes[]>(() => {
  const q = busqueda.value.trim().toLowerCase();
  return f.lineasDelMes.filter((l) => {
    const coincideTexto =
      !q || l.concepto.toLowerCase().includes(q) || l.categoria.toLowerCase().includes(q);
    const coincideTipo =
      filtroTipo.value === "todos" ||
      (filtroTipo.value === "ingreso" && l.signo === "ingreso") ||
      (filtroTipo.value === "fijo" && l.signo === "gasto" && l.fijo) ||
      (filtroTipo.value === "variable" && l.signo === "gasto" && !l.fijo);
    return coincideTexto && coincideTipo;
  });
});

// Color del punto según el signo (ingreso verde, gasto rojo).
function colorPunto(signo: Signo): string {
  return signo === "ingreso" ? "bg-ok" : "bg-danger";
}

// Alta desde el modal: recurrente -> addRecurrente, puntual -> addPuntual.
function onGuardar(mov: {
  recurrente: boolean;
  signo: Signo;
  concepto: string;
  importe: number;
  categoria: string;
  fecha: string;
}) {
  if (mov.recurrente) {
    f.addRecurrente({
      concepto: mov.concepto,
      importe: mov.importe,
      signo: mov.signo,
      categoria: mov.categoria,
      desde: mesActual(),
      hasta: null,
    });
  } else {
    f.addPuntual({
      concepto: mov.concepto,
      importe: mov.importe,
      signo: mov.signo,
      categoria: mov.categoria,
      fecha: mov.fecha,
    });
  }
  modal.value = false;
}

function eliminar(linea: LineaMes) {
  if (linea.origen === "deuda") return; // las cuotas se gestionan en Deudas
  if (confirm(`¿Eliminar "${linea.concepto}"?`)) f.eliminarLinea(linea);
}
</script>

<template>
  <div>
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-display text-2xl font-bold">Movimientos</h2>
      <button
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
        @click="modal = true"
      >
        + Añadir
      </button>
    </div>

    <div class="rounded-2xl bg-surface border border-border">
      <div class="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
        <input
          v-model="busqueda"
          type="text"
          placeholder="Buscar por concepto o categoría…"
          class="flex-1 min-w-40 rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        <select
          v-model="filtroTipo"
          class="rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="todos">Todos</option>
          <option value="ingreso">Ingresos</option>
          <option value="fijo">Gastos fijos</option>
          <option value="variable">Gastos variables</option>
        </select>
        <span class="text-faint text-sm shrink-0">{{ lineasFiltradas.length }} apuntes</span>
      </div>

      <div v-if="!lineasFiltradas.length" class="px-5 py-12 text-center text-muted">
        {{ f.lineasDelMes.length ? "Sin resultados para ese filtro." : "No hay movimientos. Pulsa + Añadir." }}
      </div>

      <ul v-else class="divide-y divide-border">
        <li
          v-for="l in lineasFiltradas"
          :key="l.origen + l.id"
          class="group flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors"
        >
          <span class="size-2.5 rounded-full shrink-0" :class="colorPunto(l.signo)" />

          <div class="min-w-0 flex-1">
            <p class="truncate">{{ l.concepto }}</p>
            <p class="text-faint text-xs mt-0.5 flex items-center gap-1.5">
              <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ l.categoria }}</span>
              <span v-if="l.fijo" class="rounded-full bg-surface-2 px-2 py-0.5">Fijo</span>
              <span v-if="l.fecha">· {{ fechaLegible(l.fecha) }}</span>
            </p>
          </div>

          <span
            class="font-medium tabular-nums shrink-0"
            :class="l.signo === 'ingreso' ? 'text-ok' : 'text-danger'"
          >
            {{ l.signo === "ingreso" ? "+" : "−" }}{{ euro(l.importe) }}
          </span>

          <button
            v-if="l.origen !== 'deuda'"
            class="opacity-0 group-hover:opacity-100 text-faint hover:text-danger transition-all shrink-0"
            title="Eliminar"
            @click="eliminar(l)"
          >
            ✕
          </button>
          <span v-else class="text-faint text-xs shrink-0" title="Se gestiona en Deudas">🔒</span>
        </li>
      </ul>
    </div>

    <ModalMovimiento v-if="modal" @guardar="onGuardar" @cerrar="modal = false" />
  </div>
</template>
