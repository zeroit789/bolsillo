/* =============================================================================
 * credencial.ts — Reglas del PIN y la contraseña / PIN & password rules
 * -----------------------------------------------------------------------------
 * ES: Mínimos para poner o cambiar una credencial (los mismos que aplica Rust):
 *       - PIN: de 4 a 6 cifras.
 *       - Contraseña: al menos 8 caracteres.
 *     Y un aviso (no un bloqueo) de PIN débil: cifras repetidas, escaleras,
 *     pares repetidos, PIN muy usados y años. Un PIN de 4 cifras solo tiene
 *     10 000 combinaciones: protege frente a un vistazo, no frente a quien se
 *     lleve el fichero (Argon2id lo frena, pero no lo hace imposible).
 * EN: Minimums to set or change a credential (the same ones Rust enforces):
 *       - PIN: 4 to 6 digits.
 *       - Password: at least 8 characters.
 *     And a warning (not a block) for a weak PIN: repeated digits, runs,
 *     repeated pairs, very common PINs and years. A 4-digit PIN only has
 *     10,000 combinations: it protects against a glance, not against someone
 *     who takes the file (Argon2id slows them down, it does not stop them).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Mínimos / Minimums
 *   2. PIN débil / Weak PIN
 * ===========================================================================*/

// ── 1. Mínimos / Minimums ────────────────────────────────────────────────────
// ES: Longitud mínima de la contraseña (igual que MIN_PASSWORD en boveda.rs).
// EN: Minimum password length (same as MIN_PASSWORD in boveda.rs).
export const MIN_PASSWORD = 8;

// ES: Motivo por el que una credencial nueva no vale.
// EN: Reason why a new credential is not accepted.
export type MotivoCredencial = "pin-formato" | "password-corta";

// ES: null si la credencial nueva cumple los mínimos; si no, el motivo.
// EN: null if the new credential meets the minimums; otherwise the reason.
export function validarCredencial(
  tipo: "pin" | "password",
  valor: string
): MotivoCredencial | null {
  if (tipo === "pin") return /^\d{4,6}$/.test(valor) ? null : "pin-formato";
  return [...valor].length >= MIN_PASSWORD ? null : "password-corta";
}

// ── 2. PIN débil / Weak PIN ──────────────────────────────────────────────────
// ES: Por qué un PIN es débil (o null si no lo parece).
// EN: Why a PIN is weak (or null if it does not look so).
export type MotivoPinDebil = "repetido" | "escalera" | "patron" | "comun" | "año";

// ES: PIN muy usados que no salen de las reglas de abajo (teclado y fechas típicas).
// EN: Very common PINs not caught by the rules below (keypad and typical dates).
const COMUNES = new Set(["2580", "0852", "1212", "6969", "1004", "2000", "1122", "5683", "0007"]);

// ES: Devuelve el motivo si el PIN es débil: todas las cifras iguales (1111),
//     escalera subiendo o bajando (1234, 9876, 3456), un par o trío repetido
//     (1212, 123123), un PIN muy común o un año entre 1900 y 2099 (1985).
// EN: Returns the reason if the PIN is weak: all digits equal (1111), up or
//     down run (1234, 9876, 3456), a repeated pair or triple (1212, 123123),
//     a very common PIN or a year between 1900 and 2099 (1985).
export function pinDebil(pin: string): MotivoPinDebil | null {
  if (!/^\d{4,6}$/.test(pin)) return null;
  const d = [...pin].map(Number);
  if (d.every((x) => x === d[0])) return "repetido";
  const pasos = d.slice(1).map((x, i) => x - d[i]);
  if (pasos.every((p) => p === 1) || pasos.every((p) => p === -1)) return "escalera";
  const repite = (n: number) =>
    pin.length % n === 0 && pin === pin.slice(0, n).repeat(pin.length / n);
  if (repite(2) || repite(3)) return "patron";
  if (COMUNES.has(pin)) return "comun";
  if (pin.length === 4 && /^(19|20)\d\d$/.test(pin)) return "año";
  return null;
}
