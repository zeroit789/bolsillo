/* ===========================================================================
   Store de ajustes: tema, configuración del bloqueo, nombre del usuario y si ya
   pasó por la bienvenida (onboarding). Se guarda en claro (no es sensible).
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
  nombre: string;
  configurado: boolean; // true tras completar la bienvenida
}

const POR_DEFECTO: AjustesGuardados = {
  tema: "oscuro",
  bloqueoActivo: false,
  bloqueoTipo: null,
  nombre: "",
  configurado: false,
};

function cargar(): AjustesGuardados {
  try {
    const c = localStorage.getItem(CLAVE);
    // El spread con POR_DEFECTO rellena campos nuevos en ajustes antiguos.
    if (c) return { ...POR_DEFECTO, ...JSON.parse(c) };
  } catch {
    /* corrupto -> valores por defecto */
  }
  return { ...POR_DEFECTO };
}

export const useAjustes = defineStore("ajustes", () => {
  const inicial = cargar();
  const tema = ref<Tema>(inicial.tema);
  const bloqueoActivo = ref<boolean>(inicial.bloqueoActivo);
  const bloqueoTipo = ref<TipoBloqueo | null>(inicial.bloqueoTipo);
  const nombre = ref<string>(inicial.nombre);
  const configurado = ref<boolean>(inicial.configurado);

  // Aplica el tema al documento (clase que el CSS usa para invertir).
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
  function setNombre(n: string) {
    nombre.value = n;
  }
  function marcarConfigurado() {
    configurado.value = true;
  }

  // Persiste y aplica el tema ante cualquier cambio (también al iniciar).
  watch(
    [tema, bloqueoActivo, bloqueoTipo, nombre, configurado],
    () => {
      localStorage.setItem(
        CLAVE,
        JSON.stringify({
          tema: tema.value,
          bloqueoActivo: bloqueoActivo.value,
          bloqueoTipo: bloqueoTipo.value,
          nombre: nombre.value,
          configurado: configurado.value,
        })
      );
      aplicarTema();
    },
    { immediate: true }
  );

  return {
    tema,
    bloqueoActivo,
    bloqueoTipo,
    nombre,
    configurado,
    aplicarTema,
    setTema,
    toggleTema,
    setBloqueo,
    setNombre,
    marcarConfigurado,
  };
});
