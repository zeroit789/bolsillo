<script setup lang="ts">
/* =============================================================================
 * SobresView.vue — Vista de sobres (presupuesto) / Envelope budgeting view
 * -----------------------------------------------------------------------------
 * ES: Vista de presupuesto por "sobres". El dinero del mes se reparte en sobres
 *     (uno por cada categoría con tope/presupuesto) y se ve cuánto se ha gastado
 *     de cada uno y cuánto queda dentro. NO inventa un modelo de datos nuevo:
 *     reutiliza lo que ya existe en el store useFinanzas (presupuestos = topes =
 *     sobres de gasto; gastoPorCategoria = gasto del mes por categoría;
 *     ingresos / disponible / totalGastos = KPIs del mes).
 * EN: "Envelope" budgeting view. The month's money is split into envelopes (one
 *     per category that has a limit/budget) and you see how much has been spent
 *     from each one and how much is left inside. It does NOT invent a new data
 *     model: it reuses what already exists in the useFinanzas store
 *     (presupuestos = limits = spending envelopes; gastoPorCategoria = monthly
 *     spending per category; ingresos / disponible / totalGastos = month KPIs).
 * -----------------------------------------------------------------------------
 * ES: Colores de la barra (mismo criterio que PresupuestosView, por coherencia):
 *       < 80%   -> verde (bg-ok)     situación tranquila
 *       80-100% -> ámbar (bg-warn)   ojo, te acercas al tope
 *       > 100%  -> rojo  (bg-danger) te has pasado del sobre
 * EN: Bar colors (same criteria as PresupuestosView, for consistency):
 *       < 80%   -> green (bg-ok)     calm situation
 *       80-100% -> amber (bg-warn)   careful, getting close to the limit
 *       > 100%  -> red   (bg-danger) you went over the envelope
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y store / Imports & store
 *   2. Traducciones (ES/EN) / Translations (ES/EN)
 *   3. Datos base del mes / Base month data
 *   4. Resumen superior (reparto global) / Top summary (global split)
 *   5. Sobre especial: gasto sin sobre / Special envelope: spending with no budget
 *   6. Helpers de barra y porcentaje / Bar/percentage helpers
 * ===========================================================================*/

// ── 1. Imports y store / Imports & store ──────────────────────────────────────
import { computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro } from "../utils/format";
import { colorCategoria } from "../data/categorias";
import { crearT } from "../i18n";

// ES: Store central de finanzas (ya inicializado en la app).
// EN: Central finance store (already initialized in the app).
const finanzas = useFinanzas();

// ── 2. Traducciones (ES/EN) / Translations (ES/EN) ────────────────────────────
// ES: Función de traducción ES/EN con todos los textos visibles de esta vista.
//     Claves cortas en camelCase; cada una con su versión española e inglesa.
// EN: ES/EN translation function with every visible text in this view. Short
//     camelCase keys, each with its Spanish and English version.
const t = crearT({
  titulo: { es: "Sobres", en: "Envelopes" },
  subtitulo: {
    es: "Reparte tu dinero del mes en sobres y controla cada uno",
    en: "Split your monthly money into envelopes and track each one",
  },
  ingresosMes: { es: "Ingresos del mes", en: "Monthly income" },
  presupuestado: { es: "Presupuestado", en: "Budgeted" },
  sumaSobres: { es: "Suma de todos tus sobres", en: "Sum of all your envelopes" },
  sinPresupuestar: { es: "Sin presupuestar", en: "Unbudgeted" },
  pasadoSobres: {
    es: "Has metido en sobres más de lo que ingresas",
    en: "You've put more into envelopes than you earn",
  },
  dineroLibre: { es: "Dinero libre, fuera de sobres", en: "Free money, outside envelopes" },
  sinSobresTitulo: { es: "Aún no tienes ningún sobre", en: "You don't have any envelopes yet" },
  sinSobresTexto1: { es: "Crea topes por categoría en la sección", en: "Create category limits in the" },
  presupuestosSeccion: { es: "Presupuestos", en: "Budgets" },
  sinSobresTexto2: {
    es: "y aquí verás cómo se reparte el dinero del mes en cada sobre.",
    en: "section and here you'll see how the monthly money splits into each envelope.",
  },
  gastado: { es: "Gastado", en: "Spent" },
  de: { es: "de", en: "of" },
  tePasaste: { es: "Te has pasado", en: "You're over by" },
  quedan: { es: "Quedan", en: "Remaining" },
  otrosGastos: { es: "Otros gastos (sin sobre)", en: "Other expenses (no envelope)" },
  gastoSinTope: {
    es: "Gasto del mes en categorías sin tope asignado",
    en: "Monthly spending in categories with no assigned limit",
  },
  sinGastoFuera: {
    es: "No tienes gastos fuera de tus sobres este mes",
    en: "You have no spending outside your envelopes this month",
  },
});

// ── 3. Datos base del mes / Base month data ───────────────────────────────────
// ES: Mapa categoría -> gasto del mes, derivado de finanzas.gastoPorCategoria.
//     Reactivo: se recalcula cuando cambia el gasto o el mes seleccionado.
// EN: Map category -> monthly spending, derived from finanzas.gastoPorCategoria.
//     Reactive: recomputes when spending or the selected month changes.
const gastoPorCat = computed<Map<string, number>>(() => {
  const mapa = new Map<string, number>();
  for (const g of finanzas.gastoPorCategoria) {
    mapa.set(g.categoria, g.total);
  }
  return mapa;
});

// ES: Gasto del mes de una categoría concreta (0 si no hay gasto registrado).
// EN: Monthly spending of a given category (0 if nothing is registered).
function gastoDe(categoria: string): number {
  return gastoPorCat.value.get(categoria) ?? 0;
}

// ── 4. Resumen superior (reparto global) / Top summary (global split) ─────────
// ES: Suma de todos los topes definidos = total presupuestado ("metido en sobres").
// EN: Sum of all defined limits = total budgeted ("put into envelopes").
const presupuestado = computed<number>(() =>
  finanzas.presupuestos.reduce((acc, p) => acc + p.limite, 0)
);

// ES: Dinero del mes que NO está asignado a ningún sobre (puede ser negativo si
//     los topes superan los ingresos del mes; en ese caso significa que has
//     presupuestado más de lo que ingresas).
// EN: Month's money NOT assigned to any envelope (can be negative if the limits
//     exceed the month's income; that means you budgeted more than you earn).
const sinPresupuestar = computed<number>(() => finanzas.ingresos - presupuestado.value);

// ── 5. Sobre especial: gasto sin sobre / Special envelope: spending with no budget ──
// ES: Conjunto de categorías que SÍ tienen sobre (presupuesto definido).
// EN: Set of categories that DO have an envelope (a defined budget).
const categoriasConSobre = computed<Set<string>>(
  () => new Set(finanzas.presupuestos.map((p) => p.categoria))
);

// ES: Suma del gasto del mes en categorías que no tienen sobre.
// EN: Sum of the month's spending in categories that have no envelope.
const gastoSinSobre = computed<number>(() => {
  let total = 0;
  for (const g of finanzas.gastoPorCategoria) {
    if (!categoriasConSobre.value.has(g.categoria)) total += g.total;
  }
  return total;
});

// ── 6. Helpers de barra y porcentaje / Bar/percentage helpers ─────────────────
// ES: Mismo criterio que PresupuestosView, para coherencia visual.
// EN: Same criteria as PresupuestosView, for visual consistency.

// ES: Porcentaje REAL gastado sobre el límite (puede superar 100). Solo se usa
//     para la lógica de colores y ancho de barra (redondeado). Límite <= 0 -> 0
//     para no dividir por cero.
// EN: REAL percentage spent over the limit (can exceed 100). Used for color and
//     bar-width logic only (rounded). Limit <= 0 -> 0 to avoid dividing by zero.
function porcentajeReal(gastado: number, limite: number): number {
  if (limite <= 0) return 0;
  return Math.round((gastado / limite) * 100);
}

// ES: Porcentaje MOSTRADO en el texto, redondeado hacia abajo (Math.floor) para que
//     nunca enseñe "100%" mientras todavía "quedan" euros — esa incoherencia con el
//     texto de "quedan" era el bug (mismo fix que en PresupuestosView). Solo para
//     mostrar: NO alimenta el color ni la barra.
// EN: Percentage SHOWN in the text, floored (Math.floor) so it never reads "100%"
//     while euros still "remain" — that mismatch with the "Remaining" text was the
//     bug (same fix as in PresupuestosView). Display only: does NOT feed color/bar.
function porcentajeMostrado(gastado: number, limite: number): number {
  if (limite <= 0) return 0;
  return Math.floor((gastado / limite) * 100);
}

// ES: Porcentaje recortado (clamp) a 0..100 para el ancho de la barra.
// EN: Percentage clamped to 0..100 for the bar width.
function porcentajeBarra(gastado: number, limite: number): number {
  return Math.min(100, Math.max(0, porcentajeReal(gastado, limite)));
}

// ES: Clase de color del relleno de la barra según el % gastado.
// EN: Bar fill color class according to the % spent.
function colorBarra(gastado: number, limite: number): string {
  const pct = porcentajeReal(gastado, limite);
  if (pct > 100) return "bg-danger"; // ES: rojo — te has pasado / EN: red — over budget
  if (pct >= 80) return "bg-warn"; // ES: ámbar — al borde / EN: amber — on the edge
  return "bg-ok"; // ES: verde — tranquilo / EN: green — calm
}

// ES: Clase de color del texto del porcentaje (a juego con la barra).
// EN: Percentage text color class (matching the bar).
function colorTexto(gastado: number, limite: number): string {
  const pct = porcentajeReal(gastado, limite);
  if (pct > 100) return "text-danger";
  if (pct >= 80) return "text-warn";
  return "text-ok";
}

// ES: Lo que queda dentro del sobre (límite - gastado). Puede ser negativo.
// EN: What's left inside the envelope (limit - spent). Can be negative.
function quedan(gastado: number, limite: number): number {
  return Math.round((limite - gastado) * 100) / 100;
}
</script>

<template>
  <!-- ES: Contenedor de la vista / EN: View container -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- ES: 1. Cabecera: título + texto explicativo / EN: 1. Header: title + explanatory text -->
    <header class="mb-6">
      <h1 class="font-display text-2xl font-bold">{{ t("titulo") }}</h1>
      <p class="mt-1 text-sm text-muted">
        {{ t("subtitulo") }}
      </p>
    </header>

    <!-- ES: 2. Resumen del reparto global del mes / EN: 2. Summary of the month's global split -->
    <section class="mb-6 grid gap-4 sm:grid-cols-3">
      <!-- ES: Ingresos del mes / EN: Monthly income -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <p class="text-sm text-muted">{{ t("ingresosMes") }}</p>
        <p class="mt-1 font-display text-xl font-bold text-ink">
          {{ euro(finanzas.ingresos) }}
        </p>
      </article>

      <!-- ES: Presupuestado (suma de todos los topes) / EN: Budgeted (sum of all limits) -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <p class="text-sm text-muted">{{ t("presupuestado") }}</p>
        <p class="mt-1 font-display text-xl font-bold text-brand">
          {{ euro(presupuestado) }}
        </p>
        <p class="mt-1 text-xs text-faint">{{ t("sumaSobres") }}</p>
      </article>

      <!-- ES: Sin presupuestar (ingresos - presupuestado) / EN: Unbudgeted (income - budgeted) -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <p class="text-sm text-muted">{{ t("sinPresupuestar") }}</p>
        <!-- ES: verde si queda dinero libre, rojo si has presupuestado de más -->
        <!-- EN: green if free money is left, red if you over-budgeted -->
        <p
          class="mt-1 font-display text-xl font-bold"
          :class="sinPresupuestar < 0 ? 'text-danger' : 'text-ok'"
        >
          {{ euro(sinPresupuestar) }}
        </p>
        <p class="mt-1 text-xs text-faint">
          {{ sinPresupuestar < 0 ? t("pasadoSobres") : t("dineroLibre") }}
        </p>
      </article>
    </section>

    <!-- ES: 3. Estado vacío: no hay presupuestos -> no hay sobres -->
    <!-- EN: 3. Empty state: no budgets -> no envelopes -->
    <div
      v-if="finanzas.presupuestos.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">✉️</p>
      <p class="mt-3 font-display font-bold text-ink">{{ t("sinSobresTitulo") }}</p>
      <p class="mt-1 text-sm text-muted">
        {{ t("sinSobresTexto1") }} <span class="font-medium text-ink">{{ t("presupuestosSeccion") }}</span>
        {{ t("sinSobresTexto2") }}
      </p>
    </div>

    <!-- ES: 4. Lista de sobres (uno por presupuesto) + sobre especial al final -->
    <!-- EN: 4. Envelope list (one per budget) + special envelope at the end -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <!-- ES: Un sobre por cada presupuesto/tope definido / EN: One envelope per defined budget/limit -->
      <article
        v-for="p in finanzas.presupuestos"
        :key="p.categoria"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- ES: Cabecera del sobre: punto de color + categoría / EN: Envelope header: color dot + category -->
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-3 w-3 shrink-0 rounded-full"
            :style="{ backgroundColor: colorCategoria(p.categoria) }"
          ></span>
          <h2 class="font-display font-bold leading-tight truncate">
            {{ p.categoria }}
          </h2>
        </div>

        <!-- ES: Barra de progreso gastado / límite / EN: Spent / limit progress bar -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- ES: Relleno: ancho recortado a 0..100, color según el % gastado -->
            <!-- EN: Fill: width clamped to 0..100, color by % spent -->
            <div
              class="h-full rounded-full transition-all"
              :class="colorBarra(gastoDe(p.categoria), p.limite)"
              :style="{ width: porcentajeBarra(gastoDe(p.categoria), p.limite) + '%' }"
            ></div>
          </div>

          <!-- ES: Texto: gastado X de Y (N%) — el % mostrado va redondeado hacia abajo
                   para no enseñar "100%" mientras todavía quedan euros (coherente con
                   la línea de "Quedan"). -->
          <!-- EN: Text: spent X of Y (N%) — the % shown is floored so it never reads
                   "100%" while euros still remain (coherent with the "Remaining" line). -->
          <p class="mt-2 text-xs text-muted">
            {{ t("gastado") }} {{ euro(gastoDe(p.categoria)) }} {{ t("de") }} {{ euro(p.limite) }}
            (<span :class="colorTexto(gastoDe(p.categoria), p.limite)">{{ porcentajeMostrado(gastoDe(p.categoria), p.limite) }}%</span>)
          </p>

          <!-- ES: Cuánto queda en el sobre: positivo = "quedan X€",
                   negativo = "te has pasado X€". -->
          <!-- EN: How much is left in the envelope: positive = "Remaining X€",
                   negative = "You're over by X€". -->
          <p
            class="mt-1 text-sm font-medium"
            :class="quedan(gastoDe(p.categoria), p.limite) < 0 ? 'text-danger' : 'text-ok'"
          >
            <template v-if="quedan(gastoDe(p.categoria), p.limite) < 0">
              {{ t("tePasaste") }} {{ euro(-quedan(gastoDe(p.categoria), p.limite)) }}
            </template>
            <template v-else>
              {{ t("quedan") }} {{ euro(quedan(gastoDe(p.categoria), p.limite)) }}
            </template>
          </p>
        </div>
      </article>

      <!-- ES: 4b. Sobre especial: gasto del mes en categorías SIN sobre -->
      <!-- EN: 4b. Special envelope: month's spending in categories WITHOUT an envelope -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <!-- ES: Cabecera del sobre especial / EN: Special envelope header -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="h-3 w-3 shrink-0 rounded-full bg-faint"></span>
          <h2 class="font-display font-bold leading-tight truncate">
            {{ t("otrosGastos") }}
          </h2>
        </div>

        <!-- ES: Cifra del gasto no presupuestado / EN: Unbudgeted spending figure -->
        <div class="mt-4">
          <p class="font-display text-lg font-bold text-ink">
            {{ euro(gastoSinSobre) }}
          </p>
          <!-- ES: Texto según haya o no gasto fuera de sobres -->
          <!-- EN: Text depending on whether there is spending outside envelopes -->
          <p class="mt-1 text-xs text-muted">
            <template v-if="gastoSinSobre > 0">
              {{ t("gastoSinTope") }}
            </template>
            <template v-else>
              {{ t("sinGastoFuera") }}
            </template>
          </p>
        </div>
      </article>
    </div>
  </div>
</template>
