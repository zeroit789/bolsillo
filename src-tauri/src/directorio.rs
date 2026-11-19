// =============================================================================
// directorio.rs — Ficheros del almacén en disco / Store files on disk
// -----------------------------------------------------------------------------
// ES: Todo lo que toca el disco dentro del directorio de datos de la app:
//       datos.bolsillo            fichero principal (cifrado, ver formato.rs)
//       datos.bolsillo.migrando   fichero de una migración aún sin confirmar
//       almacen.marca             marca duradera: "aquí ya hubo un almacén"
//       copias/reciente-<s>.bolsillo   las 10 últimas, una cada ≥ 10 min
//       copias/diaria-AAAA-MM-DD.bolsillo  una por día (UTC), las 30 últimas
//       copias/antes-<s>.bolsillo  el principal antes de restaurar una copia
//       rescate/datos-<s>.bolsillo ficheros ilegibles apartados (nunca se borran)
//       recibos/<dek_id>/<id>.rec  recibos cifrados, uno por fichero
//     La escritura es atómica: se escribe un .tmp, se vuelca a disco (fsync) y
//     se renombra encima. `std::fs::rename` sustituye el destino también en
//     Windows (MoveFileExW con sustitución, o SetFileInformationByHandle con
//     FileRenameInfoEx; https://doc.rust-lang.org/std/fs/fn.rename.html,
//     consultada el 19-11-2026; lo comprueba un test).
// EN: Everything that touches the disk inside the app data directory (see the
//     layout above). Writing is atomic: a .tmp is written, flushed to disk
//     (fsync) and renamed on top. `std::fs::rename` replaces the target on
//     Windows too (MoveFileExW with replacement, or SetFileInformationByHandle
//     with FileRenameInfoEx; https://doc.rust-lang.org/std/fs/fn.rename.html,
//     checked on 2026-11-19; a test checks it).
// -----------------------------------------------------------------------------
// ÍNDICE / INDEX:
//   1. Nombres y fechas / Names & dates
//   2. Escritura atómica / Atomic write
//   3. Fichero principal y marca / Main file & marker
//   4. Copias automáticas / Automatic backups
//   5. Rescate / Rescue
//   6. Recibos / Receipts
//   7. Tests / Tests
// =============================================================================

use std::fs::{self, File};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

use serde::Serialize;

// ── 1. Nombres y fechas / Names & dates ──────────────────────────────────────
pub const PRINCIPAL: &str = "datos.bolsillo";
pub const MIGRANDO: &str = "datos.bolsillo.migrando";
pub const MARCA: &str = "almacen.marca";
const COPIAS: &str = "copias";
const RESCATE: &str = "rescate";
const RECIBOS: &str = "recibos";

// ES: Cuántas copias se guardan y cada cuánto. / EN: How many backups are kept and how often.
pub const COPIAS_RECIENTES: usize = 10;
pub const COPIAS_DIARIAS: usize = 30;
pub const SEGUNDOS_ENTRE_RECIENTES: u64 = 600;

// ES: Fecha UTC (año, mes, día) de unos segundos Unix (algoritmo "civil from
//     days" de Howard Hinnant). Evita una dependencia solo para esto.
// EN: UTC date (year, month, day) of some Unix seconds (Howard Hinnant's
//     "civil from days" algorithm). Avoids a dependency just for this.
pub fn fecha_utc(segundos: u64) -> (i64, u32, u32) {
    let z = (segundos / 86_400) as i64 + 719_468;
    let era = z.div_euclid(146_097);
    let doe = z.rem_euclid(146_097);
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = if mp < 10 { mp + 3 } else { mp - 9 } as u32;
    let y = yoe + era * 400 + i64::from(m <= 2);
    (y, m, d)
}

// ES: "AAAA-MM-DD" UTC. / EN: "YYYY-MM-DD" UTC.
pub fn dia_utc(segundos: u64) -> String {
    let (y, m, d) = fecha_utc(segundos);
    format!("{y:04}-{m:02}-{d:02}")
}

// ES: Nombre de copia válido: sin rutas, con un prefijo y extensión conocidos.
// EN: Valid backup name: no paths, with a known prefix and extension.
pub fn nombre_copia_valido(n: &str) -> bool {
    let partes_ok = n
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.');
    partes_ok
        && !n.contains("..")
        && n.ends_with(".bolsillo")
        && (n.starts_with("reciente-") || n.starts_with("diaria-") || n.starts_with("antes-"))
}

// ES: Id de recibo válido (sirve como nombre de fichero sin riesgo).
// EN: Valid receipt id (safe to use as a file name).
//     Solo minúsculas, cifras y guiones: en Windows los nombres de fichero no
//     distinguen mayúsculas, así que "A" y "a" acabarían en el mismo fichero.
// EN: Only lowercase, digits and hyphens: on Windows file names are
//     case-insensitive, so "A" and "a" would end up in the same file.
pub fn id_recibo_valido(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 64
        && id
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
}

// ES: Información de una copia automática para la lista del frontend.
// EN: Information about an automatic backup for the frontend list.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct InfoCopia {
    pub nombre: String,
    pub bytes: u64,
    pub segundos: u64,
    // ES: "ninguno" | "pin" | "password" leído de la cabecera (None si no se lee)
    // EN: "ninguno" | "pin" | "password" read from the header (None if unreadable)
    pub bloqueo: Option<String>,
}

// ES: Tipo de bloqueo de una copia leyendo solo el principio del fichero (la
//     cabecera va antes que los datos en el JSON), sin cargarlo entero.
// EN: Lock type of a backup reading only the start of the file (the header
//     comes before the data in the JSON), without loading all of it.
fn bloqueo_de(ruta: &Path) -> Option<String> {
    use std::io::Read;
    let mut b = vec![0u8; 512];
    let n = File::open(ruta).ok()?.read(&mut b).ok()?;
    let t = String::from_utf8_lossy(&b[..n]);
    let i = t.find("\"bloqueo\":\"")? + 11;
    let fin = t[i..].find('"')?;
    Some(t[i..i + fin].to_string())
}

// ── 2. Escritura atómica / Atomic write ───────────────────────────────────────
// ES: Escribe `bytes` en `ruta` sin dejar nunca un fichero a medias: si algo
//     falla, el fichero anterior sigue intacto.
// EN: Writes `bytes` to `ruta` never leaving a half-written file: if anything
//     fails, the previous file stays intact.
pub fn escribir_atomico(ruta: &Path, bytes: &[u8]) -> io::Result<()> {
    escribir_atomico_con(ruta, bytes, |f, b| f.write_all(b))
}

// ES: Igual, con la escritura inyectable (los tests simulan un fallo a mitad).
// EN: Same, with an injectable write (tests simulate a failure halfway).
pub fn escribir_atomico_con<F>(ruta: &Path, bytes: &[u8], escribir: F) -> io::Result<()>
where
    F: FnOnce(&mut File, &[u8]) -> io::Result<()>,
{
    escribir_atomico_controlado(ruta, bytes, escribir, |_| true)
}

// ES: Escritura atómica con un control justo antes de publicar: `permitido`
//     recibe la ruta real del temporal ya creado (para exportaciones: que no
//     haya acabado dentro del almacén). El temporal se crea en exclusiva
//     (create_new): nunca trunca un fichero que ya exista.
// EN: Atomic write with a check right before publishing: `permitido` gets the
//     real path of the already created temporary (for exports: that it did not
//     end up inside the store). The temporary is created exclusively
//     (create_new): it never truncates an existing file.
pub fn escribir_atomico_controlado<F, P>(
    ruta: &Path,
    bytes: &[u8],
    escribir: F,
    permitido: P,
) -> io::Result<()>
where
    F: FnOnce(&mut File, &[u8]) -> io::Result<()>,
    P: FnOnce(&Path) -> bool,
{
    if let Some(padre) = ruta.parent() {
        fs::create_dir_all(padre)?;
    }
    // ES: Nombre temporal único (dos escrituras nunca comparten el mismo .tmp).
    // EN: Unique temporary name (two writes never share the same .tmp).
    let unico: u64 = crate::cripto::aleatorio::<8>()
        .map(u64::from_le_bytes)
        .unwrap_or(0);
    let mut tmp = ruta.as_os_str().to_owned();
    tmp.push(format!(".{unico:016x}.tmp"));
    let tmp = PathBuf::from(tmp);
    let resultado = (|| {
        let mut f = File::create_new(&tmp)?;
        escribir(&mut f, bytes)?;
        f.sync_all()?;
        drop(f);
        if !permitido(&tmp) {
            return Err(io::Error::new(
                io::ErrorKind::PermissionDenied,
                "destino-protegido",
            ));
        }
        fs::rename(&tmp, ruta)
    })();
    if resultado.is_err() {
        // ES: El .tmp a medias se quita (es nuestro, nunca el original).
        // EN: The half-written .tmp is removed (it is ours, never the original).
        let _ = fs::remove_file(&tmp);
    }
    resultado
}

// ES: Directorio de datos de la app. / EN: App data directory.
#[derive(Debug, Clone)]
pub struct Directorio {
    raiz: PathBuf,
}

impl Directorio {
    pub fn new(raiz: PathBuf) -> Self {
        Directorio { raiz }
    }

    pub fn ruta(&self, nombre: &str) -> PathBuf {
        self.raiz.join(nombre)
    }

    // ── 3. Fichero principal y marca / Main file & marker ─────────────────────
    // ES: Lee un fichero de la raíz; None si no existe.
    // EN: Reads a file of the root; None if it does not exist.
    pub fn leer(&self, nombre: &str) -> io::Result<Option<Vec<u8>>> {
        match fs::read(self.ruta(nombre)) {
            Ok(b) => Ok(Some(b)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    pub fn existe(&self, nombre: &str) -> bool {
        self.ruta(nombre).exists()
    }

    // ES: Escribe un fichero de la raíz de forma atómica.
    // EN: Atomically writes a file of the root.
    pub fn escribir(&self, nombre: &str, bytes: &[u8]) -> io::Result<()> {
        escribir_atomico(&self.ruta(nombre), bytes)
    }

    // ES: Publica `de` como `a` SIN sustituir: crea un enlace duro (falla con
    //     AlreadyExists si `a` ya existe, de forma atómica) y quita el nombre
    //     viejo. Así una migración nunca pisa un principal aparecido entre medias.
    // EN: Publishes `de` as `a` WITHOUT replacing: creates a hard link (fails
    //     with AlreadyExists if `a` already exists, atomically) and removes the
    //     old name. So a migration never overwrites a main file that appeared
    //     in between.
    pub fn publicar_sin_reemplazo(&self, de: &str, a: &str) -> io::Result<()> {
        fs::hard_link(self.ruta(de), self.ruta(a))?;
        fs::remove_file(self.ruta(de))
    }

    // ES: ¿Hay algo en copias/ o rescate/? (señal de que ya hubo un almacén).
    // EN: Is there anything in copias/ or rescate/? (sign that a store existed).
    pub fn hay_copias(&self) -> bool {
        !self.listar_copias().is_empty()
    }
    // ES: Solo cuentan los datos apartados ("datos-…"); una migración
    //     cancelada ("migracion-…") no indica que hubiera un almacén.
    // EN: Only moved-aside data counts ("datos-…"); a cancelled migration
    //     ("migracion-…") does not mean there was a store.
    pub fn hay_rescate(&self) -> bool {
        fs::read_dir(self.raiz.join(RESCATE))
            .into_iter()
            .flatten()
            .flatten()
            .any(|e| e.file_name().to_string_lossy().starts_with("datos-"))
    }

    // ── 4. Copias automáticas / Automatic backups ─────────────────────────────
    // ES: Lista las copias (más nueva primero), con su fecha de modificación.
    // EN: Lists the backups (newest first), with their modification date.
    pub fn listar_copias(&self) -> Vec<InfoCopia> {
        let mut v: Vec<InfoCopia> = fs::read_dir(self.raiz.join(COPIAS))
            .into_iter()
            .flatten()
            .flatten()
            .filter_map(|e| {
                let nombre = e.file_name().into_string().ok()?;
                if !nombre_copia_valido(&nombre) {
                    return None;
                }
                let meta = e.metadata().ok()?;
                let segundos = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                let bloqueo = bloqueo_de(&e.path());
                Some(InfoCopia {
                    nombre,
                    bytes: meta.len(),
                    segundos,
                    bloqueo,
                })
            })
            .collect();
        v.sort_by(|a, b| b.nombre.cmp(&a.nombre));
        v
    }

    pub fn leer_copia(&self, nombre: &str) -> io::Result<Vec<u8>> {
        if !nombre_copia_valido(nombre) {
            return Err(io::Error::new(io::ErrorKind::InvalidInput, "nombre"));
        }
        fs::read(self.raiz.join(COPIAS).join(nombre))
    }

    pub fn escribir_copia(&self, nombre: &str, bytes: &[u8]) -> io::Result<()> {
        escribir_atomico(&self.raiz.join(COPIAS).join(nombre), bytes)
    }

    // ES: Nombres de las copias de un tipo, ordenados del más viejo al más nuevo.
    // EN: Names of the backups of one kind, sorted oldest to newest.
    fn copias_con_prefijo(&self, prefijo: &str) -> Vec<String> {
        let mut v: Vec<String> = self
            .listar_copias()
            .into_iter()
            .map(|c| c.nombre)
            .filter(|n| n.starts_with(prefijo))
            .collect();
        v.sort();
        v
    }

    // ES: Tras escribir el principal: copia "reciente" si la última tiene ≥ 10
    //     min (se quedan 10) y "diaria" si hoy (UTC) no hay (se quedan 30). Las
    //     sobrantes más viejas se borran: es la rotación. "antes-" nunca rota.
    //     Los segundos van con 12 cifras para que el orden de texto sea el de fecha.
    // EN: After writing the main file: a "recent" copy if the last one is
    //     ≥ 10 min old (10 are kept) and a "daily" one if there is none today
    //     (UTC) (30 are kept). The oldest leftovers are deleted: that is the
    //     rotation. "antes-" never rotates. Seconds use 12 digits so text order
    //     matches date order.
    pub fn rotar_copias(&self, principal: &[u8], ahora: u64) -> io::Result<()> {
        let recientes = self.copias_con_prefijo("reciente-");
        let ultima = recientes.last().and_then(|n| {
            n.trim_start_matches("reciente-")
                .trim_end_matches(".bolsillo")
                .parse::<u64>()
                .ok()
        });
        if ultima.is_none_or(|u| ahora.saturating_sub(u) >= SEGUNDOS_ENTRE_RECIENTES) {
            self.escribir_copia(&format!("reciente-{ahora:012}.bolsillo"), principal)?;
        }
        let diaria = format!("diaria-{}.bolsillo", dia_utc(ahora));
        if !self.raiz.join(COPIAS).join(&diaria).exists() {
            self.escribir_copia(&diaria, principal)?;
        }
        self.podar("reciente-", COPIAS_RECIENTES)?;
        self.podar("diaria-", COPIAS_DIARIAS)
    }

    // ES: Deja solo las `max` copias más nuevas de un tipo. / EN: Keeps only the `max` newest backups of a kind.
    fn podar(&self, prefijo: &str, max: usize) -> io::Result<()> {
        let v = self.copias_con_prefijo(prefijo);
        if v.len() > max {
            for n in &v[..v.len() - max] {
                fs::remove_file(self.raiz.join(COPIAS).join(n))?;
            }
        }
        Ok(())
    }

    // ── 5. Rescate / Rescue ───────────────────────────────────────────────────
    // ES: Aparta un fichero de la raíz a rescate/ sin pisar nada: copiándolo
    //     (`mover = false`) o renombrándolo (`mover = true`, deja libre el
    //     nombre). Devuelve el nombre en rescate/.
    // EN: Moves a root file aside to rescate/ without overwriting anything:
    //     copying it (`mover = false`) or renaming it (`mover = true`, frees the
    //     name). Returns the name in rescate/.
    pub fn rescatar(&self, nombre: &str, mover: bool, ahora: u64) -> io::Result<String> {
        self.rescatar_como(nombre, mover, ahora, "datos")
    }

    // ES: Igual, con el prefijo del nombre en rescate/ ("datos" o "migracion").
    // EN: Same, with the name prefix in rescate/ ("datos" or "migracion").
    pub fn rescatar_como(
        &self,
        nombre: &str,
        mover: bool,
        ahora: u64,
        prefijo: &str,
    ) -> io::Result<String> {
        let dir = self.raiz.join(RESCATE);
        fs::create_dir_all(&dir)?;
        // ES: Al copiar, primero un temporal propio con el contenido completo.
        // EN: When copying, first an own temporary with the full content.
        let origen = if mover {
            self.ruta(nombre)
        } else {
            let tmp = dir.join(format!(".{prefijo}-{ahora:012}.tmp"));
            let _ = fs::remove_file(&tmp);
            escribir_atomico(&tmp, &fs::read(self.ruta(nombre))?)?;
            tmp
        };
        // ES: Se publica con un enlace duro, que falla si el nombre ya existe:
        //     así nunca se pisa un rescate, ni siquiera en una carrera.
        // EN: It is published with a hard link, which fails if the name
        //     already exists: so a rescue is never overwritten, not even in a race.
        let base = format!("{prefijo}-{ahora:012}");
        for n in 1..10_000 {
            let destino = if n == 1 {
                format!("{base}.bolsillo")
            } else {
                format!("{base}-{n}.bolsillo")
            };
            match fs::hard_link(&origen, dir.join(&destino)) {
                Ok(()) => {
                    fs::remove_file(&origen)?;
                    return Ok(format!("{RESCATE}/{destino}"));
                }
                Err(e) if e.kind() == io::ErrorKind::AlreadyExists => continue,
                Err(e) => return Err(e),
            }
        }
        Err(io::Error::other("sin nombre libre"))
    }

    // ── 6. Recibos / Receipts ─────────────────────────────────────────────────
    fn ruta_recibo(&self, dek_id: &str, id: &str) -> PathBuf {
        self.raiz
            .join(RECIBOS)
            .join(dek_id)
            .join(format!("{id}.rec"))
    }

    // ES: Los recibos no cambian nunca (un recibo nuevo lleva id nuevo), así que
    //     solo se escriben si faltan o si el que hay no se descifra o no
    //     coincide, y nunca se borran: las copias viejas siguen encontrando los suyos.
    // EN: Receipts never change (a new receipt gets a new id), so they are only
    //     written if missing or if the existing one does not decrypt or match,
    //     and never deleted: old backups still find theirs.
    pub fn escribir_recibo(&self, dek_id: &str, id: &str, bytes: &[u8]) -> io::Result<()> {
        escribir_atomico(&self.ruta_recibo(dek_id, id), bytes)
    }

    pub fn leer_recibo(&self, dek_id: &str, id: &str) -> io::Result<Option<Vec<u8>>> {
        match fs::read(self.ruta_recibo(dek_id, id)) {
            Ok(b) => Ok(Some(b)),
            Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(e),
        }
    }

    // ES: Ids de los recibos guardados con una DEK. / EN: Ids of the receipts stored with a DEK.
    //     Si la carpeta no existe no hay recibos; cualquier otro error se
    //     devuelve (una rotación no debe seguir sin ver todos los recibos).
    // EN: If the folder does not exist there are no receipts; any other error
    //     is returned (a rotation must not go on without seeing every receipt).
    pub fn ids_recibos(&self, dek_id: &str) -> io::Result<Vec<String>> {
        let lector = match fs::read_dir(self.raiz.join(RECIBOS).join(dek_id)) {
            Ok(l) => l,
            Err(e) if e.kind() == io::ErrorKind::NotFound => return Ok(Vec::new()),
            Err(e) => return Err(e),
        };
        let mut ids = Vec::new();
        for e in lector {
            let n = e?.file_name().into_string().unwrap_or_default();
            if let Some(id) = n.strip_suffix(".rec") {
                if id_recibo_valido(id) {
                    ids.push(id.to_string());
                }
            }
        }
        Ok(ids)
    }

    // ES: Rutas de todos los .bolsillo de copias/ y rescate/ (para reenvolverlos).
    // EN: Paths of every .bolsillo in copias/ and rescate/ (to rewrap them).
    pub fn ficheros_con_dek(&self) -> Vec<PathBuf> {
        [COPIAS, RESCATE]
            .iter()
            .flat_map(|d| {
                fs::read_dir(self.raiz.join(d))
                    .into_iter()
                    .flatten()
                    .flatten()
            })
            .map(|e| e.path())
            .filter(|p| p.extension().is_some_and(|x| x == "bolsillo"))
            .collect()
    }

    // ES: Nombre de copia que no existe todavía ("antes-<s>[-n].bolsillo").
    // EN: Backup name that does not exist yet ("antes-<s>[-n].bolsillo").
    pub fn nombre_copia_libre(&self, prefijo: &str, ahora: u64) -> String {
        let base = format!("{prefijo}-{ahora:012}");
        let mut nombre = format!("{base}.bolsillo");
        let mut n = 2;
        while self.raiz.join(COPIAS).join(&nombre).exists() {
            nombre = format!("{base}-{n}.bolsillo");
            n += 1;
        }
        nombre
    }

    // ES: ¿La ruta cae dentro del directorio de datos? Se compara con rutas
    //     canónicas (el fichero puede no existir aún: se canoniza su carpeta).
    //     Así una exportación nunca puede pisar datos.bolsillo ni un recibo.
    // EN: Does the path fall inside the data directory? Canonical paths are
    //     compared (the file may not exist yet: its folder is canonicalized).
    //     So an export can never overwrite datos.bolsillo or a receipt.
    //     Falla cerrada: si la ruta no se puede resolver, se trata como
    //     protegida. (Si la raíz aún no existe, nada puede caer dentro.)
    // EN: Fails closed: if the path cannot be resolved, it is treated as
    //     protected. (If the root does not exist yet, nothing can fall inside.)
    pub fn contiene(&self, ruta: &Path) -> bool {
        let Ok(raiz) = fs::canonicalize(&self.raiz) else {
            return false;
        };
        let resolver = if ruta.exists() {
            ruta
        } else {
            ruta.parent().unwrap_or(ruta)
        };
        match fs::canonicalize(resolver) {
            Ok(p) => p.starts_with(&raiz),
            Err(_) => true,
        }
    }
}

// ── 7. Tests / Tests ──────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rename_sustituye_en_este_sistema() {
        let t = tempfile::tempdir().unwrap();
        let a = t.path().join("a");
        let b = t.path().join("b");
        fs::write(&a, b"nuevo").unwrap();
        fs::write(&b, b"viejo").unwrap();
        fs::rename(&a, &b).unwrap();
        assert_eq!(fs::read(&b).unwrap(), b"nuevo");
    }

    #[test]
    fn fallo_a_mitad_deja_el_original_intacto() {
        let t = tempfile::tempdir().unwrap();
        let r = t.path().join(PRINCIPAL);
        escribir_atomico(&r, b"original").unwrap();
        let e = escribir_atomico_con(&r, b"contenido-nuevo-largo", |f, b| {
            f.write_all(&b[..5])?;
            Err(io::Error::other("disco lleno"))
        });
        assert!(e.is_err());
        assert_eq!(fs::read(&r).unwrap(), b"original");
        let restos = fs::read_dir(t.path())
            .unwrap()
            .filter(|e| {
                e.as_ref()
                    .unwrap()
                    .file_name()
                    .to_string_lossy()
                    .ends_with(".tmp")
            })
            .count();
        assert_eq!(restos, 0);
        escribir_atomico(&r, b"siguiente").unwrap();
        assert_eq!(fs::read(&r).unwrap(), b"siguiente");
    }

    #[test]
    fn fechas_utc() {
        assert_eq!(dia_utc(0), "1970-01-01");
        assert_eq!(dia_utc(951_782_400), "2000-02-29");
        assert_eq!(dia_utc(1_795_046_400), "2026-11-19");
    }

    #[test]
    fn copias_rotativas() {
        let t = tempfile::tempdir().unwrap();
        let d = Directorio::new(t.path().to_path_buf());
        let base = 1_795_046_400;
        // ES: 15 guardados cada 11 min el mismo día: 10 recientes y 1 diaria.
        // EN: 15 saves every 11 min on the same day: 10 recent and 1 daily.
        for i in 0..15 {
            d.rotar_copias(format!("v{i}").as_bytes(), base + i * 660)
                .unwrap();
        }
        assert_eq!(d.copias_con_prefijo("reciente-").len(), COPIAS_RECIENTES);
        assert_eq!(d.copias_con_prefijo("diaria-").len(), 1);
        // ES: La más nueva es la última versión; la diaria, la primera del día.
        // EN: The newest is the last version; the daily one, the day's first.
        let nueva = d.copias_con_prefijo("reciente-").pop().unwrap();
        assert_eq!(d.leer_copia(&nueva).unwrap(), b"v14");
        assert_eq!(d.leer_copia("diaria-2026-11-19.bolsillo").unwrap(), b"v0");
        // ES: Guardados seguidos (< 10 min) no crean copia reciente nueva.
        // EN: Saves in a row (< 10 min) do not create a new recent copy.
        let antes = d.copias_con_prefijo("reciente-");
        d.rotar_copias(b"rapido", base + 14 * 660 + 30).unwrap();
        assert_eq!(d.copias_con_prefijo("reciente-"), antes);
        // ES: 40 días seguidos: se quedan 30 diarias.
        // EN: 40 days in a row: 30 daily ones are kept.
        for dia in 1..=40 {
            d.rotar_copias(b"d", base + dia * 86_400).unwrap();
        }
        assert_eq!(d.copias_con_prefijo("diaria-").len(), COPIAS_DIARIAS);
    }

    #[test]
    fn rescate_nunca_pisa() {
        let t = tempfile::tempdir().unwrap();
        let d = Directorio::new(t.path().to_path_buf());
        d.escribir(PRINCIPAL, b"roto1").unwrap();
        let a = d.rescatar(PRINCIPAL, false, 5).unwrap();
        d.escribir(PRINCIPAL, b"roto2").unwrap();
        let b = d.rescatar(PRINCIPAL, true, 5).unwrap();
        assert_ne!(a, b);
        assert!(!d.existe(PRINCIPAL));
        assert_eq!(fs::read(t.path().join(&a)).unwrap(), b"roto1");
        assert_eq!(fs::read(t.path().join(&b)).unwrap(), b"roto2");
        assert!(d.hay_rescate());
    }

    #[test]
    fn publicar_sin_reemplazo_no_pisa() {
        let t = tempfile::tempdir().unwrap();
        let d = Directorio::new(t.path().to_path_buf());
        d.escribir(MIGRANDO, b"nuevo").unwrap();
        d.escribir(PRINCIPAL, b"existente").unwrap();
        assert!(d.publicar_sin_reemplazo(MIGRANDO, PRINCIPAL).is_err());
        assert_eq!(d.leer(PRINCIPAL).unwrap().unwrap(), b"existente");
        fs::remove_file(d.ruta(PRINCIPAL)).unwrap();
        d.publicar_sin_reemplazo(MIGRANDO, PRINCIPAL).unwrap();
        assert_eq!(d.leer(PRINCIPAL).unwrap().unwrap(), b"nuevo");
        assert!(!d.existe(MIGRANDO));
    }

    #[test]
    fn temporal_exclusivo_y_control_antes_de_publicar() {
        let t = tempfile::tempdir().unwrap();
        let r = t.path().join("x.csv");
        let e = escribir_atomico_controlado(&r, b"hola", |f, b| f.write_all(b), |_| false);
        assert!(e.is_err());
        assert!(!r.exists());
        assert_eq!(fs::read_dir(t.path()).unwrap().count(), 0);
    }

    #[test]
    fn ids_de_recibo_solo_en_minusculas() {
        assert!(id_recibo_valido("0f8c3a2e-1b2c"));
        assert!(!id_recibo_valido("0F8C3A2E-1B2C"));
    }

    #[test]
    fn lista_de_copias_con_su_bloqueo() {
        let t = tempfile::tempdir().unwrap();
        let d = Directorio::new(t.path().to_path_buf());
        d.escribir_copia(
            "reciente-000000000001.bolsillo",
            b"{\"formato\":\"bolsillo\",\"v\":2,\"tipo\":\"datos\",\"bloqueo\":\"pin\"}",
        )
        .unwrap();
        assert_eq!(d.listar_copias()[0].bloqueo.as_deref(), Some("pin"));
    }

    #[test]
    fn rutas_dentro_del_almacen() {
        let t = tempfile::tempdir().unwrap();
        let d = Directorio::new(t.path().to_path_buf());
        d.escribir(PRINCIPAL, b"x").unwrap();
        d.escribir_recibo("aa", "r1", b"y").unwrap();
        assert!(d.contiene(&t.path().join(PRINCIPAL)));
        assert!(d.contiene(&t.path().join("recibos").join("aa").join("r1.rec")));
        assert!(d.contiene(&t.path().join("recibos").join("..").join(PRINCIPAL)));
        let fuera = tempfile::tempdir().unwrap();
        assert!(!d.contiene(&fuera.path().join("export.xlsx")));
        // ES: Una carpeta que no existe no se puede resolver: protegida.
        // EN: A folder that does not exist cannot be resolved: protected.
        assert!(d.contiene(&fuera.path().join("no-existe").join("x.csv")));
    }

    #[test]
    fn nombres_seguros() {
        assert!(nombre_copia_valido("reciente-000000000001.bolsillo"));
        assert!(!nombre_copia_valido("../datos.bolsillo"));
        assert!(!nombre_copia_valido("reciente-..\\x.bolsillo"));
        assert!(id_recibo_valido("0f8c3a2e-1b2c-4d5e-8f90-123456789abc"));
        assert!(!id_recibo_valido("../x"));
    }
}
