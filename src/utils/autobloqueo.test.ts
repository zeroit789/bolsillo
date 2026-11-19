/* =============================================================================
 * autobloqueo.test.ts — Tests del bloqueo por inactividad / Auto-lock tests
 * -----------------------------------------------------------------------------
 * ES: Con relojes falsos: bloquea al pasar los minutos sin actividad, la
 *     actividad reinicia la cuenta y con 0 minutos nunca bloquea.
 * EN: With fake timers: locks once the minutes pass without activity,
 *     activity restarts the count and with 0 minutes it never locks.
 * ===========================================================================*/
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { crearAutobloqueo } from "./autobloqueo";

describe("autobloqueo", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("bloquea tras los minutos sin actividad, una sola vez / locks after the idle minutes, once", () => {
    const alExpirar = vi.fn();
    const a = crearAutobloqueo({ minutos: () => 5, alExpirar });
    a.iniciar();
    vi.advanceTimersByTime(4 * 60_000);
    expect(alExpirar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000 + 15_000);
    expect(alExpirar).toHaveBeenCalledTimes(1);
    expect(a.activo()).toBe(false);
    vi.advanceTimersByTime(10 * 60_000);
    expect(alExpirar).toHaveBeenCalledTimes(1);
  });

  it("una tecla reinicia la cuenta / a key press restarts the count", () => {
    const alExpirar = vi.fn();
    const a = crearAutobloqueo({ minutos: () => 2, alExpirar });
    a.iniciar();
    vi.advanceTimersByTime(90_000);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
    vi.advanceTimersByTime(90_000);
    expect(alExpirar).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(alExpirar).toHaveBeenCalledTimes(1);
  });

  it("con 0 minutos no bloquea nunca / with 0 minutes it never locks", () => {
    const alExpirar = vi.fn();
    const a = crearAutobloqueo({ minutos: () => 0, alExpirar });
    a.iniciar();
    vi.advanceTimersByTime(60 * 60_000);
    expect(alExpirar).not.toHaveBeenCalled();
    a.parar();
  });
});
