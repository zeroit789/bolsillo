<script setup lang="ts">
/* Pantalla de bloqueo: aparece al arrancar si el usuario activó un PIN o
   contraseña. Verifica la credencial intentando descifrar los datos. */
import { ref, computed } from "vue";
import { useSesion } from "../stores/sesion";
import { useAjustes } from "../stores/ajustes";

const sesion = useSesion();
const ajustes = useAjustes();

const credencial = ref("");
const cargando = ref(false);

const esPin = computed(() => ajustes.bloqueoTipo === "pin");

async function entrar() {
  if (!credencial.value) return;
  cargando.value = true;
  await sesion.desbloquear(credencial.value);
  cargando.value = false;
  if (!sesion.desbloqueado) credencial.value = ""; // limpia si falla
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-base p-6">
    <div class="w-full max-w-xs text-center">
      <!-- Logo -->
      <h1 class="font-display text-3xl font-extrabold mb-1">
        Bolsillo<span class="text-brand">.</span>
      </h1>
      <p class="text-muted text-sm mb-6">
        {{ esPin ? "Introduce tu PIN" : "Introduce tu contraseña" }}
      </p>

      <input
        v-model="credencial"
        type="password"
        :inputmode="esPin ? 'numeric' : 'text'"
        :maxlength="esPin ? 6 : undefined"
        autofocus
        class="w-full text-center tracking-widest rounded-lg bg-surface border border-border px-3 py-3 text-ink outline-none focus:border-brand"
        :placeholder="esPin ? '••••' : '••••••••'"
        @keyup.enter="entrar"
      />

      <p v-if="sesion.error" class="text-danger text-sm mt-3">{{ sesion.error }}</p>

      <button
        class="mt-5 w-full rounded-lg bg-brand px-4 py-2.5 text-white font-medium hover:bg-brand-soft transition-colors disabled:opacity-50"
        :disabled="cargando || !credencial"
        @click="entrar"
      >
        {{ cargando ? "Comprobando…" : "Desbloquear" }}
      </button>

      <p class="text-faint text-xs mt-6">Tus datos están cifrados en este equipo.</p>
    </div>
  </div>
</template>
