<script setup lang="ts">
/* =============================================================================
 * MovimientosView.vue — Movimientos del mes / Monthly transactions
 * -----------------------------------------------------------------------------
 * ES: Lista los apuntes del mes seleccionado (fijos + variables + cuotas de deuda),
 *     permite añadir/editar/eliminar, gestiona plantillas de entrada rápida (atajos
 *     de un clic) y muestra recibos en un lightbox. Todo el texto de UI es bilingüe
 *     vía crearT(); solo se traducen textos fijos, nunca datos del usuario.
 * EN: Lists the selected month's entries (fixed + variable + debt instalments),
 *     lets the user add/edit/delete them, manages quick-entry templates (one-tap
 *     shortcuts) and shows receipts in a lightbox. All UI text is bilingual via
 *     crearT(); only fixed strings are translated, never user data.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y traducciones / Imports & translations
 *   2. Estado (store, modal, edición, filtros) / State (store, modal, editing, filters)
 *   3. Lista filtrada / Filtered list
 *   4. Add / edit modal logic / Lógica del modal de alta y edición
 *   5. Acciones de eliminar y dar de baja / Delete & cancel actions
 *   6. Entrada rápida — plantillas / Quick entry — templates
 * ===========================================================================*/

// ── 1. Imports y traducciones / Imports & translations ────────────────────────
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro, fechaLegible, mesActual } from "../utils/format";
import { categoriasPorGrupo } from "../data/categorias";
import type { LineaMes, Signo, Plantilla, Subdivision } from "../types";
import ModalMovimiento from "../components/ModalMovimiento.vue";
import { crearT } from "../i18n";

// ES: Diccionario de traducciones de esta vista (ES/EN). Claves cortas en camelCase.
// EN: Translation dictionary of this view (ES/EN). Short camelCase keys.
const t = crearT({
  titulo: { es: "Movimientos", en: "Transactions" },
  anadir: { es: "+ Añadir", en: "+ Add" },
  registrarHoy: { es: "Registrar hoy", en: "Log today" },
  eliminarAtajo: { es: "Eliminar atajo", en: "Delete shortcut" },
  masPlantilla: { es: "+ Plantilla", en: "+ Template" },
  ayudaPlantillas: {
    es: "Crea atajos para tus gastos habituales",
    en: "Create shortcuts for your usual expenses",
  },
  nuevoAtajo: { es: "Nuevo atajo", en: "New shortcut" },
  concepto: { es: "Concepto", en: "Description" },
  conceptoPlaceholder: { es: "Café, Gasolina…", en: "Coffee, Fuel…" },
  importe: { es: "Importe (€)", en: "Amount (€)" },
  tipo: { es: "Tipo", en: "Type" },
  gasto: { es: "Gasto", en: "Expense" },
  ingreso: { es: "Ingreso", en: "Income" },
  categoria: { es: "Categoría", en: "Category" },
  eligeCategoria: { es: "Elige categoría…", en: "Choose category…" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  guardar: { es: "Guardar", en: "Save" },
  buscarPlaceholder: {
    es: "Buscar por concepto o categoría…",
    en: "Search by description or category…",
  },
  todos: { es: "Todos", en: "All" },
  ingresos: { es: "Ingresos", en: "Income" },
  gastosFijos: { es: "Gastos fijos", en: "Fixed expenses" },
  gastosVariables: { es: "Gastos variables", en: "Variable expenses" },
  apuntes: { es: "apuntes", en: "entries" },
  sinResultados: { es: "Sin resultados para ese filtro.", en: "No results for that filter." },
  sinMovimientos: {
    es: "No hay movimientos. Pulsa + Añadir.",
    en: "No transactions. Tap + Add.",
  },
  fijo: { es: "Fijo", en: "Fixed" },
  dividido: { es: "Dividido", en: "Split" },
  verRecibo: { es: "Ver recibo", en: "View receipt" },
  editar: { es: "Editar", en: "Edit" },
  darDeBajaTitulo: {
    es: "Dar de baja a partir de este mes",
    en: "Cancel from this month onward",
  },
  eliminar: { es: "Eliminar", en: "Delete" },
  gestionadoDeudas: { es: "Se gestiona en Deudas", en: "Managed in Debts" },
  reciboAlt: { es: "Recibo", en: "Receipt" },
  // ES: Mensajes de confirmación (texto fijo; el concepto se concatena aparte).
  // EN: Confirmation messages (fixed text; the concept is appended separately).
  confirmEliminar: { es: "¿Eliminar", en: "Delete" },
  confirmEliminarAtajo: { es: "¿Eliminar el atajo", en: "Delete shortcut" },
  confirmDarDeBaja: {
    es: "¿Dar de baja este fijo a partir de este mes?",
    en: "Cancel this fixed item from this month onward?",
  },
});

// ── 2. Estado (store, modal, edición, filtros) / State (store, modal, editing, filters) ──
// ES: Store de finanzas (única fuente de verdad) y flag de modal abierto/cerrado.
// EN: Finance store (single source of truth) and modal open/closed flag.
const f = useFinanzas();
const modal = ref(false);
// ES: Línea que se está editando (null = el modal está en modo alta).
// EN: Line currently being edited (null = modal is in "add new" mode).
const editando = ref<LineaMes | null>(null);
// ES: Datos iniciales que se pasan al modal cuando editamos (null = alta limpia).
// EN: Initial data passed to the modal when editing (null = clean add).
const inicial = ref<{
  recurrente: boolean;
  signo: Signo;
  concepto: string;
  importe: number;
  categoria: string;
  fecha: string;
  diaPago?: number;
  comercio?: string; // ES: opcional / EN: optional
  tags?: string[]; // ES: opcional (array; el modal lo convierte a texto) / EN: optional (array; the modal turns it into text)
  recibo?: string; // ES: imagen base64 (solo puntuales); opcional / EN: base64 image (one-off only); optional
  cuenta?: string; // ES: id de cuenta; opcional / EN: account id; optional
  subdivisiones?: Subdivision[]; // ES: gasto dividido (solo puntuales); opcional / EN: split expense (one-off only); optional
} | null>(null);

// ES: Recibo que se muestra en el lightbox (null = lightbox cerrado).
// EN: Receipt shown in the lightbox (null = lightbox closed).
const reciboVisible = ref<string | null>(null);

// ES: Texto del buscador y filtro de tipo (todos/ingreso/fijo/variable).
// EN: Search box text and type filter (all/income/fixed/variable).
const busqueda = ref("");
const filtroTipo = ref<"todos" | "ingreso" | "fijo" | "variable">("todos");

// ── 3. Lista filtrada / Filtered list ─────────────────────────────────────────
// ES: Líneas del mes filtradas por el texto de búsqueda (concepto, categoría,
//     comercio, etiquetas) y el tipo elegido. Se recalcula sola al cambiar inputs.
// EN: Month lines filtered by the search text (concept, category, merchant, tags)
//     and the selected type. Recomputes reactively as inputs change.
const lineasFiltradas = computed<LineaMes[]>(() => {
  const q = busqueda.value.trim().toLowerCase();
  return f.lineasDelMes.filter((l) => {
    // ES: Coincidencia de texto: concepto, categoría, comercio y etiquetas.
    // EN: Text match: concept, category, merchant and tags.
    const coincideTexto =
      !q ||
      l.concepto.toLowerCase().includes(q) ||
      l.categoria.toLowerCase().includes(q) ||
      (l.comercio?.toLowerCase().includes(q) ?? false) ||
      (l.tags?.some((t) => t.toLowerCase().includes(q)) ?? false);
    const coincideTipo =
      filtroTipo.value === "todos" ||
      (filtroTipo.value === "ingreso" && l.signo === "ingreso") ||
      (filtroTipo.value === "fijo" && l.signo === "gasto" && l.fijo) ||
      (filtroTipo.value === "variable" && l.signo === "gasto" && !l.fijo);
    return coincideTexto && coincideTipo;
  });
});

// ── 4. Add / edit modal logic / Lógica del modal de alta y edición ────────────
// ES: Color del punto según el signo (ingreso verde, gasto rojo).
// EN: Dot color by sign (income = green, expense = red).
function colorPunto(signo: Signo): string {
  return signo === "ingreso" ? "bg-ok" : "bg-danger";
}

// ES: Abre el modal en modo edición: busca el objeto completo en el store, monta
//     los datos iniciales y abre el modal precargado.
// EN: Opens the modal in edit mode: finds the full object in the store, builds
//     the initial data and opens the modal preloaded.
function editar(linea: LineaMes) {
  if (linea.origen === "deuda") return; // ES: las cuotas se gestionan en Deudas / EN: installments are managed in Debts

  if (linea.origen === "recurrente") {
    // ES: Recurrente: lo buscamos por id en el store.
    // EN: Recurring: look it up by id in the store.
    const r = f.recurrentes.find((x) => x.id === linea.id);
    if (!r) return;
    inicial.value = {
      recurrente: true,
      signo: r.signo,
      concepto: r.concepto,
      importe: r.importe,
      categoria: r.categoria,
      // ES: El modal solo usa la fecha en puntuales; para recurrentes basta una
      //     fecha válida del mes seleccionado.
      // EN: The modal only uses the date for one-off entries; for recurring ones any
      //     valid date of the selected month is enough.
      fecha: `${f.mesSeleccionado}-01`,
      diaPago: r.diaPago,
      // ES: Campos opcionales nuevos (los recurrentes no llevan recibo).
      // EN: New optional fields (recurring entries have no receipt).
      comercio: r.comercio,
      tags: r.tags,
      cuenta: r.cuenta, // ES: cuenta a la que pertenece; opcional / EN: account it belongs to; optional
    };
  } else {
    // ES: Puntual: lo buscamos por id en el store.
    // EN: One-off: look it up by id in the store.
    const p = f.puntuales.find((x) => x.id === linea.id);
    if (!p) return;
    inicial.value = {
      recurrente: false,
      signo: p.signo,
      concepto: p.concepto,
      importe: p.importe,
      categoria: p.categoria,
      fecha: p.fecha,
      // ES: Campos opcionales nuevos: comercio, tags y recibo (solo puntuales).
      // EN: New optional fields: merchant, tags and receipt (one-off only).
      comercio: p.comercio,
      tags: p.tags,
      recibo: p.recibo,
      cuenta: p.cuenta, // ES: cuenta a la que pertenece; opcional / EN: account it belongs to; optional
      subdivisiones: p.subdivisiones, // ES: gasto dividido en categorías; opcional / EN: expense split into categories; optional
    };
  }
  editando.value = linea;
  modal.value = true;
}

// ES: Guardar desde el modal. Si hay `editando` -> actualiza; si no -> alta nueva.
// EN: Save handler from the modal. If `editando` is set -> update; else -> add.
function onGuardar(mov: {
  recurrente: boolean;
  signo: Signo;
  concepto: string;
  importe: number;
  categoria: string;
  fecha: string;
  diaPago?: number;
  comercio?: string;
  tags?: string[];
  recibo?: string;
  cuenta?: string; // ES: id de cuenta; opcional / EN: account id; optional
  subdivisiones?: Subdivision[]; // ES: gasto dividido (solo puntuales); opcional / EN: split expense (one-off only); optional
}) {
  if (editando.value) {
    // ES: --- Modo edición ---
    // EN: --- Edit mode ---
    if (editando.value.origen === "recurrente") {
      f.actualizarRecurrente(editando.value.id, {
        concepto: mov.concepto,
        importe: mov.importe,
        signo: mov.signo,
        categoria: mov.categoria,
        diaPago: mov.diaPago,
        comercio: mov.comercio,
        tags: mov.tags,
        cuenta: mov.cuenta, // ES: cuenta a la que pertenece / EN: account it belongs to
      });
    } else if (editando.value.origen === "puntual") {
      f.actualizarPuntual(editando.value.id, {
        concepto: mov.concepto,
        importe: mov.importe,
        signo: mov.signo,
        categoria: mov.categoria,
        fecha: mov.fecha,
        comercio: mov.comercio,
        tags: mov.tags,
        recibo: mov.recibo, // ES: recibo solo en puntuales / EN: receipt only on one-off entries
        cuenta: mov.cuenta, // ES: cuenta a la que pertenece / EN: account it belongs to
        subdivisiones: mov.subdivisiones, // ES: gasto dividido (solo puntuales) / EN: split expense (one-off only)
      });
    }
  } else {
    // ES: --- Modo alta ---
    // EN: --- Create mode ---
    if (mov.recurrente) {
      f.addRecurrente({
        concepto: mov.concepto,
        importe: mov.importe,
        signo: mov.signo,
        categoria: mov.categoria,
        desde: mesActual(),
        hasta: null,
        diaPago: mov.diaPago,
        comercio: mov.comercio,
        tags: mov.tags,
        cuenta: mov.cuenta, // ES: cuenta a la que pertenece / EN: account it belongs to
      });
    } else {
      f.addPuntual({
        concepto: mov.concepto,
        importe: mov.importe,
        signo: mov.signo,
        categoria: mov.categoria,
        fecha: mov.fecha,
        comercio: mov.comercio,
        tags: mov.tags,
        recibo: mov.recibo, // ES: recibo solo en puntuales / EN: receipt only on one-off entries
        cuenta: mov.cuenta, // ES: cuenta a la que pertenece / EN: account it belongs to
        subdivisiones: mov.subdivisiones, // ES: gasto dividido (solo puntuales) / EN: split expense (one-off only)
      });
    }
  }
  // ES: Cerramos y reseteamos el estado de edición.
  // EN: Close the modal and reset the editing state.
  editando.value = null;
  inicial.value = null;
  modal.value = false;
}

// ── 5. Acciones de eliminar y dar de baja / Delete & cancel actions ───────────
// ES: Elimina una línea previa confirmación (las cuotas se gestionan en Deudas).
// EN: Deletes a line after confirmation (debt instalments are managed in Debts).
function eliminar(linea: LineaMes) {
  if (linea.origen === "deuda") return; // ES: las cuotas se gestionan en Deudas / EN: installments are managed in Debts
  // ES: Texto fijo traducido + el concepto (dato del usuario, sin traducir).
  // EN: Translated fixed text + the concept (user data, not translated).
  if (confirm(`${t("confirmEliminar")} "${linea.concepto}"?`)) f.eliminarLinea(linea);
}

// ES: Da de baja un fijo (recurrente) a partir del mes seleccionado.
// EN: Cancels a fixed (recurring) item from the selected month onward.
function darDeBaja(linea: LineaMes) {
  if (linea.origen !== "recurrente") return;
  if (confirm(t("confirmDarDeBaja"))) {
    f.darDeBajaRecurrente(linea.id, f.mesSeleccionado);
  }
}

// ES: Abre el modal en modo alta limpio (sin datos precargados).
// EN: Opens the modal in clean "add new" mode (no preloaded data).
function abrirAlta() {
  editando.value = null;
  inicial.value = null;
  modal.value = true;
}

// ES: Cierra el modal y resetea el estado de edición.
// EN: Closes the modal and resets the editing state.
function cerrarModal() {
  editando.value = null;
  inicial.value = null;
  modal.value = false;
}

// ── 6. Entrada rápida — plantillas / Quick entry — templates ──────────────────
// ES: Las plantillas son atajos de un clic para gastos/ingresos habituales. Esta
//     sección cubre usar una plantilla, eliminarla y el mini-formulario para crear.
// EN: Templates are one-tap shortcuts for usual expenses/income. This section
//     covers using a template, deleting it and the inline mini-form to create one.

// ES: Grupos de categorías para el <select> con <optgroup> del mini-formulario.
// EN: Category groups for the <select> with <optgroup> in the mini-form.
const grupos = categoriasPorGrupo();

// ES: Usa una plantilla: registra al instante un movimiento de HOY (un clic).
// EN: Uses a template: instantly logs a movement dated TODAY (one click).
function usarPlantilla(p: Plantilla): void {
  f.usarPlantilla(p.id);
  // ES: El apunte recién creado se registra en el mes ACTUAL; saltamos a él
  //     para que sea visible aunque se estuviera viendo otro mes.
  // EN: The new entry is logged in the CURRENT month; jump there so it is
  //     visible even if another month was being viewed.
  f.seleccionarMes(mesActual());
}

// ES: Elimina una plantilla previa confirmación.
// EN: Deletes a template after confirmation.
function quitarPlantilla(p: Plantilla): void {
  // ES: Texto fijo traducido + el concepto (dato del usuario, sin traducir).
  // EN: Translated fixed text + the concept (user data, not translated).
  if (confirm(`${t("confirmEliminarAtajo")} "${p.concepto}"?`)) f.eliminarPlantilla(p.id);
}

// ES: Estado del mini-formulario inline para crear una plantilla nueva.
// EN: Inline mini-form state to create a new template.
const formAbierto = ref(false);
const formConcepto = ref("");
const formImporte = ref(""); // ES: texto, acepta coma decimal / EN: text, accepts decimal comma
const formSigno = ref<Signo>("gasto"); // ES: gasto por defecto / EN: expense by default
const formCategoria = ref(""); // ES: nombre de categoría seleccionada / EN: selected category name

// ES: Abre el mini-formulario con valores limpios.
// EN: Opens the mini-form with clean values.
function abrirFormPlantilla(): void {
  formConcepto.value = "";
  formImporte.value = "";
  formSigno.value = "gasto";
  formCategoria.value = "";
  formAbierto.value = true;
}

// ES: Cierra el mini-formulario sin guardar.
// EN: Closes the mini-form without saving.
function cerrarFormPlantilla(): void {
  formAbierto.value = false;
}

// ES: Guarda la nueva plantilla en el store. Normaliza la coma decimal a punto y
//     redondea el importe a céntimos.
// EN: Saves the new template into the store. Normalizes the decimal comma to a
//     dot and rounds the amount to cents.
function guardarPlantilla(): void {
  const concepto = formConcepto.value.trim();
  const importe = Math.round(Number(formImporte.value.replace(",", ".")) * 100) / 100;
  // ES: Validación mínima: concepto, importe válido (>0) y categoría elegida.
  // EN: Minimal validation: concept, valid amount (>0) and a chosen category.
  if (!concepto || !Number.isFinite(importe) || importe <= 0 || !formCategoria.value) return;
  f.addPlantilla({
    concepto,
    importe,
    signo: formSigno.value,
    categoria: formCategoria.value,
  });
  formAbierto.value = false;
}

// ── 7. Atajos de teclado / Keyboard shortcuts ─────────────────────────────────
// ES: Manejador global de teclas: "n" abre el modal de nuevo movimiento (solo si
//     NO se está escribiendo en un campo de formulario), y "Escape" cierra el
//     modal si está abierto. Se registra en onMounted y se quita en onUnmounted
//     para no dejar listeners colgando.
// EN: Global key handler: "n" opens the new-movement modal (only when not typing
//     in a form field), and "Escape" closes the modal if it is open. Registered
//     in onMounted and removed in onUnmounted to avoid leaks.
function onTecla(e: KeyboardEvent): void {
  // ES: Elemento con foco; nos saltamos el atajo "n" si se escribe en un campo.
  // EN: Element with focus; we skip the "n" shortcut while typing in a field.
  const destino = e.target as HTMLElement | null;
  const enCampo =
    !!destino &&
    (destino.tagName === "INPUT" ||
      destino.tagName === "TEXTAREA" ||
      destino.tagName === "SELECT" ||
      destino.isContentEditable);

  // ES: "n" (sin modificadores, fuera de un campo) -> abre el modal de alta.
  // EN: "n" (no modifiers, not in a field) -> open the add-movement modal.
  if ((e.key === "n" || e.key === "N") && !enCampo && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    abrirAlta();
    return;
  }

  // ES: "Escape" cierra el modal si está abierto (el mini-form tiene el suyo propio).
  // EN: "Escape" closes the modal if it is open (the mini-form has its own handler).
  if (e.key === "Escape" && modal.value) {
    cerrarModal();
  }
}

// ES: Registra el listener al montar, lo quita al desmontar.
// EN: Register the listener on mount, remove it on unmount.
onMounted(() => window.addEventListener("keydown", onTecla));
onUnmounted(() => window.removeEventListener("keydown", onTecla));
</script>

<template>
  <div>
    <!-- ES: Cabecera: título + botón "Añadir" (abre el modal en modo alta). -->
    <!-- EN: Header: title + "Add" button (opens the modal in add mode). -->
    <div class="flex items-center justify-between mb-6">
      <h2 class="font-display text-2xl font-bold">{{ t("titulo") }}</h2>
      <button
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
        @click="abrirAlta"
      >
        {{ t("anadir") }}
      </button>
    </div>

    <!-- ES: ENTRADA RÁPIDA: chips de plantillas + alta de plantilla nueva. -->
    <!-- EN: Quick entry: template chips + create-new-template chip. -->
    <div class="mb-6 flex flex-wrap items-center gap-2">
      <!-- ES: Un chip por plantilla: clic = registrar movimiento de hoy al instante / EN: One chip per template: click = log today's transaction instantly -->
      <span
        v-for="p in f.plantillas"
        :key="p.id"
        class="inline-flex items-center gap-1.5 rounded-full bg-surface-2 border border-border px-3 py-1.5 text-sm hover:border-brand transition-colors"
      >
        <!-- ES: Texto del chip: registra el movimiento al hacer clic / EN: Chip text: logs the transaction on click -->
        <button class="text-ink" :title="`${t('registrarHoy')}: ${p.concepto}`" @click="usarPlantilla(p)">
          {{ p.concepto }} · {{ euro(p.importe) }}
        </button>
        <!-- ES: Aspa para eliminar el atajo / EN: Cross to delete the shortcut -->
        <button
          class="text-faint hover:text-danger transition-colors"
          :title="t('eliminarAtajo')"
          @click="quitarPlantilla(p)"
        >
          ✕
        </button>
      </span>

      <!-- ES: Chip "+ Plantilla": abre el mini-formulario para crear un atajo / EN: "+ Template" chip: opens the mini-form to create a shortcut -->
      <button
        class="rounded-full bg-surface-2 border border-border px-3 py-1.5 text-sm hover:border-brand transition-colors"
        @click="abrirFormPlantilla"
      >
        {{ t("masPlantilla") }}
      </button>

      <!-- ES: Texto tenue de ayuda cuando todavía no hay plantillas / EN: Faint help text when there are no templates yet -->
      <span v-if="!f.plantillas.length" class="text-faint text-sm">
        {{ t("ayudaPlantillas") }}
      </span>
    </div>

    <!-- ES: Mini-modal para crear una plantilla nueva. -->
    <!-- EN: Mini-modal to create a new template. -->
    <div
      v-if="formAbierto"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
      @click.self="cerrarFormPlantilla"
    >
      <div class="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 space-y-4">
        <h3 class="font-display text-lg font-bold">{{ t("nuevoAtajo") }}</h3>

        <!-- ES: Concepto / EN: Concept -->
        <div>
          <label class="text-faint text-xs">{{ t("concepto") }}</label>
          <input
            v-model="formConcepto"
            type="text"
            :placeholder="t('conceptoPlaceholder')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- ES: Importe (acepta coma decimal, se redondea al guardar) / EN: Amount (accepts a decimal comma, rounded on save) -->
        <div>
          <label class="text-faint text-xs">{{ t("importe") }}</label>
          <input
            v-model="formImporte"
            type="text"
            inputmode="decimal"
            placeholder="1,50"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- ES: Signo: gasto por defecto / EN: Sign: expense by default -->
        <div>
          <label class="text-faint text-xs">{{ t("tipo") }}</label>
          <select
            v-model="formSigno"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="gasto">{{ t("gasto") }}</option>
            <option value="ingreso">{{ t("ingreso") }}</option>
          </select>
        </div>

        <!-- ES: Categoría: select con optgroups por grupo / EN: Category: select with one optgroup per group -->
        <div>
          <label class="text-faint text-xs">{{ t("categoria") }}</label>
          <select
            v-model="formCategoria"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
          >
            <option value="" disabled>{{ t("eligeCategoria") }}</option>
            <optgroup v-for="g in grupos" :key="g.grupo" :label="g.grupo">
              <option v-for="c in g.items" :key="c" :value="c">{{ c }}</option>
            </optgroup>
          </select>
        </div>

        <!-- ES: Acciones del mini-formulario / EN: Mini-form actions -->
        <div class="flex justify-end gap-2 pt-1">
          <button
            class="rounded-lg bg-surface-2 border border-border px-4 py-2 text-sm hover:border-brand transition-colors"
            @click="cerrarFormPlantilla"
          >
            {{ t("cancelar") }}
          </button>
          <button
            class="rounded-lg bg-brand px-4 py-2 text-sm text-white font-medium hover:bg-brand-soft transition-colors"
            @click="guardarPlantilla"
          >
            {{ t("guardar") }}
          </button>
        </div>
      </div>
    </div>

    <!-- ES: Tarjeta de movimientos: barra de buscar/filtrar + la lista de líneas. -->
    <!-- EN: Transactions card: search/filter toolbar + the list of lines. -->
    <div class="rounded-2xl bg-surface border border-border">
      <!-- ES: Barra: búsqueda libre, filtro de tipo y contador de apuntes. -->
      <!-- EN: Toolbar: free-text search, type filter and entry count. -->
      <div class="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-border">
        <input
          v-model="busqueda"
          type="text"
          :placeholder="t('buscarPlaceholder')"
          class="flex-1 min-w-40 rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
        />
        <select
          v-model="filtroTipo"
          class="rounded-lg bg-surface-2 border border-border px-3 py-1.5 text-sm text-ink outline-none focus:border-brand"
        >
          <option value="todos">{{ t("todos") }}</option>
          <option value="ingreso">{{ t("ingresos") }}</option>
          <option value="fijo">{{ t("gastosFijos") }}</option>
          <option value="variable">{{ t("gastosVariables") }}</option>
        </select>
        <span class="text-faint text-sm shrink-0">{{ lineasFiltradas.length }} {{ t("apuntes") }}</span>
      </div>

      <!-- ES: Estado vacío: distingue "sin resultados del filtro" vs "sin apuntes". -->
      <!-- EN: Empty state: distinguishes "no results for filter" vs "no entries". -->
      <div v-if="!lineasFiltradas.length" class="px-5 py-12 text-center text-muted">
        {{ f.lineasDelMes.length ? t("sinResultados") : t("sinMovimientos") }}
      </div>

      <!-- ES: Lista de líneas: punto + concepto/meta + importe + acciones por fila. -->
      <!-- EN: List of lines: dot + concept/meta + amount + per-row actions. -->
      <ul v-else class="divide-y divide-border">
        <li
          v-for="l in lineasFiltradas"
          :key="l.origen + ':' + l.id"
          class="group flex items-center gap-3 px-5 py-3 hover:bg-surface-2 transition-colors"
        >
          <span class="size-2.5 rounded-full shrink-0" :class="colorPunto(l.signo)" />

          <div class="min-w-0 flex-1">
            <p class="truncate">{{ l.concepto }}</p>
            <p class="text-faint text-xs mt-0.5 flex flex-wrap items-center gap-1.5">
              <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ l.categoria }}</span>
              <span v-if="l.fijo" class="rounded-full bg-surface-2 px-2 py-0.5">{{ t("fijo") }}</span>
              <!-- ES: Chip "Dividido": el gasto se reparte en varias categorías / EN: "Split" chip: the expense is spread across several categories -->
              <span
                v-if="l.subdivisiones?.length"
                class="rounded-full bg-brand/15 text-brand px-2 py-0.5"
                :title="l.subdivisiones.map((s) => s.categoria).join(', ')"
              >
                {{ t("dividido") }}
              </span>
              <!-- ES: Comercio: dónde se hizo (ej. "· Mercadona") / EN: Merchant: where it happened (e.g. "· Mercadona") -->
              <span v-if="l.comercio">· {{ l.comercio }}</span>
              <span v-if="l.fecha">· {{ fechaLegible(l.fecha) }}</span>
              <!-- ES: Etiquetas como chips pequeños / EN: Tags as small chips -->
              <span
                v-for="t in l.tags"
                :key="t"
                class="rounded-full bg-brand/15 text-brand px-2 py-0.5"
              >
                {{ t }}
              </span>
              <!-- ES: Icono de recibo: abre el lightbox con la imagen / EN: Receipt icon: opens the lightbox with the image -->
              <button
                v-if="l.recibo"
                class="hover:text-ink transition-colors"
                :title="t('verRecibo')"
                @click.stop="reciboVisible = l.recibo ?? null"
              >
                📎
              </button>
            </p>
          </div>

          <span
            class="font-medium tabular-nums shrink-0"
            :class="l.signo === 'ingreso' ? 'text-ok' : 'text-danger'"
          >
            {{ l.signo === "ingreso" ? "+" : "−" }}{{ euro(l.importe) }}
          </span>

          <!-- ES: Acciones de la línea (no aplican a las cuotas de deuda) / EN: Line actions (not applicable to debt installments) -->
          <template v-if="l.origen !== 'deuda'">
            <button
              class="opacity-0 group-hover:opacity-100 text-faint hover:text-ink transition-all shrink-0"
              :title="t('editar')"
              @click="editar(l)"
            >
              ✏️
            </button>
            <!-- ES: Dar de baja: solo para fijos (recurrentes) / EN: Cancel: only for fixed (recurring) entries -->
            <button
              v-if="l.origen === 'recurrente'"
              class="opacity-0 group-hover:opacity-100 text-faint hover:text-danger transition-all shrink-0"
              :title="t('darDeBajaTitulo')"
              @click="darDeBaja(l)"
            >
              🚫
            </button>
            <button
              class="opacity-0 group-hover:opacity-100 text-faint hover:text-danger transition-all shrink-0"
              :title="t('eliminar')"
              @click="eliminar(l)"
            >
              ✕
            </button>
          </template>
          <span v-else class="text-faint text-xs shrink-0" :title="t('gestionadoDeudas')">🔒</span>
        </li>
      </ul>
    </div>

    <!-- ES: Modal de alta/edición. El :key fuerza remontar por línea editada (o
         "alta" para alta) para que el formulario nunca reuse datos viejos. -->
    <!-- EN: Add/edit modal. :key forces a remount per edited line (or "alta" for
         add) so the form is never reused with stale data. -->
    <ModalMovimiento
      v-if="modal"
      :key="editando ? editando.origen + ':' + editando.id : 'alta'"
      :inicial="inicial ?? undefined"
      @guardar="onGuardar"
      @cerrar="cerrarModal"
    />

    <!-- ES: Lightbox del recibo: clic fuera o en la imagen lo cierra. -->
    <!-- EN: Receipt lightbox: click outside or on the image closes it. -->
    <div
      v-if="reciboVisible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
      @click="reciboVisible = null"
    >
      <img
        :src="reciboVisible"
        :alt="t('reciboAlt')"
        class="max-h-[90vh] max-w-full rounded-lg shadow-2xl"
      />
    </div>
  </div>
</template>
