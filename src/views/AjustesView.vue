<script setup lang="ts">
/* ===========================================================================
   Vista "Ajustes" de Bolsillo.
   Tres secciones (tarjetas):
     1) Apariencia  -> tema claro/oscuro
     2) Seguridad   -> bloqueo al abrir (PIN o contraseña)
     3) Copia       -> exportar / importar copia de seguridad (.json)
   No toca disco directamente: delega en los stores.
   =========================================================================== */
import { ref, computed } from "vue";
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

// --- Stores ---
const ajustes = useAjustes();
const sesion = useSesion();
const finanzas = useFinanzas();

/* ===========================================================================
   TRADUCCIONES (ES/EN)
   Reúne todos los textos visibles de la vista. Al leer `ajustes.idioma`
   (reactivo) la UI se re-renderiza sola al cambiar el idioma.
   No se traducen: nombres de categorías (datos), monedas/códigos ISO.
   =========================================================================== */
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

/* ===========================================================================
   SECCIÓN 1 — APARIENCIA
   =========================================================================== */
// Cambia el tema directamente desde el store (persiste y aplica solo).
function elegirTema(t: "claro" | "oscuro") {
  ajustes.setTema(t);
}

// Monedas disponibles para el selector (código ISO + etiqueta legible).
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

/* ===========================================================================
   SECCIÓN 2 — SEGURIDAD (bloqueo al abrir)
   =========================================================================== */
// Tipo de credencial elegido en el formulario de activación.
const tipoBloqueo = ref<"pin" | "password">("pin");
// Campos del formulario: credencial y su repetición para confirmar.
const credencial = ref("");
const credencialRepetir = ref("");
// Mensajes de feedback (éxito / error) de la sección de seguridad.
const mensajeSeguridad = ref("");
const errorSeguridad = ref(""); // si tiene texto -> se pinta en rojo

// Regex de validación del PIN: solo dígitos, entre 4 y 6.
const REGEX_PIN = /^\d{4,6}$/;

// Etiqueta legible del tipo de bloqueo activo (para mostrarlo cuando ya existe).
const etiquetaTipoActivo = computed(() =>
  ajustes.bloqueoTipo === "pin" ? t("tipoActivoPin") : t("tipoActivoPassword")
);

// Activa el bloqueo validando según el tipo elegido.
async function activarBloqueo() {
  // Limpia mensajes previos antes de validar.
  mensajeSeguridad.value = "";
  errorSeguridad.value = "";

  const cred = credencial.value;
  const rep = credencialRepetir.value;

  // Validación según el tipo seleccionado.
  if (tipoBloqueo.value === "pin") {
    // PIN: solo dígitos, mínimo 4 y máximo 6.
    if (!REGEX_PIN.test(cred)) {
      errorSeguridad.value = t("errPinFormato");
      return;
    }
  } else {
    // Contraseña: libre, mínimo 4 caracteres.
    if (cred.length < 4) {
      errorSeguridad.value = t("errPasswordCorta");
      return;
    }
  }

  // Las dos casillas deben coincidir.
  if (cred !== rep) {
    errorSeguridad.value =
      tipoBloqueo.value === "pin" ? t("errPinNoCoincide") : t("errPasswordNoCoincide");
    return;
  }

  // Todo correcto: configura el bloqueo (activa y re-cifra los datos).
  try {
    await sesion.configurarBloqueo(tipoBloqueo.value, cred);
    // Limpia el formulario y avisa del éxito.
    credencial.value = "";
    credencialRepetir.value = "";
    mensajeSeguridad.value = t("okBloqueoActivado");
  } catch {
    errorSeguridad.value = t("errBloqueoActivar");
  }
}

// Quita el bloqueo y vuelve al guardado por ofuscación.
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

// --- Cambiar la credencial (actual + nueva + repetir) ---
const credActual = ref("");
const credNueva = ref("");
const credNuevaRep = ref("");
const tipoNuevo = ref<"pin" | "password">(ajustes.bloqueoTipo ?? "pin");
const mensajeCambio = ref("");
const errorCambio = ref("");

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

/* ===========================================================================
   SECCIÓN 3 — COPIA DE SEGURIDAD
   =========================================================================== */
// Mensajes de feedback de la sección de copia.
const mensajeCopia = ref("");
const errorCopia = ref("");
// Referencia al input file oculto que dispara el botón "Importar".
const inputFichero = ref<HTMLInputElement | null>(null);

// Exporta todos los datos a un .json y fuerza su descarga.
function exportarCopia() {
  mensajeCopia.value = "";
  errorCopia.value = "";
  try {
    // Serializa el snapshot completo legible (indentado a 2 espacios).
    // Incluye también las categorías personalizadas (viven fuera del cifrado).
    const json = JSON.stringify(
      { ...finanzas.snapshot(), categoriasCustom: categoriasCustom() },
      null,
      2
    );
    // Crea un blob de texto y una URL temporal para descargarlo.
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    // Enlace invisible que se "pulsa" para lanzar la descarga.
    const a = document.createElement("a");
    a.href = url;
    a.download = "bolsillo-backup.json";
    a.click();
    // Libera la URL temporal para no acumular memoria.
    URL.revokeObjectURL(url);
    mensajeCopia.value = t("okCopiaExportada");
  } catch {
    errorCopia.value = t("errCopiaExportar");
  }
}

// Abre el selector de fichero (el input está oculto).
function pedirImportar() {
  inputFichero.value?.click();
}

// Lee el fichero elegido, valida el JSON e hidrata las finanzas.
function importarCopia(evento: Event) {
  mensajeCopia.value = "";
  errorCopia.value = "";

  // Recupera el fichero seleccionado del input.
  const input = evento.target as HTMLInputElement;
  const fichero = input.files?.[0];
  if (!fichero) return;

  // Lee el contenido del fichero como texto.
  const lector = new FileReader();
  lector.onload = async () => {
    try {
      // Parsea el JSON y valida a fondo la forma (cada item), no solo los arrays.
      const datos = JSON.parse(String(lector.result));
      if (!esDatosValidos(datos)) {
        errorCopia.value = t("errCopiaInvalida");
        return;
      }

      // Confirma antes de sobrescribir los datos actuales.
      if (!confirm(t("confirmImportar"))) {
        return;
      }

      // Restaura las categorías personalizadas de la copia (si las trae).
      const custom = (datos as { categoriasCustom?: unknown }).categoriasCustom;
      if (Array.isArray(custom)) {
        setCategoriasCustom(custom as string[]);
        refrescarCategorias();
      }

      // Importa y PERSISTE de forma garantizada (con await, no depende del watch).
      await sesion.importarDatos(datos);
      mensajeCopia.value = t("okCopiaImportada");
    } catch {
      errorCopia.value = t("errCopiaLeerJson");
    } finally {
      // Resetea el input para poder volver a elegir el mismo fichero.
      input.value = "";
    }
  };
  // Error de lectura del propio fichero.
  lector.onerror = () => {
    errorCopia.value = t("errCopiaLeer");
    input.value = "";
  };
  lector.readAsText(fichero);
}

/* ===========================================================================
   SECCIÓN 4 — CATEGORÍAS PERSONALIZADAS
   El usuario puede crear/eliminar sus propias categorías. Se guardan en
   localStorage (no reactivo), así que mantenemos una copia local en un ref
   que refrescamos manualmente tras cada cambio.
   =========================================================================== */
// Copia local reactiva de las categorías personalizadas (estado inicial leído de localStorage).
const categoriasPropias = ref<string[]>(categoriasCustom());
// Texto del input para crear una categoría nueva.
const nuevaCategoria = ref("");
// Mensajes de feedback de la sección.
const errorCategoria = ref("");

// Refresca la copia local desde localStorage tras añadir/eliminar.
function refrescarCategorias(): void {
  categoriasPropias.value = categoriasCustom();
}

// Añade la categoría escrita en el input.
function anadirCategoria(): void {
  errorCategoria.value = "";
  const limpio = nuevaCategoria.value.trim();
  // Validación mínima: no vacío.
  if (!limpio) {
    errorCategoria.value = t("errCategoriaVacia");
    return;
  }
  // Avisa si ya existe (base o personalizada) antes de intentar guardar.
  if (categoriasPropias.value.includes(limpio)) {
    errorCategoria.value = t("errCategoriaExiste");
    return;
  }
  // Delega la normalización y guardado en la función del módulo de datos.
  agregarCategoriaCustom(limpio);
  refrescarCategorias();
  // Limpia el input para la siguiente.
  nuevaCategoria.value = "";
}

// Elimina una categoría personalizada por nombre.
function quitarCategoria(nombre: string): void {
  errorCategoria.value = "";
  eliminarCategoriaCustom(nombre);
  refrescarCategorias();
}
</script>

<template>
  <!-- Contenedor de la vista de ajustes -->
  <div class="space-y-5">
    <!-- Título de la vista -->
    <h1 class="font-display text-2xl font-bold text-ink">{{ t("tituloVista") }}</h1>

    <!-- =====================================================================
         SECCIÓN 1 — APARIENCIA
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("apariencia") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("aparienciaDesc") }}
      </p>

      <!-- Conmutador de tema: el botón activo se resalta con bg-brand -->
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

      <!-- Selector de moneda: enlazado directo al ref del store.
           El watch del store sincroniza el formateador, así que toda la UI
           (importes con euro()) se actualiza sola al cambiarla. -->
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

      <!-- Selector de idioma: dos botones (Español / English) que llaman a
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
         SECCIÓN 2 — SEGURIDAD (bloqueo al abrir)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("seguridad") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("seguridadDesc") }}
      </p>

      <!-- CASO A: el bloqueo NO está activo -> formulario para activarlo -->
      <div v-if="!ajustes.bloqueoActivo" class="mt-4 space-y-3">
        <!-- Selector del tipo de credencial -->
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

        <!-- Campo de credencial (PIN o contraseña según el tipo) -->
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

        <!-- Repetir credencial para confirmar -->
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

        <!-- Botón de activación -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="activarBloqueo"
        >
          {{ t("activarBloqueo") }}
        </button>
      </div>

      <!-- CASO B: el bloqueo YA está activo -> mostrar estado y opción de quitarlo -->
      <div v-else class="mt-4 space-y-3">
        <!-- Indicador de bloqueo activo -->
        <p class="text-ink">
          {{ t("bloqueoEtiqueta") }} <span class="text-ok font-medium">{{ t("estadoActivo") }}</span>
          ({{ etiquetaTipoActivo }}).
        </p>
        <!-- Botón peligroso para quitar el bloqueo -->
        <button
          class="rounded-lg border border-danger px-4 py-2 text-danger font-medium hover:bg-surface-2 transition-colors"
          @click="desactivarBloqueo"
        >
          {{ t("quitarBloqueo") }}
        </button>

        <!-- Cambiar la credencial: actual + nueva + repetir -->
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

      <!-- Mensajes de feedback de la sección de seguridad -->
      <p v-if="errorSeguridad" class="text-danger text-sm mt-3">{{ errorSeguridad }}</p>
      <p v-else-if="mensajeSeguridad" class="text-ok text-sm mt-3">{{ mensajeSeguridad }}</p>
    </section>

    <!-- =====================================================================
         SECCIÓN 3 — COPIA DE SEGURIDAD
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("copia") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("copiaDesc") }}
      </p>

      <!-- Botones de exportar / importar -->
      <div class="flex flex-wrap gap-3 mt-4">
        <!-- Exportar copia -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="exportarCopia"
        >
          {{ t("exportarCopia") }}
        </button>

        <!-- Importar copia: el botón dispara el input file oculto -->
        <button
          class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-faint transition-colors"
          @click="pedirImportar"
        >
          {{ t("importarCopia") }}
        </button>

        <!-- Input file oculto: solo acepta JSON; al elegir, lanza importarCopia -->
        <input
          ref="inputFichero"
          type="file"
          accept="application/json"
          class="hidden"
          @change="importarCopia"
        />
      </div>

      <!-- Aviso sobre el reemplazo de datos al importar -->
      <p class="text-faint text-xs mt-3">
        {{ t("copiaAviso") }}
      </p>

      <!-- Mensajes de feedback de la sección de copia -->
      <p v-if="errorCopia" class="text-danger text-sm mt-3">{{ errorCopia }}</p>
      <p v-else-if="mensajeCopia" class="text-ok text-sm mt-3">{{ mensajeCopia }}</p>
    </section>

    <!-- =====================================================================
         SECCIÓN 4 — CATEGORÍAS PERSONALIZADAS
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">{{ t("categorias") }}</h2>
      <p class="text-muted text-sm mt-1">
        {{ t("categoriasDesc") }}
      </p>

      <!-- Input + botón para crear una categoría nueva -->
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

      <!-- Mensaje de error de la sección -->
      <p v-if="errorCategoria" class="text-danger text-sm mt-3">{{ errorCategoria }}</p>

      <!-- Lista de categorías personalizadas con botón de eliminar -->
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

      <!-- Aviso cuando todavía no hay categorías propias -->
      <p v-else class="text-faint text-xs mt-3">{{ t("sinCategorias") }}</p>
    </section>
  </div>
</template>
