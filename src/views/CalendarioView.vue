<script setup lang="ts">
/* ===========================================================================
   Vista Calendario: muestra el mes seleccionado como una rejilla de días
   (lunes a domingo). Cada celda lleva un heatmap según el gasto del día,
   y al pulsar un día se ve la lista de movimientos puntuales de esa fecha.
   =========================================================================== */
import { ref, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro, mesLegible } from "../utils/format";
import type { Puntual } from "../types";

// Store central de finanzas (puntuales + mes seleccionado).
const f = useFinanzas();

// Día seleccionado por el usuario ("YYYY-MM-DD") o null si no hay ninguno.
const diaSeleccionado = ref<string | null>(null);

// Cabeceras de la semana, empezando en lunes (formato español).
const DIAS_SEMANA = ["L", "M", "X", "J", "V", "S", "D"];

// Estructura de cada celda del calendario.
interface CeldaDia {
  fecha: string; // "YYYY-MM-DD" del día
  numero: number; // número del día dentro del mes (1..31)
  gasto: number; // total gastado ese día (suma de puntuales 'gasto')
}

// Convierte el getDay() de JS (0=domingo..6=sábado) al offset con la semana
// empezando en lunes: lunes=0, martes=1, ..., domingo=6.
function offsetLunes(diaSemanaJS: number): number {
  return (diaSemanaJS + 6) % 7;
}

// Mapa fecha -> gasto del día para el mes seleccionado.
// Solo suma los puntuales con signo 'gasto' de ese mes.
const gastoPorDia = computed<Map<string, number>>(() => {
  const mapa = new Map<string, number>();
  const mes = f.mesSeleccionado; // "YYYY-MM"
  for (const p of f.puntuales as Puntual[]) {
    // Filtra por mes y por signo gasto.
    if (p.signo !== "gasto") continue;
    if (p.fecha.slice(0, 7) !== mes) continue;
    mapa.set(p.fecha, (mapa.get(p.fecha) ?? 0) + p.importe);
  }
  return mapa;
});

// Gasto máximo de un día en el mes (referencia para la intensidad del heatmap).
const gastoMaximo = computed<number>(() => {
  let max = 0;
  for (const v of gastoPorDia.value.values()) {
    if (v > max) max = v;
  }
  return max;
});

// Lista de celdas reales del mes (un objeto por día del 1 al último).
const celdas = computed<CeldaDia[]>(() => {
  const [anio, mes] = f.mesSeleccionado.split("-").map(Number);
  // Día 0 del mes siguiente = último día del mes actual -> nº de días del mes.
  const diasDelMes = new Date(anio, mes, 0).getDate();
  const lista: CeldaDia[] = [];
  for (let d = 1; d <= diasDelMes; d++) {
    // Construye la fecha "YYYY-MM-DD" con ceros a la izquierda.
    const fecha = `${f.mesSeleccionado}-${String(d).padStart(2, "0")}`;
    lista.push({
      fecha,
      numero: d,
      gasto: gastoPorDia.value.get(fecha) ?? 0,
    });
  }
  return lista;
});

// Nº de celdas vacías al inicio (offset del primer día del mes hasta el lunes).
const huecosIniciales = computed<number>(() => {
  const [anio, mes] = f.mesSeleccionado.split("-").map(Number);
  // getDay del día 1 del mes, ajustado a semana que empieza en lunes.
  const primerDia = new Date(anio, mes - 1, 1).getDay();
  return offsetLunes(primerDia);
});

// Estilo de fondo de cada celda según su gasto (heatmap con color-mix).
// Días sin gasto -> fondo neutro; con gasto -> mezcla de bg-danger según intensidad.
function estiloCelda(celda: CeldaDia): Record<string, string> {
  // Sin gasto: no aplicamos estilo inline (se usa la clase neutra bg-surface-2).
  if (celda.gasto <= 0 || gastoMaximo.value <= 0) return {};
  // Intensidad relativa al día de mayor gasto (entre ~12% y 85% para que se vea).
  const ratio = celda.gasto / gastoMaximo.value;
  const porcentaje = Math.round(12 + ratio * 73); // 12%..85%
  // Mezcla el rojo de peligro con transparencia: a más gasto, fondo más intenso.
  return {
    background: `color-mix(in srgb, var(--color-danger) ${porcentaje}%, transparent)`,
  };
}

// Devuelve los movimientos puntuales (todos los signos) de una fecha concreta.
function movimientosDelDia(fecha: string): Puntual[] {
  return (f.puntuales as Puntual[])
    .filter((p) => p.fecha === fecha)
    .sort((a, b) => {
      // Ingresos primero, luego por importe descendente (igual que la lista del mes).
      if (a.signo !== b.signo) return a.signo === "ingreso" ? -1 : 1;
      return b.importe - a.importe;
    });
}

// Movimientos del día actualmente seleccionado (vacío si no hay día elegido).
const movimientosSeleccion = computed<Puntual[]>(() => {
  if (!diaSeleccionado.value) return [];
  return movimientosDelDia(diaSeleccionado.value);
});

// Texto legible del día seleccionado para la cabecera del panel inferior.
const tituloSeleccion = computed<string>(() => {
  if (!diaSeleccionado.value) return "";
  const [, , d] = diaSeleccionado.value.split("-");
  return `Día ${Number(d)} · ${mesLegible(f.mesSeleccionado)}`;
});

// Marca/desmarca el día al hacer clic (segundo clic en el mismo día lo cierra).
function seleccionarDia(fecha: string): void {
  diaSeleccionado.value = diaSeleccionado.value === fecha ? null : fecha;
}
</script>

<template>
  <div>
    <!-- Cabecera: título de la vista + mes legible -->
    <div class="mb-6">
      <h2 class="font-display text-2xl font-bold">Calendario</h2>
      <p class="text-muted mt-0.5">{{ mesLegible(f.mesSeleccionado) }}</p>
    </div>

    <!-- Tarjeta con la rejilla del mes -->
    <div class="rounded-2xl bg-surface border border-border p-5">
      <!-- Cabeceras de la semana (L M X J V S D) -->
      <div class="grid grid-cols-7 gap-1.5 mb-1.5">
        <div
          v-for="dia in DIAS_SEMANA"
          :key="dia"
          class="text-center text-faint text-xs font-medium py-1"
        >
          {{ dia }}
        </div>
      </div>

      <!-- Rejilla de días: primero los huecos, luego cada día del mes -->
      <div class="grid grid-cols-7 gap-1.5">
        <!-- Huecos antes del primer día (offset hasta el lunes) -->
        <div v-for="n in huecosIniciales" :key="'hueco-' + n" class="aspect-square" />

        <!-- Celda por cada día del mes -->
        <button
          v-for="celda in celdas"
          :key="celda.fecha"
          type="button"
          class="aspect-square rounded-xl border p-1.5 flex flex-col justify-between text-left transition-colors"
          :class="[
            celda.gasto > 0 ? 'border-transparent' : 'bg-surface-2 border-border',
            diaSeleccionado === celda.fecha ? '!border-brand' : '',
          ]"
          :style="estiloCelda(celda)"
          @click="seleccionarDia(celda.fecha)"
        >
          <!-- Número del día -->
          <span
            class="text-xs font-medium"
            :class="celda.gasto > 0 ? 'text-ink' : 'text-muted'"
          >
            {{ celda.numero }}
          </span>
          <!-- Importe gastado ese día (solo si hay gasto) -->
          <span
            v-if="celda.gasto > 0"
            class="text-[0.625rem] leading-tight font-medium tabular-nums text-ink truncate"
          >
            {{ euro(celda.gasto) }}
          </span>
        </button>
      </div>
    </div>

    <!-- Panel inferior: movimientos del día seleccionado -->
    <div
      v-if="diaSeleccionado"
      class="mt-5 rounded-2xl bg-surface border border-border p-5"
    >
      <h3 class="font-display font-bold mb-4">{{ tituloSeleccion }}</h3>

      <!-- Sin movimientos ese día -->
      <p v-if="!movimientosSeleccion.length" class="text-muted text-sm">
        Sin movimientos
      </p>

      <!-- Lista de movimientos puntuales del día -->
      <ul v-else class="divide-y divide-border">
        <li
          v-for="m in movimientosSeleccion"
          :key="m.id"
          class="flex items-center gap-3 py-3"
        >
          <!-- Punto de color según el signo -->
          <span
            class="size-2.5 rounded-full shrink-0"
            :class="m.signo === 'ingreso' ? 'bg-ok' : 'bg-danger'"
          />

          <!-- Concepto + categoría -->
          <div class="min-w-0 flex-1">
            <p class="truncate">{{ m.concepto }}</p>
            <p class="text-faint text-xs mt-0.5">
              <span class="rounded-full bg-surface-2 px-2 py-0.5">{{ m.categoria }}</span>
            </p>
          </div>

          <!-- Importe con color por signo -->
          <span
            class="font-medium tabular-nums shrink-0"
            :class="m.signo === 'ingreso' ? 'text-ok' : 'text-danger'"
          >
            {{ m.signo === "ingreso" ? "+" : "−" }}{{ euro(m.importe) }}
          </span>
        </li>
      </ul>
    </div>
  </div>
</template>
