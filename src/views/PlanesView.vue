<script setup lang="ts">
/* ===========================================================================
   Vista de Planes.
   Metas de ahorro / planificar una compra doméstica (ej. "Pintar el salón 110€").
   Cada plan tiene un objetivo (€) y un importe ya aportado. La vista muestra el
   progreso (aportado/objetivo), lo que falta, permite aportar dinero, y dar de
   alta / editar / eliminar planes mediante un modal inline.

   Convenciones tomadas del resto de vistas (DeudasView):
     - Store central useFinanzas ya inicializado en la app.
     - Modal inline con v-if para alta/edición.
     - Validación con mensaje de error e importes redondeados a céntimos.
   =========================================================================== */
import { ref, reactive, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import type { Plan } from "../types";
import { euro } from "../utils/format";

// Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// --- Estado del modal de alta/edición ---
// Si está abierto el modal.
const modalAbierto = ref(false);
// Id del plan en edición (null = estamos creando uno nuevo).
const editandoId = ref<string | null>(null);

// Tipo del formulario: los campos editables de un Plan (sin el id).
type FormPlan = Omit<Plan, "id">;

// Datos del formulario (reactivos). Se rellenan al abrir el modal.
const form = reactive<FormPlan>({
  nombre: "",
  objetivo: 0,
  aportado: 0,
});

// Mensaje de error de validación (vacío = sin error).
const error = ref("");

// Título del modal según estemos creando o editando.
const tituloModal = computed(() =>
  editandoId.value ? "Editar plan" : "Nuevo plan"
);

// --- Helpers de cálculo por plan ---

// Redondea un número a 2 decimales (céntimos). Acepta coma o punto decimal.
function r2(valor: number | string): number {
  // Si viene como texto con coma decimal ("12,50") se normaliza a punto.
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  return Math.round((Number(n) || 0) * 100) / 100;
}

// Porcentaje de progreso de un plan, recortado (clamp) al rango 0..100.
function progreso(plan: Plan): number {
  // Si el objetivo es 0 o negativo no se puede calcular: se considera 0%.
  if (plan.objetivo <= 0) return 0;
  const pct = (plan.aportado / plan.objetivo) * 100;
  // clamp 0..100 para que la barra nunca se desborde ni quede negativa.
  return Math.min(100, Math.max(0, pct));
}

// Lo que falta para llegar al objetivo (nunca negativo).
function restante(plan: Plan): number {
  return Math.max(0, r2(plan.objetivo - plan.aportado));
}

// true si el plan ya está conseguido (aportado >= objetivo).
function conseguido(plan: Plan): boolean {
  // Requiere objetivo válido (>0) para no marcar "conseguido" un plan a 0.
  return plan.objetivo > 0 && plan.aportado >= plan.objetivo;
}

// --- Acciones del modal ---

// Abre el modal en modo "nuevo plan" con valores por defecto.
function abrirNuevo() {
  editandoId.value = null;
  error.value = "";
  form.nombre = "";
  form.objetivo = 0;
  form.aportado = 0;
  modalAbierto.value = true;
}

// Abre el modal en modo "editar" precargando los datos del plan.
function abrirEditar(plan: Plan) {
  editandoId.value = plan.id;
  error.value = "";
  form.nombre = plan.nombre;
  form.objetivo = plan.objetivo;
  form.aportado = plan.aportado;
  modalAbierto.value = true;
}

// Cierra el modal sin guardar.
function cerrarModal() {
  modalAbierto.value = false;
}

// Valida y guarda: crea o actualiza el plan según el modo.
function guardar() {
  // Redondeo a céntimos (r2 ya admite coma decimal).
  const objetivo = r2(form.objetivo);
  const aportado = r2(form.aportado);

  // Validación: nombre no vacío, objetivo > 0, aportado >= 0.
  if (!form.nombre.trim()) {
    error.value = "El nombre no puede estar vacío.";
    return;
  }
  if (objetivo <= 0) {
    error.value = "El objetivo debe ser mayor que 0.";
    return;
  }
  if (aportado < 0) {
    error.value = "Lo aportado no puede ser negativo.";
    return;
  }

  // Objeto saneado a partir del formulario.
  const datos: FormPlan = {
    nombre: form.nombre.trim(),
    objetivo,
    aportado,
  };

  // Editar existente o crear nuevo.
  if (editandoId.value) {
    finanzas.actualizarPlan(editandoId.value, datos);
  } else {
    finanzas.addPlan(datos);
  }

  cerrarModal();
}

// Pide una cantidad por prompt y la aporta al plan indicado.
function aportar(plan: Plan) {
  // prompt() devuelve string|null; si cancela, no se hace nada.
  const entrada = prompt(`¿Cuánto quieres aportar a "${plan.nombre}"? (€)`, "");
  if (entrada === null) return; // cancelado

  // Se normaliza la coma decimal y se redondea a céntimos.
  const cantidad = r2(entrada);

  // Solo se aportan cantidades positivas válidas.
  if (!cantidad || cantidad <= 0) {
    alert("Introduce una cantidad válida mayor que 0.");
    return;
  }

  finanzas.aportarAPlan(plan.id, cantidad);
}

// Elimina un plan tras confirmación del navegador.
function borrar(plan: Plan) {
  if (confirm(`¿Eliminar el plan "${plan.nombre}"?`)) {
    finanzas.eliminarPlan(plan.id);
  }
}
</script>

<template>
  <!-- Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- 1. Cabecera: título + texto explicativo + botón de alta -->
    <header class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Planes</h1>
        <p class="mt-1 text-sm text-muted">Ahorra para una compra o un objetivo</p>
      </div>
      <button
        class="shrink-0 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNuevo"
      >
        + Nuevo plan
      </button>
    </header>

    <!-- 2. Estado vacío: no hay planes registrados -->
    <div
      v-if="finanzas.planes.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">🎯</p>
      <p class="mt-3 font-display font-bold text-ink">Aún no tienes ningún plan</p>
      <p class="mt-1 text-sm text-muted">
        Crea un plan para ahorrar hacia una compra o un objetivo (ej. "Pintar el salón").
      </p>
      <button
        class="mt-5 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNuevo"
      >
        + Crear mi primer plan
      </button>
    </div>

    <!-- 3. Listado de planes: una tarjeta por plan -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="plan in finanzas.planes"
        :key="plan.id"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- Cabecera de la tarjeta: nombre + acciones (editar/eliminar) -->
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="font-display font-bold leading-tight truncate">
              {{ plan.nombre }}
            </h2>
            <!-- Badge "Conseguido" si ya se alcanzó el objetivo -->
            <p v-if="conseguido(plan)" class="mt-1 text-xs font-medium text-ok">
              ✓ Conseguido
            </p>
          </div>
          <!-- Botones de editar y eliminar -->
          <div class="flex gap-1 shrink-0">
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-ink hover:border-brand"
              title="Editar"
              aria-label="Editar plan"
              @click="abrirEditar(plan)"
            >
              ✏️
            </button>
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
              title="Eliminar"
              aria-label="Eliminar plan"
              @click="borrar(plan)"
            >
              🗑️
            </button>
          </div>
        </div>

        <!-- Barra de progreso de ahorro -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- Relleno proporcional al progreso (0..100). Verde si está completo. -->
            <div
              class="h-full rounded-full transition-all"
              :class="conseguido(plan) ? 'bg-ok' : 'bg-brand'"
              :style="{ width: progreso(plan) + '%' }"
            ></div>
          </div>
          <!-- Texto: aportado X de Y (progreso%) -->
          <p class="mt-2 text-xs text-muted">
            Aportado {{ euro(plan.aportado) }} de {{ euro(plan.objetivo) }}
            ({{ Math.round(progreso(plan)) }}%)
          </p>
        </div>

        <!-- Detalle: restante + botón de aportar -->
        <div class="mt-4 flex items-end justify-between gap-3">
          <p class="text-sm">
            <span class="text-muted">Restante: </span>
            <!-- Verde cuando ya no falta nada (restante = 0) -->
            <span :class="restante(plan) === 0 ? 'text-ok font-medium' : 'text-ink font-medium'">
              {{ euro(restante(plan)) }}
            </span>
          </p>
          <!-- Botón aportar (oculto si ya está conseguido) -->
          <button
            v-if="!conseguido(plan)"
            class="shrink-0 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
            @click="aportar(plan)"
          >
            + Aportar
          </button>
        </div>
      </article>
    </div>

    <!-- 4. Modal de alta/edición (inline con v-if) -->
    <div
      v-if="modalAbierto"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="cerrarModal"
    >
      <!-- Tarjeta del modal -->
      <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-5">
        <h3 class="font-display font-bold text-lg">{{ tituloModal }}</h3>

        <!-- Formulario -->
        <form class="mt-4 space-y-4" @submit.prevent="guardar">
          <!-- Nombre del plan -->
          <div>
            <label class="mb-1 block text-sm text-muted">Nombre</label>
            <input
              v-model="form.nombre"
              type="text"
              placeholder="Ej: Pintar el salón"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- Objetivo y ya aportado en dos columnas -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm text-muted">Objetivo (€)</label>
              <input
                v-model.number="form.objetivo"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm text-muted">Ya aportado (€)</label>
              <input
                v-model.number="form.aportado"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
          </div>

          <!-- Mensaje de error de validación -->
          <p v-if="error" class="text-sm text-danger">{{ error }}</p>

          <!-- Botones del modal -->
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-lg bg-surface-2 border border-border px-4 py-2 text-muted font-medium hover:text-ink"
              @click="cerrarModal"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
