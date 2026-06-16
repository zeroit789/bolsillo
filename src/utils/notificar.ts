/* ===========================================================================
   Notificaciones nativas del sistema (plugin de Tauri).
   Se usa, por ejemplo, al terminar de pagar una deuda.
   =========================================================================== */
import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";

// Envía una notificación del sistema. Pide permiso la primera vez.
// Silencioso ante errores (p.ej. si se ejecuta fuera de Tauri).
export async function notificar(titulo: string, cuerpo: string): Promise<void> {
  try {
    let permitido = await isPermissionGranted();
    if (!permitido) {
      permitido = (await requestPermission()) === "granted";
    }
    if (permitido) {
      sendNotification({ title: titulo, body: cuerpo });
    }
  } catch {
    /* sin notificaciones disponibles: no pasa nada */
  }
}
