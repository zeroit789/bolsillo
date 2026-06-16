// =============================================================================
// main.rs — Desktop binary entry point / Punto de entrada del binario de escritorio
// -----------------------------------------------------------------------------
// EN: Thin desktop entry point. Its only job is to call into the shared library
//     crate (`bolsillo_lib::run`), which holds all the real app setup. Keeping
//     main tiny lets the same logic be reused across desktop and mobile targets.
// ES: Punto de entrada de escritorio minimalista. Su única tarea es llamar a la
//     crate de librería compartida (`bolsillo_lib::run`), que contiene toda la
//     configuración real de la app. Mantener main mínimo permite reutilizar la
//     misma lógica en destinos de escritorio y móvil.
// -----------------------------------------------------------------------------
// INDEX / ÍNDICE:
//   1. Windows subsystem attribute / atributo del subsistema de Windows
//   2. main() — delegate to bolsillo_lib::run / delega en bolsillo_lib::run
// =============================================================================

// ── 1. Windows subsystem attribute / atributo del subsistema de Windows ───────
// EN: In release builds on Windows, target the "windows" subsystem so no extra
//     console window pops up behind the GUI. DO NOT REMOVE — without it the app
//     opens a stray console window in production.
// ES: En builds de release en Windows, apunta al subsistema "windows" para que no
//     aparezca una ventana de consola extra detrás de la GUI. NO ELIMINAR — sin
//     esto la app abre una ventana de consola sobrante en producción.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// ── 2. main() — delegate to bolsillo_lib::run / delega en bolsillo_lib::run ────
// EN: Process entry point. Delegates immediately to the library's run() function,
//     which builds and launches the Tauri application.
// ES: Punto de entrada del proceso. Delega de inmediato en la función run() de la
//     librería, que construye y lanza la aplicación Tauri.
fn main() {
    // EN: Hand control to the shared library; all setup lives in lib.rs.
    // ES: Cede el control a la librería compartida; toda la configuración vive en lib.rs.
    bolsillo_lib::run()
}
