<script setup lang="ts">
/* =============================================================================
 * PresupuestosView.vue — Monthly budget caps per category / Topes mensuales por categoría
 * -----------------------------------------------------------------------------
 * EN: Budgets view. Lets the user set a monthly spending cap per category and
 *     see, via a progress bar, how much of the cap is already spent in the
 *     selected month. Spent amount per category is read from the central
 *     finanzas store (gastoPorCategoria); a missing category means 0 spent.
 *     Bar colour by % spent: <80% green (ok), 80-100% yellow (warn),
 *     >100% red (danger / over budget).
 * ES: Vista de Presupuestos. Permite poner un tope mensual de gasto por categoría
 *     y ver, con una barra de progreso, cuánto se lleva gastado del límite en el
 *     mes seleccionado. El gasto de cada categoría se lee del store central de
 *     finanzas (gastoPorCategoria); si una categoría no aparece, su gasto es 0.
 *     Color de la barra según el % gastado: <80% verde (ok), 80-100% amarillo
 *     (warn), >100% rojo (danger / pasado del presupuesto).
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & store / Imports y store
 *   2. Translations (UI texts) / Traducciones (textos de UI)
 *   3. Form state / Estado del formulario
 *   4. Calculation helpers / Helpers de cálculo
 *   5. Actions (save / delete) / Acciones (guardar / borrar)
 * ===========================================================================*/

// ── 1. Imports & store / Imports y store ──────────────────────────────────────
// EN: Vue reactivity, central finanzas store, currency formatter, category
//     catalogue (names + colours) and the i18n helper factory.
// ES: Reactividad de Vue, store central de finanzas, formateador de moneda,
//     catálogo de categorías (nombres + colores) y la fábrica del helper i18n.
import { ref, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro } from "../utils/format";
import { NOMBRES_CATEGORIA, colorCategoria } from "../data/categorias";
import { crearT } from "../i18n";

// EN: Central finanzas store (already initialised in the app).
// ES: Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// ── 2. Translations (UI texts) / Traducciones (textos de UI) ──────────────────
// EN: Component translation function (ES/EN). Gathers every visible text.
// ES: Función de traducción del componente (ES/EN). Reúne todos los textos visibles.
const t = crearT({
  titulo: { es: "Presupuestos", en: "Budgets" },
  subtitulo: {
    es: "Pon un tope mensual por categoría y controla cuánto llevas",
    en: "Set a monthly cap per category and track how much you've spent",
  },
  nuevoTope: { es: "Nuevo tope o editar", en: "New cap or edit" },
  categoria: { es: "Categoría", en: "Category" },
  topeMensual: { es: "Tope mensual (€)", en: "Monthly cap (€)" },
  placeholderImporte: { es: "Ej: 300", en: "E.g. 300" },
  guardarTope: { es: "Guardar tope", en: "Save cap" },
  errorCategoria: { es: "Elige una categoría.", en: "Choose a category." },
  errorImporte: { es: "Pon un importe mayor que 0 €.", en: "Enter an amount greater than €0." },
  vacioTitulo: { es: "Aún no tienes ningún tope", en: "You don't have any caps yet" },
  vacioTexto: {
    es: "Define un límite mensual por categoría para vigilar tus gastos del mes.",
    en: "Set a monthly limit per category to keep an eye on this month's spending.",
  },
  eliminarTope: { es: "Eliminar tope", en: "Delete cap" },
  // EN: Texts for "Spent X of Y" (interpolated with already-formatted amounts).
  // ES: Textos para "Gastado X de Y" (interpola los importes ya formateados).
  gastado: { es: "Gastado", en: "Spent" },
  de: { es: "de", en: "of" },
  pasado: { es: "¡Te has pasado!", en: "You've gone over!" },
  // EN: Delete-confirm message (category name is interpolated separately between A/B).
  // ES: Mensaje del confirm de borrado (el nombre de la categoría va interpolado aparte entre A/B).
  confirmEliminarA: { es: '¿Eliminar el tope de "', en: 'Delete the cap for "' },
  confirmEliminarB: { es: '"?', en: '"?' },
});

// ── 3. Form state / Estado del formulario ─────────────────────────────────────
// EN: Category selected in the <select> (defaults to the first in the catalogue).
// ES: Categoría seleccionada en el <select> (por defecto, la primera del catálogo).
const categoriaSel = ref<string>(NOMBRES_CATEGORIA[0] ?? "");
// EN: Cap typed as raw text (accepts comma or dot as decimal separator).
// ES: Límite introducido como texto crudo (admite coma o punto decimal).
const limiteTexto = ref<string>("");
// EN: Validation error message (empty = no error).
// ES: Mensaje de error de validación (vacío = sin error).
const error = ref<string>("");

// ── 4. Calculation helpers / Helpers de cálculo ───────────────────────────────

// EN: Normalises a numeric text ("12,50" or "12.50") to a 2-decimal number.
// ES: Normaliza un texto numérico ("12,50" o "12.50") a número con 2 decimales.
function aNumero(valor: string): number {
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// EN: Map category -> month spent (built from finanzas.gastoPorCategoria).
//     Recomputed reactively when the month's spending changes.
// ES: Mapa categoría -> gasto del mes (a partir de finanzas.gastoPorCategoria).
//     Se recalcula de forma reactiva cuando cambia el gasto del mes.
const gastoPorCat = computed<Map<string, number>>(() => {
  const mapa = new Map<string, number>();
  for (const g of finanzas.gastoPorCategoria) {
    mapa.set(g.categoria, g.total);
  }
  return mapa;
});

// EN: Month spent for a given category (0 if no spending recorded).
// ES: Gasto del mes para una categoría concreta (0 si no hay gasto registrado).
function gastoDe(categoria: string): number {
  return gastoPorCat.value.get(categoria) ?? 0;
}

// EN: REAL percentage spent over the cap (may exceed 100). This is the value used
//     by the colour/over-budget logic; do NOT round it for display purposes.
//     Returns 0 when the cap is <= 0 to avoid dividing by zero.
// ES: Porcentaje REAL gastado sobre el límite (puede superar 100). Es el valor que
//     usa la lógica de colores/pasado; NO redondear este para mostrarlo.
//     Devuelve 0 si el límite es <= 0 para evitar dividir por cero.
function porcentajeReal(categoria: string, limite: number): number {
  if (limite <= 0) return 0;
  return Math.round((gastoDe(categoria) / limite) * 100);
}

// EN: Percentage shown to the user. Uses Math.floor (not round) so it never
//     displays "100%" before the cap is actually reached: e.g. 99.7% would round
//     up to 100% but floors to 99%. Purely cosmetic — the colour/over-budget
//     logic keeps using porcentajeReal so behaviour is unchanged.
// ES: Porcentaje que se muestra al usuario. Usa Math.floor (no round) para que
//     nunca enseñe "100%" antes de alcanzar realmente el tope: p.ej. 99.7%
//     redondearía a 100% pero con floor queda en 99%. Es puramente cosmético —
//     la lógica de colores/pasado sigue usando porcentajeReal, sin cambios.
function porcentajeMostrado(categoria: string, limite: number): number {
  if (limite <= 0) return 0;
  return Math.floor((gastoDe(categoria) / limite) * 100);
}

// EN: Clamped percentage (0..100) for the bar width.
// ES: Porcentaje recortado (clamp) al rango 0..100 para el ancho de la barra.
function porcentajeBarra(categoria: string, limite: number): number {
  return Math.min(100, Math.max(0, porcentajeReal(categoria, limite)));
}

// EN: Has the budget been exceeded? (spent > cap)
// ES: ¿Se ha pasado del presupuesto? (gastado > límite)
function pasado(categoria: string, limite: number): boolean {
  return porcentajeReal(categoria, limite) > 100;
}

// EN: Colour class of the bar fill based on % spent (uses the REAL value).
// ES: Clase de color del relleno de la barra según el % gastado (usa el valor REAL).
function colorBarra(categoria: string, limite: number): string {
  const pct = porcentajeReal(categoria, limite);
  if (pct > 100) return "bg-danger"; // EN: red — over budget / ES: rojo — pasado
  if (pct >= 80) return "bg-warn"; // EN: yellow — near the cap / ES: amarillo — al borde
  return "bg-ok"; // EN: green — relaxed / ES: verde — tranquilo
}

// EN: Colour class of the percentage text (matches the bar; uses the REAL value).
// ES: Clase de color del texto del porcentaje (a juego con la barra; usa el valor REAL).
function colorTexto(categoria: string, limite: number): string {
  const pct = porcentajeReal(categoria, limite);
  if (pct > 100) return "text-danger";
  if (pct >= 80) return "text-warn";
  return "text-ok";
}

// ── 5. Actions (save / delete) / Acciones (guardar / borrar) ──────────────────

// EN: Saves (upsert) the cap for the selected category.
// ES: Guarda (upsert) el tope de la categoría seleccionada.
function guardarTope(): void {
  error.value = "";
  const cat = categoriaSel.value.trim();
  // EN: A category must be chosen. / ES: Debe haber una categoría elegida.
  if (!cat) {
    error.value = t("errorCategoria");
    return;
  }
  const limite = aNumero(limiteTexto.value);
  // EN: Cap must be > 0 (a 0 would delete it; here we require a valid one).
  // ES: El límite debe ser mayor que 0 (un 0 lo borraría; aquí pedimos uno válido).
  if (limite <= 0) {
    error.value = t("errorImporte");
    return;
  }
  // EN: The store does the upsert: if the category exists it is replaced.
  // ES: El store hace el upsert: si ya existe la categoría la reemplaza.
  finanzas.setPresupuesto(cat, limite);
  // EN: Clear the amount field after saving (keep the category for convenience).
  // ES: Limpia el campo de importe tras guardar (deja la categoría por comodidad).
  limiteTexto.value = "";
}

// EN: Deletes a category's budget (with native confirmation).
// ES: Elimina el presupuesto de una categoría (con confirmación nativa).
function borrarTope(categoria: string): void {
  // EN: Native confirm(): if the user cancels, nothing is deleted.
  // ES: confirm() nativo: si el usuario cancela, no se borra nada.
  if (!confirm(`${t("confirmEliminarA")}${categoria}${t("confirmEliminarB")}`)) return;
  finanzas.eliminarPresupuesto(categoria);
}
</script>

<template>
  <!-- EN: View container / ES: Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- EN: 1. Header: title + explanatory text / ES: 1. Cabecera: título + texto explicativo -->
    <header class="mb-6">
      <h1 class="font-display text-2xl font-bold">{{ t("titulo") }}</h1>
      <p class="mt-1 text-sm text-muted">
        {{ t("subtitulo") }}
      </p>
    </header>

    <!-- EN: 2. Form to add / edit a cap / ES: 2. Formulario para añadir / editar un tope -->
    <section class="rounded-2xl bg-surface border border-border p-5 mb-6">
      <h2 class="font-display font-bold mb-4">{{ t("nuevoTope") }}</h2>
      <!-- EN: @submit.prevent so the desktop SPA doesn't reload / ES: @submit.prevent para no recargar la SPA de escritorio -->
      <form class="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" @submit.prevent="guardarTope">
        <!-- EN: Category selector / ES: Selector de categoría -->
        <div>
          <label class="mb-1 block text-sm text-muted">{{ t("categoria") }}</label>
          <select
            v-model="categoriaSel"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option v-for="nombre in NOMBRES_CATEGORIA" :key="nombre" :value="nombre">
              {{ nombre }}
            </option>
          </select>
        </div>

        <!-- EN: Cap amount (€) / ES: Importe del tope (€) -->
        <div>
          <label class="mb-1 block text-sm text-muted">{{ t("topeMensual") }}</label>
          <input
            v-model="limiteTexto"
            type="text"
            inputmode="decimal"
            :placeholder="t('placeholderImporte')"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand sm:w-40"
          />
        </div>

        <!-- EN: Save button / ES: Botón guardar -->
        <button
          type="submit"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        >
          {{ t("guardarTope") }}
        </button>
      </form>

      <!-- EN: Validation error message / ES: Mensaje de error de validación -->
      <p v-if="error" class="mt-3 text-sm text-danger">{{ error }}</p>
    </section>

    <!-- EN: 3. Empty state: no budgets defined / ES: 3. Estado vacío: no hay presupuestos definidos -->
    <div
      v-if="finanzas.presupuestos.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">💰</p>
      <p class="mt-3 font-display font-bold text-ink">{{ t("vacioTitulo") }}</p>
      <p class="mt-1 text-sm text-muted">
        {{ t("vacioTexto") }}
      </p>
    </div>

    <!-- EN: 4. List of defined budgets: one card per category / ES: 4. Listado de presupuestos definidos: una tarjeta por categoría -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="p in finanzas.presupuestos"
        :key="p.categoria"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- EN: Card header: colour dot + category + delete button / ES: Cabecera de la tarjeta: punto de color + categoría + botón eliminar -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <!-- EN: Category colour dot / ES: Punto del color de la categoría -->
            <span
              class="h-3 w-3 shrink-0 rounded-full"
              :style="{ backgroundColor: colorCategoria(p.categoria) }"
            ></span>
            <h2 class="font-display font-bold leading-tight truncate">
              {{ p.categoria }}
            </h2>
          </div>
          <!-- EN: Delete button (with confirm) / ES: Botón eliminar (con confirm) -->
          <button
            class="shrink-0 rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
            :title="t('eliminarTope')"
            :aria-label="t('eliminarTope')"
            @click="borrarTope(p.categoria)"
          >
            🗑️
          </button>
        </div>

        <!-- EN: Progress bar spent / cap / ES: Barra de progreso gastado / límite -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- EN: Fill: width clamped to 0..100, colour by % spent / ES: Relleno: ancho recortado a 0..100, color según el % gastado -->
            <div
              class="h-full rounded-full transition-all"
              :class="colorBarra(p.categoria, p.limite)"
              :style="{ width: porcentajeBarra(p.categoria, p.limite) + '%' }"
            ></div>
          </div>

          <!-- EN: Text: spent X of Y (N%) — shown % uses floor so it never reads 100% before the cap is hit -->
          <!-- ES: Texto: gastado X de Y (N%) — el % mostrado usa floor para que nunca enseñe 100% antes de alcanzar el tope -->
          <p class="mt-2 text-xs text-muted">
            {{ t("gastado") }} {{ euro(gastoDe(p.categoria)) }} {{ t("de") }} {{ euro(p.limite) }}
            (<span :class="colorTexto(p.categoria, p.limite)">{{ porcentajeMostrado(p.categoria, p.limite) }}%</span>)
          </p>

          <!-- EN: Notice when the cap has been exceeded / ES: Aviso cuando se ha pasado del tope -->
          <p v-if="pasado(p.categoria, p.limite)" class="mt-1 text-xs font-medium text-danger">
            {{ t("pasado") }}
          </p>
        </div>
      </article>
    </div>
  </div>
</template>
