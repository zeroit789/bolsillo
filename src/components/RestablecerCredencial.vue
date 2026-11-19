<script setup lang="ts">
/* =============================================================================
 * RestablecerCredencial.vue — PIN nuevo tras la clave de recuperación / New PIN after the recovery key
 * -----------------------------------------------------------------------------
 * ES: Si se entró con la clave de recuperación (PIN olvidado), este diálogo
 *     pide un PIN o una contraseña nuevos sin pedir el antiguo. La clave de
 *     recuperación sigue valiendo. Se puede dejar para luego: volverá a
 *     salir la próxima vez que se entre con la clave.
 * EN: If the app was opened with the recovery key (forgotten PIN), this dialog
 *     asks for a new PIN or password without the old one. The recovery key
 *     keeps working. It can be left for later: it shows up again the next
 *     time the key is used.
 * ===========================================================================*/
import { ref, useId, computed } from "vue";
import { useSesion } from "../stores/sesion";
import { useFocoAtrapado } from "../utils/useFocoAtrapado";
import { validarCredencial, MIN_PASSWORD } from "../utils/credencial";
import { crearT } from "../i18n";
import AvisoPinDebil from "./AvisoPinDebil.vue";

const sesion = useSesion();
const id = useId();
const caja = ref<HTMLElement | null>(null);
// ES: Lo dejó para luego en esta sesión. / EN: Left for later in this session.
const aplazado = ref(false);
const visible = computed(() => sesion.porRecuperacion && sesion.desbloqueado && !aplazado.value);
useFocoAtrapado(caja, { alEscape: () => (aplazado.value = true) });

const t = crearT({
  titulo: { es: "Pon un PIN o una contraseña nuevos", en: "Set a new PIN or password" },
  texto: {
    es: "Has entrado con la clave de recuperación. Elige una credencial nueva; la clave de recuperación sigue valiendo.",
    en: "You got in with the recovery key. Choose a new credential; the recovery key keeps working.",
  },
  tipo: { es: "Tipo", en: "Type" },
  pin: { es: "PIN (4 a 6 cifras)", en: "PIN (4 to 6 digits)" },
  password: {
    es: `Contraseña (mínimo ${MIN_PASSWORD} caracteres)`,
    en: `Password (at least ${MIN_PASSWORD} characters)`,
  },
  nueva: { es: "Nueva", en: "New" },
  repetir: { es: "Repetir", en: "Repeat" },
  guardar: { es: "Guardar", en: "Save" },
  luego: { es: "Ahora no", en: "Not now" },
  errFormatoPin: {
    es: "El PIN debe tener de 4 a 6 cifras.",
    en: "The PIN must have 4 to 6 digits.",
  },
  errCorta: {
    es: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
    en: `The password must be at least ${MIN_PASSWORD} characters long.`,
  },
  errNoCoincide: { es: "No coinciden.", en: "They do not match." },
  errGuardar: { es: "No se pudo guardar. Inténtalo otra vez.", en: "Could not save. Try again." },
});

const tipo = ref<"pin" | "password">("pin");
const nueva = ref("");
const repetir = ref("");
const error = ref("");
const guardando = ref(false);

// ES: Valida y pide al store la credencial nueva. / EN: Validates and asks the store for the new credential.
async function guardar() {
  if (guardando.value) return;
  error.value = "";
  const motivo = validarCredencial(tipo.value, nueva.value);
  if (motivo) {
    error.value = t(motivo === "pin-formato" ? "errFormatoPin" : "errCorta");
    return;
  }
  if (nueva.value !== repetir.value) {
    error.value = t("errNoCoincide");
    return;
  }
  guardando.value = true;
  try {
    await sesion.restablecerCredencial(tipo.value, nueva.value);
    nueva.value = "";
    repetir.value = "";
  } catch {
    error.value = t("errGuardar");
  } finally {
    guardando.value = false;
  }
}
</script>

<template>
  <div v-if="visible" class="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
    <form
      ref="caja"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${id}-titulo`"
      class="w-full max-w-sm rounded-2xl bg-surface border border-border p-5 space-y-3"
      @submit.prevent="guardar"
    >
      <h2 :id="`${id}-titulo`" class="font-display text-lg font-bold">{{ t("titulo") }}</h2>
      <p class="text-muted text-sm">{{ t("texto") }}</p>
      <div>
        <label :for="`${id}-tipo`" class="text-muted text-sm">{{ t("tipo") }}</label>
        <select
          :id="`${id}-tipo`"
          v-model="tipo"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        >
          <option value="pin">{{ t("pin") }}</option>
          <option value="password">{{ t("password") }}</option>
        </select>
      </div>
      <div>
        <label :for="`${id}-nueva`" class="text-muted text-sm">{{ t("nueva") }}</label>
        <input
          :id="`${id}-nueva`"
          v-model="nueva"
          type="password"
          :inputmode="tipo === 'pin' ? 'numeric' : 'text'"
          :maxlength="tipo === 'pin' ? 6 : undefined"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        />
        <AvisoPinDebil v-if="tipo === 'pin'" :pin="nueva" />
      </div>
      <div>
        <label :for="`${id}-repetir`" class="text-muted text-sm">{{ t("repetir") }}</label>
        <input
          :id="`${id}-repetir`"
          v-model="repetir"
          type="password"
          :inputmode="tipo === 'pin' ? 'numeric' : 'text'"
          :maxlength="tipo === 'pin' ? 6 : undefined"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        />
      </div>
      <p v-if="error" role="alert" class="text-danger text-sm">{{ error }}</p>
      <div class="flex gap-3">
        <button
          type="button"
          class="flex-1 rounded-lg border border-border px-3 py-2 text-ink"
          @click="aplazado = true"
        >
          {{ t("luego") }}
        </button>
        <button
          type="submit"
          class="flex-1 rounded-lg bg-brand px-3 py-2 text-white font-medium disabled:opacity-50"
          :disabled="guardando"
        >
          {{ t("guardar") }}
        </button>
      </div>
    </form>
  </div>
</template>
