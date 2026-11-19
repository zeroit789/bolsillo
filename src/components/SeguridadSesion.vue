<script setup lang="ts">
/* =============================================================================
 * SeguridadSesion.vue — Bloquear ahora, autobloqueo y recuperación / Lock now, auto-lock & recovery
 * -----------------------------------------------------------------------------
 * ES: Parte de la tarjeta de Seguridad de Ajustes que solo tiene sentido con
 *     PIN o contraseña:
 *       - «Bloquear ahora» (guarda lo pendiente y olvida la clave en memoria);
 *       - minutos del autobloqueo por inactividad (0 = nunca);
 *       - generar otra clave de recuperación (pide la credencial actual; la
 *         anterior deja de valer y la clave de datos cambia).
 * EN: Part of the Settings Security card that only makes sense with a PIN or
 *     password:
 *       - "Lock now" (saves what is pending and forgets the in-memory key);
 *       - inactivity auto-lock minutes (0 = never);
 *       - generate a new recovery key (asks for the current credential; the
 *         previous one stops working and the data key changes).
 * ===========================================================================*/
import { ref, useId } from "vue";
import { useSesion } from "../stores/sesion";
import { useAjustes } from "../stores/ajustes";
import { crearT } from "../i18n";

const sesion = useSesion();
const ajustes = useAjustes();
const id = useId();

const t = crearT({
  bloquearAhora: { es: "Bloquear ahora", en: "Lock now" },
  errBloquear: {
    es: "No se ha bloqueado: hay cambios que no se han podido guardar.",
    en: "Not locked: there are changes that could not be saved.",
  },
  autobloqueo: { es: "Bloquear tras estar sin usarla", en: "Lock after being idle for" },
  nunca: { es: "Nunca", en: "Never" },
  minutos: { es: "min", en: "min" },
  autobloqueoDesc: {
    es: "Se bloquea sola si pasa ese tiempo sin tocar el teclado ni el ratón.",
    en: "It locks itself after that time without keyboard or mouse use.",
  },
  recuperacionTitulo: { es: "Clave de recuperación", en: "Recovery key" },
  recuperacionDesc: {
    es: "Abre tus datos si olvidas el PIN o la contraseña. Si la has perdido o crees que alguien la ha visto, genera otra: la anterior dejará de valer.",
    en: "It opens your data if you forget the PIN or password. If you lost it or think someone saw it, generate a new one: the previous one will stop working.",
  },
  sinRecuperacion: {
    es: "Estos datos todavía no tienen clave de recuperación. Genérala ahora.",
    en: "This data does not have a recovery key yet. Generate it now.",
  },
  credActual: { es: "Credencial actual", en: "Current credential" },
  generar: { es: "Generar otra clave", en: "Generate a new key" },
  errCred: { es: "La credencial no es correcta.", en: "The credential is not correct." },
  errGenerar: { es: "No se pudo generar la clave.", en: "Could not generate the key." },
});

// ES: Opciones del autobloqueo en minutos. / EN: Auto-lock options in minutes.
const OPCIONES = [0, 1, 5, 10, 15, 30, 60];

const errorBloqueo = ref("");
const ocupado = ref(false);

// ES: Bloquea ya; si no se pudo guardar lo pendiente, lo dice y no bloquea.
// EN: Locks now; if pending changes could not be saved, it says so and does not lock.
async function bloquear() {
  if (ocupado.value) return;
  errorBloqueo.value = "";
  ocupado.value = true;
  try {
    if (!(await sesion.bloquearAhora())) errorBloqueo.value = t("errBloquear");
  } finally {
    ocupado.value = false;
  }
}

const credencial = ref("");
const errorRecuperacion = ref("");

// ES: Genera otra clave de recuperación; el diálogo global la enseña.
// EN: Generates a new recovery key; the global dialog shows it.
async function generar() {
  if (ocupado.value || !credencial.value) return;
  errorRecuperacion.value = "";
  ocupado.value = true;
  try {
    await sesion.regenerarClaveRecuperacion(credencial.value);
    credencial.value = "";
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    errorRecuperacion.value = m === "credencial" ? t("errCred") : t("errGenerar");
  } finally {
    ocupado.value = false;
  }
}
</script>

<template>
  <div class="space-y-5 border-t border-border pt-4">
    <!-- ES: Bloquear ahora / EN: Lock now -->
    <div>
      <button
        type="button"
        class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-brand disabled:opacity-50"
        :disabled="ocupado"
        @click="bloquear"
      >
        <span aria-hidden="true">🔒</span> {{ t("bloquearAhora") }}
      </button>
      <p v-if="errorBloqueo" role="alert" class="text-danger text-sm mt-2">{{ errorBloqueo }}</p>
    </div>

    <!-- ES: Minutos del autobloqueo / EN: Auto-lock minutes -->
    <div>
      <label :for="`${id}-auto`" class="text-muted text-sm">{{ t("autobloqueo") }}</label>
      <select
        :id="`${id}-auto`"
        :value="ajustes.minutosAutobloqueo"
        class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        @change="ajustes.setMinutosAutobloqueo(Number(($event.target as HTMLSelectElement).value))"
      >
        <option v-for="m in OPCIONES" :key="m" :value="m">
          {{ m === 0 ? t("nunca") : `${m} ${t("minutos")}` }}
        </option>
      </select>
      <p class="text-faint text-xs mt-1">{{ t("autobloqueoDesc") }}</p>
    </div>

    <!-- ES: Clave de recuperación / EN: Recovery key -->
    <form class="space-y-2" @submit.prevent="generar">
      <p class="text-sm font-medium text-ink">{{ t("recuperacionTitulo") }}</p>
      <p class="text-muted text-sm">
        {{ sesion.tieneRecuperacion ? t("recuperacionDesc") : t("sinRecuperacion") }}
      </p>
      <div class="flex flex-wrap gap-2">
        <label :for="`${id}-cred`" class="sr-only">{{ t("credActual") }}</label>
        <input
          :id="`${id}-cred`"
          v-model="credencial"
          type="password"
          :placeholder="t('credActual')"
          class="flex-1 rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-brand disabled:opacity-50"
          :disabled="ocupado || !credencial"
        >
          {{ t("generar") }}
        </button>
      </div>
      <p v-if="errorRecuperacion" role="alert" class="text-danger text-sm">
        {{ errorRecuperacion }}
      </p>
    </form>
  </div>
</template>
