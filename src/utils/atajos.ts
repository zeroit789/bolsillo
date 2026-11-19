/* =============================================================================
 * atajos.ts — Cuándo actúa un atajo de teclado global / When a global keyboard shortcut acts
 * -----------------------------------------------------------------------------
 * ES: Regla común para los atajos globales de una tecla (p. ej. «N» abre un
 *     movimiento nuevo en MovimientosView). Un atajo así solo debe actuar si:
 *       - no se está escribiendo en un campo (input, textarea, select o
 *         contenido editable);
 *       - no hay teclas modificadoras (Ctrl, Cmd/Meta, Alt), que son de otros
 *         atajos del sistema;
 *       - no hay ningún diálogo abierto: ni registrado en la pila de
 *         useFocoAtrapado, ni con el foco dentro de un [role=dialog]. Si no,
 *         p. ej. «N» con el foco en el botón de cierre del visor de recibos
 *         abriría el formulario por debajo del visor.
 *     Escape NO es un atajo global: lo atiende solo el diálogo de arriba de la
 *     pila (useFocoAtrapado, opción alEscape).
 * EN: Shared rule for single-key global shortcuts (e.g. "N" opens a new
 *     transaction in MovimientosView). Such a shortcut should only act if:
 *       - the user is not typing in a field (input, textarea, select or
 *         editable content);
 *       - there are no modifier keys (Ctrl, Cmd/Meta, Alt), which belong to
 *         other system shortcuts;
 *       - no dialog is open: neither registered in the useFocoAtrapado stack
 *         nor with focus inside a [role=dialog]. Otherwise, e.g. "N" with
 *         focus on the receipt viewer's close button would open the form
 *         underneath the viewer.
 *     Escape is NOT a global shortcut: only the top dialog of the stack
 *     handles it (useFocoAtrapado, alEscape option).
 * ===========================================================================*/
import { hayDialogoAbierto } from "./useFocoAtrapado";

// ES: Selector de los contenedores de diálogo (modales y alertas).
// EN: Selector for dialog containers (modals and alerts).
const DIALOGO = '[role="dialog"], [role="alertdialog"]';

// ES: true si el elemento es un campo donde se escribe (la tecla es texto).
// EN: true if the element is a field the user types into (the key is text).
function esCampo(el: Element): boolean {
  return (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

// ES: Decide si un atajo global de una tecla puede actuar con este evento.
// EN: Decides whether a single-key global shortcut may act on this event.
export function puedeUsarAtajo(e: KeyboardEvent): boolean {
  // ES: Con modificadores es otro atajo; si se está componiendo texto (IME), tampoco.
  // EN: With modifiers it is another shortcut; nor while composing text (IME).
  if (e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return false;

  // ES: Cualquier diálogo abierto bloquea los atajos de la página de debajo.
  // EN: Any open dialog blocks the shortcuts of the page underneath.
  if (hayDialogoAbierto()) return false;

  const destino = e.target;
  if (destino instanceof Element) {
    if (esCampo(destino)) return false;
    // ES: Diálogos que no usan el composable (por si se añade alguno).
    // EN: Dialogs not using the composable (in case one is added).
    if (destino.closest(DIALOGO)) return false;
  }
  return true;
}
