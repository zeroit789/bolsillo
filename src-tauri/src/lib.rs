// =============================================================================
// lib.rs — Configuración Tauri y comandos nativos / Tauri app setup & native commands
// -----------------------------------------------------------------------------
// ES: Backend Rust de "Bolsillo". Registra los plugins de Tauri (opener,
//     diálogo, notificaciones) y expone los comandos nativos:
//       - el almacén cifrado en fichero (boveda.rs): estado, abrir, guardar,
//         crear, migrar desde localStorage, bloqueo, recuperación y copias;
//       - las copias cifradas exportadas (diálogo nativo abierto desde Rust);
//       - guardar_archivo: Rust abre el diálogo de guardar y escribe los bytes
//         (el frontend ya no elige rutas).
//     Los datos viven en el directorio de datos de la app
//     (`app.path().app_data_dir()`: en Windows %APPDATA%\<identificador>).
//     Todos los comandos son `async`: Tauri los ejecuta fuera del hilo
//     principal, así que derivar con Argon2id o abrir un diálogo no congela
//     la ventana.
// EN: Rust backend of "Bolsillo". Registers the Tauri plugins (opener,
//     dialog, notification) and exposes the native commands:
//       - the encrypted file store (boveda.rs): state, open, save, create,
//         migrate from localStorage, lock, recovery and backups;
//       - exported encrypted backups (native dialog opened from Rust);
//       - guardar_archivo: Rust opens the save dialog and writes the bytes
//         (the frontend no longer picks paths).
//     The data lives in the app data directory (`app.path().app_data_dir()`:
//     on Windows %APPDATA%\<identifier>). Every command is `async`: Tauri runs
//     them off the main thread, so deriving with Argon2id or opening a dialog
//     does not freeze the window.
// -----------------------------------------------------------------------------
// ÍNDICE / INDEX:
//   1. Módulos e importaciones / Modules & imports
//   2. Estado compartido / Shared state
//   3. Comandos del almacén / Store commands
//   4. Copias cifradas exportadas / Exported encrypted backups
//   5. guardar_archivo — diálogo y escritura / dialog & write
//   6. run() — arranque de la app Tauri / Tauri app bootstrap
// =============================================================================

// ── 1. Módulos e importaciones / Modules & imports ───────────────────────────
mod boveda;
mod cripto;
mod directorio;
mod formato;
mod recuperacion;

use std::sync::{Mutex, MutexGuard};

use boveda::{Boveda, CopiaElegida, Estado, ReciboEntrada, ReciboSalida};
use directorio::{escribir_atomico, Directorio, InfoCopia};
use formato::{Bloqueo, ErrorAlmacen};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

// ── 2. Estado compartido / Shared state ──────────────────────────────────────
// ES: La bóveda vive tras un Mutex: los comandos se ejecutan de uno en uno
//     sobre ella (un guardado nunca se cruza con un cambio de PIN).
// EN: The vault lives behind a Mutex: commands run one at a time on it (a
//     save never crosses a PIN change).
struct EstadoBoveda(Mutex<Boveda>);

type Res<T> = Result<T, String>;

// ES: Bloquea el Mutex (si un comando anterior entró en pánico, se sigue: la
//     bóveda no queda a medias porque cada escritura es atómica).
// EN: Locks the Mutex (if a previous command panicked, it goes on: the vault
//     is never half-written because every write is atomic).
fn bov<'a>(s: &'a State<'_, EstadoBoveda>) -> MutexGuard<'a, Boveda> {
    s.0.lock().unwrap_or_else(|e| e.into_inner())
}

// ES: Pasa un error del almacén a su código de texto. / EN: Maps a store error to its text code.
fn c(e: ErrorAlmacen) -> String {
    e.codigo()
}

// ── 3. Comandos del almacén / Store commands ─────────────────────────────────
// ES: Estado del almacén para decidir la pantalla de arranque.
// EN: Store state to decide the boot screen.
#[tauri::command]
async fn estado_almacen(s: State<'_, EstadoBoveda>) -> Res<Estado> {
    Ok(bov(&s).estado())
}

// ES: Abre con la credencial (o sin ella si no hay bloqueo) y devuelve los datos.
// EN: Opens with the credential (or without it if there is no lock) and returns the data.
#[tauri::command]
async fn abrir_almacen(s: State<'_, EstadoBoveda>, credencial: Option<String>) -> Res<String> {
    bov(&s).abrir(credencial.as_deref()).map_err(c)
}

// ES: Abre con la clave de recuperación (PIN olvidado).
// EN: Opens with the recovery key (forgotten PIN).
#[tauri::command]
async fn abrir_con_recuperacion(s: State<'_, EstadoBoveda>, clave: String) -> Res<String> {
    bov(&s).abrir_con_recuperacion(&clave).map_err(c)
}

// ES: Relee y descifra el principal con la clave en memoria.
// EN: Reads back and decrypts the main file with the key in memory.
#[tauri::command]
async fn leer_datos(s: State<'_, EstadoBoveda>) -> Res<String> {
    bov(&s).leer_datos().map_err(c)
}

#[tauri::command]
async fn leer_recibos(s: State<'_, EstadoBoveda>, ids: Vec<String>) -> Res<Vec<ReciboSalida>> {
    bov(&s).leer_recibos(&ids).map_err(c)
}

// ES: Guarda los datos (JSON) y los recibos nuevos. / EN: Saves the data (JSON) and the new receipts.
#[tauri::command]
async fn guardar_datos(
    s: State<'_, EstadoBoveda>,
    datos: String,
    recibos: Vec<ReciboEntrada>,
) -> Res<()> {
    bov(&s).guardar(&datos, &recibos).map_err(c)
}

// ES: Crea el almacén; devuelve la clave de recuperación si hay bloqueo.
// EN: Creates the store; returns the recovery key if there is a lock.
#[tauri::command]
async fn crear_almacen(
    s: State<'_, EstadoBoveda>,
    datos: String,
    recibos: Vec<ReciboEntrada>,
    bloqueo: Bloqueo,
    credencial: Option<String>,
    reemplazar: bool,
    origen: String,
) -> Res<Option<String>> {
    bov(&s)
        .crear(
            &datos,
            &recibos,
            bloqueo,
            credencial.as_deref(),
            reemplazar,
            &origen,
        )
        .map_err(c)
}

// ES: Migración desde localStorage en tres fases (ver boveda.rs).
// EN: Three-phase migration from localStorage (see boveda.rs).
#[tauri::command]
async fn preparar_migracion(
    s: State<'_, EstadoBoveda>,
    datos: String,
    recibos: Vec<ReciboEntrada>,
    bloqueo: Bloqueo,
    credencial: Option<String>,
    huella: String,
) -> Res<Option<String>> {
    bov(&s)
        .preparar_migracion(&datos, &recibos, bloqueo, credencial.as_deref(), &huella)
        .map_err(c)
}

#[tauri::command]
async fn leer_migracion(s: State<'_, EstadoBoveda>) -> Res<String> {
    bov(&s).leer_migracion().map_err(c)
}

#[tauri::command]
async fn confirmar_migracion(s: State<'_, EstadoBoveda>) -> Res<()> {
    bov(&s).confirmar_migracion().map_err(c)
}

#[tauri::command]
async fn cancelar_migracion(s: State<'_, EstadoBoveda>) -> Res<()> {
    bov(&s).cancelar_migracion().map_err(c)
}

// ES: Olvida la clave de datos ("Bloquear ahora" y autobloqueo).
// EN: Forgets the data key ("Lock now" and auto-lock).
#[tauri::command]
async fn bloquear_almacen(s: State<'_, EstadoBoveda>) -> Res<()> {
    bov(&s).bloquear();
    Ok(())
}

#[tauri::command]
async fn configurar_bloqueo(
    s: State<'_, EstadoBoveda>,
    bloqueo: Bloqueo,
    credencial: String,
) -> Res<String> {
    bov(&s).configurar_bloqueo(bloqueo, &credencial).map_err(c)
}

#[tauri::command]
async fn quitar_bloqueo(s: State<'_, EstadoBoveda>) -> Res<()> {
    bov(&s).quitar_bloqueo().map_err(c)
}

#[tauri::command]
async fn cambiar_credencial(
    s: State<'_, EstadoBoveda>,
    antigua: Option<String>,
    bloqueo: Bloqueo,
    nueva: String,
) -> Res<()> {
    bov(&s)
        .cambiar_credencial(antigua.as_deref(), bloqueo, &nueva)
        .map_err(c)
}

#[tauri::command]
async fn regenerar_recuperacion(s: State<'_, EstadoBoveda>, credencial: String) -> Res<String> {
    bov(&s).regenerar_recuperacion(&credencial).map_err(c)
}

#[tauri::command]
async fn rescatar_almacen(s: State<'_, EstadoBoveda>) -> Res<String> {
    bov(&s).rescatar().map_err(c)
}

#[tauri::command]
async fn listar_copias(s: State<'_, EstadoBoveda>) -> Res<Vec<InfoCopia>> {
    Ok(bov(&s).listar_copias())
}

#[tauri::command]
async fn restaurar_copia(s: State<'_, EstadoBoveda>, nombre: String) -> Res<()> {
    bov(&s).restaurar_copia(&nombre).map_err(c)
}

// ── 4. Copias cifradas exportadas / Exported encrypted backups ────────────────
// ES: Cifra la copia con su contraseña, abre el diálogo de guardar desde Rust
//     y la escribe de forma atómica. false si el usuario cancela.
//     `blocking_save_file` no se debe usar en el hilo principal: los comandos
//     async corren fuera de él (doc. de tauri-plugin-dialog 2.8.4).
// EN: Encrypts the backup with its password, opens the save dialog from Rust
//     and writes it atomically. false if the user cancels.
//     `blocking_save_file` must not be used on the main thread: async
//     commands run outside it (tauri-plugin-dialog 2.8.4 docs).
#[tauri::command]
async fn exportar_copia_cifrada(
    app: AppHandle,
    s: State<'_, EstadoBoveda>,
    datos: String,
    contrasena: String,
    nombre: String,
) -> Res<bool> {
    let bytes = bov(&s).bytes_copia(&datos, &contrasena).map_err(c)?;
    let ruta = app
        .dialog()
        .file()
        .add_filter("Bolsillo", &["bolsillo"])
        .set_file_name(nombre)
        .blocking_save_file();
    let Some(ruta) = ruta else { return Ok(false) };
    let ruta = ruta.into_path().map_err(|e| e.to_string())?;
    escribir_atomico(&ruta, &bytes).map_err(|e| format!("io:{e}"))?;
    Ok(true)
}

// ES: Tope de tamaño de un fichero importado (evita leer algo absurdo).
// EN: Size cap for an imported file (avoids reading something absurd).
const MAX_IMPORTAR: u64 = 512 * 1024 * 1024;

// ES: Abre el diálogo para elegir una copia (.bolsillo o .json) y la clasifica.
//     None si el usuario cancela. La ruta nunca sale de Rust.
// EN: Opens the dialog to pick a backup (.bolsillo or .json) and classifies
//     it. None if the user cancels. The path never leaves Rust.
#[tauri::command]
async fn elegir_copia(app: AppHandle, s: State<'_, EstadoBoveda>) -> Res<Option<CopiaElegida>> {
    let ruta = app
        .dialog()
        .file()
        .add_filter("Bolsillo", &["bolsillo", "json"])
        .blocking_pick_file();
    let Some(ruta) = ruta else { return Ok(None) };
    let ruta = ruta.into_path().map_err(|e| e.to_string())?;
    let tam = std::fs::metadata(&ruta)
        .map_err(|e| format!("io:{e}"))?
        .len();
    if tam > MAX_IMPORTAR {
        return Err(c(ErrorAlmacen::Danado));
    }
    let bytes = std::fs::read(&ruta).map_err(|e| format!("io:{e}"))?;
    bov(&s).elegir_copia(bytes).map(Some).map_err(c)
}

#[tauri::command]
async fn descifrar_copia(s: State<'_, EstadoBoveda>, contrasena: String) -> Res<String> {
    bov(&s).descifrar_copia(&contrasena).map_err(c)
}

// ── 5. guardar_archivo — diálogo y escritura / dialog & write ─────────────────
// ES: Decodifica el %XX de una cabecera (el frontend usa encodeURIComponent
//     porque las cabeceras HTTP solo admiten ASCII).
// EN: Decodes the %XX of a header (the frontend uses encodeURIComponent
//     because HTTP headers only allow ASCII).
fn decodificar(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            let hex = std::str::from_utf8(&b[i + 1..i + 3]).unwrap_or("");
            if let Ok(v) = u8::from_str_radix(hex, 16) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

// ES: Exportaciones (XLSX, PDF, CSV, JSON): el cuerpo son los bytes en crudo
//     (sin pasar por un array JSON de números) y las cabeceras traen el nombre
//     sugerido y el filtro. Rust abre el diálogo y escribe; el frontend ya no
//     puede pedir escribir en una ruta cualquiera. false si se cancela.
// EN: Exports (XLSX, PDF, CSV, JSON): the body is the raw bytes (without going
//     through a JSON array of numbers) and the headers carry the suggested
//     name and the filter. Rust opens the dialog and writes; the frontend can
//     no longer ask to write to an arbitrary path. false if cancelled.
#[tauri::command]
async fn guardar_archivo(app: AppHandle, request: tauri::ipc::Request<'_>) -> Res<bool> {
    let tauri::ipc::InvokeBody::Raw(bytes) = request.body() else {
        return Err("cuerpo".into());
    };
    let cab = |k: &str| {
        request
            .headers()
            .get(k)
            .and_then(|v| v.to_str().ok())
            .map(decodificar)
            .unwrap_or_default()
    };
    let nombre = cab("x-nombre");
    let filtro = cab("x-filtro");
    let ext = cab("x-extensiones");
    let exts: Vec<&str> = ext.split(',').filter(|e| !e.is_empty()).collect();
    let mut dialogo = app.dialog().file().set_file_name(nombre);
    if !exts.is_empty() {
        dialogo = dialogo.add_filter(filtro, &exts);
    }
    let Some(ruta) = dialogo.blocking_save_file() else {
        return Ok(false);
    };
    let ruta = ruta.into_path().map_err(|e| e.to_string())?;
    escribir_atomico(&ruta, bytes).map_err(|e| format!("io:{e}"))?;
    Ok(true)
}

// ── 6. run() — arranque de la app Tauri / Tauri app bootstrap ─────────────────
// ES: Punto de entrada de la aplicación Tauri. En destinos móviles también se
//     marca como punto de entrada móvil.
// EN: Entry point of the Tauri application. On mobile targets this is also
//     marked as the mobile entry point.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // ES: plugin opener — abrir URLs/archivos con la app por defecto del SO.
        // EN: opener plugin — open URLs/files with the OS default handler.
        .plugin(tauri_plugin_opener::init())
        // ES: plugin dialog — diálogos nativos, ahora solo usados desde Rust.
        // EN: dialog plugin — native dialogs, now only used from Rust.
        .plugin(tauri_plugin_dialog::init())
        // ES: plugin notification — notificaciones nativas del SO.
        // EN: notification plugin — native OS notifications.
        .plugin(tauri_plugin_notification::init())
        // ES: La bóveda apunta al directorio de datos de la app (se crea al escribir).
        // EN: The vault points to the app data directory (created on first write).
        .setup(|app| {
            let dir = app.path().app_data_dir()?;
            app.manage(EstadoBoveda(Mutex::new(Boveda::new(Directorio::new(dir)))));
            Ok(())
        })
        // ES: Comandos invocables desde JS. / EN: Commands callable from JS.
        .invoke_handler(tauri::generate_handler![
            estado_almacen,
            abrir_almacen,
            abrir_con_recuperacion,
            leer_datos,
            leer_recibos,
            guardar_datos,
            crear_almacen,
            preparar_migracion,
            leer_migracion,
            confirmar_migracion,
            cancelar_migracion,
            bloquear_almacen,
            configurar_bloqueo,
            quitar_bloqueo,
            cambiar_credencial,
            regenerar_recuperacion,
            rescatar_almacen,
            listar_copias,
            restaurar_copia,
            exportar_copia_cifrada,
            elegir_copia,
            descifrar_copia,
            guardar_archivo
        ])
        // ES: Ejecuta la app con el contexto generado en build.
        // EN: Run the app with the build-time generated context.
        .run(tauri::generate_context!())
        // ES: Pánico con mensaje claro si la app no arranca.
        // EN: Panic with a clear message if the app fails to start.
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::decodificar;

    #[test]
    fn decodifica_cabeceras() {
        assert_eq!(decodificar("Bolsillo%20a%C3%B1o.xlsx"), "Bolsillo año.xlsx");
        assert_eq!(decodificar("100%"), "100%");
        assert_eq!(decodificar("a%zz"), "a%zz");
    }
}
