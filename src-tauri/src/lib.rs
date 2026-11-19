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

use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use boveda::{Boveda, CopiaElegida, Estado, ReciboEntrada, ReciboSalida};
use directorio::{escribir_atomico_controlado, Directorio, InfoCopia};
use formato::{Bloqueo, ErrorAlmacen};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;

// ── 2. Estado compartido / Shared state ──────────────────────────────────────
// ES: La bóveda vive tras un Mutex (los comandos van de uno en uno: un
//     guardado nunca se cruza con un cambio de PIN) dentro de un Arc, para
//     poder llevarla a un hilo de `spawn_blocking`: Argon2id y la E/S de disco
//     no ocupan los trabajadores del ejecutor asíncrono de Tauri.
// EN: The vault lives behind a Mutex (commands go one at a time: a save never
//     crosses a PIN change) inside an Arc, so it can be taken to a
//     `spawn_blocking` thread: Argon2id and disk I/O do not tie up Tauri's
//     async executor workers.
struct EstadoBoveda(Arc<Mutex<Boveda>>);

type Res<T> = Result<T, String>;

// ES: Pasa un error del almacén a su código de texto. / EN: Maps a store error to its text code.
fn c(e: ErrorAlmacen) -> String {
    e.codigo()
}

// ES: Ejecuta `f` con la bóveda en un hilo de bloqueo. Si un comando anterior
//     entró en pánico se sigue (cada escritura es atómica: nada queda a medias).
// EN: Runs `f` with the vault on a blocking thread. If a previous command
//     panicked it goes on (every write is atomic: nothing is left half-done).
async fn con<T, F>(s: &State<'_, EstadoBoveda>, f: F) -> Res<T>
where
    T: Send + 'static,
    F: FnOnce(&mut Boveda) -> Result<T, ErrorAlmacen> + Send + 'static,
{
    let arc = s.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let mut b = arc.lock().unwrap_or_else(|e| e.into_inner());
        f(&mut b)
    })
    .await
    .map_err(|_| "interno".to_string())?
    .map_err(c)
}

// ── 3. Comandos del almacén / Store commands ─────────────────────────────────
// ES: Estado del almacén para decidir la pantalla de arranque.
// EN: Store state to decide the boot screen.
#[tauri::command]
async fn estado_almacen(s: State<'_, EstadoBoveda>) -> Res<Estado> {
    con(&s, |b| Ok(b.estado())).await
}

// ES: Abre con la credencial (o sin ella si no hay bloqueo) y devuelve los datos.
// EN: Opens with the credential (or without it if there is no lock) and returns the data.
#[tauri::command]
async fn abrir_almacen(s: State<'_, EstadoBoveda>, credencial: Option<String>) -> Res<String> {
    con(&s, move |b| b.abrir(credencial.as_deref())).await
}

// ES: Abre con la clave de recuperación (PIN olvidado).
// EN: Opens with the recovery key (forgotten PIN).
#[tauri::command]
async fn abrir_con_recuperacion(s: State<'_, EstadoBoveda>, clave: String) -> Res<String> {
    con(&s, move |b| b.abrir_con_recuperacion(&clave)).await
}

// ES: Relee y descifra el principal con la clave en memoria.
// EN: Reads back and decrypts the main file with the key in memory.
#[tauri::command]
async fn leer_datos(s: State<'_, EstadoBoveda>) -> Res<String> {
    con(&s, |b| b.leer_datos()).await
}

#[tauri::command]
async fn leer_recibos(s: State<'_, EstadoBoveda>, ids: Vec<String>) -> Res<Vec<ReciboSalida>> {
    con(&s, move |b| b.leer_recibos(&ids)).await
}

// ES: Guarda los datos (JSON) y los recibos nuevos. / EN: Saves the data (JSON) and the new receipts.
#[tauri::command]
async fn guardar_datos(
    s: State<'_, EstadoBoveda>,
    datos: String,
    recibos: Vec<ReciboEntrada>,
) -> Res<()> {
    con(&s, move |b| b.guardar(&datos, &recibos)).await
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
    con(&s, move |b| {
        b.crear(
            &datos,
            &recibos,
            bloqueo,
            credencial.as_deref(),
            reemplazar,
            &origen,
        )
    })
    .await
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
    con(&s, move |b| {
        b.preparar_migracion(&datos, &recibos, bloqueo, credencial.as_deref(), &huella)
    })
    .await
}

#[tauri::command]
async fn leer_migracion(s: State<'_, EstadoBoveda>) -> Res<String> {
    con(&s, |b| b.leer_migracion()).await
}

#[tauri::command]
async fn confirmar_migracion(s: State<'_, EstadoBoveda>) -> Res<()> {
    con(&s, |b| b.confirmar_migracion()).await
}

#[tauri::command]
async fn cancelar_migracion(s: State<'_, EstadoBoveda>) -> Res<()> {
    con(&s, |b| b.cancelar_migracion()).await
}

// ES: Olvida la clave de datos ("Bloquear ahora" y autobloqueo).
// EN: Forgets the data key ("Lock now" and auto-lock).
#[tauri::command]
async fn bloquear_almacen(s: State<'_, EstadoBoveda>) -> Res<()> {
    con(&s, |b| {
        b.bloquear();
        Ok(())
    })
    .await
}

#[tauri::command]
async fn configurar_bloqueo(
    s: State<'_, EstadoBoveda>,
    bloqueo: Bloqueo,
    credencial: String,
) -> Res<String> {
    con(&s, move |b| b.configurar_bloqueo(bloqueo, &credencial)).await
}

#[tauri::command]
async fn quitar_bloqueo(s: State<'_, EstadoBoveda>) -> Res<()> {
    con(&s, |b| b.quitar_bloqueo()).await
}

#[tauri::command]
async fn cambiar_credencial(
    s: State<'_, EstadoBoveda>,
    antigua: Option<String>,
    bloqueo: Bloqueo,
    nueva: String,
) -> Res<()> {
    con(&s, move |b| {
        b.cambiar_credencial(antigua.as_deref(), bloqueo, &nueva)
    })
    .await
}

#[tauri::command]
async fn regenerar_recuperacion(s: State<'_, EstadoBoveda>, credencial: String) -> Res<String> {
    con(&s, move |b| b.regenerar_recuperacion(&credencial)).await
}

#[tauri::command]
async fn rescatar_almacen(s: State<'_, EstadoBoveda>) -> Res<String> {
    con(&s, |b| b.rescatar()).await
}

#[tauri::command]
async fn listar_copias(s: State<'_, EstadoBoveda>) -> Res<Vec<InfoCopia>> {
    con(&s, |b| Ok(b.listar_copias())).await
}

// ES: Abre y descifra una copia automática sin publicarla (el frontend la valida).
// EN: Opens and decrypts an automatic backup without publishing it (the frontend validates it).
#[tauri::command]
async fn probar_copia(
    s: State<'_, EstadoBoveda>,
    nombre: String,
    credencial: Option<String>,
) -> Res<String> {
    con(&s, move |b| b.probar_copia(&nombre, credencial.as_deref())).await
}

// ES: Restaura una copia automática ya comprobada; queda abierta y devuelve sus datos.
// EN: Restores an already checked automatic backup; it is left open and returns its data.
#[tauri::command]
async fn restaurar_copia(
    s: State<'_, EstadoBoveda>,
    nombre: String,
    credencial: Option<String>,
) -> Res<Restaurada> {
    con(&s, move |b| {
        let datos = b.restaurar_copia(&nombre, credencial.as_deref())?;
        Ok(Restaurada {
            datos,
            estado: b.estado(),
        })
    })
    .await
}

// ES: Resultado de restaurar: los datos y el estado ya publicado (así el
//     frontend no necesita otra llamada que pueda fallar).
// EN: Restore result: the data and the already published state (so the
//     frontend needs no other call that could fail).
#[derive(serde::Serialize)]
struct Restaurada {
    datos: String,
    estado: boveda::Estado,
}

// ── 4. Copias cifradas exportadas / Exported encrypted backups ────────────────
// ES: Escribe una exportación en la ruta elegida sin poder caer nunca dentro
//     del almacén: se comprueba la ruta pedida y, ya creado el temporal, su
//     ruta real (por si una unión de directorio cambió entre medias), justo
//     antes de publicarlo.
// EN: Writes an export to the chosen path without ever falling inside the
//     store: the requested path is checked and, once the temporary is created,
//     its real path (in case a directory junction changed in between), right
//     before publishing it.
async fn escribir_exportacion(
    s: &State<'_, EstadoBoveda>,
    ruta: PathBuf,
    bytes: Vec<u8>,
) -> Res<()> {
    let arc = s.0.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let protegido = |p: &Path| {
            let b = arc.lock().unwrap_or_else(|e| e.into_inner());
            b.protegido(p)
        };
        if protegido(&ruta) {
            return Err(c(ErrorAlmacen::DestinoProtegido));
        }
        escribir_atomico_controlado(&ruta, &bytes, std::io::Write::write_all, |tmp| {
            !protegido(tmp)
        })
        .map_err(|e| {
            if e.kind() == std::io::ErrorKind::PermissionDenied
                && e.to_string() == "destino-protegido"
            {
                c(ErrorAlmacen::DestinoProtegido)
            } else {
                format!("io:{e}")
            }
        })
    })
    .await
    .map_err(|_| "interno".to_string())?
}

// ES: Abre el diálogo de guardar en un hilo de bloqueo (los diálogos
//     bloqueantes no pueden ir en el hilo principal ni deben ocupar un
//     trabajador async). None si el usuario cancela.
// EN: Opens the save dialog on a blocking thread (blocking dialogs cannot run
//     on the main thread nor should they tie up an async worker). None if the
//     user cancels.
async fn dialogo_guardar(
    app: AppHandle,
    nombre: String,
    filtro: String,
    exts: Vec<String>,
) -> Res<Option<PathBuf>> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut d = app.dialog().file().set_file_name(nombre);
        if !exts.is_empty() {
            let e: Vec<&str> = exts.iter().map(String::as_str).collect();
            d = d.add_filter(filtro, &e);
        }
        match d.blocking_save_file() {
            None => Ok(None),
            Some(r) => r.into_path().map(Some).map_err(|e| e.to_string()),
        }
    })
    .await
    .map_err(|_| "interno".to_string())?
}

// ES: Cifra la copia con su contraseña, abre el diálogo de guardar desde Rust
//     y la escribe de forma atómica. false si el usuario cancela.
// EN: Encrypts the backup with its password, opens the save dialog from Rust
//     and writes it atomically. false if the user cancels.
#[tauri::command]
async fn exportar_copia_cifrada(
    app: AppHandle,
    s: State<'_, EstadoBoveda>,
    datos: String,
    contrasena: String,
    nombre: String,
) -> Res<bool> {
    let bytes = con(&s, move |b| b.bytes_copia(&datos, &contrasena)).await?;
    let ruta = dialogo_guardar(app, nombre, "Bolsillo".into(), vec!["bolsillo".into()]).await?;
    let Some(ruta) = ruta else { return Ok(false) };
    escribir_exportacion(&s, ruta, bytes).await?;
    Ok(true)
}

// ES: Tope de tamaño de un fichero importado: se lee como mucho esto + 1 byte
//     del fichero ya abierto (no se fía del tamaño de los metadatos).
// EN: Size cap for an imported file: at most this + 1 byte is read from the
//     already open file (the metadata size is not trusted).
const MAX_IMPORTAR: u64 = 512 * 1024 * 1024;

// ES: Abre el diálogo para elegir una copia (.bolsillo o .json), la lee con
//     tope y la clasifica. None si el usuario cancela. La ruta nunca sale de Rust.
// EN: Opens the dialog to pick a backup (.bolsillo or .json), reads it with a
//     cap and classifies it. None if the user cancels. The path never leaves Rust.
#[tauri::command]
async fn elegir_copia(app: AppHandle, s: State<'_, EstadoBoveda>) -> Res<Option<CopiaElegida>> {
    let bytes = tauri::async_runtime::spawn_blocking(move || -> Res<Option<Vec<u8>>> {
        let ruta = app
            .dialog()
            .file()
            .add_filter("Bolsillo", &["bolsillo", "json"])
            .blocking_pick_file();
        let Some(ruta) = ruta else { return Ok(None) };
        let ruta = ruta.into_path().map_err(|e| e.to_string())?;
        let mut b = Vec::new();
        std::fs::File::open(&ruta)
            .and_then(|f| f.take(MAX_IMPORTAR + 1).read_to_end(&mut b))
            .map_err(|e| format!("io:{e}"))?;
        if b.len() as u64 > MAX_IMPORTAR {
            return Err(c(ErrorAlmacen::Danado));
        }
        Ok(Some(b))
    })
    .await
    .map_err(|_| "interno".to_string())??;
    let Some(bytes) = bytes else { return Ok(None) };
    con(&s, move |b| b.elegir_copia(bytes).map(Some)).await
}

#[tauri::command]
async fn descifrar_copia(s: State<'_, EstadoBoveda>, contrasena: String) -> Res<String> {
    con(&s, move |b| b.descifrar_copia(&contrasena)).await
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
async fn guardar_archivo(
    app: AppHandle,
    s: State<'_, EstadoBoveda>,
    request: tauri::ipc::Request<'_>,
) -> Res<bool> {
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
    let exts: Vec<String> = exts.into_iter().map(String::from).collect();
    let bytes = bytes.clone();
    let Some(ruta) = dialogo_guardar(app, nombre, filtro, exts).await? else {
        return Ok(false);
    };
    // ES: Nunca se exporta encima de datos.bolsillo, un recibo o una copia.
    // EN: Never export on top of datos.bolsillo, a receipt or a backup.
    escribir_exportacion(&s, ruta, bytes).await?;
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
        // ES: plugin single-instance — va el PRIMERO (lo pide su documentación):
        //     una segunda instancia no arranca, se enfoca la ventana abierta.
        //     Así dos procesos nunca escriben a la vez en el mismo almacén.
        // EN: single-instance plugin — goes FIRST (its docs require it): a
        //     second instance does not start, the open window gets focus. So
        //     two processes never write to the same store at once.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(v) = app.get_webview_window("main") {
                let _ = v.unminimize();
                let _ = v.set_focus();
            }
        }))
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
            app.manage(EstadoBoveda(Arc::new(Mutex::new(Boveda::new(
                Directorio::new(dir),
            )))));
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
            probar_copia,
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
