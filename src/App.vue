<script setup lang="ts">
/* =============================================================================
 * App.vue — App shell & notifications / Shell de la app y notificaciones
 * -----------------------------------------------------------------------------
 * EN: App shell: lock screen on startup (if enabled), side navigation, global
 *     month selector and render of the active view. It also fires the local
 *     notifications: settled debts, monthly reminder and upcoming payments.
 * ES: Shell de la app: bloqueo al arrancar (si procede), navegación lateral,
 *     selector de mes global y render de la vista activa. Además dispara las
 *     notificaciones locales: deudas saldadas, recordatorio mensual y pagos
 *     próximos.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports & stores / Imports y stores
 *   2. Shell i18n texts / Textos i18n del shell
 *   3. Navigation sections / Secciones de navegación
 *   4. Screen state / Estado de pantalla
 *   5. Settled-debt notification / Notificación de deuda saldada
 *   6. Monthly reminder / Recordatorio mensual
 *   7. Upcoming payments / Pagos próximos
 *   8. Watchers & hourly re-check / Watchers y re-chequeo horario
 *   9. Template / Plantilla
 * ===========================================================================*/

// ── 1. Imports & stores / Imports y stores ────────────────────────────────────
import { ref, computed, onMounted, watch } from "vue";
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

// EN: Pinia stores: session/lock state, settings and the finance data store.
// ES: Stores de Pinia: estado de sesión/bloqueo, ajustes y store de finanzas.
const sesion = useSesion();
const ajustes = useAjustes();
const f = useFinanzas();

// ── 2. Shell i18n texts / Textos i18n del shell ───────────────────────────────
// EN: Shell translations (menu labels, greeting and loading text).
// ES: Traducciones del shell (etiquetas del menú, saludo y carga).
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
});

// ── 3. Navigation sections / Secciones de navegación ──────────────────────────
// EN: Navigation sections. The label is NOT stored here: it is translated in the
//     template via t(n.id), using each section id as its i18n key.
// ES: Secciones de navegación. La etiqueta NO se guarda aquí: se traduce en el
//     template con t(n.id), usando el id de cada sección como su clave i18n.
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

// ── 4. Screen state / Estado de pantalla ──────────────────────────────────────
// EN: Active view id and the component it maps to (looked up in NAV).
// ES: Id de la vista activa y el componente al que mapea (buscado en NAV).
const vista = ref<(typeof NAV)[number]["id"]>("resumen");
const compActual = computed(() => NAV.find((n) => n.id === vista.value)!.comp);
// EN: The month selector only makes sense in these views.
// ES: El selector de mes solo tiene sentido en estas vistas.
const mostrarMes = computed(() =>
  ["resumen", "movimientos", "calendario", "deudas", "presupuestos", "sobres"].includes(vista.value)
);

// EN: Screen gating: locked when lock is enabled and the session is not unlocked.
//     The template chooses between onboarding / lock / content / loader.
// ES: Gating de pantalla: bloqueado cuando el bloqueo está activo y la sesión no
//     está desbloqueada. El template elige entre onboarding / bloqueo / contenido
//     / cargando.
const bloqueado = computed(() => ajustes.bloqueoActivo && !sesion.desbloqueado);

// EN: On mount, boot the session (hydrate data and resolve lock/onboarding state).
// ES: Al montar, arranca la sesión (hidrata datos y resuelve bloqueo/onboarding).
onMounted(() => {
  void sesion.arrancar();
});

// ── 5. Settled-debt notification / Notificación de deuda saldada ──────────────
// EN: A debt is settled by the PASSING OF TIME (not by mutating the array), so
//     watching f.deudas is not enough: we check on unlock (data already hydrated)
//     and on debt edits. We persist the ones already notified so we don't repeat;
//     on the first run we mark the already-settled ones WITHOUT notifying (base
//     state, avoids initial spam).
// ES: Una deuda se salda por el PASO DEL TIEMPO (no por mutar el array), así que no
//     basta observar f.deudas: revisamos al desbloquear (datos ya hidratados) y ante
//     ediciones de deudas. Persistimos las ya avisadas para no repetir; en el primer
//     arranque marcamos las ya saldadas SIN avisar (estado base, evita spam inicial).
const NOTIF_KEY = "bolsillo.deudas.notificadas";
function revisarDeudasSaldadas() {
  // EN: First run = the key has never been written (distinguishes base state).
  // ES: Primera vez = la clave nunca se ha escrito (distingue el estado base).
  const primeraVez = localStorage.getItem(NOTIF_KEY) === null;
  // EN: Load the set of already-notified debt ids (empty if missing/corrupt).
  // ES: Carga el set de ids de deudas ya avisadas (vacío si falta o está corrupto).
  let set: Set<string>;
  try {
    set = new Set<string>(JSON.parse(localStorage.getItem(NOTIF_KEY) ?? "[]"));
  } catch {
    set = new Set<string>();
  }
  // EN: Whether the persisted set changed and must be written back.
  // ES: Si el set persistido cambió y hay que volver a guardarlo.
  let cambia = false;
  for (const d of f.deudas) {
    // EN: A debt is "terminada" when its plan is fully paid as of this month.
    // ES: Una deuda está "terminada" cuando su plan está pagado a este mes.
    const terminada = estadoDeuda(d, mesActual()).terminada;
    if (terminada && !set.has(d.id)) {
      // EN: Newly settled: notify (skip on first run to avoid initial spam).
      // ES: Recién saldada: avisar (se omite en la primera vez para no spamear).
      if (!primeraVez) {
        void notificar("¡Deuda saldada! 🎉", `Has terminado de pagar "${d.concepto}".`);
      }
      set.add(d.id);
      cambia = true;
    } else if (!terminada && set.has(d.id)) {
      set.delete(d.id); // EN: edited and pending again / ES: se editó y volvió a quedar pendiente
      cambia = true;
    }
  }
  // EN: Persist if anything changed (or on first run to write the base state).
  // ES: Persistir si cambió algo (o en la primera vez para escribir el estado base).
  if (cambia || primeraVez) localStorage.setItem(NOTIF_KEY, JSON.stringify([...set]));
}

// ── 6. Monthly reminder / Recordatorio mensual ────────────────────────────────
// EN: Once a month, notify the total of fixed expenses + installments.
// ES: Una vez al mes, avisa del total de gastos fijos + cuotas.
function recordatorioMensual() {
  const mes = mesActual();
  // EN: Already reminded this month → do nothing (one notification per month).
  // ES: Ya avisado este mes → no hacer nada (una notificación por mes).
  if (localStorage.getItem("bolsillo.recordatorio-mes") === mes) return;
  const r = f.resumenDe(mes);
  if (r.gastosFijos > 0) {
    void notificar(
      "Recordatorio del mes",
      `Este mes tienes ${euro(r.gastosFijos)} en gastos fijos y cuotas.`
    );
    // EN: Mark the month ONLY if we notified (if there are no fixed expenses yet,
    //     retry later instead of burning the month with an empty reminder).
    // ES: Marcar el mes SOLO si avisamos (si aún no hay fijos, reintentar luego).
    localStorage.setItem("bolsillo.recordatorio-mes", mes);
  }
}

// ── 7. Upcoming payments / Pagos próximos ─────────────────────────────────────
// EN: Notify upcoming payments: fixed expenses and installments whose payment day
//     falls within the next 3 days. Once per (id+month) so it doesn't repeat.
// ES: Avisa de pagos próximos: fijos y cuotas con día de pago en los próximos 3
//     días. Una vez por (id+mes) para no repetir.
function revisarPagosProximos() {
  const mes = mesActual();
  const ahora = new Date();
  const KEY = "bolsillo.pagos-avisados";
  // EN: Persisted record: the month it refers to + the ids already notified.
  // ES: Registro persistido: el mes al que se refiere + los ids ya avisados.
  let avisados: { mes: string; ids: string[] };
  try {
    avisados = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? { mes, ids: [] };
  } catch {
    avisados = { mes, ids: [] };
  }
  if (avisados.mes !== mes) avisados = { mes, ids: [] }; // EN: new month: reset / ES: mes nuevo: reinicia
  const set = new Set<string>(avisados.ids);
  // EN: Days until the next occurrence of a payment day, crossing month-end
  //     correctly (e.g. today is the 30th and payment is on the 1st → 1-2 days,
  //     not a negative number). In range = due within the next 3 days.
  // ES: Días hasta la próxima ocurrencia de un día de pago, cruzando bien el fin
  //     de mes (p.ej. hoy es 30 y el pago es el 1 → 1-2 días, no un negativo).
  //     En rango = vence dentro de los próximos 3 días.
  const enRango = (dia?: number) => {
    if (typeof dia !== "number" || dia < 1 || dia > 31) return false;
    const hoy0 = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
    let objetivo = new Date(ahora.getFullYear(), ahora.getMonth(), dia);
    if (objetivo < hoy0) objetivo = new Date(ahora.getFullYear(), ahora.getMonth() + 1, dia);
    const dias = Math.round((objetivo.getTime() - hoy0.getTime()) / 86_400_000);
    return dias >= 0 && dias <= 3;
  };

  // EN: Fixed expenses (expense recurrents active this month). Id prefixed "r"
  //     to avoid colliding with debt ids in the same notified set.
  // ES: Gastos fijos (recurrentes de gasto activos este mes). Id con prefijo "r"
  //     para no chocar con los ids de deudas en el mismo set de avisados.
  for (const r of f.recurrentes) {
    if (r.signo !== "gasto") continue;
    if (!(r.desde <= mes && (r.hasta === null || mes <= r.hasta))) continue;
    if (enRango(r.diaPago) && !set.has("r" + r.id)) {
      set.add("r" + r.id);
      void notificar("Pago próximo", `${r.concepto} (${euro(r.importe)}) el día ${r.diaPago}.`);
    }
  }
  // EN: Installments of active debts (skip debts with no installment this month).
  //     Id prefixed "d" to keep it distinct from recurrent ids.
  // ES: Cuotas de deudas activas (omite deudas sin cuota este mes). Id con prefijo
  //     "d" para mantenerlo distinto de los ids de recurrentes.
  for (const d of f.deudas) {
    if (estadoDeuda(d, mes).cuotaDelMes <= 0) continue;
    if (enRango(d.diaPago) && !set.has("d" + d.id)) {
      set.add("d" + d.id);
      void notificar("Cuota próxima", `${d.concepto} (${euro(d.cuotaMensual)}) el día ${d.diaPago}.`);
    }
  }
  // EN: Persist the notified ids for this month so we never repeat a warning.
  // ES: Persistir los ids avisados de este mes para no repetir nunca un aviso.
  localStorage.setItem(KEY, JSON.stringify({ mes, ids: [...set] }));
}

// ── 8. Watchers & hourly re-check / Watchers y re-chequeo horario ─────────────
// EN: On unlock (data already loaded): settled debts + reminders. Also start an
//     hourly re-check so reminders / upcoming payments still fire if the app
//     stays open across a day or month change (not only at unlock time).
// ES: Al desbloquear (datos ya cargados): deudas saldadas + recordatorios. Además
//     arranca un re-chequeo cada hora para que recordatorios / pagos próximos
//     sigan saltando si la app queda abierta al cambiar de día o mes (no solo al
//     desbloquear).
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
        }, 60 * 60 * 1000); // EN: every hour / ES: cada hora
      }
    }
  },
  { immediate: true }
);
// EN: Re-check settled debts on any debt edit (deep watch over the array).
// ES: Re-chequea deudas saldadas ante cualquier edición de deudas (watch profundo).
watch(() => f.deudas, () => revisarDeudasSaldadas(), { deep: true });
</script>

<!-- ── 9. Template / Plantilla ─────────────────────────────────────────────── -->
<template>
  <!-- EN: Welcome / onboarding (first run) / ES: Bienvenida / onboarding (primer arranque) -->
  <Onboarding v-if="sesion.necesitaOnboarding" />

  <!-- EN: Lock screen / ES: Pantalla de bloqueo -->
  <PantallaBloqueo v-else-if="bloqueado" />

  <!-- EN: Unlocked app / ES: App desbloqueada -->
  <div v-else-if="sesion.desbloqueado" class="min-h-screen flex">
    <!-- EN: Side navigation / ES: Navegación lateral -->
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

    <!-- EN: Content area / ES: Área de contenido -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- EN: Top bar with the month selector / ES: Barra superior con el selector de mes -->
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

      <!-- EN: Active view rendered dynamically from NAV / ES: Vista activa renderizada dinámicamente desde NAV -->
      <main class="flex-1 overflow-y-auto px-8 py-6">
        <component :is="compActual" />
      </main>
    </div>
  </div>

  <!-- EN: Loader (initial instant before state resolves) / ES: Cargando (instante inicial antes de resolver el estado) -->
  <div v-else class="min-h-screen flex items-center justify-center text-muted">{{ t("cargando") }}</div>
</template>
