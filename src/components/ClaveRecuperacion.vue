<script setup lang="ts">
/* =============================================================================
 * ClaveRecuperacion.vue — Enseñar la clave de recuperación / Show the recovery key
 * -----------------------------------------------------------------------------
 * ES: Diálogo que aparece UNA vez cuando se crea una clave de recuperación (al
 *     poner PIN o contraseña, al migrar desde la 1.1.0 con PIN o al generar
 *     otra). Deja copiarla o imprimirla y no se cierra hasta marcar que está
 *     apuntada; entonces el store la olvida. Si se cierra la app antes, la
 *     clave sigue valiendo pero no se vuelve a ver: se puede generar otra en
 *     Ajustes. Solo se ve con la app desbloqueada: al bloquear, la sesión la
 *     retira y avisa para generar otra.
 * EN: Dialog shown ONCE when a recovery key is created (when setting a PIN or
 *     password, when migrating from 1.1.0 with a PIN or when generating a new
 *     one). It lets you copy or print it and does not close until you tick
 *     that it is written down; then the store forgets it. If the app is
 *     closed first, the key keeps working but is not shown again: a new one
 *     can be generated in Settings. It only shows with the app unlocked: on
 *     lock, the session withdraws it and warns to generate another one.
 * ===========================================================================*/
import { ref, useId } from "vue";
import { useSesion } from "../stores/sesion";
import { useFocoAtrapado } from "../utils/useFocoAtrapado";
import { crearT } from "../i18n";

const sesion = useSesion();
const id = useId();
const caja = ref<HTMLElement | null>(null);
// ES: Sin Escape: hay que confirmar que está apuntada. / EN: No Escape: it must be confirmed as written down.
useFocoAtrapado(caja);

const t = crearT({
  titulo: { es: "Tu clave de recuperación", en: "Your recovery key" },
  texto: {
    es: "Si olvidas el PIN o la contraseña, esta clave abre tus datos. Apúntala en papel o guárdala en tu gestor de contraseñas, fuera de este equipo. Solo se enseña ahora.",
    en: "If you forget the PIN or password, this key opens your data. Write it on paper or keep it in your password manager, away from this computer. It is only shown now.",
  },
  copiar: { es: "Copiar", en: "Copy" },
  copiada: { es: "Copiada.", en: "Copied." },
  imprimir: { es: "Imprimir", en: "Print" },
  apuntada: {
    es: "La he guardado en un sitio seguro",
    en: "I have stored it somewhere safe",
  },
  hecho: { es: "Hecho", en: "Done" },
  pieImpresion: {
    es: "Bolsillo · clave de recuperación. Quien la tenga puede abrir tus datos.",
    en: "Bolsillo · recovery key. Whoever has it can open your data.",
  },
});

// ES: Casilla de "ya la tengo apuntada" y aviso de copiado.
// EN: "I have it written down" checkbox and copy notice.
const apuntada = ref(false);
const copiada = ref(false);

// ES: Copia la clave al portapapeles. / EN: Copies the key to the clipboard.
async function copiar() {
  if (!sesion.claveRecuperacion) return;
  try {
    await navigator.clipboard.writeText(sesion.claveRecuperacion);
    copiada.value = true;
  } catch {
    copiada.value = false;
  }
}

// ES: Imprime solo la tarjeta de la clave (la hoja de estilos de impresión
//     de abajo oculta el resto de la página).
// EN: Prints only the key card (the print stylesheet below hides the rest of
//     the page).
function imprimir() {
  window.print();
}

// ES: Cierra el diálogo y el store olvida la clave. / EN: Closes the dialog and the store forgets the key.
function terminar() {
  if (!apuntada.value) return;
  sesion.olvidarClaveRecuperacion();
  apuntada.value = false;
  copiada.value = false;
}
</script>

<template>
  <div
    v-if="sesion.claveRecuperacion && sesion.desbloqueado"
    class="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 px-4 clave-recuperacion-fondo"
  >
    <div
      ref="caja"
      role="dialog"
      aria-modal="true"
      :aria-labelledby="`${id}-titulo`"
      :aria-describedby="`${id}-texto`"
      class="w-full max-w-md rounded-2xl bg-surface border border-border p-6 space-y-4 clave-recuperacion-imprimible"
    >
      <h2 :id="`${id}-titulo`" class="font-display text-xl font-bold">{{ t("titulo") }}</h2>
      <p :id="`${id}-texto`" class="text-muted text-sm">{{ t("texto") }}</p>
      <!-- ES: La clave en grupos de 4, fácil de copiar a mano / EN: The key in groups of 4, easy to copy by hand -->
      <p
        class="font-mono text-lg text-ink text-center tracking-wider break-all rounded-lg bg-surface-2 border border-border px-3 py-3 select-all"
      >
        {{ sesion.claveRecuperacion }}
      </p>
      <p class="clave-recuperacion-pie text-xs hidden">{{ t("pieImpresion") }}</p>
      <div class="flex gap-3 no-imprimir">
        <button
          type="button"
          class="flex-1 rounded-lg border border-border px-3 py-2 text-ink hover:border-brand"
          @click="copiar"
        >
          {{ t("copiar") }}
        </button>
        <button
          type="button"
          class="flex-1 rounded-lg border border-border px-3 py-2 text-ink hover:border-brand"
          @click="imprimir"
        >
          {{ t("imprimir") }}
        </button>
      </div>
      <p v-if="copiada" role="status" class="text-ok text-xs no-imprimir">{{ t("copiada") }}</p>
      <label class="flex items-center gap-2 text-sm text-ink no-imprimir">
        <input v-model="apuntada" type="checkbox" class="accent-brand" />
        {{ t("apuntada") }}
      </label>
      <button
        type="button"
        class="w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium disabled:opacity-50 no-imprimir"
        :disabled="!apuntada"
        @click="terminar"
      >
        {{ t("hecho") }}
      </button>
    </div>
  </div>
</template>

<!-- ES: Hoja de impresión global (sin scoped): al imprimir solo se ve la tarjeta
     de la clave, sin botones. EN: Global print stylesheet (not scoped): when
     printing only the key card shows, without buttons. -->
<style>
@media print {
  body * {
    visibility: hidden;
  }
  .clave-recuperacion-imprimible,
  .clave-recuperacion-imprimible * {
    visibility: visible;
  }
  .clave-recuperacion-imprimible {
    position: absolute;
    inset: 0 auto auto 0;
    border: none;
  }
  .clave-recuperacion-imprimible .no-imprimir {
    display: none;
  }
  .clave-recuperacion-imprimible .clave-recuperacion-pie {
    display: block;
  }
}
</style>
