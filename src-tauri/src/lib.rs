// =============================================================================
// lib.rs — Configuración Tauri y comandos nativos / Tauri app setup & native commands
// -----------------------------------------------------------------------------
// ES: Backend Rust de "Bolsillo". Registra los plugins de Tauri (opener, diálogo,
//     notificaciones) y expone un único comando nativo que usa el frontend para
//     escribir en disco los archivos de exportación (XLSX/PDF) a través del
//     diálogo nativo de "Guardar como".
// EN: Rust backend of "Bolsillo". Registers the Tauri plugins (opener, dialog,
//     notification) and exposes a single native command used by the frontend to
//     write export files (XLSX/PDF) to disk via the OS save dialog.
// -----------------------------------------------------------------------------
// ÍNDICE / INDEX:
//   1. Importaciones / Imports
//   2. guardar_archivo — escribir bytes a disco / write bytes to disk
//   3. run() — arranque de la app Tauri / Tauri app bootstrap
// =============================================================================

// ── 1. Importaciones / Imports ───────────────────────────────────────────────
// ES: Módulo de sistema de archivos de la librería estándar — aporta fs::write para
//     volcar bytes en un archivo.
// EN: Standard library filesystem module — provides fs::write to dump bytes to a file.
use std::fs;

// ── 2. guardar_archivo — escribir bytes a disco / write bytes to disk ──
// ES: Comando nativo invocable desde el frontend (vía Tauri invoke). Escribe los
//     bytes recibidos en la ruta que el usuario eligió con el diálogo nativo de
//     guardar. Se usa para persistir los archivos de exportación (Excel/PDF)
//     generados en el frontend.
// EN: Native command callable from the frontend (via Tauri invoke). It writes the
//     given raw bytes to the path the user picked with the native save dialog.
//     Used to persist the export files (Excel/PDF) generated in the frontend.
//
// ES: Parámetros → `ruta`: ruta de destino del archivo; `contenido`: bytes del archivo.
// EN: Parameters → `ruta`: destination file path; `contenido`: raw file bytes.
//
// ES: Devuelve Ok(()) si va bien, o Err(String) con el mensaje de error del SO si
//     falla (el error se convierte a String para poder cruzar el puente Tauri a JS).
// EN: Returns Ok(()) on success, or Err(String) with the OS error message on failure
//     (the error is mapped to a String so it can cross the Tauri boundary to JS).
#[tauri::command]
fn guardar_archivo(ruta: String, contenido: Vec<u8>) -> Result<(), String> {
    // ES: Escribe todos los bytes en la ruta; convierte cualquier error de IO en su mensaje String.
    // EN: Write all bytes to the path; map any IO error into its String message.
    fs::write(&ruta, &contenido).map_err(|e| e.to_string())
}

// ── 3. run() — arranque de la app Tauri / Tauri app bootstrap ─────────────────
// ES: Punto de entrada de la aplicación Tauri. En destinos móviles también se marca
//     como punto de entrada móvil, de modo que la misma función arranca la app en
//     todas las plataformas.
// EN: Entry point of the Tauri application. On mobile targets this is also marked
//     as the mobile entry point so the same function boots the app on every platform.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // ES: Construye la app Tauri, registra los plugins, conecta el manejador de comandos y la ejecuta.
    // EN: Build the Tauri app, register plugins, wire the command handler, then run it.
    tauri::Builder::default()
        // ES: plugin opener — permite abrir URLs / archivos / carpetas con la aplicación por defecto del SO.
        // EN: opener plugin — lets the app open URLs / files / folders with the OS default handler.
        .plugin(tauri_plugin_opener::init())
        // ES: plugin dialog — provee los diálogos nativos de "Guardar como" / selector de archivos usados en la exportación.
        // EN: dialog plugin — provides the native "Save as" / file picker dialogs used by the export flow.
        .plugin(tauri_plugin_dialog::init())
        // ES: plugin notification — permite mostrar notificaciones nativas del SO.
        // EN: notification plugin — lets the app show native OS notifications.
        .plugin(tauri_plugin_notification::init())
        // ES: Registra los comandos invocables desde JS; aquí solo se expone guardar_archivo.
        // EN: Register the commands callable from JS; here only guardar_archivo is exposed.
        .invoke_handler(tauri::generate_handler![guardar_archivo])
        // ES: Ejecuta la app usando el contexto generado en build (tauri.conf.json, assets, etc.).
        // EN: Run the app using the build-time generated context (tauri.conf.json, assets, etc.).
        .run(tauri::generate_context!())
        // ES: Lanza panic con un mensaje claro si la app no consigue arrancar.
        // EN: Panic with a clear message if the app fails to start.
        .expect("error while running tauri application");
}
