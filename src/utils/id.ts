/* =============================================================================
 * id.ts — Generador de identificadores / Identifier generator
 * -----------------------------------------------------------------------------
 * ES: Un único sitio para crear los ids de movimientos, recurrentes, cuentas,
 *     deudas, planes, etc. Usa crypto.randomUUID() (UUID v4 de 122 bits
 *     aleatorios del generador criptográfico del sistema), que no colisiona
 *     en la práctica aunque se creen muchos registros en el mismo milisegundo.
 *     Los ids son opacos: nada ordena ni compara por ellos. Los ids antiguos
 *     (timestamp en base36 + sufijo) siguen siendo válidos tal cual.
 * EN: One single place to create the ids of transactions, recurring items,
 *     accounts, debts, plans, etc. Uses crypto.randomUUID() (UUID v4 with 122
 *     random bits from the system's cryptographic generator), which in
 *     practice never collides even when many records are created in the same
 *     millisecond. Ids are opaque: nothing sorts or compares by them. Old ids
 *     (base36 timestamp + suffix) remain valid as they are.
 * ===========================================================================*/

// ES: Devuelve un id nuevo y único (UUID v4 en texto).
// EN: Returns a new unique id (UUID v4 as text).
export function nuevoId(): string {
  return crypto.randomUUID();
}
