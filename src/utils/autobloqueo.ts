/* =============================================================================
 * autobloqueo.ts — Bloqueo por inactividad / Inactivity auto-lock
 * -----------------------------------------------------------------------------
 * ES: Vigila la actividad (teclado, ratón, rueda, toque) y, si pasan los
 *     minutos configurados sin ninguna, llama a `alExpirar` (la sesión bloquea).
 *     Comprueba cada 15 s en vez de reprogramar un temporizador en cada
 *     tecla. Con 0 minutos no hace nada (autobloqueo apagado).
 * EN: Watches activity (keyboard, mouse, wheel, touch) and, if the configured
 *     minutes pass with none, calls `alExpirar` (the session locks). It checks
 *     every 15 s instead of rescheduling a timer on every key. With 0 minutes
 *     it does nothing (auto-lock off).
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Opciones / Options
 *   2. Vigilante / Watcher
 * ===========================================================================*/

// ── 1. Opciones / Options ────────────────────────────────────────────────────
// ES: Cada cuánto se comprueba y qué eventos cuentan como actividad.
// EN: How often it checks and which events count as activity.
export const INTERVALO_MS = 15_000;
const EVENTOS = ["pointerdown", "keydown", "wheel", "touchstart"] as const;

export interface OpcionesAutobloqueo {
  // ES: minutos sin actividad (0 = apagado); se lee en cada comprobación.
  // EN: minutes without activity (0 = off); read on every check.
  minutos: () => number;
  alExpirar: () => void;
  ahora?: () => number;
}

// ── 2. Vigilante / Watcher ───────────────────────────────────────────────────
// ES: Crea el vigilante. `iniciar` pone los escuchadores y el intervalo (y
//     cuenta como actividad); `parar` los quita. `actividad` apunta actividad
//     a mano.
// EN: Creates the watcher. `iniciar` sets the listeners and the interval (and
//     counts as activity); `parar` removes them. `actividad` records activity
//     by hand.
export function crearAutobloqueo(o: OpcionesAutobloqueo) {
  const ahora = o.ahora ?? (() => Date.now());
  let ultima = ahora();
  let intervalo: ReturnType<typeof setInterval> | undefined;
  const actividad = () => {
    ultima = ahora();
  };

  // ES: ¿Ha pasado el tiempo? Si sí, se para y avisa una sola vez.
  // EN: Has the time passed? If so, it stops and notifies only once.
  function comprobar() {
    const min = o.minutos();
    if (min > 0 && ahora() - ultima >= min * 60_000) {
      parar();
      o.alExpirar();
    }
  }

  function iniciar() {
    parar();
    actividad();
    for (const e of EVENTOS) window.addEventListener(e, actividad, { passive: true });
    intervalo = setInterval(comprobar, INTERVALO_MS);
  }

  function parar() {
    for (const e of EVENTOS) window.removeEventListener(e, actividad);
    clearInterval(intervalo);
    intervalo = undefined;
  }

  return { iniciar, parar, actividad, comprobar, activo: () => intervalo !== undefined };
}
