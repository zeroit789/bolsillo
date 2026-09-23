<script setup lang="ts">
/* =============================================================================
 * GraficaDona.vue — Gráfica de dona del gasto por categoría / Donut chart of spending by category
 * -----------------------------------------------------------------------------
 * ES: Una dona en SVG puro (sin librerías) que dibuja un segmento de anillo por
 *     categoría, cada uno con su color de categoría (colorCategoria). El agujero
 *     central muestra el total gastado; al lado, una leyenda lista cada categoría
 *     con su color, nombre, importe y porcentaje. Muestra un estado vacío amable
 *     cuando no hay gastos. Totalmente responsivo.
 * EN: A pure-SVG donut (no libraries) that draws one ring segment per category,
 *     each in its own category color (colorCategoria). The hole in the middle
 *     shows the total spent; a legend next to it lists each category with its
 *     color, name, amount and percentage. Shows a friendly empty state when
 *     there are no expenses. Fully responsive.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y textos i18n / Imports & i18n texts
 *   2. Props y tipos / Props & types
 *   3. Total y constantes de geometría / Total & geometry constants
 *   4. Segmentos (matemática de arcos) / Segments (arc maths)
 *   5. Filas de la leyenda / Legend rows
 *   6. Plantilla / Template
 * ===========================================================================*/

// ── 1. Imports y textos i18n / Imports & i18n texts ───────────────────────────
import { computed } from "vue";
import { euro } from "../utils/format";
import { colorCategoria } from "../data/categorias";
import { crearT } from "../i18n";

// ES: Textos visibles del componente (ES/EN).
// EN: Component's visible texts (ES/EN).
const t = crearT({
  total: { es: "Total", en: "Total" },
  sinGastos: { es: "Sin gastos este mes.", en: "No expenses this month." },
});

// ── 2. Props y tipos / Props & types ──────────────────────────────────────────
// ES: Forma de cada dato: un nombre de categoría y su total gastado.
// EN: Shape of each datum: a category name and its total spent.
interface DatoCategoria {
  categoria: string;
  total: number;
}

// ES: Prop `datos`: array de { categoria, total } (ej. f.gastoPorCategoria).
// EN: Prop `datos`: array of { categoria, total } (e.g. f.gastoPorCategoria).
const props = defineProps<{ datos: DatoCategoria[] }>();

// ── 3. Total y constantes de geometría / Total & geometry constants ───────────
// ES: Suma de los totales de todas las categorías (el 100 % de la dona).
// EN: Sum of all the categories' totals (the donut's 100 %).
const totalGasto = computed<number>(() =>
  props.datos.reduce((acc, d) => acc + d.total, 0)
);

// ES: ¿Hay algo que dibujar? (controla el estado vacío).
// EN: Is there anything to draw? (controls the empty state).
const hayDatos = computed<boolean>(() => totalGasto.value > 0 && props.datos.length > 0);

// ES: Geometría del SVG. El viewBox es 100x100; el anillo se centra en (50,50).
//     RADIO es el radio de la línea media del anillo y GROSOR su ancho de trazo,
//     así el anillo visible va de RADIO-GROSOR/2 a RADIO+GROSOR/2.
// EN: SVG geometry. The viewBox is 100x100; the ring is centered at (50,50).
//     RADIO is the ring's mid-line radius and GROSOR its stroke width, so the
//     visible ring spans from RADIO-GROSOR/2 to RADIO+GROSOR/2.
const CENTRO = 50;
const RADIO = 40;
const GROSOR = 16;
// ES: Circunferencia completa del círculo de la línea media (para medir cada arco).
// EN: Full circumference of the mid-line circle (used to size each arc).
const CIRCUNFERENCIA = 2 * Math.PI * RADIO;

// ── 4. Segmentos (matemática de arcos) / Segments (arc maths) ─────────────────
// ES: Tipo de un segmento listo para pintar: su color, la longitud de arco
//     visible (una porción de la circunferencia) y el desfase donde empieza.
//     Cada segmento se pinta como un círculo con dasharray [arcoVisible, resto]
//     rotado por su desfase acumulado: el truco clásico de dona en SVG sin libs.
// EN: Type of a ready-to-draw segment: its color, its visible arc length (a
//     slice of the circumference) and the offset where it starts. We draw each
//     segment as a circle with a dasharray of [arcVisible, resto] rotated by its
//     accumulated offset, which is the classic library-free SVG donut trick.
interface Segmento {
  categoria: string;
  color: string;
  arco: number; // ES: longitud del arco visible / EN: visible arc length
  offset: number; // ES: dónde empieza este arco / EN: where this arc starts
}

// ES: Construye cada segmento en orden, acumulando el offset para que cada uno
//     empiece donde acabó el anterior. Se deja un hueco mínimo (SEPARACION)
//     entre segmentos solo si hay más de uno, para separarlos visualmente.
// EN: Builds every segment in order, accumulating the offset so each one starts
//     where the previous finished. A tiny gap (SEPARACION) is left between
//     segments only when there is more than one, for visual separation.
const SEPARACION = 1; // ES: hueco en unidades de usuario / EN: gap in user units
const segmentos = computed<Segmento[]>(() => {
  if (!hayDatos.value) return [];
  // ES: Con una sola categoría, sin hueco para que el anillo cierre del todo.
  // EN: With a single category, no gap so the ring is fully closed.
  const gap = props.datos.length > 1 ? SEPARACION : 0;
  let acumulado = 0; // ES: acumulador de offset / EN: offset accumulator
  return props.datos.map((d) => {
    // ES: Fracción del total que representa esta categoría (0..1).
    // EN: Fraction of the total this category represents (0..1).
    const fraccion = d.total / totalGasto.value;
    // ES: Longitud completa de la porción en la circunferencia; el arco visible resta el hueco.
    // EN: Full slice length on the circumference; the visible arc subtracts the gap.
    const porcion = fraccion * CIRCUNFERENCIA;
    const arco = Math.max(0, porcion - gap);
    const seg: Segmento = {
      categoria: d.categoria,
      color: colorCategoria(d.categoria),
      arco,
      offset: acumulado,
    };
    acumulado += porcion;
    return seg;
  });
});

// ── 5. Filas de la leyenda / Legend rows ──────────────────────────────────────
// ES: Tipo de una fila de la leyenda: color, nombre, importe y porcentaje entero.
// EN: Type of a legend row: color, name, amount and integer percentage.
interface FilaLeyenda {
  categoria: string;
  color: string;
  total: number;
  porcentaje: number;
}

// ES: Una fila de leyenda por categoría, con su parte redondeada a porcentaje entero.
// EN: One legend row per category, with its share rounded to a whole percent.
const leyenda = computed<FilaLeyenda[]>(() =>
  props.datos.map((d) => ({
    categoria: d.categoria,
    color: colorCategoria(d.categoria),
    total: d.total,
    // ES: Redondea a % entero; protegido contra división por cero.
    // EN: Round to integer %; guarded against division by zero.
    porcentaje: totalGasto.value > 0 ? Math.round((d.total / totalGasto.value) * 100) : 0,
  }))
);
</script>

<!-- ── 6. Template / Plantilla ───────────────────────────────────────────────── -->
<template>
  <!-- ES: Estado vacío: mensaje amable cuando no hay gastos. -->
  <!-- EN: Empty state: friendly message when there are no expenses. -->
  <div v-if="!hayDatos" class="text-muted text-sm">{{ t("sinGastos") }}</div>

  <!-- ES: Gráfica + leyenda. En pantallas pequeñas se apila; en sm+ va en paralelo. -->
  <!-- EN: Chart + legend. On small screens it stacks; on sm+ it sits side by side. -->
  <div v-else class="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
    <!-- ES: SVG de la dona. Rotado -90º para que los segmentos empiecen arriba (12 en punto). -->
    <!-- EN: Donut SVG. Rotated -90deg so segments start at 12 o'clock. -->
    <div class="shrink-0">
      <svg viewBox="0 0 100 100" class="h-44 w-44 -rotate-90">
        <!-- ES: Pista: anillo completo tenue bajo los segmentos. -->
        <!-- EN: Track: faint full ring under the segments. -->
        <circle
          :cx="CENTRO"
          :cy="CENTRO"
          :r="RADIO"
          fill="none"
          class="text-surface-2"
          stroke="currentColor"
          :stroke-width="GROSOR"
        />
        <!-- ES: Un arco coloreado por categoría (dasharray = [arco visible, resto]). -->
        <!-- EN: One colored arc per category (dasharray = [visible arc, rest]). -->
        <circle
          v-for="s in segmentos"
          :key="s.categoria"
          :cx="CENTRO"
          :cy="CENTRO"
          :r="RADIO"
          fill="none"
          :stroke="s.color"
          :stroke-width="GROSOR"
          :stroke-dasharray="`${s.arco} ${CIRCUNFERENCIA - s.arco}`"
          :stroke-dashoffset="-s.offset"
        />
      </svg>
    </div>

    <!-- ES: Total central + leyenda apilados a la derecha de la dona. -->
    <!-- EN: Center total + legend stacked to the right of the donut. -->
    <div class="min-w-0 flex-1">
      <!-- ES: Total gastado (el valor "central" de la dona, mostrado aquí como cabecera). -->
      <!-- EN: Total spent (the donut's "center" value, shown as a heading here). -->
      <p class="text-xs text-muted">{{ t("total") }}</p>
      <p class="font-display font-bold text-xl text-ink tabular-nums">{{ euro(totalGasto) }}</p>

      <!-- ES: Leyenda: muestra de color + categoría + importe + porcentaje por fila. -->
      <!-- EN: Legend: color swatch + category + amount + percentage per row. -->
      <ul class="mt-3 space-y-2">
        <li
          v-for="fila in leyenda"
          :key="fila.categoria"
          class="flex items-center gap-2 text-sm"
        >
          <!-- ES: Muestra de color que coincide con la categoría. -->
          <!-- EN: Color swatch matching the category. -->
          <span
            class="size-3 shrink-0 rounded-full"
            :style="{ backgroundColor: fila.color }"
          />
          <!-- ES: Nombre de la categoría (se corta si es muy largo). -->
          <!-- EN: Category name (truncates if too long). -->
          <span class="min-w-0 flex-1 truncate text-muted">{{ fila.categoria }}</span>
          <!-- ES: Importe en euros. / EN: Amount in euros. -->
          <span class="tabular-nums text-ink">{{ euro(fila.total) }}</span>
          <!-- ES: Porcentaje del total. / EN: Percentage of the total. -->
          <span class="tabular-nums text-faint w-10 text-right">{{ fila.porcentaje }}%</span>
        </li>
      </ul>
    </div>
  </div>
</template>
