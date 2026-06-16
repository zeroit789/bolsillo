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

// Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

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
});

// Mensaje de error de validación (vacío = sin error).
const error = ref("");

// Título del modal según estemos creando o editando.
const tituloModal = computed(() =>
  editandoId.value ? "Editar deuda" : "Nueva deuda"
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
  modalAbierto.value = true;
}

// Cierra el modal sin guardar.
function cerrarModal() {
  modalAbierto.value = false;
}

// Valida y guarda: crea o actualiza la deuda según el modo.
function guardar() {
  // Validación básica.
  if (!form.concepto.trim()) {
    error.value = "El concepto no puede estar vacío.";
    return;
  }
  if (form.total <= 0) {
    error.value = "El total debe ser mayor que 0.";
    return;
  }
  if (form.cuotaMensual <= 0) {
    error.value = "La cuota mensual debe ser mayor que 0.";
    return;
  }

  // Objeto saneado a partir del formulario.
  const datos: FormDeuda = {
    concepto: form.concepto.trim(),
    tipo: form.tipo,
    total: form.total,
    cuotaMensual: form.cuotaMensual,
    pagadoInicial: form.pagadoInicial,
    inicioMes: form.inicioMes,
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
  if (confirm(`¿Eliminar la deuda "${deuda.concepto}"?`)) {
    finanzas.eliminarDeuda(deuda.id);
  }
}
</script>

<template>
  <!-- Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- 1. Cabecera: título + botón de alta -->
    <header class="mb-6 flex items-center justify-between">
      <h1 class="font-display text-2xl font-bold">Deudas</h1>
      <button
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        + Nueva deuda
      </button>
    </header>

    <!-- 2. Estado vacío: no hay deudas registradas -->
    <div
      v-if="finanzas.estadosDeuda.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">🎉</p>
      <p class="mt-3 font-display font-bold text-ink">No tienes deudas registradas</p>
      <p class="mt-1 text-sm text-muted">
        Cuando añadas una deuda aparecerá aquí su progreso mes a mes.
      </p>
      <button
        class="mt-5 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        + Añadir mi primera deuda
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
          <div class="flex items-center gap-3">
            <!-- Icono del tipo de deuda -->
            <span class="text-2xl">{{ metaTipo(estado.deuda.tipo).icono }}</span>
            <div>
              <h2 class="font-display font-bold leading-tight">
                {{ estado.deuda.concepto }}
              </h2>
              <p class="text-xs text-muted">{{ metaTipo(estado.deuda.tipo).etiqueta }}</p>
            </div>
          </div>
          <!-- Botones de editar y eliminar -->
          <div class="flex gap-1">
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-ink hover:border-brand"
              title="Editar"
              @click="abrirEditar(estado.deuda)"
            >
              ✏️
            </button>
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
              title="Eliminar"
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
            Pagado {{ euro(estado.pagado) }} de {{ euro(estado.deuda.total) }}
            ({{ Math.round(estado.progreso) }}%)
          </p>
        </div>

        <!-- Detalle: pendiente, cuota y estado/meses restantes -->
        <div class="mt-4 flex items-end justify-between gap-3">
          <div class="space-y-1 text-sm">
            <!-- Pendiente (rojo si queda algo por pagar) -->
            <p>
              <span class="text-muted">Pendiente: </span>
              <span :class="estado.pendiente > 0 ? 'text-danger font-medium' : 'text-ok font-medium'">
                {{ euro(estado.pendiente) }}
              </span>
            </p>
            <!-- Cuota mensual -->
            <p>
              <span class="text-muted">Cuota mensual: </span>
              <span class="text-ink">{{ euro(estado.deuda.cuotaMensual) }}</span>
            </p>
          </div>

          <!-- Badge de estado: pagada o meses restantes -->
          <div>
            <span
              v-if="estado.terminada"
              class="rounded-lg bg-surface-2 border border-border px-3 py-1 text-sm font-medium text-ok"
            >
              ✓ Pagada
            </span>
            <span v-else class="text-sm text-muted">
              Te quedan
              <span class="font-medium text-warn">{{ estado.mesesRestantes }}</span>
              {{ estado.mesesRestantes === 1 ? "mes" : "meses" }}
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
            <label class="mb-1 block text-sm text-muted">Concepto</label>
            <input
              v-model="form.concepto"
              type="text"
              placeholder="Ej: Tarjeta Visa"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- Tipo de deuda -->
          <div>
            <label class="mb-1 block text-sm text-muted">Tipo</label>
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
              <label class="mb-1 block text-sm text-muted">Total (€)</label>
              <input
                v-model.number="form.total"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm text-muted">Cuota mensual (€)</label>
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
              <label class="mb-1 block text-sm text-muted">Ya pagado (€)</label>
              <input
                v-model.number="form.pagadoInicial"
                type="number"
                min="0"
                step="0.01"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label class="mb-1 block text-sm text-muted">Mes de inicio</label>
              <input
                v-model="form.inicioMes"
                type="month"
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
