<script setup lang="ts">
/* =============================================================================
 * GraficaEvolucion.vue — Gráfica evolución ingresos vs gastos / Income vs expenses trend chart
 * -----------------------------------------------------------------------------
 * ES: Gráfica de barras SVG sin librerías externas que muestra la evolución
 *     mensual de ingresos vs gastos. Por cada mes dibuja dos barras juntas:
 *     una verde (ingresos) y una roja (gastos), ambas escaladas al valor máximo
 *     del conjunto. Pensada para encajar en el tema dark de Bolsillo (Tailwind v4).
 * EN: Dependency-free SVG bar chart showing the monthly trend of income vs
 *     expenses. For each month it draws two adjacent bars: green (income) and
 *     red (expenses), both scaled to the dataset's maximum value. Designed to
 *     fit Bolsillo's dark theme (Tailwind v4).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y traducciones / Imports & translations
 *   2. Tipos y props / Types & props
 *   3. Datos preparados (máximo, últimos 12 meses) / Prepared data (max, last 12 months)
 *   4. Geometría del SVG (viewBox, márgenes) / SVG geometry (viewBox, margins)
 *   5. Posicionado de barras y etiquetas por mes / Bar/label layout by month
 *   6. Ayudante de etiqueta de mes / Month label helper
 * ===========================================================================*/
import { computed } from "vue";
// ES: Utilidades de formato: euro() para tooltips, mesLegible() para el mes completo.
// EN: Format helpers: euro() for tooltips, mesLegible() for the full month name.
import { euro, mesLegible } from "../utils/format";
// ES: Sistema de traducción propio (ES/EN reactivo). / EN: Project's own i18n system (reactive ES/EN).
import { crearT } from "../i18n";

// ── 1. Imports y traducciones / Imports & translations ────────────────────────
// ES: Todos los textos visibles fijos del componente, en español e inglés.
// EN: All the component's fixed visible texts, in Spanish and English.
const t = crearT({
  titulo: { es: "Evolución", en: "Trend" },
  ingresos: { es: "Ingresos", en: "Income" },
  gastos: { es: "Gastos", en: "Expenses" },
  sinDatos: { es: "Aún no hay datos suficientes", en: "Not enough data yet" },
  aria: {
    es: "Gráfica de evolución de ingresos y gastos por mes",
    en: "Chart showing income and expenses trend by month",
  },
});

// ── 2. Tipos y props / Types & props ─────────────────────────────────────────
// ES: Forma mínima que necesita el componente. Es compatible estructuralmente con
//     el tipo ResumenMes del store (mismas claves), así que se le puede pasar el
//     historial tal cual sin acoplar este componente al store.
// EN: Minimal shape the component needs. It is structurally compatible with the
//     store's ResumenMes type (same keys), so the history can be passed as-is
//     without coupling this component to the store.
interface MesGrafica {
  mes: string; // ES: "YYYY-MM". / EN: "YYYY-MM".
  ingresos: number;
  totalGastos: number;
  disponible: number;
}

// ES: `meses` llega ordenado ASCENDENTE (antiguo → reciente), como en el store.
// EN: `meses` arrives in ASCENDING order (oldest → newest), like in the store.
const props = defineProps<{
  meses: MesGrafica[];
}>();

// ── 3. Datos preparados (máximo, últimos 12 meses) / Prepared data (max, last 12 months) ──
// ES: Toma los últimos 12 meses (los más recientes). Como ya vienen en orden
//     ascendente, se pintan de izquierda (antiguo) a derecha (reciente) sin
//     invertir. slice(-12) conserva intacto ese orden ascendente.
// EN: Takes the last 12 months (the most recent). Since they already come in
//     ascending order, they are painted from left (oldest) to right (newest)
//     without reversing. slice(-12) keeps that ascending order intact.
const datos = computed<MesGrafica[]>(() => {
  return props.meses.slice(-12);
});

// ES: Valor máximo entre todos los ingresos y gastos del conjunto. Sirve de tope
//     para escalar las barras. Se fuerza a >= 0 por seguridad.
// EN: Highest value among all income and expenses in the set. Used as the cap
//     for scaling the bars. Forced to >= 0 for safety.
const maximo = computed<number>(() => {
  let max = 0;
  for (const m of datos.value) {
    if (m.ingresos > max) max = m.ingresos;
    if (m.totalGastos > max) max = m.totalGastos;
  }
  return max;
});

// ES: ¿Hay algo que pintar? False si no hay meses o si todo está a 0.
// EN: Is there anything to paint? False if there are no months or all are 0.
const hayDatos = computed<boolean>(() => {
  return datos.value.length > 0 && maximo.value > 0;
});

// ── 4. Geometría del SVG (viewBox, márgenes) / SVG geometry (viewBox, margins) ──
// ES: Trabajamos en un sistema de coordenadas fijo (viewBox) y dejamos que el SVG
//     escale a su contenedor (width:100%). Así no necesitamos medir el DOM.
// EN: We work in a fixed coordinate system (viewBox) and let the SVG scale to its
//     container (width:100%). That way we never need to measure the DOM.
const ANCHO = 720; // ES: ancho lógico del lienzo. / EN: logical canvas width.
const ALTO = 260; // ES: alto lógico del lienzo. / EN: logical canvas height.
const MARGEN_SUP = 16; // ES: espacio arriba para que la barra más alta respire. / EN: top room so the tallest bar breathes.
const MARGEN_INF = 28; // ES: espacio abajo para las etiquetas de mes. / EN: bottom room for the month labels.
const MARGEN_LAT = 8; // ES: margen lateral. / EN: side margin.
// ES: Ancho útil de la gráfica (lienzo menos los dos márgenes laterales). / EN: Usable plot width (canvas minus both side margins).
const ANCHO_GRAFICA = ANCHO - MARGEN_LAT * 2;
// ES: Alto útil de las barras (lienzo menos márgenes sup.+inf.). / EN: Usable plot height for the bars (canvas minus top+bottom margins).
const ALTO_GRAFICA = ALTO - MARGEN_SUP - MARGEN_INF;
// ES: Coordenada Y del suelo (eje X): las barras crecen hacia arriba desde aquí. / EN: Y coordinate of the floor (X axis): bars grow upward from here.
const BASE_Y = MARGEN_SUP + ALTO_GRAFICA;

// ES: Tipo de cada barra ya posicionada, lista para el <template>.
// EN: Shape of each already-positioned bar, ready for the <template>.
interface Barra {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  color: string; // ES: var(--color-ok) o var(--color-danger). / EN: var(--color-ok) or var(--color-danger).
  titulo: string; // ES: texto del <title> (tooltip nativo). / EN: <title> text (native tooltip).
}

// ES: Tipo de cada grupo (un mes): sus dos barras + la etiqueta inferior.
// EN: Shape of each group (one month): its two bars + the bottom label.
interface GrupoMes {
  key: string; // ES: clave única para v-for ("YYYY-MM"). / EN: unique key for v-for ("YYYY-MM").
  etiqueta: string; // ES: mes abreviado a 3 letras, p.ej. "jun". / EN: 3-letter abbreviated month, e.g. "jun".
  centroX: number; // ES: X central del grupo (para colocar la etiqueta). / EN: group's center X (to place the label).
  barras: Barra[]; // ES: [ingresos, gastos]. / EN: [income, expenses].
}

// ── 5. Posicionado de barras y etiquetas por mes / Bar/label layout by month ──
// ES: Calcula la posición de cada barra y etiqueta a partir de los datos.
// EN: Computes the position of each bar and label from the data.
const grupos = computed<GrupoMes[]>(() => {
  const n = datos.value.length;
  if (n === 0 || maximo.value <= 0) return [];

  // ES: Cada mes ocupa una "ranura" del ancho disponible. Dentro de la ranura van
  //     dos barras pegadas (ingresos + gastos) y un hueco de separación entre meses.
  // EN: Each month gets a "slot" of the available width. Inside the slot sit two
  //     adjacent bars (income + expenses), plus a gap separating the months.
  const anchoRanura = ANCHO_GRAFICA / n;
  const huecoEntreMeses = anchoRanura * 0.28; // ES: margen a izq/dcha de cada par. / EN: left/right margin of each pair.
  const anchoPar = anchoRanura - huecoEntreMeses; // ES: espacio para las dos barras. / EN: room for the two bars.
  const separacionBarras = anchoPar * 0.12; // ES: separación entre las dos barras. / EN: gap between the two bars.
  const anchoBarra = (anchoPar - separacionBarras) / 2; // ES: ancho de cada barra. / EN: width of each bar.

  const lista: GrupoMes[] = [];

  for (let i = 0; i < n; i++) {
    const m = datos.value[i];
    // ES: Inicio izquierdo de la ranura (dejando el margen lateral). / EN: Left start of the slot (leaving the side margin).
    const ranuraX = MARGEN_LAT + i * anchoRanura + huecoEntreMeses / 2;

    // ES: Alturas proporcionales al máximo (maximo > 0 garantizado aquí).
    // EN: Heights proportional to the maximum (maximo > 0 guaranteed here).
    const altoIng = (m.ingresos / maximo.value) * ALTO_GRAFICA;
    const altoGas = (m.totalGastos / maximo.value) * ALTO_GRAFICA;

    // ES: Barra de ingresos (izquierda, verde). / EN: Income bar (left, green).
    const xIng = ranuraX;
    const barraIng: Barra = {
      x: xIng,
      y: BASE_Y - altoIng, // ES: parte superior de la barra = suelo menos su altura. / EN: top of the bar = floor minus its height.
      ancho: anchoBarra,
      alto: altoIng,
      color: "var(--color-ok)",
      titulo: `${mesLegible(m.mes)} · ${t("ingresos")} ${euro(m.ingresos)}`,
    };

    // ES: Barra de gastos (derecha, roja), desplazada un ancho de barra + la separación.
    // EN: Expenses bar (right, red), offset by one bar width + the gap.
    const xGas = ranuraX + anchoBarra + separacionBarras;
    const barraGas: Barra = {
      x: xGas,
      y: BASE_Y - altoGas,
      ancho: anchoBarra,
      alto: altoGas,
      color: "var(--color-danger)",
      titulo: `${mesLegible(m.mes)} · ${t("gastos")} ${euro(m.totalGastos)}`,
    };

    lista.push({
      key: m.mes,
      etiqueta: etiquetaMes(m.mes),
      centroX: ranuraX + anchoPar / 2, // ES: centro del par, para la etiqueta. / EN: center of the pair, for the label.
      barras: [barraIng, barraGas],
    });
  }

  return lista;
});

// ── 6. Ayudante de etiqueta de mes / Month label helper ───────────────────────
// ES: Devuelve el mes abreviado a 3 letras en minúscula: "2026-06" -> "jun".
// EN: Returns the month abbreviated to 3 lowercase letters: "2026-06" -> "jun".
function etiquetaMes(mes: string): string {
  // ES: mesLegible("2026-06") = "Junio 2026" -> tomamos las 3 primeras del mes.
  // EN: mesLegible("2026-06") = "Junio 2026" -> we take the first 3 of the month.
  return mesLegible(mes).slice(0, 3).toLowerCase();
}
</script>

<template>
  <!-- ES: Tarjeta contenedora, mismo estilo que el resto de tarjetas de la app. / EN: Container card, same style as the rest of the app's cards. -->
  <div class="rounded-2xl bg-surface border border-border p-5">
    <!-- ES: Cabecera: título + leyenda de colores. / EN: Header: title + color legend. -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-display font-bold text-ink">{{ t("titulo") }}</h3>

      <!-- ES: Leyenda: cuadradito verde (ingresos) y rojo (gastos). / EN: Legend: green square (income) and red square (expenses). -->
      <div class="flex items-center gap-4 text-xs text-muted no-select">
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-sm bg-ok"></span>
          {{ t("ingresos") }}
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded-sm bg-danger"></span>
          {{ t("gastos") }}
        </span>
      </div>
    </div>

    <!-- ES: Estado vacío: sin datos o todo a cero. / EN: Empty state: no data or everything at zero. -->
    <p v-if="!hayDatos" class="text-faint text-sm py-10 text-center">
      {{ t("sinDatos") }}
    </p>

    <!-- ES: Gráfica SVG responsive: ocupa el 100% del ancho y mantiene proporción. / EN: Responsive SVG chart: 100% width keeping its aspect ratio. -->
    <svg
      v-else
      :viewBox="`0 0 ${ANCHO} ${ALTO}`"
      preserveAspectRatio="xMidYMid meet"
      style="width: 100%; height: auto"
      role="img"
      :aria-label="t('aria')"
    >
      <!-- ES: Línea base del eje X (suelo de las barras). / EN: X-axis baseline (the floor the bars sit on). -->
      <line
        :x1="MARGEN_LAT"
        :y1="BASE_Y"
        :x2="ANCHO - MARGEN_LAT"
        :y2="BASE_Y"
        stroke="var(--color-border)"
        stroke-width="1"
      />

      <!-- ES: Un grupo por mes: dos barras + etiqueta del mes abreviada. / EN: One group per month: two bars + abbreviated month label. -->
      <g v-for="grupo in grupos" :key="grupo.key">
        <!-- ES: Las dos barras (ingresos y gastos). / EN: The two bars (income and expenses). -->
        <rect
          v-for="(barra, idx) in grupo.barras"
          :key="idx"
          :x="barra.x"
          :y="barra.y"
          :width="barra.ancho"
          :height="barra.alto"
          :fill="barra.color"
          rx="3"
        >
          <!-- ES: Tooltip nativo del navegador con mes + valor en euros. / EN: Native browser tooltip with month + value in euros. -->
          <title>{{ barra.titulo }}</title>
        </rect>

        <!-- ES: Etiqueta del mes (abreviada a 3 letras) centrada bajo el grupo. / EN: Month label (3-letter abbreviation) centered under the group. -->
        <text
          :x="grupo.centroX"
          :y="BASE_Y + 18"
          text-anchor="middle"
          fill="var(--color-muted)"
          font-size="12"
        >
          {{ grupo.etiqueta }}
        </text>
      </g>
    </svg>
  </div>
</template>
