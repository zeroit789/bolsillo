/* ===========================================================================
   Store de ajustes: tema (claro/oscuro) y configuración del bloqueo.
   Se guarda en claro (no es información sensible) y aplica el tema al <html>.
   =========================================================================== */
import { defineStore } from "pinia";
import { ref, watch } from "vue";

export type Tema = "oscuro" | "claro";
export type TipoBloqueo = "pin" | "password";

const CLAVE = "bolsillo.ajustes";

interface AjustesGuardados {
  tema: Tema;
  bloqueoActivo: boolean;
  bloqueoTipo: TipoBloqueo | null;
}

function cargar(): AjustesGuardados {
  try {
    const c = localStorage.getItem(CLAVE);
    if (c) return JSON.parse(c) as AjustesGuardados;
  } catch {
    /* valores por defecto si está corrupto */
  }
  return { tema: "oscuro", bloqueoActivo: false, bloqueoTipo: null };
}

export const useAjustes = defineStore("ajustes", () => {
  const inicial = cargar();
  const tema = ref<Tema>(inicial.tema);
  const bloqueoActivo = ref<boolean>(inicial.bloqueoActivo);
  const bloqueoTipo = ref<TipoBloqueo | null>(inicial.bloqueoTipo);

  // Aplica el tema al documento (clase 'tema-claro' que el CSS usa para invertir).
  function aplicarTema() {
    document.documentElement.classList.toggle("tema-claro", tema.value === "claro");
  }

  function setTema(t: Tema) {
    tema.value = t;
  }
  function toggleTema() {
    tema.value = tema.value === "oscuro" ? "claro" : "oscuro";
  }
  function setBloqueo(activo: boolean, tipo: TipoBloqueo | null) {
    bloqueoActivo.value = activo;
    bloqueoTipo.value = tipo;
  }

  // Persiste y aplica el tema ante cualquier cambio (también al iniciar).
  watch(
    [tema, bloqueoActivo, bloqueoTipo],
    () => {
      localStorage.setItem(
        CLAVE,
        JSON.stringify({
          tema: tema.value,
          bloqueoActivo: bloqueoActivo.value,
          bloqueoTipo: bloqueoTipo.value,
        })
      );
      aplicarTema();
    },
    { immediate: true }
  );

  return { tema, bloqueoActivo, bloqueoTipo, aplicarTema, setTema, toggleTema, setBloqueo };
});
