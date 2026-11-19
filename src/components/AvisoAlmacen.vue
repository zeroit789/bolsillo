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
 *     Y además: la clave de recuperación que no se confirmó, el autobloqueo
 *     pendiente de un guardado, las copias que conservan la protección
 *     anterior y el fichero cambiado fuera de la app (no se pisa).
 *     Se puede cerrar; vuelve a salir en el siguiente arranque si sigue igual.
 * EN: Warning strip inside the app for two migration cases from 1.1.0 (see
 *     docs/MIGRACION.md):
 *       - the migration could not be verified: the data is still in the old
 *         storage and it will be retried on the next start;
 *       - there is 1.1.0 data newer than the migrated one (1.1.0 was used
 *         again): it is not imported automatically.
 *     Plus: the recovery key that was not confirmed, the auto-lock waiting
 *     for a save, the backups that keep the previous protection and the file
 *     changed outside the app (it is not overwritten).
 *     It can be dismissed; it shows again on the next start if still true.
 * ===========================================================================*/
import { ref, computed } from "vue";
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
  clave: {
    es: "La clave de recuperación nueva no se llegó a confirmar. Genera otra en Ajustes > Seguridad y apúntala.",
    en: "The new recovery key was not confirmed. Generate another one in Settings > Security and write it down.",
  },
  bloqueo: {
    es: "El bloqueo automático está esperando a que se puedan guardar tus cambios.",
    en: "The automatic lock is waiting until your changes can be saved.",
  },
  copias: {
    es: "Algunas copias automáticas siguen con la protección anterior. Se actualizarán la próxima vez que entres con tu PIN o contraseña.",
    en: "Some automatic backups still have the previous protection. They will be updated the next time you get in with your PIN or password.",
  },
  conflicto: {
    es: "El fichero de datos ha cambiado fuera de la app y no se sobrescribe. Cierra y vuelve a abrir Bolsillo; exporta antes una copia si tienes cambios sin guardar.",
    en: "The data file changed outside the app and is not overwritten. Close and reopen Bolsillo; export a backup first if you have unsaved changes.",
  },
  cerrar: { es: "Cerrar aviso", en: "Dismiss warning" },
});

// ES: Avisos activos, del más grave al menos. / EN: Active warnings, most serious first.
const avisos = computed(() => {
  const v: string[] = [];
  if (sesion.conflicto) v.push(t("conflicto"));
  if (sesion.avisoMigracion) v.push(t("migracion"));
  else if (sesion.avisoLegadoNuevo) v.push(t("legado"));
  if (sesion.claveNoConfirmada) v.push(t("clave"));
  if (sesion.bloqueoPendiente) v.push(t("bloqueo"));
  if (sesion.copiasPendientes > 0) v.push(t("copias"));
  return v;
});
</script>

<template>
  <div
    v-if="!cerrado && avisos.length"
    role="status"
    class="flex items-start gap-3 border-b border-warn/40 bg-warn/10 px-8 py-3 text-sm text-ink"
  >
    <ul class="flex-1 space-y-1">
      <li v-for="a in avisos" :key="a">{{ a }}</li>
    </ul>
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
