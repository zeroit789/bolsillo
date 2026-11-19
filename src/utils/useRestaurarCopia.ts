/* =============================================================================
 * useRestaurarCopia.ts — Restaurar una copia automática / Restore an automatic backup
 * -----------------------------------------------------------------------------
 * ES: Flujo común de Ajustes y de la pantalla de error para restaurar una
 *     copia automática: se confirma; si la copia tenía PIN o contraseña, se
 *     pide (la copia se abre y valida con su credencial ANTES de publicarse,
 *     así que una copia dañada o un PIN equivocado no tocan nada). Los errores
 *     salen como código para que cada vista los traduzca: "copia-credencial",
 *     "copia-invalida", "copia-version", "guardado-pendiente" o "restaurar".
 * EN: Shared flow of Settings and the error screen to restore an automatic
 *     backup: it is confirmed; if the backup had a PIN or password, it is
 *     asked (the backup is opened and validated with its credential BEFORE
 *     being published, so a damaged backup or a wrong PIN touch nothing).
 *     Errors come out as a code for each view to translate.
 * ===========================================================================*/
import { ref } from "vue";
import { useSesion } from "../stores/sesion";
import type { InfoCopia } from "./boveda";

// ES: Códigos de error que conoce la vista. / EN: Error codes the view knows.
const CONOCIDOS = ["copia-credencial", "copia-invalida", "copia-version", "guardado-pendiente"];

export function useRestaurarCopia(confirmar: () => boolean) {
  const sesion = useSesion();
  // ES: Copia que espera su PIN o contraseña. / EN: Backup waiting for its PIN or password.
  const pidiendo = ref<string | null>(null);
  const pin = ref("");
  const error = ref("");
  const ocupado = ref(false);

  async function ejecutar(nombre: string, credencial: string | null) {
    ocupado.value = true;
    error.value = "";
    try {
      await sesion.restaurarCopia(nombre, credencial);
      pidiendo.value = null;
      pin.value = "";
    } catch (e) {
      const m = e instanceof Error ? e.message : "";
      error.value = CONOCIDOS.includes(m) ? m : "restaurar";
    } finally {
      ocupado.value = false;
    }
  }

  // ES: Botón "Restaurar" de una copia. / EN: A backup's "Restore" button.
  function restaurar(c: InfoCopia) {
    if (ocupado.value || !confirmar()) return;
    error.value = "";
    if (c.bloqueo && c.bloqueo !== "ninguno") {
      pidiendo.value = c.nombre;
      pin.value = "";
      return;
    }
    void ejecutar(c.nombre, null);
  }

  // ES: Envía el PIN o la contraseña de la copia. / EN: Sends the backup's PIN or password.
  function enviarPin() {
    if (pidiendo.value && pin.value) void ejecutar(pidiendo.value, pin.value);
  }

  function cancelar() {
    pidiendo.value = null;
    pin.value = "";
    error.value = "";
  }

  return { pidiendo, pin, error, ocupado, restaurar, enviarPin, cancelar };
}
