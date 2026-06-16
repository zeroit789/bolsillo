<script setup lang="ts">
/* Modal para añadir un movimiento nuevo (ingreso o gasto).
   Emite 'guardar' con los datos y 'cerrar' para ocultarse. */
import { ref, reactive } from "vue";
import { CATEGORIAS, type Movimiento, type TipoMovimiento } from "../types";
import { mesActual } from "../utils/format";

const emit = defineEmits<{
  guardar: [mov: Omit<Movimiento, "id">];
  cerrar: [];
}>();

// Estado del formulario, con valores por defecto sensatos.
const form = reactive({
  concepto: "",
  importe: "" as string | number,
  tipo: "gasto-variable" as TipoMovimiento,
  categoria: "Comida" as (typeof CATEGORIAS)[number],
  fecha: `${mesActual()}-${String(new Date().getDate()).padStart(2, "0")}`,
});

const error = ref("");

// Valida y emite el movimiento.
function guardar() {
  const importe = Number(form.importe);
  if (!form.concepto.trim()) return (error.value = "Pon un concepto");
  if (!importe || importe <= 0) return (error.value = "El importe debe ser mayor que 0");

  emit("guardar", {
    concepto: form.concepto.trim(),
    importe,
    tipo: form.tipo,
    categoria: form.categoria,
    fecha: form.fecha,
  });
}
</script>

<template>
  <!-- Capa oscura de fondo; al hacer clic fuera se cierra -->
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
    @click.self="emit('cerrar')"
  >
    <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-6 shadow-2xl">
      <h2 class="font-display text-xl font-bold mb-4">Nuevo movimiento</h2>

      <div class="space-y-3">
        <!-- Concepto -->
        <div>
          <label class="text-muted text-sm">Concepto</label>
          <input
            v-model="form.concepto"
            type="text"
            placeholder="Ej. Supermercado"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Importe + Fecha -->
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
          <div class="flex-1">
            <label class="text-muted text-sm">Fecha</label>
            <input
              v-model="form.fecha"
              type="date"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
        </div>

        <!-- Tipo -->
        <div>
          <label class="text-muted text-sm">Tipo</label>
          <select
            v-model="form.tipo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="ingreso">Ingreso</option>
            <option value="gasto-fijo">Gasto fijo</option>
            <option value="gasto-variable">Gasto variable</option>
          </select>
        </div>

        <!-- Categoría -->
        <div>
          <label class="text-muted text-sm">Categoría</label>
          <select
            v-model="form.categoria"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option v-for="c in CATEGORIAS" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <!-- Error de validación -->
        <p v-if="error" class="text-danger text-sm">{{ error }}</p>
      </div>

      <!-- Botones -->
      <div class="flex gap-3 mt-6">
        <button
          class="flex-1 rounded-lg border border-border px-4 py-2 text-muted hover:text-ink hover:border-faint transition-colors"
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
