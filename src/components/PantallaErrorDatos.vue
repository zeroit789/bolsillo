<script setup lang="ts">
/* =============================================================================
 * PantallaErrorDatos.vue — Datos que no se pueden abrir / Data that cannot be opened
 * -----------------------------------------------------------------------------
 * ES: Pantalla que aparece cuando los datos guardados no se pueden leer (sobre
 *     dañado, credencial que no abre, contenido no válido o versión más nueva).
 *     Nunca se sustituyen por los datos de ejemplo: se informa de la copia de
 *     rescate y se ofrecen tres salidas: probar otra credencial, importar una
 *     copia o empezar de cero (conservando el rescate).
 * EN: Screen shown when the stored data cannot be read (damaged envelope,
 *     credential that does not open it, invalid content or newer version). It
 *     is never replaced by the sample data: it reports the rescue copy and
 *     offers three ways out: try another credential, import a backup or start
 *     from scratch (keeping the rescue copy).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y stores / Imports & stores
 *   2. Textos de UI (i18n) / UI texts (i18n)
 *   3. Probar otra credencial / Try another credential
 *   4. Importar copia / Import backup
 *   5. Empezar de cero y descarga del blob / Start from scratch & blob download
 * ===========================================================================*/

// ── 1. Importaciones y stores / Imports & stores ──────────────────────────────
import { ref, computed } from "vue";
import { useSesion } from "../stores/sesion";
import { setCategoriasCustom } from "../data/categorias";
import * as almacen from "../utils/almacen";
import { guardarJson } from "../utils/export";
import { crearT } from "../i18n";

const sesion = useSesion();

// ── 2. Textos de UI (i18n) / UI texts (i18n) ──────────────────────────────────
// ES: Textos ES/EN. No se promete más de lo que se sabe: con AES-GCM una
//     credencial mala y un cifrado alterado fallan igual.
// EN: ES/EN texts. Nothing beyond what is known is promised: with AES-GCM a
//     wrong credential and altered ciphertext fail the same way.
const t = crearT({
  titulo: { es: "No se pueden abrir tus datos", en: "Your data cannot be opened" },
  danado: {
    es: "Los datos guardados están dañados: su estructura no se puede leer.",
    en: "The saved data is damaged: its structure cannot be read.",
  },
  invalido: {
    es: "Los datos se han descifrado, pero su contenido no es válido.",
    en: "The data was decrypted, but its content is not valid.",
  },
  version: {
    es: "Estos datos los guardó una versión más nueva de Bolsillo. Actualiza la app para abrirlos.",
    en: "This data was saved by a newer version of Bolsillo. Update the app to open it.",
  },
  credencial: {
    es: "No se han podido abrir los datos con la configuración actual. Si protegiste la app con un PIN o una contraseña, escríbelo aquí. Si estás seguro de que es correcto, puede que los datos estén alterados: el cifrado no permite distinguir un caso del otro.",
    en: "The data could not be opened with the current settings. If you protected the app with a PIN or a password, type it here. If you are sure it is right, the data may have been altered: the encryption cannot tell one case from the other.",
  },
  rescateOk: {
    es: "Se ha guardado una copia intacta de estos datos, que no se borra:",
    en: "An untouched copy of this data has been kept and will not be deleted:",
  },
  rescateFallido: {
    es: "No hay espacio para guardar una copia de rescate. Descarga los datos antes de importar o empezar de cero, o se perderán.",
    en: "There is no space to keep a rescue copy. Download the data before importing or starting from scratch, or it will be lost.",
  },
  descargar: {
    es: "Descargar los datos ilegibles (.json)",
    en: "Download the unreadable data (.json)",
  },
  descargado: { es: "Datos descargados.", en: "Data downloaded." },
  errDescarga: { es: "No se pudo descargar.", en: "Could not download." },
  phCredencial: { es: "PIN o contraseña", en: "PIN or password" },
  probar: { es: "Probar", en: "Try" },
  comprobando: { es: "Comprobando…", en: "Checking…" },
  credIncorrecta: {
    es: "No abre los datos (credencial incorrecta o datos alterados).",
    en: "It does not open the data (wrong credential or altered data).",
  },
  lecturaFallida: { es: "No se pudieron leer los datos.", en: "Could not read the data." },
  importar: { es: "Importar una copia (.json)", en: "Import a backup (.json)" },
  importarNota: {
    es: "La copia importada se guarda sin PIN; puedes ponerlo después en Ajustes.",
    en: "The imported backup is saved without a PIN; you can set one later in Settings.",
  },
  errCopiaInvalida: { es: "La copia no es válida.", en: "The backup is not valid." },
  errCopiaVersion: {
    es: "La copia es de una versión más nueva de Bolsillo.",
    en: "The backup comes from a newer version of Bolsillo.",
  },
  errCopiaLeer: { es: "No se pudo leer el fichero.", en: "Could not read the file." },
  errGuardar: {
    es: "No se ha podido guardar. Comprueba el espacio y vuelve a intentarlo.",
    en: "Could not save. Check the free space and try again.",
  },
  empezar: { es: "Empezar de cero", en: "Start from scratch" },
  confirmEmpezar: {
    es: "Se abrirá la bienvenida y los datos nuevos sustituirán a los ilegibles. La copia de rescate se conserva. ¿Seguir?",
    en: "The welcome screen will open and the new data will replace the unreadable data. The rescue copy is kept. Continue?",
  },
  confirmSinRescate: {
    es: "No hay copia de rescate: los datos ilegibles se perderán. ¿Seguir de todos modos?",
    en: "There is no rescue copy: the unreadable data will be lost. Continue anyway?",
  },
});

// ES: Texto principal según el motivo del fallo. / EN: Main text for the failure reason.
const explicacion = computed(() => (sesion.fallo ? t(sesion.fallo) : ""));

// ── 3. Probar otra credencial / Try another credential ────────────────────────
const credencial = ref("");
const probando = ref(false);
// ES: Las salidas son excluyentes: mientras una corre, las demás se bloquean
//     (probar una credencial e importar a la vez podría mezclar resultados).
// EN: The ways out are exclusive: while one runs, the others are blocked
//     (trying a credential and importing at once could mix results).
const importando = ref(false);
const ocupado = computed(() => probando.value || importando.value);

// ES: Prueba la credencial con el store (misma lógica que la pantalla de bloqueo).
// EN: Tries the credential through the store (same logic as the lock screen).
async function probar() {
  if (ocupado.value || !credencial.value) return;
  probando.value = true;
  await sesion.desbloquear(credencial.value);
  probando.value = false;
  credencial.value = "";
}

// ── 4. Importar copia / Import backup ─────────────────────────────────────────
const mensaje = ref("");
const inputFichero = ref<HTMLInputElement | null>(null);

// ES: Lee la copia elegida y la importa por el camino único (migrar + validar).
//     Si no hay copia de rescate, pide confirmación expresa antes de seguir.
// EN: Reads the chosen backup and imports it through the single path
//     (migrate + validate). Without a rescue copy, asks for explicit
//     confirmation before going on.
async function importar(evento: Event) {
  mensaje.value = "";
  const input = evento.target as HTMLInputElement;
  const fichero = input.files?.[0];
  if (!fichero || ocupado.value) return;
  importando.value = true;
  try {
    const datos: unknown = JSON.parse(await fichero.text());
    const forzar = sesion.rescateFallido ? confirm(t("confirmSinRescate")) : false;
    if (sesion.rescateFallido && !forzar) return;
    await sesion.importarDatos(datos, forzar);
    // ES: Restaura las categorías propias de la copia (si las trae).
    // EN: Restores the backup's custom categories (if any).
    const custom = (datos as { categoriasCustom?: unknown }).categoriasCustom;
    if (Array.isArray(custom)) setCategoriasCustom(custom.filter((c) => typeof c === "string"));
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    mensaje.value =
      m === "copia-invalida"
        ? t("errCopiaInvalida")
        : m === "copia-version"
          ? t("errCopiaVersion")
          : e instanceof SyntaxError
            ? t("errCopiaInvalida")
            : m === "sin-rescate"
              ? t("rescateFallido")
              : t("errGuardar");
  } finally {
    input.value = "";
    importando.value = false;
  }
}

// ── 5. Empezar de cero y descarga del blob / Start from scratch & blob download ─
// ES: Empieza de cero tras confirmar (dos veces si no hay copia de rescate).
// EN: Starts from scratch after confirming (twice if there is no rescue copy).
function empezar() {
  if (ocupado.value) return;
  if (!confirm(t("confirmEmpezar"))) return;
  if (sesion.empezarDeCero()) return;
  if (confirm(t("confirmSinRescate"))) sesion.empezarDeCero(true);
}

// ES: Descarga el blob ilegible tal cual (cifrado) a un fichero elegido por el usuario.
// EN: Downloads the unreadable blob as is (encrypted) to a file the user picks.
const descarga = ref("");
async function descargar() {
  const blob = almacen.blobCrudo();
  if (blob === null) return;
  try {
    if (await guardarJson("bolsillo-datos-ilegibles.json", blob)) descarga.value = t("descargado");
  } catch {
    descarga.value = t("errDescarga");
  }
}
</script>

<template>
  <!-- ES: Tarjeta centrada a pantalla completa / EN: Full-screen centered card -->
  <div class="min-h-screen flex items-center justify-center bg-base p-6">
    <div class="w-full max-w-lg rounded-2xl bg-surface border border-border p-7 space-y-5">
      <h1 class="font-display text-2xl font-extrabold">{{ t("titulo") }}</h1>
      <p class="text-ink text-sm">{{ explicacion }}</p>

      <!-- ES: Estado de la copia de rescate / EN: Rescue copy status -->
      <p v-if="sesion.rescate" class="text-muted text-xs break-all">
        {{ t("rescateOk") }} <code class="text-ink">{{ sesion.rescate }}</code>
      </p>
      <!-- ES: La descarga siempre está: es la única forma de sacar los datos ilegibles
           de la app (y la única copia si el rescate no cupo).
           EN: The download is always there: it is the only way to get the unreadable
           data out of the app (and the only copy if the rescue did not fit). -->
      <div class="space-y-2">
        <p v-if="sesion.rescateFallido" class="text-danger text-sm">{{ t("rescateFallido") }}</p>
        <button
          type="button"
          class="rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm text-ink hover:border-brand"
          @click="descargar"
        >
          {{ t("descargar") }}
        </button>
        <p v-if="descarga" class="text-muted text-xs">{{ descarga }}</p>
      </div>

      <!-- ES: Opción 1: otra credencial (solo si el fallo puede ser de credencial) -->
      <!-- EN: Option 1: another credential (only if the failure may be a credential one) -->
      <form v-if="sesion.fallo === 'credencial'" class="flex gap-2" @submit.prevent="probar">
        <input
          v-model="credencial"
          type="password"
          :placeholder="t('phCredencial')"
          class="flex-1 rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium disabled:opacity-50"
          :disabled="ocupado || !credencial"
        >
          {{ probando ? t("comprobando") : t("probar") }}
        </button>
      </form>
      <p v-if="sesion.error" class="text-danger text-sm">{{ t(sesion.error) }}</p>

      <!-- ES: Opción 2: importar copia / EN: Option 2: import a backup -->
      <div class="space-y-1">
        <button
          type="button"
          class="w-full rounded-lg bg-surface-2 border border-border px-4 py-2.5 text-ink hover:border-brand disabled:opacity-50"
          :disabled="ocupado"
          @click="inputFichero?.click()"
        >
          {{ t("importar") }}
        </button>
        <input
          ref="inputFichero"
          type="file"
          accept="application/json,.json"
          class="hidden"
          @change="importar"
        />
        <p class="text-faint text-xs">{{ t("importarNota") }}</p>
      </div>

      <!-- ES: Opción 3: empezar de cero / EN: Option 3: start from scratch -->
      <button
        type="button"
        class="w-full rounded-lg border border-danger/60 px-4 py-2.5 text-danger hover:bg-danger/10 disabled:opacity-50"
        :disabled="ocupado"
        @click="empezar"
      >
        {{ t("empezar") }}
      </button>

      <p v-if="mensaje" class="text-danger text-sm">{{ mensaje }}</p>
    </div>
  </div>
</template>
