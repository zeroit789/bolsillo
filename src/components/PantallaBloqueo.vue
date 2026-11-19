<script setup lang="ts">
/* =============================================================================
 * PantallaBloqueo.vue — Pantalla de bloqueo / Lock screen
 * -----------------------------------------------------------------------------
 * ES: Pantalla de bloqueo: aparece al arrancar con PIN o contraseña, tras
 *     «Bloquear ahora» y tras el autobloqueo. Verifica la credencial pidiendo
 *     a Rust que abra los datos. Si se ha olvidado el PIN, permite entrar con
 *     la clave de recuperación (después se pide un PIN nuevo).
 *     Una sola operación a la vez: mientras se comprueba algo, los demás
 *     botones se desactivan y un resultado que llegue tarde se descarta.
 * EN: Lock screen: shown on start with a PIN or password, after "Lock now"
 *     and after auto-lock. It verifies the credential by asking Rust to open
 *     the data. If the PIN is forgotten, it lets you in with the recovery key
 *     (a new PIN is asked afterwards).
 *     One operation at a time: while something is being checked, the other
 *     buttons are disabled and a late result is discarded.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y stores / Imports & stores
 *   2. Textos de UI (i18n) / UI texts (i18n)
 *   3. Estado local / Local state
 *   4. Acciones / Actions
 * ===========================================================================*/

// ── 1. Importaciones y stores / Imports & stores ──────────────────────────────
import { ref, computed, useId } from "vue";
import { useSesion } from "../stores/sesion";
import { useAjustes } from "../stores/ajustes";
import { crearT } from "../i18n";

const sesion = useSesion();
const ajustes = useAjustes();
const id = useId();

// ── 2. Textos de UI (i18n) / UI texts (i18n) ──────────────────────────────────
const t = crearT({
  introducePin: { es: "Introduce tu PIN", en: "Enter your PIN" },
  introducePassword: { es: "Introduce tu contraseña", en: "Enter your password" },
  comprobando: { es: "Comprobando…", en: "Checking…" },
  desbloquear: { es: "Desbloquear", en: "Unlock" },
  credIncorrecta: { es: "PIN o contraseña incorrectos.", en: "Wrong PIN or password." },
  lecturaFallida: { es: "No se pudieron leer los datos.", en: "Could not read the data." },
  olvidado: {
    es: "¿Has olvidado el PIN? Usar la clave de recuperación",
    en: "Forgot the PIN? Use the recovery key",
  },
  claveRecuperacion: { es: "Clave de recuperación", en: "Recovery key" },
  phClave: { es: "XXXX-XXXX-…", en: "XXXX-XXXX-…" },
  entrarConClave: { es: "Entrar con la clave", en: "Get in with the key" },
  volverPin: { es: "Volver al PIN", en: "Back to the PIN" },
  recuperacionIncorrecta: {
    es: "Esa clave de recuperación no abre estos datos.",
    en: "That recovery key does not open this data.",
  },
  recuperacionFormato: {
    es: "La clave tiene 32 letras y números en 8 grupos de 4.",
    en: "The key has 32 letters and numbers in 8 groups of 4.",
  },
  recuperacionErrata: {
    es: "Hay una errata en la clave: revisa letra a letra.",
    en: "There is a typo in the key: check it character by character.",
  },
  sinRecuperacion: {
    es: "Estos datos no tienen clave de recuperación.",
    en: "This data has no recovery key.",
  },
  recuperar: {
    es: "¿No puedes entrar? Otras opciones (importar una copia o empezar de cero)",
    en: "Can't get in? Other options (import a backup or start from scratch)",
  },
  datosCifrados: {
    es: "Tus datos están cifrados en este equipo.",
    en: "Your data is encrypted on this device.",
  },
});

// ── 3. Estado local / Local state ─────────────────────────────────────────────
// ES: credencial/clave tecleadas; `operacion` = qué se está comprobando (una
//     sola a la vez); `intento` numera las operaciones para descartar
//     resultados de una anterior; fallos = intentos fallidos con el PIN.
// EN: typed credential/key; `operacion` = what is being checked (one at a
//     time); `intento` numbers the operations to discard results of an
//     earlier one; fallos = failed PIN attempts.
const credencial = ref("");
const clave = ref("");
const conClave = ref(false);
const operacion = ref<null | "pin" | "clave" | "opciones">(null);
let intento = 0;
const fallos = ref(0);
const ocupado = computed(() => operacion.value !== null);

// ES: PIN o contraseña según la cabecera del fichero (sincronizada en ajustes).
// EN: PIN or password according to the file header (synced into ajustes).
const esPin = computed(() => ajustes.bloqueoTipo === "pin");

// ── 4. Acciones / Actions ─────────────────────────────────────────────────────
// ES: Ejecuta una operación si no hay otra en curso; si mientras tanto empieza
//     otra, el final de esta no toca el estado.
// EN: Runs an operation if no other is running; if another one starts
//     meanwhile, this one's ending does not touch the state.
async function ejecutar(tipo: "pin" | "clave" | "opciones", op: () => Promise<void>) {
  if (ocupado.value) return;
  const mio = ++intento;
  operacion.value = tipo;
  try {
    await op();
  } finally {
    if (mio === intento) operacion.value = null;
  }
}

// ES: Desbloquear con el PIN o la contraseña. / EN: Unlock with the PIN or password.
function entrar() {
  if (!credencial.value) return;
  void ejecutar("pin", async () => {
    await sesion.desbloquear(credencial.value);
    if (!sesion.desbloqueado) {
      credencial.value = "";
      fallos.value++;
    }
  });
}

// ES: Entrar con la clave de recuperación. / EN: Get in with the recovery key.
function entrarConClave() {
  if (!clave.value) return;
  void ejecutar("clave", async () => {
    await sesion.desbloquearConRecuperacion(clave.value);
    if (sesion.desbloqueado) clave.value = "";
  });
}

// ES: Pantalla de recuperación (importar o empezar de cero) sin tocar los datos.
// EN: Recovery screen (import or start from scratch) without touching the data.
function opciones() {
  void ejecutar("opciones", () => sesion.mostrarRecuperacion());
}
</script>

<template>
  <!-- ES: Tarjeta de bloqueo centrada a pantalla completa / EN: Full-screen centered lock card -->
  <div class="min-h-screen flex items-center justify-center bg-base p-6">
    <div class="w-full max-w-xs text-center">
      <h1 class="font-display text-3xl font-extrabold mb-1">
        Bolsillo<span class="text-brand">.</span>
      </h1>

      <!-- ES: Modo normal: PIN o contraseña / EN: Normal mode: PIN or password -->
      <form v-if="!conClave" @submit.prevent="entrar">
        <p class="text-muted text-sm mb-6">
          {{ esPin ? t("introducePin") : t("introducePassword") }}
        </p>
        <input
          v-model="credencial"
          :aria-label="esPin ? t('introducePin') : t('introducePassword')"
          type="password"
          :inputmode="esPin ? 'numeric' : 'text'"
          :maxlength="esPin ? 6 : undefined"
          autofocus
          class="w-full text-center tracking-widest rounded-lg bg-surface border border-border px-3 py-3 text-ink outline-none focus:border-brand"
          :placeholder="esPin ? '••••' : '••••••••'"
        />
        <button
          type="submit"
          class="mt-5 w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium hover:bg-brand-soft transition-colors disabled:opacity-50"
          :disabled="ocupado || !credencial"
        >
          {{ operacion === "pin" ? t("comprobando") : t("desbloquear") }}
        </button>
      </form>

      <!-- ES: Modo clave de recuperación / EN: Recovery key mode -->
      <form v-else class="space-y-3" @submit.prevent="entrarConClave">
        <label :for="`${id}-clave`" class="block text-muted text-sm mb-3">
          {{ t("claveRecuperacion") }}
        </label>
        <input
          :id="`${id}-clave`"
          v-model="clave"
          type="text"
          autocomplete="off"
          spellcheck="false"
          autofocus
          :placeholder="t('phClave')"
          class="w-full text-center font-mono uppercase rounded-lg bg-surface border border-border px-3 py-3 text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          class="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium hover:bg-brand-soft transition-colors disabled:opacity-50"
          :disabled="ocupado || !clave"
        >
          {{ operacion === "clave" ? t("comprobando") : t("entrarConClave") }}
        </button>
      </form>

      <!-- ES: Error de la última operación / EN: Error of the last operation -->
      <p v-if="sesion.error" role="alert" class="text-danger text-sm mt-3">
        {{ t(sesion.error) }}
      </p>

      <!-- ES: Cambiar entre PIN y clave de recuperación / EN: Switch between PIN and recovery key -->
      <button
        v-if="sesion.modo === 'fichero' && sesion.tieneRecuperacion"
        type="button"
        class="mt-4 block w-full text-xs text-muted underline hover:text-ink disabled:opacity-50"
        :disabled="ocupado"
        @click="conClave = !conClave"
      >
        {{ conClave ? t("volverPin") : t("olvidado") }}
      </button>

      <!-- ES: Tras un fallo: otras opciones (importar o empezar de cero) -->
      <!-- EN: After a failure: other options (import or start from scratch) -->
      <button
        v-if="fallos > 0"
        type="button"
        class="mt-3 block w-full text-xs text-muted underline hover:text-ink disabled:opacity-50"
        :disabled="ocupado"
        @click="opciones"
      >
        {{ t("recuperar") }}
      </button>

      <p class="text-faint text-xs mt-6">{{ t("datosCifrados") }}</p>
    </div>
  </div>
</template>
