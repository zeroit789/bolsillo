<script setup lang="ts">
/* =============================================================================
 * CopiasSeguridad.vue — Copias de seguridad en Ajustes / Backups in Settings
 * -----------------------------------------------------------------------------
 * ES: Tarjeta de copias de Ajustes:
 *       1. Copia cifrada (.bolsillo) con contraseña propia, guardada con el
 *          diálogo nativo que abre Rust. Lleva los recibos y las categorías.
 *       2. Importar una copia: cifrada o JSON (también la de la 1.1.0).
 *       3. Copia JSON sin cifrar (legible), con aviso.
 *       4. Copias automáticas: lista y restaurar (el estado actual se guarda
 *          antes como "antes de restaurar").
 * EN: Settings backups card:
 *       1. Encrypted backup (.bolsillo) with its own password, saved with the
 *          native dialog Rust opens. It carries receipts and categories.
 *       2. Import a backup: encrypted or JSON (also the 1.1.0 one).
 *       3. Unencrypted JSON backup (readable), with a warning.
 *       4. Automatic backups: list and restore (the current state is saved
 *          first as "before restoring").
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Textos / Texts
 *   2. Copia cifrada / Encrypted backup
 *   3. Importar / Import
 *   4. Copia JSON / JSON backup
 *   5. Copias automáticas / Automatic backups
 * ===========================================================================*/
import { ref, useId, onMounted } from "vue";
import { useSesion } from "../stores/sesion";
import { useFinanzas } from "../stores/finanzas";
import { categoriasCustom } from "../data/categorias";
import { guardarJson } from "../utils/export";
import { validarCredencial, MIN_PASSWORD } from "../utils/credencial";
import { useImportarCopia } from "../utils/useImportarCopia";
import type { InfoCopia } from "../utils/boveda";
import { fechaLegibleCopia } from "../utils/copias";
import { crearT } from "../i18n";

const sesion = useSesion();
const finanzas = useFinanzas();
const id = useId();
const emit = defineEmits<{ importada: [] }>();

// ── 1. Textos / Texts ─────────────────────────────────────────────────────────
const t = crearT({
  titulo: { es: "Copia de seguridad", en: "Backup" },
  cifradaTitulo: { es: "Copia cifrada (recomendada)", en: "Encrypted backup (recommended)" },
  cifradaDesc: {
    es: `Un fichero .bolsillo cifrado con su propia contraseña (mínimo ${MIN_PASSWORD} caracteres), con los recibos dentro. Guárdalo fuera de este equipo: es la que sirve si se pierde el disco.`,
    en: `A .bolsillo file encrypted with its own password (at least ${MIN_PASSWORD} characters), with the receipts inside. Keep it off this computer: it is the one that helps if the disk is lost.`,
  },
  contrasena: { es: "Contraseña de la copia", en: "Backup password" },
  repetir: { es: "Repetir contraseña", en: "Repeat password" },
  exportarCifrada: { es: "Guardar copia cifrada…", en: "Save encrypted backup…" },
  okExportada: { es: "Copia cifrada guardada.", en: "Encrypted backup saved." },
  errCorta: {
    es: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
    en: `The password must be at least ${MIN_PASSWORD} characters long.`,
  },
  errNoCoincide: { es: "Las contraseñas no coinciden.", en: "The passwords do not match." },
  errExportar: { es: "No se pudo guardar la copia.", en: "Could not save the backup." },
  errDestino: {
    es: "No se puede guardar dentro de la carpeta de datos de la app. Elige otra.",
    en: "It cannot be saved inside the app data folder. Choose another one.",
  },
  importarTitulo: { es: "Importar una copia", en: "Import a backup" },
  importarDesc: {
    es: "Acepta la copia cifrada (.bolsillo) y la copia JSON, también la de la versión 1.1.0. Sustituye todos los datos actuales.",
    en: "Accepts the encrypted backup (.bolsillo) and the JSON backup, also the 1.1.0 one. It replaces all current data.",
  },
  importar: { es: "Elegir copia…", en: "Choose backup…" },
  contrasenaCopia: { es: "Contraseña de esa copia", en: "That backup's password" },
  abrir: { es: "Abrir", en: "Open" },
  cancelar: { es: "Cancelar", en: "Cancel" },
  confirmImportar: {
    es: "Esto reemplazará TODOS tus datos actuales. ¿Continuar?",
    en: "This will replace ALL your current data. Continue?",
  },
  okImportada: { es: "Copia importada.", en: "Backup imported." },
  "copia-invalida": {
    es: "El fichero no es una copia válida de Bolsillo.",
    en: "The file is not a valid Bolsillo backup.",
  },
  "copia-version": {
    es: "La copia es de una versión más nueva de Bolsillo.",
    en: "The backup comes from a newer version of Bolsillo.",
  },
  "copia-credencial": {
    es: "Esa contraseña no abre la copia.",
    en: "That password does not open the backup.",
  },
  "no-autosuficiente": {
    es: "Ese fichero son los datos de la app o una copia automática, sin los recibos dentro. Restáuralo desde la lista de copias automáticas.",
    en: "That file is the app data or an automatic backup, without the receipts inside. Restore it from the automatic backups list.",
  },
  "sin-rescate": { es: "No hay copia de rescate.", en: "There is no rescue copy." },
  guardar: { es: "No se pudo importar.", en: "Could not import." },
  jsonTitulo: { es: "Copia JSON sin cifrar", en: "Unencrypted JSON backup" },
  jsonDesc: {
    es: "Lleva todos tus datos y fotos de recibos en texto legible. Trátala como un documento sensible.",
    en: "It holds all your data and receipt photos as readable text. Treat it as a sensitive document.",
  },
  exportarJson: { es: "Guardar copia JSON…", en: "Save JSON backup…" },
  okJson: { es: "Copia JSON guardada.", en: "JSON backup saved." },
  autoTitulo: { es: "Copias automáticas", en: "Automatic backups" },
  autoDesc: {
    es: "Se guardan solas en este equipo: las 10 últimas versiones y una por día durante 30 días. Restaurar guarda antes el estado actual.",
    en: "They are saved automatically on this computer: the last 10 versions and one per day for 30 days. Restoring first saves the current state.",
  },
  sinCopias: {
    es: "Todavía no hay copias automáticas.",
    en: "There are no automatic backups yet.",
  },
  restaurar: { es: "Restaurar", en: "Restore" },
  confirmRestaurar: {
    es: "Se restaurará esta copia. El estado actual se guarda antes como copia «antes de restaurar». Si la copia tenía otro PIN, te lo pedirá. ¿Seguir?",
    en: "This backup will be restored. The current state is saved first as a “before restoring” backup. If the backup had another PIN, it will be asked. Continue?",
  },
  errRestaurar: { es: "No se pudo restaurar.", en: "Could not restore." },
  errPendiente: {
    es: "Hay cambios sin guardar: arregla el guardado antes de restaurar.",
    en: "There are unsaved changes: fix saving before restoring.",
  },
  reciente: { es: "Reciente", en: "Recent" },
  diaria: { es: "Diaria", en: "Daily" },
  antes: { es: "Antes de restaurar", en: "Before restoring" },
});

// ── 2. Copia cifrada / Encrypted backup ───────────────────────────────────────
const contrasena = ref("");
const repetir = ref("");
const msgCifrada = ref("");
const errCifrada = ref("");
const exportando = ref(false);

// ES: Valida la contraseña y pide a Rust que cifre y guarde con el diálogo nativo.
// EN: Validates the password and asks Rust to encrypt and save with the native dialog.
async function exportarCifrada() {
  if (exportando.value) return;
  msgCifrada.value = "";
  errCifrada.value = "";
  if (validarCredencial("password", contrasena.value)) {
    errCifrada.value = t("errCorta");
    return;
  }
  if (contrasena.value !== repetir.value) {
    errCifrada.value = t("errNoCoincide");
    return;
  }
  exportando.value = true;
  try {
    if (await sesion.exportarCopiaCifrada(contrasena.value)) {
      msgCifrada.value = t("okExportada");
      contrasena.value = "";
      repetir.value = "";
    }
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    errCifrada.value = m === "destino-protegido" ? t("errDestino") : t("errExportar");
  } finally {
    exportando.value = false;
  }
}

// ── 3. Importar / Import ──────────────────────────────────────────────────────
const contrasenaImportar = ref("");
const importacion = useImportarCopia({
  confirmar: () => confirm(t("confirmImportar")),
  alTerminar: () => {
    contrasenaImportar.value = "";
    emit("importada");
  },
});

// ── 4. Copia JSON / JSON backup ───────────────────────────────────────────────
const msgJson = ref("");
const errJson = ref("");

// ES: Guarda la copia JSON legible con el diálogo nativo (Rust escribe).
// EN: Saves the readable JSON backup with the native dialog (Rust writes).
async function exportarJson() {
  msgJson.value = "";
  errJson.value = "";
  try {
    const json = JSON.stringify(
      { ...finanzas.snapshot(), categoriasCustom: categoriasCustom() },
      null,
      2
    );
    if (await guardarJson("bolsillo-backup.json", json)) msgJson.value = t("okJson");
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    errJson.value = m.includes("destino-protegido") ? t("errDestino") : t("errExportar");
  }
}

// ── 5. Copias automáticas / Automatic backups ─────────────────────────────────
const copias = ref<InfoCopia[]>([]);
const errRestaurar = ref("");
const restaurando = ref(false);

async function cargarCopias() {
  try {
    copias.value = await sesion.listarCopias();
  } catch {
    copias.value = [];
  }
}
onMounted(cargarCopias);

// ES: Etiqueta del tipo de copia. / EN: Backup kind label.
function tipoCopia(nombre: string): string {
  return t(
    nombre.startsWith("diaria-") ? "diaria" : nombre.startsWith("antes-") ? "antes" : "reciente"
  );
}

// ES: Restaura una copia tras confirmar. / EN: Restores a backup after confirming.
async function restaurar(nombre: string) {
  if (restaurando.value || !confirm(t("confirmRestaurar"))) return;
  errRestaurar.value = "";
  restaurando.value = true;
  try {
    await sesion.restaurarCopia(nombre);
  } catch (e) {
    const m = e instanceof Error ? e.message : "";
    errRestaurar.value = m === "guardado-pendiente" ? t("errPendiente") : t("errRestaurar");
  } finally {
    restaurando.value = false;
  }
}
</script>

<template>
  <section class="rounded-2xl bg-surface border border-border p-5 space-y-6">
    <h2 class="font-display font-bold text-lg text-ink">{{ t("titulo") }}</h2>

    <!-- ES: 1. Copia cifrada / EN: 1. Encrypted backup -->
    <form class="space-y-3" @submit.prevent="exportarCifrada">
      <h3 class="font-semibold text-ink text-sm">{{ t("cifradaTitulo") }}</h3>
      <p class="text-muted text-sm">{{ t("cifradaDesc") }}</p>
      <div class="grid gap-3 sm:grid-cols-2">
        <div>
          <label :for="`${id}-pw`" class="text-muted text-sm">{{ t("contrasena") }}</label>
          <input
            :id="`${id}-pw`"
            v-model="contrasena"
            type="password"
            autocomplete="new-password"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>
        <div>
          <label :for="`${id}-pw2`" class="text-muted text-sm">{{ t("repetir") }}</label>
          <input
            :id="`${id}-pw2`"
            v-model="repetir"
            type="password"
            autocomplete="new-password"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>
      </div>
      <button
        type="submit"
        class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors disabled:opacity-50"
        :disabled="exportando"
      >
        {{ t("exportarCifrada") }}
      </button>
      <p v-if="errCifrada" role="alert" class="text-danger text-sm">{{ errCifrada }}</p>
      <p v-else-if="msgCifrada" role="status" class="text-ok text-sm">{{ msgCifrada }}</p>
    </form>

    <!-- ES: 2. Importar / EN: 2. Import -->
    <div class="space-y-3 border-t border-border pt-5">
      <h3 class="font-semibold text-ink text-sm">{{ t("importarTitulo") }}</h3>
      <p class="text-muted text-sm">{{ t("importarDesc") }}</p>
      <button
        v-if="!importacion.pidiendoContrasena.value"
        type="button"
        class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-faint transition-colors disabled:opacity-50"
        :disabled="importacion.ocupado.value"
        @click="importacion.elegir()"
      >
        {{ t("importar") }}
      </button>
      <form
        v-else
        class="flex flex-wrap gap-2"
        @submit.prevent="importacion.enviarContrasena(contrasenaImportar)"
      >
        <label :for="`${id}-pwimp`" class="sr-only">{{ t("contrasenaCopia") }}</label>
        <input
          :id="`${id}-pwimp`"
          v-model="contrasenaImportar"
          type="password"
          :placeholder="t('contrasenaCopia')"
          class="flex-1 rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        />
        <button
          type="submit"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium disabled:opacity-50"
          :disabled="importacion.ocupado.value || !contrasenaImportar"
        >
          {{ t("abrir") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-ink"
          @click="importacion.cancelar()"
        >
          {{ t("cancelar") }}
        </button>
      </form>
      <p v-if="importacion.error.value" role="alert" class="text-danger text-sm">
        {{ t(importacion.error.value) }}
      </p>
      <p v-else-if="importacion.hecho.value" role="status" class="text-ok text-sm">
        {{ t("okImportada") }}
      </p>
    </div>

    <!-- ES: 3. Copia JSON / EN: 3. JSON backup -->
    <div class="space-y-3 border-t border-border pt-5">
      <h3 class="font-semibold text-ink text-sm">{{ t("jsonTitulo") }}</h3>
      <p class="text-muted text-sm">{{ t("jsonDesc") }}</p>
      <button
        type="button"
        class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-faint transition-colors"
        @click="exportarJson"
      >
        {{ t("exportarJson") }}
      </button>
      <p v-if="errJson" role="alert" class="text-danger text-sm">{{ errJson }}</p>
      <p v-else-if="msgJson" role="status" class="text-ok text-sm">{{ msgJson }}</p>
    </div>

    <!-- ES: 4. Copias automáticas / EN: 4. Automatic backups -->
    <div class="space-y-3 border-t border-border pt-5">
      <h3 class="font-semibold text-ink text-sm">{{ t("autoTitulo") }}</h3>
      <p class="text-muted text-sm">{{ t("autoDesc") }}</p>
      <ul v-if="copias.length" class="space-y-2 max-h-64 overflow-y-auto">
        <li
          v-for="c in copias"
          :key="c.nombre"
          class="flex items-center justify-between gap-3 rounded-lg bg-surface-2 border border-border px-3 py-2"
        >
          <span class="text-sm text-ink">
            {{ tipoCopia(c.nombre) }} · {{ fechaLegibleCopia(c.nombre) }}
          </span>
          <button
            type="button"
            class="rounded-lg border border-border px-3 py-1 text-sm text-ink hover:border-brand disabled:opacity-50"
            :disabled="restaurando"
            @click="restaurar(c.nombre)"
          >
            {{ t("restaurar") }}
          </button>
        </li>
      </ul>
      <p v-else class="text-faint text-xs">{{ t("sinCopias") }}</p>
      <p v-if="errRestaurar" role="alert" class="text-danger text-sm">{{ errRestaurar }}</p>
    </div>
  </section>
</template>
