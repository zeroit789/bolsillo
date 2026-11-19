// =============================================================================
// cripto.rs — Primitivas de cifrado / Encryption primitives
// -----------------------------------------------------------------------------
// ES: Piezas criptográficas del almacén: bytes aleatorios del sistema, derivación
//     de claves con Argon2id y cifrado autenticado AES-256-GCM. Todo lo demás
//     (formato del fichero, envolturas de la clave de datos) se construye encima.
//     Las claves viven en `Zeroizing` para que su memoria se borre al soltarlas.
// EN: Cryptographic pieces of the store: system random bytes, key derivation
//     with Argon2id and AES-256-GCM authenticated encryption. Everything else
//     (file format, data-key wrappings) is built on top. Keys live in
//     `Zeroizing` so their memory is wiped when they are dropped.
// -----------------------------------------------------------------------------
// ÍNDICE / INDEX:
//   1. Tipos y errores / Types & errors
//   2. Parámetros de Argon2id / Argon2id parameters
//   3. Bytes aleatorios / Random bytes
//   4. Derivación de claves / Key derivation
//   5. Cifrar y descifrar / Encrypt & decrypt
//   6. Tests / Tests
// =============================================================================

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use serde::{Deserialize, Serialize};
use zeroize::Zeroizing;

// ── 1. Tipos y errores / Types & errors ──────────────────────────────────────
// ES: Tamaño de las claves (AES-256) y del nonce de AES-GCM.
// EN: Size of the keys (AES-256) and of the AES-GCM nonce.
pub const TAM_CLAVE: usize = 32;
pub const TAM_NONCE: usize = 12;
pub const TAM_SAL: usize = 16;

// ES: Clave de 256 bits que se borra de la memoria al soltarse.
// EN: 256-bit key that is wiped from memory when dropped.
pub type Clave = Zeroizing<[u8; TAM_CLAVE]>;

// ES: Fallos posibles. `Autenticacion` = AES-GCM no cuadra: clave incorrecta o
//     datos alterados (no se pueden distinguir).
// EN: Possible failures. `Autenticacion` = AES-GCM does not match: wrong key or
//     altered data (they cannot be told apart).
#[derive(Debug, PartialEq, Eq)]
pub enum ErrorCripto {
    Aleatorio,
    Parametros,
    Autenticacion,
}

// ── 2. Parámetros de Argon2id / Argon2id parameters ──────────────────────────
// ES: Parámetros de Argon2id que se guardan en la cabecera del fichero (así se
//     pueden subir en el futuro sin romper los ficheros viejos).
// EN: Argon2id parameters stored in the file header (so they can be raised in
//     the future without breaking old files).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct ParamsKdf {
    // ES: memoria en KiB / EN: memory in KiB
    pub m: u32,
    // ES: iteraciones / EN: iterations
    pub t: u32,
    // ES: paralelismo / EN: parallelism
    pub p: u32,
}

// ES: Parámetros por defecto: la primera configuración mínima de Argon2id de la
//     OWASP Password Storage Cheat Sheet (m = 47104 KiB = 46 MiB, t = 1, p = 1),
//     https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
//     consultada el 19-11-2026. La clave se deriva una sola vez al desbloquear.
// EN: Default parameters: the first minimum Argon2id configuration of the
//     OWASP Password Storage Cheat Sheet (m = 47104 KiB = 46 MiB, t = 1, p = 1),
//     https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
//     checked on 2026-11-19. The key is derived only once per unlock.
pub const KDF_OWASP: ParamsKdf = ParamsKdf {
    m: 47_104,
    t: 1,
    p: 1,
};

impl ParamsKdf {
    // ES: ¿Parámetros razonables? Una cabecera manipulada no debe poder pedir
    //     gigas de memoria ni horas de cálculo (ni bajar de lo mínimo de Argon2).
    // EN: Reasonable parameters? A tampered header must not be able to ask for
    //     gigabytes of memory or hours of work (nor go below Argon2's minimum).
    //     Tope: 256 MiB, 4 pasadas y 4 hilos (varias veces lo que se emite hoy).
    // EN: Cap: 256 MiB, 4 passes and 4 threads (several times what is emitted today).
    pub fn validos(&self) -> bool {
        (8..=262_144).contains(&self.m) && (1..=4).contains(&self.t) && (1..=4).contains(&self.p)
    }
}

// ── 3. Bytes aleatorios / Random bytes ────────────────────────────────────────
// ES: N bytes aleatorios del generador del sistema operativo.
// EN: N random bytes from the operating system's generator.
pub fn aleatorio<const N: usize>() -> Result<[u8; N], ErrorCripto> {
    let mut b = [0u8; N];
    getrandom::fill(&mut b).map_err(|_| ErrorCripto::Aleatorio)?;
    Ok(b)
}

// ES: Clave de datos nueva (256 bits aleatorios).
// EN: New data key (256 random bits).
pub fn clave_nueva() -> Result<Clave, ErrorCripto> {
    Ok(Zeroizing::new(aleatorio::<TAM_CLAVE>()?))
}

// ── 4. Derivación de claves / Key derivation ──────────────────────────────────
// ES: Deriva una clave de 256 bits de un secreto (PIN, contraseña o clave de
//     recuperación) y una sal con Argon2id v1.3.
// EN: Derives a 256-bit key from a secret (PIN, password or recovery key) and
//     a salt with Argon2id v1.3.
pub fn derivar(secreto: &[u8], sal: &[u8], params: &ParamsKdf) -> Result<Clave, ErrorCripto> {
    if !params.validos() || sal.len() < 8 {
        return Err(ErrorCripto::Parametros);
    }
    let p = Params::new(params.m, params.t, params.p, Some(TAM_CLAVE))
        .map_err(|_| ErrorCripto::Parametros)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, p);
    let mut out = Zeroizing::new([0u8; TAM_CLAVE]);
    argon
        .hash_password_into(secreto, sal, out.as_mut())
        .map_err(|_| ErrorCripto::Parametros)?;
    Ok(out)
}

// ── 5. Cifrar y descifrar / Encrypt & decrypt ─────────────────────────────────
// ES: Cifra con AES-256-GCM y un nonce aleatorio nuevo. `aad` son datos
//     asociados: no se cifran, pero si no cuadran al descifrar, falla (ata el
//     cifrado a su papel: datos, recibo, envoltura…). Devuelve (nonce, cifrado).
// EN: Encrypts with AES-256-GCM and a fresh random nonce. `aad` is associated
//     data: not encrypted, but if it does not match on decrypt, it fails (binds
//     the ciphertext to its role: data, receipt, wrapping…). Returns (nonce,
//     ciphertext).
pub fn cifrar(
    clave: &[u8; TAM_CLAVE],
    aad: &[u8],
    claro: &[u8],
) -> Result<([u8; TAM_NONCE], Vec<u8>), ErrorCripto> {
    let nonce_b = aleatorio::<TAM_NONCE>()?;
    let cifrador = Aes256Gcm::new_from_slice(clave).map_err(|_| ErrorCripto::Parametros)?;
    let nonce = Nonce::try_from(&nonce_b[..]).map_err(|_| ErrorCripto::Parametros)?;
    let ct = cifrador
        .encrypt(&nonce, Payload { msg: claro, aad })
        .map_err(|_| ErrorCripto::Parametros)?;
    Ok((nonce_b, ct))
}

// ES: Descifra y comprueba la etiqueta. El texto en claro vuelve en
//     `Zeroizing` para borrarse al soltarlo (puede ser la clave de datos).
// EN: Decrypts and checks the tag. The plaintext comes back in `Zeroizing` so
//     it is wiped when dropped (it may be the data key).
pub fn descifrar(
    clave: &[u8; TAM_CLAVE],
    nonce: &[u8],
    aad: &[u8],
    ct: &[u8],
) -> Result<Zeroizing<Vec<u8>>, ErrorCripto> {
    let cifrador = Aes256Gcm::new_from_slice(clave).map_err(|_| ErrorCripto::Parametros)?;
    let nonce = Nonce::try_from(nonce).map_err(|_| ErrorCripto::Parametros)?;
    cifrador
        .decrypt(&nonce, Payload { msg: ct, aad })
        .map(Zeroizing::new)
        .map_err(|_| ErrorCripto::Autenticacion)
}

// ── 6. Tests / Tests ──────────────────────────────────────────────────────────
#[cfg(test)]
pub mod tests {
    use super::*;

    // ES: Parámetros baratos solo para tests (la derivación real tarda más).
    // EN: Cheap parameters for tests only (the real derivation takes longer).
    pub const KDF_TEST: ParamsKdf = ParamsKdf { m: 64, t: 1, p: 1 };

    #[test]
    fn ida_y_vuelta_con_aad() {
        let k = clave_nueva().unwrap();
        let (n, ct) = cifrar(&k, b"rol", b"hola").unwrap();
        assert_eq!(descifrar(&k, &n, b"rol", &ct).unwrap().as_slice(), b"hola");
        // ES: Otro AAD u otra clave fallan. / EN: Another AAD or key fails.
        assert_eq!(
            descifrar(&k, &n, b"otro", &ct),
            Err(ErrorCripto::Autenticacion)
        );
        let k2 = clave_nueva().unwrap();
        assert_eq!(
            descifrar(&k2, &n, b"rol", &ct),
            Err(ErrorCripto::Autenticacion)
        );
    }

    #[test]
    fn nonces_distintos() {
        let k = clave_nueva().unwrap();
        let (n1, c1) = cifrar(&k, b"", b"x").unwrap();
        let (n2, c2) = cifrar(&k, b"", b"x").unwrap();
        assert_ne!(n1, n2);
        assert_ne!(c1, c2);
    }

    #[test]
    fn derivar_es_determinista_y_depende_de_la_sal() {
        let a = derivar(b"1234", b"salsalsalsal", &KDF_TEST).unwrap();
        let b = derivar(b"1234", b"salsalsalsal", &KDF_TEST).unwrap();
        let c = derivar(b"1234", b"otrasalotrasal", &KDF_TEST).unwrap();
        assert_eq!(*a, *b);
        assert_ne!(*a, *c);
    }

    #[test]
    fn parametros_absurdos_se_rechazan() {
        let malos = ParamsKdf {
            m: 10_000_000,
            t: 1,
            p: 1,
        };
        assert_eq!(
            derivar(b"x", b"salsalsal", &malos).err(),
            Some(ErrorCripto::Parametros)
        );
        assert!(KDF_OWASP.validos());
    }

    #[test]
    fn derivar_con_parametros_owasp() {
        // ES: Una vez con los parámetros reales (m = 46 MiB) para que no fallen en uso.
        // EN: Once with the real parameters (m = 46 MiB) so they do not fail in use.
        let k = derivar(b"123456", &[7u8; TAM_SAL], &KDF_OWASP).unwrap();
        assert_eq!(k.len(), TAM_CLAVE);
    }
}
