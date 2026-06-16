<script setup lang="ts">
/* =============================================================================
 * GraficaEvolucion.vue — Income vs expenses trend chart / Gráfica evolución ingresos vs gastos
 * -----------------------------------------------------------------------------
 * EN: Dependency-free SVG bar chart showing the monthly trend of income vs
 *     expenses. For each month it draws two adjacent bars: green (income) and
 *     red (expenses), both scaled to the dataset's maximum value. Designed to
 *     fit Bolsillo's dark theme (Tailwind v4).
 * ES: Gráfica de barras SVG sin librerías externas que muestra la evolución
 *     mensual de ingresos vs gastos. Por cada mes dibuja dos barras juntas:
 *     una verde (ingresos) y una roja (gastos), ambas escaladas al valor máximo
 *     del conjunto. Pensada para encajar en el tema dark de Bolsillo (Tailwind v4).
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & translations / Imports y traducciones
 *   2. Types & props / Tipos y props
 *   3. Prepared data (max, last 12 months) / Datos preparados (máximo, últimos 12 meses)
 *   4. SVG geometry (viewBox, margins) / Geometría del SVG (viewBox, márgenes)
 *   5. Bar/label layout by month / Posicionado de barras y etiquetas por mes
 *   6. Month label helper / Ayudante de etiqueta de mes
 * ===========================================================================*/
import { computed } from "vue";
// EN: Format helpers: euro() for tooltips, mesLegible() for the full month name.
// ES: Utilidades de formato: euro() para tooltips, mesLegible() para el mes completo.
import { euro, mesLegible } from "../utils/format";
// EN: Project's own i18n system (reactive ES/EN). / ES: Sistema de traducción propio (ES/EN reactivo).
import { crearT } from "../i18n";

// ── 1. Imports & translations / Imports y traducciones ────────────────────────
// EN: All the component's fixed visible texts, in Spanish and English.
// ES: Todos los textos visibles fijos del componente, en español e inglés.
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

// ── 2. Types & props / Tipos y props ─────────────────────────────────────────
// EN: Minimal shape the component needs. It is structurally compatible with the
//     store's ResumenMes type (same keys), so the history can be passed as-is
//     without coupling this component to the store.
// ES: Forma mínima que necesita el componente. Es compatible estructuralmente con
//     el tipo ResumenMes del store (mismas claves), así que se le puede pasar el
//     historial tal cual sin acoplar este componente al store.
interface MesGrafica {
  mes: string; // EN: "YYYY-MM". / ES: "YYYY-MM".
  ingresos: number;
  totalGastos: number;
  disponible: number;
}

// EN: `meses` arrives in ASCENDING order (oldest → newest), like in the store.
// ES: `meses` llega ordenado ASCENDENTE (antiguo → reciente), como en el store.
const props = defineProps<{
  meses: MesGrafica[];
}>();

// ── 3. Prepared data (max, last 12 months) / Datos preparados (máximo, últimos 12 meses) ──
// EN: Takes the last 12 months (the most recent). Since they already come in
//     ascending order, they are painted from left (oldest) to right (newest)
//     without reversing. slice(-12) keeps that ascending order intact.
// ES: Toma los últimos 12 meses (los más recientes). Como ya vienen en orden
//     ascendente, se pintan de izquierda (antiguo) a derecha (reciente) sin
//     invertir. slice(-12) conserva intacto ese orden ascendente.
const datos = computed<MesGrafica[]>(() => {
  return props.meses.slice(-12);
});

// EN: Highest value among all income and expenses in the set. Used as the cap
//     for scaling the bars. Forced to >= 0 for safety.
// ES: Valor máximo entre todos los ingresos y gastos del conjunto. Sirve de tope
//     para escalar las barras. Se fuerza a >= 0 por seguridad.
const maximo = computed<number>(() => {
  let max = 0;
  for (const m of datos.value) {
    if (m.ingresos > max) max = m.ingresos;
    if (m.totalGastos > max) max = m.totalGastos;
  }
  return max;
});

// EN: Is there anything to paint? False if there are no months or all are 0.
// ES: ¿Hay algo que pintar? False si no hay meses o si todo está a 0.
const hayDatos = computed<boolean>(() => {
  return datos.value.length > 0 && maximo.value > 0;
});

// ── 4. SVG geometry (viewBox, margins) / Geometría del SVG (viewBox, márgenes) ──
// EN: We work in a fixed coordinate system (viewBox) and let the SVG scale to its
//     container (width:100%). That way we never need to measure the DOM.
// ES: Trabajamos en un sistema de coordenadas fijo (viewBox) y dejamos que el SVG
//     escale a su contenedor (width:100%). Así no necesitamos medir el DOM.
const ANCHO = 720; // EN: logical canvas width. / ES: ancho lógico del lienzo.
const ALTO = 260; // EN: logical canvas height. / ES: alto lógico del lienzo.
const MARGEN_SUP = 16; // EN: top room so the tallest bar breathes. / ES: espacio arriba para que la barra más alta respire.
const MARGEN_INF = 28; // EN: bottom room for the month labels. / ES: espacio abajo para las etiquetas de mes.
const MARGEN_LAT = 8; // EN: side margin. / ES: margen lateral.
// EN: Usable plot width (canvas minus both side margins). / ES: Ancho útil de la gráfica (lienzo menos los dos márgenes laterales).
const ANCHO_GRAFICA = ANCHO - MARGEN_LAT * 2;
// EN: Usable plot height for the bars (canvas minus top+bottom margins). / ES: Alto útil de las barras (lienzo menos márgenes sup.+inf.).
const ALTO_GRAFICA = ALTO - MARGEN_SUP - MARGEN_INF;
// EN: Y coordinate of the floor (X axis): bars grow upward from here. / ES: Coordenada Y del suelo (eje X): las barras crecen hacia arriba desde aquí.
const BASE_Y = MARGEN_SUP + ALTO_GRAFICA;

// EN: Shape of each already-positioned bar, ready for the <template>.
// ES: Tipo de cada barra ya posicionada, lista para el <template>.
interface Barra {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  color: string; // EN: var(--color-ok) or var(--color-danger). / ES: var(--color-ok) o var(--color-danger).
  titulo: string; // EN: <title> text (native tooltip). / ES: texto del <title> (tooltip nativo).
}

// EN: Shape of each group (one month): its two bars + the bottom label.
// ES: Tipo de cada grupo (un mes): sus dos barras + la etiqueta inferior.
interface GrupoMes {
  key: string; // EN: unique key for v-for ("YYYY-MM"). / ES: clave única para v-for ("YYYY-MM").
  etiqueta: string; // EN: 3-letter abbreviated month, e.g. "jun". / ES: mes abreviado a 3 letras, p.ej. "jun".
  centroX: number; // EN: group's center X (to place the label). / ES: X central del grupo (para colocar la etiqueta).
  barras: Barra[]; // EN: [income, expenses]. / ES: [ingresos, gastos].
}

// ── 5. Bar/label layout by month / Posicionado de barras y etiquetas por mes ──
// EN: Computes the position of each bar and label from the data.
// ES: Calcula la posición de cada barra y etiqueta a partir de los datos.
const grupos = computed<GrupoMes[]>(() => {
  const n = datos.value.length;
  if (n === 0 || maximo.value <= 0) return [];

  // EN: Each month gets a "slot" of the available width. Inside the slot sit two
  //     adjacent bars (income + expenses), plus a gap separating the months.
  // ES: Cada mes ocupa una "ranura" del ancho disponible. Dentro de la ranura van
  //     dos barras pegadas (ingresos + gastos) y un hueco de separación entre meses.
  const anchoRanura = ANCHO_GRAFICA / n;
  const huecoEntreMeses = anchoRanura * 0.28; // EN: left/right margin of each pair. / ES: margen a izq/dcha de cada par.
  const anchoPar = anchoRanura - huecoEntreMeses; // EN: room for the two bars. / ES: espacio para las dos barras.
  const separacionBarras = anchoPar * 0.12; // EN: gap between the two bars. / ES: separación entre las dos barras.
  const anchoBarra = (anchoPar - separacionBarras) / 2; // EN: width of each bar. / ES: ancho de cada barra.

  const lista: GrupoMes[] = [];

  for (let i = 0; i < n; i++) {
    const m = datos.value[i];
    // EN: Left start of the slot (leaving the side margin). / ES: Inicio izquierdo de la ranura (dejando el margen lateral).
    const ranuraX = MARGEN_LAT + i * anchoRanura + huecoEntreMeses / 2;

    // EN: Heights proportional to the maximum (maximo > 0 guaranteed here).
    // ES: Alturas proporcionales al máximo (maximo > 0 garantizado aquí).
    const altoIng = (m.ingresos / maximo.value) * ALTO_GRAFICA;
    const altoGas = (m.totalGastos / maximo.value) * ALTO_GRAFICA;

    // EN: Income bar (left, green). / ES: Barra de ingresos (izquierda, verde).
    const xIng = ranuraX;
    const barraIng: Barra = {
      x: xIng,
      y: BASE_Y - altoIng, // EN: top of the bar = floor minus its height. / ES: parte superior de la barra = suelo menos su altura.
      ancho: anchoBarra,
      alto: altoIng,
      color: "var(--color-ok)",
      titulo: `${mesLegible(m.mes)} · ${t("ingresos")} ${euro(m.ingresos)}`,
    };

    // EN: Expenses bar (right, red), offset by one bar width + the gap.
    // ES: Barra de gastos (derecha, roja), desplazada un ancho de barra + la separación.
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
      centroX: ranuraX + anchoPar / 2, // EN: center of the pair, for the label. / ES: centro del par, para la etiqueta.
      barras: [barraIng, barraGas],
    });
  }

  return lista;
});

// ── 6. Month label helper / Ayudante de etiqueta de mes ───────────────────────
// EN: Returns the month abbreviated to 3 lowercase letters: "2026-06" -> "jun".
// ES: Devuelve el mes abreviado a 3 letras en minúscula: "2026-06" -> "jun".
function etiquetaMes(mes: string): string {
  // EN: mesLegible("2026-06") = "Junio 2026" -> we take the first 3 of the month.
  // ES: mesLegible("2026-06") = "Junio 2026" -> tomamos las 3 primeras del mes.
  return mesLegible(mes).slice(0, 3).toLowerCase();
}
</script>

<template>
  <!-- EN: Container card, same style as the rest of the app's cards. / ES: Tarjeta contenedora, mismo estilo que el resto de tarjetas de la app. -->
  <div class="rounded-2xl bg-surface border border-border p-5">
    <!-- EN: Header: title + color legend. / ES: Cabecera: título + leyenda de colores. -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-display font-bold text-ink">{{ t("titulo") }}</h3>

      <!-- EN: Legend: green square (income) and red square (expenses). / ES: Leyenda: cuadradito verde (ingresos) y rojo (gastos). -->
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

    <!-- EN: Empty state: no data or everything at zero. / ES: Estado vacío: sin datos o todo a cero. -->
    <p v-if="!hayDatos" class="text-faint text-sm py-10 text-center">
      {{ t("sinDatos") }}
    </p>

    <!-- EN: Responsive SVG chart: 100% width keeping its aspect ratio. / ES: Gráfica SVG responsive: ocupa el 100% del ancho y mantiene proporción. -->
    <svg
      v-else
      :viewBox="`0 0 ${ANCHO} ${ALTO}`"
      preserveAspectRatio="xMidYMid meet"
      style="width: 100%; height: auto"
      role="img"
      :aria-label="t('aria')"
    >
      <!-- EN: X-axis baseline (the floor the bars sit on). / ES: Línea base del eje X (suelo de las barras). -->
      <line
        :x1="MARGEN_LAT"
        :y1="BASE_Y"
        :x2="ANCHO - MARGEN_LAT"
        :y2="BASE_Y"
        stroke="var(--color-border)"
        stroke-width="1"
      />

      <!-- EN: One group per month: two bars + abbreviated month label. / ES: Un grupo por mes: dos barras + etiqueta del mes abreviada. -->
      <g v-for="grupo in grupos" :key="grupo.key">
        <!-- EN: The two bars (income and expenses). / ES: Las dos barras (ingresos y gastos). -->
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
          <!-- EN: Native browser tooltip with month + value in euros. / ES: Tooltip nativo del navegador con mes + valor en euros. -->
          <title>{{ barra.titulo }}</title>
        </rect>

        <!-- EN: Month label (3-letter abbreviation) centered under the group. / ES: Etiqueta del mes (abreviada a 3 letras) centrada bajo el grupo. -->
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
