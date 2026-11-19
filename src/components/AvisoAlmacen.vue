<script setup lang="ts">
/* =============================================================================
 * AvisoAlmacen.vue — Avisos de la migración / Migration warnings
 * -----------------------------------------------------------------------------
 * ES: Franja de aviso dentro de la app para dos casos de la migración desde la
 *     1.1.0 (ver docs/MIGRACION.md):
 *       - la migración no se pudo verificar: los datos siguen en el
 *         almacenamiento antiguo y se reintentará al volver a abrir;
 *       - hay datos de la 1.1.0 más nuevos que los migrados (se volvió a usar
 *         la 1.1.0): no se importan solos.
 *     Se puede cerrar; vuelve a salir en el siguiente arranque si sigue igual.
 * EN: Warning strip inside the app for two migration cases from 1.1.0 (see
 *     docs/MIGRACION.md):
 *       - the migration could not be verified: the data is still in the old
 *         storage and it will be retried on the next start;
 *       - there is 1.1.0 data newer than the migrated one (1.1.0 was used
 *         again): it is not imported automatically.
 *     It can be dismissed; it shows again on the next start if still true.
 * ===========================================================================*/
import { ref } from "vue";
import { useSesion } from "../stores/sesion";
import { crearT } from "../i18n";

const sesion = useSesion();
// ES: Cerrado por el usuario en esta sesión. / EN: Dismissed by the user in this session.
const cerrado = ref(false);

const t = crearT({
  migracion: {
    es: "No se pudieron pasar tus datos al nuevo fichero cifrado. Siguen guardándose como en la versión anterior y no se ha perdido nada; se volverá a intentar la próxima vez que abras la app.",
    en: "Your data could not be moved to the new encrypted file. It keeps being saved as in the previous version and nothing was lost; it will be tried again the next time you open the app.",
  },
  legado: {
    es: "Hay datos de la versión 1.1.0 posteriores a la actualización. No se han importado para no pisar lo que tienes aquí. Si los quieres, exporta una copia desde la 1.1.0 e impórtala en Ajustes (sustituye los datos actuales).",
    en: "There is data from version 1.1.0 newer than the update. It has not been imported so what you have here is not overwritten. If you want it, export a backup from 1.1.0 and import it in Settings (it replaces the current data).",
  },
  cerrar: { es: "Cerrar aviso", en: "Dismiss warning" },
});
</script>

<template>
  <div
    v-if="!cerrado && (sesion.avisoMigracion || sesion.avisoLegadoNuevo)"
    role="status"
    class="flex items-start gap-3 border-b border-warn/40 bg-warn/10 px-8 py-3 text-sm text-ink"
  >
    <p class="flex-1">{{ sesion.avisoMigracion ? t("migracion") : t("legado") }}</p>
    <button
      type="button"
      class="rounded px-2 text-muted hover:text-ink"
      :aria-label="t('cerrar')"
      @click="cerrado = true"
    >
      <span aria-hidden="true">✕</span>
    </button>
  </div>
</template>
