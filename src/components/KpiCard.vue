<script setup lang="ts">
/* =============================================================================
 * KpiCard.vue — Tarjeta de KPI del dashboard / Dashboard KPI card
 * -----------------------------------------------------------------------------
 * ES: Tarjeta presentacional que muestra un KPI: una etiqueta pequeña, un valor
 *     grande, un acento de color opcional para el valor y una nota pequeña
 *     opcional debajo. Sin estado y guiada por props, así el padre decide qué
 *     mostrar.
 * EN: Presentational card that shows a single KPI: a small label, a large value,
 *     an optional color accent for the value, and an optional small note below.
 *     Stateless and props-driven, so the parent decides what to display.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Props (etiqueta, valor, color, nota) / Props (label, value, color, note)
 *   2. Plantilla (maquetación) / Template (layout)
 * ===========================================================================*/

// ── 1. Props / Props ──────────────────────────────────────────────────────
// ES: Entradas de la tarjeta. El padre pasa los textos ya formateados.
// EN: Inputs of the card. The parent passes already-formatted strings.
defineProps<{
  // ES: Texto pequeño sobre el valor. / EN: Small caption above the value.
  etiqueta: string;
  // ES: Valor principal, ya formateado. / EN: Main value, formatted as a string.
  valor: string;
  // ES: Clase tailwind de color de texto opcional para el valor (text-ok,
  //     text-danger, text-brand...). Si se omite, usa text-ink.
  // EN: Optional tailwind text-color class for the value (text-ok, text-danger,
  //     text-brand...). Falls back to text-ink when omitted.
  color?: string;
  // ES: Nota pequeña opcional / EN: Optional small note shown under the value.
  //     mostrada bajo el valor.
  nota?: string;
}>();
</script>

<template>
  <!-- ES: 2. Plantilla — contenedor de tarjeta redondeada. / EN: 2. Template — rounded card wrapper. -->
  <div class="rounded-2xl bg-surface border border-border p-5">
    <!-- ES: Etiqueta (no seleccionable). / EN: Label (non-selectable). -->
    <p class="text-muted text-sm no-select">{{ etiqueta }}</p>
    <!-- ES: Valor grande; la clase de color usa text-ink por defecto. / EN: Big value; color class falls back to text-ink. -->
    <p class="font-display text-3xl font-bold mt-1.5" :class="color ?? 'text-ink'">
      {{ valor }}
    </p>
    <!-- ES: Nota opcional bajo el valor. / EN: Optional note under the value. -->
    <p v-if="nota" class="text-faint text-xs mt-1">{{ nota }}</p>
  </div>
</template>
