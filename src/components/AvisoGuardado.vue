<script setup lang="ts">
/* =============================================================================
 * AvisoGuardado.vue — Aviso de guardado fallido / Failed-save warning
 * -----------------------------------------------------------------------------
 * ES: Aviso persistente que aparece mientras el último guardado haya fallado
 *     (p. ej. almacenamiento lleno). Dice que hay cambios sin guardar, que la
 *     app sigue reintentando sola y ofrece un botón "Reintentar". Desaparece
 *     solo cuando un guardado termina bien.
 * EN: Persistent warning shown while the last save has failed (e.g. storage
 *     full). It says there are unsaved changes, that the app keeps retrying on
 *     its own and offers a "Retry" button. It only goes away when a save
 *     succeeds.
 * ===========================================================================*/
import { ref } from "vue";
import { useSesion } from "../stores/sesion";
import { crearT } from "../i18n";

const sesion = useSesion();

// ES: Textos ES/EN del aviso. / EN: ES/EN texts of the warning.
const t = crearT({
  titulo: { es: "No se ha podido guardar", en: "Could not save" },
  texto: {
    es: "Tus últimos cambios solo están en memoria y se perderán si cierras la app. Se reintenta solo; puede faltar espacio (los recibos ocupan mucho).",
    en: "Your latest changes are only in memory and will be lost if you close the app. It retries on its own; space may be running out (receipts take a lot).",
  },
  reintentar: { es: "Reintentar", en: "Retry" },
  guardando: { es: "Guardando…", en: "Saving…" },
});

// ES: Reintento manual; el botón se bloquea mientras dura. / EN: Manual retry; the button is disabled meanwhile.
const reintentando = ref(false);
async function reintentar() {
  reintentando.value = true;
  await sesion.vaciarGuardado();
  reintentando.value = false;
}
</script>

<template>
  <!-- ES: Aviso fijo abajo a la derecha, anunciado a lectores de pantalla -->
  <!-- EN: Fixed warning at the bottom right, announced to screen readers -->
  <div
    v-if="sesion.estadoGuardado === 'error' || (reintentando && sesion.estadoGuardado !== 'ok')"
    role="alert"
    class="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-danger bg-surface p-4 shadow-lg"
  >
    <p class="font-semibold text-danger">{{ t("titulo") }}</p>
    <p class="text-sm text-muted mt-1">{{ t("texto") }}</p>
    <button
      type="button"
      class="mt-3 rounded-lg bg-brand px-3 py-1.5 text-sm text-white font-medium disabled:opacity-50"
      :disabled="reintentando"
      @click="reintentar"
    >
      {{ reintentando ? t("guardando") : t("reintentar") }}
    </button>
  </div>
</template>
