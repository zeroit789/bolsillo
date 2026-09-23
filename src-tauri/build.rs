// ES: Script de build de Cargo. Tauri genera aquí el contexto de la app (config,
//     iconos, permisos) antes de compilar el crate.
// EN: Cargo build script. Tauri generates the app context here (config, icons,
//     permissions) before the crate is compiled.
fn main() {
    tauri_build::build()
}
