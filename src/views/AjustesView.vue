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

// --- Stores ---
const ajustes = useAjustes();
const sesion = useSesion();
const finanzas = useFinanzas();

/* ===========================================================================
   SECCIÓN 1 — APARIENCIA
   =========================================================================== */
// Cambia el tema directamente desde el store (persiste y aplica solo).
function elegirTema(t: "claro" | "oscuro") {
  ajustes.setTema(t);
}

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
  ajustes.bloqueoTipo === "pin" ? "PIN" : "Contraseña"
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
      errorSeguridad.value = "El PIN debe tener entre 4 y 6 dígitos (solo números).";
      return;
    }
  } else {
    // Contraseña: libre, mínimo 4 caracteres.
    if (cred.length < 4) {
      errorSeguridad.value = "La contraseña debe tener al menos 4 caracteres.";
      return;
    }
  }

  // Las dos casillas deben coincidir.
  if (cred !== rep) {
    errorSeguridad.value =
      tipoBloqueo.value === "pin" ? "Los PIN no coinciden." : "Las contraseñas no coinciden.";
    return;
  }

  // Todo correcto: configura el bloqueo (activa y re-cifra los datos).
  try {
    await sesion.configurarBloqueo(tipoBloqueo.value, cred);
    // Limpia el formulario y avisa del éxito.
    credencial.value = "";
    credencialRepetir.value = "";
    mensajeSeguridad.value = "Bloqueo activado. La próxima vez se pedirá al abrir la app.";
  } catch {
    errorSeguridad.value = "No se pudo activar el bloqueo. Inténtalo de nuevo.";
  }
}

// Quita el bloqueo y vuelve al guardado por ofuscación.
async function desactivarBloqueo() {
  mensajeSeguridad.value = "";
  errorSeguridad.value = "";
  try {
    await sesion.quitarBloqueo();
    mensajeSeguridad.value = "Bloqueo desactivado.";
  } catch {
    errorSeguridad.value = "No se pudo quitar el bloqueo. Inténtalo de nuevo.";
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
    errorCambio.value = "Introduce tu credencial actual.";
    return;
  }
  if (tipoNuevo.value === "pin") {
    if (!REGEX_PIN.test(nue)) {
      errorCambio.value = "El nuevo PIN debe tener entre 4 y 6 dígitos.";
      return;
    }
  } else if (nue.length < 4) {
    errorCambio.value = "La nueva contraseña debe tener al menos 4 caracteres.";
    return;
  }
  if (nue !== rep) {
    errorCambio.value = "La nueva credencial no coincide.";
    return;
  }

  const ok = await sesion.cambiarCredencial(act, nue, tipoNuevo.value);
  if (!ok) {
    errorCambio.value = "La credencial actual no es correcta.";
    return;
  }
  credActual.value = "";
  credNueva.value = "";
  credNuevaRep.value = "";
  mensajeCambio.value = "Credencial actualizada.";
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
    mensajeCopia.value = "Copia exportada como bolsillo-backup.json";
  } catch {
    errorCopia.value = "No se pudo exportar la copia.";
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
        errorCopia.value = "El fichero no es una copia válida de Bolsillo.";
        return;
      }

      // Confirma antes de sobrescribir los datos actuales.
      if (!confirm("Esto reemplazará TODOS tus datos actuales. ¿Continuar?")) {
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
      mensajeCopia.value = "Copia importada correctamente.";
    } catch {
      errorCopia.value = "No se pudo leer el fichero (JSON inválido).";
    } finally {
      // Resetea el input para poder volver a elegir el mismo fichero.
      input.value = "";
    }
  };
  // Error de lectura del propio fichero.
  lector.onerror = () => {
    errorCopia.value = "No se pudo leer el fichero.";
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
    errorCategoria.value = "Escribe un nombre para la categoría.";
    return;
  }
  // Avisa si ya existe (base o personalizada) antes de intentar guardar.
  if (categoriasPropias.value.includes(limpio)) {
    errorCategoria.value = "Esa categoría ya existe.";
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
    <h1 class="font-display text-2xl font-bold text-ink">Ajustes</h1>

    <!-- =====================================================================
         SECCIÓN 1 — APARIENCIA
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">Apariencia</h2>
      <p class="text-muted text-sm mt-1">
        Elige el tema de la app. El modo oscuro cansa menos la vista cuando trabajas de noche.
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
          Oscuro
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
          Claro
        </button>
      </div>
    </section>

    <!-- =====================================================================
         SECCIÓN 2 — SEGURIDAD (bloqueo al abrir)
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">Seguridad</h2>
      <p class="text-muted text-sm mt-1">
        Protege la app con un bloqueo al abrir. Los datos se guardan cifrados; si olvidas la
        credencial no se pueden recuperar.
      </p>

      <!-- CASO A: el bloqueo NO está activo -> formulario para activarlo -->
      <div v-if="!ajustes.bloqueoActivo" class="mt-4 space-y-3">
        <!-- Selector del tipo de credencial -->
        <div>
          <label class="text-muted text-sm">Tipo de bloqueo</label>
          <select
            v-model="tipoBloqueo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="pin">PIN (4 a 6 dígitos)</option>
            <option value="password">Contraseña</option>
          </select>
        </div>

        <!-- Campo de credencial (PIN o contraseña según el tipo) -->
        <div>
          <label class="text-muted text-sm">
            {{ tipoBloqueo === "pin" ? "PIN" : "Contraseña" }}
          </label>
          <input
            v-model="credencial"
            :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
            :placeholder="tipoBloqueo === 'pin' ? '4 a 6 dígitos' : 'Tu contraseña'"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Repetir credencial para confirmar -->
        <div>
          <label class="text-muted text-sm">
            Repetir {{ tipoBloqueo === "pin" ? "PIN" : "contraseña" }}
          </label>
          <input
            v-model="credencialRepetir"
            :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
            placeholder="Vuelve a escribirlo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Botón de activación -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="activarBloqueo"
        >
          Activar bloqueo
        </button>
      </div>

      <!-- CASO B: el bloqueo YA está activo -> mostrar estado y opción de quitarlo -->
      <div v-else class="mt-4 space-y-3">
        <!-- Indicador de bloqueo activo -->
        <p class="text-ink">
          Bloqueo <span class="text-ok font-medium">activo</span>
          ({{ etiquetaTipoActivo }}).
        </p>
        <!-- Botón peligroso para quitar el bloqueo -->
        <button
          class="rounded-lg border border-danger px-4 py-2 text-danger font-medium hover:bg-surface-2 transition-colors"
          @click="desactivarBloqueo"
        >
          Quitar bloqueo
        </button>

        <!-- Cambiar la credencial: actual + nueva + repetir -->
        <div class="mt-2 border-t border-border pt-4 space-y-3">
          <p class="text-sm font-medium text-ink">Cambiar credencial</p>
          <div>
            <label class="text-muted text-sm">Tipo nuevo</label>
            <select
              v-model="tipoNuevo"
              class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            >
              <option value="pin">PIN (4 a 6 dígitos)</option>
              <option value="password">Contraseña</option>
            </select>
          </div>
          <input
            v-model="credActual"
            type="password"
            placeholder="Credencial actual"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <input
            v-model="credNueva"
            :type="tipoNuevo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoNuevo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoNuevo === 'pin' ? 6 : undefined"
            :placeholder="tipoNuevo === 'pin' ? 'Nuevo PIN (4-6 dígitos)' : 'Nueva contraseña'"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <input
            v-model="credNuevaRep"
            :type="tipoNuevo === 'pin' ? 'tel' : 'password'"
            :inputmode="tipoNuevo === 'pin' ? 'numeric' : 'text'"
            :maxlength="tipoNuevo === 'pin' ? 6 : undefined"
            placeholder="Repetir nueva credencial"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
          <button
            class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
            @click="cambiarCred"
          >
            Cambiar
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
      <h2 class="font-display font-bold text-lg text-ink">Copia de seguridad</h2>
      <p class="text-muted text-sm mt-1">
        Exporta todos tus datos a un fichero .json para guardarlo a salvo, o impórtalo para
        restaurarlos en este u otro equipo.
      </p>

      <!-- Botones de exportar / importar -->
      <div class="flex flex-wrap gap-3 mt-4">
        <!-- Exportar copia -->
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="exportarCopia"
        >
          Exportar copia (.json)
        </button>

        <!-- Importar copia: el botón dispara el input file oculto -->
        <button
          class="rounded-lg border border-border px-4 py-2 text-ink font-medium hover:border-faint transition-colors"
          @click="pedirImportar"
        >
          Importar copia
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
        Importar reemplaza todos los datos actuales. Te pediremos confirmación antes de hacerlo.
      </p>

      <!-- Mensajes de feedback de la sección de copia -->
      <p v-if="errorCopia" class="text-danger text-sm mt-3">{{ errorCopia }}</p>
      <p v-else-if="mensajeCopia" class="text-ok text-sm mt-3">{{ mensajeCopia }}</p>
    </section>

    <!-- =====================================================================
         SECCIÓN 4 — CATEGORÍAS PERSONALIZADAS
         ===================================================================== -->
    <section class="rounded-2xl bg-surface border border-border p-5">
      <h2 class="font-display font-bold text-lg text-ink">Categorías</h2>
      <p class="text-muted text-sm mt-1">
        Crea tus propias categorías. Aparecerán en el desplegable al añadir un movimiento, dentro
        del grupo "Personalizadas".
      </p>

      <!-- Input + botón para crear una categoría nueva -->
      <div class="flex gap-3 mt-4">
        <input
          v-model="nuevaCategoria"
          type="text"
          placeholder="Ej. Suscripción gimnasio"
          class="flex-1 rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          @keyup.enter="anadirCategoria"
        />
        <button
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
          @click="anadirCategoria"
        >
          Añadir
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
            Eliminar
          </button>
        </li>
      </ul>

      <!-- Aviso cuando todavía no hay categorías propias -->
      <p v-else class="text-faint text-xs mt-3">Aún no has creado ninguna categoría propia.</p>
    </section>
  </div>
</template>
