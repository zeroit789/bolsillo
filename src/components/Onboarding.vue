<script setup lang="ts">
/* Pantalla de bienvenida del primer arranque: nombre, fecha (PC o manual) y
   bloqueo opcional (PIN/contraseña). Al terminar, entra en la app. */
import { ref, computed } from "vue";
import { useSesion } from "../stores/sesion";
import { useFinanzas } from "../stores/finanzas";
import { mesActual } from "../utils/format";

const sesion = useSesion();
const finanzas = useFinanzas();

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
      error.value = "El PIN debe tener entre 4 y 6 dígitos.";
      return;
    }
    if (tipoBloqueo.value === "password" && credencial.value.length < 4) {
      error.value = "La contraseña debe tener al menos 4 caracteres.";
      return;
    }
    if (credencial.value !== credencialRep.value) {
      error.value = "La credencial no coincide.";
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
        Bienvenido a Bolsillo<span class="text-brand">.</span>
      </h1>
      <p class="text-muted text-sm mt-1 mb-6">Configúralo en 10 segundos.</p>

      <div class="space-y-4">
        <!-- Nombre -->
        <div>
          <label class="text-muted text-sm">¿Cómo te llamas?</label>
          <input
            v-model="nombre"
            type="text"
            placeholder="Tu nombre"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          />
        </div>

        <!-- Fecha -->
        <div>
          <label class="text-muted text-sm">Fecha</label>
          <select
            v-model="modoFecha"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="sistema">Usar la fecha de mi PC (recomendado)</option>
            <option value="manual">Empezar en un mes concreto</option>
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
          <label class="text-muted text-sm">¿Proteger la app al abrir?</label>
          <select
            v-model="tipoBloqueo"
            class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option value="ninguno">No, abrir directamente</option>
            <option value="pin">Sí, con un PIN (4-6 dígitos)</option>
            <option value="password">Sí, con una contraseña</option>
          </select>

          <template v-if="pideCredencial">
            <input
              v-model="credencial"
              :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
              :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
              :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
              :placeholder="tipoBloqueo === 'pin' ? 'Tu PIN' : 'Tu contraseña'"
              class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
            <input
              v-model="credencialRep"
              :type="tipoBloqueo === 'pin' ? 'tel' : 'password'"
              :inputmode="tipoBloqueo === 'pin' ? 'numeric' : 'text'"
              :maxlength="tipoBloqueo === 'pin' ? 6 : undefined"
              placeholder="Repetir"
              class="mt-2 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
            />
            <p class="text-faint text-xs mt-1">
              Tus datos se cifrarán con esta clave. Si la olvidas, no se pueden recuperar.
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
        {{ cargando ? "Preparando…" : "Empezar" }}
      </button>
    </div>
  </div>
</template>
