/* =============================================================================
 * ajustes.test.ts — Tests del store de ajustes / Settings store tests
 * -----------------------------------------------------------------------------
 * ES: Comprueba que crear el store de ajustes al arrancar NO escribe nada en
 *     localStorage (si la cuota está llena, esa escritura podía impedir llegar
 *     a la lectura de los datos y al rescate) y que un fallo al guardar un
 *     ajuste no rompe la app: el cambio se queda en memoria.
 * EN: Checks that creating the settings store at boot does NOT write anything
 *     to localStorage (if the quota is full, that write could stop the app
 *     from reaching the data read and the rescue) and that a failure saving a
 *     setting does not break the app: the change stays in memory.
 * ===========================================================================*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick } from "vue";
import { useAjustes } from "./ajustes";

describe("ajustes", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => vi.restoreAllMocks());

  it("arrancar no escribe en localStorage / booting does not write to localStorage", async () => {
    const espia = vi.spyOn(Storage.prototype, "setItem");
    useAjustes();
    await nextTick();
    expect(espia).not.toHaveBeenCalled();
    expect(localStorage.getItem("bolsillo.ajustes")).toBeNull();
  });

  it("aplica el tema guardado al arrancar sin escribir / applies the saved theme at boot without writing", async () => {
    localStorage.setItem("bolsillo.ajustes", JSON.stringify({ tema: "claro" }));
    const espia = vi.spyOn(Storage.prototype, "setItem");
    useAjustes();
    await nextTick();
    expect(document.documentElement.classList.contains("tema-claro")).toBe(true);
    expect(espia).not.toHaveBeenCalled();
  });

  it("un cambio se guarda; si la cuota está llena no lanza / a change is saved; a full quota does not throw", async () => {
    const a = useAjustes();
    a.setNombre("Ana");
    await nextTick();
    expect(JSON.parse(localStorage.getItem("bolsillo.ajustes") ?? "{}").nombre).toBe("Ana");

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("lleno", "QuotaExceededError");
    });
    a.setNombre("Bea");
    await nextTick();
    // ES: El cambio sigue en memoria aunque no se haya podido guardar.
    // EN: The change stays in memory although it could not be saved.
    expect(a.nombre).toBe("Bea");
  });
});
