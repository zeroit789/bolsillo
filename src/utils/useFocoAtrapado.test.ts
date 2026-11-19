/* =============================================================================
 * useFocoAtrapado.test.ts — Foco atrapado en diálogos / Focus trap in dialogs
 * -----------------------------------------------------------------------------
 * ES: Prueba el composable que gestiona el foco de los modales: foco inicial al
 *     abrir, Tab en el último control vuelve al primero, Shift+Tab en el
 *     primero salta al último, Escape avisa para cerrar y, al cerrar o
 *     desmontar, el foco vuelve al elemento que abrió el diálogo. happy-dom no
 *     mueve el foco con Tab por sí solo, así que estas pruebas comprueban el
 *     salto en los extremos y que el resto de pulsaciones no se tocan; el orden
 *     real de Tab se prueba en el navegador.
 * EN: Tests the composable that manages modal focus: initial focus on open,
 *     Tab on the last control goes back to the first, Shift+Tab on the first
 *     jumps to the last, Escape asks to close and, on close or unmount, focus
 *     returns to the element that opened the dialog. happy-dom does not move
 *     focus on Tab by itself, so these tests check the wrap at the edges and
 *     that other key presses are left alone; the real Tab order is tested in
 *     the browser.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Montaje de prueba / Test mounting
 *   2. Pruebas / Tests
 * ===========================================================================*/
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp, defineComponent, h, nextTick, ref, type App } from "vue";
import { useFocoAtrapado, type OpcionesFoco } from "./useFocoAtrapado";

// ── 1. Montaje de prueba / Test mounting ──────────────────────────────────────
// ES: Apps montadas en la prueba en curso, para desmontarlas al final.
// EN: Apps mounted in the current test, to unmount them at the end.
let montadas: { app: App; raiz: HTMLElement }[] = [];

afterEach(() => {
  for (const { app, raiz } of montadas) {
    app.unmount();
    raiz.remove();
  }
  montadas = [];
  document.body.innerHTML = "";
});

// ES: Botón «abridor» fuera del diálogo: simula el botón que lo abre.
// EN: "Opener" button outside the dialog: simulates the button that opens it.
function crearAbridor(): HTMLButtonElement {
  const b = document.createElement("button");
  b.textContent = "Abrir";
  document.body.appendChild(b);
  b.focus();
  return b;
}

// ES: Monta un diálogo con tres controles (input, select y botón) que se
//     muestra mientras `abierto` sea true. El nodo raíz va en document.body
//     para que focus() mueva de verdad document.activeElement.
// EN: Mounts a dialog with three controls (input, select and button) shown
//     while `abierto` is true. The root node goes into document.body so
//     focus() really moves document.activeElement.
function montarDialogo(opciones: OpcionesFoco = {}, abiertoInicial = true) {
  const abierto = ref(abiertoInicial);
  const Comp = defineComponent({
    setup() {
      const caja = ref<HTMLElement | null>(null);
      useFocoAtrapado(caja, opciones);
      return () =>
        abierto.value
          ? h("div", { ref: caja, role: "dialog" }, [
              h("input", { id: "primero" }),
              h("select", { id: "medio" }, [h("option", "a")]),
              h("button", { id: "ultimo" }, "Guardar"),
            ])
          : null;
    },
  });
  const raiz = document.createElement("div");
  document.body.appendChild(raiz);
  const app = createApp(Comp);
  app.mount(raiz);
  montadas.push({ app, raiz });
  return { abierto, app, raiz };
}

// ES: Lanza un keydown que burbujea desde el elemento con el foco.
// EN: Fires a bubbling keydown from the focused element.
function pulsar(tecla: string, shift = false): KeyboardEvent {
  const ev = new KeyboardEvent("keydown", {
    key: tecla,
    shiftKey: shift,
    bubbles: true,
    cancelable: true,
  });
  (document.activeElement ?? document.body).dispatchEvent(ev);
  return ev;
}

// ES: Id del elemento con el foco (para comparar cómodo).
// EN: Id of the focused element (for easy comparison).
const conFoco = () => (document.activeElement as HTMLElement | null)?.id;

// ── 2. Pruebas / Tests ────────────────────────────────────────────────────────
describe("useFocoAtrapado", () => {
  it("al abrir pone el foco en el primer control del diálogo", async () => {
    crearAbridor();
    montarDialogo();
    await nextTick();
    expect(conFoco()).toBe("primero");
  });

  it("respeta el foco inicial pedido", async () => {
    crearAbridor();
    montarDialogo({ focoInicial: () => document.getElementById("ultimo") });
    await nextTick();
    expect(conFoco()).toBe("ultimo");
  });

  it("Tab en el último control vuelve al primero", async () => {
    montarDialogo();
    await nextTick();
    document.getElementById("ultimo")!.focus();
    const ev = pulsar("Tab");
    expect(ev.defaultPrevented).toBe(true);
    expect(conFoco()).toBe("primero");
  });

  it("Shift+Tab en el primer control salta al último", async () => {
    montarDialogo();
    await nextTick();
    document.getElementById("primero")!.focus();
    const ev = pulsar("Tab", true);
    expect(ev.defaultPrevented).toBe(true);
    expect(conFoco()).toBe("ultimo");
  });

  it("Tab en medio del diálogo se deja al navegador", async () => {
    montarDialogo();
    await nextTick();
    document.getElementById("medio")!.focus();
    const ev = pulsar("Tab");
    expect(ev.defaultPrevented).toBe(false);
    expect(conFoco()).toBe("medio");
  });

  it("si el foco se ha escapado, Tab lo devuelve al diálogo", async () => {
    const abridor = crearAbridor();
    montarDialogo();
    await nextTick();
    abridor.focus();
    const ev = pulsar("Tab");
    expect(ev.defaultPrevented).toBe(true);
    expect(conFoco()).toBe("primero");
  });

  it("Escape llama a alEscape", async () => {
    const alEscape = vi.fn();
    montarDialogo({ alEscape });
    await nextTick();
    const ev = pulsar("Escape");
    expect(alEscape).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
  });

  it("sin alEscape, Escape no hace nada", async () => {
    montarDialogo();
    await nextTick();
    const ev = pulsar("Escape");
    expect(ev.defaultPrevented).toBe(false);
  });

  it("al cerrar (v-if a false) devuelve el foco a quien lo abrió", async () => {
    const abridor = crearAbridor();
    const { abierto } = montarDialogo();
    await nextTick();
    expect(conFoco()).toBe("primero");
    abierto.value = false;
    await nextTick();
    await nextTick();
    expect(document.activeElement).toBe(abridor);
  });

  it("al desmontar el componente devuelve el foco a quien lo abrió", async () => {
    const abridor = crearAbridor();
    const { app } = montarDialogo();
    await nextTick();
    expect(conFoco()).toBe("primero");
    app.unmount();
    montadas = montadas.filter((m) => m.app !== app);
    expect(document.activeElement).toBe(abridor);
  });

  it("al cerrar, deja de escuchar el teclado", async () => {
    const alEscape = vi.fn();
    const { abierto } = montarDialogo({ alEscape });
    await nextTick();
    abierto.value = false;
    await nextTick();
    pulsar("Escape");
    expect(alEscape).not.toHaveBeenCalled();
  });

  it("al abrirse más tarde también atrapa el foco", async () => {
    const abridor = crearAbridor();
    const { abierto } = montarDialogo({}, false);
    await nextTick();
    expect(document.activeElement).toBe(abridor);
    abierto.value = true;
    await nextTick();
    await nextTick();
    expect(conFoco()).toBe("primero");
  });

  it("con dos diálogos abiertos solo responde el de arriba", async () => {
    const escAbajo = vi.fn();
    const escArriba = vi.fn();
    montarDialogo({ alEscape: escAbajo });
    await nextTick();
    montarDialogo({ alEscape: escArriba });
    await nextTick();
    pulsar("Escape");
    expect(escArriba).toHaveBeenCalledTimes(1);
    expect(escAbajo).not.toHaveBeenCalled();
  });
});
