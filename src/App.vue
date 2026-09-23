<script setup lang="ts">
/* =============================================================================
 * App.vue — Shell de la app y notificaciones / App shell & notifications
 * -----------------------------------------------------------------------------
 * ES: Shell de la app: bloqueo al arrancar (si procede), navegación lateral,
 *     selector de mes global y render de la vista activa. Además dispara las
 *     notificaciones locales: deudas saldadas, recordatorio mensual y pagos
 *     próximos.
 * EN: App shell: lock screen on startup (if enabled), side navigation, global
 *     month selector and render of the active view. It also fires the local
 *     notifications: settled debts, monthly reminder and upcoming payments.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Imports y stores / Imports & stores
 *   2. Textos i18n del shell / Shell i18n texts
 *   3. Secciones de navegación / Navigation sections
 *   4. Estado de pantalla / Screen state
 *   5. Notificación de deuda saldada / Settled-debt notification
 *   6. Recordatorio mensual / Monthly reminder
 *   7. Pagos próximos / Upcoming payments
 *   8. Watchers y re-chequeo horario / Watchers & hourly re-check
 *   9. Plantilla / Template
 * ===========================================================================*/

// ── 1. Imports y stores / Imports & stores ────────────────────────────────────
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useSesion } from "./stores/sesion";
import { useAjustes } from "./stores/ajustes";
import { useFinanzas } from "./stores/finanzas";
import { mesActual, mesLegible, euro } from "./utils/format";
import { estadoDeuda } from "./utils/deuda";
import { notificar } from "./utils/notificar";
import { crearT } from "./i18n";
import PantallaBloqueo from "./components/PantallaBloqueo.vue";
import Onboarding from "./components/Onboarding.vue";
import DashboardView from "./views/DashboardView.vue";
import MovimientosView from "./views/MovimientosView.vue";
import DeudasView from "./views/DeudasView.vue";
import PlanesView from "./views/PlanesView.vue";
import PresupuestosView from "./views/PresupuestosView.vue";
import CalendarioView from "./views/CalendarioView.vue";
import SobresView from "./views/SobresView.vue";
import CuentasView from "./views/CuentasView.vue";
import HistorialView from "./views/HistorialView.vue";
import AjustesView from "./views/AjustesView.vue";

// ES: Stores de Pinia: estado de sesión/bloqueo, ajustes y store de finanzas.
// EN: Pinia stores: session/lock state, settings and the finance data store.
const sesion = useSesion();
const ajustes = useAjustes();
const f = useFinanzas();

// ── 2. Textos i18n del shell / Shell i18n texts ───────────────────────────────
// ES: Traducciones del shell (etiquetas del menú, saludo y carga).
// EN: Shell translations (menu labels, greeting and loading text).
const t = crearT({
  resumen: { es: "Resumen", en: "Summary" },
  movimientos: { es: "Movimientos", en: "Transactions" },
  calendario: { es: "Calendario", en: "Calendar" },
  deudas: { es: "Deudas", en: "Debts" },
  planes: { es: "Planes", en: "Goals" },
  presupuestos: { es: "Presupuestos", en: "Budgets" },
  sobres: { es: "Sobres", en: "Envelopes" },
  cuentas: { es: "Cuentas", en: "Accounts" },
  historial: { es: "Historial", en: "History" },
  ajustes: { es: "Ajustes", en: "Settings" },
  hola: { es: "Hola", en: "Hi" },
  cargando: { es: "Cargando…", en: "Loading…" },
  // ES: Textos de las notificaciones nativas. "@x/@c/@i/@d" son marcadores que se
  //     sustituyen al llamar por el valor dinámico (concepto, importe, día) —
  //     crearT no interpola, así que sustituimos a mano tras traducir.
  // EN: Native notification texts. "@x/@c/@i/@d" are placeholders replaced at
  //     call time with the dynamic value (concept, amount, day) — crearT has no
  //     interpolation, so we substitute manually after translating.
  notifDeudaTitulo: { es: "¡Deuda saldada! 🎉", en: "Debt paid off! 🎉" },
  notifDeudaCuerpo: { es: 'Has terminado de pagar "@x".', en: 'You finished paying off "@x".' },
  notifRecordTitulo: { es: "Recordatorio del mes", en: "Monthly reminder" },
  notifRecordCuerpo: {
    es: "Este mes tienes @x en gastos fijos y cuotas.",
    en: "This month you have @x in fixed expenses and instalments.",
  },
  notifPagoTitulo: { es: "Pago próximo", en: "Upcoming payment" },
  notifCuotaTitulo: { es: "Cuota próxima", en: "Upcoming instalment" },
  notifPagoCuerpo: { es: "@c (@i) el día @d.", en: "@c (@i) on day @d." },
});

// ── 3. Secciones de navegación / Navigation sections ──────────────────────────
// ES: Secciones de navegación. La etiqueta NO se guarda aquí: se traduce en el
//     template con t(n.id), usando el id de cada sección como su clave i18n.
// EN: Navigation sections. The label is NOT stored here: it is translated in the
//     template via t(n.id), using each section id as its i18n key.
const NAV = [
  { id: "resumen", icono: "📊", comp: DashboardView },
  { id: "movimientos", icono: "🧾", comp: MovimientosView },
  { id: "calendario", icono: "🗓️", comp: CalendarioView },
  { id: "deudas", icono: "💳", comp: DeudasView },
  { id: "planes", icono: "🎯", comp: PlanesView },
  { id: "presupuestos", icono: "🧮", comp: PresupuestosView },
  { id: "sobres", icono: "✉️", comp: SobresView },
  { id: "cuentas", icono: "🏦", comp: CuentasView },
  { id: "historial", icono: "📅", comp: HistorialView },
  { id: "ajustes", icono: "⚙️", comp: AjustesView },
] as const;

// ── 4. Estado de pantalla / Screen state ──────────────────────────────────────
// ES: Id de la vista activa y el componente al que mapea (buscado en NAV).
// EN: Active view id and the component it maps to (looked up in NAV).
const vista = ref<(typeof NAV)[number]["id"]>("resumen");
const compActual = computed(() => NAV.find((n) => n.id === vista.value)!.comp);
// ES: El selector de mes solo tiene sentido en estas vistas.
// EN: The month selector only makes sense in these views.
const mostrarMes = computed(() =>
  ["resumen", "movimientos", "calendario", "deudas", "presupuestos", "sobres"].includes(vista.value)
);

// ES: Gating de pantalla: bloqueado cuando el bloqueo está activo y la sesión no
//     está desbloqueada. El template elige entre onboarding / bloqueo / contenido
//     / cargando.
// EN: Screen gating: locked when lock is enabled and the session is not unlocked.
//     The template chooses between onboarding / lock / content / loader.
const bloqueado = computed(() => ajustes.bloqueoActivo && !sesion.desbloqueado);

// ES: Al montar, arranca la sesión (hidrata datos y resuelve bloqueo/onboarding).
// EN: On mount, boot the session (hydrate data and resolve lock/onboarding state).
onMounted(() => {
  void sesion.arrancar();
});

// ── 5. Notificación de deuda saldada / Settled-debt notification ──────────────
// ES: Una deuda se salda por el PASO DEL TIEMPO (no por mutar el array), así que no
//     basta observar f.deudas: revisamos al desbloquear (datos ya hidratados) y ante
//     ediciones de deudas. Persistimos las ya avisadas para no repetir; en el primer
//     arranque marcamos las ya saldadas SIN avisar (estado base, evita spam inicial).
// EN: A debt is settled by the PASSING OF TIME (not by mutating the array), so
//     watching f.deudas is not enough: we check on unlock (data already hydrated)
//     and on debt edits. We persist the ones already notified so we don't repeat;
//     on the first run we mark the already-settled ones WITHOUT notifying (base
//     state, avoids initial spam).
const NOTIF_KEY = "bolsillo.deudas.notificadas";
function revisarDeudasSaldadas() {
  // ES: Primera vez = la clave nunca se ha escrito (distingue el estado base).
  // EN: First run = the key has never been written (distinguishes base state).
  const primeraVez = localStorage.getItem(NOTIF_KEY) === null;
  // ES: Carga el set de ids de deudas ya avisadas (vacío si falta o está corrupto).
  // EN: Load the set of already-notified debt ids (empty if missing/corrupt).
  let set: Set<string>;
  try {
    set = new Set<string>(JSON.parse(localStorage.getItem(NOTIF_KEY) ?? "[]"));
  } catch {
    set = new Set<string>();
  }
  // ES: Si el set persistido cambió y hay que volver a guardarlo.
  // EN: Whether the persisted set changed and must be written back.
  let cambia = false;
  for (const d of f.deudas) {
    // ES: Una deuda está "terminada" cuando su plan está pagado a este mes.
    // EN: A debt is "terminada" when its plan is fully paid as of this month.
    const terminada = estadoDeuda(d, mesActual()).terminada;
    if (terminada && !set.has(d.id)) {
      // ES: Recién saldada: avisar (se omite en la primera vez para no spamear).
      // EN: Newly settled: notify (skip on first run to avoid initial spam).
      if (!primeraVez) {
        void notificar(t("notifDeudaTitulo"), t("notifDeudaCuerpo").replace("@x", d.concepto));
      }
      set.add(d.id);
      cambia = true;
    } else if (!terminada && set.has(d.id)) {
      set.delete(d.id); // ES: se editó y volvió a quedar pendiente / EN: edited and pending again
      cambia = true;
    }
  }
  // ES: Persistir si cambió algo (o en la primera vez para escribir el estado base).
  // EN: Persist if anything changed (or on first run to write the base state).
  if (cambia || primeraVez) localStorage.setItem(NOTIF_KEY, JSON.stringify([...set]));
}

// ── 6. Recordatorio mensual / Monthly reminder ────────────────────────────────
// ES: Una vez al mes, avisa del total de gastos fijos + cuotas.
// EN: Once a month, notify the total of fixed expenses + installments.
function recordatorioMensual() {
  const mes = mesActual();
  // ES: Ya avisado este mes → no hacer nada (una notificación por mes).
  // EN: Already reminded this month → do nothing (one notification per month).
  if (localStorage.getItem("bolsillo.recordatorio-mes") === mes) return;
  const r = f.resumenDe(mes);
  if (r.gastosFijos > 0) {
    void notificar(t("notifRecordTitulo"), t("notifRecordCuerpo").replace("@x", euro(r.gastosFijos)));
    // ES: Marcar el mes SOLO si avisamos (si aún no hay fijos, reintentar luego).
    // EN: Mark the month ONLY if we notified (if there are no fixed expenses yet,
    //     retry later instead of burning the month with an empty reminder).
    localStorage.setItem("bolsillo.recordatorio-mes", mes);
  }
}

// ── 7. Pagos próximos / Upcoming payments ─────────────────────────────────────
// ES: Avisa de pagos próximos: fijos y cuotas con día de pago en los próximos 3
//     días. Una vez por (id+mes) para no repetir.
// EN: Notify upcoming payments: fixed expenses and installments whose payment day
//     falls within the next 3 days. Once per (id+month) so it doesn't repeat.
function revisarPagosProximos() {
  const mes = mesActual();
  const ahora = new Date();
  const KEY = "bolsillo.pagos-avisados";
  // ES: Registro persistido: el mes al que se refiere + los ids ya avisados.
  // EN: Persisted record: the month it refers to + the ids already notified.
  let avisados: { mes: string; ids: string[] };
  try {
    avisados = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? { mes, ids: [] };
  } catch {
    avisados = { mes, ids: [] };
  }
  if (avisados.mes !== mes) avisados = { mes, ids: [] }; // ES: mes nuevo: reinicia / EN: new month: reset
  const set = new Set<string>(avisados.ids);
  // ES: Días hasta la próxima ocurrencia de un día de pago, cruzando bien el fin
  //     de mes (p.ej. hoy es 30 y el pago es el 1 → 1-2 días, no un negativo).
  //     En rango = vence dentro de los próximos 3 días.
  // EN: Days until the next occurrence of a payment day, crossing month-end
  //     correctly (e.g. today is the 30th and payment is on the 1st → 1-2 days,
  //     not a negative number). In range = due within the next 3 days.
  const enRango = (dia?: number) => {
    if (typeof dia !== "number" || dia < 1 || dia > 31) return false;
    const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    // ES: Acota el día de pago al último día real del mes objetivo, para que un
    //     día como 31 en un mes de 30 no se desborde al día 1 del siguiente.
    // EN: Clamp the payment day to the real last day of the target month so a
    //     day like 31 in a 30-day month doesn't overflow to the 1st of the next.
    const ultimoDia = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
    const y = ahora.getFullYear();
    const m = ahora.getMonth();
    let objetivo = new Date(y, m, Math.min(dia, ultimoDia(y, m)));
    if (objetivo < hoy0) objetivo = new Date(y, m + 1, Math.min(dia, ultimoDia(y, m + 1)));
    const dias = Math.round((objetivo.getTime() - hoy0.getTime()) / 86_400_000);
    return dias >= 0 && dias <= 3;
  };

  // ES: Gastos fijos (recurrentes de gasto activos este mes). Id con prefijo "r"
  //     para no chocar con los ids de deudas en el mismo set de avisados.
  // EN: Fixed expenses (expense recurrents active this month). Id prefixed "r"
  //     to avoid colliding with debt ids in the same notified set.
  for (const r of f.recurrentes) {
    if (r.signo !== "gasto") continue;
    if (!(r.desde <= mes && (r.hasta === null || mes <= r.hasta))) continue;
    if (enRango(r.diaPago) && !set.has("r" + r.id)) {
      set.add("r" + r.id);
      void notificar(
        t("notifPagoTitulo"),
        t("notifPagoCuerpo")
          .replace("@c", r.concepto)
          .replace("@i", euro(r.importe))
          .replace("@d", String(r.diaPago))
      );
    }
  }
  // ES: Cuotas de deudas activas (omite deudas sin cuota este mes). Id con prefijo
  //     "d" para mantenerlo distinto de los ids de recurrentes.
  // EN: Installments of active debts (skip debts with no installment this month).
  //     Id prefixed "d" to keep it distinct from recurrent ids.
  for (const d of f.deudas) {
    if (estadoDeuda(d, mes).cuotaDelMes <= 0) continue;
    if (enRango(d.diaPago) && !set.has("d" + d.id)) {
      set.add("d" + d.id);
      void notificar(
        t("notifCuotaTitulo"),
        t("notifPagoCuerpo")
          .replace("@c", d.concepto)
          .replace("@i", euro(d.cuotaMensual))
          .replace("@d", String(d.diaPago))
      );
    }
  }
  // ES: Persistir los ids avisados de este mes para no repetir nunca un aviso.
  // EN: Persist the notified ids for this month so we never repeat a warning.
  localStorage.setItem(KEY, JSON.stringify({ mes, ids: [...set] }));
}

// ── 8. Watchers y re-chequeo horario / Watchers & hourly re-check ─────────────
// ES: Al desbloquear (datos ya cargados): deudas saldadas + recordatorios. Además
//     arranca un re-chequeo cada hora para que recordatorios / pagos próximos
//     sigan saltando si la app queda abierta al cambiar de día o mes (no solo al
//     desbloquear).
// EN: On unlock (data already loaded): settled debts + reminders. Also start an
//     hourly re-check so reminders / upcoming payments still fire if the app
//     stays open across a day or month change (not only at unlock time).
let timerNotif: number | undefined;
watch(
  () => sesion.desbloqueado,
  (v) => {
    if (v) {
      revisarDeudasSaldadas();
      recordatorioMensual();
      revisarPagosProximos();
      if (timerNotif === undefined) {
        timerNotif = window.setInterval(() => {
          revisarDeudasSaldadas();
          recordatorioMensual();
          revisarPagosProximos();
        }, 60 * 60 * 1000); // ES: cada hora / EN: every hour
      }
    }
  },
  { immediate: true }
);
// ES: Re-chequea deudas saldadas ante cualquier edición de deudas (watch profundo).
// EN: Re-check settled debts on any debt edit (deep watch over the array).
watch(() => f.deudas, () => revisarDeudasSaldadas(), { deep: true });

// ES: Limpia el temporizador del re-chequeo horario al desmontar el shell (evita
//     intervalos huérfanos con HMR en desarrollo y es el cierre correcto igual).
// EN: Clear the hourly re-check timer when the shell unmounts (avoids orphan
//     intervals on HMR during development and is correct teardown either way).
onUnmounted(() => {
  if (timerNotif !== undefined) clearInterval(timerNotif);
});
</script>

<!-- ── 9. Template / Plantilla ─────────────────────────────────────────────── -->
<template>
  <!-- ES: Bienvenida / onboarding (primer arranque) / EN: Welcome / onboarding (first run) -->
  <Onboarding v-if="sesion.necesitaOnboarding" />

  <!-- ES: Pantalla de bloqueo / EN: Lock screen -->
  <PantallaBloqueo v-else-if="bloqueado" />

  <!-- ES: App desbloqueada / EN: Unlocked app -->
  <div v-else-if="sesion.desbloqueado" class="min-h-screen flex">
    <!-- ES: Navegación lateral / EN: Side navigation -->
    <aside class="w-56 shrink-0 border-r border-border bg-surface/50 flex flex-col py-5 px-3 no-select">
      <h1 class="font-display text-2xl font-extrabold px-3 mb-6">
        Bolsillo<span class="text-brand">.</span>
      </h1>
      <nav class="flex flex-col gap-1">
        <button
          v-for="n in NAV"
          :key="n.id"
          class="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors"
          :class="
            vista === n.id ? 'bg-brand text-white' : 'text-muted hover:text-ink hover:bg-surface-2'
          "
          @click="vista = n.id"
        >
          <span class="text-lg">{{ n.icono }}</span>
          <span class="font-medium">{{ t(n.id) }}</span>
        </button>
      </nav>
    </aside>

    <!-- ES: Área de contenido / EN: Content area -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- ES: Barra superior con el selector de mes / EN: Top bar with the month selector -->
      <header class="flex items-center justify-between gap-3 px-8 py-4 border-b border-border">
        <p class="text-muted text-sm truncate">
          <span v-if="ajustes.nombre">{{ t("hola") }}, <span class="text-ink font-medium">{{ ajustes.nombre }}</span></span>
        </p>
        <select
          v-if="mostrarMes"
          :value="f.mesSeleccionado"
          @change="f.seleccionarMes(($event.target as HTMLSelectElement).value)"
          class="rounded-lg bg-surface border border-border px-3 py-2 text-ink outline-none focus:border-brand no-select"
        >
          <option v-for="m in f.mesesDisponibles" :key="m" :value="m">{{ mesLegible(m) }}</option>
        </select>
      </header>

      <!-- ES: Vista activa renderizada dinámicamente desde NAV / EN: Active view rendered dynamically from NAV -->
      <main class="flex-1 overflow-y-auto px-8 py-6">
        <component :is="compActual" />
      </main>
    </div>
  </div>

  <!-- ES: Cargando (instante inicial antes de resolver el estado) / EN: Loader (initial instant before state resolves) -->
  <div v-else class="min-h-screen flex items-center justify-center text-muted">{{ t("cargando") }}</div>
</template>
