// =============================================================================
// recuperacion.rs — Clave de recuperación / Recovery key
// -----------------------------------------------------------------------------
// ES: Genera y comprueba la clave de recuperación: 30 símbolos aleatorios en
//     base32 de Crockford (150 bits) más 2 símbolos de comprobación, en 8 grupos
//     de 4 (XXXX-XXXX-…). La comprobación caza cualquier símbolo mal tecleado y
//     cualquier par de símbolos vecinos intercambiado. Al leerla se toleran
//     minúsculas, espacios, guiones y las confusiones O→0 e I/L→1.
// EN: Generates and checks the recovery key: 30 random Crockford base32
//     symbols (150 bits) plus 2 check symbols, in 8 groups of 4 (XXXX-XXXX-…).
//     The check catches any single mistyped symbol and any swapped pair of
//     neighbouring symbols. When reading it, lowercase, spaces, hyphens and the
//     O→0 and I/L→1 confusions are tolerated.
// -----------------------------------------------------------------------------
// ÍNDICE / INDEX:
//   1. Alfabeto y tamaños / Alphabet & sizes
//   2. Suma de comprobación / Checksum
//   3. Generar / Generate
//   4. Normalizar y comprobar / Normalize & check
//   5. Tests / Tests
// =============================================================================

use crate::cripto::{aleatorio, ErrorCripto};

// ── 1. Alfabeto y tamaños / Alphabet & sizes ─────────────────────────────────
// ES: Base32 de Crockford: sin I, L, O ni U para evitar confusiones.
// EN: Crockford base32: no I, L, O or U to avoid confusion.
const ALFABETO: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const SIMBOLOS_DATOS: usize = 30;
const SIMBOLOS_TOTAL: usize = 32;

// ES: Fallos al leer una clave tecleada. / EN: Failures reading a typed key.
#[derive(Debug, PartialEq, Eq)]
pub enum ErrorClave {
    // ES: caracteres o longitud imposibles / EN: impossible characters or length
    Formato,
    // ES: la comprobación no cuadra: hay una errata / EN: the check fails: there is a typo
    Comprobacion,
}

// ── 2. Suma de comprobación / Checksum ────────────────────────────────────────
// ES: Suma ponderada (posición + 1) de los valores módulo 1021 (primo < 1024,
//     cabe en 2 símbolos de 5 bits). Un símbolo cambiado altera la suma en
//     (i+1)·d con 1 ≤ i+1 ≤ 30 y 1 ≤ |d| ≤ 31: como 30·31 < 1021, nunca da 0.
//     Un par vecino intercambiado la altera en ±(a−b) ≠ 0.
// EN: Weighted sum (position + 1) of the values modulo 1021 (a prime < 1024,
//     fits in 2 five-bit symbols). A changed symbol alters the sum by (i+1)·d
//     with 1 ≤ i+1 ≤ 30 and 1 ≤ |d| ≤ 31: since 30·31 < 1021, it is never 0.
//     A swapped neighbouring pair alters it by ±(a−b) ≠ 0.
fn suma(valores: &[u8]) -> u32 {
    valores
        .iter()
        .enumerate()
        .map(|(i, v)| (i as u32 + 1) * u32::from(*v))
        .sum::<u32>()
        % 1021
}

// ── 3. Generar / Generate ─────────────────────────────────────────────────────
// ES: Clave nueva con formato XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX. Cada
//     símbolo usa 5 bits de un byte aleatorio (256 es múltiplo de 32: uniforme).
// EN: New key formatted XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX. Each symbol
//     uses 5 bits of a random byte (256 is a multiple of 32: uniform).
pub fn generar() -> Result<String, ErrorCripto> {
    let bytes = aleatorio::<SIMBOLOS_DATOS>()?;
    let mut valores: Vec<u8> = bytes.iter().map(|b| b & 31).collect();
    let c = suma(&valores);
    valores.push((c / 32) as u8);
    valores.push((c % 32) as u8);
    let simbolos: Vec<char> = valores
        .iter()
        .map(|v| ALFABETO[*v as usize] as char)
        .collect();
    Ok(simbolos
        .chunks(4)
        .map(|g| g.iter().collect::<String>())
        .collect::<Vec<_>>()
        .join("-"))
}

// ── 4. Normalizar y comprobar / Normalize & check ─────────────────────────────
// ES: Valor de un carácter tecleado (con las confusiones habituales).
// EN: Value of a typed character (with the usual confusions).
fn valor(c: char) -> Option<u8> {
    let c = match c.to_ascii_uppercase() {
        'O' => '0',
        'I' | 'L' => '1',
        otro => otro,
    };
    ALFABETO
        .iter()
        .position(|a| *a as char == c)
        .map(|p| p as u8)
}

// ES: Lee una clave tecleada y devuelve los 30 símbolos de datos en forma
//     canónica (lo que entra en Argon2id). Errores: Formato o Comprobacion.
// EN: Reads a typed key and returns the 30 data symbols in canonical form
//     (what goes into Argon2id). Errors: Formato or Comprobacion.
pub fn normalizar(entrada: &str) -> Result<String, ErrorClave> {
    let mut valores = Vec::with_capacity(SIMBOLOS_TOTAL);
    for c in entrada.chars() {
        if c == '-' || c.is_whitespace() {
            continue;
        }
        valores.push(valor(c).ok_or(ErrorClave::Formato)?);
    }
    if valores.len() != SIMBOLOS_TOTAL {
        return Err(ErrorClave::Formato);
    }
    let c = suma(&valores[..SIMBOLOS_DATOS]);
    if valores[SIMBOLOS_DATOS] as u32 != c / 32 || valores[SIMBOLOS_DATOS + 1] as u32 != c % 32 {
        return Err(ErrorClave::Comprobacion);
    }
    Ok(valores[..SIMBOLOS_DATOS]
        .iter()
        .map(|v| ALFABETO[*v as usize] as char)
        .collect())
}

// ── 5. Tests / Tests ──────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn formato_y_ida_y_vuelta() {
        let k = generar().unwrap();
        assert_eq!(k.len(), 32 + 7);
        assert_eq!(k.split('-').count(), 8);
        assert_eq!(normalizar(&k).unwrap().len(), SIMBOLOS_DATOS);
        // ES: Minúsculas y espacios en vez de guiones valen igual.
        // EN: Lowercase and spaces instead of hyphens work the same.
        let tecleada = k.to_lowercase().replace('-', " ");
        assert_eq!(normalizar(&tecleada), normalizar(&k));
    }

    #[test]
    fn dos_claves_son_distintas() {
        assert_ne!(generar().unwrap(), generar().unwrap());
    }

    #[test]
    fn caza_cualquier_simbolo_cambiado_e_intercambio_vecino() {
        let k: Vec<char> = generar().unwrap().chars().filter(|c| *c != '-').collect();
        for i in 0..k.len() {
            for a in ALFABETO.iter().map(|b| *b as char) {
                if a == k[i] {
                    continue;
                }
                let mut m = k.clone();
                m[i] = a;
                let s: String = m.iter().collect();
                assert_eq!(
                    normalizar(&s),
                    Err(ErrorClave::Comprobacion),
                    "pos {i} -> {a}"
                );
            }
        }
        for i in 0..k.len() - 1 {
            if k[i] == k[i + 1] {
                continue;
            }
            let mut m = k.clone();
            m.swap(i, i + 1);
            let s: String = m.iter().collect();
            assert_eq!(normalizar(&s), Err(ErrorClave::Comprobacion), "swap {i}");
        }
    }

    #[test]
    fn confusiones_o_i_l() {
        // ES: Clave fija con 0 y 1 para comprobar que O, I y L se aceptan.
        // EN: Fixed key with 0 and 1 to check that O, I and L are accepted.
        let datos = "01010101010101010101010101010A";
        let v: Vec<u8> = datos.chars().map(|c| valor(c).unwrap()).collect();
        let c = suma(&v);
        let k = format!(
            "{datos}{}{}",
            ALFABETO[(c / 32) as usize] as char,
            ALFABETO[(c % 32) as usize] as char
        );
        let confusa = k
            .replacen('0', "O", 3)
            .replacen('1', "l", 2)
            .replacen('1', "I", 1);
        assert_eq!(normalizar(&confusa).unwrap(), datos);
    }

    #[test]
    fn formato_invalido() {
        assert_eq!(normalizar("hola"), Err(ErrorClave::Formato));
        assert_eq!(normalizar(&"U".repeat(32)), Err(ErrorClave::Formato));
    }
}
