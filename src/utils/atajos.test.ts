/* =============================================================================
 * atajos.test.ts — Tests de los atajos de teclado globales / Global keyboard shortcut tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba puedeUsarAtajo (utils/atajos.ts): un atajo global de una
 *     tecla (como «N» para un movimiento nuevo) solo actúa si no se está
 *     escribiendo en un campo, no hay teclas modificadoras y no hay ningún
 *     diálogo abierto (ni registrado en la pila de useFocoAtrapado ni con el
 *     foco dentro de un [role=dialog]).
 * EN: Checks puedeUsarAtajo (utils/atajos.ts): a single-key global shortcut
 *     (such as "N" for a new transaction) only acts if the user is not typing
 *     in a field, there are no modifier keys and no dialog is open (neither
 *     registered in the useFocoAtrapado stack nor with focus inside a
 *     [role=dialog]).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Utilidades de prueba / Test helpers
 *   2. Pruebas / Tests
 * ===========================================================================*/
import { afterEach, describe, expect, it } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { puedeUsarAtajo } from "./atajos";
import { hayDialogoAbierto, useFocoAtrapado } from "./useFocoAtrapado";

// ── 1. Utilidades de prueba / Test helpers ────────────────────────────────────
// ES: Apps montadas en la prueba en curso, para desmontarlas al final.
// EN: Apps mounted in the current test, to unmount them at the end.
let montadas: App[] = [];

afterEach(() => {
  for (const app of montadas) app.unmount();
  montadas = [];
  document.body.innerHTML = "";
});

// ES: Crea un evento keydown con `destino` como target (se despacha sobre él).
// EN: Creates a keydown event whose target is `destino` (dispatched on it).
function teclaEn(
  destino: EventTarget,
  tecla = "n",
  extra: Partial<KeyboardEventInit> = {}
): KeyboardEvent {
  let capturado: KeyboardEvent | null = null;
  const oyente = (ev: Event) => (capturado = ev as KeyboardEvent);
  destino.addEventListener("keydown", oyente);
  destino.dispatchEvent(
    new KeyboardEvent("keydown", { key: tecla, bubbles: true, cancelable: true, ...extra })
  );
  destino.removeEventListener("keydown", oyente);
  return capturado!;
}

// ES: Monta un diálogo con useFocoAtrapado y un botón de cierre dentro.
// EN: Mounts a dialog with useFocoAtrapado and a close button inside.
function montarDialogo() {
  const abierto = ref(true);
  const Comp = defineComponent({
    setup() {
      const caja = ref<HTMLElement | null>(null);
      useFocoAtrapado(caja);
      return () =>
        abierto.value
          ? h("div", { ref: caja, role: "dialog" }, [h("button", { id: "cerrar" }, "×")])
          : null;
    },
  });
  const raiz = document.createElement("div");
  document.body.appendChild(raiz);
  const app = createApp(Comp);
  app.mount(raiz);
  montadas.push(app);
  return { abierto };
}

// ── 2. Pruebas / Tests ────────────────────────────────────────────────────────
describe("puedeUsarAtajo", () => {
  it("sin diálogos ni campos, el atajo actúa / with no dialogs or fields, the shortcut acts", () => {
    const b = document.createElement("button");
    document.body.appendChild(b);
    expect(puedeUsarAtajo(teclaEn(b))).toBe(true);
    expect(puedeUsarAtajo(teclaEn(document.body))).toBe(true);
  });

  it("no actúa mientras se escribe en un campo / does not act while typing in a field", () => {
    for (const etiqueta of ["input", "textarea", "select"]) {
      const campo = document.createElement(etiqueta);
      document.body.appendChild(campo);
      expect(puedeUsarAtajo(teclaEn(campo))).toBe(false);
    }
    const editable = document.createElement("div");
    editable.contentEditable = "true";
    document.body.appendChild(editable);
    expect(puedeUsarAtajo(teclaEn(editable))).toBe(false);
  });

  it("no actúa con teclas modificadoras / does not act with modifier keys", () => {
    for (const mod of ["ctrlKey", "metaKey", "altKey"] as const) {
      expect(puedeUsarAtajo(teclaEn(document.body, "n", { [mod]: true }))).toBe(false);
    }
  });

  it("no actúa con un diálogo abierto, aunque el foco esté en su botón de cierre / does not act with a dialog open, even with focus on its close button", async () => {
    montarDialogo();
    await nextTick();
    expect(hayDialogoAbierto()).toBe(true);
    const cerrar = document.getElementById("cerrar")!;
    expect(puedeUsarAtajo(teclaEn(cerrar))).toBe(false);
    // ES: Ni aunque el foco se haya escapado al fondo de la página.
    // EN: Not even if focus escaped to the page behind.
    expect(puedeUsarAtajo(teclaEn(document.body))).toBe(false);
  });

  it("al cerrar el diálogo vuelve a actuar / once the dialog closes it acts again", async () => {
    const { abierto } = montarDialogo();
    await nextTick();
    abierto.value = false;
    await nextTick();
    await nextTick();
    expect(hayDialogoAbierto()).toBe(false);
    expect(puedeUsarAtajo(teclaEn(document.body))).toBe(true);
  });

  it("no actúa con el foco dentro de un [role=dialog] sin composable / does not act with focus inside a [role=dialog] without the composable", () => {
    const dialogo = document.createElement("div");
    dialogo.setAttribute("role", "dialog");
    const b = document.createElement("button");
    dialogo.appendChild(b);
    document.body.appendChild(dialogo);
    expect(puedeUsarAtajo(teclaEn(b))).toBe(false);
  });
});
