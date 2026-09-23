/* =============================================================================
 * notificar.ts — Notificaciones nativas del sistema / Native system notifications
 * -----------------------------------------------------------------------------
 * ES: Notificaciones nativas del sistema (plugin de Tauri). Se usa, por ejemplo,
 *     al terminar de pagar una deuda.
 * EN: Native system notifications (Tauri plugin). Used, for example, when a debt
 *     finishes being paid off.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Enviar una notificación / Send a notification
 * ===========================================================================*/
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// ── 1. Enviar una notificación / Send a notification ──────────────────────────
// ES: Envía una notificación del sistema. Pide permiso la primera vez. Silencioso
//     ante errores (p.ej. si se ejecuta fuera de Tauri, sin el plugin disponible).
// EN: Sends a system notification. Requests permission the first time. Silent on
//     errors (e.g. when running outside Tauri, where the plugin is unavailable).
export async function notificar(titulo: string, cuerpo: string): Promise<void> {
  try {
    // ES: Comprueba el permiso existente; si no está concedido, lo pide al usuario.
    // EN: Check existing permission; if not granted, ask the user for it.
    let permitido = await isPermissionGranted();
    if (!permitido) {
      permitido = (await requestPermission()) === "granted";
    }
    if (permitido) {
      sendNotification({ title: titulo, body: cuerpo });
    }
  } catch {
    // ES: Sin notificaciones disponibles: no pasa nada, falla en silencio.
    // EN: No notifications available: nothing to do, fail silently.
  }
}
