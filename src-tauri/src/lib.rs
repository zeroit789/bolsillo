// ===========================================================================
// Backend Rust de Bolsillo.
// Registra los plugins (diálogo de guardar, notificaciones) y expone un
// comando para escribir archivos en disco (lo usa la exportación a XLSX/PDF).
// ===========================================================================

use std::fs;

// Guarda bytes en la ruta indicada (la elige el usuario con el diálogo nativo).
// Se usa para volcar los archivos de exportación (Excel/PDF) generados en el frontend.
#[tauri::command]
fn guardar_archivo(ruta: String, contenido: Vec<u8>) -> Result<(), String> {
    fs::write(&ruta, &contenido).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![guardar_archivo])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
