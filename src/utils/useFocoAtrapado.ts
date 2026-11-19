/* =============================================================================
 * useFocoAtrapado.ts — Foco atrapado en diálogos / Focus trap for dialogs
 * -----------------------------------------------------------------------------
 * ES: Composable para los modales de la app. Mientras el contenedor del
 *     diálogo está en el DOM:
 *       - al abrir, pone el foco en el primer control (o en el que se pida);
 *       - Tab en el último control vuelve al primero y Shift+Tab en el primero
 *         salta al último (el foco no se escapa al fondo de la página);
 *       - Escape llama a `alEscape` (normalmente, cerrar);
 *       - al cerrar (v-if a false) o desmontar, devuelve el foco al elemento
 *         que lo tenía antes de abrir (el botón que abrió el diálogo).
 *     Funciona solo con la ref de plantilla del contenedor: cuando la ref pasa
 *     a tener elemento se activa y cuando vuelve a null se desactiva. Si hay
 *     varios diálogos abiertos a la vez (uno encima de otro), solo responde el
 *     último que se abrió.
 * EN: Composable for the app's modals. While the dialog container is in the
 *     DOM:
 *       - on open, focuses the first control (or the one requested);
 *       - Tab on the last control goes back to the first and Shift+Tab on the
 *         first jumps to the last (focus never escapes to the page behind);
 *       - Escape calls `alEscape` (usually, close);
 *       - on close (v-if to false) or unmount, focus goes back to the element
 *         that had it before opening (the button that opened the dialog).
 *     It works only from the container's template ref: when the ref gets an
 *     element it activates and when it goes back to null it deactivates. If
 *     several dialogs are open at once (one on top of another), only the last
 *     one opened responds.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Tipos y constantes / Types & constants
 *   2. Pila de diálogos abiertos / Stack of open dialogs
 *   3. Composable / Composable
 * ===========================================================================*/
import { onScopeDispose, watch, type Ref } from "vue";

// ── 1. Tipos y constantes / Types & constants ─────────────────────────────────
// ES: Opciones del composable. / EN: Composable options.
export interface OpcionesFoco {
  // ES: Se llama al pulsar Escape dentro del diálogo; sin ella, Escape no hace nada.
  // EN: Called when Escape is pressed inside the dialog; without it, Escape does nothing.
  alEscape?: () => void;
  // ES: Elemento que debe recibir el foco al abrir (por defecto, el primer control).
  // EN: Element that should receive focus on open (by default, the first control).
  focoInicial?: () => HTMLElement | null | undefined;
}

// ES: Controles que pueden recibir el foco con el teclado.
// EN: Controls that can receive focus from the keyboard.
const ENFOCABLES = [
  "a[href]",
  "button:not([disabled])",
  'input:not([disabled]):not([type="hidden"])',
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

// ES: Lista ordenada de los controles enfocables dentro del contenedor.
// EN: Ordered list of the focusable controls inside the container.
function enfocables(caja: HTMLElement): HTMLElement[] {
  return Array.from(caja.querySelectorAll<HTMLElement>(ENFOCABLES));
}

// ── 2. Pila de diálogos abiertos / Stack of open dialogs ──────────────────────
// ES: Un identificador por diálogo activo; el último de la lista es el de
//     arriba y es el único que atiende el teclado.
// EN: One token per active dialog; the last one in the list is the top one
//     and the only one that handles the keyboard.
const pila: symbol[] = [];

// ── 3. Composable / Composable ────────────────────────────────────────────────
// ES: Activa el foco atrapado sobre el contenedor de la ref mientras exista.
// EN: Enables the focus trap on the ref's container while it exists.
export function useFocoAtrapado(
  contenedor: Ref<HTMLElement | null | undefined>,
  opciones: OpcionesFoco = {}
): void {
  // ES: Función que desactiva el diálogo activo (si lo hay).
  // EN: Function that deactivates the active dialog (if any).
  let desactivar: (() => void) | null = null;

  // ES: Activa el atrapado sobre `caja`: guarda el foco anterior, enfoca el
  //     control inicial y escucha el teclado en todo el documento (así también
  //     se recupera el foco si se ha escapado, p. ej. tras clicar el fondo).
  // EN: Enables trapping on `caja`: saves the previous focus, focuses the
  //     initial control and listens to the keyboard on the whole document (so
  //     focus is also recovered if it escaped, e.g. after clicking the backdrop).
  function activar(caja: HTMLElement) {
    const token = Symbol("dialogo");
    pila.push(token);
    const anterior = document.activeElement as HTMLElement | null;

    // ES: Primer control, o el propio contenedor si no hay ninguno.
    // EN: First control, or the container itself if there is none.
    const enfocarInicio = () => {
      const destino = opciones.focoInicial?.() ?? enfocables(caja)[0];
      if (destino) {
        destino.focus();
      } else {
        if (!caja.hasAttribute("tabindex")) caja.setAttribute("tabindex", "-1");
        caja.focus();
      }
    };

    // ES: Manejo de Tab, Shift+Tab y Escape (solo si este diálogo es el de arriba).
    // EN: Tab, Shift+Tab and Escape handling (only if this dialog is the top one).
    const alTeclado = (ev: KeyboardEvent) => {
      if (pila[pila.length - 1] !== token) return;
      if (ev.key === "Escape") {
        if (!opciones.alEscape) return;
        ev.preventDefault();
        opciones.alEscape();
        return;
      }
      if (ev.key !== "Tab") return;
      const lista = enfocables(caja);
      if (lista.length === 0) {
        ev.preventDefault();
        caja.focus();
        return;
      }
      const primero = lista[0];
      const ultimo = lista[lista.length - 1];
      const actual = document.activeElement as HTMLElement | null;
      const dentro = actual !== null && caja.contains(actual);
      // ES: Solo se corrige en los extremos o si el foco está fuera; en medio
      //     manda el orden natural del navegador.
      // EN: Only corrected at the edges or when focus is outside; in between
      //     the browser's natural order rules.
      if (ev.shiftKey && (!dentro || actual === primero)) {
        ev.preventDefault();
        ultimo.focus();
      } else if (!ev.shiftKey && (!dentro || actual === ultimo)) {
        ev.preventDefault();
        primero.focus();
      }
    };

    document.addEventListener("keydown", alTeclado);
    enfocarInicio();

    // ES: Al desactivar: quitar el oyente, salir de la pila y devolver el foco
    //     al elemento anterior si sigue en la página. Si ya no existe (p. ej.
    //     se borró la fila que abrió el diálogo), el foco queda en el body.
    // EN: On deactivation: remove the listener, leave the stack and give focus
    //     back to the previous element if it is still on the page. If it no
    //     longer exists (e.g. the row that opened the dialog was deleted),
    //     focus stays on the body.
    desactivar = () => {
      document.removeEventListener("keydown", alTeclado);
      const i = pila.indexOf(token);
      if (i !== -1) pila.splice(i, 1);
      if (anterior && anterior.isConnected && typeof anterior.focus === "function") {
        anterior.focus();
      }
      desactivar = null;
    };
  }

  // ES: La ref manda: con elemento se activa; al volver a null se desactiva.
  //     flush "post" para que el DOM del diálogo ya esté pintado al enfocar.
  // EN: The ref rules: with an element it activates; back to null it
  //     deactivates. "post" flush so the dialog DOM is already rendered when
  //     focusing.
  watch(
    () => contenedor.value,
    (caja) => {
      desactivar?.();
      if (caja) activar(caja);
    },
    { flush: "post", immediate: true }
  );

  // ES: Si el componente se desmonta con el diálogo abierto, se desactiva igual.
  // EN: If the component unmounts with the dialog open, it still deactivates.
  onScopeDispose(() => desactivar?.());
}
