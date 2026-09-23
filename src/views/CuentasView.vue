<script setup lang="ts">
/* =============================================================================
 * CuentasView.vue — Vista de Cuentas (monederos y patrimonio) / Accounts view (wallets & net worth)
 * -----------------------------------------------------------------------------
 * ES: Muestra el patrimonio total y una tarjeta por cuenta con su saldo actual
 *     (calculado por el store) y su saldo inicial. Permite dar de alta, editar y
 *     eliminar cuentas mediante un modal inline, igual que la vista de Deudas.
 * EN: Shows total net worth and one card per account with its current balance
 *     (computed by the store) and its initial balance. Lets you create, edit and
 *     delete accounts through an inline modal, just like the Debts view.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y store / Imports & store
 *   2. Traducciones (i18n) / Translations (i18n)
 *   3. Estado del modal / Modal state
 *   4. Formulario y título del modal / Form & modal title
 *   5. Abrir/cerrar modal / Open/close modal
 *   6. Guardar (crear/actualizar) / Save (create/update)
 *   7. Eliminar cuenta / Delete account
 * ===========================================================================*/

// ── 1. Importaciones y store / Imports & store ───────────────────────────────
import { ref, reactive, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro } from "../utils/format";
import type { Cuenta } from "../types";
import { crearT } from "../i18n";

// ES: Store central de finanzas (ya inicializado en la app).
// EN: Central finances store (already initialized in the app).
const finanzas = useFinanzas();

// ── 2. Traducciones (i18n) / Translations (i18n) ─────────────────────────────
// ES: Función de traducción (ES/EN) con todos los textos visibles de la vista.
// EN: Translation function (ES/EN) holding every visible text of the view.
const t = crearT({
  // ES: Cabecera y botón de alta / EN: Header & create button
  titulo: { es: "Cuentas", en: "Accounts" },
  subtitulo: { es: "Tus monederos y su saldo", en: "Your wallets and their balance" },
  nuevaCuenta: { es: "+ Nueva cuenta", en: "+ New account" },
  // ES: KPI patrimonio total / EN: Total net worth KPI
  patrimonioTotal: { es: "Patrimonio total", en: "Total net worth" },
  sumaCuentas: { es: "Suma de todas tus cuentas", en: "Sum of all your accounts" },
  // ES: Estado vacío / EN: Empty state
  vacioTitulo: { es: "Todavía no tienes cuentas", en: "You don't have any accounts yet" },
  vacioSub: {
    es: "Las cuentas son tus monederos (efectivo, banco, tarjeta…) y sirven para llevar el control de tu patrimonio. Los movimientos se asignan a una cuenta desde el formulario de movimiento.",
    en: "Accounts are your wallets (cash, bank, card…) and help you keep track of your net worth. Transactions are assigned to an account from the transaction form.",
  },
  vacioBoton: { es: "+ Añadir mi primera cuenta", en: "+ Add my first account" },
  // ES: Tarjeta de cuenta / EN: Account card
  editar: { es: "Editar", en: "Edit" },
  editarAria: { es: "Editar cuenta", en: "Edit account" },
  eliminar: { es: "Eliminar", en: "Delete" },
  eliminarAria: { es: "Eliminar cuenta", en: "Delete account" },
  saldoInicialRef: { es: "Saldo inicial:", en: "Initial balance:" },
  // ES: Modal de alta/edición / EN: Create/edit modal
  modalEditar: { es: "Editar cuenta", en: "Edit account" },
  modalNueva: { es: "Nueva cuenta", en: "New account" },
  labelNombre: { es: "Nombre", en: "Name" },
  phNombre: { es: "Ej: Cuenta nómina", en: "E.g.: Salary account" },
  labelSaldoInicial: { es: "Saldo inicial (€)", en: "Initial balance (€)" },
  phSaldo: { es: "0,00", en: "0.00" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  guardar: { es: "Guardar", en: "Save" },
  // ES: Mensajes de validación y confirmación / EN: Validation & confirmation messages
  errNombre: { es: "El nombre no puede estar vacío.", en: "The name cannot be empty." },
  confirmEliminar: { es: "¿Eliminar la cuenta", en: "Delete account" },
});

// ── 3. Estado del modal de alta/edición / Modal state ────────────────────────
// ES: Si el modal está abierto.
// EN: Whether the modal is open.
const modalAbierto = ref(false);
// ES: Id de la cuenta en edición (null = estamos creando una nueva).
// EN: Id of the account being edited (null = we are creating a new one).
const editandoId = ref<string | null>(null);
// ES: Mensaje de error de validación (vacío = sin error).
// EN: Validation error message (empty = no error).
const error = ref("");

// ── 4. Formulario y título del modal / Form & modal title ────────────────────
// ES: Tipo del formulario: los mismos campos que Cuenta salvo el id.
// EN: Form type: the same fields as Cuenta except the id.
type FormCuenta = Omit<Cuenta, "id">;

// ES: Datos del formulario (reactivos). Se rellenan al abrir el modal.
// EN: Form data (reactive). Filled in when the modal opens.
const form = reactive<FormCuenta>({
  nombre: "",
  saldoInicial: 0,
});

// ES: Título del modal según estemos creando o editando.
// EN: Modal title depending on whether we are creating or editing.
const tituloModal = computed(() =>
  editandoId.value ? t("modalEditar") : t("modalNueva")
);

// ── 5. Abrir/cerrar modal / Open/close modal ─────────────────────────────────
// ES: Abre el modal en modo "nueva cuenta" con valores por defecto.
// EN: Opens the modal in "new account" mode with default values.
function abrirNueva() {
  editandoId.value = null;
  error.value = "";
  form.nombre = "";
  form.saldoInicial = 0;
  modalAbierto.value = true;
}

// ES: Abre el modal en modo "editar" precargando los datos de la cuenta.
// EN: Opens the modal in "edit" mode, preloading the account data.
function abrirEditar(cuenta: Cuenta) {
  editandoId.value = cuenta.id;
  error.value = "";
  form.nombre = cuenta.nombre;
  form.saldoInicial = cuenta.saldoInicial;
  modalAbierto.value = true;
}

// ES: Cierra el modal sin guardar.
// EN: Closes the modal without saving.
function cerrarModal() {
  modalAbierto.value = false;
}

// ── 6. Guardar (crear/actualizar) / Save (create/update) ─────────────────────
// ES: Valida y guarda: crea o actualiza la cuenta según el modo.
// EN: Validates and saves: creates or updates the account depending on the mode.
function guardar() {
  // ES: Redondeo a céntimos: acepta coma decimal (Intl/teclado ES) y sanea NaN.
  //     Number(form.saldoInicial) cubre el caso en que el input devuelva string.
  // EN: Round to cents: accepts a decimal comma (Intl/ES keyboard) and sanitizes
  //     NaN. Number(form.saldoInicial) covers the case where the input returns a string.
  const bruto = String(form.saldoInicial).trim().replace(",", ".");
  const saldoInicial = Math.round((Number(bruto) || 0) * 100) / 100;

  // ES: Validación: el nombre no puede estar vacío.
  // EN: Validation: the name cannot be empty.
  if (!form.nombre.trim()) {
    error.value = t("errNombre");
    return;
  }

  // ES: Objeto saneado a partir del formulario.
  // EN: Sanitized object built from the form.
  const datos: FormCuenta = {
    nombre: form.nombre.trim(),
    saldoInicial,
  };

  // ES: Editar existente o crear nueva.
  // EN: Edit the existing one or create a new one.
  if (editandoId.value) {
    finanzas.actualizarCuenta(editandoId.value, datos);
  } else {
    finanzas.addCuenta(datos);
  }

  cerrarModal();
}

// ── 7. Eliminar cuenta / Delete account ──────────────────────────────────────
// ES: Elimina una cuenta tras confirmación del navegador.
// EN: Deletes an account after a browser confirmation.
function borrar(cuenta: Cuenta) {
  // ES: Confirmación bilingüe: el nombre de la cuenta es dato del usuario y no se traduce.
  // EN: Bilingual confirmation: the account name is user data and is not translated.
  if (confirm(`${t("confirmEliminar")} "${cuenta.nombre}"?`)) {
    finanzas.eliminarCuenta(cuenta.id);
  }
}
</script>

<template>
  <!-- ES: Contenedor de la vista / EN: View container -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- ES: 1. Cabecera: título + subtítulo + botón de alta -->
    <!-- EN: 1. Header: title + subtitle + create button -->
    <header class="mb-6 flex items-start justify-between gap-3">
      <div>
        <h1 class="font-display text-2xl font-bold">{{ t("titulo") }}</h1>
        <p class="mt-1 text-sm text-muted">{{ t("subtitulo") }}</p>
      </div>
      <button
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        @click="abrirNueva"
      >
        {{ t("nuevaCuenta") }}
      </button>
    </header>

    <!-- ES: 2. KPI grande: patrimonio total (suma de todas las cuentas) -->
    <!-- EN: 2. Big KPI: total net worth (sum of all accounts) -->
    <section class="mb-6 rounded-2xl bg-surface border border-border p-5">
      <p class="text-sm text-muted">{{ t("patrimonioTotal") }}</p>
      <p
        class="mt-1 font-display text-4xl font-bold"
        :class="finanzas.patrimonioTotal >= 0 ? 'text-ok' : 'text-danger'"
      >
        {{ euro(finanzas.patrimonioTotal) }}
      </p>
      <p class="mt-1 text-xs text-faint">{{ t("sumaCuentas") }}</p>
    </section>

    <!-- ES: 3. Estado vacío: aún no hay cuentas -->
    <!-- EN: 3. Empty state: no accounts yet -->
    <div
      v-if="finanzas.patrimonio.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">👛</p>
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

    <!-- ES: 4. Listado de cuentas: una tarjeta por elemento del patrimonio -->
    <!-- EN: 4. Account list: one card per net-worth item -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="item in finanzas.patrimonio"
        :key="item.cuenta.id"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- ES: Cabecera de la tarjeta: nombre + acciones / EN: Card header: name + actions -->
        <div class="flex items-start justify-between gap-3">
          <h2 class="font-display font-bold leading-tight truncate min-w-0">
            {{ item.cuenta.nombre }}
          </h2>
          <!-- ES: Botones de editar y eliminar / EN: Edit and delete buttons -->
          <div class="flex shrink-0 gap-1">
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-ink hover:border-brand"
              :title="t('editar')"
              :aria-label="t('editarAria')"
              @click="abrirEditar(item.cuenta)"
            >
              ✏️
            </button>
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
              :title="t('eliminar')"
              :aria-label="t('eliminarAria')"
              @click="borrar(item.cuenta)"
            >
              🗑️
            </button>
          </div>
        </div>

        <!-- ES: Saldo actual (verde si >=0, rojo si negativo) -->
        <!-- EN: Current balance (green if >=0, red if negative) -->
        <p
          class="mt-4 font-display text-2xl font-bold"
          :class="item.saldo >= 0 ? 'text-ok' : 'text-danger'"
        >
          {{ euro(item.saldo) }}
        </p>
        <!-- ES: Saldo inicial en pequeño como referencia -->
        <!-- EN: Initial balance shown small as a reference -->
        <p class="mt-1 text-xs text-faint">
          {{ t("saldoInicialRef") }} {{ euro(item.cuenta.saldoInicial) }}
        </p>
      </article>
    </div>

    <!-- ES: 5. Modal de alta/edición (inline con v-if) -->
    <!-- EN: 5. Create/edit modal (inline with v-if) -->
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
          <!-- ES: Nombre de la cuenta / EN: Account name -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("labelNombre") }}</label>
            <input
              v-model="form.nombre"
              type="text"
              :placeholder="t('phNombre')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- ES: Saldo inicial (acepta coma decimal; se redondea a céntimos al guardar) -->
          <!-- EN: Initial balance (accepts a decimal comma; rounded to cents on save) -->
          <div>
            <label class="mb-1 block text-sm text-muted">{{ t("labelSaldoInicial") }}</label>
            <input
              v-model="form.saldoInicial"
              type="text"
              inputmode="decimal"
              :placeholder="t('phSaldo')"
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
