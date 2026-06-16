/* ===========================================================================
   Store de ajustes: tema, configuración del bloqueo, nombre del usuario y si ya
   pasó por la bienvenida (onboarding). Se guarda en claro (no es sensible).
   =========================================================================== */
import { defineStore } from "pinia";
import { ref, watch } from "vue";
// Sincroniza el formateador de importes con la moneda guardada.
import { setMoneda as setMonedaFormat, setLocaleFecha } from "../utils/format";

export type Tema = "oscuro" | "claro";
export type TipoBloqueo = "pin" | "password";
export type Idioma = "es" | "en";

const CLAVE = "bolsillo.ajustes";

interface AjustesGuardados {
  tema: Tema;
  bloqueoActivo: boolean;
  bloqueoTipo: TipoBloqueo | null;
  nombre: string;
  moneda: string; // código ISO de la moneda elegida (EUR, USD, GBP...)
  idioma: Idioma; // idioma de la interfaz (es / en)
  configurado: boolean; // true tras completar la bienvenida
}

const POR_DEFECTO: AjustesGuardados = {
  tema: "oscuro",
  bloqueoActivo: false,
  bloqueoTipo: null,
  nombre: "",
  moneda: "EUR",
  idioma: "es",
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
  const moneda = ref<string>(inicial.moneda);
  const idioma = ref<Idioma>(inicial.idioma);
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
  function setMoneda(c: string) {
    moneda.value = c;
  }
  function setIdioma(i: Idioma) {
    idioma.value = i;
  }
  function marcarConfigurado() {
    configurado.value = true;
  }

  // Persiste y aplica el tema ante cualquier cambio (también al iniciar).
  watch(
    [tema, bloqueoActivo, bloqueoTipo, nombre, moneda, idioma, configurado],
    () => {
      localStorage.setItem(
        CLAVE,
        JSON.stringify({
          tema: tema.value,
          bloqueoActivo: bloqueoActivo.value,
          bloqueoTipo: bloqueoTipo.value,
          nombre: nombre.value,
          moneda: moneda.value,
          idioma: idioma.value,
          configurado: configurado.value,
        })
      );
      aplicarTema();
    },
    { immediate: true }
  );

  // Sincroniza el formateador de importes con la moneda guardada.
  // immediate: true -> al arrancar aplica la moneda persistida, no solo al cambiarla.
  watch(moneda, (m) => setMonedaFormat(m), { immediate: true });

  // Sincroniza el locale de fechas con el idioma elegido (es-ES / en-US).
  watch(idioma, (i) => setLocaleFecha(i === "en" ? "en-US" : "es-ES"), { immediate: true });

  return {
    tema,
    bloqueoActivo,
    bloqueoTipo,
    nombre,
    moneda,
    idioma,
    configurado,
    aplicarTema,
    setTema,
    toggleTema,
    setBloqueo,
    setNombre,
    setMoneda,
    setIdioma,
    marcarConfigurado,
  };
});
