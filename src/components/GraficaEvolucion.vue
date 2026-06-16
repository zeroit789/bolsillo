<script setup lang="ts">
/* ===========================================================================
   GraficaEvolucion.vue
   Gráfica de barras SVG (sin librerías externas) que muestra la evolución
   mensual de ingresos vs gastos. Por cada mes dibuja dos barras juntas:
   una verde (ingresos) y una roja (gastos), escaladas al valor máximo del
   conjunto. Pensada para encajar en el tema dark de Bolsillo (Tailwind v4).
   =========================================================================== */
import { computed } from "vue";
// Utilidades de formato: euro() para tooltips, mesLegible() para el mes completo.
import { euro, mesLegible } from "../utils/format";
// Sistema de traducción propio del proyecto (ES/EN reactivo).
import { crearT } from "../i18n";

// ─── Traducciones del componente ─────────────────────────────────────────────
// Todos los textos visibles fijos del componente, en español e inglés.
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

// ─── Tipos ─────────────────────────────────────────────────────────────────
// Forma mínima que necesita el componente. Es compatible estructuralmente con
// el tipo ResumenMes del store (mismas claves), así que se le puede pasar el
// historial tal cual sin acoplar este componente al store.
interface MesGrafica {
  mes: string; // "YYYY-MM"
  ingresos: number;
  totalGastos: number;
  disponible: number;
}

// ─── Props ───────────────────────────────────────────────────────────────────
// `meses` llega ordenado del más reciente al más antiguo (como en el store).
const props = defineProps<{
  meses: MesGrafica[];
}>();

// ─── Datos preparados para pintar ─────────────────────────────────────────────
// 1) Limita a los últimos 12 meses (los primeros del array = los más recientes).
// 2) Invierte para mostrar de izquierda (antiguo) a derecha (reciente).
const datos = computed<MesGrafica[]>(() => {
  return props.meses.slice(0, 12).reverse();
});

// Valor máximo entre todos los ingresos y gastos del conjunto. Sirve de tope
// para escalar las barras. Se fuerza a >= 0 por seguridad.
const maximo = computed<number>(() => {
  let max = 0;
  for (const m of datos.value) {
    if (m.ingresos > max) max = m.ingresos;
    if (m.totalGastos > max) max = m.totalGastos;
  }
  return max;
});

// ¿Hay algo que pintar? False si no hay meses o si todo está a 0.
const hayDatos = computed<boolean>(() => {
  return datos.value.length > 0 && maximo.value > 0;
});

// ─── Geometría del SVG ───────────────────────────────────────────────────────
// Trabajamos en un sistema de coordenadas fijo (viewBox) y dejamos que el SVG
// escale a su contenedor (width:100%). Así no necesitamos medir el DOM.
const ANCHO = 720; // ancho lógico del lienzo
const ALTO = 260; // alto lógico del lienzo
const MARGEN_SUP = 16; // espacio arriba para que la barra más alta respire
const MARGEN_INF = 28; // espacio abajo para las etiquetas de mes
const MARGEN_LAT = 8; // margen lateral
const ANCHO_GRAFICA = ANCHO - MARGEN_LAT * 2;
const ALTO_GRAFICA = ALTO - MARGEN_SUP - MARGEN_INF; // alto útil de las barras
const BASE_Y = MARGEN_SUP + ALTO_GRAFICA; // coordenada Y del suelo (eje X)

// Tipo de cada barra ya posicionada, lista para el <template>.
interface Barra {
  x: number;
  y: number;
  ancho: number;
  alto: number;
  color: string; // var(--color-ok) o var(--color-danger)
  titulo: string; // texto del <title> (tooltip nativo)
}

// Tipo de cada grupo (un mes): sus dos barras + la etiqueta inferior.
interface GrupoMes {
  key: string; // clave única para v-for ("YYYY-MM")
  etiqueta: string; // mes abreviado a 3 letras, p.ej. "jun"
  centroX: number; // X central del grupo (para colocar la etiqueta)
  barras: Barra[]; // [ingresos, gastos]
}

// Calcula la posición de cada barra y etiqueta a partir de los datos.
const grupos = computed<GrupoMes[]>(() => {
  const n = datos.value.length;
  if (n === 0 || maximo.value <= 0) return [];

  // Cada mes ocupa una "ranura" del ancho disponible. Dentro de la ranura van
  // dos barras pegadas (ingresos + gastos) y un hueco de separación entre meses.
  const anchoRanura = ANCHO_GRAFICA / n;
  const huecoEntreMeses = anchoRanura * 0.28; // margen a izq/dcha de cada par
  const anchoPar = anchoRanura - huecoEntreMeses; // espacio para las dos barras
  const separacionBarras = anchoPar * 0.12; // separación entre las dos barras
  const anchoBarra = (anchoPar - separacionBarras) / 2; // ancho de cada barra

  const lista: GrupoMes[] = [];

  for (let i = 0; i < n; i++) {
    const m = datos.value[i];
    // Inicio izquierdo de la ranura (dejando el margen lateral).
    const ranuraX = MARGEN_LAT + i * anchoRanura + huecoEntreMeses / 2;

    // Alturas proporcionales al máximo (maximo > 0 garantizado aquí).
    const altoIng = (m.ingresos / maximo.value) * ALTO_GRAFICA;
    const altoGas = (m.totalGastos / maximo.value) * ALTO_GRAFICA;

    // Barra de ingresos (izquierda, verde).
    const xIng = ranuraX;
    const barraIng: Barra = {
      x: xIng,
      y: BASE_Y - altoIng,
      ancho: anchoBarra,
      alto: altoIng,
      color: "var(--color-ok)",
      titulo: `${mesLegible(m.mes)} · ${t("ingresos")} ${euro(m.ingresos)}`,
    };

    // Barra de gastos (derecha, roja).
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
      centroX: ranuraX + anchoPar / 2,
      barras: [barraIng, barraGas],
    });
  }

  return lista;
});

// Devuelve el mes abreviado a 3 letras en minúscula: "2026-06" -> "jun".
function etiquetaMes(mes: string): string {
  // mesLegible("2026-06") = "Junio 2026" -> tomamos las 3 primeras del mes.
  return mesLegible(mes).slice(0, 3).toLowerCase();
}
</script>

<template>
  <!-- Tarjeta contenedora, mismo estilo que el resto de tarjetas de la app. -->
  <div class="rounded-2xl bg-surface border border-border p-5">
    <!-- Cabecera: título + leyenda de colores -->
    <div class="flex items-center justify-between mb-4">
      <h3 class="font-display font-bold text-ink">{{ t("titulo") }}</h3>

      <!-- Leyenda: cuadradito verde (ingresos) y rojo (gastos) -->
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

    <!-- Estado vacío: sin datos o todo a cero -->
    <p v-if="!hayDatos" class="text-faint text-sm py-10 text-center">
      {{ t("sinDatos") }}
    </p>

    <!-- Gráfica SVG responsive: ocupa el 100% del ancho y mantiene proporción -->
    <svg
      v-else
      :viewBox="`0 0 ${ANCHO} ${ALTO}`"
      preserveAspectRatio="xMidYMid meet"
      style="width: 100%; height: auto"
      role="img"
      :aria-label="t('aria')"
    >
      <!-- Línea base del eje X (suelo de las barras) -->
      <line
        :x1="MARGEN_LAT"
        :y1="BASE_Y"
        :x2="ANCHO - MARGEN_LAT"
        :y2="BASE_Y"
        stroke="var(--color-border)"
        stroke-width="1"
      />

      <!-- Un grupo por mes: dos barras + etiqueta del mes abreviada -->
      <g v-for="grupo in grupos" :key="grupo.key">
        <!-- Las dos barras (ingresos y gastos) -->
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
          <!-- Tooltip nativo del navegador con mes + valor en euros -->
          <title>{{ barra.titulo }}</title>
        </rect>

        <!-- Etiqueta del mes (abreviada a 3 letras) centrada bajo el grupo -->
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
