/* =============================================================================
 * notificar.ts — Native system notifications / Notificaciones nativas del sistema
 * -----------------------------------------------------------------------------
 * EN: Native system notifications (Tauri plugin). Used, for example, when a debt
 *     finishes being paid off.
 * ES: Notificaciones nativas del sistema (plugin de Tauri). Se usa, por ejemplo,
 *     al terminar de pagar una deuda.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Send a notification / Enviar una notificación
 * ===========================================================================*/
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// ── 1. Send a notification / Enviar una notificación ──────────────────────────
// EN: Sends a system notification. Requests permission the first time. Silent on
//     errors (e.g. when running outside Tauri, where the plugin is unavailable).
// ES: Envía una notificación del sistema. Pide permiso la primera vez. Silencioso
//     ante errores (p.ej. si se ejecuta fuera de Tauri, sin el plugin disponible).
export async function notificar(titulo: string, cuerpo: string): Promise<void> {
  try {
    // EN: Check existing permission; if not granted, ask the user for it.
    // ES: Comprueba el permiso existente; si no está concedido, lo pide al usuario.
    let permitido = await isPermissionGranted();
    if (!permitido) {
      permitido = (await requestPermission()) === "granted";
    }
    if (permitido) {
      sendNotification({ title: titulo, body: cuerpo });
    }
  } catch {
    // EN: No notifications available: nothing to do, fail silently.
    // ES: Sin notificaciones disponibles: no pasa nada, falla en silencio.
  }
}
