<script setup lang="ts">
/* =============================================================================
 * PantallaErrorDatos.vue — Datos que no se pueden abrir / Data that cannot be opened
 * -----------------------------------------------------------------------------
 * ES: Pantalla que aparece cuando los datos guardados no se pueden leer (sobre
 *     dañado, credencial que no abre, contenido no válido o versión más nueva).
 *     Nunca se sustituyen por los datos de ejemplo: se informa de la copia de
 *     rescate y se ofrecen salidas: probar otra credencial o la clave de
 *     recuperación, restaurar una copia automática, importar una copia
 *     (cifrada o JSON) o empezar de cero (conservando el rescate).
 * EN: Screen shown when the stored data cannot be read (damaged envelope,
 *     credential that does not open it, invalid content or newer version). It
 *     is never replaced by the sample data: it reports the rescue copy and
 *     offers ways out: try another credential or the recovery key, restore an
 *     automatic backup, import a backup (encrypted or JSON) or start from
 *     scratch (keeping the rescue copy).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones y stores / Imports & stores
 *   2. Textos de UI (i18n) / UI texts (i18n)
 *   3. Probar otra credencial / Try another credential
 *   4. Importar o restaurar copia / Import or restore a backup
 *   5. Empezar de cero y descarga del blob / Start from scratch & blob download
 * ===========================================================================*/

// ── 1. Importaciones y stores / Imports & stores ──────────────────────────────
import { ref, computed, onMounted } from "vue";
import { useSesion } from "../stores/sesion";
import * as almacen from "../utils/almacen";
import { guardarJson } from "../utils/export";
import { useImportarCopia } from "../utils/useImportarCopia";
import { fechaLegibleCopia } from "../utils/copias";
import type { InfoCopia } from "../utils/boveda";
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
  falta: {
    es: "Falta el fichero de datos, pero aquí ya hubo datos (hay copias o una marca del almacén). No se empieza de cero solo para no pisar nada: restaura una copia automática, importa una copia o empieza de cero.",
    en: "The data file is missing, but there was data here (there are backups or a store marker). It does not start from scratch by itself so nothing is overwritten: restore an automatic backup, import a backup or start from scratch.",
  },
  entorno: {
    es: "La app no puede acceder a su almacenamiento. Ciérrala y vuelve a abrirla.",
    en: "The app cannot reach its storage. Close it and open it again.",
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
  usarClave: { es: "Usar la clave de recuperación", en: "Use the recovery key" },
  phClave: { es: "Clave de recuperación", en: "Recovery key" },
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
  copiasTitulo: { es: "Restaurar una copia automática", en: "Restore an automatic backup" },
  restaurar: { es: "Restaurar", en: "Restore" },
  confirmRestaurar: {
    es: "Se restaurará esta copia (si tenía PIN, te lo pedirá). ¿Seguir?",
    en: "This backup will be restored (if it had a PIN, it will be asked). Continue?",
  },
  errRestaurar: { es: "No se pudo restaurar.", en: "Could not restore." },
  contrasenaCopia: { es: "Contraseña de esa copia", en: "That backup's password" },
  abrir: { es: "Abrir", en: "Open" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  "copia-credencial": {
    es: "Esa contraseña no abre la copia.",
    en: "That password does not open the backup.",
  },
  "no-autosuficiente": {
    es: "Ese fichero son los datos de la app o una copia automática, sin los recibos dentro. Usa la lista de copias automáticas.",
    en: "That file is the app data or an automatic backup, without the receipts inside. Use the automatic backups list.",
  },
  importar: {
    es: "Importar una copia (.bolsillo o .json)",
    en: "Import a backup (.bolsillo or .json)",
  },
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
const ocupado = computed(
  () => probando.value || importando.value || importacion?.ocupado.value === true
);

// ES: Prueba la credencial con el store (misma lógica que la pantalla de bloqueo).
// EN: Tries the credential through the store (same logic as the lock screen).
async function probar() {
  if (ocupado.value || !credencial.value) return;
  probando.value = true;
  await sesion.desbloquear(credencial.value);
  probando.value = false;
  credencial.value = "";
}

// ES: Clave de recuperación (solo con el fichero cifrado y si la tiene).
// EN: Recovery key (only with the encrypted file and if it has one).
const conClave = ref(false);
const clave = ref("");
async function probarClave() {
  if (ocupado.value || !clave.value) return;
  probando.value = true;
  await sesion.desbloquearConRecuperacion(clave.value);
  probando.value = false;
  if (sesion.desbloqueado) clave.value = "";
}

// ── 4. Importar o restaurar copia / Import or restore a backup ────────────────
const mensaje = ref("");

// ES: Importa una copia (Rust abre el diálogo). Sin copia de rescate pide
//     confirmación expresa; las categorías se importan de forma atómica.
// EN: Imports a backup (Rust opens the dialog). Without a rescue copy it asks
//     for explicit confirmation; categories are imported atomically.
const contrasenaImportar = ref("");
const importacion = useImportarCopia({
  confirmar: () => !sesion.rescateFallido || confirm(t("confirmSinRescate")),
  forzar: () => sesion.rescateFallido,
  alTerminar: () => (contrasenaImportar.value = ""),
});
// ES: Texto del error de importación. / EN: Import error text.
const errorImportar = computed(() => {
  const c = importacion.error.value;
  if (!c) return "";
  if (c === "copia-invalida") return t("errCopiaInvalida");
  if (c === "copia-version") return t("errCopiaVersion");
  if (c === "sin-rescate") return t("rescateFallido");
  if (c === "copia-credencial" || c === "no-autosuficiente") return t(c);
  return t("errGuardar");
});

// ES: Copias automáticas que se pueden restaurar (solo con el fichero cifrado).
// EN: Automatic backups that can be restored (only with the encrypted file).
const copias = ref<InfoCopia[]>([]);
onMounted(async () => {
  if (sesion.modo !== "fichero") return;
  try {
    copias.value = await sesion.listarCopias();
  } catch {
    copias.value = [];
  }
});
async function restaurar(nombre: string) {
  if (ocupado.value || !confirm(t("confirmRestaurar"))) return;
  mensaje.value = "";
  importando.value = true;
  try {
    await sesion.restaurarCopia(nombre);
  } catch {
    mensaje.value = t("errRestaurar");
  } finally {
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
      <div v-if="sesion.modo === 'legado'" class="space-y-2">
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
          :aria-label="t('phCredencial')"
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
      <!-- ES: Opción 1b: clave de recuperación / EN: Option 1b: recovery key -->
      <div
        v-if="
          sesion.fallo === 'credencial' && sesion.modo === 'fichero' && sesion.tieneRecuperacion
        "
      >
        <button
          v-if="!conClave"
          type="button"
          class="text-xs text-muted underline hover:text-ink"
          @click="conClave = true"
        >
          {{ t("usarClave") }}
        </button>
        <form v-else class="flex gap-2" @submit.prevent="probarClave">
          <input
            v-model="clave"
            type="text"
            autocomplete="off"
            spellcheck="false"
            :placeholder="t('phClave')"
            :aria-label="t('phClave')"
            class="flex-1 font-mono uppercase rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <button
            type="submit"
            class="rounded-lg bg-brand px-4 py-2 text-white font-medium disabled:opacity-50"
            :disabled="ocupado || !clave"
          >
            {{ probando ? t("comprobando") : t("probar") }}
          </button>
        </form>
      </div>
      <p v-if="sesion.error" role="alert" class="text-danger text-sm">{{ t(sesion.error) }}</p>

      <!-- ES: Opción 2: restaurar una copia automática / EN: Option 2: restore an automatic backup -->
      <div v-if="copias.length" class="space-y-2">
        <p class="text-sm font-medium text-ink">{{ t("copiasTitulo") }}</p>
        <ul class="space-y-2 max-h-48 overflow-y-auto">
          <li
            v-for="c in copias"
            :key="c.nombre"
            class="flex items-center justify-between gap-3 rounded-lg bg-surface-2 border border-border px-3 py-2"
          >
            <span class="text-sm text-ink">{{ fechaLegibleCopia(c.nombre) }}</span>
            <button
              type="button"
              class="rounded-lg border border-border px-3 py-1 text-sm text-ink hover:border-brand disabled:opacity-50"
              :disabled="ocupado"
              @click="restaurar(c.nombre)"
            >
              {{ t("restaurar") }}
            </button>
          </li>
        </ul>
      </div>

      <!-- ES: Opción 3: importar copia (cifrada o JSON) / EN: Option 3: import a backup (encrypted or JSON) -->
      <div class="space-y-1">
        <button
          v-if="!importacion.pidiendoContrasena.value"
          type="button"
          class="w-full rounded-lg bg-surface-2 border border-border px-4 py-2.5 text-ink hover:border-brand disabled:opacity-50"
          :disabled="ocupado"
          @click="importacion.elegir()"
        >
          {{ t("importar") }}
        </button>
        <form
          v-else
          class="flex gap-2"
          @submit.prevent="importacion.enviarContrasena(contrasenaImportar)"
        >
          <input
            v-model="contrasenaImportar"
            type="password"
            :placeholder="t('contrasenaCopia')"
            :aria-label="t('contrasenaCopia')"
            class="flex-1 rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <button
            type="submit"
            class="rounded-lg bg-brand px-4 py-2 text-white font-medium disabled:opacity-50"
            :disabled="ocupado || !contrasenaImportar"
          >
            {{ t("abrir") }}
          </button>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-2 text-ink"
            @click="importacion.cancelar()"
          >
            {{ t("cancelar") }}
          </button>
        </form>
        <p class="text-faint text-xs">{{ t("importarNota") }}</p>
        <p v-if="errorImportar" role="alert" class="text-danger text-sm">{{ errorImportar }}</p>
      </div>

      <!-- ES: Opción 4: empezar de cero / EN: Option 4: start from scratch -->
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
