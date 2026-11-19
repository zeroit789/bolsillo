// =============================================================================
// boveda.rs — Lógica del almacén cifrado / Encrypted store logic
// -----------------------------------------------------------------------------
// ES: La "bóveda": abre, guarda, crea y migra el almacén, cambia el bloqueo y
//     exporta o importa copias cifradas. No sabe nada de Tauri (los comandos de
//     lib.rs la envuelven), así que se prueba entera con `cargo test` sobre una
//     carpeta temporal. Reglas:
//       - La clave de datos (DEK) solo vive aquí, en memoria, mientras la app
//         está desbloqueada; `bloquear()` la suelta y `Zeroizing` la borra.
//       - Nunca se pisa un fichero que no se ha podido leer: se aparta a rescate/.
//       - Rust no interpreta los datos financieros: cifra y descifra bytes.
//         Las comparaciones de contenido (migración) las hace el frontend
//         releyendo por el camino normal; aquí se comparan bytes.
//       - Al activar el bloqueo o regenerar la clave de recuperación se cambia
//         la DEK (rotación): lo que se guarde después no se abre con ficheros
//         viejos. Las copias automáticas con la DEK anterior se reenvuelven.
// EN: The "vault": opens, saves, creates and migrates the store, changes the
//     lock and exports or imports encrypted backups. It knows nothing about
//     Tauri (lib.rs commands wrap it), so it is fully tested with `cargo test`
//     on a temporary folder. Rules:
//       - The data key (DEK) only lives here, in memory, while the app is
//         unlocked; `bloquear()` drops it and `Zeroizing` wipes it.
//       - A file that could not be read is never overwritten: it is moved
//         aside to rescate/.
//       - Rust does not interpret the financial data: it encrypts and decrypts
//         bytes. Content comparisons (migration) are done by the frontend by
//         reading back through the normal path; here bytes are compared.
//       - Enabling the lock or regenerating the recovery key changes the DEK
//         (rotation): what is saved afterwards cannot be opened with old files.
//         Automatic backups with the previous DEK are rewrapped.
// -----------------------------------------------------------------------------
// ÍNDICE / INDEX:
//   1. Tipos públicos / Public types
//   2. Reglas de credenciales / Credential rules
//   3. Estado y apertura / State & opening
//   4. Guardar y recibos / Saving & receipts
//   5. Crear y migrar / Creating & migrating
//   6. Bloqueo, credenciales y recuperación / Lock, credentials & recovery
//   7. Copias automáticas y rescate / Automatic backups & rescue
//   8. Copias cifradas exportadas / Exported encrypted backups
//   9. Tests / Tests
// =============================================================================

use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::cripto::{aleatorio, clave_nueva, derivar, Clave, ParamsKdf, KDF_OWASP, TAM_SAL};
use crate::directorio::{
    dia_utc, id_recibo_valido, Directorio, InfoCopia, MARCA, MIGRANDO, PRINCIPAL,
};
use crate::formato::{
    a_bytes, cifrar_recibo, dek_id_nuevo, descifrar_recibo, desde_bytes, envolver_con_kek,
    envolver_ofuscacion, Bloqueo, ErrorAlmacen, Fichero, Llave, Migracion, TipoFichero,
};
use crate::recuperacion;

// ES: Reenvolturas de copias que no se pudieron hacer (se reintentan al abrir).
// EN: Backup rewraps that could not be done (retried on open).
const PENDIENTES: &str = "pendientes.json";

// ES: ¿Ruta de reenvoltura aceptable? "copias/…" o "rescate/…" con un nombre
//     simple acabado en .bolsillo (sin subcarpetas ni "..").
// EN: Acceptable rewrap path? "copias/…" or "rescate/…" with a plain name
//     ending in .bolsillo (no subfolders nor "..").
// ES: Une dos listas de reenvolturas sin repetir.
// EN: Joins two rewrap lists without repeats.
fn unir(base: &[Reenvoltura], nuevas: &[Reenvoltura]) -> Vec<Reenvoltura> {
    let mut v = base.to_vec();
    for n in nuevas {
        if !v.contains(n) {
            v.push(n.clone());
        }
    }
    v
}

// ES: (ver arriba) / EN: (see above)
fn ruta_pendiente_valida(r: &str) -> bool {
    let r = r.replace('\\', "/");
    let Some((dir, nombre)) = r.split_once('/') else {
        return false;
    };
    (dir == "copias" || dir == "rescate")
        && nombre.ends_with(".bolsillo")
        && !nombre.contains("..")
        && nombre
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '.' || c == '_')
}

// ES: Comparación en tiempo constante (no se corta en el primer byte distinto).
// EN: Constant-time comparison (it does not stop at the first different byte).
fn iguales_ct(a: &[u8], b: &[u8]) -> bool {
    a.len() == b.len() && a.iter().zip(b).fold(0u8, |acc, (x, y)| acc | (x ^ y)) == 0
}

// ES: Una reenvoltura pendiente: fichero (relativo a la raíz) y qué falta.
//     "proteger": copia aún solo ofuscada; "credencial": copia con la
//     credencial anterior; "recuperacion": copia con la clave de recuperación
//     anterior.
// EN: A pending rewrap: file (relative to the root) and what is missing.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
struct Reenvoltura {
    ruta: String,
    accion: String,
    // ES: DEK del principal ANTES de la operación: si sigue siendo la actual,
    //     el cambio no llegó a publicarse y no hay nada que hacer.
    // EN: Main-file DEK BEFORE the operation: if it is still the current one,
    //     the change was never published and there is nothing to do.
    #[serde(default)]
    dek_id: Option<String>,
    // ES: Sal de la envoltura de recuperación que hay que quitar ("recuperacion"):
    //     si la copia ya tiene otra (la nueva), no se toca.
    // EN: Salt of the recovery wrapping to remove ("recuperacion"): if the
    //     backup already has another one (the new one), it is left alone.
    #[serde(default)]
    sal: Option<String>,
    // ES: true cuando el cambio del principal ya se publicó (lo escribe el
    //     cierre). Sin él, una DEK previa igual a la actual = no publicado.
    // EN: true once the main-file change was published (written on close).
    //     Without it, a previous DEK equal to the current one = not published.
    #[serde(default)]
    publicada: bool,
    // ES: DEK de la propia copia ("recuperacion"): puede ser de una
    //     generación anterior a la de la operación.
    // EN: The backup's own DEK ("recuperacion"): it may belong to a
    //     generation older than the one of the operation.
    #[serde(default)]
    dek_copia: Option<String>,
}

type R<T> = Result<T, ErrorAlmacen>;

// ── 1. Tipos públicos / Public types ─────────────────────────────────────────
// ES: Estado del almacén para decidir la pantalla de arranque.
// EN: Store state to decide the boot screen.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Estado {
    pub hay_fichero: bool,
    pub legible: bool,
    // ES: "danado" | "version" si no es legible / EN: "danado" | "version" if unreadable
    pub motivo: Option<String>,
    pub bloqueo: Option<Bloqueo>,
    pub tiene_recuperacion: bool,
    pub migracion: Option<Migracion>,
    // ES: señales de que ya hubo un almacén aquí / EN: signs that a store existed here
    pub hay_marca: bool,
    pub hay_copias: bool,
    pub hay_rescate: bool,
    pub abierta: bool,
    // ES: abierta con la clave de recuperación: hay que poner PIN nuevo
    // EN: opened with the recovery key: a new PIN must be set
    pub por_recuperacion: bool,
    // ES: copias que aún tienen la protección anterior (se reintenta al abrir)
    // EN: backups that still have the previous protection (retried on open)
    pub copias_pendientes: usize,
}

// ES: Recibo que llega del frontend (id y data URL). / EN: Receipt coming from the frontend (id and data URL).
#[derive(Debug, Clone, Deserialize)]
pub struct ReciboEntrada {
    pub id: String,
    pub datos: String,
}

// ES: Recibo que vuelve al frontend (None si falta el fichero o no se descifra).
// EN: Receipt returned to the frontend (None if the file is missing or does not decrypt).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ReciboSalida {
    pub id: String,
    pub datos: Option<String>,
}

// ES: Qué se eligió al importar: un JSON antiguo (va el texto) o un fichero cifrado.
// EN: What was picked on import: an old JSON (the text goes back) or an encrypted file.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "tipo", rename_all = "lowercase")]
pub enum CopiaElegida {
    Json { contenido: String },
    Cifrada { bloqueo: Bloqueo },
}

// ES: Almacén abierto: la DEK y la cabecera vigente. / EN: Open store: the DEK and the current header.
struct Abierta {
    dek: Clave,
    cabecera: Fichero,
    por_recuperacion: bool,
    // ES: bytes del principal tal como se leyó o escribió por última vez: si en
    //     disco hay otra cosa, no se pisa (conflicto).
    // EN: main file bytes as last read or written: if something else is on
    //     disk, it is not overwritten (conflict).
    huella: Vec<u8>,
}

// ES: Migración escrita pero sin confirmar. / EN: Migration written but not confirmed.
struct Pendiente {
    dek: Clave,
    origen: Zeroizing<Vec<u8>>,
}

// ES: Segundos Unix actuales. / EN: Current Unix seconds.
fn ahora_real() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

// ── 2. Reglas de credenciales / Credential rules ──────────────────────────────
// ES: Mínimos para credenciales NUEVAS: PIN de 4 a 6 cifras; contraseña de al
//     menos 8 caracteres. Al migrar se respeta la credencial que ya había.
// EN: Minimums for NEW credentials: 4 to 6 digit PIN; password of at least 8
//     characters. When migrating, the existing credential is kept.
pub const MIN_PASSWORD: usize = 8;

pub fn credencial_valida(bloqueo: Bloqueo, c: &str) -> bool {
    match bloqueo {
        Bloqueo::Ninguno => true,
        Bloqueo::Pin => (4..=6).contains(&c.len()) && c.chars().all(|x| x.is_ascii_digit()),
        Bloqueo::Password => c.chars().count() >= MIN_PASSWORD,
    }
}

// ES: Bóveda sobre un directorio. / EN: Vault over a directory.
pub struct Boveda {
    dir: Directorio,
    kdf: ParamsKdf,
    abierta: Option<Abierta>,
    pendiente: Option<Pendiente>,
    elegida: Option<Vec<u8>>,
    reloj: fn() -> u64,
}

impl Boveda {
    pub fn new(dir: Directorio) -> Self {
        Self::con(dir, KDF_OWASP, ahora_real)
    }

    // ES: Con parámetros y reloj a medida (tests). / EN: With custom parameters and clock (tests).
    pub fn con(dir: Directorio, kdf: ParamsKdf, reloj: fn() -> u64) -> Self {
        Boveda {
            dir,
            kdf,
            abierta: None,
            pendiente: None,
            elegida: None,
            reloj,
        }
    }

    fn ahora(&self) -> u64 {
        (self.reloj)()
    }

    // ── 3. Estado y apertura / State & opening ─────────────────────────────────
    // ES: Lee la cabecera del principal (None si no hay). / EN: Reads the main header (None if there is none).
    fn leer_principal(&self) -> R<Option<Fichero>> {
        match self.dir.leer(PRINCIPAL)? {
            None => Ok(None),
            Some(b) => desde_bytes(&b).map(Some),
        }
    }

    pub fn estado(&self) -> Estado {
        let (hay_fichero, f) = match self.leer_principal() {
            Ok(None) => (false, Ok(None)),
            r => (true, r),
        };
        let (legible, motivo, cab) = match f {
            Ok(c) => (true, None, c),
            Err(e) => (false, Some(e.codigo()), None),
        };
        Estado {
            hay_fichero,
            legible: hay_fichero && legible,
            motivo,
            bloqueo: cab.as_ref().map(|c| c.bloqueo),
            tiene_recuperacion: cab
                .as_ref()
                .is_some_and(|c| c.envolturas.recuperacion.is_some()),
            migracion: cab.and_then(|c| c.migracion),
            hay_marca: self.dir.existe(MARCA),
            hay_copias: self.dir.hay_copias(),
            hay_rescate: self.dir.hay_rescate(),
            abierta: self.abierta.is_some(),
            por_recuperacion: self.abierta_por_recuperacion(),
            copias_pendientes: self.leer_pendientes().len(),
        }
    }

    // ES: Abre con la llave dada, guarda la DEK en memoria y devuelve los datos.
    // EN: Opens with the given key, keeps the DEK in memory and returns the data.
    fn abrir_con(&mut self, llave: Option<Llave>, por_recuperacion: bool) -> R<String> {
        let bytes = self.dir.leer(PRINCIPAL)?.ok_or(ErrorAlmacen::Vacio)?;
        let cab = desde_bytes(&bytes)?;
        let dek = cab.abrir_dek(llave)?;
        let claro = cab.descifrar_datos(&dek)?;
        let texto = String::from_utf8(claro.to_vec()).map_err(|_| ErrorAlmacen::Danado)?;
        self.abierta = Some(Abierta {
            dek,
            cabecera: cab,
            por_recuperacion,
            huella: bytes,
        });
        // ES: La marca es duradera aunque se perdiera al migrar o crear.
        // EN: The marker becomes durable even if it was lost when migrating or creating.
        let _ = self.marcar("apertura");
        Ok(texto)
    }

    // ES: Abre y, con la credencial en la mano, reintenta las reenvolturas de
    //     copias que quedaron pendientes.
    // EN: Opens and, with the credential at hand, retries the pending backup
    //     rewraps.
    pub fn abrir(&mut self, credencial: Option<&str>) -> R<String> {
        let texto = self.abrir_con(credencial.map(Llave::Credencial), false)?;
        if let Some(c) = credencial {
            self.reintentar_pendientes(c);
        }
        Ok(texto)
    }

    pub fn abrir_con_recuperacion(&mut self, clave: &str) -> R<String> {
        let norm = recuperacion::normalizar(clave).map_err(|e| match e {
            recuperacion::ErrorClave::Formato => ErrorAlmacen::RecuperacionFormato,
            recuperacion::ErrorClave::Comprobacion => ErrorAlmacen::RecuperacionComprobacion,
        })?;
        self.abrir_con(Some(Llave::Recuperacion(&norm)), true)
    }

    pub fn abierta_por_recuperacion(&self) -> bool {
        self.abierta.as_ref().is_some_and(|a| a.por_recuperacion)
    }

    // ES: Olvida la DEK (Zeroizing la borra al soltarla). / EN: Forgets the DEK (Zeroizing wipes it when dropped).
    pub fn bloquear(&mut self) {
        self.abierta = None;
        self.pendiente = None;
    }

    fn abierta(&self) -> R<&Abierta> {
        self.abierta.as_ref().ok_or(ErrorAlmacen::Bloqueado)
    }

    // ── 4. Guardar y recibos / Saving & receipts ───────────────────────────────
    // ES: Escribe los recibos que falten con la DEK dada. / EN: Writes the missing receipts with the given DEK.
    fn escribir_recibos(&self, dek: &Clave, dek_id: &str, recibos: &[ReciboEntrada]) -> R<()> {
        for r in recibos {
            if !id_recibo_valido(&r.id) {
                return Err(ErrorAlmacen::Danado);
            }
            // ES: Si ya existe, solo vale si se descifra y coincide; si no, se reescribe.
            // EN: If it already exists, it only counts if it decrypts and matches; otherwise it is rewritten.
            // ES: Uno que se descifra pero es OTRO recibo no se pisa (lo usan
            //     copias viejas): conflicto. Solo se repara el ilegible.
            // EN: One that decrypts but is ANOTHER receipt is not overwritten
            //     (old backups use it): conflict. Only an unreadable one is repaired.
            let existente = self
                .dir
                .leer_recibo(dek_id, &r.id)?
                .and_then(|b| descifrar_recibo(dek, dek_id, &r.id, &b).ok());
            if let Some(c) = &existente {
                if !iguales_ct(c, r.datos.as_bytes()) {
                    return Err(ErrorAlmacen::Conflicto);
                }
            }
            if existente.is_none() {
                let c = cifrar_recibo(dek, dek_id, &r.id, r.datos.as_bytes())?;
                self.dir.escribir_recibo(dek_id, &r.id, &c)?;
            }
        }
        Ok(())
    }

    // ES: Escribe el principal (atómico) y rota las copias automáticas. Un fallo
    //     de las copias no deshace el guardado (ya está en disco).
    // EN: Writes the main file (atomic) and rotates the automatic backups. A
    //     backup failure does not undo the save (it is already on disk).
    //     Deja el almacén abierto con esa cabecera, esa DEK y la huella nueva.
    // EN: Leaves the store open with that header, that DEK and the new fingerprint.
    fn escribir_principal(&mut self, f: Fichero, dek: Clave, por_recuperacion: bool) -> R<()> {
        let bytes = a_bytes(&f)?;
        self.dir.escribir(PRINCIPAL, &bytes)?;
        let _ = self.dir.rotar_copias(&bytes, self.ahora());
        self.abierta = Some(Abierta {
            dek,
            cabecera: f,
            por_recuperacion,
            huella: bytes,
        });
        Ok(())
    }

    // ES: Antes de sustituir el principal abierto: ¿sigue en disco lo que se
    //     leyó o escribió? Si alguien lo cambió o se dañó, no se pisa.
    // EN: Before replacing the open main file: is what was read or written
    //     still on disk? If someone changed it or it got damaged, it is not
    //     overwritten.
    fn comprobar_revision(&self) -> R<()> {
        let a = self.abierta()?;
        match self.dir.leer(PRINCIPAL)? {
            Some(b) if b == a.huella => Ok(()),
            _ => Err(ErrorAlmacen::Conflicto),
        }
    }

    // ES: Guarda los datos: primero los recibos nuevos, después el principal
    //     que los referencia. Necesita el almacén abierto.
    // EN: Saves the data: first the new receipts, then the main file that
    //     references them. Needs the store to be open.
    pub fn guardar(&mut self, datos: &str, recibos: &[ReciboEntrada]) -> R<()> {
        self.comprobar_revision()?;
        let a = self.abierta()?;
        self.escribir_recibos(&a.dek, &a.cabecera.dek_id, recibos)?;
        let mut cab = a.cabecera.clone();
        cab.cambiar_datos(&a.dek, datos.as_bytes())?;
        let (dek, por) = (Zeroizing::new(*a.dek), a.por_recuperacion);
        self.escribir_principal(cab, dek, por)
    }

    // ES: Relee el principal del disco y lo descifra con la DEK en memoria.
    // EN: Reads the main file again from disk and decrypts it with the in-memory DEK.
    pub fn leer_datos(&self) -> R<String> {
        let a = self.abierta()?;
        let cab = self.leer_principal()?.ok_or(ErrorAlmacen::Vacio)?;
        let claro = cab.descifrar_datos(&a.dek)?;
        String::from_utf8(claro.to_vec()).map_err(|_| ErrorAlmacen::Danado)
    }

    // ES: Descifra recibos por id; los que falten o no se abran vuelven en None.
    // EN: Decrypts receipts by id; missing or unreadable ones come back as None.
    pub fn leer_recibos(&self, ids: &[String]) -> R<Vec<ReciboSalida>> {
        let a = self.abierta()?;
        let id_dek = &a.cabecera.dek_id;
        Ok(ids
            .iter()
            .map(|id| {
                let datos = if id_recibo_valido(id) {
                    self.dir
                        .leer_recibo(id_dek, id)
                        .ok()
                        .flatten()
                        .and_then(|b| descifrar_recibo(&a.dek, id_dek, id, &b).ok())
                        .and_then(|c| String::from_utf8(c.to_vec()).ok())
                } else {
                    None
                };
                ReciboSalida {
                    id: id.clone(),
                    datos,
                }
            })
            .collect())
    }

    // ── 5. Crear y migrar / Creating & migrating ───────────────────────────────
    // ES: Construye un almacén nuevo en memoria: DEK nueva, recibos escritos y
    //     cabecera. Devuelve (fichero, dek, clave de recuperación si hay bloqueo).
    // EN: Builds a new store in memory: new DEK, receipts written and header.
    //     Returns (file, dek, recovery key if there is a lock).
    fn construir(
        &self,
        datos: &str,
        recibos: &[ReciboEntrada],
        bloqueo: Bloqueo,
        credencial: Option<&str>,
    ) -> R<(Fichero, Clave, Option<String>)> {
        let dek = clave_nueva()?;
        let dek_id = dek_id_nuevo()?;
        let clave_rec = if bloqueo == Bloqueo::Ninguno {
            None
        } else {
            Some(recuperacion::generar()?)
        };
        let norm = match &clave_rec {
            Some(k) => Some(recuperacion::normalizar(k).map_err(|_| ErrorAlmacen::Interno)?),
            None => None,
        };
        self.escribir_recibos(&dek, &dek_id, recibos)?;
        let f = Fichero::nuevo(
            TipoFichero::Datos,
            bloqueo,
            &dek,
            &dek_id,
            credencial,
            norm.as_ref().map(|z| z.as_str()),
            &self.kdf,
            datos.as_bytes(),
        )?;
        Ok((f, dek, clave_rec))
    }

    // ES: Escribe la marca duradera "aquí hay un almacén" si no existe.
    // EN: Writes the durable "a store lives here" marker if it does not exist.
    fn marcar(&self, origen: &str) -> R<()> {
        if !self.dir.existe(MARCA) {
            let m = format!(
                "{{\"origen\":\"{origen}\",\"fecha\":\"{}\"}}",
                dia_utc(self.ahora())
            );
            self.dir.escribir(MARCA, m.as_bytes())?;
        }
        Ok(())
    }

    // ES: Crea el almacén (bienvenida, empezar de cero o importar desde la
    //     pantalla de error). Si ya hay un principal legible, se niega. Si hay
    //     uno ilegible, solo con `reemplazar` y apartándolo antes a rescate/.
    // EN: Creates the store (welcome, start from scratch or import from the
    //     error screen). If a readable main file exists, it refuses. If an
    //     unreadable one exists, only with `reemplazar` and after moving it to
    //     rescate/.
    pub fn crear(
        &mut self,
        datos: &str,
        recibos: &[ReciboEntrada],
        bloqueo: Bloqueo,
        credencial: Option<&str>,
        reemplazar: bool,
        origen: &str,
    ) -> R<Option<String>> {
        if bloqueo != Bloqueo::Ninguno && !credencial.is_some_and(|c| credencial_valida(bloqueo, c))
        {
            return Err(ErrorAlmacen::CredencialInvalida);
        }
        let existe = self.dir.existe(PRINCIPAL);
        if existe && !reemplazar {
            return Err(ErrorAlmacen::Existe);
        }
        // ES: Primero se prepara todo lo nuevo; con `reemplazar`, el anterior
        //     (legible o no) se COPIA a rescate/ y solo después se sustituye de
        //     forma atómica: si algo falla antes, el original sigue en su sitio.
        // EN: Everything new is prepared first; with `reemplazar`, the previous
        //     one (readable or not) is COPIED to rescate/ and only then atomically
        //     replaced: if anything fails before, the original stays in place.
        let (f, dek, clave) = self.construir(datos, recibos, bloqueo, credencial)?;
        if existe {
            self.dir.rescatar(PRINCIPAL, false, self.ahora())?;
        }
        self.escribir_principal(f, dek, false)?;
        // ES: La marca es una señal secundaria: si falla, el almacén ya existe.
        // EN: The marker is a secondary signal: if it fails, the store exists anyway.
        let _ = self.marcar(origen);
        Ok(clave)
    }

    // ES: Fase 1 de la migración desde localStorage: escribe datos.bolsillo.migrando
    //     y comprueba aquí mismo que se relee y descifra (bytes iguales). La
    //     credencial que ya tenía la 1.1.0 se respeta aunque no cumpla los
    //     mínimos nuevos (si no, el usuario se quedaría fuera).
    // EN: Migration phase 1 from localStorage: writes datos.bolsillo.migrando and
    //     checks right here that it reads back and decrypts (equal bytes). The
    //     credential 1.1.0 already had is kept even if it does not meet the new
    //     minimums (otherwise the user would be locked out).
    pub fn preparar_migracion(
        &mut self,
        datos: &str,
        recibos: &[ReciboEntrada],
        bloqueo: Bloqueo,
        credencial: Option<&str>,
        huella: &str,
    ) -> R<Option<String>> {
        if self.hubo_almacen() {
            return Err(ErrorAlmacen::Existe);
        }
        if bloqueo != Bloqueo::Ninguno && credencial.is_none_or(str::is_empty) {
            return Err(ErrorAlmacen::CredencialInvalida);
        }
        let (mut f, dek, clave) = self.construir(datos, recibos, bloqueo, credencial)?;
        f.migracion = Some(Migracion {
            desde: "localStorage".into(),
            fecha: dia_utc(self.ahora()),
            huella: huella.into(),
        });
        self.dir.escribir(MIGRANDO, &a_bytes(&f)?)?;
        // ES: Verificación por bytes, volviendo a derivar desde la credencial.
        // EN: Byte verification, deriving again from the credential.
        let releido = desde_bytes(&self.dir.leer(MIGRANDO)?.ok_or(ErrorAlmacen::Verificacion)?)?;
        let dek2 = releido
            .abrir_dek(credencial.map(Llave::Credencial))
            .map_err(|_| ErrorAlmacen::Verificacion)?;
        let claro = releido
            .descifrar_datos(&dek2)
            .map_err(|_| ErrorAlmacen::Verificacion)?;
        if claro.as_slice() != datos.as_bytes() {
            return Err(ErrorAlmacen::Verificacion);
        }
        for r in recibos {
            let b = self
                .dir
                .leer_recibo(&releido.dek_id, &r.id)?
                .ok_or(ErrorAlmacen::Verificacion)?;
            let c = descifrar_recibo(&dek2, &releido.dek_id, &r.id, &b)
                .map_err(|_| ErrorAlmacen::Verificacion)?;
            if c.as_slice() != r.datos.as_bytes() {
                return Err(ErrorAlmacen::Verificacion);
            }
        }
        if let Some(k) = &clave {
            let norm = recuperacion::normalizar(k).map_err(|_| ErrorAlmacen::Interno)?;
            let dek3 = releido
                .abrir_dek(Some(Llave::Recuperacion(&norm)))
                .map_err(|_| ErrorAlmacen::Verificacion)?;
            if !iguales_ct(dek3.as_ref(), dek.as_ref()) {
                return Err(ErrorAlmacen::Verificacion);
            }
        }
        self.pendiente = Some(Pendiente {
            dek,
            origen: Zeroizing::new(datos.as_bytes().to_vec()),
        });
        Ok(clave)
    }

    // ES: Fase 2: el frontend relee el fichero migrado por el camino normal de
    //     lectura (descifrar con la DEK) para compararlo con sus datos de origen.
    // EN: Phase 2: the frontend reads the migrated file back through the normal
    //     read path (decrypt with the DEK) to compare it with its source data.
    pub fn leer_migracion(&self) -> R<String> {
        let p = self.pendiente.as_ref().ok_or(ErrorAlmacen::Verificacion)?;
        let f = desde_bytes(&self.dir.leer(MIGRANDO)?.ok_or(ErrorAlmacen::Verificacion)?)?;
        let claro = f.descifrar_datos(&p.dek)?;
        String::from_utf8(claro.to_vec()).map_err(|_| ErrorAlmacen::Danado)
    }

    // ES: Fase 3: confirma. Solo si sigue sin haber principal, renombra el
    //     .migrando a datos.bolsillo, escribe la marca y deja el almacén abierto.
    // EN: Phase 3: confirms. Only if there is still no main file, it renames the
    //     .migrando to datos.bolsillo, writes the marker and leaves the store open.
    pub fn confirmar_migracion(&mut self) -> R<()> {
        let p = self.pendiente.take().ok_or(ErrorAlmacen::Verificacion)?;
        if self.hubo_almacen() {
            return Err(ErrorAlmacen::Existe);
        }
        let bytes = self.dir.leer(MIGRANDO)?.ok_or(ErrorAlmacen::Verificacion)?;
        let f = desde_bytes(&bytes)?;
        if !iguales_ct(&f.descifrar_datos(&p.dek)?, &p.origen) {
            return Err(ErrorAlmacen::Verificacion);
        }
        // ES: Publicación exclusiva: si entre medias apareció un principal, falla.
        // EN: Exclusive publish: if a main file appeared in between, it fails.
        self.dir
            .publicar_sin_reemplazo(MIGRANDO, PRINCIPAL)
            .map_err(|e| {
                if e.kind() == std::io::ErrorKind::AlreadyExists {
                    ErrorAlmacen::Existe
                } else {
                    ErrorAlmacen::from(e)
                }
            })?;
        // ES: El renombrado es el punto de confirmación: desde aquí el fichero
        //     manda, así que nada de lo que sigue puede devolver error (si no,
        //     la sesión volvería a localStorage con el fichero ya publicado).
        // EN: The rename is the commit point: from here the file rules, so
        //     nothing after it may return an error (otherwise the session would
        //     go back to localStorage with the file already published).
        let _ = self.marcar("localStorage");
        let _ = self.dir.rotar_copias(&bytes, self.ahora());
        self.abierta = Some(Abierta {
            dek: p.dek,
            cabecera: f,
            por_recuperacion: false,
            huella: bytes,
        });
        Ok(())
    }

    // ES: ¿Hubo aquí un almacén? (principal, marca, copias o rescates de datos).
    //     Con cualquiera de esas señales nunca se migra desde localStorage.
    // EN: Was there a store here? (main file, marker, backups or data rescues).
    //     With any of those signs it never migrates from localStorage.
    fn hubo_almacen(&self) -> bool {
        self.dir.existe(PRINCIPAL)
            || self.dir.existe(MARCA)
            || self.dir.hay_copias()
            || self.dir.hay_rescate()
    }

    // ES: Cancela una migración que no cuadró: el .migrando se aparta a rescate/
    //     (para poder estudiarlo) y el localStorage sigue siendo la verdad.
    // EN: Cancels a migration that did not match: the .migrando is moved aside to
    //     rescate/ (so it can be studied) and localStorage stays the truth.
    pub fn cancelar_migracion(&mut self) -> R<()> {
        self.pendiente = None;
        if self.dir.existe(MIGRANDO) {
            self.dir
                .rescatar_como(MIGRANDO, true, self.ahora(), "migracion")?;
        }
        Ok(())
    }

    // ── 6. Bloqueo, credenciales y recuperación / Lock, credentials & recovery ──
    // ES: Cambia la DEK del principal: descifra con la vieja, recifra recibos y
    //     datos con una nueva y escribe la cabecera que dé `envolturas`. Los
    //     recibos nuevos se escriben antes que el principal (que es el cambio).
    // EN: Changes the main file's DEK: decrypts with the old one, re-encrypts
    //     receipts and data with a new one and writes the header `envolturas`
    //     gives. New receipts are written before the main file (the switch).
    fn rotar_dek<F>(&mut self, bloqueo: Bloqueo, envolturas: F) -> R<()>
    where
        F: FnOnce(&Clave, &str) -> R<crate::formato::Envolturas>,
    {
        self.comprobar_revision()?;
        let a = self.abierta()?;
        let claro = a.cabecera.descifrar_datos(&a.dek)?;
        let dek = clave_nueva()?;
        let dek_id = dek_id_nuevo()?;
        let viejo_id = a.cabecera.dek_id.clone();
        for id in self.dir.ids_recibos(&viejo_id)? {
            if let Some(b) = self.dir.leer_recibo(&viejo_id, &id)? {
                if let Ok(c) = descifrar_recibo(&a.dek, &viejo_id, &id, &b) {
                    let nuevo = cifrar_recibo(&dek, &dek_id, &id, &c)?;
                    self.dir.escribir_recibo(&dek_id, &id, &nuevo)?;
                }
            }
        }
        let mut f = a.cabecera.clone();
        f.bloqueo = bloqueo;
        f.dek_id = dek_id.clone();
        f.envolturas = envolturas(&dek, &dek_id)?;
        f.cambiar_datos(&dek, &claro)?;
        self.escribir_principal(f, dek, false)
    }

    // ES: Reenvuelve las copias automáticas y los rescates que usan la DEK
    //     `dek_id`. Se hace DESPUÉS de publicar el principal y sin devolver
    //     error: si una copia no se puede reescribir, se sigue con las demás y
    //     el cambio principal (y la clave de recuperación nueva) no se pierde.
    //     Devuelve cuántas no se pudieron reenvolver.
    // EN: Rewraps the automatic backups and rescues that use the DEK `dek_id`.
    //     It runs AFTER publishing the main file and without returning an
    //     error: if a backup cannot be rewritten, it goes on with the rest and
    //     the main change (and the new recovery key) is not lost. Returns the
    //     ones that could not be rewrapped (they are recorded as pending).
    //     Con `dek_id` None recorre todas las copias; solo escribe las que cambian.
    // EN: With `dek_id` None it goes through every backup; it only writes the ones that change.
    fn reenvolver_copias<F>(
        &self,
        dek_id: Option<&str>,
        mut cambio: F,
    ) -> Option<Vec<std::path::PathBuf>>
    where
        F: FnMut(&mut Fichero) -> R<()>,
    {
        let mut fallos = Vec::new();
        let rutas = self.dir.ficheros_con_dek().ok()?;
        for ruta in rutas {
            let Ok(bytes) = std::fs::read(&ruta) else {
                fallos.push(ruta);
                continue;
            };
            let Ok(mut f) = desde_bytes(&bytes) else {
                continue;
            };
            if dek_id.is_some_and(|d| d != f.dek_id) {
                continue;
            }
            let hecho = cambio(&mut f).and_then(|_| a_bytes(&f)).and_then(|b| {
                if b != bytes {
                    crate::directorio::escribir_atomico(&ruta, &b)?;
                }
                Ok(())
            });
            if hecho.is_err() {
                fallos.push(ruta);
            }
        }
        Some(fallos)
    }

    // ── Reenvolturas pendientes / Pending rewraps ──────────────────────────────
    // ES: Lista de reenvolturas pendientes (vacía si no hay o no se lee).
    // EN: List of pending rewraps (empty if none or unreadable).
    fn leer_pendientes(&self) -> Vec<Reenvoltura> {
        self.dir
            .leer(PENDIENTES)
            .ok()
            .flatten()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .unwrap_or_default()
    }

    // ES: Lectura estricta: sin fichero, lista vacía; ilegible o mal formado,
    //     error (para no sobrescribir trabajos pendientes).
    // EN: Strict read: no file, empty list; unreadable or malformed, error (so
    //     pending work is not overwritten).
    fn leer_pendientes_estricto(&self) -> R<Vec<Reenvoltura>> {
        match self.dir.leer(PENDIENTES)? {
            None => Ok(Vec::new()),
            Some(b) => serde_json::from_slice(&b).map_err(|_| ErrorAlmacen::Danado),
        }
    }

    fn escribir_pendientes(&self, v: &[Reenvoltura]) -> R<()> {
        let b = serde_json::to_vec(v).map_err(|_| ErrorAlmacen::Interno)?;
        Ok(self.dir.escribir(PENDIENTES, &b)?)
    }

    // ES: Antes de cambiar la protección se apuntan TODAS las copias como
    //     pendientes (si la app se corta a mitad, al abrir se reintentan; las
    //     que no necesiten nada se descartan solas). Devuelve la lista previa.
    // EN: Before changing the protection ALL backups are recorded as pending
    //     (if the app is cut halfway, they are retried on open; the ones that
    //     need nothing drop out by themselves). Returns the previous list.
    //     Si el registro no se puede escribir, la operación NO sigue.
    // EN: If the record cannot be written, the operation does NOT go on.
    fn preanotar(&self, accion: &str, dek_id: &str) -> R<(Vec<Reenvoltura>, Vec<Reenvoltura>)> {
        let previas = self.leer_pendientes_estricto()?;
        let nuevas = self.entradas(self.dir.ficheros_con_dek()?, accion, dek_id)?;
        self.escribir_pendientes(&unir(&previas, &nuevas))?;
        Ok((previas, nuevas))
    }

    // ES: Tras reenvolver: quedan las previas más las que fallaron ahora.
    // EN: After rewrapping: the previous ones plus the ones that failed now remain.
    //     Una sola escritura atómica con la unión; si fallara, queda el registro
    //     completo de `preanotar` (más amplio, nunca menos).
    // EN: A single atomic write with the union; if it failed, the full record
    //     from `preanotar` stays (wider, never narrower).
    fn cerrar_pendientes(
        &self,
        previas: Vec<Reenvoltura>,
        nuevas: Vec<Reenvoltura>,
        fallos: Option<Vec<std::path::PathBuf>>,
    ) {
        // ES: Se conservan las entradas preanotadas (con lo que se capturó antes
        //     de publicar) de las copias que fallaron; si no se pudo listar,
        //     todas.
        // EN: The pre-recorded entries (with what was captured before
        //     publishing) of the failed backups are kept; if listing failed, all.
        let fallidas: Option<Vec<String>> =
            fallos.map(|f| f.iter().map(|r| self.relativa(r)).collect());
        let quedan: Vec<Reenvoltura> = nuevas
            .into_iter()
            .filter(|n| fallidas.as_ref().is_none_or(|f| f.contains(&n.ruta)))
            .map(|mut n| {
                n.publicada = true;
                n
            })
            .collect();
        let _ = self.escribir_pendientes(&unir(&previas, &quedan));
    }

    // ES: Apunta en disco (duradero) las copias que no se pudieron reenvolver.
    // EN: Records on disk (durably) the backups that could not be rewrapped.
    //     (Solo construye la lista en memoria: base + rutas nuevas.)
    // EN: (It only builds the list in memory: base + new paths.)
    fn entradas(
        &self,
        rutas: Vec<std::path::PathBuf>,
        accion: &str,
        dek_id: &str,
    ) -> R<Vec<Reenvoltura>> {
        let mut v = Vec::new();
        for r in rutas {
            // ES: Para quitar la recuperación vieja hace falta saber cuál es
            //     (su sal): si la copia no se puede leer, no se sigue. Una
            //     copia dañada no se abre con nada y se omite.
            // EN: Removing the old recovery requires knowing which one (its
            //     salt): if the backup cannot be read, it stops. A damaged
            //     backup opens with nothing and is skipped.
            let (sal, dek_copia) = if accion == "recuperacion" {
                let b = std::fs::read(&r)?;
                match desde_bytes(&b) {
                    Ok(f) => (f.envolturas.recuperacion.map(|e| e.kdf.sal), Some(f.dek_id)),
                    Err(_) => (None, None),
                }
            } else {
                (None, None)
            };
            v.push(Reenvoltura {
                ruta: self.relativa(&r),
                accion: accion.into(),
                dek_id: Some(dek_id.into()),
                sal,
                publicada: false,
                dek_copia,
            });
        }
        Ok(v)
    }

    // ES: Ruta relativa al almacén, con "/" (la forma en que se registra).
    // EN: Path relative to the store, with "/" (the way it is recorded).
    fn relativa(&self, r: &std::path::Path) -> String {
        let raiz = self.dir.ruta("");
        r.strip_prefix(&raiz)
            .unwrap_or(r)
            .to_string_lossy()
            .replace('\\', "/")
    }

    // ES: Reintenta las reenvolturas pendientes con la credencial actual (una
    //     sola derivación). Las que salen bien se quitan de la lista.
    //       - "proteger": la copia sigue solo ofuscada: su DEK (pública) pasa a
    //         la credencial actual.
    //       - "credencial": copia con la DEK actual y la credencial anterior.
    //       - "recuperacion": se le quita la recuperación anterior.
    // EN: Retries the pending rewraps with the current credential (a single
    //     derivation). The ones that succeed are removed from the list.
    fn reintentar_pendientes(&mut self, credencial: &str) {
        let v = self.leer_pendientes();
        if v.is_empty() {
            return;
        }
        let Ok(a) = self.abierta() else { return };
        let (bloqueo, dek_id) = (a.cabecera.bloqueo, a.cabecera.dek_id.clone());
        let dek = Zeroizing::new(*a.dek);
        // ES: Una protección o regeneración cuya DEK previa sigue siendo la
        //     actual no llegó a publicarse: no hay nada que hacer (y tocar las
        //     copias quitaría envolturas que siguen siendo válidas).
        // EN: A protect or regenerate whose previous DEK is still the current
        //     one was never published: there is nothing to do (and touching
        //     the backups would remove wrappings that are still valid).
        let v: Vec<Reenvoltura> = v
            .into_iter()
            .filter(|p| {
                p.publicada
                    || p.accion == "credencial"
                    || p.dek_id.as_deref() != Some(dek_id.as_str())
            })
            .collect();
        if bloqueo == Bloqueo::Ninguno {
            let _ = self.escribir_pendientes(&v);
            return;
        }
        let Ok((kek, sal)) = self.kek_nueva(credencial.as_bytes()) else {
            return;
        };
        let kdf = self.kdf;
        let mut quedan = Vec::new();
        for p in v {
            // ES: Solo copias o rescates .bolsillo de este almacén (un registro
            //     alterado nunca hace reescribir otro fichero).
            // EN: Only .bolsillo backups or rescues of this store (a tampered
            //     record never makes another file be rewritten).
            if !ruta_pendiente_valida(&p.ruta) {
                continue;
            }
            let ruta = self.dir.ruta(&p.ruta);
            // ES: Solo se descarta si de verdad no existe; otro error la conserva.
            // EN: It is dropped only if it really does not exist; any other error keeps it.
            match std::fs::symlink_metadata(&ruta) {
                Err(e) if e.kind() == std::io::ErrorKind::NotFound => continue,
                Err(_) => {
                    quedan.push(p);
                    continue;
                }
                Ok(_) => {}
            }
            // ES: Nunca a través de un enlace o unión (podría apuntar fuera).
            // EN: Never through a link or junction (it could point outside).
            let carpeta = ruta.parent().unwrap_or(&ruta);
            if !crate::directorio::sin_redireccion(carpeta)
                || !crate::directorio::sin_redireccion(&ruta)
            {
                quedan.push(p);
                continue;
            }
            let hecho = (|| -> R<()> {
                // ES: Sin DEK registrada no se puede comprobar: queda para revisión.
                // EN: Without a recorded DEK it cannot be checked: kept for review.
                if p.dek_id.is_none() {
                    return Err(ErrorAlmacen::Interno);
                }
                let mut f = desde_bytes(&std::fs::read(&ruta)?)?;
                match p.accion.as_str() {
                    "proteger"
                        if f.bloqueo == Bloqueo::Ninguno
                            && p.dek_id.as_deref() == Some(f.dek_id.as_str()) =>
                    {
                        let d = f.abrir_dek(None)?;
                        f.envolturas = crate::formato::Envolturas {
                            credencial: Some(envolver_con_kek(
                                &kek,
                                &sal,
                                "credencial",
                                &f.dek_id,
                                &d,
                                &kdf,
                            )?),
                            ..Default::default()
                        };
                        f.bloqueo = bloqueo;
                    }
                    "credencial"
                        if f.dek_id == dek_id && p.dek_id.as_deref() == Some(f.dek_id.as_str()) =>
                    {
                        f.envolturas.credencial = Some(envolver_con_kek(
                            &kek,
                            &sal,
                            "credencial",
                            &f.dek_id,
                            &dek,
                            &kdf,
                        )?);
                        f.bloqueo = bloqueo;
                    }
                    "recuperacion"
                        if f.envolturas.credencial.is_some()
                            && p.dek_copia.as_deref().or(p.dek_id.as_deref())
                                == Some(f.dek_id.as_str())
                            && p.sal.is_some()
                            && f.envolturas.recuperacion.as_ref().map(|e| &e.kdf.sal)
                                == p.sal.as_ref() =>
                    {
                        f.envolturas.recuperacion = None;
                    }
                    // ES: Copia de otra DEK con la credencial vieja: no se puede
                    //     arreglar, pero el aviso sigue hasta que rote y desaparezca.
                    // EN: Backup of another DEK with the old credential: it cannot
                    //     be fixed, but the warning stays until it rotates away.
                    "credencial" if f.envolturas.credencial.is_some() => {
                        return Err(ErrorAlmacen::Credencial);
                    }
                    _ => return Ok(()),
                }
                crate::directorio::escribir_atomico(&ruta, &a_bytes(&f)?)?;
                Ok(())
            })();
            if hecho.is_err() {
                quedan.push(p);
            }
        }
        let _ = self.escribir_pendientes(&quedan);
    }

    // ES: Antes de que una restauración cambie la DEK del principal, el
    //     registro deja de depender de ella: lo no publicado (DEK previa igual
    //     a la actual) se quita y lo demás se marca como publicado. Si no se
    //     puede escribir, no se restaura.
    // EN: Before a restore changes the main-file DEK, the record stops
    //     depending on it: what was not published (previous DEK equal to the
    //     current one) is removed and the rest is marked as published. If it
    //     cannot be written, nothing is restored.
    //     Devuelve el registro ya resuelto, o None si está mal formado (no se
    //     puede saber qué había pendiente). Un error de lectura se propaga.
    // EN: Returns the resolved record, or None if it is malformed (what was
    //     pending cannot be known). A read error is propagated.
    fn resolver_pendientes(&self, dek_actual: Option<&str>) -> R<Option<Vec<Reenvoltura>>> {
        let v = match self.leer_pendientes_estricto() {
            Ok(v) => v,
            Err(ErrorAlmacen::Danado) => return Ok(None),
            Err(e) => return Err(e),
        };
        if v.is_empty() {
            return Ok(Some(v));
        }
        let v: Vec<Reenvoltura> = v
            .into_iter()
            .filter(|p| {
                p.publicada || p.accion == "credencial" || p.dek_id.as_deref() != dek_actual
            })
            .map(|mut p| {
                p.publicada = true;
                p
            })
            .collect();
        self.escribir_pendientes(&v)?;
        Ok(Some(v))
    }

    // ES: Deriva una KEK con sal nueva (para envolver varias cosas con una sola
    //     derivación). / EN: Derives a KEK with a new salt (to wrap several
    //     things with a single derivation).
    fn kek_nueva(&self, secreto: &[u8]) -> R<(Clave, [u8; TAM_SAL])> {
        let sal = aleatorio::<TAM_SAL>()?;
        Ok((derivar(secreto, &sal, &self.kdf)?, sal))
    }

    // ES: Activa el bloqueo desde "ninguno": DEK nueva con la credencial y una
    //     clave de recuperación nueva (que se devuelve para mostrarla una vez).
    //     Las copias automáticas que estaban solo ofuscadas con la DEK anterior
    //     pasan a abrirse con la misma credencial y recuperación.
    // EN: Enables the lock from "ninguno": new DEK with the credential and a new
    //     recovery key (returned to be shown once). Automatic backups that were
    //     only obfuscated with the previous DEK become openable with the same
    //     credential and recovery.
    pub fn configurar_bloqueo(&mut self, bloqueo: Bloqueo, credencial: &str) -> R<String> {
        let a = self.abierta()?;
        if a.cabecera.bloqueo != Bloqueo::Ninguno {
            return Err(ErrorAlmacen::Existe);
        }
        if bloqueo == Bloqueo::Ninguno || !credencial_valida(bloqueo, credencial) {
            return Err(ErrorAlmacen::CredencialInvalida);
        }
        let viejo_id = a.cabecera.dek_id.clone();
        let vieja_dek = Zeroizing::new(*a.dek);
        let clave = recuperacion::generar()?;
        let norm = recuperacion::normalizar(&clave).map_err(|_| ErrorAlmacen::Interno)?;
        let (kek_c, sal_c) = self.kek_nueva(credencial.as_bytes())?;
        let (kek_r, sal_r) = self.kek_nueva(norm.as_bytes())?;
        let kdf = self.kdf;
        let envolver = |dek: &Clave, id: &str| -> R<crate::formato::Envolturas> {
            Ok(crate::formato::Envolturas {
                credencial: Some(envolver_con_kek(
                    &kek_c,
                    &sal_c,
                    "credencial",
                    id,
                    dek,
                    &kdf,
                )?),
                recuperacion: Some(envolver_con_kek(
                    &kek_r,
                    &sal_r,
                    "recuperacion",
                    id,
                    dek,
                    &kdf,
                )?),
                ofuscacion: None,
            })
        };
        let (previas, nuevas) = self.preanotar("proteger", &viejo_id)?;
        if let Err(e) = self.rotar_dek(bloqueo, envolver) {
            let _ = self.escribir_pendientes(&previas);
            return Err(e);
        }
        let fallos = self.reenvolver_copias(Some(&viejo_id), |f| {
            if f.bloqueo == Bloqueo::Ninguno {
                f.bloqueo = bloqueo;
                f.envolturas = envolver(&vieja_dek, &viejo_id)?;
            }
            Ok(())
        });
        self.cerrar_pendientes(previas, nuevas, fallos);
        Ok(clave)
    }

    // ES: Comprueba una credencial contra la cabecera del principal en disco.
    // EN: Checks a credential against the main file header on disk.
    fn comprobar_credencial(&self, c: &str) -> R<()> {
        let cab = self.leer_principal()?.ok_or(ErrorAlmacen::Vacio)?;
        cab.abrir_dek(Some(Llave::Credencial(c))).map(|_| ())
    }

    // ES: Quita el bloqueo con una DEK NUEVA (rotación) envuelta con la
    //     ofuscación. Así la DEK de las copias históricas, que siguen pidiendo
    //     su PIN, no queda publicada bajo una clave que está en el código.
    // EN: Removes the lock with a NEW DEK (rotation) wrapped with obfuscation.
    //     So the DEK of the historical backups, which still ask for their PIN,
    //     is not published under a key that lives in the code.
    pub fn quitar_bloqueo(&mut self) -> R<()> {
        self.rotar_dek(Bloqueo::Ninguno, |dek, id| {
            Ok(crate::formato::Envolturas {
                ofuscacion: Some(envolver_ofuscacion(id, dek)?),
                ..Default::default()
            })
        })
    }

    // ES: Cambia el PIN o la contraseña. Pide la antigua salvo si se abrió con la
    //     clave de recuperación (PIN olvidado). La clave de recuperación sigue
    //     valiendo (por eso la DEK no cambia). Para que la credencial vieja no
    //     siga abriendo la DEK actual a través de una copia, las copias y
    //     rescates con esta misma DEK pasan a la credencial nueva. Quien ya se
    //     hubiera llevado un fichero viejo conserva esa DEK: para cortarlo,
    //     regenerar la clave de recuperación (que sí cambia la DEK).
    // EN: Changes the PIN or password. Asks for the old one unless it was
    //     opened with the recovery key (forgotten PIN). The recovery key keeps
    //     working (that is why the DEK does not change). So the old credential
    //     does not keep opening the current DEK through a backup, backups and
    //     rescues with this same DEK move to the new credential. Whoever already
    //     took an old file keeps that DEK: to cut them off, regenerate the
    //     recovery key (which does change the DEK).
    pub fn cambiar_credencial(
        &mut self,
        antigua: Option<&str>,
        bloqueo: Bloqueo,
        nueva: &str,
    ) -> R<()> {
        let a = self.abierta()?;
        if a.cabecera.bloqueo == Bloqueo::Ninguno {
            return Err(ErrorAlmacen::Bloqueado);
        }
        if bloqueo == Bloqueo::Ninguno || !credencial_valida(bloqueo, nueva) {
            return Err(ErrorAlmacen::CredencialInvalida);
        }
        if !a.por_recuperacion {
            self.comprobar_credencial(antigua.ok_or(ErrorAlmacen::Credencial)?)?;
        }
        self.comprobar_revision()?;
        let a = self.abierta()?;
        let (kek, sal) = self.kek_nueva(nueva.as_bytes())?;
        let mut f = a.cabecera.clone();
        f.bloqueo = bloqueo;
        f.envolturas.credencial = Some(envolver_con_kek(
            &kek,
            &sal,
            "credencial",
            &f.dek_id,
            &a.dek,
            &self.kdf,
        )?);
        let nueva_env = f.envolturas.credencial.clone();
        let dek_id = f.dek_id.clone();
        let dek = Zeroizing::new(*a.dek);
        let (previas, nuevas) = self.preanotar("credencial", &dek_id)?;
        if let Err(e) = self.escribir_principal(f, dek, false) {
            let _ = self.escribir_pendientes(&previas);
            return Err(e);
        }
        let fallos = self.reenvolver_copias(Some(&dek_id), |c| {
            if c.envolturas.credencial.is_some() {
                c.bloqueo = bloqueo;
                c.envolturas.credencial = nueva_env.clone();
            }
            Ok(())
        });
        self.cerrar_pendientes(previas, nuevas, fallos);
        Ok(())
    }

    // ES: Regenera la clave de recuperación (invalida la anterior): pide la
    //     credencial, cambia la DEK y sustituye la recuperación de las copias
    //     automáticas que usaban la DEK anterior.
    // EN: Regenerates the recovery key (invalidates the old one): asks for the
    //     credential, changes the DEK and replaces the recovery wrapping of the
    //     automatic backups that used the previous DEK.
    pub fn regenerar_recuperacion(&mut self, credencial: &str) -> R<String> {
        let a = self.abierta()?;
        let bloqueo = a.cabecera.bloqueo;
        if bloqueo == Bloqueo::Ninguno {
            return Err(ErrorAlmacen::Bloqueado);
        }
        self.comprobar_credencial(credencial)?;
        let a = self.abierta()?;
        let viejo_id = a.cabecera.dek_id.clone();
        let vieja_dek = Zeroizing::new(*a.dek);
        let clave = recuperacion::generar()?;
        let norm = recuperacion::normalizar(&clave).map_err(|_| ErrorAlmacen::Interno)?;
        let (kek_c, sal_c) = self.kek_nueva(credencial.as_bytes())?;
        let (kek_r, sal_r) = self.kek_nueva(norm.as_bytes())?;
        let kdf = self.kdf;
        let (previas, nuevas) = self.preanotar("recuperacion", &viejo_id)?;
        let rotada = self.rotar_dek(bloqueo, |dek, id| {
            Ok(crate::formato::Envolturas {
                credencial: Some(envolver_con_kek(
                    &kek_c,
                    &sal_c,
                    "credencial",
                    id,
                    dek,
                    &kdf,
                )?),
                recuperacion: Some(envolver_con_kek(
                    &kek_r,
                    &sal_r,
                    "recuperacion",
                    id,
                    dek,
                    &kdf,
                )?),
                ofuscacion: None,
            })
        });
        if let Err(e) = rotada {
            let _ = self.escribir_pendientes(&previas);
            return Err(e);
        }
        // ES: Las copias de la DEK anterior pasan a la clave nueva; las de
        //     generaciones más antiguas que aún tengan una recuperación (ya
        //     sustituida) la pierden: ninguna clave revocada sigue abriendo nada.
        // EN: Backups of the previous DEK move to the new key; those of older
        //     generations that still have an (already replaced) recovery lose
        //     it: no revoked key keeps opening anything.
        let fallos = self.reenvolver_copias(None, |f| {
            if f.envolturas.recuperacion.is_none() {
                return Ok(());
            }
            if f.dek_id == viejo_id {
                f.envolturas.recuperacion = Some(envolver_con_kek(
                    &kek_r,
                    &sal_r,
                    "recuperacion",
                    &viejo_id,
                    &vieja_dek,
                    &kdf,
                )?);
            } else if f.envolturas.credencial.is_some() {
                f.envolturas.recuperacion = None;
            }
            Ok(())
        });
        self.cerrar_pendientes(previas, nuevas, fallos);
        Ok(clave)
    }

    // ── 7. Copias automáticas y rescate / Automatic backups & rescue ───────────
    // ES: ¿Esta ruta (destino de una exportación) cae dentro del almacén?
    // EN: Does this path (an export target) fall inside the store?
    pub fn protegido(&self, ruta: &std::path::Path) -> bool {
        self.dir.contiene(ruta)
    }

    pub fn listar_copias(&self) -> Vec<InfoCopia> {
        self.dir.listar_copias()
    }

    // ES: Copia el principal tal cual a rescate/ (sin moverlo). / EN: Copies the main file as is to rescate/ (without moving it).
    pub fn rescatar(&self) -> R<String> {
        if !self.dir.existe(PRINCIPAL) {
            return Err(ErrorAlmacen::Vacio);
        }
        Ok(self.dir.rescatar(PRINCIPAL, false, self.ahora())?)
    }

    // ES: Restaura una copia automática: el principal actual (si lo hay) se
    //     guarda antes como copias/antes-<s>.bolsillo y la copia pasa a ser el
    //     principal. El almacén queda bloqueado: hay que abrirlo otra vez (con la
    //     credencial que tuviera esa copia).
    // EN: Restores an automatic backup: the current main file (if any) is first
    //     saved as copias/antes-<s>.bolsillo and the backup becomes the main
    //     file. The store is left locked: it must be opened again (with the
    //     credential that backup had).
    //     ANTES de publicar se abre y se descifra con su credencial (o sin ella
    //     si no tiene bloqueo): una copia dañada nunca desplaza al principal.
    //     Queda abierta con la DEK de la copia; devuelve sus datos.
    // EN: BEFORE publishing it is opened and decrypted with its credential (or
    //     without one if it has no lock): a damaged backup never displaces the
    //     main file. It is left open with the backup's DEK; returns its data.
    pub fn restaurar_copia(&mut self, nombre: &str, credencial: Option<&str>) -> R<String> {
        let (mut bytes, mut f, dek, texto) = self.abrir_copia(nombre, credencial)?;
        let actual = self.dir.leer(PRINCIPAL)?;
        let dek_actual = actual
            .as_ref()
            .and_then(|b| desde_bytes(b).ok())
            .map(|f| f.dek_id);
        let pendientes = self.resolver_pendientes(dek_actual.as_deref())?;
        // ES: Si esta copia tiene una clave de recuperación ya revocada (una
        //     regeneración publicada que no llegó a reenvolverla), se le quita
        //     antes de publicarla: restaurar no la reactiva.
        // EN: If this backup has an already revoked recovery key (a published
        //     regeneration that did not get to rewrap it), it is removed before
        //     publishing: restoring does not reactivate it.
        //     Se busca por DEK y sal, no por nombre (da igual cómo se llame la
        //     copia). Con el registro ilegible no se sabe qué está revocado:
        //     la copia se publica sin recuperación (se puede generar otra).
        // EN: It is looked up by DEK and salt, not by name (whatever the
        //     backup is called). With an unreadable record it is unknown what
        //     is revoked: the backup is published without recovery (another
        //     one can be generated).
        let revocada = f.envolturas.credencial.is_some()
            && f.envolturas.recuperacion.as_ref().is_some_and(|rec| {
                pendientes.as_ref().is_none_or(|v| {
                    v.iter().any(|p| {
                        p.accion == "recuperacion"
                            && p.dek_copia.as_deref().or(p.dek_id.as_deref())
                                == Some(f.dek_id.as_str())
                            && p.sal.as_ref() == Some(&rec.kdf.sal)
                    })
                })
            });
        if revocada {
            f.envolturas.recuperacion = None;
            bytes = a_bytes(&f)?;
        }
        if let Some(actual) = actual {
            let nombre_antes = self.dir.nombre_copia_libre("antes", self.ahora());
            self.dir.escribir_copia(&nombre_antes, &actual)?;
        }
        self.dir.escribir(PRINCIPAL, &bytes)?;
        let _ = self.marcar("restauracion");
        self.abierta = Some(Abierta {
            dek,
            cabecera: f,
            por_recuperacion: false,
            huella: bytes,
        });
        Ok(texto)
    }

    // ES: Abre y descifra una copia automática sin publicar nada (para que el
    //     frontend valide su contenido antes de restaurar).
    // EN: Opens and decrypts an automatic backup without publishing anything
    //     (so the frontend validates its content before restoring).
    pub fn probar_copia(&self, nombre: &str, credencial: Option<&str>) -> R<String> {
        Ok(self.abrir_copia(nombre, credencial)?.3)
    }

    fn abrir_copia(
        &self,
        nombre: &str,
        credencial: Option<&str>,
    ) -> R<(Vec<u8>, Fichero, Clave, String)> {
        let bytes = self
            .dir
            .leer_copia(nombre)
            .map_err(|_| ErrorAlmacen::SinCopia)?;
        let f = desde_bytes(&bytes)?;
        if f.tipo != TipoFichero::Datos {
            return Err(ErrorAlmacen::Danado);
        }
        let dek = f.abrir_dek(credencial.map(Llave::Credencial))?;
        let claro = f.descifrar_datos(&dek)?;
        let texto = String::from_utf8(claro.to_vec()).map_err(|_| ErrorAlmacen::Danado)?;
        Ok((bytes, f, dek, texto))
    }

    // ── 8. Copias cifradas exportadas / Exported encrypted backups ─────────────
    // ES: Bytes de una copia cifrada con su propia contraseña (mín. 8) y una DEK
    //     propia. `datos` lleva los recibos dentro (la copia es autosuficiente).
    // EN: Bytes of a backup encrypted with its own password (min. 8) and its
    //     own DEK. `datos` carries the receipts inside (the backup is
    //     self-contained).
    pub fn bytes_copia(&self, datos: &str, contrasena: &str) -> R<Vec<u8>> {
        if !credencial_valida(Bloqueo::Password, contrasena) {
            return Err(ErrorAlmacen::CredencialInvalida);
        }
        let dek = clave_nueva()?;
        let id = dek_id_nuevo()?;
        let f = Fichero::nuevo(
            TipoFichero::Copia,
            Bloqueo::Password,
            &dek,
            &id,
            Some(contrasena),
            None,
            &self.kdf,
            datos.as_bytes(),
        )?;
        a_bytes(&f)
    }

    // ES: Clasifica un fichero elegido para importar: un .bolsillo se queda en
    //     memoria hasta que llegue su contraseña; cualquier otro texto vuelve al
    //     frontend como JSON antiguo (el frontend lo valida y migra).
    // EN: Classifies a file picked for import: a .bolsillo stays in memory until
    //     its password arrives; any other text goes back to the frontend as an
    //     old JSON (the frontend validates and migrates it).
    pub fn elegir_copia(&mut self, bytes: Vec<u8>) -> R<CopiaElegida> {
        match desde_bytes(&bytes) {
            // ES: Un datos.bolsillo o una copia automática no llevan los recibos
            //     dentro: importarlos los perdería. Se restauran desde la lista.
            // EN: A datos.bolsillo or an automatic backup do not carry the
            //     receipts inside: importing them would lose them. They are
            //     restored from the list.
            Ok(f) if f.tipo != TipoFichero::Copia => Err(ErrorAlmacen::NoAutosuficiente),
            Ok(f) => {
                self.elegida = Some(bytes);
                Ok(CopiaElegida::Cifrada { bloqueo: f.bloqueo })
            }
            Err(ErrorAlmacen::Version) => Err(ErrorAlmacen::Version),
            Err(_) => {
                self.elegida = None;
                let contenido = String::from_utf8(bytes).map_err(|_| ErrorAlmacen::Danado)?;
                Ok(CopiaElegida::Json { contenido })
            }
        }
    }

    // ES: Descifra la copia elegida con su contraseña (o su PIN si es una copia
    //     automática; sin bloqueo no hace falta). Devuelve el texto JSON.
    // EN: Decrypts the picked backup with its password (or its PIN if it is an
    //     automatic backup; without a lock none is needed). Returns the JSON text.
    pub fn descifrar_copia(&self, contrasena: &str) -> R<String> {
        let b = self.elegida.as_ref().ok_or(ErrorAlmacen::SinCopia)?;
        let f = desde_bytes(b)?;
        let dek = f.abrir_dek(Some(Llave::Credencial(contrasena)))?;
        let claro = f.descifrar_datos(&dek)?;
        String::from_utf8(claro.to_vec()).map_err(|_| ErrorAlmacen::Danado)
    }
}

// ── 9. Tests / Tests ──────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use crate::cripto::tests::KDF_TEST;
    use std::sync::atomic::{AtomicU64, Ordering};

    // ES: Reloj de prueba que se puede adelantar. / EN: Test clock that can be moved forward.
    static RELOJ: AtomicU64 = AtomicU64::new(1_795_046_400);
    fn reloj() -> u64 {
        RELOJ.fetch_add(700, Ordering::SeqCst)
    }

    fn boveda() -> (tempfile::TempDir, Boveda) {
        let t = tempfile::tempdir().unwrap();
        let b = Boveda::con(Directorio::new(t.path().to_path_buf()), KDF_TEST, reloj);
        (t, b)
    }

    fn recibo(id: &str, tam: usize) -> ReciboEntrada {
        ReciboEntrada {
            id: id.into(),
            datos: format!("data:image/jpeg;base64,{}", "A".repeat(tam)),
        }
    }

    #[test]
    fn crear_con_pin_abrir_bien_mal_y_recuperacion() {
        let (_t, mut b) = boveda();
        let clave = b
            .crear(
                "{\"v\":1}",
                &[recibo("r1", 10)],
                Bloqueo::Pin,
                Some("1234"),
                false,
                "test",
            )
            .unwrap()
            .expect("con PIN hay clave de recuperación");
        b.bloquear();
        assert_eq!(
            b.leer_recibos(&["r1".into()]).err(),
            Some(ErrorAlmacen::Bloqueado)
        );
        assert_eq!(b.abrir(Some("9999")).err(), Some(ErrorAlmacen::Credencial));
        assert_eq!(b.abrir(None).err(), Some(ErrorAlmacen::Credencial));
        assert_eq!(b.abrir(Some("1234")).unwrap(), "{\"v\":1}");
        b.bloquear();
        // ES: Sin el PIN, con la clave de recuperación (tecleada en minúsculas).
        // EN: Without the PIN, with the recovery key (typed in lowercase).
        assert_eq!(
            b.abrir_con_recuperacion(&clave.to_lowercase()).unwrap(),
            "{\"v\":1}"
        );
        assert!(b.abierta_por_recuperacion());
        let r = b.leer_recibos(&["r1".into(), "nohay".into()]).unwrap();
        assert!(r[0].datos.as_ref().unwrap().starts_with("data:image/jpeg"));
        assert_eq!(r[1].datos, None);
        // ES: Con la recuperación se pone PIN nuevo sin pedir el viejo, y la clave sigue valiendo.
        // EN: With recovery a new PIN is set without the old one, and the key keeps working.
        b.cambiar_credencial(None, Bloqueo::Password, "contraseña-larga")
            .unwrap();
        b.bloquear();
        assert_eq!(b.abrir(Some("1234")).err(), Some(ErrorAlmacen::Credencial));
        b.abrir(Some("contraseña-larga")).unwrap();
        b.bloquear();
        b.abrir_con_recuperacion(&clave).unwrap();
        assert_eq!(b.estado().bloqueo, Some(Bloqueo::Password));
    }

    #[test]
    fn errata_en_la_clave_de_recuperacion() {
        let (_t, mut b) = boveda();
        let clave = b
            .crear("{}", &[], Bloqueo::Pin, Some("4321"), false, "t")
            .unwrap()
            .unwrap();
        b.bloquear();
        let mut c: Vec<char> = clave.chars().collect();
        c[0] = if c[0] == 'A' { 'B' } else { 'A' };
        let mala: String = c.into_iter().collect();
        assert_eq!(
            b.abrir_con_recuperacion(&mala).err(),
            Some(ErrorAlmacen::RecuperacionComprobacion)
        );
    }

    #[test]
    fn credenciales_nuevas_con_minimos() {
        let (_t, mut b) = boveda();
        assert_eq!(
            b.crear("{}", &[], Bloqueo::Password, Some("corta"), false, "t")
                .err(),
            Some(ErrorAlmacen::CredencialInvalida)
        );
        assert_eq!(
            b.crear("{}", &[], Bloqueo::Pin, Some("12a4"), false, "t")
                .err(),
            Some(ErrorAlmacen::CredencialInvalida)
        );
        assert!(!b.dir.existe(PRINCIPAL));
    }

    #[test]
    fn datos_grandes_y_recibos_de_cientos_de_kb() {
        let (_t, mut b) = boveda();
        // ES: 20 000 movimientos sintéticos (~2,5 MB) y 5 recibos de 300 KB.
        // EN: 20,000 synthetic movements (~2.5 MB) and 5 receipts of 300 KB.
        let movs: Vec<String> = (0..20_000)
            .map(|i| {
                format!(
                    "{{\"id\":\"p{i}\",\"concepto\":\"Gasto {i}\",\"importe\":{}.25}}",
                    i % 900
                )
            })
            .collect();
        let datos = format!("{{\"puntuales\":[{}]}}", movs.join(","));
        let recibos: Vec<ReciboEntrada> =
            (0..5).map(|i| recibo(&format!("r{i}"), 300_000)).collect();
        b.crear(&datos, &recibos, Bloqueo::Pin, Some("2468"), false, "t")
            .unwrap();
        b.bloquear();
        assert_eq!(b.abrir(Some("2468")).unwrap(), datos);
        let ids: Vec<String> = (0..5).map(|i| format!("r{i}")).collect();
        let r = b.leer_recibos(&ids).unwrap();
        assert!(r
            .iter()
            .zip(&recibos)
            .all(|(s, e)| s.datos.as_deref() == Some(e.datos.as_str())));
        // ES: El principal no lleva los recibos dentro. / EN: The main file does not carry the receipts.
        let tam = std::fs::metadata(b.dir.ruta(PRINCIPAL)).unwrap().len();
        assert!(tam < 5_000_000, "principal de {tam} bytes");
    }

    #[test]
    fn nunca_pisa_un_principal_existente_y_rescata_el_danado() {
        let (_t, mut b) = boveda();
        b.crear("{\"a\":1}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        assert_eq!(
            b.crear("{\"b\":2}", &[], Bloqueo::Ninguno, None, false, "t")
                .err(),
            Some(ErrorAlmacen::Existe)
        );
        // ES: Se daña el principal: no se abre, el estado lo dice y un guardado no lo pisa.
        // EN: The main file gets damaged: it does not open, the state says so and a save does not overwrite it.
        b.bloquear();
        b.dir.escribir(PRINCIPAL, b"{roto").unwrap();
        let e = b.estado();
        assert!(e.hay_fichero && !e.legible && e.motivo.as_deref() == Some("danado"));
        assert_eq!(b.abrir(None).err(), Some(ErrorAlmacen::Danado));
        assert_eq!(b.guardar("{}", &[]).err(), Some(ErrorAlmacen::Bloqueado));
        assert_eq!(b.dir.leer(PRINCIPAL).unwrap().unwrap(), b"{roto");
        let r = b.rescatar().unwrap();
        assert_eq!(std::fs::read(b.dir.ruta(&r)).unwrap(), b"{roto");
        // ES: Empezar de cero con `reemplazar` aparta el dañado, no lo pisa.
        // EN: Starting from scratch with `reemplazar` moves the damaged one aside, it does not overwrite it.
        b.crear("{\"nuevo\":1}", &[], Bloqueo::Ninguno, None, true, "t")
            .unwrap();
        assert!(b.estado().hay_rescate);
        let rescatados = std::fs::read_dir(b.dir.ruta("rescate")).unwrap().count();
        assert_eq!(rescatados, 2);
    }

    // ES: Altera un campo base64 del principal en disco (cambia un byte).
    // EN: Alters a base64 field of the main file on disk (changes one byte).
    fn alterar(b: &Boveda, puntero: &str) {
        let mut v: serde_json::Value =
            serde_json::from_slice(&b.dir.leer(PRINCIPAL).unwrap().unwrap()).unwrap();
        let campo = v.pointer_mut(puntero).unwrap();
        let mut bytes = crate::formato::de_b64(campo.as_str().unwrap()).unwrap();
        bytes[0] ^= 1;
        *campo = crate::formato::b64(&bytes).into();
        b.dir
            .escribir(PRINCIPAL, &serde_json::to_vec(&v).unwrap())
            .unwrap();
    }

    #[test]
    fn contenido_alterado_es_danado_no_credencial() {
        // ES: Con PIN: el PIN bueno abre la envoltura, el contenido no autentica → dañado.
        // EN: With a PIN: the right PIN opens the wrapping, the content fails → damaged.
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        b.bloquear();
        alterar(&b, "/datos/ct");
        assert!(b.estado().legible);
        assert_eq!(b.abrir(Some("4831")).err(), Some(ErrorAlmacen::Danado));
        assert_eq!(b.abrir(Some("0000")).err(), Some(ErrorAlmacen::Credencial));
        // ES: Sin bloqueo: contenido o envoltura de ofuscación alterados → dañado.
        // EN: Without a lock: altered content or obfuscation wrapping → damaged.
        let (_t2, mut c) = boveda();
        c.crear("{}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        c.bloquear();
        alterar(&c, "/datos/ct");
        assert_eq!(c.abrir(None).err(), Some(ErrorAlmacen::Danado));
        let (_t3, mut d) = boveda();
        d.crear("{}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        d.bloquear();
        alterar(&d, "/envolturas/ofuscacion/ct");
        assert_eq!(d.abrir(None).err(), Some(ErrorAlmacen::Danado));
    }

    #[test]
    fn cambiar_pin_quita_el_pin_viejo_de_las_copias() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("1111"), false, "t")
            .unwrap();
        for i in 0..3 {
            b.guardar(&format!("{{\"n\":{i}}}"), &[]).unwrap();
        }
        b.cambiar_credencial(Some("1111"), Bloqueo::Pin, "2222")
            .unwrap();
        for c in b.listar_copias() {
            let f = desde_bytes(&b.dir.leer_copia(&c.nombre).unwrap()).unwrap();
            assert!(
                f.abrir_dek(Some(Llave::Credencial("1111"))).is_err(),
                "{}",
                c.nombre
            );
            assert!(
                f.abrir_dek(Some(Llave::Credencial("2222"))).is_ok(),
                "{}",
                c.nombre
            );
        }
    }

    #[test]
    fn dos_restauraciones_no_pisan_la_copia_antes() {
        static FIJO: AtomicU64 = AtomicU64::new(1_795_046_400);
        fn reloj_fijo() -> u64 {
            FIJO.load(Ordering::SeqCst)
        }
        let t = tempfile::tempdir().unwrap();
        let mut b = Boveda::con(
            Directorio::new(t.path().to_path_buf()),
            KDF_TEST,
            reloj_fijo,
        );
        b.crear("{\"n\":0}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        let copia = b.listar_copias()[0].nombre.clone();
        b.guardar("{\"n\":1}", &[]).unwrap();
        b.restaurar_copia(&copia, None).unwrap();
        b.guardar("{\"n\":2}", &[]).unwrap();
        b.restaurar_copia(&copia, None).unwrap();
        let antes: Vec<_> = b
            .listar_copias()
            .into_iter()
            .filter(|c| c.nombre.starts_with("antes-"))
            .collect();
        assert_eq!(antes.len(), 2);
    }

    #[test]
    fn importar_solo_copias_autosuficientes() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        let principal = b.dir.leer(PRINCIPAL).unwrap().unwrap();
        assert_eq!(
            b.elegir_copia(principal).err(),
            Some(ErrorAlmacen::NoAutosuficiente)
        );
    }

    #[test]
    fn quitar_bloqueo_rota_la_dek_y_las_copias_siguen_con_pin() {
        let (_t, mut b) = boveda();
        b.crear(
            "{}",
            &[recibo("r1", 10)],
            Bloqueo::Pin,
            Some("4831"),
            false,
            "t",
        )
        .unwrap();
        let id_pin = b.abierta().unwrap().cabecera.dek_id.clone();
        b.quitar_bloqueo().unwrap();
        assert_ne!(b.abierta().unwrap().cabecera.dek_id, id_pin);
        assert!(b.leer_recibos(&["r1".into()]).unwrap()[0].datos.is_some());
        // ES: Las copias con la DEK del PIN no se abren sin el PIN.
        // EN: Backups with the PIN DEK do not open without the PIN.
        for c in b.listar_copias() {
            let f = desde_bytes(&b.dir.leer_copia(&c.nombre).unwrap()).unwrap();
            if f.dek_id == id_pin {
                assert!(f.abrir_dek(None).is_err());
            }
        }
        b.bloquear();
        assert_eq!(b.abrir(None).unwrap(), "{}");
    }

    #[test]
    fn reenvolturas_fallidas_quedan_pendientes_y_se_reintentan_al_abrir() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        let copia = b.listar_copias()[0].nombre.clone();
        let ruta = b.dir.ruta("copias").join(&copia);
        // ES: Copia de solo lectura: no se puede reescribir (como sin espacio).
        // EN: Read-only backup: it cannot be rewritten (like no space left).
        let mut perm = std::fs::metadata(&ruta).unwrap().permissions();
        perm.set_readonly(true);
        std::fs::set_permissions(&ruta, perm.clone()).unwrap();
        b.configurar_bloqueo(Bloqueo::Pin, "4831").unwrap();
        assert_eq!(b.estado().copias_pendientes, 1);
        let f = desde_bytes(&std::fs::read(&ruta).unwrap()).unwrap();
        assert_eq!(f.bloqueo, Bloqueo::Ninguno);
        #[allow(clippy::permissions_set_readonly_false)]
        perm.set_readonly(false);
        std::fs::set_permissions(&ruta, perm).unwrap();
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
        assert_eq!(b.estado().copias_pendientes, 0);
        let f = desde_bytes(&std::fs::read(&ruta).unwrap()).unwrap();
        assert_eq!(f.bloqueo, Bloqueo::Pin);
        assert!(f.abrir_dek(None).is_err());
        assert!(f.abrir_dek(Some(Llave::Credencial("4831"))).is_ok());
    }

    #[test]
    fn sin_registro_de_pendientes_no_se_cambia_la_proteccion() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        // ES: Una carpeta con el nombre del registro impide escribirlo.
        // EN: A folder named like the record prevents writing it.
        std::fs::create_dir(b.dir.ruta(PENDIENTES)).unwrap();
        assert!(b.configurar_bloqueo(Bloqueo::Pin, "4831").is_err());
        let f = desde_bytes(&b.dir.leer(PRINCIPAL).unwrap().unwrap()).unwrap();
        assert_eq!(f.bloqueo, Bloqueo::Ninguno);
    }

    #[test]
    fn el_reintento_no_quita_la_recuperacion_nueva_de_una_copia_ya_reenvuelta() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let viejo = b.abierta().unwrap().cabecera.dek_id.clone();
        let copia = b.listar_copias()[0].nombre.clone();
        let sal_vieja = desde_bytes(&b.dir.leer_copia(&copia).unwrap())
            .unwrap()
            .envolturas
            .recuperacion
            .unwrap()
            .kdf
            .sal;
        b.regenerar_recuperacion("4831").unwrap();
        // ES: Como si el cierre del registro hubiera fallado: queda la entrada vieja.
        // EN: As if closing the record had failed: the old entry remains.
        let reg = format!(
            r#"[{{"ruta":"copias/{copia}","accion":"recuperacion","dek_id":"{viejo}","sal":"{sal_vieja}"}}]"#
        );
        b.dir.escribir(PENDIENTES, reg.as_bytes()).unwrap();
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
        let f = desde_bytes(&b.dir.leer_copia(&copia).unwrap()).unwrap();
        assert!(f.envolturas.recuperacion.is_some());
    }

    #[test]
    fn sin_inventario_de_copias_no_se_cambia_la_proteccion() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        // ES: "copias" pasa a ser un fichero: listar falla.
        // EN: "copias" becomes a file: listing fails.
        let copias = b.dir.ruta("copias");
        std::fs::remove_dir_all(&copias).unwrap();
        std::fs::write(&copias, b"x").unwrap();
        assert!(b.configurar_bloqueo(Bloqueo::Pin, "4831").is_err());
        let f = desde_bytes(&b.dir.leer(PRINCIPAL).unwrap().unwrap()).unwrap();
        assert_eq!(f.bloqueo, Bloqueo::Ninguno);
    }

    #[test]
    fn una_rotacion_publicada_se_reintenta_aunque_vuelva_la_dek_vieja() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let actual = b.abierta().unwrap().cabecera.dek_id.clone();
        let copia = b.listar_copias()[0].nombre.clone();
        let sal = desde_bytes(&b.dir.leer_copia(&copia).unwrap())
            .unwrap()
            .envolturas
            .recuperacion
            .unwrap()
            .kdf
            .sal;
        // ES: Publicada (p. ej. luego se restauró una copia con esa DEK).
        // EN: Published (e.g. a backup with that DEK was restored later).
        let reg = format!(
            r#"[{{"ruta":"copias/{copia}","accion":"recuperacion","dek_id":"{actual}","sal":"{sal}","publicada":true}}]"#
        );
        b.dir.escribir(PENDIENTES, reg.as_bytes()).unwrap();
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
        let f = desde_bytes(&b.dir.leer_copia(&copia).unwrap()).unwrap();
        assert!(f.envolturas.recuperacion.is_none());
        assert_eq!(b.estado().copias_pendientes, 0);
    }

    #[test]
    fn restaurar_una_copia_de_la_dek_vieja_no_anula_la_revocacion_pendiente() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let vieja = b.abierta().unwrap().cabecera.dek_id.clone();
        let copia = b.listar_copias()[0].nombre.clone();
        let bytes = b.dir.leer_copia(&copia).unwrap();
        let sal = desde_bytes(&bytes)
            .unwrap()
            .envolturas
            .recuperacion
            .unwrap()
            .kdf
            .sal;
        b.regenerar_recuperacion("4831").unwrap();
        // ES: Como si esa copia no se hubiera podido reenvolver y el cierre
        //     del registro hubiera fallado.
        // EN: As if that backup could not be rewrapped and closing the
        //     record had failed.
        b.dir.escribir_copia(&copia, &bytes).unwrap();
        let reg = format!(
            r#"[{{"ruta":"copias/{copia}","accion":"recuperacion","dek_id":"{vieja}","sal":"{sal}"}}]"#
        );
        b.dir.escribir(PENDIENTES, reg.as_bytes()).unwrap();
        b.restaurar_copia(&copia, Some("4831")).unwrap();
        // ES: La clave revocada no vuelve con la copia restaurada.
        // EN: The revoked key does not come back with the restored backup.
        assert!(!b.estado().tiene_recuperacion);
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
        let f = desde_bytes(&b.dir.leer_copia(&copia).unwrap()).unwrap();
        assert!(f.envolturas.recuperacion.is_none());
    }

    #[test]
    fn con_el_registro_ilegible_la_copia_restaurada_no_trae_recuperacion() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let copia = b.listar_copias()[0].nombre.clone();
        b.dir.escribir(PENDIENTES, b"{roto").unwrap();
        b.restaurar_copia(&copia, Some("4831")).unwrap();
        assert!(!b.estado().tiene_recuperacion);
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
    }

    #[test]
    fn dos_regeneraciones_no_dejan_la_primera_clave_en_copias_antiguas() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let copia = b.listar_copias()[0].nombre.clone();
        b.regenerar_recuperacion("4831").unwrap();
        let sal_r1 = desde_bytes(&b.dir.leer_copia(&copia).unwrap())
            .unwrap()
            .envolturas
            .recuperacion
            .unwrap()
            .kdf
            .sal;
        b.regenerar_recuperacion("4831").unwrap();
        let f = desde_bytes(&b.dir.leer_copia(&copia).unwrap()).unwrap();
        assert!(f
            .envolturas
            .recuperacion
            .is_none_or(|r| r.kdf.sal != sal_r1));
        assert!(f.envolturas.credencial.is_some());
    }

    #[test]
    fn una_carpeta_con_extension_bolsillo_no_bloquea_cambios() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        std::fs::create_dir(b.dir.ruta("copias/raro.bolsillo")).unwrap();
        assert!(b.regenerar_recuperacion("4831").is_ok());
    }

    #[test]
    fn una_entrada_sin_dek_queda_para_revision() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let copia = b.listar_copias()[0].nombre.clone();
        let reg = format!(r#"[{{"ruta":"copias/{copia}","accion":"proteger"}}]"#);
        b.dir.escribir(PENDIENTES, reg.as_bytes()).unwrap();
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
        assert_eq!(b.estado().copias_pendientes, 1);
    }

    #[test]
    fn un_registro_ilegible_impide_cambiar_la_proteccion() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        b.dir.escribir(PENDIENTES, b"{no es una lista").unwrap();
        assert!(b.configurar_bloqueo(Bloqueo::Pin, "4831").is_err());
        assert_eq!(
            b.dir.leer(PENDIENTES).unwrap().unwrap(),
            b"{no es una lista"
        );
    }

    #[test]
    fn una_regeneracion_sin_publicar_no_quita_la_recuperacion_de_las_copias() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let actual = b.abierta().unwrap().cabecera.dek_id.clone();
        let copia = b.listar_copias()[0].nombre.clone();
        // ES: Registro como si la regeneración se hubiera cortado antes de publicar.
        // EN: Record as if the regeneration had been cut before publishing.
        let reg =
            format!(r#"[{{"ruta":"copias/{copia}","accion":"recuperacion","dek_id":"{actual}"}}]"#);
        b.dir.escribir(PENDIENTES, reg.as_bytes()).unwrap();
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
        let f = desde_bytes(&b.dir.leer_copia(&copia).unwrap()).unwrap();
        assert!(f.envolturas.recuperacion.is_some());
        assert_eq!(b.estado().copias_pendientes, 0);
    }

    #[test]
    fn una_ruta_de_pendientes_alterada_no_reescribe_el_principal() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let antes = b.dir.leer(PRINCIPAL).unwrap();
        b.dir
            .escribir(
                PENDIENTES,
                br#"[{"ruta":"datos.bolsillo","accion":"credencial"},{"ruta":"copias/../datos.bolsillo","accion":"credencial"}]"#,
            )
            .unwrap();
        b.bloquear();
        b.abrir(Some("4831")).unwrap();
        assert_eq!(b.dir.leer(PRINCIPAL).unwrap(), antes);
        assert_eq!(b.estado().copias_pendientes, 0);
        assert!(ruta_pendiente_valida(
            "copias/reciente-000000000001.bolsillo"
        ));
        assert!(!ruta_pendiente_valida("copias/../x.bolsillo"));
    }

    #[test]
    fn un_recibo_distinto_con_el_mismo_id_no_se_pisa() {
        let (_t, mut b) = boveda();
        b.crear(
            "{}",
            &[recibo("r1", 10)],
            Bloqueo::Ninguno,
            None,
            false,
            "t",
        )
        .unwrap();
        assert_eq!(
            b.guardar("{}", &[recibo("r1", 11)]).err(),
            Some(ErrorAlmacen::Conflicto)
        );
        assert_eq!(
            b.leer_recibos(&["r1".into()]).unwrap()[0].datos,
            Some(recibo("r1", 10).datos)
        );
    }

    #[test]
    fn no_se_migra_si_hubo_almacen() {
        let (_t, mut b) = boveda();
        b.dir.escribir(MARCA, b"{}").unwrap();
        assert_eq!(
            b.preparar_migracion("{}", &[], Bloqueo::Ninguno, None, "h")
                .err(),
            Some(ErrorAlmacen::Existe)
        );
        let (_t2, mut c) = boveda();
        c.preparar_migracion("{}", &[], Bloqueo::Ninguno, None, "h")
            .unwrap();
        // ES: Entre preparar y confirmar aparece una copia: no se publica.
        // EN: A backup appears between prepare and confirm: nothing is published.
        c.dir
            .escribir_copia("reciente-000000000001.bolsillo", b"x")
            .unwrap();
        assert_eq!(c.confirmar_migracion().err(), Some(ErrorAlmacen::Existe));
        assert!(!c.dir.existe(PRINCIPAL));
    }

    #[test]
    fn guardar_no_pisa_un_principal_cambiado_en_disco() {
        let (_t, mut b) = boveda();
        b.crear("{\"a\":1}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        b.dir.escribir(PRINCIPAL, b"{otro").unwrap();
        assert_eq!(b.guardar("{}", &[]).err(), Some(ErrorAlmacen::Conflicto));
        assert_eq!(b.dir.leer(PRINCIPAL).unwrap().unwrap(), b"{otro");
    }

    #[test]
    fn restaurar_una_copia_danada_no_toca_el_principal() {
        let (_t, mut b) = boveda();
        b.crear("{\"a\":1}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        let copia = b.listar_copias()[0].nombre.clone();
        let mut v: serde_json::Value =
            serde_json::from_slice(&b.dir.leer_copia(&copia).unwrap()).unwrap();
        let campo = v.pointer_mut("/datos/ct").unwrap();
        let mut bytes = crate::formato::de_b64(campo.as_str().unwrap()).unwrap();
        bytes[0] ^= 1;
        *campo = crate::formato::b64(&bytes).into();
        b.dir
            .escribir_copia(&copia, &serde_json::to_vec(&v).unwrap())
            .unwrap();
        let antes = b.dir.leer(PRINCIPAL).unwrap();
        assert_eq!(
            b.restaurar_copia(&copia, Some("4831")).err(),
            Some(ErrorAlmacen::Danado)
        );
        assert_eq!(
            b.restaurar_copia(&copia, Some("0000")).err(),
            Some(ErrorAlmacen::Credencial)
        );
        assert_eq!(b.dir.leer(PRINCIPAL).unwrap(), antes);
    }

    #[test]
    fn un_recibo_existente_danado_se_reescribe() {
        let (_t, mut b) = boveda();
        b.crear(
            "{}",
            &[recibo("r1", 10)],
            Bloqueo::Ninguno,
            None,
            false,
            "t",
        )
        .unwrap();
        let id = b.abierta().unwrap().cabecera.dek_id.clone();
        b.dir.escribir_recibo(&id, "r1", b"basura").unwrap();
        b.guardar("{}", &[recibo("r1", 10)]).unwrap();
        assert!(b.leer_recibos(&["r1".into()]).unwrap()[0].datos.is_some());
    }

    #[test]
    fn envoltura_mal_formada_falla_antes_de_derivar() {
        let (_t, mut b) = boveda();
        b.crear("{}", &[], Bloqueo::Pin, Some("4831"), false, "t")
            .unwrap();
        b.bloquear();
        let mut v: serde_json::Value =
            serde_json::from_slice(&b.dir.leer(PRINCIPAL).unwrap().unwrap()).unwrap();
        v["envolturas"]["credencial"]["kdf"]["sal"] = crate::formato::b64(&[0u8; 4096]).into();
        b.dir
            .escribir(PRINCIPAL, &serde_json::to_vec(&v).unwrap())
            .unwrap();
        assert_eq!(b.abrir(Some("4831")).err(), Some(ErrorAlmacen::Danado));
    }

    #[test]
    fn version_nueva_no_se_toca() {
        let (_t, mut b) = boveda();
        b.dir
            .escribir(PRINCIPAL, b"{\"formato\":\"bolsillo\",\"v\":9}")
            .unwrap();
        assert_eq!(b.estado().motivo.as_deref(), Some("version"));
        assert_eq!(b.abrir(None).err(), Some(ErrorAlmacen::Version));
        assert_eq!(
            b.crear("{}", &[], Bloqueo::Ninguno, None, false, "t").err(),
            Some(ErrorAlmacen::Existe)
        );
    }

    #[test]
    fn migracion_en_tres_fases() {
        let (_t, mut b) = boveda();
        let datos = "{\"version\":3,\"puntuales\":[]}";
        let clave = b
            .preparar_migracion(
                datos,
                &[recibo("r1", 50)],
                Bloqueo::Pin,
                Some("12"),
                "huella",
            )
            .unwrap();
        assert!(clave.is_some());
        // ES: Antes de confirmar no hay principal ni marca. / EN: Before confirming there is no main file or marker.
        assert!(!b.estado().hay_fichero && !b.estado().hay_marca);
        assert_eq!(b.leer_migracion().unwrap(), datos);
        b.confirmar_migracion().unwrap();
        let e = b.estado();
        assert!(e.hay_fichero && e.hay_marca && e.abierta);
        assert_eq!(e.migracion.unwrap().huella, "huella");
        // ES: El PIN de 2 cifras de la 1.1.0 se respeta. / EN: The 2-digit 1.1.0 PIN is kept.
        b.bloquear();
        b.abrir(Some("12")).unwrap();
        // ES: Una segunda migración nunca pisa el fichero. / EN: A second migration never overwrites the file.
        assert_eq!(
            b.preparar_migracion("{}", &[], Bloqueo::Ninguno, None, "otra")
                .err(),
            Some(ErrorAlmacen::Existe)
        );
    }

    #[test]
    fn migracion_cancelada_se_aparta() {
        let (_t, mut b) = boveda();
        b.preparar_migracion("{}", &[], Bloqueo::Ninguno, None, "h")
            .unwrap();
        b.cancelar_migracion().unwrap();
        assert!(!b.dir.existe(MIGRANDO) && !b.dir.existe(PRINCIPAL));
        // ES: Se guarda aparte, pero no cuenta como "hubo almacén" (se puede reintentar).
        // EN: It is kept aside, but it does not count as "there was a store" (it can be retried).
        assert_eq!(std::fs::read_dir(b.dir.ruta("rescate")).unwrap().count(), 1);
        assert!(!b.estado().hay_rescate);
        assert_eq!(
            b.confirmar_migracion().err(),
            Some(ErrorAlmacen::Verificacion)
        );
    }

    #[test]
    fn copias_automaticas_y_restaurar() {
        let (_t, mut b) = boveda();
        b.crear("{\"n\":0}", &[], Bloqueo::Ninguno, None, false, "t")
            .unwrap();
        for i in 1..=12 {
            b.guardar(&format!("{{\"n\":{i}}}"), &[]).unwrap();
        }
        let copias = b.listar_copias();
        let recientes: Vec<_> = copias
            .iter()
            .filter(|c| c.nombre.starts_with("reciente-"))
            .collect();
        assert_eq!(recientes.len(), 10);
        // ES: Restaurar la más vieja que queda: el actual se guarda como "antes-".
        // EN: Restore the oldest one left: the current one is saved as "antes-".
        let vieja = recientes.last().unwrap().nombre.clone();
        // ES: Queda abierta con la copia y devuelve sus datos.
        // EN: It is left open with the backup and returns its data.
        assert_eq!(b.restaurar_copia(&vieja, None).unwrap(), "{\"n\":3}");
        assert!(b.estado().abierta);
        b.bloquear();
        assert_eq!(b.abrir(None).unwrap(), "{\"n\":3}");
        assert!(b
            .listar_copias()
            .iter()
            .any(|c| c.nombre.starts_with("antes-")));
        assert_eq!(
            b.restaurar_copia("../datos.bolsillo", None).err(),
            Some(ErrorAlmacen::SinCopia)
        );
    }

    #[test]
    fn activar_bloqueo_rota_la_dek_y_protege_las_copias_viejas() {
        let (_t, mut b) = boveda();
        b.crear(
            "{\"a\":1}",
            &[recibo("r1", 20)],
            Bloqueo::Ninguno,
            None,
            false,
            "t",
        )
        .unwrap();
        let id_viejo = b.abierta().unwrap().cabecera.dek_id.clone();
        let clave = b.configurar_bloqueo(Bloqueo::Pin, "7777").unwrap();
        let id_nuevo = b.abierta().unwrap().cabecera.dek_id.clone();
        assert_ne!(id_viejo, id_nuevo);
        // ES: El recibo se recifró con la DEK nueva. / EN: The receipt was re-encrypted with the new DEK.
        assert!(b.leer_recibos(&["r1".into()]).unwrap()[0].datos.is_some());
        // ES: Ninguna copia queda solo ofuscada. / EN: No backup is left only obfuscated.
        for c in b.listar_copias() {
            let f = desde_bytes(&b.dir.leer_copia(&c.nombre).unwrap()).unwrap();
            assert_ne!(f.bloqueo, Bloqueo::Ninguno, "{}", c.nombre);
            assert!(f.envolturas.ofuscacion.is_none());
            assert!(f.abrir_dek(None).is_err());
            assert!(f.abrir_dek(Some(Llave::Credencial("7777"))).is_ok());
        }
        b.bloquear();
        b.abrir(Some("7777")).unwrap();
        b.bloquear();
        b.abrir_con_recuperacion(&clave).unwrap();
        // ES: Ya bloqueado no se puede volver a "configurar". / EN: Already locked, it cannot be "configured" again.
        assert_eq!(
            b.configurar_bloqueo(Bloqueo::Pin, "1111").err(),
            Some(ErrorAlmacen::Existe)
        );
    }

    #[test]
    fn regenerar_recuperacion_invalida_la_anterior() {
        let (_t, mut b) = boveda();
        let vieja = b
            .crear("{}", &[], Bloqueo::Pin, Some("1357"), false, "t")
            .unwrap()
            .unwrap();
        assert_eq!(
            b.regenerar_recuperacion("0000").err(),
            Some(ErrorAlmacen::Credencial)
        );
        let nueva = b.regenerar_recuperacion("1357").unwrap();
        assert_ne!(vieja, nueva);
        b.bloquear();
        assert_eq!(
            b.abrir_con_recuperacion(&vieja).err(),
            Some(ErrorAlmacen::Credencial)
        );
        b.abrir_con_recuperacion(&nueva).unwrap();
        b.bloquear();
        b.abrir(Some("1357")).unwrap();
        // ES: Las copias con la DEK vieja ya no abren con la clave vieja.
        // EN: Backups with the old DEK no longer open with the old key.
        let norm_vieja = recuperacion::normalizar(&vieja).unwrap();
        for c in b.listar_copias() {
            let f = desde_bytes(&b.dir.leer_copia(&c.nombre).unwrap()).unwrap();
            assert!(f.abrir_dek(Some(Llave::Recuperacion(&norm_vieja))).is_err());
        }
    }

    #[test]
    fn cambiar_pin_pide_el_antiguo_y_mantiene_la_recuperacion() {
        let (_t, mut b) = boveda();
        let clave = b
            .crear("{}", &[], Bloqueo::Pin, Some("1111"), false, "t")
            .unwrap()
            .unwrap();
        assert_eq!(
            b.cambiar_credencial(Some("2222"), Bloqueo::Pin, "3333")
                .err(),
            Some(ErrorAlmacen::Credencial)
        );
        assert_eq!(
            b.cambiar_credencial(Some("1111"), Bloqueo::Password, "corta")
                .err(),
            Some(ErrorAlmacen::CredencialInvalida)
        );
        b.cambiar_credencial(Some("1111"), Bloqueo::Pin, "3333")
            .unwrap();
        b.bloquear();
        b.abrir(Some("3333")).unwrap();
        b.bloquear();
        b.abrir_con_recuperacion(&clave).unwrap();
        b.quitar_bloqueo().unwrap();
        b.bloquear();
        assert_eq!(b.abrir(None).unwrap(), "{}");
        assert!(!b.estado().tiene_recuperacion);
    }

    #[test]
    fn copia_cifrada_ida_y_vuelta_y_json_antiguo() {
        let (_t, b) = boveda();
        let datos = "{\"puntuales\":[{\"recibo\":\"data:x\"}]}";
        assert_eq!(
            b.bytes_copia(datos, "corta").err(),
            Some(ErrorAlmacen::CredencialInvalida)
        );
        let bytes = b.bytes_copia(datos, "contraseña-copia").unwrap();
        // ES: Otra instalación (bóveda limpia) la restaura. / EN: Another install (clean vault) restores it.
        let (_t2, mut otra) = boveda();
        assert_eq!(
            otra.elegir_copia(bytes).unwrap(),
            CopiaElegida::Cifrada {
                bloqueo: Bloqueo::Password
            }
        );
        assert_eq!(
            otra.descifrar_copia("mala-contraseña").err(),
            Some(ErrorAlmacen::Credencial)
        );
        assert_eq!(otra.descifrar_copia("contraseña-copia").unwrap(), datos);
        // ES: Un JSON de la 1.1.0 vuelve como texto. / EN: A 1.1.0 JSON comes back as text.
        assert_eq!(
            otra.elegir_copia(b"{\"recurrentes\":[]}".to_vec()).unwrap(),
            CopiaElegida::Json {
                contenido: "{\"recurrentes\":[]}".into()
            }
        );
        assert_eq!(
            otra.descifrar_copia("x").err(),
            Some(ErrorAlmacen::SinCopia)
        );
    }
}
