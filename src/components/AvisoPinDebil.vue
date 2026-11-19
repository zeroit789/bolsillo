<script setup lang="ts">
/* =============================================================================
 * AvisoPinDebil.vue — Aviso de PIN fácil de adivinar / Easy-to-guess PIN warning
 * -----------------------------------------------------------------------------
 * ES: Línea de aviso bajo un campo de PIN cuando el PIN tecleado es de los
 *     fáciles (repetido, escalera, patrón, muy común o un año). Solo avisa:
 *     el PIN sigue siendo válido. Lo usan la bienvenida, Ajustes y el cambio
 *     de credencial tras usar la clave de recuperación.
 * EN: Warning line under a PIN field when the typed PIN is an easy one
 *     (repeated, run, pattern, very common or a year). It only warns: the PIN
 *     is still valid. Used by the welcome, Settings and the credential reset
 *     after using the recovery key.
 * ===========================================================================*/
import { computed } from "vue";
import { pinDebil } from "../utils/credencial";
import { crearT } from "../i18n";

// ES: El PIN que se está tecleando. / EN: The PIN being typed.
const props = defineProps<{ pin: string }>();

const t = crearT({
  repetido: {
    es: "Ese PIN repite la misma cifra: es de los primeros que se prueban.",
    en: "That PIN repeats the same digit: it is among the first ones tried.",
  },
  escalera: {
    es: "Ese PIN es una escalera (1234, 9876…): es de los primeros que se prueban.",
    en: "That PIN is a run (1234, 9876…): it is among the first ones tried.",
  },
  patron: {
    es: "Ese PIN repite un patrón (1212, 123123…): es fácil de adivinar.",
    en: "That PIN repeats a pattern (1212, 123123…): it is easy to guess.",
  },
  comun: {
    es: "Ese PIN es de los más usados: es fácil de adivinar.",
    en: "That PIN is one of the most used: it is easy to guess.",
  },
  año: {
    es: "Ese PIN parece un año: es fácil de adivinar.",
    en: "That PIN looks like a year: it is easy to guess.",
  },
});

// ES: Motivo del aviso (null si no hay que avisar). / EN: Warning reason (null if none).
const motivo = computed(() => pinDebil(props.pin));
</script>

<template>
  <!-- ES: Solo aparece si el PIN es fácil; role=status para que lo lea un lector de pantalla.
       EN: Only shown if the PIN is easy; role=status so a screen reader reads it. -->
  <p v-if="motivo" role="status" class="text-warn text-xs mt-1">{{ t(motivo) }}</p>
</template>
