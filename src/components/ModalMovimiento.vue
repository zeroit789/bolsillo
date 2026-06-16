<script setup lang="ts">
/* Modal para añadir un movimiento: gasto/ingreso, fijo (recurrente) o variable
   (puntual). Emite 'guardar' con los datos ya normalizados y 'cerrar'. */
import { ref, reactive, computed } from "vue";
import { categoriasPorGrupo } from "../data/categorias";
import { useFinanzas } from "../stores/finanzas";
import type { Signo } from "../types";

const emit = defineEmits<{
  guardar: [
    mov: {
      recurrente: boolean; // true = gasto/ingreso fijo (se repite cada mes)
      signo: Signo;
      concepto: string;
      importe: number;
      categoria: string;
      fecha: string; // "YYYY-MM-DD" (solo se usa si es puntual)
    }
  ];
  cerrar: [];
}>();

// Las 4 "clases" de alta, que se traducen a recurrente + signo.
const CLASES = [
  { valor: "gasto-variable", etiqueta: "Gasto variable", recurrente: false, signo: "gasto" as Signo },
  { valor: "gasto-fijo", etiqueta: "Gasto fijo (cada mes)", recurrente: true, signo: "gasto" as Signo },
  { valor: "ingreso-puntual", etiqueta: "Ingreso puntual", recurrente: false, signo: "ingreso" as Signo },
  { valor: "ingreso-fijo", etiqueta: "Ingreso fijo (cada mes)", recurrente: true, signo: "ingreso" as Signo },
];

const grupos = categoriasPorGrupo();
const f = useFinanzas();
// Fecha por defecto: día de hoy ACOTADO al último día del mes que se está viendo
// (evita fechas inválidas tipo "2026-02-31" que dejarían el apunte huérfano).
const [aSel, mSel] = f.mesSeleccionado.split("-").map(Number);
const ultimoDia = new Date(aSel, mSel, 0).getDate();
const diaDef = Math.min(new Date().getDate(), ultimoDia);
const hoy = `${f.mesSeleccionado}-${String(diaDef).padStart(2, "0")}`;

const form = reactive({
  clase: "gasto-variable",
  concepto: "",
  importe: "" as string | number,
  categoria: "Supermercado",
  fecha: hoy,
});
const error = ref("");

const claseActual = computed(() => CLASES.find((c) => c.valor === form.clase)!);
const esRecurrente = computed(() => claseActual.value.recurrente);

function guardar() {
  // Acepta coma decimal española y redondea a 2 decimales (céntimos).
  const importe = Math.round(Number(String(form.importe).replace(",", ".")) * 100) / 100;
  if (!form.concepto.trim()) return (error.value = "Pon un concepto");
  if (!importe || importe <= 0) return (error.value = "El importe debe ser mayor que 0");
  if (!esRecurrente.value && !form.fecha) return (error.value = "Pon una fecha válida");

  emit("guardar", {
    recurrente: claseActual.value.recurrente,
    signo: claseActual.value.signo,
    concepto: form.concepto.trim(),
    importe,
    categoria: form.categoria,
    fecha: form.fecha,
  });
}
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    @click.self="emit('cerrar')"
  >
    <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-2xl">
      <h2 class="font-display text-xl font-bold mb-4">Nuevo movimiento</h2>

      <div class="space-y-3">
        <div>
          <label class="text-muted text-sm">Tipo</label>
          <select
            v-model="form.clase"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option v-for="c in CLASES" :key="c.valor" :value="c.valor">{{ c.etiqueta }}</option>
          </select>
        </div>

        <div>
          <label class="text-muted text-sm">Concepto</label>
          <input
            v-model="form.concepto"
            type="text"
            placeholder="Ej. Supermercado"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <div class="flex gap-3">
          <div class="flex-1">
            <label class="text-muted text-sm">Importe (€)</label>
            <input
              v-model="form.importe"
              type="number"
              min="0"
              step="0.01"
              placeholder="0,00"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
          <!-- La fecha solo importa en los movimientos puntuales -->
          <div v-if="!esRecurrente" class="flex-1">
            <label class="text-muted text-sm">Fecha</label>
            <input
              v-model="form.fecha"
              type="date"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        <div>
          <label class="text-muted text-sm">Categoría</label>
          <select
            v-model="form.categoria"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <optgroup v-for="g in grupos" :key="g.grupo" :label="g.grupo">
              <option v-for="c in g.items" :key="c" :value="c">{{ c }}</option>
            </optgroup>
          </select>
        </div>

        <p v-if="esRecurrente" class="text-faint text-xs">
          Los fijos se repiten automáticamente en todos los meses desde hoy.
        </p>
        <p v-if="error" class="text-danger text-sm">{{ error }}</p>
      </div>

      <div class="flex gap-3 mt-6">
        <button
          class="flex-1 rounded-lg border border-border px-4 py-2 text-muted hover:text-ink transition-colors"
          @click="emit('cerrar')"
        >
          Cancelar
        </button>
        <button
          class="flex-1 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="guardar"
        >
          Guardar
        </button>
      </div>
    </div>
  </div>
</template>
