<script setup lang="ts">
/* =============================================================================
 * AjustesView.vue — Pantalla de Ajustes / Settings screen
 * -----------------------------------------------------------------------------
 * ES: Vista de Ajustes de Bolsillo. Cuatro tarjetas: Apariencia (tema/moneda/
 *     idioma), Seguridad (bloqueo con PIN o contraseña, cambiar credencial,
 *     bloquear ahora, autobloqueo y clave de recuperación), Copia (cifrada,
 *     JSON, importar y copias automáticas, en CopiasSeguridad.vue),
 *     Categorías propias y Reglas de categoría (ReglasCategoria.vue).
 *     No toca disco directamente: delega la persistencia en los stores de Pinia
 *     (ajustes/sesion/finanzas) y en el módulo de datos categorias (localStorage).
 * EN: Settings view of Bolsillo. Four cards: Appearance (theme/currency/language),
 *     Security (PIN or password lock, change credential, lock now, auto-lock
 *     and recovery key), Backup (encrypted, JSON, import and automatic
 *     backups, in CopiasSeguridad.vue), Custom categories and Category rules
 *     (ReglasCategoria.vue). It never touches the disk
 *     directly: it delegates persistence to the Pinia stores (ajustes/sesion/
 *     finanzas) and to the categorias data module (localStorage).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Stores y traducciones / Stores & translations
 *   2. Apariencia (tema/moneda/idioma) / Appearance (theme/currency/language)
 *   3. Seguridad: activar/quitar bloqueo / Security: enable/disable lock
 *   4. Cambiar credencial / Change credential
 *   5. Datos de la app (vaciar / ejemplo) / App data (clear / samples)
 *   6. Categorías personalizadas / Custom categories
 * ===========================================================================*/
import { ref, computed, watch, useId } from "vue";
import { useAjustes } from "../stores/ajustes";
import { useSesion } from "../stores/sesion";
import {
  categoriasCustom,
  agregarCategoriaCustom,
  eliminarCategoriaCustom,
} from "../data/categorias";
import { validarCredencial, MIN_PASSWORD } from "../utils/credencial";
import { crearT } from "../i18n";
import AvisoPinDebil from "../components/AvisoPinDebil.vue";
import SeguridadSesion from "../components/SeguridadSesion.vue";
import CopiasSeguridad from "../components/CopiasSeguridad.vue";
import ReglasCategoria from "../components/ReglasCategoria.vue";

// ── 1. Stores y traducciones / Stores & translations ─────────────────────────
// ES: Stores de Pinia que usa esta vista. ajustes = preferencias (tema/moneda/
//     idioma), sesion = bloqueo/cifrado + importación de datos.
// EN: Pinia stores used by this view. ajustes = preferences (theme/currency/
//     language), sesion = lock/encryption + import of data.
const ajustes = useAjustes();
const sesion = useSesion();

/* ---------------------------------------------------------------------------
   TRADUCCIONES (ES/EN) / TRANSLATIONS (ES/EN)
   ES: Reúne todos los textos visibles de la vista. Al leer `ajustes.idioma`
       (reactivo) la UI se re-renderiza sola al cambiar el idioma.
       No se traducen: nombres de categorías (datos), monedas/códigos ISO.
   EN: Gathers every visible string of the view. Reading `ajustes.idioma`
       (reactive) makes the UI re-render itself when the language changes.
       Not translated: category names (data) and currency/ISO codes.
   --------------------------------------------------------------------------- */
// ES: Prefijo único del componente para enlazar cada <label for> con su control.
// EN: Unique component prefix to link each <label for> to its control.
const uid = useId();
const t = crearT({
  // ES: Título general de la vista
  // EN: General title of the view
  tituloVista: { es: "Ajustes", en: "Settings" },

  // ES: Sección 1 — Apariencia
  // EN: Section 1 — Appearance
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
  // ES: Bloque de idioma
  // EN: Language block
  idioma: { es: "Idioma", en: "Language" },
  idiomaEspanol: { es: "Español", en: "Spanish" },
  idiomaIngles: { es: "English", en: "English" },
  idiomaDesc: {
    es: "Idioma de la interfaz de la app.",
    en: "Language of the app interface.",
  },

  // ES: Sección 2 — Seguridad
  // EN: Section 2 — Security
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
  // ES: Etiquetas legibles del tipo de bloqueo activo
  // EN: Readable labels for the active lock type
  tipoActivoPin: { es: "PIN", en: "PIN" },
  tipoActivoPassword: { es: "Contraseña", en: "Password" },

  // ES: Sección 4 — Categorías personalizadas
  // EN: Section 4 — Custom categories
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

  // ES: Mensajes mostrados al usuario (validación / éxito / error)
  // EN: Messages shown to the user (validation / success / error)
  errPinFormato: {
    es: "El PIN debe tener entre 4 y 6 dígitos (solo números).",
    en: "The PIN must be 4 to 6 digits long (numbers only).",
  },
  errPasswordCorta: {
    es: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
    en: `The password must be at least ${MIN_PASSWORD} characters long.`,
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
  confirmQuitarBloqueo: {
    es: "Sin PIN ni contraseña, el fichero de datos solo queda ofuscado con una clave que va dentro de la app: quien lo copie puede leerlo. Las copias automáticas anteriores siguen pidiendo su PIN. ¿Quitar el bloqueo?",
    en: "Without a PIN or password, the data file is only obfuscated with a key that ships inside the app: whoever copies it can read it. Earlier automatic backups still ask for their PIN. Remove the lock?",
  },
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
    es: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
    en: `The new password must be at least ${MIN_PASSWORD} characters long.`,
  },
  errMigracionPendiente: {
    es: "Tus datos aún no se han pasado al fichero cifrado: reinicia la app y vuelve a intentarlo.",
    en: "Your data has not been moved to the encrypted file yet: restart the app and try again.",
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
  datosApp: { es: "Datos de la app", en: "App data" },
  empezarCero: { es: "Empezar de cero", en: "Start from scratch" },
  cargarEjemplo: { es: "Cargar ejemplo", en: "Load samples" },
  confirmEmpezarCero: {
    es: "Se borrarán todos tus movimientos, deudas, planes, presupuestos, plantillas y cuentas. Exporta antes una copia si quieres conservarlos. ¿Seguir?",
    en: "All your transactions, debts, plans, budgets, templates and accounts will be deleted. Export a backup first if you want to keep them. Continue?",
  },
  confirmCargarEjemplo: {
    es: "Tus datos se sustituirán por los de ejemplo. Exporta antes una copia si quieres conservarlos. ¿Seguir?",
    en: "Your data will be replaced with the sample data. Export a backup first if you want to keep it. Continue?",
  },
  okDatosVacios: { es: "Datos vaciados.", en: "Data cleared." },
  okDatosEjemplo: { es: "Datos de ejemplo cargados.", en: "Sample data loaded." },
  errDatosGuardar: {
    es: "No se ha podido guardar el cambio.",
    en: "Could not save the change.",
  },
  errCategoriaVacia: {
    es: "Escribe un nombre para la categoría.",
    en: "Enter a name for the category.",
  },
  errCategoriaExiste: { es: "Esa categoría ya existe.", en: "That category already exists." },
});

// ── 2. Apariencia (tema/moneda/idioma) / Appearance (theme/currency/language) ─
// ES: Cambia el tema directamente desde el store (persiste y aplica solo).
// EN: Sets the theme straight from the store (it persists and applies itself).
function elegirTema(t: "claro" | "oscuro") {
  ajustes.setTema(t);
}

// ES: Monedas disponibles para el selector (código ISO + etiqueta legible).
// EN: Currencies offered by the selector (ISO code + readable label).
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

// ── 3. Seguridad: activar/quitar bloqueo / Security: enable/disable lock ──────
// ES: Tipo de credencial elegido en el formulario de activación.
// EN: Credential type chosen in the enable form.
const tipoBloqueo = ref<"pin" | "password">("pin");
// ES: Campos del formulario: credencial y su repetición para confirmar.
// EN: Form fields: the credential and its repetition for confirmation.
const credencial = ref("");
const credencialRepetir = ref("");
// ES: Mensajes de feedback (éxito / error) de la sección de seguridad.
// EN: Feedback messages (success / error) of the security section.
const mensajeSeguridad = ref("");
const errorSeguridad = ref(""); // ES: con texto -> se pinta en rojo / EN: text here -> painted red

// ES: Etiqueta legible del tipo de bloqueo activo (para mostrarlo cuando ya existe).
// EN: Readable label of the active lock type (shown when a lock already exists).
const etiquetaTipoActivo = computed(() =>
  ajustes.bloqueoTipo === "pin" ? t("tipoActivoPin") : t("tipoActivoPassword")
);

// ES: Activa el bloqueo validando según el tipo elegido.
// EN: Enables the lock, validating according to the chosen type.
async function activarBloqueo() {
  // ES: Limpia mensajes previos antes de validar. / EN: Clear previous messages before validating.
  mensajeSeguridad.value = "";
  errorSeguridad.value = "";

  const cred = credencial.value;
  const rep = credencialRepetir.value;

  // ES: Mínimos comunes (utils/credencial.ts, los mismos que aplica Rust):
  //     PIN de 4 a 6 cifras; contraseña de al menos 8 caracteres.
  // EN: Shared minimums (utils/credencial.ts, the same ones Rust enforces):
  //     4 to 6 digit PIN; password of at least 8 characters.
  const motivo = validarCredencial(tipoBloqueo.value, cred);
  if (motivo) {
    errorSeguridad.value = t(motivo === "pin-formato" ? "errPinFormato" : "errPasswordCorta");
    return;
  }

  // ES: Las dos casillas deben coincidir. / EN: Both boxes must match.
  if (cred !== rep) {
    errorSeguridad.value =
      tipoBloqueo.value === "pin" ? t("errPinNoCoincide") : t("errPasswordNoCoincide");
    return;
  }

  // ES: Todo correcto: configura el bloqueo (activa y re-cifra los datos).
  // EN: All good: configure the lock (enables it and re-encrypts the data).
  try {
    await sesion.configurarBloqueo(tipoBloqueo.value, cred);
    // ES: Limpia el formulario y avisa del éxito. / EN: Clear the form and report success.
    credencial.value = "";
    credencialRepetir.value = "";
    mensajeSeguridad.value = t("okBloqueoActivado");
  } catch (e) {
    errorSeguridad.value =
      e instanceof Error && e.message === "migracion-pendiente"
        ? t("errMigracionPendiente")
        : t("errBloqueoActivar");
  }
}

// ES: Quita el bloqueo y vuelve al guardado por ofuscación.
// EN: Removes the lock and goes back to obfuscation-based storage.
async function desactivarBloqueo() {
  mensajeSeguridad.value = "";
  errorSeguridad.value = "";
  // ES: Aviso honesto: sin bloqueo el fichero solo queda ofuscado.
  // EN: Honest warning: without a lock the file is only obfuscated.
  if (!confirm(t("confirmQuitarBloqueo"))) return;
  try {
    await sesion.quitarBloqueo();
    mensajeSeguridad.value = t("okBloqueoDesactivado");
  } catch {
    errorSeguridad.value = t("errBloqueoQuitar");
  }
}

// ── 4. Cambiar credencial / Change credential ────────────────────────────────
// ES: Campos para cambiar la credencial (actual + nueva + repetir) y feedback.
// EN: Fields to change the credential (current + new + repeat) and feedback.
const credActual = ref("");
const credNueva = ref("");
const credNuevaRep = ref("");
const tipoNuevo = ref<"pin" | "password">(ajustes.bloqueoTipo ?? "pin");
// ES: Mantén el selector de "tipo nuevo" sincronizado con el tipo de bloqueo activo,
//     para que abrir "cambiar credencial" con contraseña valide como contraseña, no PIN.
// EN: Keep the "new type" selector in sync with the active lock type, so opening
//     "change credential" with a password set validates as password, not as PIN.
watch(
  () => ajustes.bloqueoTipo,
  (tipo) => {
    if (tipo) tipoNuevo.value = tipo;
  }
);
const mensajeCambio = ref("");
const errorCambio = ref("");

// ES: Valida la credencial actual+nueva y pide al store que la cambie.
// EN: Validates current+new credential and asks the store to change it.
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
  const motivoNuevo = validarCredencial(tipoNuevo.value, nue);
  if (motivoNuevo) {
    errorCambio.value = t(motivoNuevo === "pin-formato" ? "errNuevoPin" : "errNuevaPassword");
    return;
  }
  if (nue !== rep) {
    errorCambio.value = t("errNuevaNoCoincide");
    return;
  }

  let ok: boolean;
  try {
    ok = await sesion.cambiarCredencial(act, nue, tipoNuevo.value);
  } catch {
    errorCambio.value = t("errBloqueoActivar");
    return;
  }
  if (!ok) {
    errorCambio.value = t("errCredActualIncorrecta");
    return;
  }
  credActual.value = "";
  credNueva.value = "";
  credNuevaRep.value = "";
  mensajeCambio.value = t("okCredActualizada");
}

// ── 5. Datos de la app (vaciar / ejemplo) / App data (clear / samples) ───────
// ES: Mensajes de feedback de la sección de datos. / EN: Feedback messages of the data section.
const mensajeCopia = ref("");
const errorCopia = ref("");

// ES: "Empezar de cero" / "Cargar ejemplo": confirma y sustituye todos los
//     datos. El resultado sale en los mensajes de la sección de copia.
// EN: "Start from scratch" / "Load samples": confirms and replaces all the
//     data. The outcome shows in the backup section messages.
async function reemplazarDatos(tipo: "vacio" | "ejemplo") {
  mensajeCopia.value = "";
  errorCopia.value = "";
  if (!confirm(t(tipo === "vacio" ? "confirmEmpezarCero" : "confirmCargarEjemplo"))) return;
  try {
    await sesion.reemplazarDatos(tipo);
    mensajeCopia.value = t(tipo === "vacio" ? "okDatosVacios" : "okDatosEjemplo");
  } catch {
    errorCopia.value = t("errDatosGuardar");
  }
}

// ── 6. Categorías personalizadas / Custom categories ─────────────────────────
// ES: El usuario puede crear/eliminar sus propias categorías. Se guardan en
//     localStorage (no reactivo), así que mantenemos una copia local en un ref
//     que refrescamos manualmente tras cada cambio.
// EN: The user can create/delete their own categories. They are stored in
//     localStorage (non-reactive), so we keep a local copy in a ref that we
//     refresh manually after each change.
// ES: Copia local reactiva de las categorías personalizadas (estado inicial leído de localStorage).
// EN: Reactive local copy of the custom categories (initial state read from localStorage).
const categoriasPropias = ref<string[]>(categoriasCustom());
// ES: Texto del input para crear una categoría nueva. / EN: Input text to create a new category.
const nuevaCategoria = ref("");
// ES: Mensajes de feedback de la sección. / EN: Feedback message of the section.
const errorCategoria = ref("");

// ES: Refresca la copia local desde localStorage tras añadir/eliminar.
// EN: Refreshes the local copy from localStorage after add/delete.
function refrescarCategorias(): void {
  categoriasPropias.value = categoriasCustom();
}

// ES: Añade la categoría escrita en el input. / EN: Adds the category typed in the input.
function anadirCategoria(): void {
  errorCategoria.value = "";
  const limpio = nuevaCategoria.value.trim();
  // ES: Validación mínima: no vacío. / EN: Minimal validation: not empty.
  if (!limpio) {
    errorCategoria.value = t("errCategoriaVacia");
    return;
  }
  // ES: Avisa si ya existe (base o personalizada) antes de intentar guardar.
  // EN: Warn if it already exists (base or custom) before trying to save.
  if (categoriasPropias.value.includes(limpio)) {
    errorCategoria.value = t("errCategoriaExiste");
    return;
  }
  // ES: Delega la normalización y guardado en la función del módulo de datos.
  // EN: Delegate normalization and saving to the data-module function.
  agregarCategoriaCustom(limpio);
  refrescarCategorias();
  // ES: Limpia el input para la siguiente. / EN: Clear the input for the next one.
  nuevaCategoria.value = "";
}

// ES: Elimina una categoría personalizada por nombre. / EN: Deletes a custom category by name.
function quitarCategoria(nombre: string): void {
  errorCategoria.value = "";
  eliminarCategoriaCustom(nombre);
  refrescarCategorias();
}
</script>

<template>
  <!-- ES: Contenedor de la vista de ajustes. / EN: Settings view container. -->
  <div class="space-y-5">
    <!-- ES: Título de la vista. / EN: View title. -->
    <h1 class="font-display text-2xl font-bold text-ink">{{ t("tituloVista") }}</h1>

    <!-- =====================================================================
         ES: SECCIÓN — Apariencia (tema / moneda / idioma)
         EN: SECTION — Appearance (theme / currency / language)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("apariencia") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("aparienciaDesc") }}
      </p>

      <!-- ES: Conmutador de tema: el botón activo se resalta con bg-brand.
           EN: Theme switch: the active button is highlighted with bg-brand. -->
      <div class="flex gap-3 mt-4" role="group" :aria-label="t('apariencia')">
        <button
          class="flex-1 rounded-lg px-4 py-2 font-medium border transition-colors"
          :aria-pressed="ajustes.tema === 'oscuro'"
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
          :aria-pressed="ajustes.tema === 'claro'"
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

      <!-- ES: Selector de moneda: enlazado directo al ref del store. El watch
           del store sincroniza el formateador, así que toda la UI (importes con
           euro()) se actualiza sola al cambiarla.
           EN: Currency selector: bound directly to the store ref. The store's
           watch syncs the formatter, so the whole UI (amounts via euro())
           updates itself when it changes. -->
      <div class="mt-5">
        <label :for="`${uid}-moneda`" class="text-muted text-sm">{{ t("moneda") }}</label>
        <select
          :id="`${uid}-moneda`"
          v-model="ajustes.moneda"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        >
          <option v-for="m in MONEDAS" :key="m.codigo" :value="m.codigo">
            {{ m.etiqueta }}
          </option>
        </select>
        <p class="text-faint text-xs mt-1">{{ t("monedaDesc") }}</p>
      </div>

      <!-- ES: Selector de idioma: dos botones (Español / English) que llaman a
           ajustes.setIdioma. El botón activo se resalta con bg-brand igual que
           el conmutador de tema. Encabezado con el mismo estilo de label que
           el selector de moneda.
           EN: Language selector: two buttons (Spanish / English) calling
           ajustes.setIdioma. The active button is highlighted with bg-brand
           like the theme switch. Header styled with the same label style as
           the currency selector. -->
      <div class="mt-5">
        <!-- ES: Encabezado del grupo de botones (no es un <label>: no hay un control único).
             EN: Heading of the button group (not a <label>: there is no single control). -->
        <p :id="`${uid}-idioma`" class="text-muted text-sm">{{ t("idioma") }}</p>
        <div class="flex gap-3 mt-1" role="group" :aria-labelledby="`${uid}-idioma`">
          <button
            class="flex-1 rounded-lg px-4 py-2 font-medium border transition-colors"
            :aria-pressed="ajustes.idioma === 'es'"
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
            :aria-pressed="ajustes.idioma === 'en'"
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
         ES: SECCIÓN — Seguridad (bloqueo al abrir)
         EN: SECTION — Security (lock on open)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("seguridad") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("seguridadDesc") }}
      </p>

      <!-- ES: CASO A: el bloqueo NO está activo -> formulario para activarlo.
           EN: CASE A: lock is NOT active -> form to enable it. -->
      <div v-if="!ajustes.bloqueoActivo" class="mt-4 space-y-3">
        <!-- ES: Selector del tipo de credencial. / EN: Credential type selector. -->
        <div>
          <label :for="`${uid}-tipoBloqueo`" class="text-muted text-sm">{{
            t("tipoBloqueo")
          }}</label>
          <select
            :id="`${uid}-tipoBloqueo`"
            v-model="tipoBloqueo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="pin">{{ t("opcionPin") }}</option>
            <option value="password">{{ t("opcionPassword") }}</option>
          </select>
        </div>

        <!-- ES: Campo de credencial (PIN o contraseña según el tipo).
             EN: Credential field (PIN or password depending on the type). -->
        <div>
          <label :for="`${uid}-labelPin`" class="text-muted text-sm">
            {{ tipoBloqueo === "pin" ? t("labelPin") : t("labelPassword") }}
          </label>
          <input
            :id="`${uid}-labelPin`"
            v-model="credencial"
            :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
            :placeholder="tipoBloqueo === 'pin' ? t('phPin') : t('phPassword')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <!-- ES: Aviso si el PIN es fácil de adivinar / EN: Warning if the PIN is easy to guess -->
          <AvisoPinDebil v-if="tipoBloqueo === 'pin'" :pin="credencial" />
        </div>

        <!-- ES: Repetir credencial para confirmar. / EN: Repeat credential to confirm. -->
        <div>
          <label :for="`${uid}-repetirPin`" class="text-muted text-sm">
            {{ tipoBloqueo === "pin" ? t("repetirPin") : t("repetirPassword") }}
          </label>
          <input
            :id="`${uid}-repetirPin`"
            v-model="credencialRepetir"
            :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
            :placeholder="t('phRepetir')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- ES: Botón de activación. / EN: Enable button. -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="activarBloqueo"
        >
          {{ t("activarBloqueo") }}
        </button>
      </div>

      <!-- ES: CASO B: el bloqueo YA está activo -> mostrar estado y opción de quitarlo.
           EN: CASE B: lock is ALREADY active -> show state and option to remove it. -->
      <div v-else class="mt-4 space-y-3">
        <!-- ES: Indicador de bloqueo activo. / EN: Active-lock indicator. -->
        <p class="text-ink">
          {{ t("bloqueoEtiqueta") }}
          <span class="text-ok font-medium">{{ t("estadoActivo") }}</span> ({{
            etiquetaTipoActivo
          }}).
        </p>
        <!-- ES: Botón peligroso para quitar el bloqueo. / EN: Dangerous button to remove the lock. -->
        <button
          class="rounded-lg border border-danger px-4 py-2 text-danger font-medium hover:bg-surface-2 transition-colors"
          @click="desactivarBloqueo"
        >
          {{ t("quitarBloqueo") }}
        </button>

        <!-- ES: Cambiar la credencial: actual + nueva + repetir.
             EN: Change the credential: current + new + repeat. -->
        <div class="mt-2 border-t border-border pt-4 space-y-3">
          <p class="text-sm font-medium text-ink">{{ t("cambiarCredencial") }}</p>
          <div>
            <label :for="`${uid}-tipoNuevo`" class="text-muted text-sm">{{ t("tipoNuevo") }}</label>
            <select
              :id="`${uid}-tipoNuevo`"
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
            :aria-label="t('phCredActual')"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <input
            v-model="credNueva"
            :type="tipoNuevo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoNuevo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoNuevo === 'pin' ? 6 : undefined"
            :placeholder="tipoNuevo === 'pin' ? t('phNuevoPin') : t('phNuevaPassword')"
            :aria-label="tipoNuevo === 'pin' ? t('phNuevoPin') : t('phNuevaPassword')"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <AvisoPinDebil v-if="tipoNuevo === 'pin'" :pin="credNueva" />
          <input
            v-model="credNuevaRep"
            :type="tipoNuevo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoNuevo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoNuevo === 'pin' ? 6 : undefined"
            :placeholder="t('phRepetirNueva')"
            :aria-label="t('phRepetirNueva')"
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

        <!-- ES: Bloquear ahora, autobloqueo y clave de recuperación (solo con el fichero cifrado).
             EN: Lock now, auto-lock and recovery key (only with the encrypted file). -->
        <SeguridadSesion v-if="sesion.modo === 'fichero'" />
      </div>

      <!-- ES: Mensajes de feedback de la sección de seguridad. / EN: Feedback messages of the security section. -->
      <p v-if="errorSeguridad" class="text-danger text-sm mt-3">{{ errorSeguridad }}</p>
      <p v-else-if="mensajeSeguridad" class="text-ok text-sm mt-3">{{ mensajeSeguridad }}</p>
    </section>

    <!-- ES: SECCIÓN — Copias de seguridad (cifrada, JSON, importar y automáticas).
         EN: SECTION — Backups (encrypted, JSON, import and automatic). -->
    <CopiasSeguridad @importada="refrescarCategorias" />

    <!-- =====================================================================
         ES: SECCIÓN — Datos de la app (vaciar / ejemplo)
         EN: SECTION — App data (clear / samples)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <!-- ES: Datos de la app: vaciar o cargar el ejemplo (con confirmación).
           EN: App data: clear or load the samples (with confirmation). -->
      <h2 class="font-display font-bold text-lg text-ink">{{ t("datosApp") }}</h2>
      <div class="flex flex-wrap gap-3 mt-2">
        <button
          type="button"
          class="rounded-lg border border-danger/60 px-4 py-2 text-danger font-medium hover:bg-danger/10 transition-colors"
          @click="reemplazarDatos('vacio')"
        >
          {{ t("empezarCero") }}
        </button>
        <button
          type="button"
          class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-faint transition-colors"
          @click="reemplazarDatos('ejemplo')"
        >
          {{ t("cargarEjemplo") }}
        </button>
      </div>

      <!-- ES: Mensajes de feedback de la sección de copia. / EN: Feedback messages of the backup section. -->
      <p v-if="errorCopia" class="text-danger text-sm mt-3">{{ errorCopia }}</p>
      <p v-else-if="mensajeCopia" class="text-ok text-sm mt-3">{{ mensajeCopia }}</p>
    </section>

    <!-- =====================================================================
         ES: SECCIÓN — Categorías personalizadas
         EN: SECTION — Custom categories
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("categorias") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("categoriasDesc") }}
      </p>

      <!-- ES: Input + botón para crear una categoría nueva. / EN: Input + button to create a new category. -->
      <div class="flex gap-3 mt-4">
        <input
          v-model="nuevaCategoria"
          type="text"
          :placeholder="t('phNuevaCategoria')"
          :aria-label="t('phNuevaCategoria')"
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

      <!-- ES: Mensaje de error de la sección. / EN: Section error message. -->
      <p v-if="errorCategoria" class="text-danger text-sm mt-3">{{ errorCategoria }}</p>

      <!-- ES: Lista de categorías personalizadas con botón de eliminar.
           EN: List of custom categories with a delete button. -->
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

      <!-- ES: Aviso cuando todavía no hay categorías propias. / EN: Notice when there are no custom categories yet. -->
      <p v-else class="text-faint text-xs mt-3">{{ t("sinCategorias") }}</p>
    </section>

    <!-- ES: SECCIÓN — Reglas de categoría para importar extractos (v4).
         EN: SECTION — Category rules for statement import (v4). -->
    <ReglasCategoria />
  </div>
</template>
