<script setup lang="ts">
/* ===========================================================================
   Vista de Cuentas (monederos y patrimonio).
   Muestra el patrimonio total y una tarjeta por cuenta con su saldo actual
   (calculado por el store) y su saldo inicial. Permite dar de alta, editar y
   eliminar cuentas mediante un modal inline, igual que la vista de Deudas.
   =========================================================================== */
import { ref, reactive, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro } from "../utils/format";
import type { Cuenta } from "../types";

// Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// --- Estado del modal de alta/edición ---
// Si el modal está abierto.
const modalAbierto = ref(false);
// Id de la cuenta en edición (null = estamos creando una nueva).
const editandoId = ref<string | null>(null);
// Mensaje de error de validación (vacío = sin error).
const error = ref("");

// Tipo del formulario: los mismos campos que Cuenta salvo el id.
type FormCuenta = Omit<Cuenta, "id">;

// Datos del formulario (reactivos). Se rellenan al abrir el modal.
const form = reactive<FormCuenta>({
  nombre: "",
  saldoInicial: 0,
});

// Título del modal según estemos creando o editando.
const tituloModal = computed(() =>
  editandoId.value ? "Editar cuenta" : "Nueva cuenta"
);

// Abre el modal en modo "nueva cuenta" con valores por defecto.
function abrirNueva() {
  editandoId.value = null;
  error.value = "";
  form.nombre = "";
  form.saldoInicial = 0;
  modalAbierto.value = true;
}

// Abre el modal en modo "editar" precargando los datos de la cuenta.
function abrirEditar(cuenta: Cuenta) {
  editandoId.value = cuenta.id;
  error.value = "";
  form.nombre = cuenta.nombre;
  form.saldoInicial = cuenta.saldoInicial;
  modalAbierto.value = true;
}

// Cierra el modal sin guardar.
function cerrarModal() {
  modalAbierto.value = false;
}

// Valida y guarda: crea o actualiza la cuenta según el modo.
function guardar() {
  // Redondeo a céntimos: acepta coma decimal (Intl/teclado ES) y sanea NaN.
  // Number(form.saldoInicial) cubre el caso en que el input devuelva string.
  const bruto = String(form.saldoInicial).trim().replace(",", ".");
  const saldoInicial = Math.round((Number(bruto) || 0) * 100) / 100;

  // Validación: el nombre no puede estar vacío.
  if (!form.nombre.trim()) {
    error.value = "El nombre no puede estar vacío.";
    return;
  }

  // Objeto saneado a partir del formulario.
  const datos: FormCuenta = {
    nombre: form.nombre.trim(),
    saldoInicial,
  };

  // Editar existente o crear nueva.
  if (editandoId.value) {
    finanzas.actualizarCuenta(editandoId.value, datos);
  } else {
    finanzas.addCuenta(datos);
  }

  cerrarModal();
}

// Elimina una cuenta tras confirmación del navegador.
function borrar(cuenta: Cuenta) {
  if (confirm(`¿Eliminar la cuenta "${cuenta.nombre}"?`)) {
    finanzas.eliminarCuenta(cuenta.id);
  }
}
</script>

<template>
  <!-- Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- 1. Cabecera: título + subtítulo + botón de alta -->
    <header class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">Cuentas</h1>
        <p class="mt-1 text-sm text-muted">Tus monederos y su saldo</p>
      </div>
      <button
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        + Nueva cuenta
      </button>
    </header>

    <!-- 2. KPI grande: patrimonio total (suma de todas las cuentas) -->
    <section class="mb-6 rounded-2xl bg-surface border border-border p-5">
      <p class="text-sm text-muted">Patrimonio total</p>
      <p
        class="mt-1 font-display text-4xl font-bold"
        :class="finanzas.patrimonioTotal >= 0 ? 'text-ok' : 'text-danger'"
      >
        {{ euro(finanzas.patrimonioTotal) }}
      </p>
      <p class="mt-1 text-xs text-faint">Suma de todas tus cuentas</p>
    </section>

    <!-- 3. Estado vacío: aún no hay cuentas -->
    <div
      v-if="finanzas.patrimonio.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">👛</p>
      <p class="mt-3 font-display font-bold text-ink">Todavía no tienes cuentas</p>
      <p class="mt-1 text-sm text-muted">
        Las cuentas son tus monederos (efectivo, banco, tarjeta…) y sirven para
        llevar el control de tu patrimonio. Los movimientos se asignan a una
        cuenta desde el formulario de movimiento.
      </p>
      <button
        class="mt-5 rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        + Añadir mi primera cuenta
      </button>
    </div>

    <!-- 4. Listado de cuentas: una tarjeta por elemento del patrimonio -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="item in finanzas.patrimonio"
        :key="item.cuenta.id"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- Cabecera de la tarjeta: nombre + acciones -->
        <div class="flex items-start justify-between gap-3">
          <h2 class="font-display font-bold leading-tight truncate min-w-0">
            {{ item.cuenta.nombre }}
          </h2>
          <!-- Botones de editar y eliminar -->
          <div class="flex shrink-0 gap-1">
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-ink hover:border-brand"
              title="Editar"
              aria-label="Editar cuenta"
              @click="abrirEditar(item.cuenta)"
            >
              ✏️
            </button>
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
              title="Eliminar"
              aria-label="Eliminar cuenta"
              @click="borrar(item.cuenta)"
            >
              🗑️
            </button>
          </div>
        </div>

        <!-- Saldo actual (verde si >=0, rojo si negativo) -->
        <p
          class="mt-4 font-display text-2xl font-bold"
          :class="item.saldo >= 0 ? 'text-ok' : 'text-danger'"
        >
          {{ euro(item.saldo) }}
        </p>
        <!-- Saldo inicial en pequeño como referencia -->
        <p class="mt-1 text-xs text-faint">
          Saldo inicial: {{ euro(item.cuenta.saldoInicial) }}
        </p>
      </article>
    </div>

    <!-- 5. Modal de alta/edición (inline con v-if) -->
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
          <!-- Nombre de la cuenta -->
          <div>
            <label class="mb-1 block text-sm text-muted">Nombre</label>
            <input
              v-model="form.nombre"
              type="text"
              placeholder="Ej: Cuenta nómina"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- Saldo inicial (acepta coma decimal; se redondea a céntimos al guardar) -->
          <div>
            <label class="mb-1 block text-sm text-muted">Saldo inicial (€)</label>
            <input
              v-model="form.saldoInicial"
              type="text"
              inputmode="decimal"
              placeholder="0,00"
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
