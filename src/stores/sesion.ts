/* ===========================================================================
   Store de sesión: orquesta arranque, bienvenida (onboarding), bloqueo y el
   guardado cifrado. Estados de pantalla posibles:
     - necesitaOnboarding: primer arranque (mostrar bienvenida)
     - bloqueado (bloqueoActivo && !desbloqueado): pedir credencial
     - desbloqueado: app en marcha
   =========================================================================== */
import { defineStore } from "pinia";
import { ref, watch } from "vue";
import { useFinanzas } from "./finanzas";
import { useAjustes, type TipoBloqueo } from "./ajustes";
import * as almacen from "../utils/almacen";
import { datosDemo } from "../data/demo";

export const useSesion = defineStore("sesion", () => {
  const desbloqueado = ref(false);
  const necesitaOnboarding = ref(false);
  const error = ref("");
  let guardadoActivo = false;

  // Activa el guardado automático CIFRADO (una sola vez).
  function activarGuardado() {
    if (guardadoActivo) return;
    guardadoActivo = true;
    const f = useFinanzas();
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

  // Igual que cargarEHidratar pero tolerante: si el blob está corrupto, demo.
  async function cargarSeguro() {
    try {
      await cargarEHidratar();
    } catch {
      const f = useFinanzas();
      f.hidratar(datosDemo());
      activarGuardado();
      await almacen.guardar(f.snapshot());
    }
  }

  // Arranque: decide la pantalla inicial.
  async function arrancar() {
    const ajustes = useAjustes();
    ajustes.aplicarTema();

    // Primer arranque -> bienvenida (con datos demo de fondo).
    if (!ajustes.configurado) {
      almacen.usarOfuscacion();
      await cargarSeguro();
      necesitaOnboarding.value = true;
      return;
    }
    // Con bloqueo -> esperar credencial.
    if (ajustes.bloqueoActivo) {
      desbloqueado.value = false;
      return;
    }
    // Sin bloqueo -> entrar directo.
    almacen.usarOfuscacion();
    await cargarSeguro();
    desbloqueado.value = true;
  }

  // Desbloqueo con la credencial introducida en la pantalla de bloqueo.
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

  // Activa el bloqueo: re-cifra con la nueva credencial.
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

  // Cambia la credencial: verifica la actual y re-cifra con la nueva.
  async function cambiarCredencial(
    antigua: string,
    nueva: string,
    tipo: TipoBloqueo
  ): Promise<boolean> {
    const ok = await almacen.secretoValido(antigua);
    if (!ok) return false;
    const f = useFinanzas();
    almacen.usarSecreto(nueva);
    await almacen.guardar(f.snapshot());
    useAjustes().setBloqueo(true, tipo);
    return true;
  }

  // Completa la bienvenida: guarda nombre, activa bloqueo si se eligió, y entra.
  async function completarOnboarding(opts: {
    nombre: string;
    bloqueo: { tipo: TipoBloqueo; credencial: string } | null;
  }) {
    const ajustes = useAjustes();
    ajustes.setNombre(opts.nombre.trim());
    if (opts.bloqueo) {
      await configurarBloqueo(opts.bloqueo.tipo, opts.bloqueo.credencial);
    }
    ajustes.marcarConfigurado();
    necesitaOnboarding.value = false;
    desbloqueado.value = true;
  }

  return {
    desbloqueado,
    necesitaOnboarding,
    error,
    arrancar,
    desbloquear,
    configurarBloqueo,
    quitarBloqueo,
    cambiarCredencial,
    completarOnboarding,
  };
});
