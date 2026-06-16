<script setup lang="ts">
/* =============================================================================
 * Onboarding.vue — First-run welcome screen / Pantalla de bienvenida inicial
 * -----------------------------------------------------------------------------
 * EN: First-launch setup screen. Collects the user's name, the starting date
 *     (the PC's date or a chosen month) and an optional app lock (PIN/password).
 *     On finish it persists everything and enters the app. Includes an inline
 *     language switcher whose changes re-render the whole screen on the fly.
 * ES: Pantalla de configuración del primer arranque. Recoge el nombre del
 *     usuario, la fecha de inicio (la del PC o un mes concreto) y un bloqueo
 *     opcional de la app (PIN/contraseña). Al terminar lo guarda todo y entra
 *     en la app. Incluye un selector de idioma en línea cuyos cambios
 *     re-renderizan toda la pantalla al vuelo.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & stores / Imports y stores
 *   2. UI text dictionary (i18n) / Diccionario de textos de UI (i18n)
 *   3. Reactive form state / Estado reactivo del formulario
 *   4. Submit handler (validation + finish) / Manejador de envío (validación + fin)
 * ===========================================================================*/

// ── 1. Imports & stores / Imports y stores ────────────────────────────────────
import { ref, computed } from "vue";
import { useSesion } from "../stores/sesion";
import { useFinanzas } from "../stores/finanzas";
import { useAjustes } from "../stores/ajustes";
import { mesActual } from "../utils/format";
import { crearT } from "../i18n";

// EN: Session store: owns onboarding completion and the persisted lock.
// ES: Store de sesión: gestiona el fin del onboarding y el bloqueo persistido.
const sesion = useSesion();
// EN: Finances store: used to set the starting month if the user picks one.
// ES: Store de finanzas: se usa para fijar el mes de inicio si el usuario elige uno.
const finanzas = useFinanzas();
// EN: Settings store: backs the welcome language switcher (starts on the
//     system-detected language; the user can confirm or change it right here).
// ES: Store de ajustes: respalda el selector de idioma de la bienvenida (arranca
//     con el idioma detectado del sistema y el usuario puede confirmarlo o
//     cambiarlo aquí mismo).
const ajustes = useAjustes();

// ── 2. UI text dictionary (i18n) / Diccionario de textos de UI (i18n) ─────────
// EN: Dictionary of all visible onboarding texts (ES/EN). crearT returns a
//     reactive translator, so reading t("clave") tracks the active language and
//     the whole screen re-renders when it changes.
// ES: Diccionario de todos los textos visibles del onboarding (ES/EN). crearT
//     devuelve un traductor reactivo, así que leer t("clave") sigue el idioma
//     activo y toda la pantalla se re-renderiza cuando cambia.
const t = crearT({
  titulo: { es: "Bienvenido a Bolsillo", en: "Welcome to Bolsillo" },
  subtitulo: { es: "Configúralo en 10 segundos.", en: "Set it up in 10 seconds." },
  etiquetaNombre: { es: "¿Cómo te llamas?", en: "What's your name?" },
  placeholderNombre: { es: "Tu nombre", en: "Your name" },
  etiquetaFecha: { es: "Fecha", en: "Date" },
  fechaSistema: { es: "Usar la fecha de mi PC (recomendado)", en: "Use my computer's date (recommended)" },
  fechaManual: { es: "Empezar en un mes concreto", en: "Start in a specific month" },
  etiquetaBloqueo: { es: "¿Proteger la app al abrir?", en: "Protect the app on open?" },
  bloqueoNinguno: { es: "No, abrir directamente", en: "No, open directly" },
  bloqueoPin: { es: "Sí, con un PIN (4-6 dígitos)", en: "Yes, with a PIN (4-6 digits)" },
  bloqueoPassword: { es: "Sí, con una contraseña", en: "Yes, with a password" },
  placeholderPin: { es: "Tu PIN", en: "Your PIN" },
  placeholderPassword: { es: "Tu contraseña", en: "Your password" },
  placeholderRepetir: { es: "Repetir", en: "Repeat" },
  notaCifrado: {
    es: "Tus datos se cifrarán con esta clave. Si la olvidas, no se pueden recuperar.",
    en: "Your data will be encrypted with this key. If you forget it, it cannot be recovered.",
  },
  botonPreparando: { es: "Preparando…", en: "Setting up…" },
  botonEmpezar: { es: "Empezar", en: "Get started" },
  errorPin: { es: "El PIN debe tener entre 4 y 6 dígitos.", en: "The PIN must be 4 to 6 digits." },
  errorPassword: { es: "La contraseña debe tener al menos 4 caracteres.", en: "The password must be at least 4 characters." },
  errorNoCoincide: { es: "La credencial no coincide.", en: "The credentials don't match." },
});

// ── 3. Reactive form state / Estado reactivo del formulario ───────────────────
// EN: User's name (free text, optional). / ES: Nombre del usuario (texto libre, opcional).
const nombre = ref("");
// EN: Date mode: "sistema" = use the PC's date, "manual" = pick a starting month.
// ES: Modo de fecha: "sistema" = usar la fecha del PC, "manual" = elegir mes de inicio.
const modoFecha = ref<"sistema" | "manual">("sistema");
// EN: Chosen "YYYY-MM" month, prefilled with the current one for the manual mode.
// ES: Mes "YYYY-MM" elegido, precargado con el actual para el modo manual.
const mesElegido = ref(mesActual());
// EN: Lock type: none / PIN / password. Drives whether credentials are asked.
// ES: Tipo de bloqueo: ninguno / PIN / contraseña. Decide si se piden credenciales.
const tipoBloqueo = ref<"ninguno" | "pin" | "password">("ninguno");
// EN: The credential entered and its confirmation (must match before finishing).
// ES: La credencial introducida y su repetición (deben coincidir antes de terminar).
const credencial = ref("");
const credencialRep = ref("");
// EN: Current validation error message (empty = no error). / ES: Mensaje de error
//     de validación actual (vacío = sin error).
const error = ref("");
// EN: Loading flag: true while finishing, to disable the button. / ES: Bandera de
//     carga: true mientras se termina, para deshabilitar el botón.
const cargando = ref(false);

// EN: PIN must be 4 to 6 digits. / ES: El PIN debe tener entre 4 y 6 dígitos.
const REGEX_PIN = /^\d{4,6}$/;
// EN: True when a lock is enabled, so credential fields are shown and validated.
// ES: True cuando hay bloqueo activo, para mostrar y validar los campos de credencial.
const pideCredencial = computed(() => tipoBloqueo.value !== "ninguno");

// ── 4. Submit handler (validation + finish) / Manejador de envío (validación + fin) ──
// EN: Validates the optional lock, applies the chosen starting month, persists
//     the onboarding result and enters the app.
// ES: Valida el bloqueo opcional, aplica el mes de inicio elegido, guarda el
//     resultado del onboarding y entra en la app.
async function empezar() {
  error.value = "";
  // EN: Validate the lock only if one was chosen. / ES: Validar el bloqueo solo si se eligió.
  if (pideCredencial.value) {
    // EN: PIN: enforce the 4-6 digit format. / ES: PIN: exigir el formato de 4-6 dígitos.
    if (tipoBloqueo.value === "pin" && !REGEX_PIN.test(credencial.value)) {
      error.value = t("errorPin");
      return;
    }
    // EN: Password: enforce a minimum length. / ES: Contraseña: exigir longitud mínima.
    if (tipoBloqueo.value === "password" && credencial.value.length < 4) {
      error.value = t("errorPassword");
      return;
    }
    // EN: Both fields must match. / ES: Ambos campos deben coincidir.
    if (credencial.value !== credencialRep.value) {
      error.value = t("errorNoCoincide");
      return;
    }
  }

  cargando.value = true;
  // EN: If a manual date was chosen, start in that month. / ES: Si se eligió fecha
  //     manual, arrancamos en el mes indicado.
  if (modoFecha.value === "manual" && mesElegido.value) {
    finanzas.seleccionarMes(mesElegido.value);
  }
  // EN: Persist name and lock (null = open directly, no lock). / ES: Guardar nombre
  //     y bloqueo (null = abrir directamente, sin bloqueo).
  await sesion.completarOnboarding({
    nombre: nombre.value,
    bloqueo: pideCredencial.value
      ? { tipo: tipoBloqueo.value as "pin" | "password", credencial: credencial.value }
      : null,
  });
  cargando.value = false;
}
</script>

<template>
  <!-- EN: Centered welcome card over the app background.
       ES: Tarjeta de bienvenida centrada sobre el fondo de la app. -->
  <div class="min-h-screen flex items-center justify-center bg-base p-6">
    <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-7">
      <!-- EN: Language switcher: starts on the system-detected language. As the
           texts use crearT (reactive), the whole welcome changes on the fly.
           ES: Selector de idioma: arranca con el idioma detectado del sistema.
           Como los textos usan crearT (reactivo), toda la bienvenida cambia al vuelo. -->
      <div class="flex justify-end gap-1 mb-4">
        <button
          class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
          :class="ajustes.idioma === 'es' ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-ink'"
          @click="ajustes.setIdioma('es')"
        >
          Español
        </button>
        <button
          class="rounded-md px-3 py-1 text-sm font-medium transition-colors"
          :class="ajustes.idioma === 'en' ? 'bg-brand text-white' : 'bg-surface-2 text-muted hover:text-ink'"
          @click="ajustes.setIdioma('en')"
        >
          English
        </button>
      </div>

      <!-- EN: Title with a brand-colored dot, plus the subtitle.
           ES: Título con un punto del color de marca, más el subtítulo. -->
      <h1 class="font-display text-3xl font-extrabold">
        {{ t("titulo") }}<span class="text-brand">.</span>
      </h1>
      <p class="text-muted text-sm mt-1 mb-6">{{ t("subtitulo") }}</p>

      <div class="space-y-4">
        <!-- EN: Name field (free text). / ES: Campo de nombre (texto libre). -->
        <div>
          <label class="text-muted text-sm">{{ t("etiquetaNombre") }}</label>
          <input
            v-model="nombre"
            type="text"
            :placeholder="t('placeholderNombre')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- EN: Date field: choose between the PC's date or a manual month.
             ES: Campo de fecha: elegir entre la fecha del PC o un mes manual. -->
        <div>
          <label class="text-muted text-sm">{{ t("etiquetaFecha") }}</label>
          <select
            v-model="modoFecha"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="sistema">{{ t("fechaSistema") }}</option>
            <option value="manual">{{ t("fechaManual") }}</option>
          </select>
          <!-- EN: Month picker, shown only in manual mode.
               ES: Selector de mes, mostrado solo en modo manual. -->
          <input
            v-if="modoFecha === 'manual'"
            v-model="mesElegido"
            type="month"
            class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- EN: Optional lock: none, PIN or password. When set, two credential
             fields and a warning note appear below.
             ES: Bloqueo opcional: ninguno, PIN o contraseña. Si se activa,
             aparecen abajo dos campos de credencial y una nota de aviso. -->
        <div>
          <label class="text-muted text-sm">{{ t("etiquetaBloqueo") }}</label>
          <select
            v-model="tipoBloqueo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="ninguno">{{ t("bloqueoNinguno") }}</option>
            <option value="pin">{{ t("bloqueoPin") }}</option>
            <option value="password">{{ t("bloqueoPassword") }}</option>
          </select>

          <!-- EN: Credential block, shown only when a lock is enabled. The input
               type/inputmode/maxlength adapt to PIN vs password.
               ES: Bloque de credencial, mostrado solo cuando hay bloqueo activo.
               El type/inputmode/maxlength se adaptan a PIN o contraseña. -->
          <template v-if="pideCredencial">
            <!-- EN: Credential entry. / ES: Introducción de la credencial. -->
            <input
              v-model="credencial"
              :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
              :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
              :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
              :placeholder="tipoBloqueo === 'pin' ? t('placeholderPin') : t('placeholderPassword')"
              class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
            <!-- EN: Credential confirmation (must match the one above).
                 ES: Confirmación de la credencial (debe coincidir con la de arriba). -->
            <input
              v-model="credencialRep"
              :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
              :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
              :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
              :placeholder="t('placeholderRepetir')"
              class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
            <!-- EN: Warning: data is encrypted with this key; forgetting it loses it.
                 ES: Aviso: los datos se cifran con esta clave; olvidarla los pierde. -->
            <p class="text-faint text-xs mt-1">
              {{ t("notaCifrado") }}
            </p>
          </template>
        </div>

        <!-- EN: Validation error message (only when there is one).
             ES: Mensaje de error de validación (solo cuando lo hay). -->
        <p v-if="error" class="text-danger text-sm">{{ error }}</p>
      </div>

      <!-- EN: Submit button: shows a loading label and is disabled while finishing.
           ES: Botón de envío: muestra una etiqueta de carga y se deshabilita al terminar. -->
      <button
        class="mt-6 w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium hover:bg-brand-soft transition-colors disabled:opacity-50"
        :disabled="cargando"
        @click="empezar"
      >
        {{ cargando ? t("botonPreparando") : t("botonEmpezar") }}
      </button>
    </div>
  </div>
</template>
