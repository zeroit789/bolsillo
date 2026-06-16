<script setup lang="ts">
/* Pantalla de bienvenida del primer arranque: nombre, fecha (PC o manual) y
   bloqueo opcional (PIN/contraseña). Al terminar, entra en la app. */
import { ref, computed } from "vue";
import { useSesion } from "../stores/sesion";
import { useFinanzas } from "../stores/finanzas";
import { mesActual } from "../utils/format";
import { crearT } from "../i18n";

const sesion = useSesion();
const finanzas = useFinanzas();

// Diccionario de textos visibles del onboarding (ES/EN).
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

const nombre = ref("");
const modoFecha = ref<"sistema" | "manual">("sistema");
const mesElegido = ref(mesActual());
const tipoBloqueo = ref<"ninguno" | "pin" | "password">("ninguno");
const credencial = ref("");
const credencialRep = ref("");
const error = ref("");
const cargando = ref(false);

const REGEX_PIN = /^\d{4,6}$/;
const pideCredencial = computed(() => tipoBloqueo.value !== "ninguno");

async function empezar() {
  error.value = "";
  // Validación del bloqueo si se eligió.
  if (pideCredencial.value) {
    if (tipoBloqueo.value === "pin" && !REGEX_PIN.test(credencial.value)) {
      error.value = t("errorPin");
      return;
    }
    if (tipoBloqueo.value === "password" && credencial.value.length < 4) {
      error.value = t("errorPassword");
      return;
    }
    if (credencial.value !== credencialRep.value) {
      error.value = t("errorNoCoincide");
      return;
    }
  }

  cargando.value = true;
  // Si eligió fecha manual, arrancamos en el mes indicado.
  if (modoFecha.value === "manual" && mesElegido.value) {
    finanzas.seleccionarMes(mesElegido.value);
  }
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
  <div class="min-h-screen flex items-center justify-center bg-base p-6">
    <div class="w-full max-w-md rounded-2xl bg-surface border border-border p-7">
      <h1 class="font-display text-3xl font-extrabold">
        {{ t("titulo") }}<span class="text-brand">.</span>
      </h1>
      <p class="text-muted text-sm mt-1 mb-6">{{ t("subtitulo") }}</p>

      <div class="space-y-4">
        <!-- Nombre -->
        <div>
          <label class="text-muted text-sm">{{ t("etiquetaNombre") }}</label>
          <input
            v-model="nombre"
            type="text"
            :placeholder="t('placeholderNombre')"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Fecha -->
        <div>
          <label class="text-muted text-sm">{{ t("etiquetaFecha") }}</label>
          <select
            v-model="modoFecha"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="sistema">{{ t("fechaSistema") }}</option>
            <option value="manual">{{ t("fechaManual") }}</option>
          </select>
          <input
            v-if="modoFecha === 'manual'"
            v-model="mesElegido"
            type="month"
            class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Bloqueo -->
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

          <template v-if="pideCredencial">
            <input
              v-model="credencial"
              :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
              :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
              :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
              :placeholder="tipoBloqueo === 'pin' ? t('placeholderPin') : t('placeholderPassword')"
              class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
            <input
              v-model="credencialRep"
              :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
              :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
              :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
              :placeholder="t('placeholderRepetir')"
              class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
            <p class="text-faint text-xs mt-1">
              {{ t("notaCifrado") }}
            </p>
          </template>
        </div>

        <p v-if="error" class="text-danger text-sm">{{ error }}</p>
      </div>

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
