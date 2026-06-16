<script setup lang="ts">
/* ===========================================================================
   Vista de Deudas.
   Lista las deudas evaluadas al mes seleccionado (estadosDeuda del store) con
   barra de progreso, pendiente, cuota y meses restantes. Permite dar de alta,
   editar y eliminar deudas mediante un modal inline.
   =========================================================================== */
import { ref, reactive, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { TIPOS_DEUDA, type Deuda, type TipoDeuda } from "../types";
import { euro, mesActual } from "../utils/format";
import { crearT } from "../i18n";

// Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// Función de traducción (ES/EN) con todos los textos visibles de la vista.
const t = crearT({
  // Cabecera y botones de alta
  titulo: { es: "Deudas", en: "Debts" },
  nuevaDeuda: { es: "+ Nueva deuda", en: "+ New debt" },
  // Estado vacío
  vacioTitulo: { es: "No tienes deudas registradas", en: "You have no debts registered" },
  vacioSub: {
    es: "Cuando añadas una deuda aparecerá aquí su progreso mes a mes.",
    en: "When you add a debt, its month-by-month progress will appear here.",
  },
  vacioBoton: { es: "+ Añadir mi primera deuda", en: "+ Add my first debt" },
  // Tarjeta de deuda
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
  // Modal de alta/edición
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
  // Mensajes de validación
  errConcepto: { es: "El concepto no puede estar vacío.", en: "The concept cannot be empty." },
  errTotal: { es: "El total debe ser mayor que 0.", en: "The total must be greater than 0." },
  errCuota: { es: "La cuota mensual debe ser mayor que 0.", en: "The monthly payment must be greater than 0." },
  errPagadoNeg: { es: "Lo ya pagado no puede ser negativo.", en: "The amount already paid cannot be negative." },
  errPagadoTotal: { es: "Lo ya pagado no puede superar el total.", en: "The amount already paid cannot exceed the total." },
  errMes: { es: "Indica un mes de inicio válido.", en: "Enter a valid start month." },
  // Confirmación de borrado (con interpolación del concepto)
  confirmBorrarPre: { es: '¿Eliminar la deuda "', en: 'Delete the debt "' },
  confirmBorrarPost: { es: '"?', en: '"?' },
});

// --- Estado del modal de alta/edición ---
// Si está abierto el modal.
const modalAbierto = ref(false);
// Id de la deuda en edición (null = estamos creando una nueva).
const editandoId = ref<string | null>(null);

// Tipo del formulario: los mismos campos que Deuda salvo el id.
type FormDeuda = Omit<Deuda, "id">;

// Datos del formulario (reactivos). Se rellenan al abrir el modal.
const form = reactive<FormDeuda>({
  concepto: "",
  tipo: "tarjeta",
  total: 0,
  cuotaMensual: 0,
  pagadoInicial: 0,
  inicioMes: mesActual(),
  diaPago: undefined, // día de cobro opcional (1-31)
});

// Mensaje de error de validación (vacío = sin error).
const error = ref("");

// Título del modal según estemos creando o editando.
const tituloModal = computed(() =>
  editandoId.value ? t("modalEditar") : t("modalNueva")
);

// Devuelve los metadatos (etiqueta + icono) de un tipo de deuda.
function metaTipo(tipo: TipoDeuda) {
  // Si no se encuentra (no debería), se usa el último tipo "otro" como respaldo.
  return TIPOS_DEUDA.find((t) => t.valor === tipo) ?? TIPOS_DEUDA[TIPOS_DEUDA.length - 1];
}

// Abre el modal en modo "nueva deuda" con valores por defecto.
function abrirNueva() {
  editandoId.value = null;
  error.value = "";
  form.concepto = "";
  form.tipo = "tarjeta";
  form.total = 0;
  form.cuotaMensual = 0;
  form.pagadoInicial = 0;
  form.inicioMes = mesActual(); // mes actual por defecto
  form.diaPago = undefined; // sin día de cobro por defecto
  modalAbierto.value = true;
}

// Abre el modal en modo "editar" precargando los datos de la deuda.
function abrirEditar(deuda: Deuda) {
  editandoId.value = deuda.id;
  error.value = "";
  form.concepto = deuda.concepto;
  form.tipo = deuda.tipo;
  form.total = deuda.total;
  form.cuotaMensual = deuda.cuotaMensual;
  form.pagadoInicial = deuda.pagadoInicial;
  form.inicioMes = deuda.inicioMes;
  form.diaPago = deuda.diaPago; // precarga el día de cobro (puede ser undefined)
  modalAbierto.value = true;
}

// Cierra el modal sin guardar.
function cerrarModal() {
  modalAbierto.value = false;
}

// Valida y guarda: crea o actualiza la deuda según el modo.
function guardar() {
  // Redondeo a céntimos y saneo (evita NaN/negativos que contaminarían los KPIs).
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

  // Día de cobro: se acepta entero 1-31; si está vacío/0/fuera de rango => undefined.
  const diaNum = Math.trunc(Number(form.diaPago) || 0);
  const diaPago = diaNum >= 1 && diaNum <= 31 ? diaNum : undefined;

  // Objeto saneado a partir del formulario.
  const datos: FormDeuda = {
    concepto: form.concepto.trim(),
    tipo: form.tipo,
    total,
    cuotaMensual: cuota,
    pagadoInicial: pagado,
    inicioMes: form.inicioMes,
    diaPago, // día de cobro opcional (undefined si no se indicó)
  };

  // Editar existente o crear nueva.
  if (editandoId.value) {
    finanzas.actualizarDeuda(editandoId.value, datos);
  } else {
    finanzas.addDeuda(datos);
  }

  cerrarModal();
}

// Elimina una deuda tras confirmación del navegador.
function borrar(deuda: Deuda) {
  if (confirm(`${t("confirmBorrarPre")}${deuda.concepto}${t("confirmBorrarPost")}`)) {
    finanzas.eliminarDeuda(deuda.id);
  }
}
</script>

<template>
  <!-- Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- 1. Cabecera: título + botón de alta -->
    <header class="mb-6 flex items-center justify-between">
      <h1 class="font-display text-2xl font-bold">{{ t("titulo") }}</h1>
      <button
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        {{ t("nuevaDeuda") }}
      </button>
    </header>

    <!-- 2. Estado vacío: no hay deudas registradas -->
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

    <!-- 3. Listado de deudas: una tarjeta por estado de deuda -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="estado in finanzas.estadosDeuda"
        :key="estado.deuda.id"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- Cabecera de la tarjeta: icono + concepto + tipo + acciones -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-3 min-w-0">
            <!-- Icono del tipo de deuda -->
            <span class="text-2xl shrink-0">{{ metaTipo(estado.deuda.tipo).icono }}</span>
            <div class="min-w-0">
              <h2 class="font-display font-bold leading-tight truncate">
                {{ estado.deuda.concepto }}
              </h2>
              <p class="text-xs text-muted truncate">{{ metaTipo(estado.deuda.tipo).etiqueta }}</p>
            </div>
          </div>
          <!-- Botones de editar y eliminar -->
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

        <!-- Barra de progreso de pago -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- Relleno proporcional al progreso (0..100) -->
            <div
              class="h-full rounded-full bg-brand transition-all"
              :style="{ width: estado.progreso + '%' }"
            ></div>
          </div>
          <!-- Texto: pagado X de Y (progreso%) -->
          <p class="mt-2 text-xs text-muted">
            {{ t("pagadoDe") }} {{ euro(estado.pagado) }} {{ t("de") }} {{ euro(estado.deuda.total) }}
            ({{ Math.round(estado.progreso) }}%)
          </p>
        </div>

        <!-- Detalle: pendiente, cuota y estado/meses restantes -->
        <div class="mt-4 flex items-end justify-between gap-3">
          <div class="space-y-1 text-sm">
            <!-- Pendiente (rojo si queda algo por pagar) -->
            <p>
              <span class="text-muted">{{ t("pendiente") }} </span>
              <span :class="estado.pendiente > 0 ? 'text-danger font-medium' : 'text-ok font-medium'">
                {{ euro(estado.pendiente) }}
              </span>
            </p>
            <!-- Cuota mensual -->
            <p>
              <span class="text-muted">{{ t("cuotaMensual") }} </span>
              <span class="text-ink">{{ euro(estado.deuda.cuotaMensual) }}</span>
            </p>
          </div>

          <!-- Badge de estado: pagada o meses restantes -->
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
          <!-- Concepto -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("labelConcepto") }}</label>
            <input
              v-model="form.concepto"
              type="text"
              :placeholder="t('phConcepto')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- Tipo de deuda -->
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

          <!-- Total y cuota mensual en dos columnas -->
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

          <!-- Ya pagado y mes de inicio en dos columnas -->
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

          <!-- Día de cobro (opcional): día del mes en que se cobra la cuota (1-31) -->
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
  </div>
</template>
