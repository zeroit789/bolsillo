// =============================================================================
// lib.rs — Tauri app setup & native commands / Configuración Tauri y comandos nativos
// -----------------------------------------------------------------------------
// EN: Rust backend of "Bolsillo". Registers the Tauri plugins (opener, dialog,
//     notification) and exposes a single native command used by the frontend to
//     write export files (XLSX/PDF) to disk via the OS save dialog.
// ES: Backend Rust de "Bolsillo". Registra los plugins de Tauri (opener, diálogo,
//     notificaciones) y expone un único comando nativo que usa el frontend para
//     escribir en disco los archivos de exportación (XLSX/PDF) a través del
//     diálogo nativo de "Guardar como".
// -----------------------------------------------------------------------------
// INDEX / ÍNDICE:
//   1. Imports / Importaciones
//   2. guardar_archivo command — write bytes to disk / comando: escribir bytes a disco
//   3. run() — Tauri app bootstrap / arranque de la app Tauri
// =============================================================================

// ── 1. Imports / Importaciones ───────────────────────────────────────────────
// EN: Standard library filesystem module — provides fs::write to dump bytes to a file.
// ES: Módulo de sistema de archivos de la librería estándar — aporta fs::write para
//     volcar bytes en un archivo.
use std::fs;

// ── 2. guardar_archivo command — write bytes to disk / comando: escribir bytes a disco ──
// EN: Native command callable from the frontend (via Tauri invoke). It writes the
//     given raw bytes to the path the user picked with the native save dialog.
//     Used to persist the export files (Excel/PDF) generated in the frontend.
// ES: Comando nativo invocable desde el frontend (vía Tauri invoke). Escribe los
//     bytes recibidos en la ruta que el usuario eligió con el diálogo nativo de
//     guardar. Se usa para persistir los archivos de exportación (Excel/PDF)
//     generados en el frontend.
//
// EN: Parameters → `ruta`: destination file path; `contenido`: raw file bytes.
// ES: Parámetros → `ruta`: ruta de destino del archivo; `contenido`: bytes del archivo.
//
// EN: Returns Ok(()) on success, or Err(String) with the OS error message on failure
//     (the error is mapped to a String so it can cross the Tauri boundary to JS).
// ES: Devuelve Ok(()) si va bien, o Err(String) con el mensaje de error del SO si
//     falla (el error se convierte a String para poder cruzar el puente Tauri a JS).
#[tauri::command]
fn guardar_archivo(ruta: String, contenido: Vec<u8>) -> Result<(), String> {
    // EN: Write all bytes to the path; map any IO error into its String message.
    // ES: Escribe todos los bytes en la ruta; convierte cualquier error de IO en su mensaje String.
    fs::write(&ruta, &contenido).map_err(|e| e.to_string())
}

// ── 3. run() — Tauri app bootstrap / arranque de la app Tauri ─────────────────
// EN: Entry point of the Tauri application. On mobile targets this is also marked
//     as the mobile entry point so the same function boots the app on every platform.
// ES: Punto de entrada de la aplicación Tauri. En destinos móviles también se marca
//     como punto de entrada móvil, de modo que la misma función arranca la app en
//     todas las plataformas.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // EN: Build the Tauri app, register plugins, wire the command handler, then run it.
    // ES: Construye la app Tauri, registra los plugins, conecta el manejador de comandos y la ejecuta.
    tauri::Builder::default()
        // EN: opener plugin — lets the app open URLs / files / folders with the OS default handler.
        // ES: plugin opener — permite abrir URLs / archivos / carpetas con la aplicación por defecto del SO.
        .plugin(tauri_plugin_opener::init())
        // EN: dialog plugin — provides the native "Save as" / file picker dialogs used by the export flow.
        // ES: plugin dialog — provee los diálogos nativos de "Guardar como" / selector de archivos usados en la exportación.
        .plugin(tauri_plugin_dialog::init())
        // EN: notification plugin — lets the app show native OS notifications.
        // ES: plugin notification — permite mostrar notificaciones nativas del SO.
        .plugin(tauri_plugin_notification::init())
        // EN: Register the commands callable from JS; here only guardar_archivo is exposed.
        // ES: Registra los comandos invocables desde JS; aquí solo se expone guardar_archivo.
        .invoke_handler(tauri::generate_handler![guardar_archivo])
        // EN: Run the app using the build-time generated context (tauri.conf.json, assets, etc.).
        // ES: Ejecuta la app usando el contexto generado en build (tauri.conf.json, assets, etc.).
        .run(tauri::generate_context!())
        // EN: Panic with a clear message if the app fails to start.
        // ES: Lanza panic con un mensaje claro si la app no consigue arrancar.
        .expect("error while running tauri application");
}
