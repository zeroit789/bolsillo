<script setup lang="ts">
/* =============================================================================
 * AjustesView.vue — Settings screen / Pantalla de Ajustes
 * -----------------------------------------------------------------------------
 * EN: Settings view of Bolsillo. Four cards: Appearance (theme/currency/language),
 *     Security (open lock with PIN or password + change credential), Backup
 *     (export/import a .json) and Custom categories. It never touches the disk
 *     directly: it delegates persistence to the Pinia stores (ajustes/sesion/
 *     finanzas) and to the categorias data module (localStorage).
 * ES: Vista de Ajustes de Bolsillo. Cuatro tarjetas: Apariencia (tema/moneda/
 *     idioma), Seguridad (bloqueo al abrir con PIN o contraseña + cambiar
 *     credencial), Copia (exportar/importar un .json) y Categorías propias.
 *     No toca disco directamente: delega la persistencia en los stores de Pinia
 *     (ajustes/sesion/finanzas) y en el módulo de datos categorias (localStorage).
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Stores & translations / Stores y traducciones
 *   2. Appearance (theme/currency/language) / Apariencia (tema/moneda/idioma)
 *   3. Security: enable/disable lock / Seguridad: activar/quitar bloqueo
 *   4. Change credential / Cambiar credencial
 *   5. Backup: export/import (.json) / Copia: exportar/importar (.json)
 *   6. Custom categories / Categorías personalizadas
 * ===========================================================================*/
import { ref, computed, watch } from "vue";
import { useAjustes } from "../stores/ajustes";
import { useSesion } from "../stores/sesion";
import { useFinanzas } from "../stores/finanzas";
import { esDatosValidos } from "../types";
import {
  categoriasCustom,
  agregarCategoriaCustom,
  eliminarCategoriaCustom,
  setCategoriasCustom,
} from "../data/categorias";
import { crearT } from "../i18n";

// ── 1. Stores & translations / Stores y traducciones ─────────────────────────
// EN: Pinia stores used by this view. ajustes = preferences (theme/currency/
//     language), sesion = lock/encryption + import of data, finanzas = the
//     financial data snapshot used by the backup.
// ES: Stores de Pinia que usa esta vista. ajustes = preferencias (tema/moneda/
//     idioma), sesion = bloqueo/cifrado + importación de datos, finanzas = el
//     snapshot de datos financieros que usa la copia de seguridad.
const ajustes = useAjustes();
const sesion = useSesion();
const finanzas = useFinanzas();

/* ---------------------------------------------------------------------------
   TRADUCCIONES (ES/EN) / TRANSLATIONS (ES/EN)
   EN: Gathers every visible string of the view. Reading `ajustes.idioma`
       (reactive) makes the UI re-render itself when the language changes.
       Not translated: category names (data) and currency/ISO codes.
   ES: Reúne todos los textos visibles de la vista. Al leer `ajustes.idioma`
       (reactivo) la UI se re-renderiza sola al cambiar el idioma.
       No se traducen: nombres de categorías (datos), monedas/códigos ISO.
   --------------------------------------------------------------------------- */
const t = crearT({
  // Título general de la vista
  tituloVista: { es: "Ajustes", en: "Settings" },

  // Sección 1 — Apariencia
  apariencia: { es: "Apariencia", en: "Appearance" },
  aparienciaDesc: {
    es: "Elige el tema de la app. El modo oscuro cansa menos la vista cuando trabajas de noche.",
    en: "Choose the app theme. Dark mode is easier on the eyes when you work at night.",
  },
  temaOscuro: { es: "Oscuro", en: "Dark" },
  temaClaro: { es: "Claro", en: "Light" },
  moneda: { es: "Moneda", en: "Currency" },
  monedaDesc: {
    es: "Moneda en la que se muestran los importes.",
    en: "Currency in which amounts are shown.",
  },
  // Bloque de idioma
  idioma: { es: "Idioma", en: "Language" },
  idiomaEspanol: { es: "Español", en: "Spanish" },
  idiomaIngles: { es: "English", en: "English" },
  idiomaDesc: {
    es: "Idioma de la interfaz de la app.",
    en: "Language of the app interface.",
  },

  // Sección 2 — Seguridad
  seguridad: { es: "Seguridad", en: "Security" },
  seguridadDesc: {
    es: "Protege la app con un bloqueo al abrir. Los datos se guardan cifrados; si olvidas la credencial no se pueden recuperar.",
    en: "Protect the app with a lock on open. Your data is stored encrypted; if you forget the credential it cannot be recovered.",
  },
  tipoBloqueo: { es: "Tipo de bloqueo", en: "Lock type" },
  opcionPin: { es: "PIN (4 a 6 dígitos)", en: "PIN (4 to 6 digits)" },
  opcionPassword: { es: "Contraseña", en: "Password" },
  labelPin: { es: "PIN", en: "PIN" },
  labelPassword: { es: "Contraseña", en: "Password" },
  repetirPin: { es: "Repetir PIN", en: "Repeat PIN" },
  repetirPassword: { es: "Repetir contraseña", en: "Repeat password" },
  phPin: { es: "4 a 6 dígitos", en: "4 to 6 digits" },
  phPassword: { es: "Tu contraseña", en: "Your password" },
  phRepetir: { es: "Vuelve a escribirlo", en: "Type it again" },
  activarBloqueo: { es: "Activar bloqueo", en: "Enable lock" },
  bloqueoEtiqueta: { es: "Bloqueo", en: "Lock" },
  estadoActivo: { es: "activo", en: "active" },
  quitarBloqueo: { es: "Quitar bloqueo", en: "Remove lock" },
  cambiarCredencial: { es: "Cambiar credencial", en: "Change credential" },
  tipoNuevo: { es: "Tipo nuevo", en: "New type" },
  phCredActual: { es: "Credencial actual", en: "Current credential" },
  phNuevoPin: { es: "Nuevo PIN (4-6 dígitos)", en: "New PIN (4-6 digits)" },
  phNuevaPassword: { es: "Nueva contraseña", en: "New password" },
  phRepetirNueva: { es: "Repetir nueva credencial", en: "Repeat new credential" },
  cambiar: { es: "Cambiar", en: "Change" },
  // Etiquetas legibles del tipo de bloqueo activo
  tipoActivoPin: { es: "PIN", en: "PIN" },
  tipoActivoPassword: { es: "Contraseña", en: "Password" },

  // Sección 3 — Copia de seguridad
  copia: { es: "Copia de seguridad", en: "Backup" },
  copiaDesc: {
    es: "Exporta todos tus datos a un fichero .json para guardarlo a salvo, o impórtalo para restaurarlos en este u otro equipo.",
    en: "Export all your data to a .json file to keep it safe, or import it to restore it on this or another device.",
  },
  exportarCopia: { es: "Exportar copia (.json)", en: "Export backup (.json)" },
  importarCopia: { es: "Importar copia", en: "Import backup" },
  copiaAviso: {
    es: "Importar reemplaza todos los datos actuales. Te pediremos confirmación antes de hacerlo.",
    en: "Importing replaces all current data. We'll ask for confirmation first.",
  },

  // Sección 4 — Categorías personalizadas
  categorias: { es: "Categorías", en: "Categories" },
  categoriasDesc: {
    es: 'Crea tus propias categorías. Aparecerán en el desplegable al añadir un movimiento, dentro del grupo "Personalizadas".',
    en: 'Create your own categories. They\'ll appear in the dropdown when adding a transaction, under the "Custom" group.',
  },
  phNuevaCategoria: { es: "Ej. Suscripción gimnasio", en: "E.g. Gym subscription" },
  anadir: { es: "Añadir", en: "Add" },
  eliminar: { es: "Eliminar", en: "Delete" },
  sinCategorias: {
    es: "Aún no has creado ninguna categoría propia.",
    en: "You haven't created any custom categories yet.",
  },

  // Mensajes mostrados al usuario (validación / éxito / error)
  errPinFormato: {
    es: "El PIN debe tener entre 4 y 6 dígitos (solo números).",
    en: "The PIN must be 4 to 6 digits long (numbers only).",
  },
  errPasswordCorta: {
    es: "La contraseña debe tener al menos 4 caracteres.",
    en: "The password must be at least 4 characters long.",
  },
  errPinNoCoincide: { es: "Los PIN no coinciden.", en: "The PINs don't match." },
  errPasswordNoCoincide: {
    es: "Las contraseñas no coinciden.",
    en: "The passwords don't match.",
  },
  okBloqueoActivado: {
    es: "Bloqueo activado. La próxima vez se pedirá al abrir la app.",
    en: "Lock enabled. It will be asked next time you open the app.",
  },
  errBloqueoActivar: {
    es: "No se pudo activar el bloqueo. Inténtalo de nuevo.",
    en: "Couldn't enable the lock. Please try again.",
  },
  okBloqueoDesactivado: { es: "Bloqueo desactivado.", en: "Lock disabled." },
  errBloqueoQuitar: {
    es: "No se pudo quitar el bloqueo. Inténtalo de nuevo.",
    en: "Couldn't remove the lock. Please try again.",
  },
  errCredActual: { es: "Introduce tu credencial actual.", en: "Enter your current credential." },
  errNuevoPin: {
    es: "El nuevo PIN debe tener entre 4 y 6 dígitos.",
    en: "The new PIN must be 4 to 6 digits long.",
  },
  errNuevaPassword: {
    es: "La nueva contraseña debe tener al menos 4 caracteres.",
    en: "The new password must be at least 4 characters long.",
  },
  errNuevaNoCoincide: {
    es: "La nueva credencial no coincide.",
    en: "The new credential doesn't match.",
  },
  errCredActualIncorrecta: {
    es: "La credencial actual no es correcta.",
    en: "The current credential is not correct.",
  },
  okCredActualizada: { es: "Credencial actualizada.", en: "Credential updated." },
  okCopiaExportada: {
    es: "Copia exportada como bolsillo-backup.json",
    en: "Backup exported as bolsillo-backup.json",
  },
  errCopiaExportar: { es: "No se pudo exportar la copia.", en: "Couldn't export the backup." },
  errCopiaInvalida: {
    es: "El fichero no es una copia válida de Bolsillo.",
    en: "The file is not a valid Bolsillo backup.",
  },
  confirmImportar: {
    es: "Esto reemplazará TODOS tus datos actuales. ¿Continuar?",
    en: "This will replace ALL your current data. Continue?",
  },
  okCopiaImportada: {
    es: "Copia importada correctamente.",
    en: "Backup imported successfully.",
  },
  errCopiaLeerJson: {
    es: "No se pudo leer el fichero (JSON inválido).",
    en: "Couldn't read the file (invalid JSON).",
  },
  errCopiaLeer: { es: "No se pudo leer el fichero.", en: "Couldn't read the file." },
  errCategoriaVacia: {
    es: "Escribe un nombre para la categoría.",
    en: "Enter a name for the category.",
  },
  errCategoriaExiste: { es: "Esa categoría ya existe.", en: "That category already exists." },
});

// ── 2. Appearance (theme/currency/language) / Apariencia (tema/moneda/idioma) ─
// EN: Sets the theme straight from the store (it persists and applies itself).
// ES: Cambia el tema directamente desde el store (persiste y aplica solo).
function elegirTema(t: "claro" | "oscuro") {
  ajustes.setTema(t);
}

// EN: Currencies offered by the selector (ISO code + readable label).
// ES: Monedas disponibles para el selector (código ISO + etiqueta legible).
const MONEDAS: { codigo: string; etiqueta: string }[] = [
  { codigo: "EUR", etiqueta: "Euro (€)" },
  { codigo: "USD", etiqueta: "Dólar estadounidense ($)" },
  { codigo: "GBP", etiqueta: "Libra esterlina (£)" },
  { codigo: "MXN", etiqueta: "Peso mexicano" },
  { codigo: "ARS", etiqueta: "Peso argentino" },
  { codigo: "COP", etiqueta: "Peso colombiano" },
  { codigo: "CLP", etiqueta: "Peso chileno" },
  { codigo: "BRL", etiqueta: "Real brasileño" },
];

// ── 3. Security: enable/disable lock / Seguridad: activar/quitar bloqueo ──────
// EN: Credential type chosen in the enable form.
// ES: Tipo de credencial elegido en el formulario de activación.
const tipoBloqueo = ref<"pin" | "password">("pin");
// EN: Form fields: the credential and its repetition for confirmation.
// ES: Campos del formulario: credencial y su repetición para confirmar.
const credencial = ref("");
const credencialRepetir = ref("");
// EN: Feedback messages (success / error) of the security section.
// ES: Mensajes de feedback (éxito / error) de la sección de seguridad.
const mensajeSeguridad = ref("");
const errorSeguridad = ref(""); // EN: text here -> painted red / ES: con texto -> se pinta en rojo

// EN: PIN validation regex: digits only, 4 to 6 long.
// ES: Regex de validación del PIN: solo dígitos, entre 4 y 6.
const REGEX_PIN = /^\d{4,6}$/;

// EN: Readable label of the active lock type (shown when a lock already exists).
// ES: Etiqueta legible del tipo de bloqueo activo (para mostrarlo cuando ya existe).
const etiquetaTipoActivo = computed(() =>
  ajustes.bloqueoTipo === "pin" ? t("tipoActivoPin") : t("tipoActivoPassword")
);

// EN: Enables the lock, validating according to the chosen type.
// ES: Activa el bloqueo validando según el tipo elegido.
async function activarBloqueo() {
  // EN: Clear previous messages before validating. / ES: Limpia mensajes previos antes de validar.
  mensajeSeguridad.value = "";
  errorSeguridad.value = "";

  const cred = credencial.value;
  const rep = credencialRepetir.value;

  // EN: Validation by selected type. / ES: Validación según el tipo seleccionado.
  if (tipoBloqueo.value === "pin") {
    // EN: PIN: digits only, min 4 max 6. / ES: PIN: solo dígitos, mínimo 4 y máximo 6.
    if (!REGEX_PIN.test(cred)) {
      errorSeguridad.value = t("errPinFormato");
      return;
    }
  } else {
    // EN: Password: free text, at least 4 chars. / ES: Contraseña: libre, mínimo 4 caracteres.
    if (cred.length < 4) {
      errorSeguridad.value = t("errPasswordCorta");
      return;
    }
  }

  // EN: Both boxes must match. / ES: Las dos casillas deben coincidir.
  if (cred !== rep) {
    errorSeguridad.value =
      tipoBloqueo.value === "pin" ? t("errPinNoCoincide") : t("errPasswordNoCoincide");
    return;
  }

  // EN: All good: configure the lock (enables it and re-encrypts the data).
  // ES: Todo correcto: configura el bloqueo (activa y re-cifra los datos).
  try {
    await sesion.configurarBloqueo(tipoBloqueo.value, cred);
    // EN: Clear the form and report success. / ES: Limpia el formulario y avisa del éxito.
    credencial.value = "";
    credencialRepetir.value = "";
    mensajeSeguridad.value = t("okBloqueoActivado");
  } catch {
    errorSeguridad.value = t("errBloqueoActivar");
  }
}

// EN: Removes the lock and goes back to obfuscation-based storage.
// ES: Quita el bloqueo y vuelve al guardado por ofuscación.
async function desactivarBloqueo() {
  mensajeSeguridad.value = "";
  errorSeguridad.value = "";
  try {
    await sesion.quitarBloqueo();
    mensajeSeguridad.value = t("okBloqueoDesactivado");
  } catch {
    errorSeguridad.value = t("errBloqueoQuitar");
  }
}

// ── 4. Change credential / Cambiar credencial ────────────────────────────────
// EN: Fields to change the credential (current + new + repeat) and feedback.
// ES: Campos para cambiar la credencial (actual + nueva + repetir) y feedback.
const credActual = ref("");
const credNueva = ref("");
const credNuevaRep = ref("");
const tipoNuevo = ref<"pin" | "password">(ajustes.bloqueoTipo ?? "pin");
// EN: Keep the "new type" selector in sync with the active lock type, so opening
//     "change credential" with a password set validates as password, not as PIN.
// ES: Mantén el selector de "tipo nuevo" sincronizado con el tipo de bloqueo activo,
//     para que abrir "cambiar credencial" con contraseña valide como contraseña, no PIN.
watch(
  () => ajustes.bloqueoTipo,
  (tipo) => {
    if (tipo) tipoNuevo.value = tipo;
  }
);
const mensajeCambio = ref("");
const errorCambio = ref("");

// EN: Validates current+new credential and asks the store to change it.
// ES: Valida la credencial actual+nueva y pide al store que la cambie.
async function cambiarCred() {
  mensajeCambio.value = "";
  errorCambio.value = "";
  const act = credActual.value;
  const nue = credNueva.value;
  const rep = credNuevaRep.value;

  if (!act) {
    errorCambio.value = t("errCredActual");
    return;
  }
  if (tipoNuevo.value === "pin") {
    if (!REGEX_PIN.test(nue)) {
      errorCambio.value = t("errNuevoPin");
      return;
    }
  } else if (nue.length < 4) {
    errorCambio.value = t("errNuevaPassword");
    return;
  }
  if (nue !== rep) {
    errorCambio.value = t("errNuevaNoCoincide");
    return;
  }

  const ok = await sesion.cambiarCredencial(act, nue, tipoNuevo.value);
  if (!ok) {
    errorCambio.value = t("errCredActualIncorrecta");
    return;
  }
  credActual.value = "";
  credNueva.value = "";
  credNuevaRep.value = "";
  mensajeCambio.value = t("okCredActualizada");
}

// ── 5. Backup: export/import (.json) / Copia: exportar/importar (.json) ───────
// EN: Feedback messages of the backup section. / ES: Mensajes de feedback de la sección de copia.
const mensajeCopia = ref("");
const errorCopia = ref("");
// EN: Reference to the hidden file input triggered by the "Import" button.
// ES: Referencia al input file oculto que dispara el botón "Importar".
const inputFichero = ref<HTMLInputElement | null>(null);

// EN: Exports all data to a .json and forces its download.
// ES: Exporta todos los datos a un .json y fuerza su descarga.
function exportarCopia() {
  mensajeCopia.value = "";
  errorCopia.value = "";
  try {
    // EN: Serialize the full readable snapshot (2-space indent). Custom
    //     categories are included too (they live outside the encryption).
    // ES: Serializa el snapshot completo legible (indentado a 2 espacios).
    //     Incluye también las categorías personalizadas (viven fuera del cifrado).
    const json = JSON.stringify(
      { ...finanzas.snapshot(), categoriasCustom: categoriasCustom() },
      null,
      2
    );
    // EN: Build a text blob and a temporary URL to download it.
    // ES: Crea un blob de texto y una URL temporal para descargarlo.
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    // EN: Invisible link that is "clicked" to launch the download.
    // ES: Enlace invisible que se "pulsa" para lanzar la descarga.
    const a = document.createElement("a");
    a.href = url;
    a.download = "bolsillo-backup.json";
    a.click();
    // EN: Release the temporary URL so memory isn't leaked. / ES: Libera la URL temporal para no acumular memoria.
    URL.revokeObjectURL(url);
    mensajeCopia.value = t("okCopiaExportada");
  } catch {
    errorCopia.value = t("errCopiaExportar");
  }
}

// EN: Opens the file picker (the input is hidden). / ES: Abre el selector de fichero (el input está oculto).
function pedirImportar() {
  inputFichero.value?.click();
}

// EN: Reads the chosen file, validates the JSON and hydrates the finances.
// ES: Lee el fichero elegido, valida el JSON e hidrata las finanzas.
function importarCopia(evento: Event) {
  mensajeCopia.value = "";
  errorCopia.value = "";

  // EN: Get the selected file from the input. / ES: Recupera el fichero seleccionado del input.
  const input = evento.target as HTMLInputElement;
  const fichero = input.files?.[0];
  if (!fichero) return;

  // EN: Read the file contents as text. / ES: Lee el contenido del fichero como texto.
  const lector = new FileReader();
  lector.onload = async () => {
    try {
      // EN: Parse the JSON and deeply validate the shape (each item), not just arrays.
      // ES: Parsea el JSON y valida a fondo la forma (cada item), no solo los arrays.
      const datos = JSON.parse(String(lector.result));
      if (!esDatosValidos(datos)) {
        errorCopia.value = t("errCopiaInvalida");
        return;
      }

      // EN: Confirm before overwriting the current data. / ES: Confirma antes de sobrescribir los datos actuales.
      if (!confirm(t("confirmImportar"))) {
        return;
      }

      // EN: Restore the backup's custom categories (if it brings any).
      // ES: Restaura las categorías personalizadas de la copia (si las trae).
      const custom = (datos as { categoriasCustom?: unknown }).categoriasCustom;
      if (Array.isArray(custom)) {
        setCategoriasCustom(custom as string[]);
        refrescarCategorias();
      }

      // EN: Import and PERSIST in a guaranteed way (with await, not relying on the watch).
      //     The store now throws Error("copia-invalida") if the backup is not valid,
      //     so it is caught below to show the right "invalid backup" message.
      // ES: Importa y PERSISTE de forma garantizada (con await, no depende del watch).
      //     El store ahora lanza Error("copia-invalida") si la copia no es válida,
      //     así que se captura abajo para mostrar el mensaje correcto de "copia inválida".
      await sesion.importarDatos(datos);
      mensajeCopia.value = t("okCopiaImportada");
    } catch (e) {
      // EN: Distinguish the store's "invalid backup" signal from a JSON parse error
      //     so the user sees the precise reason instead of a generic "invalid JSON".
      // ES: Distingue la señal "copia-invalida" del store de un fallo de parseo JSON
      //     para que el usuario vea el motivo exacto en vez de un genérico "JSON inválido".
      if (e instanceof Error && e.message === "copia-invalida") {
        errorCopia.value = t("errCopiaInvalida");
      } else {
        errorCopia.value = t("errCopiaLeerJson");
      }
    } finally {
      // EN: Reset the input so the same file can be chosen again. / ES: Resetea el input para poder volver a elegir el mismo fichero.
      input.value = "";
    }
  };
  // EN: Error reading the file itself. / ES: Error de lectura del propio fichero.
  lector.onerror = () => {
    errorCopia.value = t("errCopiaLeer");
    input.value = "";
  };
  lector.readAsText(fichero);
}

// ── 6. Custom categories / Categorías personalizadas ─────────────────────────
// EN: The user can create/delete their own categories. They are stored in
//     localStorage (non-reactive), so we keep a local copy in a ref that we
//     refresh manually after each change.
// ES: El usuario puede crear/eliminar sus propias categorías. Se guardan en
//     localStorage (no reactivo), así que mantenemos una copia local en un ref
//     que refrescamos manualmente tras cada cambio.
// EN: Reactive local copy of the custom categories (initial state read from localStorage).
// ES: Copia local reactiva de las categorías personalizadas (estado inicial leído de localStorage).
const categoriasPropias = ref<string[]>(categoriasCustom());
// EN: Input text to create a new category. / ES: Texto del input para crear una categoría nueva.
const nuevaCategoria = ref("");
// EN: Feedback message of the section. / ES: Mensajes de feedback de la sección.
const errorCategoria = ref("");

// EN: Refreshes the local copy from localStorage after add/delete.
// ES: Refresca la copia local desde localStorage tras añadir/eliminar.
function refrescarCategorias(): void {
  categoriasPropias.value = categoriasCustom();
}

// EN: Adds the category typed in the input. / ES: Añade la categoría escrita en el input.
function anadirCategoria(): void {
  errorCategoria.value = "";
  const limpio = nuevaCategoria.value.trim();
  // EN: Minimal validation: not empty. / ES: Validación mínima: no vacío.
  if (!limpio) {
    errorCategoria.value = t("errCategoriaVacia");
    return;
  }
  // EN: Warn if it already exists (base or custom) before trying to save.
  // ES: Avisa si ya existe (base o personalizada) antes de intentar guardar.
  if (categoriasPropias.value.includes(limpio)) {
    errorCategoria.value = t("errCategoriaExiste");
    return;
  }
  // EN: Delegate normalization and saving to the data-module function.
  // ES: Delega la normalización y guardado en la función del módulo de datos.
  agregarCategoriaCustom(limpio);
  refrescarCategorias();
  // EN: Clear the input for the next one. / ES: Limpia el input para la siguiente.
  nuevaCategoria.value = "";
}

// EN: Deletes a custom category by name. / ES: Elimina una categoría personalizada por nombre.
function quitarCategoria(nombre: string): void {
  errorCategoria.value = "";
  eliminarCategoriaCustom(nombre);
  refrescarCategorias();
}
</script>

<template>
  <!-- EN: Settings view container. / ES: Contenedor de la vista de ajustes. -->
  <div class="space-y-5">
    <!-- EN: View title. / ES: Título de la vista. -->
    <h1 class="font-display text-2xl font-bold text-ink">{{ t("tituloVista") }}</h1>

    <!-- =====================================================================
         EN: SECTION — Appearance (theme / currency / language)
         ES: SECCIÓN — Apariencia (tema / moneda / idioma)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("apariencia") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("aparienciaDesc") }}
      </p>

      <!-- EN: Theme switch: the active button is highlighted with bg-brand.
           ES: Conmutador de tema: el botón activo se resalta con bg-brand. -->
      <div class="flex gap-3 mt-4">
        <button
          class="flex-1 rounded-lg px-4 py-2 font-medium border transition-colors"
          :class="
            ajustes.tema === 'oscuro'
              ? 'bg-brand border-brand text-white'
              : 'bg-surface-2 border-border text-muted hover:text-ink'
          "
          @click="elegirTema('oscuro')"
        >
          {{ t("temaOscuro") }}
        </button>
        <button
          class="flex-1 rounded-lg px-4 py-2 font-medium border transition-colors"
          :class="
            ajustes.tema === 'claro'
              ? 'bg-brand border-brand text-white'
              : 'bg-surface-2 border-border text-muted hover:text-ink'
          "
          @click="elegirTema('claro')"
        >
          {{ t("temaClaro") }}
        </button>
      </div>

      <!-- EN: Currency selector: bound directly to the store ref. The store's
           watch syncs the formatter, so the whole UI (amounts via euro())
           updates itself when it changes.
           ES: Selector de moneda: enlazado directo al ref del store. El watch
           del store sincroniza el formateador, así que toda la UI (importes con
           euro()) se actualiza sola al cambiarla. -->
      <div class="mt-5">
        <label class="text-muted text-sm">{{ t("moneda") }}</label>
        <select
          v-model="ajustes.moneda"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        >
          <option v-for="m in MONEDAS" :key="m.codigo" :value="m.codigo">
            {{ m.etiqueta }}
          </option>
        </select>
        <p class="text-faint text-xs mt-1">{{ t("monedaDesc") }}</p>
      </div>

      <!-- EN: Language selector: two buttons (Spanish / English) calling
           ajustes.setIdioma. The active button is highlighted with bg-brand
           like the theme switch. Header styled with the same label style as
           the currency selector.
           ES: Selector de idioma: dos botones (Español / English) que llaman a
           ajustes.setIdioma. El botón activo se resalta con bg-brand igual que
           el conmutador de tema. Encabezado con el mismo estilo de label que
           el selector de moneda. -->
      <div class="mt-5">
        <label class="text-muted text-sm">{{ t("idioma") }}</label>
        <div class="flex gap-3 mt-1">
          <button
            class="flex-1 rounded-lg px-4 py-2 font-medium border transition-colors"
            :class="
              ajustes.idioma === 'es'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface-2 border-border text-muted hover:text-ink'
            "
            @click="ajustes.setIdioma('es')"
          >
            {{ t("idiomaEspanol") }}
          </button>
          <button
            class="flex-1 rounded-lg px-4 py-2 font-medium border transition-colors"
            :class="
              ajustes.idioma === 'en'
                ? 'bg-brand border-brand text-white'
                : 'bg-surface-2 border-border text-muted hover:text-ink'
            "
            @click="ajustes.setIdioma('en')"
          >
            {{ t("idiomaIngles") }}
          </button>
        </div>
        <p class="text-faint text-xs mt-1">{{ t("idiomaDesc") }}</p>
      </div>
    </section>

    <!-- =====================================================================
         EN: SECTION — Security (lock on open)
         ES: SECCIÓN — Seguridad (bloqueo al abrir)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("seguridad") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("seguridadDesc") }}
      </p>

      <!-- EN: CASE A: lock is NOT active -> form to enable it.
           ES: CASO A: el bloqueo NO está activo -> formulario para activarlo. -->
      <div v-if="!ajustes.bloqueoActivo" class="mt-4 space-y-3">
        <!-- EN: Credential type selector. / ES: Selector del tipo de credencial. -->
        <div>
          <label class="text-muted text-sm">{{ t("tipoBloqueo") }}</label>
          <select
            v-model="tipoBloqueo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="pin">{{ t("opcionPin") }}</option>
            <option value="password">{{ t("opcionPassword") }}</option>
          </select>
        </div>

        <!-- EN: Credential field (PIN or password depending on the type).
             ES: Campo de credencial (PIN o contraseña según el tipo). -->
        <div>
          <label class="text-muted text-sm">
            {{ tipoBloqueo === "pin" ? t("labelPin") : t("labelPassword") }}
          </label>
          <input
            v-model="credencial"
            :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
            :placeholder="tipoBloqueo === 'pin' ? t('phPin') : t('phPassword')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- EN: Repeat credential to confirm. / ES: Repetir credencial para confirmar. -->
        <div>
          <label class="text-muted text-sm">
            {{ tipoBloqueo === "pin" ? t("repetirPin") : t("repetirPassword") }}
          </label>
          <input
            v-model="credencialRepetir"
            :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
            :placeholder="t('phRepetir')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- EN: Enable button. / ES: Botón de activación. -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="activarBloqueo"
        >
          {{ t("activarBloqueo") }}
        </button>
      </div>

      <!-- EN: CASE B: lock is ALREADY active -> show state and option to remove it.
           ES: CASO B: el bloqueo YA está activo -> mostrar estado y opción de quitarlo. -->
      <div v-else class="mt-4 space-y-3">
        <!-- EN: Active-lock indicator. / ES: Indicador de bloqueo activo. -->
        <p class="text-ink">
          {{ t("bloqueoEtiqueta") }} <span class="text-ok font-medium">{{ t("estadoActivo") }}</span>
          ({{ etiquetaTipoActivo }}).
        </p>
        <!-- EN: Dangerous button to remove the lock. / ES: Botón peligroso para quitar el bloqueo. -->
        <button
          class="rounded-lg border border-danger px-4 py-2 text-danger font-medium hover:bg-surface-2 transition-colors"
          @click="desactivarBloqueo"
        >
          {{ t("quitarBloqueo") }}
        </button>

        <!-- EN: Change the credential: current + new + repeat.
             ES: Cambiar la credencial: actual + nueva + repetir. -->
        <div class="mt-2 border-t border-border pt-4 space-y-3">
          <p class="text-sm font-medium text-ink">{{ t("cambiarCredencial") }}</p>
          <div>
            <label class="text-muted text-sm">{{ t("tipoNuevo") }}</label>
            <select
              v-model="tipoNuevo"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            >
              <option value="pin">{{ t("opcionPin") }}</option>
              <option value="password">{{ t("opcionPassword") }}</option>
            </select>
          </div>
          <input
            v-model="credActual"
            type="password"
            :placeholder="t('phCredActual')"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <input
            v-model="credNueva"
            :type="tipoNuevo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoNuevo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoNuevo === 'pin' ? 6 : undefined"
            :placeholder="tipoNuevo === 'pin' ? t('phNuevoPin') : t('phNuevaPassword')"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <input
            v-model="credNuevaRep"
            :type="tipoNuevo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoNuevo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoNuevo === 'pin' ? 6 : undefined"
            :placeholder="t('phRepetirNueva')"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <button
            class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
            @click="cambiarCred"
          >
            {{ t("cambiar") }}
          </button>
          <p v-if="errorCambio" class="text-danger text-sm">{{ errorCambio }}</p>
          <p v-else-if="mensajeCambio" class="text-ok text-sm">{{ mensajeCambio }}</p>
        </div>
      </div>

      <!-- EN: Feedback messages of the security section. / ES: Mensajes de feedback de la sección de seguridad. -->
      <p v-if="errorSeguridad" class="text-danger text-sm mt-3">{{ errorSeguridad }}</p>
      <p v-else-if="mensajeSeguridad" class="text-ok text-sm mt-3">{{ mensajeSeguridad }}</p>
    </section>

    <!-- =====================================================================
         EN: SECTION — Backup (export / import .json)
         ES: SECCIÓN — Copia de seguridad (exportar / importar .json)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("copia") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("copiaDesc") }}
      </p>

      <!-- EN: Export / import buttons. / ES: Botones de exportar / importar. -->
      <div class="flex flex-wrap gap-3 mt-4">
        <!-- EN: Export backup. / ES: Exportar copia. -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="exportarCopia"
        >
          {{ t("exportarCopia") }}
        </button>

        <!-- EN: Import backup: the button triggers the hidden file input.
             ES: Importar copia: el botón dispara el input file oculto. -->
        <button
          class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-faint transition-colors"
          @click="pedirImportar"
        >
          {{ t("importarCopia") }}
        </button>

        <!-- EN: Hidden file input: only accepts JSON; on pick, runs importarCopia.
             ES: Input file oculto: solo acepta JSON; al elegir, lanza importarCopia. -->
        <input
          ref="inputFichero"
          type="file"
          accept="application/json"
          class="hidden"
          @change="importarCopia"
        />
      </div>

      <!-- EN: Notice about data replacement on import. / ES: Aviso sobre el reemplazo de datos al importar. -->
      <p class="text-faint text-xs mt-3">
        {{ t("copiaAviso") }}
      </p>

      <!-- EN: Feedback messages of the backup section. / ES: Mensajes de feedback de la sección de copia. -->
      <p v-if="errorCopia" class="text-danger text-sm mt-3">{{ errorCopia }}</p>
      <p v-else-if="mensajeCopia" class="text-ok text-sm mt-3">{{ mensajeCopia }}</p>
    </section>

    <!-- =====================================================================
         EN: SECTION — Custom categories
         ES: SECCIÓN — Categorías personalizadas
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("categorias") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("categoriasDesc") }}
      </p>

      <!-- EN: Input + button to create a new category. / ES: Input + botón para crear una categoría nueva. -->
      <div class="flex gap-3 mt-4">
        <input
          v-model="nuevaCategoria"
          type="text"
          :placeholder="t('phNuevaCategoria')"
          class="flex-1 rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          @keyup.enter="anadirCategoria"
        />
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="anadirCategoria"
        >
          {{ t("anadir") }}
        </button>
      </div>

      <!-- EN: Section error message. / ES: Mensaje de error de la sección. -->
      <p v-if="errorCategoria" class="text-danger text-sm mt-3">{{ errorCategoria }}</p>

      <!-- EN: List of custom categories with a delete button.
           ES: Lista de categorías personalizadas con botón de eliminar. -->
      <ul v-if="categoriasPropias.length" class="mt-4 space-y-2">
        <li
          v-for="cat in categoriasPropias"
          :key="cat"
          class="flex items-center justify-between rounded-lg bg-surface-2 border border-border px-3 py-2"
        >
          <span class="text-ink">{{ cat }}</span>
          <button
            class="rounded-lg border border-danger px-3 py-1 text-danger text-sm font-medium hover:bg-surface transition-colors"
            @click="quitarCategoria(cat)"
          >
            {{ t("eliminar") }}
          </button>
        </li>
      </ul>

      <!-- EN: Notice when there are no custom categories yet. / ES: Aviso cuando todavía no hay categorías propias. -->
      <p v-else class="text-faint text-xs mt-3">{{ t("sinCategorias") }}</p>
    </section>
  </div>
</template>
