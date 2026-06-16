<script setup lang="ts">
/* Tarjeta de KPI del dashboard: una etiqueta, un valor grande y un acento de
   color opcional (clase de texto: text-ok, text-danger, text-brand...). */
defineProps<{
  etiqueta: string;
  valor: string;
  color?: string; // clase tailwind de color para el valor
  nota?: string; // texto pequeño bajo el valor (opcional)
}>();
</script>

<template>
  <div class="rounded-2xl bg-surface border border-border p-5">
    <p class="text-muted text-sm no-select">{{ etiqueta }}</p>
    <p class="font-display text-3xl font-bold mt-1.5" :class="color ?? 'text-ink'">
      {{ valor }}
    </p>
    <p v-if="nota" class="text-faint text-xs mt-1">{{ nota }}</p>
  </div>
</template>
