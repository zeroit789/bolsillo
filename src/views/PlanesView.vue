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
import { crearT } from "../i18n";

// Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// Función de traducción del componente (ES/EN). Reactiva según el idioma activo.
// Contiene todos los textos visibles de la vista de Planes.
const t = crearT({
  // Cabecera
  titulo: { es: "Planes", en: "Plans" },
  subtitulo: { es: "Ahorra para una compra o un objetivo", en: "Save for a purchase or a goal" },
  nuevoPlan: { es: "+ Nuevo plan", en: "+ New plan" },
  // Estado vacío
  vacioTitulo: { es: "Aún no tienes ningún plan", en: "You don't have any plans yet" },
  vacioTexto: {
    es: 'Crea un plan para ahorrar hacia una compra o un objetivo (ej. "Pintar el salón").',
    en: 'Create a plan to save toward a purchase or a goal (e.g. "Paint the living room").',
  },
  crearPrimero: { es: "+ Crear mi primer plan", en: "+ Create my first plan" },
  // Tarjeta de plan
  conseguido: { es: "✓ Conseguido", en: "✓ Achieved" },
  editar: { es: "Editar", en: "Edit" },
  editarPlan: { es: "Editar plan", en: "Edit plan" },
  eliminar: { es: "Eliminar", en: "Delete" },
  eliminarPlan: { es: "Eliminar plan", en: "Delete plan" },
  aportadoDe: { es: "Aportado", en: "Saved" },
  de: { es: "de", en: "of" },
  restante: { es: "Restante:", en: "Remaining:" },
  aportar: { es: "+ Aportar", en: "+ Add funds" },
  // Modal alta/edición
  nuevoPlanTitulo: { es: "Nuevo plan", en: "New plan" },
  nombre: { es: "Nombre", en: "Name" },
  nombrePlaceholder: { es: "Ej: Pintar el salón", en: "E.g. Paint the living room" },
  objetivo: { es: "Objetivo (€)", en: "Goal (€)" },
  yaAportado: { es: "Ya aportado (€)", en: "Already saved (€)" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  guardar: { es: "Guardar", en: "Save" },
  // Mini-modal de aportar
  aportarA: { es: "Aportar a", en: "Add funds to" },
  cantidad: { es: "Cantidad (€)", en: "Amount (€)" },
  cantidadPlaceholder: { es: "Ej: 25,50", en: "E.g. 25.50" },
  aportarBoton: { es: "Aportar", en: "Add funds" },
  // Mensajes de validación / confirmación
  errNombre: { es: "El nombre no puede estar vacío.", en: "The name cannot be empty." },
  errObjetivo: { es: "El objetivo debe ser mayor que 0.", en: "The goal must be greater than 0." },
  errAportado: { es: "Lo aportado no puede ser negativo.", en: "The amount saved cannot be negative." },
  errCantidad: { es: "Introduce una cantidad válida mayor que 0.", en: "Enter a valid amount greater than 0." },
  confirmarEliminar: { es: "¿Eliminar el plan", en: "Delete the plan" },
});

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

// --- Estado del modal de aportar (inline, sin prompt() nativo) ---
// Si está abierto el mini-modal de aportar.
const modalAportar = ref(false);
// Plan al que se va a aportar (null = ninguno).
const planAportar = ref<Plan | null>(null);
// Cantidad introducida (texto crudo del input; admite coma decimal).
const cantidadAportar = ref("");
// Mensaje de error del modal de aportar (vacío = sin error).
const errorAportar = ref("");

// Título del modal según estemos creando o editando.
const tituloModal = computed(() =>
  editandoId.value ? t("editarPlan") : t("nuevoPlanTitulo")
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
    error.value = t("errNombre");
    return;
  }
  if (objetivo <= 0) {
    error.value = t("errObjetivo");
    return;
  }
  if (aportado < 0) {
    error.value = t("errAportado");
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

// Abre el mini-modal de aportar para el plan indicado.
// (Los diálogos JS nativos prompt()/alert() no son fiables en Tauri.)
function aportar(plan: Plan) {
  planAportar.value = plan;
  cantidadAportar.value = "";
  errorAportar.value = "";
  modalAportar.value = true;
}

// Cierra el mini-modal de aportar sin guardar.
function cerrarModalAportar() {
  modalAportar.value = false;
}

// Valida la cantidad introducida y la aporta al plan seleccionado.
function confirmarAporte() {
  // Si por algún motivo no hay plan seleccionado, no hacemos nada.
  if (!planAportar.value) return;

  // Normaliza la coma decimal a punto y redondea a céntimos.
  const normalizado = String(cantidadAportar.value).replace(",", ".");
  const c = Math.round(Number(normalizado) * 100) / 100;

  // Solo se aportan cantidades positivas válidas.
  if (!c || c <= 0) {
    errorAportar.value = t("errCantidad");
    return;
  }

  // Aporta al plan y cierra el modal.
  finanzas.aportarAPlan(planAportar.value.id, c);
  cerrarModalAportar();
}

// Elimina un plan tras confirmación del navegador.
function borrar(plan: Plan) {
  if (confirm(`${t("confirmarEliminar")} "${plan.nombre}"?`)) {
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
        <h1 class="font-display text-2xl font-bold">{{ t("titulo") }}</h1>
        <p class="mt-1 text-sm text-muted">{{ t("subtitulo") }}</p>
      </div>
      <button
        class="shrink-0 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNuevo"
      >
        {{ t("nuevoPlan") }}
      </button>
    </header>

    <!-- 2. Estado vacío: no hay planes registrados -->
    <div
      v-if="finanzas.planes.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">🎯</p>
      <p class="mt-3 font-display font-bold text-ink">{{ t("vacioTitulo") }}</p>
      <p class="mt-1 text-sm text-muted">
        {{ t("vacioTexto") }}
      </p>
      <button
        class="mt-5 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNuevo"
      >
        {{ t("crearPrimero") }}
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
              {{ t("conseguido") }}
            </p>
          </div>
          <!-- Botones de editar y eliminar -->
          <div class="flex gap-1 shrink-0">
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-ink hover:border-brand"
              :title="t('editar')"
              :aria-label="t('editarPlan')"
              @click="abrirEditar(plan)"
            >
              ✏️
            </button>
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
              :title="t('eliminar')"
              :aria-label="t('eliminarPlan')"
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
            {{ t("aportadoDe") }} {{ euro(plan.aportado) }} {{ t("de") }} {{ euro(plan.objetivo) }}
            ({{ Math.round(progreso(plan)) }}%)
          </p>
        </div>

        <!-- Detalle: restante + botón de aportar -->
        <div class="mt-4 flex items-end justify-between gap-3">
          <p class="text-sm">
            <span class="text-muted">{{ t("restante") }} </span>
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
            {{ t("aportar") }}
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
            <label class="mb-1 block text-sm text-muted">{{ t("nombre") }}</label>
            <input
              v-model="form.nombre"
              type="text"
              :placeholder="t('nombrePlaceholder')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- Objetivo y ya aportado en dos columnas -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm text-muted">{{ t("objetivo") }}</label>
              <input
                v-model.number="form.objetivo"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm text-muted">{{ t("yaAportado") }}</label>
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
              {{ t("cancelar") }}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
            >
              {{ t("guardar") }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- 5. Mini-modal de aportar (inline con v-if) -->
    <div
      v-if="modalAportar"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="cerrarModalAportar"
    >
      <!-- Tarjeta del mini-modal -->
      <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-5">
        <h3 class="font-display font-bold text-lg">
          {{ t("aportarA") }} {{ planAportar?.nombre }}
        </h3>

        <!-- Formulario de aporte -->
        <form class="mt-4 space-y-4" @submit.prevent="confirmarAporte">
          <!-- Cantidad a aportar -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("cantidad") }}</label>
            <input
              v-model="cantidadAportar"
              type="text"
              inputmode="decimal"
              :placeholder="t('cantidadPlaceholder')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- Mensaje de error de validación -->
          <p v-if="errorAportar" class="text-sm text-danger">{{ errorAportar }}</p>

          <!-- Botones del mini-modal -->
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-lg bg-surface-2 border border-border px-4 py-2 text-muted font-medium hover:text-ink"
              @click="cerrarModalAportar"
            >
              {{ t("cancelar") }}
            </button>
            <button
              type="submit"
              class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
            >
              {{ t("aportarBoton") }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>
