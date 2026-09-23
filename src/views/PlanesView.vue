<script setup lang="ts">
/* =============================================================================
 * PlanesView.vue — Vista de metas de ahorro / Savings goals view
 * -----------------------------------------------------------------------------
 * ES: Metas de ahorro / planificar una compra doméstica (ej. "Pintar el salón 110€").
 *     Cada plan tiene un objetivo (€) y un importe ya aportado. La vista muestra el
 *     progreso (aportado/objetivo), lo que falta, permite aportar dinero, y dar de
 *     alta / editar / eliminar planes mediante un modal inline.
 * EN: Savings plans / planning a home purchase (e.g. "Paint the living room 110€").
 *     Each plan has a goal (€) and an amount already saved. The view shows the
 *     progress (saved/goal), what's left, lets the user add funds, and create /
 *     edit / delete plans via an inline modal.
 * -----------------------------------------------------------------------------
 * ES: Convenciones tomadas del resto de vistas (DeudasView):
 *       - Store central useFinanzas ya inicializado en la app.
 *       - Modal inline con v-if para alta/edición.
 *       - Validación con mensaje de error e importes redondeados a céntimos.
 * EN: Conventions taken from the rest of the views (DeudasView):
 *       - Central useFinanzas store already initialized in the app.
 *       - Inline modal with v-if for create/edit.
 *       - Validation with error message and amounts rounded to cents.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y store / Imports & store
 *   2. Traducciones (ES/EN) / Translations (ES/EN)
 *   3. Estado del modal de alta/edición / Create/edit modal state
 *   4. Estado del modal de aportar / Add-funds modal state
 *   5. Helpers de cálculo por plan / Per-plan calculation helpers
 *   6. Acciones del modal / Modal actions
 *
 *   TEMPLATE / PLANTILLA:
 *     1. Cabecera / Header
 *     2. Estado vacío / Empty state
 *     3. Listado de planes / Plan list
 *     4. Modal de alta/edición / Create/edit modal
 *     5. Mini-modal de aportar / Add-funds mini-modal
 * ===========================================================================*/

// ── 1. Importaciones y store / Imports & store ────────────────────────────────
import { ref, reactive, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import type { Plan } from "../types";
import { euro } from "../utils/format";
import { crearT } from "../i18n";

// ES: Store central de finanzas (ya inicializado en la app).
// EN: Central finance store (already initialized in the app).
const finanzas = useFinanzas();

// ── 2. Traducciones (ES/EN) / Translations (ES/EN) ────────────────────────────
// ES: Función de traducción del componente (ES/EN). Reactiva según el idioma activo.
//     Contiene todos los textos visibles de la vista de Planes.
// EN: Component translation function (ES/EN). Reactive to the active language.
//     Holds every visible text of the Plans view.
const t = crearT({
  // ES: Cabecera
  // EN: Header
  titulo: { es: "Planes", en: "Plans" },
  subtitulo: { es: "Ahorra para una compra o un objetivo", en: "Save for a purchase or a goal" },
  nuevoPlan: { es: "+ Nuevo plan", en: "+ New plan" },
  // ES: Estado vacío
  // EN: Empty state
  vacioTitulo: { es: "Aún no tienes ningún plan", en: "You don't have any plans yet" },
  vacioTexto: {
    es: 'Crea un plan para ahorrar hacia una compra o un objetivo (ej. "Pintar el salón").',
    en: 'Create a plan to save toward a purchase or a goal (e.g. "Paint the living room").',
  },
  crearPrimero: { es: "+ Crear mi primer plan", en: "+ Create my first plan" },
  // ES: Tarjeta de plan
  // EN: Plan card
  conseguido: { es: "✓ Conseguido", en: "✓ Achieved" },
  editar: { es: "Editar", en: "Edit" },
  editarPlan: { es: "Editar plan", en: "Edit plan" },
  eliminar: { es: "Eliminar", en: "Delete" },
  eliminarPlan: { es: "Eliminar plan", en: "Delete plan" },
  aportadoDe: { es: "Aportado", en: "Saved" },
  de: { es: "de", en: "of" },
  restante: { es: "Restante:", en: "Remaining:" },
  aportar: { es: "+ Aportar", en: "+ Add funds" },
  // ES: Modal alta/edición
  // EN: Create/edit modal
  nuevoPlanTitulo: { es: "Nuevo plan", en: "New plan" },
  nombre: { es: "Nombre", en: "Name" },
  nombrePlaceholder: { es: "Ej: Pintar el salón", en: "E.g. Paint the living room" },
  objetivo: { es: "Objetivo (€)", en: "Goal (€)" },
  yaAportado: { es: "Ya aportado (€)", en: "Already saved (€)" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  guardar: { es: "Guardar", en: "Save" },
  // ES: Mini-modal de aportar
  // EN: Add-funds mini-modal
  aportarA: { es: "Aportar a", en: "Add funds to" },
  cantidad: { es: "Cantidad (€)", en: "Amount (€)" },
  cantidadPlaceholder: { es: "Ej: 25,50", en: "E.g. 25.50" },
  aportarBoton: { es: "Aportar", en: "Add funds" },
  // ES: Mensajes de validación / confirmación
  // EN: Validation / confirmation messages
  errNombre: { es: "El nombre no puede estar vacío.", en: "The name cannot be empty." },
  errObjetivo: { es: "El objetivo debe ser mayor que 0.", en: "The goal must be greater than 0." },
  errAportado: { es: "Lo aportado no puede ser negativo.", en: "The amount saved cannot be negative." },
  errCantidad: { es: "Introduce una cantidad válida mayor que 0.", en: "Enter a valid amount greater than 0." },
  confirmarEliminar: { es: "¿Eliminar el plan", en: "Delete the plan" },
});

// ── 3. Estado del modal de alta/edición / Create/edit modal state ─────────────
// ES: Si está abierto el modal. / EN: Whether the modal is open.
const modalAbierto = ref(false);
// ES: Id del plan en edición (null = estamos creando uno nuevo).
// EN: Id of the plan being edited (null = we're creating a new one).
const editandoId = ref<string | null>(null);

// ES: Tipo del formulario: los campos editables de un Plan (sin el id).
// EN: Form type: the editable fields of a Plan (without the id).
type FormPlan = Omit<Plan, "id">;

// ES: Datos del formulario (reactivos). Se rellenan al abrir el modal.
// EN: Form data (reactive). Filled in when the modal opens.
const form = reactive<FormPlan>({
  nombre: "",
  objetivo: 0,
  aportado: 0,
});

// ES: Mensaje de error de validación (vacío = sin error).
// EN: Validation error message (empty = no error).
const error = ref("");

// ── 4. Estado del modal de aportar / Add-funds modal state ────────────────────
// ES: Estado del modal de aportar (inline, sin prompt() nativo).
// EN: Add-funds modal state (inline, no native prompt()).
// ES: Si está abierto el mini-modal de aportar.
// EN: Whether the add-funds mini-modal is open.
const modalAportar = ref(false);
// ES: Plan al que se va a aportar (null = ninguno).
// EN: Plan funds will be added to (null = none).
const planAportar = ref<Plan | null>(null);
// ES: Cantidad introducida (texto crudo del input; admite coma decimal).
// EN: Entered amount (raw input text; accepts decimal comma).
const cantidadAportar = ref("");
// ES: Mensaje de error del modal de aportar (vacío = sin error).
// EN: Add-funds modal error message (empty = no error).
const errorAportar = ref("");

// ES: Título del modal según estemos creando o editando.
// EN: Modal title depending on whether we're creating or editing.
const tituloModal = computed(() =>
  editandoId.value ? t("editarPlan") : t("nuevoPlanTitulo")
);

// ── 5. Helpers de cálculo por plan / Per-plan calculation helpers ─────────────
// ES: Redondea un número a 2 decimales (céntimos). Acepta coma o punto decimal.
// EN: Rounds a number to 2 decimals (cents). Accepts decimal comma or dot.
function r2(valor: number | string): number {
  // ES: Si viene como texto con coma decimal ("12,50") se normaliza a punto.
  // EN: If it comes as text with decimal comma ("12,50") it's normalized to dot.
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ES: Porcentaje de progreso de un plan, recortado (clamp) al rango 0..100.
// EN: Progress percentage of a plan, clamped to the 0..100 range.
function progreso(plan: Plan): number {
  // ES: Si el objetivo es 0 o negativo no se puede calcular: se considera 0%.
  // EN: If the goal is 0 or negative it can't be computed: treated as 0%.
  if (plan.objetivo <= 0) return 0;
  const pct = (plan.aportado / plan.objetivo) * 100;
  // ES: clamp 0..100 para que la barra nunca se desborde ni quede negativa.
  // EN: clamp 0..100 so the bar never overflows nor goes negative.
  return Math.min(100, Math.max(0, pct));
}

// ES: Lo que falta para llegar al objetivo (nunca negativo).
// EN: What's left to reach the goal (never negative).
function restante(plan: Plan): number {
  return Math.max(0, r2(plan.objetivo - plan.aportado));
}

// ES: true si el plan ya está conseguido (aportado >= objetivo).
// EN: true if the plan is already achieved (saved >= goal).
function conseguido(plan: Plan): boolean {
  // ES: Requiere objetivo válido (>0) para no marcar "conseguido" un plan a 0.
  // EN: Requires a valid goal (>0) so a plan at 0 isn't flagged "achieved".
  return plan.objetivo > 0 && plan.aportado >= plan.objetivo;
}

// ── 6. Acciones del modal / Modal actions ─────────────────────────────────────
// ES: Abre el modal en modo "nuevo plan" con valores por defecto.
// EN: Opens the modal in "new plan" mode with default values.
function abrirNuevo() {
  editandoId.value = null;
  error.value = "";
  form.nombre = "";
  form.objetivo = 0;
  form.aportado = 0;
  modalAbierto.value = true;
}

// ES: Abre el modal en modo "editar" precargando los datos del plan.
// EN: Opens the modal in "edit" mode, preloading the plan's data.
function abrirEditar(plan: Plan) {
  editandoId.value = plan.id;
  error.value = "";
  form.nombre = plan.nombre;
  form.objetivo = plan.objetivo;
  form.aportado = plan.aportado;
  modalAbierto.value = true;
}

// ES: Cierra el modal sin guardar. / EN: Closes the modal without saving.
function cerrarModal() {
  modalAbierto.value = false;
}

// ES: Valida y guarda: crea o actualiza el plan según el modo.
// EN: Validates and saves: creates or updates the plan depending on the mode.
function guardar() {
  // ES: Redondeo a céntimos (r2 ya admite coma decimal).
  // EN: Rounding to cents (r2 already accepts a decimal comma).
  const objetivo = r2(form.objetivo);
  const aportado = r2(form.aportado);

  // ES: Validación: nombre no vacío, objetivo > 0, aportado >= 0.
  // EN: Validation: non-empty name, goal > 0, saved >= 0.
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

  // ES: Objeto saneado a partir del formulario.
  // EN: Sanitized object built from the form.
  const datos: FormPlan = {
    nombre: form.nombre.trim(),
    objetivo,
    aportado,
  };

  // ES: Editar existente o crear nuevo.
  // EN: Edit the existing one or create a new one.
  if (editandoId.value) {
    finanzas.actualizarPlan(editandoId.value, datos);
  } else {
    finanzas.addPlan(datos);
  }

  cerrarModal();
}

// ES: Abre el mini-modal de aportar para el plan indicado.
//     (Los diálogos JS nativos prompt()/alert() no son fiables en Tauri.)
// EN: Opens the add-funds mini-modal for the given plan.
//     (Native JS dialogs prompt()/alert() are not reliable in Tauri.)
function aportar(plan: Plan) {
  planAportar.value = plan;
  cantidadAportar.value = "";
  errorAportar.value = "";
  modalAportar.value = true;
}

// ES: Cierra el mini-modal de aportar sin guardar.
// EN: Closes the add-funds mini-modal without saving.
function cerrarModalAportar() {
  modalAportar.value = false;
}

// ES: Valida la cantidad introducida y la aporta al plan seleccionado.
// EN: Validates the entered amount and adds it to the selected plan.
function confirmarAporte() {
  // ES: Si por algún motivo no hay plan seleccionado, no hacemos nada.
  // EN: If for some reason there's no selected plan, do nothing.
  if (!planAportar.value) return;

  // ES: Normaliza la coma decimal a punto y redondea a céntimos.
  // EN: Normalizes the decimal comma to dot and rounds to cents.
  const normalizado = String(cantidadAportar.value).replace(",", ".");
  const c = Math.round(Number(normalizado) * 100) / 100;

  // ES: Solo se aportan cantidades positivas válidas.
  // EN: Only valid positive amounts are added.
  if (!c || c <= 0) {
    errorAportar.value = t("errCantidad");
    return;
  }

  // ES: Aporta al plan y cierra el modal.
  // EN: Adds funds to the plan and closes the modal.
  finanzas.aportarAPlan(planAportar.value.id, c);
  cerrarModalAportar();
}

// ES: Elimina un plan tras confirmación del navegador.
// EN: Deletes a plan after browser confirmation.
function borrar(plan: Plan) {
  if (confirm(`${t("confirmarEliminar")} "${plan.nombre}"?`)) {
    finanzas.eliminarPlan(plan.id);
  }
}
</script>

<template>
  <!-- ES: Contenedor de la vista / EN: View container -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- ES: 1. Cabecera: título + texto explicativo + botón de alta -->
    <!-- EN: 1. Header: title + explanatory text + create button -->
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

    <!-- ES: 2. Estado vacío: no hay planes registrados -->
    <!-- EN: 2. Empty state: no plans registered -->
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

    <!-- ES: 3. Listado de planes: una tarjeta por plan -->
    <!-- EN: 3. Plan list: one card per plan -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="plan in finanzas.planes"
        :key="plan.id"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- ES: Cabecera de la tarjeta: nombre + acciones (editar/eliminar) -->
        <!-- EN: Card header: name + actions (edit/delete) -->
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="font-display font-bold leading-tight truncate">
              {{ plan.nombre }}
            </h2>
            <!-- ES: Badge "Conseguido" si ya se alcanzó el objetivo -->
            <!-- EN: "Achieved" badge if the goal was already reached -->
            <p v-if="conseguido(plan)" class="mt-1 text-xs font-medium text-ok">
              {{ t("conseguido") }}
            </p>
          </div>
          <!-- ES: Botones de editar y eliminar / EN: Edit and delete buttons -->
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

        <!-- ES: Barra de progreso de ahorro / EN: Savings progress bar -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- ES: Relleno proporcional al progreso (0..100). Verde si está completo. -->
            <!-- EN: Fill proportional to progress (0..100). Green if complete. -->
            <div
              class="h-full rounded-full transition-all"
              :class="conseguido(plan) ? 'bg-ok' : 'bg-brand'"
              :style="{ width: progreso(plan) + '%' }"
            ></div>
          </div>
          <!-- ES: Texto: aportado X de Y (progreso%) -->
          <!-- EN: Text: saved X of Y (progress%) -->
          <p class="mt-2 text-xs text-muted">
            {{ t("aportadoDe") }} {{ euro(plan.aportado) }} {{ t("de") }} {{ euro(plan.objetivo) }}
            ({{ Math.round(progreso(plan)) }}%)
          </p>
        </div>

        <!-- ES: Detalle: restante + botón de aportar -->
        <!-- EN: Detail: remaining + add-funds button -->
        <div class="mt-4 flex items-end justify-between gap-3">
          <p class="text-sm">
            <span class="text-muted">{{ t("restante") }} </span>
            <!-- ES: Verde cuando ya no falta nada (restante = 0) -->
            <!-- EN: Green when nothing's left (remaining = 0) -->
            <span :class="restante(plan) === 0 ? 'text-ok font-medium' : 'text-ink font-medium'">
              {{ euro(restante(plan)) }}
            </span>
          </p>
          <!-- ES: Botón aportar (oculto si ya está conseguido) -->
          <!-- EN: Add-funds button (hidden if already achieved) -->
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

    <!-- ES: 4. Modal de alta/edición (inline con v-if) -->
    <!-- EN: 4. Create/edit modal (inline with v-if) -->
    <div
      v-if="modalAbierto"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="cerrarModal"
    >
      <!-- ES: Tarjeta del modal / EN: Modal card -->
      <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-5">
        <h3 class="font-display font-bold text-lg">{{ tituloModal }}</h3>

        <!-- ES: Formulario / EN: Form -->
        <form class="mt-4 space-y-4" @submit.prevent="guardar">
          <!-- ES: Nombre del plan / EN: Plan name -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("nombre") }}</label>
            <input
              v-model="form.nombre"
              type="text"
              :placeholder="t('nombrePlaceholder')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- ES: Objetivo y ya aportado en dos columnas -->
          <!-- EN: Goal and already-saved in two columns -->
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

          <!-- ES: Mensaje de error de validación / EN: Validation error message -->
          <p v-if="error" class="text-sm text-danger">{{ error }}</p>

          <!-- ES: Botones del modal / EN: Modal buttons -->
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

    <!-- ES: 5. Mini-modal de aportar (inline con v-if) -->
    <!-- EN: 5. Add-funds mini-modal (inline with v-if) -->
    <div
      v-if="modalAportar"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="cerrarModalAportar"
    >
      <!-- ES: Tarjeta del mini-modal / EN: Mini-modal card -->
      <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-5">
        <h3 class="font-display font-bold text-lg">
          {{ t("aportarA") }} {{ planAportar?.nombre }}
        </h3>

        <!-- ES: Formulario de aporte / EN: Add-funds form -->
        <form class="mt-4 space-y-4" @submit.prevent="confirmarAporte">
          <!-- ES: Cantidad a aportar / EN: Amount to add -->
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

          <!-- ES: Mensaje de error de validación / EN: Validation error message -->
          <p v-if="errorAportar" class="text-sm text-danger">{{ errorAportar }}</p>

          <!-- ES: Botones del mini-modal / EN: Mini-modal buttons -->
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
