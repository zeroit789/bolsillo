<script setup lang="ts">
/* =============================================================================
 * PantallaBloqueo.vue — Pantalla de bloqueo / Lock screen
 * -----------------------------------------------------------------------------
 * ES: Pantalla de bloqueo que aparece al arrancar si el usuario activó un PIN o
 *     contraseña. Verifica la credencial intentando descifrar los datos.
 * EN: Lock screen shown on startup when the user enabled a PIN or password.
 *     It verifies the credential by trying to decrypt the stored data.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y stores / Imports & stores
 *   2. Textos de UI (i18n) / UI texts (i18n)
 *   3. Estado local / Local state
 *   4. Acción de desbloqueo / Unlock action
 * ===========================================================================*/

// ── 1. Importaciones y stores / Imports & stores ──────────────────────────────
// ES: Reactividad de Vue + los stores de sesión/ajustes + el helper de i18n.
// EN: Vue reactivity + the session/settings stores + the i18n text helper.
import { ref, computed } from "vue";
import { useSesion } from "../stores/sesion";
import { useAjustes } from "../stores/ajustes";
import { crearT } from "../i18n";

const sesion = useSesion();
const ajustes = useAjustes();

// ── 2. Textos de UI (i18n) / UI texts (i18n) ──────────────────────────────────
// ES: Diccionario de textos visibles de la pantalla de bloqueo (ES/EN).
// EN: Dictionary of the visible texts of the lock screen (ES/EN).
const t = crearT({
  introducePin: { es: "Introduce tu PIN", en: "Enter your PIN" },
  introducePassword: { es: "Introduce tu contraseña", en: "Enter your password" },
  comprobando: { es: "Comprobando…", en: "Checking…" },
  desbloquear: { es: "Desbloquear", en: "Unlock" },
  credIncorrecta: { es: "Credencial incorrecta", en: "Wrong credential" },
  lecturaFallida: { es: "No se pudieron leer los datos", en: "Could not read the data" },
  datosCifrados: {
    es: "Tus datos están cifrados en este equipo.",
    en: "Your data is encrypted on this device.",
  },
});

// ── 3. Estado local / Local state ─────────────────────────────────────────────
// ES: credencial = el PIN/contraseña tecleado; cargando = true mientras verifica.
// EN: credencial = the typed PIN/password; cargando = true while verifying.
const credencial = ref("");
const cargando = ref(false);

// ES: True cuando el tipo de bloqueo configurado es PIN (vs. contraseña); decide
//     el modo de entrada, longitud máxima y placeholder en la plantilla.
// EN: True when the configured lock type is a PIN (vs. password); drives the
//     input mode, max length and placeholder in the template.
const esPin = computed(() => ajustes.bloqueoTipo === "pin");

// ── 4. Acción de desbloqueo / Unlock action ───────────────────────────────────
// ES: Verifica la credencial pidiendo al store de sesión que descifre los datos.
//     Guarda contra reentradas: si ya hay una verificación en curso, ignora
//     disparos repetidos (p. ej. pulsar Enter varias veces) para no encolar
//     varios intentos de desbloqueo a la vez. Si falla, limpia el input.
// EN: Verifies the credential by asking the session store to decrypt the data.
//     Guard against re-entrancy: if a verification is already running, ignore
//     repeated triggers (e.g. hammering Enter) so we never queue several
//     unlock attempts at once. On failure it clears the input.
async function entrar() {
  // ES: Guarda de reentrada: salir si un intento anterior sigue en curso.
  // EN: Re-entrancy guard: bail out while a previous attempt is still running.
  if (cargando.value) return;
  // ES: Nada tecleado aún → no hacer nada. / EN: Nothing typed yet → do nothing.
  if (!credencial.value) return;
  cargando.value = true;
  await sesion.desbloquear(credencial.value);
  cargando.value = false;
  // ES: Limpia el campo si la credencial era incorrecta.
  // EN: Clear the field if the credential was wrong.
  if (!sesion.desbloqueado) credencial.value = "";
}
</script>

<template>
  <!-- ES: Tarjeta de bloqueo centrada a pantalla completa / EN: Full-screen centered lock card -->
  <div class="min-h-screen flex items-center justify-center bg-base p-6">
    <div class="w-full max-w-xs text-center">
      <!-- ES: Logo / EN: Logo -->
      <h1 class="font-display text-3xl font-extrabold mb-1">
        Bolsillo<span class="text-brand">.</span>
      </h1>
      <!-- ES: Indicación: PIN o contraseña según el tipo de bloqueo -->
      <!-- EN: Prompt: PIN or password depending on the lock type -->
      <p class="text-muted text-sm mb-6">
        {{ esPin ? t("introducePin") : t("introducePassword") }}
      </p>

      <!-- ES: Input de credencial; Enter dispara la acción de desbloqueo -->
      <!-- EN: Credential input; Enter triggers the unlock action -->
      <input
        v-model="credencial"
        type="password"
        :inputmode="esPin ? 'numeric' : 'text'"
        :maxlength="esPin ? 6 : undefined"
        autofocus
        class="w-full text-center tracking-widest rounded-lg bg-surface border border-border px-3 py-3 text-ink outline-none focus:border-brand"
        :placeholder="esPin ? '••••' : '••••••••'"
        @keyup.enter="entrar"
      />

      <!-- ES: Mensaje de error (p. ej. credencial incorrecta) / EN: Error message (e.g. wrong credential) -->
      <p v-if="sesion.error" class="text-danger text-sm mt-3">{{ t(sesion.error) }}</p>

      <!-- ES: Botón de desbloqueo; deshabilitado mientras carga o con campo vacío -->
      <!-- EN: Unlock button; disabled while loading or with empty field -->
      <button
        class="mt-5 w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium hover:bg-brand-soft transition-colors disabled:opacity-50"
        :disabled="cargando || !credencial"
        @click="entrar"
      >
        {{ cargando ? t("comprobando") : t("desbloquear") }}
      </button>

      <!-- ES: Tranquilidad: los datos están cifrados localmente / EN: Reassurance: data is encrypted locally -->
      <p class="text-faint text-xs mt-6">{{ t("datosCifrados") }}</p>
    </div>
  </div>
</template>
