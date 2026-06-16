/* ===========================================================================
   Store de sesión: orquesta el arranque, el bloqueo y el guardado cifrado.
   - Si hay credencial activa, la app arranca BLOQUEADA hasta que se introduce.
   - El guardado automático cifra los datos en cada cambio.
   =========================================================================== */
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useFinanzas } from "./finanzas";
import { useAjustes, type TipoBloqueo } from "./ajustes";
import * as almacen from "../utils/almacen";
import { datosDemo } from "../data/demo";

export const useSesion = defineStore("sesion", () => {
  const desbloqueado = ref(false);
  const error = ref("");
  let guardadoActivo = false;

  // Activa el guardado automático CIFRADO (una sola vez).
  function activarGuardado() {
    if (guardadoActivo) return;
    guardadoActivo = true;
    const f = useFinanzas();
    // OJO: observamos el snapshot (arrays .value desenvueltos), NO los refs del
    // store; así el deep watch sí detecta los push/splice y guarda de verdad.
    watch(
      () => f.snapshot(),
      () => {
        void almacen.guardar(f.snapshot());
      },
      { deep: true }
    );
  }

  // Carga los datos (o siembra demo la primera vez) e hidrata finanzas.
  async function cargarEHidratar() {
    const f = useFinanzas();
    const datos = await almacen.cargar();
    if (datos) {
      f.hidratar(datos);
    } else {
      f.hidratar(datosDemo());
      await almacen.guardar(f.snapshot());
    }
    activarGuardado();
  }

  // Arranque de la app: ¿pedir credencial o entrar directo?
  async function arrancar() {
    const ajustes = useAjustes();
    ajustes.aplicarTema();
    if (ajustes.bloqueoActivo) {
      // Con bloqueo activo SIEMPRE esperamos la credencial; nunca sembramos
      // demo con ofuscación (eso dejaría los datos reales inaccesibles).
      desbloqueado.value = false;
    } else {
      almacen.usarOfuscacion();
      await cargarEHidratar();
      desbloqueado.value = true;
    }
  }

  // Intenta desbloquear con la credencial introducida en la pantalla de bloqueo.
  async function desbloquear(credencial: string): Promise<boolean> {
    error.value = "";
    try {
      const ok = await almacen.secretoValido(credencial);
      if (!ok) {
        error.value = "Credencial incorrecta";
        return false;
      }
      almacen.usarSecreto(credencial);
      await cargarEHidratar();
      desbloqueado.value = true;
      return true;
    } catch {
      error.value = "No se pudieron leer los datos";
      return false;
    }
  }

  // Activa el bloqueo: re-cifra los datos con la nueva credencial.
  async function configurarBloqueo(tipo: TipoBloqueo, credencial: string) {
    const f = useFinanzas();
    almacen.usarSecreto(credencial);
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(true, tipo);
  }

  // Quita el bloqueo: vuelve a cifrar con el secreto de ofuscación.
  async function quitarBloqueo() {
    const f = useFinanzas();
    almacen.usarOfuscacion();
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(false, null);
  }

  return { desbloqueado, error, arrancar, desbloquear, configurarBloqueo, quitarBloqueo };
});
