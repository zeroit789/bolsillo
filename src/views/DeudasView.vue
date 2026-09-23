<script setup lang="ts">
/* =============================================================================
 * DeudasView.vue — Vista de deudas / Debts view
 * -----------------------------------------------------------------------------
 * ES: Lista las deudas evaluadas al mes seleccionado (estadosDeuda del store) con
 *     barra de progreso, pendiente, cuota y meses restantes. Permite dar de alta,
 *     editar y eliminar deudas mediante un modal inline.
 * EN: Lists the debts evaluated at the selected month (estadosDeuda from the
 *     store) with a progress bar, pending amount, monthly payment and remaining
 *     months. Allows creating, editing and deleting debts via an inline modal.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y store / Imports & store
 *   2. Traducciones (i18n) / Translations (i18n)
 *   3. Estado del modal / Modal state
 *   4. Formulario y estado derivado / Form & derived state
 *   5. Ayudante de metadatos del tipo / Type metadata helper
 *   6. Abrir/cerrar modal / Open/close modal
 *   7. Validar y guardar / Validate & save
 *   8. Eliminar deuda / Delete debt
 * ===========================================================================*/

// ── 1. Imports y store / Imports & store ──────────────────────────────────────
import { ref, reactive, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { TIPOS_DEUDA, type Deuda, type TipoDeuda } from "../types";
import { euro, mesActual } from "../utils/format";
import { crearT } from "../i18n";

// ES: Store central de finanzas (ya inicializado en la app).
// EN: Central finances store (already initialized in the app).
const finanzas = useFinanzas();

// ── 2. Traducciones (i18n) / Translations (i18n) ──────────────────────────────
// ES: Función de traducción (ES/EN) con todos los textos visibles de la vista.
// EN: Translation function (ES/EN) holding every visible text in the view.
const t = crearT({
  // ES: Cabecera y botones de alta
  // EN: Header and create buttons
  titulo: { es: "Deudas", en: "Debts" },
  nuevaDeuda: { es: "+ Nueva deuda", en: "+ New debt" },
  // ES: Estado vacío
  // EN: Empty state
  vacioTitulo: { es: "No tienes deudas registradas", en: "You have no debts registered" },
  vacioSub: {
    es: "Cuando añadas una deuda aparecerá aquí su progreso mes a mes.",
    en: "When you add a debt, its month-by-month progress will appear here.",
  },
  vacioBoton: { es: "+ Añadir mi primera deuda", en: "+ Add my first debt" },
  // ES: Tarjeta de deuda
  // EN: Debt card
  editar: { es: "Editar", en: "Edit" },
  editarAria: { es: "Editar deuda", en: "Edit debt" },
  eliminar: { es: "Eliminar", en: "Delete" },
  eliminarAria: { es: "Eliminar deuda", en: "Delete debt" },
  pagadoDe: { es: "Pagado", en: "Paid" },
  de: { es: "de", en: "of" },
  pendiente: { es: "Pendiente:", en: "Pending:" },
  cuotaMensual: { es: "Cuota mensual:", en: "Monthly payment:" },
  pagada: { es: "✓ Pagada", en: "✓ Paid off" },
  teQuedan: { es: "Te quedan", en: "You have" },
  mes: { es: "mes", en: "month" },
  meses: { es: "meses", en: "months" },
  // ES: Modal de alta/edición
  // EN: Create/edit modal
  modalEditar: { es: "Editar deuda", en: "Edit debt" },
  modalNueva: { es: "Nueva deuda", en: "New debt" },
  labelConcepto: { es: "Concepto", en: "Concept" },
  phConcepto: { es: "Ej: Tarjeta Visa", en: "E.g.: Visa card" },
  labelTipo: { es: "Tipo", en: "Type" },
  labelTotal: { es: "Total (€)", en: "Total (€)" },
  labelCuotaMensual: { es: "Cuota mensual (€)", en: "Monthly payment (€)" },
  labelYaPagado: { es: "Ya pagado (€)", en: "Already paid (€)" },
  labelMesInicio: { es: "Mes de inicio", en: "Start month" },
  labelDiaCobro: { es: "Día de cobro (1-31)", en: "Charge day (1-31)" },
  phOpcional: { es: "Opcional", en: "Optional" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  guardar: { es: "Guardar", en: "Save" },
  // ES: Mensajes de validación
  // EN: Validation messages
  errConcepto: { es: "El concepto no puede estar vacío.", en: "The concept cannot be empty." },
  errTotal: { es: "El total debe ser mayor que 0.", en: "The total must be greater than 0." },
  errCuota: { es: "La cuota mensual debe ser mayor que 0.", en: "The monthly payment must be greater than 0." },
  errPagadoNeg: { es: "Lo ya pagado no puede ser negativo.", en: "The amount already paid cannot be negative." },
  errPagadoTotal: { es: "Lo ya pagado no puede superar el total.", en: "The amount already paid cannot exceed the total." },
  errMes: { es: "Indica un mes de inicio válido.", en: "Enter a valid start month." },
  // ES: Confirmación de borrado (con interpolación del concepto)
  // EN: Delete confirmation (with the concept interpolated)
  confirmBorrarPre: { es: '¿Eliminar la deuda "', en: 'Delete the debt "' },
  confirmBorrarPost: { es: '"?', en: '"?' },
});

// ── 3. Estado del modal / Modal state ─────────────────────────────────────────
// ES: Si está abierto el modal de alta/edición. / EN: Whether the add/edit modal is open.
const modalAbierto = ref(false);
// ES: Id de la deuda en edición (null = estamos creando una nueva).
// EN: Id of the debt being edited (null = creating a new one).
const editandoId = ref<string | null>(null);

// ── 4. Formulario y estado derivado / Form & derived state ────────────────────
// ES: Tipo del formulario: los mismos campos que Deuda salvo el id.
// EN: Form type: same fields as Deuda except the id.
type FormDeuda = Omit<Deuda, "id">;

// ES: Datos del formulario (reactivos). Se rellenan al abrir el modal.
// EN: Reactive form data. Filled in when the modal opens.
const form = reactive<FormDeuda>({
  concepto: "",
  tipo: "tarjeta",
  total: 0,
  cuotaMensual: 0,
  pagadoInicial: 0,
  inicioMes: mesActual(),
  diaPago: undefined, // ES: día de cobro opcional (1-31) / EN: optional charge day (1-31)
});

// ES: Mensaje de error de validación (vacío = sin error).
// EN: Validation error message (empty = no error).
const error = ref("");

// ES: Título del modal según estemos creando o editando.
// EN: Modal title depending on whether we are creating or editing.
const tituloModal = computed(() =>
  editandoId.value ? t("modalEditar") : t("modalNueva")
);

// ── 5. Ayudante de metadatos del tipo / Type metadata helper ──────────────────
// ES: Devuelve los metadatos (etiqueta + icono) de un tipo de deuda.
// EN: Returns the metadata (label + icon) of a debt type.
function metaTipo(tipo: TipoDeuda) {
  // ES: Si no se encuentra (no debería), se usa el último tipo "otro" como respaldo.
  // EN: If not found (shouldn't happen), falls back to the last type "otro".
  return TIPOS_DEUDA.find((t) => t.valor === tipo) ?? TIPOS_DEUDA[TIPOS_DEUDA.length - 1];
}

// ── 6. Abrir/cerrar modal / Open/close modal ──────────────────────────────────
// ES: Abre el modal en modo "nueva deuda" con valores por defecto.
// EN: Opens the modal in "new debt" mode with default values.
function abrirNueva() {
  editandoId.value = null;
  error.value = "";
  form.concepto = "";
  form.tipo = "tarjeta";
  form.total = 0;
  form.cuotaMensual = 0;
  form.pagadoInicial = 0;
  form.inicioMes = mesActual(); // ES: mes actual por defecto / EN: current month by default
  form.diaPago = undefined; // ES: sin día de cobro por defecto / EN: no charge day by default
  modalAbierto.value = true;
}

// ES: Abre el modal en modo "editar" precargando los datos de la deuda.
// EN: Opens the modal in "edit" mode preloading the debt data.
function abrirEditar(deuda: Deuda) {
  editandoId.value = deuda.id;
  error.value = "";
  form.concepto = deuda.concepto;
  form.tipo = deuda.tipo;
  form.total = deuda.total;
  form.cuotaMensual = deuda.cuotaMensual;
  form.pagadoInicial = deuda.pagadoInicial;
  form.inicioMes = deuda.inicioMes;
  form.diaPago = deuda.diaPago; // ES: precarga el día de cobro (puede ser undefined) / EN: preloads the charge day (may be undefined)
  modalAbierto.value = true;
}

// ES: Cierra el modal sin guardar. / EN: Closes the modal without saving.
function cerrarModal() {
  modalAbierto.value = false;
}

// ── 7. Validar y guardar / Validate & save ────────────────────────────────────
// ES: Valida y guarda: crea o actualiza la deuda según el modo.
// EN: Validates and saves: creates or updates the debt depending on the mode.
function guardar() {
  // ES: Redondeo a céntimos y saneo (evita NaN/negativos que contaminarían los KPIs).
  // EN: Round to cents and sanitize (avoids NaN/negatives polluting the KPIs).
  const r2 = (n: number) => Math.round((Number(n) || 0) * 100) / 100;
  const total = r2(form.total);
  const cuota = r2(form.cuotaMensual);
  const pagado = r2(form.pagadoInicial);

  if (!form.concepto.trim()) { error.value = t("errConcepto"); return; }
  if (total <= 0) { error.value = t("errTotal"); return; }
  if (cuota <= 0) { error.value = t("errCuota"); return; }
  if (pagado < 0) { error.value = t("errPagadoNeg"); return; }
  if (pagado > total) { error.value = t("errPagadoTotal"); return; }
  if (!/^\d{4}-\d{2}$/.test(form.inicioMes)) { error.value = t("errMes"); return; }

  // ES: Día de cobro: se acepta entero 1-31; si está vacío/0/fuera de rango => undefined.
  // EN: Charge day: an integer 1-31 is accepted; if empty/0/out of range => undefined.
  const diaNum = Math.trunc(Number(form.diaPago) || 0);
  const diaPago = diaNum >= 1 && diaNum <= 31 ? diaNum : undefined;

  // ES: Objeto saneado a partir del formulario.
  // EN: Sanitized object built from the form.
  const datos: FormDeuda = {
    concepto: form.concepto.trim(),
    tipo: form.tipo,
    total,
    cuotaMensual: cuota,
    pagadoInicial: pagado,
    inicioMes: form.inicioMes,
    diaPago, // ES: día de cobro opcional (undefined si no se indicó) / EN: optional charge day (undefined if not given)
  };

  // ES: Editar existente o crear nueva.
  // EN: Edit existing or create new.
  if (editandoId.value) {
    finanzas.actualizarDeuda(editandoId.value, datos);
  } else {
    finanzas.addDeuda(datos);
  }

  cerrarModal();
}

// ── 8. Eliminar deuda / Delete debt ───────────────────────────────────────────
// ES: Elimina una deuda tras confirmación del navegador.
// EN: Deletes a debt after a browser confirmation.
function borrar(deuda: Deuda) {
  if (confirm(`${t("confirmBorrarPre")}${deuda.concepto}${t("confirmBorrarPost")}`)) {
    finanzas.eliminarDeuda(deuda.id);
  }
}
</script>

<template>
  <!-- ES: Contenedor de la vista / EN: View container -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- ES: 1. Cabecera: título + botón de alta / EN: 1. Header: title + add button -->
    <header class="mb-6 flex items-center justify-between">
      <h1 class="font-display text-2xl font-bold">{{ t("titulo") }}</h1>
      <button
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        {{ t("nuevaDeuda") }}
      </button>
    </header>

    <!-- ES: 2. Estado vacío: no hay deudas registradas / EN: 2. Empty state: no debts registered -->
    <div
      v-if="finanzas.estadosDeuda.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">🎉</p>
      <p class="mt-3 font-display font-bold text-ink">{{ t("vacioTitulo") }}</p>
      <p class="mt-1 text-sm text-muted">
        {{ t("vacioSub") }}
      </p>
      <button
        class="mt-5 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        {{ t("vacioBoton") }}
      </button>
    </div>

    <!-- ES: 3. Listado de deudas: una tarjeta por estado de deuda / EN: 3. Debt list: one card per debt state -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="estado in finanzas.estadosDeuda"
        :key="estado.deuda.id"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- ES: Cabecera de la tarjeta: icono + concepto + tipo + acciones / EN: Card header: icon + concept + type + actions -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <!-- ES: Icono del tipo de deuda / EN: Debt type icon -->
            <span class="text-2xl shrink-0">{{ metaTipo(estado.deuda.tipo).icono }}</span>
            <div class="min-w-0">
              <h2 class="font-display font-bold leading-tight truncate">
                {{ estado.deuda.concepto }}
              </h2>
              <p class="text-xs text-muted truncate">{{ metaTipo(estado.deuda.tipo).etiqueta }}</p>
            </div>
          </div>
          <!-- ES: Botones de editar y eliminar / EN: Edit and delete buttons -->
          <div class="flex gap-1">
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-ink hover:border-brand"
              :title="t('editar')"
              :aria-label="t('editarAria')"
              @click="abrirEditar(estado.deuda)"
            >
              ✏️
            </button>
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
              :title="t('eliminar')"
              :aria-label="t('eliminarAria')"
              @click="borrar(estado.deuda)"
            >
              🗑️
            </button>
          </div>
        </div>

        <!-- ES: Barra de progreso de pago / EN: Payment progress bar -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- ES: Relleno proporcional al progreso (0..100) / EN: Fill proportional to progress (0..100) -->
            <div
              class="h-full rounded-full bg-brand transition-all"
              :style="{ width: estado.progreso + '%' }"
            ></div>
          </div>
          <!-- ES: Texto: pagado X de Y (progreso%) / EN: Text: paid X of Y (progress%) -->
          <p class="mt-2 text-xs text-muted">
            {{ t("pagadoDe") }} {{ euro(estado.pagado) }} {{ t("de") }} {{ euro(estado.deuda.total) }}
            ({{ Math.round(estado.progreso) }}%)
          </p>
        </div>

        <!-- ES: Detalle: pendiente, cuota y estado/meses restantes / EN: Detail: pending, payment and status/remaining months -->
        <div class="mt-4 flex items-end justify-between gap-3">
          <div class="space-y-1 text-sm">
            <!-- ES: Pendiente (rojo si queda algo por pagar) / EN: Pending (red if something is left to pay) -->
            <p>
              <span class="text-muted">{{ t("pendiente") }} </span>
              <span :class="estado.pendiente > 0 ? 'text-danger font-medium' : 'text-ok font-medium'">
                {{ euro(estado.pendiente) }}
              </span>
            </p>
            <!-- ES: Cuota mensual / EN: Monthly payment -->
            <p>
              <span class="text-muted">{{ t("cuotaMensual") }} </span>
              <span class="text-ink">{{ euro(estado.deuda.cuotaMensual) }}</span>
            </p>
          </div>

          <!-- ES: Badge de estado: pagada o meses restantes / EN: Status badge: paid off or remaining months -->
          <div>
            <span
              v-if="estado.terminada"
              class="rounded-lg bg-surface-2 border border-border px-3 py-1 text-sm font-medium text-ok"
            >
              {{ t("pagada") }}
            </span>
            <span v-else class="text-sm text-muted">
              {{ t("teQuedan") }}
              <span class="font-medium text-warn">{{ estado.mesesRestantes }}</span>
              {{ estado.mesesRestantes === 1 ? t("mes") : t("meses") }}
            </span>
          </div>
        </div>
      </article>
    </div>

    <!-- ES: 4. Modal de alta/edición (inline con v-if) / EN: 4. Add/edit modal (inline with v-if) -->
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
          <!-- ES: Concepto / EN: Concept -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("labelConcepto") }}</label>
            <input
              v-model="form.concepto"
              type="text"
              :placeholder="t('phConcepto')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- ES: Tipo de deuda / EN: Debt type -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("labelTipo") }}</label>
            <select
              v-model="form.tipo"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            >
              <option v-for="t in TIPOS_DEUDA" :key="t.valor" :value="t.valor">
                {{ t.icono }} {{ t.etiqueta }}
              </option>
            </select>
          </div>

          <!-- ES: Total y cuota mensual en dos columnas / EN: Total and monthly payment in two columns -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm text-muted">{{ t("labelTotal") }}</label>
              <input
                v-model.number="form.total"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm text-muted">{{ t("labelCuotaMensual") }}</label>
              <input
                v-model.number="form.cuotaMensual"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
          </div>

          <!-- ES: Ya pagado y mes de inicio en dos columnas / EN: Already paid and start month in two columns -->
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="mb-1 block text-sm text-muted">{{ t("labelYaPagado") }}</label>
              <input
                v-model.number="form.pagadoInicial"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm text-muted">{{ t("labelMesInicio") }}</label>
              <input
                v-model="form.inicioMes"
                type="month"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
          </div>

          <!-- ES: Día de cobro (opcional): día del mes en que se cobra la cuota (1-31) -->
          <!-- EN: Charge day (optional): day of the month the payment is charged (1-31) -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("labelDiaCobro") }}</label>
            <input
              v-model.number="form.diaPago"
              type="number"
              min="1"
              max="31"
              step="1"
              :placeholder="t('phOpcional')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
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
  </div>
</template>
