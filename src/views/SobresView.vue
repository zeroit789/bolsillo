<script setup lang="ts">
/* ===========================================================================
   Vista "Sobres".
   Metáfora del sobre de toda la vida: el dinero del mes se reparte en sobres
   (uno por cada categoría con tope/presupuesto) y se ve cuánto se ha gastado
   de cada uno y cuánto queda dentro.

   NO inventa un modelo de datos nuevo: reutiliza lo que ya existe en el store
   useFinanzas:
     - presupuestos        -> los topes por categoría = los "sobres" de gasto.
     - gastoPorCategoria   -> gasto del mes seleccionado, por categoría.
     - ingresos / disponible / totalGastos -> KPIs del mes (números).

   Sobres que se pintan:
     1. Un sobre por cada presupuesto (categoría + tope): gastado / límite,
        barra de color y "quedan X€" (o "te has pasado X€" si es negativo).
     2. Un sobre especial "Otros gastos (sin sobre)": suma del gasto del mes en
        categorías que NO tienen presupuesto definido.

   Colores de la barra (igual que en PresupuestosView, para mantener coherencia):
       < 80%   -> verde  (bg-ok)     situación tranquila
       80-100% -> ámbar  (bg-warn)   ojo, te acercas al tope
       > 100%  -> rojo   (bg-danger) te has pasado del sobre
   =========================================================================== */
import { computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro } from "../utils/format";
import { colorCategoria } from "../data/categorias";

// Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// --- Datos base del mes ---

// Mapa categoría -> gasto del mes, derivado de finanzas.gastoPorCategoria.
// Reactivo: se recalcula cuando cambia el gasto o el mes seleccionado.
const gastoPorCat = computed<Map<string, number>>(() => {
  const mapa = new Map<string, number>();
  for (const g of finanzas.gastoPorCategoria) {
    mapa.set(g.categoria, g.total);
  }
  return mapa;
});

// Gasto del mes de una categoría concreta (0 si no hay gasto registrado).
function gastoDe(categoria: string): number {
  return gastoPorCat.value.get(categoria) ?? 0;
}

// --- Resumen superior (reparto global del mes) ---

// Suma de todos los topes definidos = total presupuestado ("metido en sobres").
const presupuestado = computed<number>(() =>
  finanzas.presupuestos.reduce((acc, p) => acc + p.limite, 0)
);

// Dinero del mes que NO está asignado a ningún sobre (puede ser negativo si los
// topes superan los ingresos del mes; en ese caso significa que has presupuestado
// más de lo que ingresas).
const sinPresupuestar = computed<number>(() => finanzas.ingresos - presupuestado.value);

// --- Sobre especial: gasto en categorías SIN presupuesto ---

// Conjunto de categorías que SÍ tienen sobre (presupuesto definido).
const categoriasConSobre = computed<Set<string>>(
  () => new Set(finanzas.presupuestos.map((p) => p.categoria))
);

// Suma del gasto del mes en categorías que no tienen sobre.
const gastoSinSobre = computed<number>(() => {
  let total = 0;
  for (const g of finanzas.gastoPorCategoria) {
    if (!categoriasConSobre.value.has(g.categoria)) total += g.total;
  }
  return total;
});

// --- Helpers de barra/porcentaje (idénticos en criterio a PresupuestosView) ---

// Porcentaje REAL gastado sobre el límite (puede superar 100).
// Límite <= 0 -> 0 para no dividir por cero.
function porcentajeReal(gastado: number, limite: number): number {
  if (limite <= 0) return 0;
  return Math.round((gastado / limite) * 100);
}

// Porcentaje recortado (clamp) a 0..100 para el ancho de la barra.
function porcentajeBarra(gastado: number, limite: number): number {
  return Math.min(100, Math.max(0, porcentajeReal(gastado, limite)));
}

// Clase de color del relleno de la barra según el % gastado.
function colorBarra(gastado: number, limite: number): string {
  const pct = porcentajeReal(gastado, limite);
  if (pct > 100) return "bg-danger"; // rojo — te has pasado
  if (pct >= 80) return "bg-warn"; // ámbar — al borde
  return "bg-ok"; // verde — tranquilo
}

// Clase de color del texto del porcentaje (a juego con la barra).
function colorTexto(gastado: number, limite: number): string {
  const pct = porcentajeReal(gastado, limite);
  if (pct > 100) return "text-danger";
  if (pct >= 80) return "text-warn";
  return "text-ok";
}

// Lo que queda dentro del sobre (límite - gastado). Puede ser negativo.
function quedan(gastado: number, limite: number): number {
  return Math.round((limite - gastado) * 100) / 100;
}
</script>

<template>
  <!-- Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- 1. Cabecera: título + texto explicativo -->
    <header class="mb-6">
      <h1 class="font-display text-2xl font-bold">Sobres</h1>
      <p class="mt-1 text-sm text-muted">
        Reparte tu dinero del mes en sobres y controla cada uno
      </p>
    </header>

    <!-- 2. Resumen del reparto global del mes -->
    <section class="mb-6 grid gap-4 sm:grid-cols-3">
      <!-- Ingresos del mes -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <p class="text-sm text-muted">Ingresos del mes</p>
        <p class="mt-1 font-display text-xl font-bold text-ink">
          {{ euro(finanzas.ingresos) }}
        </p>
      </article>

      <!-- Presupuestado (suma de todos los topes) -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <p class="text-sm text-muted">Presupuestado</p>
        <p class="mt-1 font-display text-xl font-bold text-brand">
          {{ euro(presupuestado) }}
        </p>
        <p class="mt-1 text-xs text-faint">Suma de todos tus sobres</p>
      </article>

      <!-- Sin presupuestar (ingresos - presupuestado) -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <p class="text-sm text-muted">Sin presupuestar</p>
        <!-- Verde si queda dinero libre, rojo si has presupuestado de más -->
        <p
          class="mt-1 font-display text-xl font-bold"
          :class="sinPresupuestar < 0 ? 'text-danger' : 'text-ok'"
        >
          {{ euro(sinPresupuestar) }}
        </p>
        <p class="mt-1 text-xs text-faint">
          {{ sinPresupuestar < 0 ? "Has metido en sobres más de lo que ingresas" : "Dinero libre, fuera de sobres" }}
        </p>
      </article>
    </section>

    <!-- 3. Estado vacío: no hay presupuestos -> no hay sobres -->
    <div
      v-if="finanzas.presupuestos.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">✉️</p>
      <p class="mt-3 font-display font-bold text-ink">Aún no tienes ningún sobre</p>
      <p class="mt-1 text-sm text-muted">
        Crea topes por categoría en la sección <span class="font-medium text-ink">Presupuestos</span>
        y aquí verás cómo se reparte el dinero del mes en cada sobre.
      </p>
    </div>

    <!-- 4. Lista de sobres (uno por presupuesto) + sobre especial al final -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <!-- Un sobre por cada presupuesto/tope definido -->
      <article
        v-for="p in finanzas.presupuestos"
        :key="p.categoria"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- Cabecera del sobre: punto de color + categoría -->
        <div class="flex items-center gap-2 min-w-0">
          <span
            class="h-3 w-3 shrink-0 rounded-full"
            :style="{ backgroundColor: colorCategoria(p.categoria) }"
          ></span>
          <h2 class="font-display font-bold leading-tight truncate">
            {{ p.categoria }}
          </h2>
        </div>

        <!-- Barra de progreso gastado / límite -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- Relleno: ancho recortado a 0..100, color según el % gastado -->
            <div
              class="h-full rounded-full transition-all"
              :class="colorBarra(gastoDe(p.categoria), p.limite)"
              :style="{ width: porcentajeBarra(gastoDe(p.categoria), p.limite) + '%' }"
            ></div>
          </div>

          <!-- Texto: gastado X de Y (N%) — el % es el REAL (puede pasar de 100) -->
          <p class="mt-2 text-xs text-muted">
            Gastado {{ euro(gastoDe(p.categoria)) }} de {{ euro(p.limite) }}
            (<span :class="colorTexto(gastoDe(p.categoria), p.limite)">{{ porcentajeReal(gastoDe(p.categoria), p.limite) }}%</span>)
          </p>

          <!-- Cuánto queda en el sobre: positivo = "quedan X€", negativo = "te has pasado X€" -->
          <p
            class="mt-1 text-sm font-medium"
            :class="quedan(gastoDe(p.categoria), p.limite) < 0 ? 'text-danger' : 'text-ok'"
          >
            <template v-if="quedan(gastoDe(p.categoria), p.limite) < 0">
              Te has pasado {{ euro(-quedan(gastoDe(p.categoria), p.limite)) }}
            </template>
            <template v-else>
              Quedan {{ euro(quedan(gastoDe(p.categoria), p.limite)) }}
            </template>
          </p>
        </div>
      </article>

      <!-- 4b. Sobre especial: gasto del mes en categorías SIN sobre -->
      <article class="rounded-2xl bg-surface border border-border p-5">
        <!-- Cabecera del sobre especial -->
        <div class="flex items-center gap-2 min-w-0">
          <span class="h-3 w-3 shrink-0 rounded-full bg-faint"></span>
          <h2 class="font-display font-bold leading-tight truncate">
            Otros gastos (sin sobre)
          </h2>
        </div>

        <!-- Cifra del gasto no presupuestado -->
        <div class="mt-4">
          <p class="font-display text-lg font-bold text-ink">
            {{ euro(gastoSinSobre) }}
          </p>
          <!-- Texto según haya o no gasto fuera de sobres -->
          <p class="mt-1 text-xs text-muted">
            <template v-if="gastoSinSobre > 0">
              Gasto del mes en categorías sin tope asignado
            </template>
            <template v-else>
              No tienes gastos fuera de tus sobres este mes
            </template>
          </p>
        </div>
      </article>
    </div>
  </div>
</template>
