// =============================================================================
// formato.rs — Formato del fichero cifrado / Encrypted file format
// -----------------------------------------------------------------------------
// ES: Formato de `datos.bolsillo` y de las copias cifradas (versión de formato 2;
//     la 1 era el blob PBKDF2 de localStorage hasta la 1.1.0). Es un JSON con
//     una cabecera EN CLARO y el contenido cifrado:
//       {
//         "formato": "bolsillo", "v": 2, "tipo": "datos" | "copia",
//         "bloqueo": "ninguno" | "pin" | "password",
//         "dek_id": "<16 hex>",
//         "envolturas": {
//           "credencial":   { "kdf": {"alg":"argon2id","m","t","p","sal"}, "nonce", "ct" },
//           "recuperacion": { "kdf": {…}, "nonce", "ct" },
//           "ofuscacion":   { "nonce", "ct" }
//         },
//         "migracion": { "desde", "fecha", "huella" },      (opcional)
//         "datos": { "nonce", "ct" }
//       }
//     El contenido va cifrado con una clave de datos (DEK) aleatoria de 256 bits
//     y AES-256-GCM. La DEK se guarda "envuelta" (cifrada) una vez por cada
//     forma de abrir: con la clave derivada del PIN/contraseña (Argon2id), con
//     la derivada de la clave de recuperación y, sin bloqueo, con una clave de
//     ofuscación fija que está en el código público (NO protege nada).
//     El tipo de bloqueo vive en la cabecera: no depende de localStorage.
// EN: Format of `datos.bolsillo` and of the encrypted backups (format version 2;
//     version 1 was the localStorage PBKDF2 blob up to 1.1.0). It is a JSON with
//     a PLAINTEXT header and the encrypted content (see the shape above). The
//     content is encrypted with a random 256-bit data key (DEK) and AES-256-GCM.
//     The DEK is stored "wrapped" (encrypted) once per way to open: with the key
//     derived from the PIN/password (Argon2id), with the one derived from the
//     recovery key and, without a lock, with a fixed obfuscation key that lives
//     in the public code (it protects NOTHING). The lock type lives in the
//     header: it does not depend on localStorage.
// -----------------------------------------------------------------------------
// ÍNDICE / INDEX:
//   1. Errores / Errors
//   2. Tipos de la cabecera / Header types
//   3. Base64 y datos asociados / Base64 & associated data
//   4. Envolver la clave de datos / Wrapping the data key
//   5. Construir y abrir ficheros / Building & opening files
//   6. Leer y escribir bytes / Reading & writing bytes
//   7. Tests / Tests
// =============================================================================

use base64::engine::general_purpose::STANDARD as B64;
use base64::Engine;
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

use crate::cripto::{
    self, aleatorio, cifrar, derivar, descifrar, Clave, ErrorCripto, ParamsKdf, TAM_CLAVE,
    TAM_NONCE, TAM_SAL,
};

// ── 1. Errores / Errors ──────────────────────────────────────────────────────
// ES: Errores del almacén. `codigo()` es lo que recibe el frontend.
// EN: Store errors. `codigo()` is what the frontend receives.
#[derive(Debug, PartialEq, Eq)]
pub enum ErrorAlmacen {
    // ES: no hay fichero / EN: there is no file
    Vacio,
    // ES: el fichero no tiene la forma esperada / EN: the file does not have the expected shape
    Danado,
    // ES: lo escribió una versión más nueva / EN: written by a newer version
    Version,
    // ES: credencial incorrecta o datos alterados / EN: wrong credential or altered data
    Credencial,
    // ES: clave de recuperación mal escrita / EN: recovery key mistyped
    RecuperacionFormato,
    RecuperacionComprobacion,
    // ES: el fichero no tiene clave de recuperación / EN: the file has no recovery key
    SinRecuperacion,
    // ES: no hay clave de datos en memoria / EN: no data key in memory
    Bloqueado,
    // ES: ya existe un fichero válido: nunca se pisa / EN: a valid file exists: never overwritten
    Existe,
    // ES: PIN o contraseña que no cumple el mínimo / EN: PIN or password below the minimum
    CredencialInvalida,
    // ES: no hay copia elegida o no existe / EN: no chosen backup or it does not exist
    SinCopia,
    // ES: la migración no se pudo verificar / EN: the migration could not be verified
    Verificacion,
    // ES: el fichero elegido no lleva los recibos dentro / EN: the picked file does not carry the receipts
    NoAutosuficiente,
    // ES: destino de exportación dentro del almacén / EN: export target inside the store
    DestinoProtegido,
    Io(String),
    Interno,
}

impl ErrorAlmacen {
    // ES: Código de texto estable para el frontend. / EN: Stable text code for the frontend.
    pub fn codigo(&self) -> String {
        match self {
            ErrorAlmacen::Vacio => "vacio".into(),
            ErrorAlmacen::Danado => "danado".into(),
            ErrorAlmacen::Version => "version".into(),
            ErrorAlmacen::Credencial => "credencial".into(),
            ErrorAlmacen::RecuperacionFormato => "recuperacion-formato".into(),
            ErrorAlmacen::RecuperacionComprobacion => "recuperacion-comprobacion".into(),
            ErrorAlmacen::SinRecuperacion => "sin-recuperacion".into(),
            ErrorAlmacen::Bloqueado => "bloqueado".into(),
            ErrorAlmacen::Existe => "existe".into(),
            ErrorAlmacen::CredencialInvalida => "credencial-invalida".into(),
            ErrorAlmacen::SinCopia => "sin-copia".into(),
            ErrorAlmacen::Verificacion => "verificacion".into(),
            ErrorAlmacen::NoAutosuficiente => "no-autosuficiente".into(),
            ErrorAlmacen::DestinoProtegido => "destino-protegido".into(),
            ErrorAlmacen::Io(m) => format!("io:{m}"),
            ErrorAlmacen::Interno => "interno".into(),
        }
    }
}

impl From<std::io::Error> for ErrorAlmacen {
    fn from(e: std::io::Error) -> Self {
        ErrorAlmacen::Io(e.to_string())
    }
}

impl From<ErrorCripto> for ErrorAlmacen {
    fn from(e: ErrorCripto) -> Self {
        match e {
            ErrorCripto::Autenticacion => ErrorAlmacen::Credencial,
            ErrorCripto::Parametros => ErrorAlmacen::Danado,
            ErrorCripto::Aleatorio => ErrorAlmacen::Interno,
        }
    }
}

// ── 2. Tipos de la cabecera / Header types ────────────────────────────────────
// ES: Versión de formato que escribe esta versión de Bolsillo.
// EN: Format version written by this Bolsillo version.
pub const FORMATO: &str = "bolsillo";
pub const VERSION_FORMATO: u32 = 2;

// ES: Tipo de bloqueo. / EN: Lock type.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Bloqueo {
    Ninguno,
    Pin,
    Password,
}

// ES: Qué es el fichero: los datos de la app o una copia exportada.
// EN: What the file is: the app's data or an exported backup.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TipoFichero {
    Datos,
    Copia,
}

// ES: Parámetros de la derivación guardados junto a su sal.
// EN: Derivation parameters stored next to their salt.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Kdf {
    pub alg: String,
    pub m: u32,
    pub t: u32,
    pub p: u32,
    pub sal: String,
}

// ES: Un cifrado: nonce y texto cifrado (con su etiqueta) en base64.
// EN: A ciphertext: nonce and ciphertext (with its tag) in base64.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Cifrado {
    pub nonce: String,
    pub ct: String,
}

// ES: La DEK envuelta con una clave derivada de un secreto (con su KDF).
// EN: The DEK wrapped with a key derived from a secret (with its KDF).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct EnvolturaKdf {
    pub kdf: Kdf,
    #[serde(flatten)]
    pub cifrado: Cifrado,
}

// ES: Formas de abrir la DEK. / EN: Ways to open the DEK.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Envolturas {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub credencial: Option<EnvolturaKdf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub recuperacion: Option<EnvolturaKdf>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ofuscacion: Option<Cifrado>,
}

// ES: Marca de la migración desde localStorage: de dónde, cuándo y la huella
//     (SHA-256) del blob de origen, para saber si luego cambió.
// EN: Mark of the migration from localStorage: from where, when and the
//     fingerprint (SHA-256) of the source blob, to know if it changed later.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Migracion {
    pub desde: String,
    pub fecha: String,
    pub huella: String,
}

// ES: El fichero completo. / EN: The whole file.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Fichero {
    pub formato: String,
    pub v: u32,
    pub tipo: TipoFichero,
    pub bloqueo: Bloqueo,
    pub dek_id: String,
    pub envolturas: Envolturas,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub migracion: Option<Migracion>,
    pub datos: Cifrado,
}

// ── 3. Base64 y datos asociados / Base64 & associated data ────────────────────
// ES: Clave de ofuscación fija (modo sin bloqueo). Está en el código público:
//     cualquiera puede abrir un fichero "ninguno". Solo evita el texto en claro.
// EN: Fixed obfuscation key (no-lock mode). It is in the public code: anyone
//     can open a "ninguno" file. It only avoids plaintext.
const CLAVE_OFUSCACION: [u8; TAM_CLAVE] = *b"bolsillo::ofuscacion::v2::Z3r0!!";

pub fn b64(b: &[u8]) -> String {
    B64.encode(b)
}

pub fn de_b64(s: &str) -> Result<Vec<u8>, ErrorAlmacen> {
    B64.decode(s).map_err(|_| ErrorAlmacen::Danado)
}

// ES: Datos asociados de cada papel: atan cada cifrado a su sitio y a su DEK.
// EN: Associated data of each role: binds each ciphertext to its place and DEK.
fn aad_datos(tipo: TipoFichero, dek_id: &str) -> Vec<u8> {
    let t = match tipo {
        TipoFichero::Datos => "datos",
        TipoFichero::Copia => "copia",
    };
    format!("bolsillo/{t}/{dek_id}").into_bytes()
}
fn aad_envoltura(rol: &str, dek_id: &str) -> Vec<u8> {
    format!("bolsillo/dek/{rol}/{dek_id}").into_bytes()
}
pub fn aad_recibo(id: &str, dek_id: &str) -> Vec<u8> {
    format!("bolsillo/recibo/{id}/{dek_id}").into_bytes()
}

// ES: Identificador nuevo de DEK (8 bytes en hexadecimal).
// EN: New DEK identifier (8 bytes in hexadecimal).
pub fn dek_id_nuevo() -> Result<String, ErrorAlmacen> {
    Ok(aleatorio::<8>()?
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect())
}

// ES: Cifra con un nonce nuevo y lo empaqueta en base64.
// EN: Encrypts with a fresh nonce and packs it into base64.
fn cifrar_b64(clave: &[u8; TAM_CLAVE], aad: &[u8], claro: &[u8]) -> Result<Cifrado, ErrorAlmacen> {
    let (n, ct) = cifrar(clave, aad, claro)?;
    Ok(Cifrado {
        nonce: b64(&n),
        ct: b64(&ct),
    })
}

// ES: Descifra un Cifrado (base64 roto o nonce de otro tamaño = dañado).
// EN: Decrypts a Cifrado (broken base64 or wrong nonce size = damaged).
fn descifrar_b64(
    clave: &[u8; TAM_CLAVE],
    aad: &[u8],
    c: &Cifrado,
) -> Result<Zeroizing<Vec<u8>>, ErrorAlmacen> {
    let n = de_b64(&c.nonce)?;
    let ct = de_b64(&c.ct)?;
    if n.len() != TAM_NONCE || ct.len() < 16 {
        return Err(ErrorAlmacen::Danado);
    }
    Ok(descifrar(clave, &n, aad, &ct)?)
}

// ── 4. Envolver la clave de datos / Wrapping the data key ─────────────────────
// ES: Convierte un texto en claro de 32 bytes en una Clave (si no mide 32, dañado).
// EN: Turns a 32-byte plaintext into a Clave (if it is not 32 bytes, damaged).
fn a_clave(v: &[u8]) -> Result<Clave, ErrorAlmacen> {
    let arr: [u8; TAM_CLAVE] = v.try_into().map_err(|_| ErrorAlmacen::Danado)?;
    Ok(Zeroizing::new(arr))
}

// ES: Envuelve la DEK con la clave derivada de `secreto` (sal nueva).
// EN: Wraps the DEK with the key derived from `secreto` (new salt).
pub fn envolver_con_secreto(
    secreto: &[u8],
    rol: &str,
    dek_id: &str,
    dek: &Clave,
    params: &ParamsKdf,
) -> Result<EnvolturaKdf, ErrorAlmacen> {
    let sal = aleatorio::<TAM_SAL>()?;
    let kek = derivar(secreto, &sal, params)?;
    envolver_con_kek(&kek, &sal, rol, dek_id, dek, params)
}

// ES: Envuelve la DEK con una KEK ya derivada (para reenvolver varias copias
//     con una sola derivación).
// EN: Wraps the DEK with an already derived KEK (to rewrap several backups
//     with a single derivation).
pub fn envolver_con_kek(
    kek: &Clave,
    sal: &[u8],
    rol: &str,
    dek_id: &str,
    dek: &Clave,
    params: &ParamsKdf,
) -> Result<EnvolturaKdf, ErrorAlmacen> {
    Ok(EnvolturaKdf {
        kdf: Kdf {
            alg: "argon2id".into(),
            m: params.m,
            t: params.t,
            p: params.p,
            sal: b64(sal),
        },
        cifrado: cifrar_b64(kek, &aad_envoltura(rol, dek_id), dek.as_ref())?,
    })
}

// ES: Abre una envoltura con un secreto (vuelve a derivar con su sal y parámetros).
// EN: Opens a wrapping with a secret (derives again with its salt and parameters).
pub fn abrir_con_secreto(
    secreto: &[u8],
    rol: &str,
    dek_id: &str,
    e: &EnvolturaKdf,
) -> Result<Clave, ErrorAlmacen> {
    if e.kdf.alg != "argon2id" {
        return Err(ErrorAlmacen::Danado);
    }
    let params = ParamsKdf {
        m: e.kdf.m,
        t: e.kdf.t,
        p: e.kdf.p,
    };
    if !params.validos() {
        return Err(ErrorAlmacen::Danado);
    }
    let sal = de_b64(&e.kdf.sal)?;
    let kek = derivar(secreto, &sal, &params)?;
    let claro = descifrar_b64(&kek, &aad_envoltura(rol, dek_id), &e.cifrado)?;
    a_clave(&claro)
}

// ES: Abre una envoltura con una KEK ya derivada. / EN: Opens a wrapping with an already derived KEK.
pub fn abrir_con_kek(
    kek: &Clave,
    rol: &str,
    dek_id: &str,
    e: &Cifrado,
) -> Result<Clave, ErrorAlmacen> {
    let claro = descifrar_b64(kek, &aad_envoltura(rol, dek_id), e)?;
    a_clave(&claro)
}

// ES: Envoltura de ofuscación (modo sin bloqueo). / EN: Obfuscation wrapping (no-lock mode).
pub fn envolver_ofuscacion(dek_id: &str, dek: &Clave) -> Result<Cifrado, ErrorAlmacen> {
    cifrar_b64(
        &CLAVE_OFUSCACION,
        &aad_envoltura("ofuscacion", dek_id),
        dek.as_ref(),
    )
}

// ── 5. Construir y abrir ficheros / Building & opening files ──────────────────
// ES: Cómo abrir un fichero bloqueado: con su credencial o con la clave de
//     recuperación (ya normalizada).
// EN: How to open a locked file: with its credential or with the (already
//     normalized) recovery key.
pub enum Llave<'a> {
    Credencial(&'a str),
    Recuperacion(&'a str),
}

impl Fichero {
    // ES: Cabecera nueva con la DEK dada y el contenido cifrado. Con bloqueo
    //     hacen falta la credencial y (en los datos) la clave de recuperación
    //     normalizada; sin bloqueo se usa la ofuscación.
    // EN: New header with the given DEK and the encrypted content. With a lock,
    //     the credential and (for data) the normalized recovery key are needed;
    //     without a lock, obfuscation is used.
    #[allow(clippy::too_many_arguments)]
    pub fn nuevo(
        tipo: TipoFichero,
        bloqueo: Bloqueo,
        dek: &Clave,
        dek_id: &str,
        credencial: Option<&str>,
        recuperacion: Option<&str>,
        params: &ParamsKdf,
        claro: &[u8],
    ) -> Result<Fichero, ErrorAlmacen> {
        let mut env = Envolturas::default();
        if bloqueo == Bloqueo::Ninguno {
            env.ofuscacion = Some(envolver_ofuscacion(dek_id, dek)?);
        } else {
            let c = credencial.ok_or(ErrorAlmacen::CredencialInvalida)?;
            env.credencial = Some(envolver_con_secreto(
                c.as_bytes(),
                "credencial",
                dek_id,
                dek,
                params,
            )?);
            if let Some(r) = recuperacion {
                env.recuperacion = Some(envolver_con_secreto(
                    r.as_bytes(),
                    "recuperacion",
                    dek_id,
                    dek,
                    params,
                )?);
            }
        }
        Ok(Fichero {
            formato: FORMATO.into(),
            v: VERSION_FORMATO,
            tipo,
            bloqueo,
            dek_id: dek_id.into(),
            envolturas: env,
            migracion: None,
            datos: cifrar_b64(dek, &aad_datos(tipo, dek_id), claro)?,
        })
    }

    // ES: Saca la DEK: sin bloqueo, con la ofuscación; con bloqueo, con la llave
    //     dada. Sin bloqueo la clave es fija, así que si no abre es daño seguro
    //     (Danado), nunca una credencial mala.
    // EN: Gets the DEK: without a lock, with obfuscation; with a lock, with the
    //     given key. Without a lock the key is fixed, so if it does not open it
    //     is certain damage (Danado), never a wrong credential.
    pub fn abrir_dek(&self, llave: Option<Llave>) -> Result<Clave, ErrorAlmacen> {
        if self.bloqueo == Bloqueo::Ninguno {
            let e = self
                .envolturas
                .ofuscacion
                .as_ref()
                .ok_or(ErrorAlmacen::Danado)?;
            let kek = Zeroizing::new(CLAVE_OFUSCACION);
            return abrir_con_kek(&kek, "ofuscacion", &self.dek_id, e)
                .map_err(|_| ErrorAlmacen::Danado);
        }
        match llave {
            Some(Llave::Credencial(c)) => {
                let e = self
                    .envolturas
                    .credencial
                    .as_ref()
                    .ok_or(ErrorAlmacen::Danado)?;
                abrir_con_secreto(c.as_bytes(), "credencial", &self.dek_id, e)
            }
            Some(Llave::Recuperacion(r)) => {
                let e = self
                    .envolturas
                    .recuperacion
                    .as_ref()
                    .ok_or(ErrorAlmacen::SinRecuperacion)?;
                abrir_con_secreto(r.as_bytes(), "recuperacion", &self.dek_id, e)
            }
            None => Err(ErrorAlmacen::Credencial),
        }
    }

    // ES: Descifra el contenido con la DEK. Solo se llama con una DEK que ya
    //     abrió su envoltura (es la buena), así que si el contenido no
    //     autentica es daño seguro: Danado, no "credencial incorrecta" (H1).
    // EN: Decrypts the content with the DEK. It is only called with a DEK that
    //     already opened its wrapping (it is the right one), so if the content
    //     does not authenticate it is certain damage: Danado, not "wrong
    //     credential" (H1).
    pub fn descifrar_datos(&self, dek: &Clave) -> Result<Zeroizing<Vec<u8>>, ErrorAlmacen> {
        descifrar_b64(dek, &aad_datos(self.tipo, &self.dek_id), &self.datos).map_err(|e| {
            if e == ErrorAlmacen::Credencial {
                ErrorAlmacen::Danado
            } else {
                e
            }
        })
    }

    // ES: Sustituye el contenido cifrado (misma cabecera y misma DEK).
    // EN: Replaces the encrypted content (same header and same DEK).
    pub fn cambiar_datos(&mut self, dek: &Clave, claro: &[u8]) -> Result<(), ErrorAlmacen> {
        self.datos = cifrar_b64(dek, &aad_datos(self.tipo, &self.dek_id), claro)?;
        Ok(())
    }
}

// ES: Cifra un recibo (nonce + cifrado en binario). / EN: Encrypts a receipt (nonce + ciphertext, binary).
pub fn cifrar_recibo(
    dek: &Clave,
    dek_id: &str,
    id: &str,
    claro: &[u8],
) -> Result<Vec<u8>, ErrorAlmacen> {
    let (n, ct) = cifrar(dek, &aad_recibo(id, dek_id), claro)?;
    let mut out = n.to_vec();
    out.extend_from_slice(&ct);
    Ok(out)
}

// ES: Descifra un recibo. / EN: Decrypts a receipt.
pub fn descifrar_recibo(
    dek: &Clave,
    dek_id: &str,
    id: &str,
    bytes: &[u8],
) -> Result<Zeroizing<Vec<u8>>, ErrorAlmacen> {
    if bytes.len() < TAM_NONCE + 16 {
        return Err(ErrorAlmacen::Danado);
    }
    Ok(cripto::descifrar(
        dek,
        &bytes[..TAM_NONCE],
        &aad_recibo(id, dek_id),
        &bytes[TAM_NONCE..],
    )?)
}

// ── 6. Leer y escribir bytes / Reading & writing bytes ────────────────────────
// ES: Serializa el fichero (JSON compacto). / EN: Serializes the file (compact JSON).
pub fn a_bytes(f: &Fichero) -> Result<Vec<u8>, ErrorAlmacen> {
    serde_json::to_vec(f).map_err(|_| ErrorAlmacen::Interno)
}

// ES: Lee un fichero: primero formato y versión (una versión más nueva se
//     distingue de un fichero roto), después la forma completa.
// EN: Reads a file: format and version first (a newer version is told apart
//     from a broken file), then the full shape.
pub fn desde_bytes(b: &[u8]) -> Result<Fichero, ErrorAlmacen> {
    #[derive(Deserialize)]
    struct Minimo {
        formato: String,
        v: u32,
    }
    let m: Minimo = serde_json::from_slice(b).map_err(|_| ErrorAlmacen::Danado)?;
    if m.formato != FORMATO {
        return Err(ErrorAlmacen::Danado);
    }
    if m.v > VERSION_FORMATO {
        return Err(ErrorAlmacen::Version);
    }
    if m.v != VERSION_FORMATO {
        return Err(ErrorAlmacen::Danado);
    }
    let f: Fichero = serde_json::from_slice(b).map_err(|_| ErrorAlmacen::Danado)?;
    let id_ok = f.dek_id.len() == 16 && f.dek_id.chars().all(|c| c.is_ascii_hexdigit());
    if !id_ok {
        return Err(ErrorAlmacen::Danado);
    }
    Ok(f)
}

// ── 7. Tests / Tests ──────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;
    use crate::cripto::{clave_nueva, tests::KDF_TEST};

    fn fichero(bloqueo: Bloqueo) -> (Fichero, Clave) {
        let dek = clave_nueva().unwrap();
        let id = dek_id_nuevo().unwrap();
        let cred = (bloqueo != Bloqueo::Ninguno).then_some("1234");
        let rec = (bloqueo != Bloqueo::Ninguno).then_some("RECUPERACION");
        let f = Fichero::nuevo(
            TipoFichero::Datos,
            bloqueo,
            &dek,
            &id,
            cred,
            rec,
            &KDF_TEST,
            b"{\"a\":1}",
        )
        .unwrap();
        (f, dek)
    }

    #[test]
    fn pin_correcto_incorrecto_y_recuperacion_sin_pin() {
        let (f, dek) = fichero(Bloqueo::Pin);
        let f = desde_bytes(&a_bytes(&f).unwrap()).unwrap();
        let k = f.abrir_dek(Some(Llave::Credencial("1234"))).unwrap();
        assert_eq!(*k, *dek);
        assert_eq!(f.descifrar_datos(&k).unwrap().as_slice(), b"{\"a\":1}");
        assert_eq!(
            f.abrir_dek(Some(Llave::Credencial("0000"))).err(),
            Some(ErrorAlmacen::Credencial)
        );
        // ES: Sin el PIN, la clave de recuperación abre igual.
        // EN: Without the PIN, the recovery key opens it all the same.
        let k2 = f
            .abrir_dek(Some(Llave::Recuperacion("RECUPERACION")))
            .unwrap();
        assert_eq!(*k2, *dek);
    }

    #[test]
    fn sin_bloqueo_abre_sin_llave() {
        let (f, dek) = fichero(Bloqueo::Ninguno);
        assert_eq!(*f.abrir_dek(None).unwrap(), *dek);
        assert!(f.envolturas.credencial.is_none() && f.envolturas.recuperacion.is_none());
    }

    #[test]
    fn version_nueva_y_danado_se_distinguen() {
        let (f, _) = fichero(Bloqueo::Ninguno);
        let mut v: serde_json::Value = serde_json::from_slice(&a_bytes(&f).unwrap()).unwrap();
        v["v"] = 3.into();
        assert_eq!(
            desde_bytes(&serde_json::to_vec(&v).unwrap()).err(),
            Some(ErrorAlmacen::Version)
        );
        assert_eq!(desde_bytes(b"no es json").err(), Some(ErrorAlmacen::Danado));
        assert_eq!(
            desde_bytes(b"{\"formato\":\"otro\",\"v\":2}").err(),
            Some(ErrorAlmacen::Danado)
        );
    }

    #[test]
    fn cambiar_el_tipo_o_el_dek_id_rompe_el_descifrado() {
        let (mut f, dek) = fichero(Bloqueo::Ninguno);
        f.tipo = TipoFichero::Copia;
        assert_eq!(f.descifrar_datos(&dek).err(), Some(ErrorAlmacen::Danado));
    }

    #[test]
    fn recibo_atado_a_su_id() {
        let dek = clave_nueva().unwrap();
        let c = cifrar_recibo(&dek, "00", "r1", b"img").unwrap();
        assert_eq!(
            descifrar_recibo(&dek, "00", "r1", &c).unwrap().as_slice(),
            b"img"
        );
        assert!(descifrar_recibo(&dek, "00", "r2", &c).is_err());
    }
}
