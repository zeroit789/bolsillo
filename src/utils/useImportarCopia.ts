/* =============================================================================
 * useImportarCopia.ts — Importar una copia (cifrada o JSON) / Import a backup (encrypted or JSON)
 * -----------------------------------------------------------------------------
 * ES: Flujo común de Ajustes y de la pantalla de error para importar una copia:
 *       1. Rust abre el diálogo nativo y clasifica el fichero (la ruta nunca
 *          sale de Rust).
 *       2. Si es una copia cifrada (.bolsillo), se pide su contraseña.
 *       3. Se confirma (sustituye los datos) y se importa con sus categorías
 *          de forma atómica (sesion.importarCopiaCompleta).
 *     Los errores salen como código en `error` para que cada vista los
 *     traduzca: "copia-invalida", "copia-version", "copia-credencial",
 *     "no-autosuficiente", "sin-rescate", "categorias-no-guardadas" o "guardar".
 * EN: Shared flow of Settings and the error screen to import a backup:
 *       1. Rust opens the native dialog and classifies the file (the path
 *          never leaves Rust).
 *       2. If it is an encrypted backup (.bolsillo), its password is asked.
 *       3. It is confirmed (it replaces the data) and imported with its
 *          categories atomically (sesion.importarCopiaCompleta).
 *     Errors come out as a code in `error` so each view translates them:
 *     "copia-invalida", "copia-version", "copia-credencial",
 *     "no-autosuficiente", "sin-rescate", "categorias-no-guardadas" or "guardar".
 * ===========================================================================*/
import { ref } from "vue";
import { useSesion } from "../stores/sesion";

// ES: Opciones: confirmar antes de sustituir y si se fuerza sin rescate.
// EN: Options: confirm before replacing and whether to force without rescue.
export interface OpcionesImportar {
  confirmar: () => boolean;
  forzar?: () => boolean;
  alTerminar?: () => void;
}

// ES: Traduce un error de la sesión o de Rust al código de la vista.
// EN: Maps a session or Rust error to the view's code.
function codigoDe(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === "string" ? e : "";
  if (["copia-invalida", "copia-version", "copia-credencial", "sin-rescate"].includes(m)) return m;
  if (m === "categorias-no-guardadas") return m;
  if (m === "no-autosuficiente") return m;
  if (m === "version") return "copia-version";
  if (m === "danado" || e instanceof SyntaxError) return "copia-invalida";
  return "guardar";
}

export function useImportarCopia(o: OpcionesImportar) {
  const sesion = useSesion();
  // ES: Esperando la contraseña de una copia cifrada. / EN: Waiting for an encrypted backup's password.
  const pidiendoContrasena = ref(false);
  const ocupado = ref(false);
  const error = ref("");
  const hecho = ref(false);

  // ES: Importa el contenido ya leído (tras confirmar). / EN: Imports the already read content (after confirming).
  async function importar(crudo: unknown) {
    if (!o.confirmar()) return;
    const forzar = o.forzar?.() ?? false;
    await sesion.importarCopiaCompleta(crudo, forzar);
    hecho.value = true;
    o.alTerminar?.();
  }

  // ES: Paso 1: elegir fichero. / EN: Step 1: pick a file.
  async function elegir() {
    if (ocupado.value) return;
    error.value = "";
    hecho.value = false;
    ocupado.value = true;
    try {
      const e = await sesion.elegirCopiaParaImportar();
      if (!e) return;
      if (e.tipo === "cifrada") pidiendoContrasena.value = true;
      else await importar(e.crudo);
    } catch (e) {
      error.value = codigoDe(e);
    } finally {
      ocupado.value = false;
    }
  }

  // ES: Paso 2 (copia cifrada): descifrar con la contraseña e importar.
  // EN: Step 2 (encrypted backup): decrypt with the password and import.
  async function enviarContrasena(contrasena: string) {
    if (ocupado.value || !contrasena) return;
    error.value = "";
    ocupado.value = true;
    try {
      const crudo = await sesion.descifrarCopiaElegida(contrasena);
      pidiendoContrasena.value = false;
      await importar(crudo);
    } catch (e) {
      error.value = codigoDe(e);
    } finally {
      ocupado.value = false;
    }
  }

  function cancelar() {
    pidiendoContrasena.value = false;
    error.value = "";
  }

  return { pidiendoContrasena, ocupado, error, hecho, elegir, enviarContrasena, cancelar };
}
