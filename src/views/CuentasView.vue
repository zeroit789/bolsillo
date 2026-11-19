<script setup lang="ts">
/* =============================================================================
 * CuentasView.vue — Vista de Cuentas (monederos y patrimonio) / Accounts view (wallets & net worth)
 * -----------------------------------------------------------------------------
 * ES: Muestra el patrimonio total y una tarjeta por cuenta con su saldo actual
 *     (calculado por el store) y su saldo inicial. Permite dar de alta, editar y
 *     eliminar cuentas mediante un modal inline, igual que la vista de Deudas.
 *     Desde la v4 también hace transferencias entre cuentas y ajustes de saldo
 *     (conciliar con el banco), que mueven saldos sin ser ingreso ni gasto.
 * EN: Shows total net worth and one card per account with its current balance
 *     (computed by the store) and its initial balance. Lets you create, edit and
 *     delete accounts through an inline modal, just like the Debts view.
 *     Since v4 it also makes transfers between accounts and balance
 *     adjustments (reconciling with the bank), which move balances without
 *     being income or expense.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y store / Imports & store
 *   2. Traducciones (i18n) / Translations (i18n)
 *   3. Estado del modal / Modal state
 *   4. Formulario y título del modal / Form & modal title
 *   5. Abrir/cerrar modal / Open/close modal
 *   6. Guardar (crear/actualizar) / Save (create/update)
 *   7. Eliminar cuenta / Delete account
 *   8. Transferencias entre cuentas / Transfers between accounts
 *   9. Ajustar saldo / Adjust balance
 *  10. Historial entre cuentas / Between-accounts history
 * ===========================================================================*/

// ── 1. Importaciones y store / Imports & store ───────────────────────────────
import { ref, reactive, computed, useId } from "vue";
import { useFocoAtrapado } from "../utils/useFocoAtrapado";
import { useFinanzas } from "../stores/finanzas";
import { euro, fechaLegible, hoyISO } from "../utils/format";
import { MENSAJE_IMPORTE_INVALIDO, MENSAJE_IMPORTE_MAX, analizarImporte } from "../utils/importe";
import type { Cuenta } from "../types";
import { crearT } from "../i18n";

// ES: Store central de finanzas (ya inicializado en la app).
// EN: Central finances store (already initialized in the app).
const finanzas = useFinanzas();

// ── 2. Traducciones (i18n) / Translations (i18n) ─────────────────────────────
// ES: Función de traducción (ES/EN) con todos los textos visibles de la vista.
// EN: Translation function (ES/EN) holding every visible text of the view.
// ES: Prefijo único del componente para enlazar cada <label for> con su control.
// EN: Unique component prefix to link each <label for> to its control.
const uid = useId();
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
  editarAria: { es: "Editar cuenta", en: "Edit account" },
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
  // ES: Saldo inicial por encima del tope o que no es un número (textos
  //     comunes de utils/importe.ts).
  // EN: Initial balance above the cap or not a number (shared texts from
  //     utils/importe.ts).
  errImporteMax: MENSAJE_IMPORTE_MAX,
  errImporteInvalido: MENSAJE_IMPORTE_INVALIDO,
  confirmEliminar: { es: "¿Eliminar la cuenta", en: "Delete account" },
  // ES: Transferencias entre cuentas (v4) / EN: Transfers between accounts (v4)
  transferir: { es: "⇄ Transferir", en: "⇄ Transfer" },
  modalTransfer: { es: "Transferencia entre cuentas", en: "Transfer between accounts" },
  ayudaTransfer: {
    es: "Mueve dinero de una cuenta a otra. No cuenta como ingreso ni como gasto del mes.",
    en: "Moves money from one account to another. It does not count as income or expense of the month.",
  },
  labelOrigen: { es: "Desde", en: "From" },
  labelDestino: { es: "Hacia", en: "To" },
  labelImporte: { es: "Importe (€)", en: "Amount (€)" },
  labelFecha: { es: "Fecha", en: "Date" },
  labelConcepto: { es: "Concepto (opcional)", en: "Description (optional)" },
  errMismaCuenta: {
    es: "Elige dos cuentas distintas.",
    en: "Choose two different accounts.",
  },
  errImportePositivo: {
    es: "El importe debe ser mayor que 0.",
    en: "The amount must be greater than 0.",
  },
  errFecha: { es: "Pon una fecha válida.", en: "Enter a valid date." },
  // ES: Ajuste de saldo (conciliación) / EN: Balance adjustment (reconciliation)
  ajustar: { es: "Ajustar saldo", en: "Adjust balance" },
  ajustarAria: { es: "Ajustar el saldo de", en: "Adjust the balance of" },
  modalAjuste: { es: "Ajustar saldo", en: "Adjust balance" },
  ayudaAjuste: {
    es: "Escribe el saldo que te dice el banco en esa fecha. Bolsillo apunta la diferencia como ajuste (no cuenta como ingreso ni gasto).",
    en: "Enter the balance your bank shows on that date. Bolsillo records the difference as an adjustment (it does not count as income or expense).",
  },
  labelSaldoReal: { es: "Saldo real (€)", en: "Actual balance (€)" },
  labelNota: { es: "Nota (opcional)", en: "Note (optional)" },
  saldoAhora: { es: "Saldo en Bolsillo a esa fecha:", en: "Balance in Bolsillo on that date:" },
  errCuentaConMovimientos: {
    es: "Esta cuenta tiene transferencias o ajustes de saldo. Bórralos antes en «Entre cuentas y ajustes» para que el patrimonio siga cuadrando.",
    en: "This account has transfers or balance adjustments. Delete them first in “Between accounts and adjustments” so net worth still adds up.",
  },
  yaCuadra: {
    es: "El saldo ya cuadra en esa fecha: no hace falta ajuste.",
    en: "The balance already matches on that date: no adjustment needed.",
  },
  // ES: Historial de transferencias y ajustes / EN: Transfers & adjustments history
  historialTitulo: { es: "Entre cuentas y ajustes", en: "Between accounts and adjustments" },
  historialVacio: {
    es: "Aún no hay transferencias ni ajustes.",
    en: "No transfers or adjustments yet.",
  },
  ajuste: { es: "Ajuste", en: "Adjustment" },
  cuentaBorrada: { es: "(cuenta borrada)", en: "(deleted account)" },
  eliminarMovAria: { es: "Eliminar", en: "Delete" },
  confirmEliminarMov: {
    es: "¿Eliminar este movimiento entre cuentas?",
    en: "Delete this movement between accounts?",
  },
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
const tituloModal = computed(() => (editandoId.value ? t("modalEditar") : t("modalNueva")));

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
// ES: Diálogo de alta/edición: foco atrapado, Escape cierra e id del título para aria-labelledby.
// EN: Create/edit dialog: focus trap, Escape closes and title id for aria-labelledby.
const cajaModal = ref<HTMLElement | null>(null);
const idTituloModal = useId();
useFocoAtrapado(cajaModal, { alEscape: cerrarModal });

function cerrarModal() {
  modalAbierto.value = false;
}

// ── 6. Guardar (crear/actualizar) / Save (create/update) ─────────────────────
// ES: Valida y guarda: crea o actualiza la cuenta según el modo.
// EN: Validates and saves: creates or updates the account depending on the mode.
function guardar() {
  // ES: Análisis del saldo (utils/importe.ts): acepta coma decimal (Intl/teclado
  //     ES) y distingue vacío, inválido y fuera del tope ANTES de redondear,
  //     para que "1e307" o "abc" no pisen el saldo con un 0.
  // EN: Balance analysis (utils/importe.ts): accepts a decimal comma (Intl/ES
  //     keyboard) and tells apart empty, invalid and above-cap values BEFORE
  //     rounding, so "1e307" or "abc" never overwrite the balance with a 0.
  const saldo = analizarImporte(form.saldoInicial);

  // ES: Validación: el nombre no puede estar vacío.
  // EN: Validation: the name cannot be empty.
  if (!form.nombre.trim()) {
    error.value = t("errNombre");
    return;
  }

  // ES: El saldo inicial puede ser negativo o 0 (vacío cuenta como 0), pero
  //     tiene que ser un número y no pasar del tope.
  // EN: The initial balance may be negative or 0 (empty counts as 0), but it
  //     must be a number and not exceed the cap.
  if (saldo.tipo === "invalido") {
    error.value = t("errImporteInvalido");
    return;
  }
  if (saldo.tipo === "excede") {
    error.value = t("errImporteMax");
    return;
  }
  const saldoInicial = saldo.valor;

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
//     Si tiene transferencias o ajustes, antes hay que borrarlos: si no,
//     seguirían moviendo la otra cuenta y el patrimonio se descuadraría.
// EN: If it has transfers or adjustments, they must be deleted first:
//     otherwise they would keep moving the other account and net worth would
//     no longer add up.
function borrar(cuenta: Cuenta) {
  if (finanzas.cuentaConMovimientosEntreCuentas(cuenta.id)) {
    alert(t("errCuentaConMovimientos"));
    return;
  }
  // ES: Confirmación bilingüe: el nombre de la cuenta es dato del usuario y no se traduce.
  //     El store vuelve a comprobarlo y avisa si no la borra.
  // EN: Bilingual confirmation: the account name is user data and is not translated.
  //     The store checks again and the view warns if it is not deleted.
  if (confirm(`${t("confirmEliminar")} "${cuenta.nombre}"?`)) {
    if (!finanzas.eliminarCuenta(cuenta.id)) alert(t("errCuentaConMovimientos"));
  }
}

// ── 8. Transferencias entre cuentas / Transfers between accounts ─────────────
// ES: Modal de transferencia: abierto/cerrado, error y formulario.
// EN: Transfer modal: open/closed, error and form.
const modalTransfer = ref(false);
const errorTransfer = ref("");
const formT = reactive({ origen: "", destino: "", importe: "", fecha: hoyISO(), concepto: "" });
const cajaTransfer = ref<HTMLElement | null>(null);
const idTituloTransfer = useId();
useFocoAtrapado(cajaTransfer, { alEscape: () => (modalTransfer.value = false) });

// ES: Abre el modal con la primera cuenta como origen y la segunda como destino.
// EN: Opens the modal with the first account as origin and the second as destination.
function abrirTransferencia() {
  const ids = finanzas.cuentas.map((c) => c.id);
  formT.origen = ids[0] ?? "";
  formT.destino = ids[1] ?? "";
  formT.importe = "";
  formT.fecha = hoyISO();
  formT.concepto = "";
  errorTransfer.value = "";
  modalTransfer.value = true;
}

// ES: Valida y guarda la transferencia (el store vuelve a validar).
// EN: Validates and saves the transfer (the store validates again).
function guardarTransferencia() {
  if (formT.origen === formT.destino) return (errorTransfer.value = t("errMismaCuenta"));
  const a = analizarImporte(formT.importe);
  if (a.tipo === "excede") return (errorTransfer.value = t("errImporteMax"));
  if (a.tipo !== "valido") return (errorTransfer.value = t("errImporteInvalido"));
  if (a.valor <= 0) return (errorTransfer.value = t("errImportePositivo"));
  const ok = finanzas.addTransferencia({
    origen: formT.origen,
    destino: formT.destino,
    importe: a.valor,
    fecha: formT.fecha,
    concepto: formT.concepto,
  });
  if (!ok) return (errorTransfer.value = t("errFecha"));
  modalTransfer.value = false;
}

// ── 9. Ajustar saldo / Adjust balance ────────────────────────────────────────
// ES: Cuenta que se está ajustando (null = modal cerrado), formulario y avisos.
// EN: Account being adjusted (null = modal closed), form and notices.
const ajustando = ref<{ cuenta: Cuenta; saldo: number } | null>(null);
const errorAjuste = ref("");
const formA = reactive({ saldo: "", fecha: hoyISO(), nota: "" });
const cajaAjuste = ref<HTMLElement | null>(null);
const idTituloAjuste = useId();
useFocoAtrapado(cajaAjuste, { alEscape: () => (ajustando.value = null) });

// ES: Saldo en Bolsillo de la cuenta HASTA la fecha del formulario (sin lo
//     posterior): es con lo que el store compara al ajustar.
// EN: The account's balance in Bolsillo UP TO the form's date (without what
//     comes later): it is what the store compares with when adjusting.
const saldoEnFecha = computed(() =>
  ajustando.value ? finanzas.saldoCuentaEn(ajustando.value.cuenta.id, formA.fecha) : null
);

// ES: Abre el ajuste precargando el saldo de hoy (sin apuntes futuros).
// EN: Opens the adjustment preloading today's balance (without future entries).
function abrirAjuste(item: { cuenta: Cuenta; saldo: number }) {
  ajustando.value = item;
  formA.fecha = hoyISO();
  formA.saldo = String(finanzas.saldoCuentaEn(item.cuenta.id, formA.fecha) ?? item.saldo);
  formA.nota = "";
  errorAjuste.value = "";
}

// ES: Guarda el ajuste: el store calcula la diferencia con el saldo hasta esa
//     fecha. Si ya cuadra se avisa y no se guarda nada.
// EN: Saves the adjustment: the store computes the difference with the balance
//     up to that date. If it already matches, it says so and saves nothing.
function guardarAjuste() {
  if (!ajustando.value) return;
  const a = analizarImporte(formA.saldo);
  if (a.tipo === "excede") return (errorAjuste.value = t("errImporteMax"));
  if (a.tipo !== "valido") return (errorAjuste.value = t("errImporteInvalido"));
  const r = finanzas.ajustarSaldo(ajustando.value.cuenta.id, a.valor, formA.fecha, formA.nota);
  if (r === "igual") return (errorAjuste.value = t("yaCuadra"));
  if (r === "invalido") return (errorAjuste.value = t("errFecha"));
  ajustando.value = null;
}

// ── 10. Historial entre cuentas / Between-accounts history ───────────────────
// ES: Nombre de una cuenta por id (o aviso si se borró).
// EN: Account name by id (or a notice if it was deleted).
function nombreCuenta(id: string): string {
  return finanzas.cuentas.find((c) => c.id === id)?.nombre ?? t("cuentaBorrada");
}

// ES: Transferencias y ajustes juntos, del más reciente al más antiguo.
// EN: Transfers and adjustments together, newest first.
const historialCuentas = computed(() =>
  [
    ...finanzas.transferencias.map((x) => ({
      tipo: "transferencia" as const,
      id: x.id,
      fecha: x.fecha,
      texto: `${nombreCuenta(x.origen)} → ${nombreCuenta(x.destino)}${x.concepto ? ` · ${x.concepto}` : ""}`,
      importe: x.importe,
    })),
    ...finanzas.ajustesSaldo.map((x) => ({
      tipo: "ajuste" as const,
      id: x.id,
      fecha: x.fecha,
      texto: `${t("ajuste")} · ${nombreCuenta(x.cuenta)}${x.nota ? ` · ${x.nota}` : ""}`,
      importe: x.importe,
    })),
  ].sort((a, b) => b.fecha.localeCompare(a.fecha))
);

// ES: Elimina una transferencia o un ajuste tras confirmar.
// EN: Deletes a transfer or an adjustment after confirming.
function borrarMovimiento(m: { tipo: "transferencia" | "ajuste"; id: string }) {
  if (!confirm(t("confirmEliminarMov"))) return;
  if (m.tipo === "transferencia") finanzas.eliminarTransferencia(m.id);
  else finanzas.eliminarAjuste(m.id);
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
      <div class="flex shrink-0 flex-wrap justify-end gap-2">
        <!-- ES: Transferir: solo con dos cuentas o más. / EN: Transfer: only with two or more accounts. -->
        <button
          v-if="finanzas.cuentas.length >= 2"
          class="rounded-lg bg-surface-2 border border-border px-4 py-2 text-ink font-medium hover:border-brand"
          @click="abrirTransferencia"
        >
          {{ t("transferir") }}
        </button>
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
          @click="abrirNueva"
        >
          {{ t("nuevaCuenta") }}
        </button>
      </div>
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
              :title="`${t('editarAria')}: ${item.cuenta.nombre}`"
              :aria-label="`${t('editarAria')}: ${item.cuenta.nombre}`"
              @click="abrirEditar(item.cuenta)"
            >
              ✏️
            </button>
            <button
              class="rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
              :title="`${t('eliminarAria')}: ${item.cuenta.nombre}`"
              :aria-label="`${t('eliminarAria')}: ${item.cuenta.nombre}`"
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
        <!-- ES: Conciliar con el banco. / EN: Reconcile with the bank. -->
        <button
          class="mt-3 rounded-lg bg-surface-2 border border-border px-3 py-1 text-sm text-muted hover:text-ink hover:border-brand"
          :aria-label="`${t('ajustarAria')} ${item.cuenta.nombre}`"
          @click="abrirAjuste(item)"
        >
          {{ t("ajustar") }}
        </button>
      </article>
    </div>

    <!-- ES: 4b. Historial de transferencias y ajustes -->
    <!-- EN: 4b. Transfers and adjustments history -->
    <section
      v-if="finanzas.cuentas.length || historialCuentas.length"
      class="mt-6 rounded-2xl bg-surface border border-border p-5"
    >
      <h2 class="font-display font-bold">{{ t("historialTitulo") }}</h2>
      <p v-if="!historialCuentas.length" class="mt-2 text-sm text-muted">
        {{ t("historialVacio") }}
      </p>
      <ul v-else class="mt-3 divide-y divide-border">
        <li
          v-for="m in historialCuentas"
          :key="m.tipo + m.id"
          class="flex items-center justify-between gap-3 py-2 text-sm"
        >
          <div class="min-w-0">
            <p class="truncate text-ink">{{ m.texto }}</p>
            <p class="text-xs text-faint">{{ fechaLegible(m.fecha) }}</p>
          </div>
          <div class="flex shrink-0 items-center gap-2">
            <span
              class="font-medium"
              :class="m.tipo === 'ajuste' && m.importe < 0 ? 'text-danger' : 'text-ink'"
            >
              {{ euro(m.importe) }}
            </span>
            <button
              class="rounded-lg px-2 py-1 text-faint hover:text-danger"
              :aria-label="`${t('eliminarMovAria')}: ${m.texto}`"
              @click="borrarMovimiento(m)"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </li>
      </ul>
    </section>

    <!-- ES: 5. Modal de alta/edición (inline con v-if) -->
    <!-- EN: 5. Create/edit modal (inline with v-if) -->
    <div
      v-if="modalAbierto"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="cerrarModal"
    >
      <!-- ES: Tarjeta del modal / EN: Modal card -->
      <div
        ref="cajaModal"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="idTituloModal"
        class="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border p-5"
      >
        <h3 :id="idTituloModal" class="font-display font-bold text-lg">{{ tituloModal }}</h3>

        <!-- ES: Formulario / EN: Form -->
        <form class="mt-4 space-y-4" @submit.prevent="guardar">
          <!-- ES: Nombre de la cuenta / EN: Account name -->
          <div>
            <label :for="`${uid}-labelNombre`" class="mb-1 block text-sm text-muted">{{
              t("labelNombre")
            }}</label>
            <input
              :id="`${uid}-labelNombre`"
              v-model="form.nombre"
              type="text"
              :placeholder="t('phNombre')"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>

          <!-- ES: Saldo inicial (acepta coma decimal; se redondea a céntimos al guardar) -->
          <!-- EN: Initial balance (accepts a decimal comma; rounded to cents on save) -->
          <div>
            <label :for="`${uid}-labelSaldoInicial`" class="mb-1 block text-sm text-muted">{{
              t("labelSaldoInicial")
            }}</label>
            <input
              :id="`${uid}-labelSaldoInicial`"
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

    <!-- ES: 6. Modal de transferencia / EN: 6. Transfer modal -->
    <div
      v-if="modalTransfer"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="modalTransfer = false"
    >
      <div
        ref="cajaTransfer"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="idTituloTransfer"
        class="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border p-5"
      >
        <h3 :id="idTituloTransfer" class="font-display font-bold text-lg">
          {{ t("modalTransfer") }}
        </h3>
        <p class="mt-1 text-xs text-faint">{{ t("ayudaTransfer") }}</p>
        <form class="mt-4 space-y-3" @submit.prevent="guardarTransferencia">
          <div class="flex gap-3">
            <div class="flex-1">
              <label :for="`${uid}-origen`" class="mb-1 block text-sm text-muted">{{
                t("labelOrigen")
              }}</label>
              <select
                :id="`${uid}-origen`"
                v-model="formT.origen"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              >
                <option v-for="c in finanzas.cuentas" :key="c.id" :value="c.id">
                  {{ c.nombre }}
                </option>
              </select>
            </div>
            <div class="flex-1">
              <label :for="`${uid}-destino`" class="mb-1 block text-sm text-muted">{{
                t("labelDestino")
              }}</label>
              <select
                :id="`${uid}-destino`"
                v-model="formT.destino"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              >
                <option v-for="c in finanzas.cuentas" :key="c.id" :value="c.id">
                  {{ c.nombre }}
                </option>
              </select>
            </div>
          </div>
          <div class="flex gap-3">
            <div class="flex-1">
              <label :for="`${uid}-importeT`" class="mb-1 block text-sm text-muted">{{
                t("labelImporte")
              }}</label>
              <input
                :id="`${uid}-importeT`"
                v-model="formT.importe"
                type="text"
                inputmode="decimal"
                :placeholder="t('phSaldo')"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div class="flex-1">
              <label :for="`${uid}-fechaT`" class="mb-1 block text-sm text-muted">{{
                t("labelFecha")
              }}</label>
              <input
                :id="`${uid}-fechaT`"
                v-model="formT.fecha"
                type="date"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
          </div>
          <div>
            <label :for="`${uid}-conceptoT`" class="mb-1 block text-sm text-muted">{{
              t("labelConcepto")
            }}</label>
            <input
              :id="`${uid}-conceptoT`"
              v-model="formT.concepto"
              type="text"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
          <p v-if="errorTransfer" role="alert" class="text-sm text-danger">{{ errorTransfer }}</p>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-lg bg-surface-2 border border-border px-4 py-2 text-muted font-medium hover:text-ink"
              @click="modalTransfer = false"
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

    <!-- ES: 7. Modal de ajuste de saldo / EN: 7. Balance adjustment modal -->
    <div
      v-if="ajustando"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      @click.self="ajustando = null"
    >
      <div
        ref="cajaAjuste"
        role="dialog"
        aria-modal="true"
        :aria-labelledby="idTituloAjuste"
        class="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl bg-surface border border-border p-5"
      >
        <h3 :id="idTituloAjuste" class="font-display font-bold text-lg">
          {{ t("modalAjuste") }} · {{ ajustando.cuenta.nombre }}
        </h3>
        <p class="mt-1 text-xs text-faint">{{ t("ayudaAjuste") }}</p>
        <p v-if="saldoEnFecha !== null" class="mt-2 text-sm text-muted" aria-live="polite">
          {{ t("saldoAhora") }} {{ euro(saldoEnFecha) }}
        </p>
        <form class="mt-4 space-y-3" @submit.prevent="guardarAjuste">
          <div class="flex gap-3">
            <div class="flex-1">
              <label :for="`${uid}-saldoReal`" class="mb-1 block text-sm text-muted">{{
                t("labelSaldoReal")
              }}</label>
              <input
                :id="`${uid}-saldoReal`"
                v-model="formA.saldo"
                type="text"
                inputmode="decimal"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
            <div class="flex-1">
              <label :for="`${uid}-fechaA`" class="mb-1 block text-sm text-muted">{{
                t("labelFecha")
              }}</label>
              <input
                :id="`${uid}-fechaA`"
                v-model="formA.fecha"
                type="date"
                class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
              />
            </div>
          </div>
          <div>
            <label :for="`${uid}-notaA`" class="mb-1 block text-sm text-muted">{{
              t("labelNota")
            }}</label>
            <input
              :id="`${uid}-notaA`"
              v-model="formA.nota"
              type="text"
              class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
          </div>
          <p v-if="errorAjuste" role="alert" class="text-sm text-danger">{{ errorAjuste }}</p>
          <div class="flex justify-end gap-2 pt-2">
            <button
              type="button"
              class="rounded-lg bg-surface-2 border border-border px-4 py-2 text-muted font-medium hover:text-ink"
              @click="ajustando = null"
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
