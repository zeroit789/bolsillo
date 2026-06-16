<script setup lang="ts">
/* =============================================================================
 * KpiCard.vue — Dashboard KPI card / Tarjeta de KPI del dashboard
 * -----------------------------------------------------------------------------
 * EN: Presentational card that shows a single KPI: a small label, a large value,
 *     an optional color accent for the value, and an optional small note below.
 *     Stateless and props-driven, so the parent decides what to display.
 * ES: Tarjeta presentacional que muestra un KPI: una etiqueta pequeña, un valor
 *     grande, un acento de color opcional para el valor y una nota pequeña
 *     opcional debajo. Sin estado y guiada por props, así el padre decide qué
 *     mostrar.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Props (label, value, color, note) / Props (etiqueta, valor, color, nota)
 *   2. Template (layout) / Plantilla (maquetación)
 * ===========================================================================*/

// ── 1. Props / Props ──────────────────────────────────────────────────────
// EN: Inputs of the card. The parent passes already-formatted strings.
// ES: Entradas de la tarjeta. El padre pasa los textos ya formateados.
defineProps<{
  // EN: Small caption above the value. / ES: Texto pequeño sobre el valor.
  etiqueta: string;
  // EN: Main value, formatted as a string. / ES: Valor principal, ya formateado.
  valor: string;
  // EN: Optional tailwind text-color class for the value (text-ok, text-danger,
  //     text-brand...). Falls back to text-ink when omitted.
  // ES: Clase tailwind de color de texto opcional para el valor (text-ok,
  //     text-danger, text-brand...). Si se omite, usa text-ink.
  color?: string;
  // EN: Optional small note shown under the value. / ES: Nota pequeña opcional
  //     mostrada bajo el valor.
  nota?: string;
}>();
</script>

<template>
  <!-- EN: 2. Template — rounded card wrapper. / ES: 2. Plantilla — contenedor de tarjeta redondeada. -->
  <div class="rounded-2xl bg-surface border border-border p-5">
    <!-- EN: Label (non-selectable). / ES: Etiqueta (no seleccionable). -->
    <p class="text-muted text-sm no-select">{{ etiqueta }}</p>
    <!-- EN: Big value; color class falls back to text-ink. / ES: Valor grande; la clase de color usa text-ink por defecto. -->
    <p class="font-display text-3xl font-bold mt-1.5" :class="color ?? 'text-ink'">
      {{ valor }}
    </p>
    <!-- EN: Optional note under the value. / ES: Nota opcional bajo el valor. -->
    <p v-if="nota" class="text-faint text-xs mt-1">{{ nota }}</p>
  </div>
</template>
