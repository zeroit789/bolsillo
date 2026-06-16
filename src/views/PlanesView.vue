<script setup lang="ts">
/* =============================================================================
 * PlanesView.vue — Savings goals view / Vista de metas de ahorro
 * -----------------------------------------------------------------------------
 * EN: Savings plans / planning a home purchase (e.g. "Paint the living room 110€").
 *     Each plan has a goal (€) and an amount already saved. The view shows the
 *     progress (saved/goal), what's left, lets the user add funds, and create /
 *     edit / delete plans via an inline modal.
 * ES: Metas de ahorro / planificar una compra doméstica (ej. "Pintar el salón 110€").
 *     Cada plan tiene un objetivo (€) y un importe ya aportado. La vista muestra el
 *     progreso (aportado/objetivo), lo que falta, permite aportar dinero, y dar de
 *     alta / editar / eliminar planes mediante un modal inline.
 * -----------------------------------------------------------------------------
 * EN: Conventions taken from the rest of the views (DeudasView):
 *       - Central useFinanzas store already initialized in the app.
 *       - Inline modal with v-if for create/edit.
 *       - Validation with error message and amounts rounded to cents.
 * ES: Convenciones tomadas del resto de vistas (DeudasView):
 *       - Store central useFinanzas ya inicializado en la app.
 *       - Modal inline con v-if para alta/edición.
 *       - Validación con mensaje de error e importes redondeados a céntimos.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & store / Importaciones y store
 *   2. Translations (ES/EN) / Traducciones (ES/EN)
 *   3. Create/edit modal state / Estado del modal de alta/edición
 *   4. Add-funds modal state / Estado del modal de aportar
 *   5. Per-plan calculation helpers / Helpers de cálculo por plan
 *   6. Modal actions / Acciones del modal
 *
 *   TEMPLATE / PLANTILLA:
 *     1. Header / Cabecera
 *     2. Empty state / Estado vacío
 *     3. Plan list / Listado de planes
 *     4. Create/edit modal / Modal de alta/edición
 *     5. Add-funds mini-modal / Mini-modal de aportar
 * ===========================================================================*/

// ── 1. Imports & store / Importaciones y store ────────────────────────────────
import { ref, reactive, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import type { Plan } from "../types";
import { euro } from "../utils/format";
import { crearT } from "../i18n";

// EN: Central finance store (already initialized in the app).
// ES: Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// ── 2. Translations (ES/EN) / Traducciones (ES/EN) ────────────────────────────
// EN: Component translation function (ES/EN). Reactive to the active language.
//     Holds every visible text of the Plans view.
// ES: Función de traducción del componente (ES/EN). Reactiva según el idioma activo.
//     Contiene todos los textos visibles de la vista de Planes.
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

// ── 3. Create/edit modal state / Estado del modal de alta/edición ─────────────
// EN: Whether the modal is open. / ES: Si está abierto el modal.
const modalAbierto = ref(false);
// EN: Id of the plan being edited (null = we're creating a new one).
// ES: Id del plan en edición (null = estamos creando uno nuevo).
const editandoId = ref<string | null>(null);

// EN: Form type: the editable fields of a Plan (without the id).
// ES: Tipo del formulario: los campos editables de un Plan (sin el id).
type FormPlan = Omit<Plan, "id">;

// EN: Form data (reactive). Filled in when the modal opens.
// ES: Datos del formulario (reactivos). Se rellenan al abrir el modal.
const form = reactive<FormPlan>({
  nombre: "",
  objetivo: 0,
  aportado: 0,
});

// EN: Validation error message (empty = no error).
// ES: Mensaje de error de validación (vacío = sin error).
const error = ref("");

// ── 4. Add-funds modal state / Estado del modal de aportar ────────────────────
// EN: Add-funds modal state (inline, no native prompt()).
// ES: Estado del modal de aportar (inline, sin prompt() nativo).
// EN: Whether the add-funds mini-modal is open.
// ES: Si está abierto el mini-modal de aportar.
const modalAportar = ref(false);
// EN: Plan funds will be added to (null = none).
// ES: Plan al que se va a aportar (null = ninguno).
const planAportar = ref<Plan | null>(null);
// EN: Entered amount (raw input text; accepts decimal comma).
// ES: Cantidad introducida (texto crudo del input; admite coma decimal).
const cantidadAportar = ref("");
// EN: Add-funds modal error message (empty = no error).
// ES: Mensaje de error del modal de aportar (vacío = sin error).
const errorAportar = ref("");

// EN: Modal title depending on whether we're creating or editing.
// ES: Título del modal según estemos creando o editando.
const tituloModal = computed(() =>
  editandoId.value ? t("editarPlan") : t("nuevoPlanTitulo")
);

// ── 5. Per-plan calculation helpers / Helpers de cálculo por plan ─────────────
// EN: Rounds a number to 2 decimals (cents). Accepts decimal comma or dot.
// ES: Redondea un número a 2 decimales (céntimos). Acepta coma o punto decimal.
function r2(valor: number | string): number {
  // EN: If it comes as text with decimal comma ("12,50") it's normalized to dot.
  // ES: Si viene como texto con coma decimal ("12,50") se normaliza a punto.
  const n = typeof valor === "string" ? Number(valor.replace(",", ".")) : valor;
  return Math.round((Number(n) || 0) * 100) / 100;
}

// EN: Progress percentage of a plan, clamped to the 0..100 range.
// ES: Porcentaje de progreso de un plan, recortado (clamp) al rango 0..100.
function progreso(plan: Plan): number {
  // EN: If the goal is 0 or negative it can't be computed: treated as 0%.
  // ES: Si el objetivo es 0 o negativo no se puede calcular: se considera 0%.
  if (plan.objetivo <= 0) return 0;
  const pct = (plan.aportado / plan.objetivo) * 100;
  // EN: clamp 0..100 so the bar never overflows nor goes negative.
  // ES: clamp 0..100 para que la barra nunca se desborde ni quede negativa.
  return Math.min(100, Math.max(0, pct));
}

// EN: What's left to reach the goal (never negative).
// ES: Lo que falta para llegar al objetivo (nunca negativo).
function restante(plan: Plan): number {
  return Math.max(0, r2(plan.objetivo - plan.aportado));
}

// EN: true if the plan is already achieved (saved >= goal).
// ES: true si el plan ya está conseguido (aportado >= objetivo).
function conseguido(plan: Plan): boolean {
  // EN: Requires a valid goal (>0) so a plan at 0 isn't flagged "achieved".
  // ES: Requiere objetivo válido (>0) para no marcar "conseguido" un plan a 0.
  return plan.objetivo > 0 && plan.aportado >= plan.objetivo;
}

// ── 6. Modal actions / Acciones del modal ─────────────────────────────────────
// EN: Opens the modal in "new plan" mode with default values.
// ES: Abre el modal en modo "nuevo plan" con valores por defecto.
function abrirNuevo() {
  editandoId.value = null;
  error.value = "";
  form.nombre = "";
  form.objetivo = 0;
  form.aportado = 0;
  modalAbierto.value = true;
}

// EN: Opens the modal in "edit" mode, preloading the plan's data.
// ES: Abre el modal en modo "editar" precargando los datos del plan.
function abrirEditar(plan: Plan) {
  editandoId.value = plan.id;
  error.value = "";
  form.nombre = plan.nombre;
  form.objetivo = plan.objetivo;
  form.aportado = plan.aportado;
  modalAbierto.value = true;
}

// EN: Closes the modal without saving. / ES: Cierra el modal sin guardar.
function cerrarModal() {
  modalAbierto.value = false;
}

// EN: Validates and saves: creates or updates the plan depending on the mode.
// ES: Valida y guarda: crea o actualiza el plan según el modo.
function guardar() {
  // EN: Rounding to cents (r2 already accepts a decimal comma).
  // ES: Redondeo a céntimos (r2 ya admite coma decimal).
  const objetivo = r2(form.objetivo);
  const aportado = r2(form.aportado);

  // EN: Validation: non-empty name, goal > 0, saved >= 0.
  // ES: Validación: nombre no vacío, objetivo > 0, aportado >= 0.
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

  // EN: Sanitized object built from the form.
  // ES: Objeto saneado a partir del formulario.
  const datos: FormPlan = {
    nombre: form.nombre.trim(),
    objetivo,
    aportado,
  };

  // EN: Edit the existing one or create a new one.
  // ES: Editar existente o crear nuevo.
  if (editandoId.value) {
    finanzas.actualizarPlan(editandoId.value, datos);
  } else {
    finanzas.addPlan(datos);
  }

  cerrarModal();
}

// EN: Opens the add-funds mini-modal for the given plan.
//     (Native JS dialogs prompt()/alert() are not reliable in Tauri.)
// ES: Abre el mini-modal de aportar para el plan indicado.
//     (Los diálogos JS nativos prompt()/alert() no son fiables en Tauri.)
function aportar(plan: Plan) {
  planAportar.value = plan;
  cantidadAportar.value = "";
  errorAportar.value = "";
  modalAportar.value = true;
}

// EN: Closes the add-funds mini-modal without saving.
// ES: Cierra el mini-modal de aportar sin guardar.
function cerrarModalAportar() {
  modalAportar.value = false;
}

// EN: Validates the entered amount and adds it to the selected plan.
// ES: Valida la cantidad introducida y la aporta al plan seleccionado.
function confirmarAporte() {
  // EN: If for some reason there's no selected plan, do nothing.
  // ES: Si por algún motivo no hay plan seleccionado, no hacemos nada.
  if (!planAportar.value) return;

  // EN: Normalizes the decimal comma to dot and rounds to cents.
  // ES: Normaliza la coma decimal a punto y redondea a céntimos.
  const normalizado = String(cantidadAportar.value).replace(",", ".");
  const c = Math.round(Number(normalizado) * 100) / 100;

  // EN: Only valid positive amounts are added.
  // ES: Solo se aportan cantidades positivas válidas.
  if (!c || c <= 0) {
    errorAportar.value = t("errCantidad");
    return;
  }

  // EN: Adds funds to the plan and closes the modal.
  // ES: Aporta al plan y cierra el modal.
  finanzas.aportarAPlan(planAportar.value.id, c);
  cerrarModalAportar();
}

// EN: Deletes a plan after browser confirmation.
// ES: Elimina un plan tras confirmación del navegador.
function borrar(plan: Plan) {
  if (confirm(`${t("confirmarEliminar")} "${plan.nombre}"?`)) {
    finanzas.eliminarPlan(plan.id);
  }
}
</script>

<template>
  <!-- EN: View container / ES: Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- EN: 1. Header: title + explanatory text + create button -->
    <!-- ES: 1. Cabecera: título + texto explicativo + botón de alta -->
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

    <!-- EN: 2. Empty state: no plans registered -->
    <!-- ES: 2. Estado vacío: no hay planes registrados -->
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

    <!-- EN: 3. Plan list: one card per plan -->
    <!-- ES: 3. Listado de planes: una tarjeta por plan -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="plan in finanzas.planes"
        :key="plan.id"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- EN: Card header: name + actions (edit/delete) -->
        <!-- ES: Cabecera de la tarjeta: nombre + acciones (editar/eliminar) -->
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <h2 class="font-display font-bold leading-tight truncate">
              {{ plan.nombre }}
            </h2>
            <!-- EN: "Achieved" badge if the goal was already reached -->
            <!-- ES: Badge "Conseguido" si ya se alcanzó el objetivo -->
            <p v-if="conseguido(plan)" class="mt-1 text-xs font-medium text-ok">
              {{ t("conseguido") }}
            </p>
          </div>
          <!-- EN: Edit and delete buttons / ES: Botones de editar y eliminar -->
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

        <!-- EN: Savings progress bar / ES: Barra de progreso de ahorro -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- EN: Fill proportional to progress (0..100). Green if complete. -->
            <!-- ES: Relleno proporcional al progreso (0..100). Verde si está completo. -->
            <div
              class="h-full rounded-full transition-all"
              :class="conseguido(plan) ? 'bg-ok' : 'bg-brand'"
              :style="{ width: progreso(plan) + '%' }"
            ></div>
          </div>
          <!-- EN: Text: saved X of Y (progress%) -->
          <!-- ES: Texto: aportado X de Y (progreso%) -->
          <p class="mt-2 text-xs text-muted">
            {{ t("aportadoDe") }} {{ euro(plan.aportado) }} {{ t("de") }} {{ euro(plan.objetivo) }}
            ({{ Math.round(progreso(plan)) }}%)
          </p>
        </div>

        <!-- EN: Detail: remaining + add-funds button -->
        <!-- ES: Detalle: restante + botón de aportar -->
        <div class="mt-4 flex items-end justify-between gap-3">
          <p class="text-sm">
            <span class="text-muted">{{ t("restante") }} </span>
            <!-- EN: Green when nothing's left (remaining = 0) -->
            <!-- ES: Verde cuando ya no falta nada (restante = 0) -->
            <span :class="restante(plan) === 0 ? 'text-ok font-medium' : 'text-ink font-medium'">
              {{ euro(restante(plan)) }}
            </span>
          </p>
          <!-- EN: Add-funds button (hidden if already achieved) -->
          <!-- ES: Botón aportar (oculto si ya está conseguido) -->
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

    <!-- EN: 4. Create/edit modal (inline with v-if) -->
    <!-- ES: 4. Modal de alta/edición (inline con v-if) -->
    <div
      v-if="modalAbierto"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="cerrarModal"
    >
      <!-- EN: Modal card / ES: Tarjeta del modal -->
      <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-5">
        <h3 class="font-display font-bold text-lg">{{ tituloModal }}</h3>

        <!-- EN: Form / ES: Formulario -->
        <form class="mt-4 space-y-4" @submit.prevent="guardar">
          <!-- EN: Plan name / ES: Nombre del plan -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("nombre") }}</label>
            <input
              v-model="form.nombre"
              type="text"
              :placeholder="t('nombrePlaceholder')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- EN: Goal and already-saved in two columns -->
          <!-- ES: Objetivo y ya aportado en dos columnas -->
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

          <!-- EN: Validation error message / ES: Mensaje de error de validación -->
          <p v-if="error" class="text-sm text-danger">{{ error }}</p>

          <!-- EN: Modal buttons / ES: Botones del modal -->
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

    <!-- EN: 5. Add-funds mini-modal (inline with v-if) -->
    <!-- ES: 5. Mini-modal de aportar (inline con v-if) -->
    <div
      v-if="modalAportar"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="cerrarModalAportar"
    >
      <!-- EN: Mini-modal card / ES: Tarjeta del mini-modal -->
      <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-5">
        <h3 class="font-display font-bold text-lg">
          {{ t("aportarA") }} {{ planAportar?.nombre }}
        </h3>

        <!-- EN: Add-funds form / ES: Formulario de aporte -->
        <form class="mt-4 space-y-4" @submit.prevent="confirmarAporte">
          <!-- EN: Amount to add / ES: Cantidad a aportar -->
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

          <!-- EN: Validation error message / ES: Mensaje de error de validación -->
          <p v-if="errorAportar" class="text-sm text-danger">{{ errorAportar }}</p>

          <!-- EN: Mini-modal buttons / ES: Botones del mini-modal -->
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
