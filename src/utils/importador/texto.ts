/* =============================================================================
 * texto.ts — Texto de los extractos / Statement text
 * -----------------------------------------------------------------------------
 * ES: Utilidades de texto comunes al importador de extractos y a las reglas de
 *     categorización:
 *       - normalizarTexto: forma canónica para comparar conceptos y cabeceras
 *         (minúsculas, sin acentos ni diacríticos, espacios colapsados).
 *       - decodificarBytes: convierte el fichero leído (bytes) en texto. Prueba
 *         UTF-8 estricto (quitando el BOM) y, si los bytes no son UTF-8 válido,
 *         usa Windows-1252, la codificación con la que muchos bancos españoles
 *         siguen exportando sus CSV.
 * EN: Text helpers shared by the statement importer and the categorisation
 *     rules:
 *       - normalizarTexto: canonical form to compare concepts and headers
 *         (lower case, no accents or diacritics, collapsed spaces).
 *       - decodificarBytes: turns the file read (bytes) into text. It tries
 *         strict UTF-8 (dropping the BOM) and, if the bytes are not valid
 *         UTF-8, falls back to Windows-1252, the encoding many Spanish banks
 *         still use for their CSV exports.
 * ===========================================================================*/

// ES: Forma canónica de un texto para compararlo: NFD separa cada letra de su
//     acento y la expresión borra los acentos (marcas combinables); luego
//     minúsculas, espacios duros como espacios normales y espacios colapsados.
//     "Panadería  MUÑOZ" -> "panaderia munoz".
// EN: Canonical form of a text for comparisons: NFD splits every letter from
//     its accent and the pattern removes the accents (combining marks); then
//     lower case, non-breaking spaces as normal spaces and collapsed spaces.
//     "Panadería  MUÑOZ" -> "panaderia munoz".
export function normalizarTexto(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// ES: Convierte los bytes de un fichero en texto. Primero UTF-8 estricto
//     (`fatal: true` lanza si hay bytes no válidos); si falla, Windows-1252.
//     TextDecoder quita solo el BOM de UTF-8 (ignoreBOM es false por defecto).
// EN: Turns a file's bytes into text. Strict UTF-8 first (`fatal: true` throws
//     on invalid bytes); if that fails, Windows-1252. TextDecoder strips the
//     UTF-8 BOM on its own (ignoreBOM is false by default).
export function decodificarBytes(datos: ArrayBuffer | Uint8Array): string {
  const bytes = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    // ES: No es UTF-8: Windows-1252 (superconjunto práctico de ISO-8859-1).
    // EN: Not UTF-8: Windows-1252 (practical superset of ISO-8859-1).
    return new TextDecoder("windows-1252").decode(bytes);
  }
}
