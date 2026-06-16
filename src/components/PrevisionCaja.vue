<script setup lang="ts">
/* ===========================================================================
   PrevisionCaja: previsión de caja de los próximos 6 meses.
   Proyecta el saldo acumulado usando SOLO los movimientos fijos (recurrentes)
   y las cuotas de deuda — responde "¿cómo evoluciona mi saldo?".
   El saldo inicial es 0: es una proyección de FLUJO (ingresos fijos − gastos
   fijos − cuotas), no el saldo real que hay en el banco.
   =========================================================================== */
import { computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { mesActual, sumarMeses, mesLegible, euro } from "../utils/format";
import { crearT } from "../i18n";

const f = useFinanzas();

// Diccionario de textos visibles del componente (ES/EN).
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

// Cuántos meses se proyectan (incluido el actual).
const MESES_PROYECTADOS = 6;

// Estructura de cada punto de la previsión.
interface PuntoPrevision {
  mes: string; // "YYYY-MM"
  etiqueta: string; // mes abreviado, ej. "Jun"
  disponible: number; // flujo neto proyectado de ESE mes
  acumulado: number; // saldo acumulado hasta ese mes (parte de 0)
}

/* ---------------------------------------------------------------------------
   Cálculo de la previsión: para cada uno de los próximos 6 meses (i=0..5)
   se pide el resumen proyectado al store y se va acumulando el disponible.
   --------------------------------------------------------------------------- */
const puntos = computed<PuntoPrevision[]>(() => {
  const base = mesActual(); // mes de partida = hoy
  let acumulado = 0; // saldo inicial 0 (proyección de flujo)
  const lista: PuntoPrevision[] = [];

  for (let i = 0; i < MESES_PROYECTADOS; i++) {
    const mes = sumarMeses(base, i);
    // resumenDe proyecta recurrentes activos + cuotas de deuda en cualquier mes futuro
    const r = f.resumenDe(mes);
    acumulado += r.disponible;
    lista.push({
      mes,
      etiqueta: mesLegible(mes).slice(0, 3), // "Junio 2026" -> "Jun"
      disponible: r.disponible,
      acumulado,
    });
  }
  return lista;
});

// ¿Hay algún dato real con el que proyectar? (recurrentes o deudas)
const hayDatos = computed<boolean>(
  () => f.recurrentes.length > 0 || f.deudas.length > 0
);

/* ---------------------------------------------------------------------------
   Geometría del SVG (responsive vía viewBox).
   Dibujamos barras del flujo mensual + una línea del saldo acumulado encima.
   --------------------------------------------------------------------------- */
const ANCHO = 600; // ancho lógico del lienzo
const ALTO = 220; // alto lógico del lienzo
const MARGEN_X = 40; // margen lateral para que las etiquetas no se corten
const MARGEN_SUP = 20; // margen superior
const MARGEN_INF = 40; // margen inferior (etiquetas de mes)

// Ancho útil para repartir entre las columnas.
const anchoUtil = computed<number>(() => ANCHO - MARGEN_X * 2);
const altoUtil = computed<number>(() => ALTO - MARGEN_SUP - MARGEN_INF);

// Rango de valores a representar: incluye acumulados, disponibles y el 0.
const rango = computed(() => {
  const valores: number[] = [0];
  for (const p of puntos.value) {
    valores.push(p.acumulado, p.disponible);
  }
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  // Si todo es 0, evitamos dividir por 0 dando un rango mínimo.
  if (min === max) return { min: min - 1, max: max + 1 };
  return { min, max };
});

// Convierte un valor monetario en su coordenada Y dentro del lienzo.
function escalaY(valor: number): number {
  const { min, max } = rango.value;
  const t = (valor - min) / (max - min); // 0..1 (0 = abajo, 1 = arriba)
  return MARGEN_SUP + (1 - t) * altoUtil.value;
}

// Coordenada X del centro de la columna i.
function centroX(i: number): number {
  const paso = anchoUtil.value / puntos.value.length;
  return MARGEN_X + paso * i + paso / 2;
}

// Coordenada Y de la línea base (el 0 €), para anclar las barras.
const yCero = computed<number>(() => escalaY(0));

// Ancho de cada barra (60% del paso disponible).
const anchoBarra = computed<number>(() => {
  const paso = anchoUtil.value / Math.max(puntos.value.length, 1);
  return paso * 0.6;
});

// Geometría de una barra del flujo mensual (parte del 0 hacia arriba/abajo).
function barra(p: PuntoPrevision, i: number) {
  const x = centroX(i) - anchoBarra.value / 2;
  const yValor = escalaY(p.disponible);
  const y = Math.min(yValor, yCero.value); // arriba de la barra
  const alto = Math.abs(yValor - yCero.value); // altura (siempre positiva)
  return { x, y, ancho: anchoBarra.value, alto };
}

// Puntos de la polilínea del saldo acumulado ("x,y x,y ...").
const lineaAcumulado = computed<string>(() =>
  puntos.value.map((p, i) => `${centroX(i)},${escalaY(p.acumulado)}`).join(" ")
);
</script>

<template>
  <!-- Tarjeta de previsión de caja -->
  <div class="rounded-2xl bg-surface border border-border p-5">
    <h3 class="font-display font-bold mb-1">{{ t("titulo") }}</h3>
    <!-- Texto explicativo: aclara que es una proyección de flujo, no el saldo real -->
    <p class="text-sm text-muted mb-4">
      {{ t("explicacion") }}
    </p>

    <!-- Caso sin datos: no hay recurrentes ni deudas con los que proyectar -->
    <div v-if="!hayDatos" class="text-muted text-sm">
      {{ t("sinDatos") }}
    </div>

    <template v-else>
      <!-- Gráfica SVG responsive (line + barras del saldo acumulado) -->
      <svg
        :viewBox="`0 0 ${ANCHO} ${ALTO}`"
        class="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        role="img"
        :aria-label="t('ariaGrafica')"
      >
        <!-- Línea base del 0 € -->
        <line
          :x1="MARGEN_X"
          :y1="yCero"
          :x2="ANCHO - MARGEN_X"
          :y2="yCero"
          class="stroke-border"
          stroke-width="1"
          stroke-dasharray="4 4"
        />

        <!-- Barras del flujo mensual: rojas si el disponible del mes es negativo -->
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

        <!-- Línea del saldo acumulado por encima de las barras -->
        <polyline
          :points="lineaAcumulado"
          fill="none"
          class="stroke-brand"
          stroke-width="2"
          stroke-linejoin="round"
          stroke-linecap="round"
        />

        <!-- Puntos + etiquetas de mes y valor del saldo acumulado -->
        <g v-for="(p, i) in puntos" :key="`pto-${p.mes}`">
          <!-- Punto del acumulado (rojo si el flujo de ese mes fue negativo) -->
          <circle
            :cx="centroX(i)"
            :cy="escalaY(p.acumulado)"
            r="3.5"
            :class="p.disponible < 0 ? 'fill-danger' : 'fill-brand'"
          />
          <!-- Valor del acumulado encima del punto -->
          <text
            :x="centroX(i)"
            :y="escalaY(p.acumulado) - 8"
            text-anchor="middle"
            class="fill-ink text-[10px] tabular-nums"
          >
            {{ euro(p.acumulado) }}
          </text>
          <!-- Etiqueta del mes abreviada, en la base del lienzo -->
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
