<script setup lang="ts">
/* ===========================================================================
   PrevisionCaja — Previsión de caja (próximos 6 meses) / Cash flow forecast
   ---------------------------------------------------------------------------
   ES: Proyecta el saldo acumulado de los próximos 6 meses usando SOLO los
       movimientos fijos (recurrentes) y las cuotas de deuda — responde "¿cómo
       evoluciona mi saldo?". El saldo inicial es 0: es una proyección de FLUJO
       (ingresos fijos − gastos fijos − cuotas), NO el saldo real que hay en el
       banco. Se dibuja como un SVG en línea y responsive (barras + línea del
       acumulado).
   EN: Projects the accumulated balance over the next 6 months using ONLY fixed
       (recurring) movements and debt installments — answers "how does my
       balance evolve?". The initial balance is 0: it is a FLOW projection
       (fixed income − fixed expenses − installments), NOT the real money in the
       bank. Rendered as an inline, responsive SVG (bars + accumulated line).
   ---------------------------------------------------------------------------
   ÍNDICE / INDEX:
     1. Store, textos i18n y datos / Store, i18n texts & forecast data
     2. Geometría y constantes del lienzo SVG / SVG canvas geometry & constants
     3. Rango de valores y escalas / Value range & scales
     4. Column / bar / line geometry / Geometría de columna / barra / línea
   =========================================================================== */
import { computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { mesActual, sumarMeses, mesLegible, euro } from "../utils/format";
import { crearT } from "../i18n";

// ── 1. Store, textos i18n y datos / Store, i18n texts & forecast data ─────────
// ES: Store de finanzas: fuente de movimientos recurrentes y deudas a proyectar.
// EN: Finance store: source of recurring movements and debts to project.
const f = useFinanzas();

// ES: Textos visibles (ES/EN). / EN: Visible UI texts of the component (ES/EN).
const t = crearT({
  titulo: {
    es: "Previsión de caja (próximos meses)",
    en: "Cash flow forecast (next months)",
  },
  explicacion: {
    es: "Proyección de flujo: ingresos fijos − gastos fijos − cuotas. Parte de 0 €, así que muestra cómo evoluciona el saldo, no el dinero real en el banco.",
    en: "Flow projection: fixed income − fixed expenses − installments. Starts from €0, so it shows how the balance evolves, not the actual money in the bank.",
  },
  sinDatos: {
    es: "Añade ingresos/gastos fijos o deudas para ver la previsión.",
    en: "Add fixed income/expenses or debts to see the forecast.",
  },
  ariaGrafica: {
    es: "Gráfica de previsión de saldo acumulado por mes",
    en: "Chart of projected accumulated balance per month",
  },
});

// ES: Cuántos meses se proyectan (incluido el actual).
// EN: How many months are projected (current month included).
const MESES_PROYECTADOS = 6;

// ES: Estructura de cada punto de previsión. / EN: Shape of each forecast point.
interface PuntoPrevision {
  mes: string; // ES: clave "YYYY-MM" / EN: "YYYY-MM" key
  etiqueta: string; // ES: mes abreviado, ej. "Jun" / EN: short month, e.g. "Jun"
  disponible: number; // ES: flujo neto de ESE mes / EN: net flow of THAT month
  acumulado: number; // ES: saldo acumulado hasta ese mes (parte de 0) / EN: balance up to that month (from 0)
}

// ES: Previsión: para cada uno de los próximos 6 meses (i=0..5) se pide el
//     resumen proyectado al store y se va acumulando el disponible.
// EN: Forecast: for each of the next 6 months (i=0..5) ask the store for its
//     projected summary and accumulate the available flow.
const puntos = computed<PuntoPrevision[]>(() => {
  const base = mesActual(); // ES: mes de partida = hoy / EN: start month = today
  let acumulado = 0; // ES: saldo inicial 0 (proyección de flujo) / EN: initial balance 0 (flow projection)
  const lista: PuntoPrevision[] = [];

  for (let i = 0; i < MESES_PROYECTADOS; i++) {
    const mes = sumarMeses(base, i);
    // ES: resumenDe proyecta recurrentes activos + cuotas de deuda en cualquier mes futuro.
    // EN: resumenDe projects active recurrents + debt installments for any future month.
    const r = f.resumenDe(mes);
    acumulado += r.disponible;
    lista.push({
      mes,
      etiqueta: mesLegible(mes).slice(0, 3), // EN/ES: "Junio 2026" -> "Jun"
      disponible: r.disponible,
      acumulado,
    });
  }
  return lista;
});

// ES: ¿Hay algún dato real con el que proyectar? (recurrentes o deudas)
// EN: Is there any real data to project with? (recurrents or debts)
const hayDatos = computed<boolean>(
  () => f.recurrentes.length > 0 || f.deudas.length > 0
);

// ── 2. Geometría y constantes del lienzo SVG / SVG canvas geometry & constants ─
// ES: Tamaño lógico del lienzo en unidades SVG. La gráfica es responsive vía el
//     viewBox (ANCHO×ALTO es el espacio de coordenadas, no los píxeles reales),
//     así que toda la geometría de abajo se calcula en estas unidades lógicas.
// EN: Logical canvas size in SVG user units. The chart is responsive via the
//     viewBox (ANCHO×ALTO is the coordinate space, not the rendered pixels),
//     so all geometry below is computed in these logical units.
const ANCHO = 600; // ES: ancho lógico del lienzo / EN: logical canvas width
const ALTO = 220; // ES: alto lógico del lienzo / EN: logical canvas height
const MARGEN_X = 40; // ES: margen lateral para no cortar etiquetas / EN: side margin so labels aren't clipped
const MARGEN_SUP = 20; // ES: margen superior / EN: top margin
const MARGEN_INF = 40; // ES: margen inferior (etiquetas de mes) / EN: bottom margin (month labels)

// ES: Ancho útil a repartir entre columnas. / EN: Usable width to distribute among columns.
const anchoUtil = computed<number>(() => ANCHO - MARGEN_X * 2);
// ES: Alto útil entre márgenes sup. e inf. / EN: Usable height between top and bottom margins.
const altoUtil = computed<number>(() => ALTO - MARGEN_SUP - MARGEN_INF);

// ── 3. Rango de valores y escalas / Value range & scales ──────────────────────
// ES: Rango de valores a representar: incluye acumulados, disponibles y el 0.
// EN: Value range to plot: includes accumulated values, monthly flows and 0.
const rango = computed(() => {
  const valores: number[] = [0];
  for (const p of puntos.value) {
    valores.push(p.acumulado, p.disponible);
  }
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  // ES: Si todo es 0, evitamos dividir por 0 dando un rango mínimo.
  // EN: If everything is 0, avoid dividing by 0 by giving a minimal range.
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
});

// ES: Convierte un valor monetario en su coordenada Y dentro del lienzo. Normaliza
//     el valor a 0..1 dentro de [min,max] y lo invierte (la Y del SVG crece hacia
//     abajo), de modo que los importes mayores quedan más arriba.
// EN: Maps a monetary value to its Y coordinate inside the canvas. Normalizes
//     the value to 0..1 within [min,max] and inverts it (SVG Y grows downward),
//     so larger amounts sit higher.
function escalaY(valor: number): number {
  const { min, max } = rango.value;
  const t = (valor - min) / (max - min); // EN/ES: 0..1 (0 = abajo, 1 = arriba)
  return MARGEN_SUP + (1 - t) * altoUtil.value;
}

// ── 4. Column / bar / line geometry / Geometría de columna / barra / línea ────
// ES: Coordenada X del centro de la columna i. El ancho útil se divide en N pasos
//     iguales y caemos en el centro del paso i. Protegido con Math.max(N,1) para
//     no dividir nunca por cero aunque no haya puntos.
// EN: X coordinate of the center of column i. The usable width is split into N
//     equal steps and we land on the middle of step i. Guard with Math.max(N,1)
//     so we never divide by zero even if there are no points.
function centroX(i: number): number {
  const paso = anchoUtil.value / Math.max(puntos.value.length, 1);
  return MARGEN_X + paso * i + paso / 2;
}

// ES: Coordenada Y de la línea base (el 0 €), para anclar las barras.
// EN: Y coordinate of the baseline (0 €), used to anchor the bars.
const yCero = computed<number>(() => escalaY(0));

// ES: Ancho de cada barra (60% del paso disponible). Protegido ante 0 puntos.
// EN: Width of each bar (60% of the available step). Guarded against 0 points.
const anchoBarra = computed<number>(() => {
  const paso = anchoUtil.value / Math.max(puntos.value.length, 1);
  return paso * 0.6;
});

// ES: Geometría de una barra del flujo mensual (parte del 0 hacia arriba/abajo).
//     Devuelve la esquina sup. izq. (x,y), el ancho y una altura siempre positiva (Math.abs).
// EN: Geometry of a monthly-flow bar (grows from 0 up/down). Returns top-left
//     corner (x,y), width and a height that is always positive (Math.abs).
function barra(p: PuntoPrevision, i: number) {
  const x = centroX(i) - anchoBarra.value / 2;
  const yValor = escalaY(p.disponible);
  const y = Math.min(yValor, yCero.value); // ES: arriba de la barra / EN: top edge of the bar
  const alto = Math.abs(yValor - yCero.value); // ES: altura (siempre positiva) / EN: height (always positive)
  return { x, y, ancho: anchoBarra.value, alto };
}

// ES: Puntos de la polilínea del saldo acumulado ("x,y x,y ...").
// EN: Points of the accumulated-balance polyline ("x,y x,y ...").
const lineaAcumulado = computed<string>(() =>
  puntos.value.map((p, i) => `${centroX(i)},${escalaY(p.acumulado)}`).join(" ")
);
</script>

<template>
  <!-- ES: Tarjeta de previsión de caja / EN: Cash flow forecast card -->
  <div class="rounded-2xl bg-surface border border-border p-5">
    <h3 class="font-display font-bold mb-1">{{ t("titulo") }}</h3>
    <!-- ES: Texto explicativo: aclara que es una proyección de flujo, no el saldo real -->
    <!-- EN: Explanatory text: clarifies it's a flow projection, not the real balance -->
    <p class="text-sm text-muted mb-4">
      {{ t("explicacion") }}
    </p>

    <!-- ES: Caso sin datos: no hay recurrentes ni deudas con los que proyectar -->
    <!-- EN: Empty state: no recurrents nor debts to project with -->
    <div v-if="!hayDatos" class="text-muted text-sm">
      {{ t("sinDatos") }}
    </div>

    <template v-else>
      <!-- ES: Gráfica SVG responsive (línea del saldo acumulado + barras del flujo mensual) -->
      <!-- EN: Responsive SVG chart (accumulated-balance line + monthly-flow bars) -->
      <svg
        :viewBox="`0 0 ${ANCHO} ${ALTO}`"
        class="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="t('ariaGrafica')"
      >
        <!-- ES: Línea base del 0 € / EN: 0 € baseline -->
        <line
          :x1="MARGEN_X"
          :y1="yCero"
          :x2="ANCHO - MARGEN_X"
          :y2="yCero"
          class="stroke-border"
          stroke-width="1"
          stroke-dasharray="4 4"
        />

        <!-- ES: Barras del flujo mensual: rojas si el disponible del mes es negativo -->
        <!-- EN: Monthly-flow bars: red when that month's available flow is negative -->
        <rect
          v-for="(p, i) in puntos"
          :key="`barra-${p.mes}`"
          :x="barra(p, i).x"
          :y="barra(p, i).y"
          :width="barra(p, i).ancho"
          :height="barra(p, i).alto"
          rx="3"
          :class="p.disponible < 0 ? 'fill-danger/60' : 'fill-brand/40'"
        />

        <!-- ES: Línea del saldo acumulado por encima de las barras -->
        <!-- EN: Accumulated-balance line drawn on top of the bars -->
        <polyline
          :points="lineaAcumulado"
          fill="none"
          class="stroke-brand"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <!-- ES: Puntos + etiquetas de mes y valor del saldo acumulado -->
        <!-- EN: Dots + month labels and accumulated-balance value -->
        <g v-for="(p, i) in puntos" :key="`pto-${p.mes}`">
          <!-- ES: Punto del acumulado (rojo si el flujo de ese mes fue negativo) -->
          <!-- EN: Accumulated dot (red if that month's flow was negative) -->
          <circle
            :cx="centroX(i)"
            :cy="escalaY(p.acumulado)"
            r="3.5"
            :class="p.disponible < 0 ? 'fill-danger' : 'fill-brand'"
          />
          <!-- ES: Valor del acumulado encima del punto / EN: Accumulated value above the dot -->
          <text
            :x="centroX(i)"
            :y="escalaY(p.acumulado) - 8"
            text-anchor="middle"
            class="fill-ink text-[10px] tabular-nums"
          >
            {{ euro(p.acumulado) }}
          </text>
          <!-- ES: Etiqueta del mes abreviada, en la base del lienzo -->
          <!-- EN: Short month label at the bottom of the canvas -->
          <text
            :x="centroX(i)"
            :y="ALTO - 14"
            text-anchor="middle"
            :class="p.disponible < 0 ? 'fill-danger text-[11px]' : 'fill-muted text-[11px]'"
          >
            {{ p.etiqueta }}
          </text>
        </g>
      </svg>
    </template>
  </div>
</template>
