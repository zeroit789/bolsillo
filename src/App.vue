<script setup lang="ts">
/* ===========================================================================
   Shell de la app: bloqueo al arrancar (si procede), navegación lateral,
   selector de mes global y render de la vista activa. Además dispara la
   notificación cuando una deuda queda saldada en el mes actual.
   =========================================================================== */
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

const sesion = useSesion();
const ajustes = useAjustes();
const f = useFinanzas();

// Traducciones del shell (etiquetas del menú, saludo y carga).
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

// Secciones de navegación.
const NAV = [
  { id: "resumen", etiqueta: "Resumen", icono: "📊", comp: DashboardView },
  { id: "movimientos", etiqueta: "Movimientos", icono: "🧾", comp: MovimientosView },
  { id: "calendario", etiqueta: "Calendario", icono: "🗓️", comp: CalendarioView },
  { id: "deudas", etiqueta: "Deudas", icono: "💳", comp: DeudasView },
  { id: "planes", etiqueta: "Planes", icono: "🎯", comp: PlanesView },
  { id: "presupuestos", etiqueta: "Presupuestos", icono: "🧮", comp: PresupuestosView },
  { id: "sobres", etiqueta: "Sobres", icono: "✉️", comp: SobresView },
  { id: "cuentas", etiqueta: "Cuentas", icono: "🏦", comp: CuentasView },
  { id: "historial", etiqueta: "Historial", icono: "📅", comp: HistorialView },
  { id: "ajustes", etiqueta: "Ajustes", icono: "⚙️", comp: AjustesView },
] as const;

const vista = ref<(typeof NAV)[number]["id"]>("resumen");
const compActual = computed(() => NAV.find((n) => n.id === vista.value)!.comp);
// El selector de mes solo tiene sentido en estas vistas.
const mostrarMes = computed(() =>
  ["resumen", "movimientos", "calendario", "deudas", "presupuestos", "sobres"].includes(vista.value)
);

// Estado de pantalla: bloqueo / contenido / cargando.
const bloqueado = computed(() => ajustes.bloqueoActivo && !sesion.desbloqueado);

onMounted(() => {
  void sesion.arrancar();
});

// --- Notificación de deuda saldada ---
// Una deuda se salda por el PASO DEL TIEMPO (no por mutar el array), así que no
// basta observar f.deudas: revisamos al desbloquear (datos ya hidratados) y ante
// ediciones de deudas. Persistimos las ya avisadas para no repetir; en el primer
// arranque marcamos las ya saldadas SIN avisar (estado base, evita spam inicial).
const NOTIF_KEY = "bolsillo.deudas.notificadas";
function revisarDeudasSaldadas() {
  const primeraVez = localStorage.getItem(NOTIF_KEY) === null;
  let set: Set<string>;
  try {
    set = new Set<string>(JSON.parse(localStorage.getItem(NOTIF_KEY) ?? "[]"));
  } catch {
    set = new Set<string>();
  }
  let cambia = false;
  for (const d of f.deudas) {
    const terminada = estadoDeuda(d, mesActual()).terminada;
    if (terminada && !set.has(d.id)) {
      if (!primeraVez) {
        void notificar("¡Deuda saldada! 🎉", `Has terminado de pagar "${d.concepto}".`);
      }
      set.add(d.id);
      cambia = true;
    } else if (!terminada && set.has(d.id)) {
      set.delete(d.id); // se editó y volvió a quedar pendiente
      cambia = true;
    }
  }
  if (cambia || primeraVez) localStorage.setItem(NOTIF_KEY, JSON.stringify([...set]));
}
// Recordatorio mensual: una vez al mes avisa del total de gastos fijos + cuotas.
function recordatorioMensual() {
  const mes = mesActual();
  if (localStorage.getItem("bolsillo.recordatorio-mes") === mes) return;
  const r = f.resumenDe(mes);
  if (r.gastosFijos > 0) {
    void notificar(
      "Recordatorio del mes",
      `Este mes tienes ${euro(r.gastosFijos)} en gastos fijos y cuotas.`
    );
    // Marcar el mes SOLO si avisamos (si aún no hay fijos, reintentar luego).
    localStorage.setItem("bolsillo.recordatorio-mes", mes);
  }
}

// Avisa de pagos próximos: fijos y cuotas con día de pago en los próximos 3
// días. Una vez por (id+mes) para no repetir.
function revisarPagosProximos() {
  const mes = mesActual();
  const hoy = new Date().getDate();
  const KEY = "bolsillo.pagos-avisados";
  let avisados: { mes: string; ids: string[] };
  try {
    avisados = JSON.parse(localStorage.getItem(KEY) ?? "null") ?? { mes, ids: [] };
  } catch {
    avisados = { mes, ids: [] };
  }
  if (avisados.mes !== mes) avisados = { mes, ids: [] }; // mes nuevo: reinicia
  const set = new Set<string>(avisados.ids);
  const enRango = (dia?: number) =>
    typeof dia === "number" && dia - hoy >= 0 && dia - hoy <= 3;

  // Gastos fijos (recurrentes de gasto activos este mes)
  for (const r of f.recurrentes) {
    if (r.signo !== "gasto") continue;
    if (!(r.desde <= mes && (r.hasta === null || mes <= r.hasta))) continue;
    if (enRango(r.diaPago) && !set.has("r" + r.id)) {
      set.add("r" + r.id);
      void notificar("Pago próximo", `${r.concepto} (${euro(r.importe)}) el día ${r.diaPago}.`);
    }
  }
  // Cuotas de deudas activas
  for (const d of f.deudas) {
    if (estadoDeuda(d, mes).cuotaDelMes <= 0) continue;
    if (enRango(d.diaPago) && !set.has("d" + d.id)) {
      set.add("d" + d.id);
      void notificar("Cuota próxima", `${d.concepto} (${euro(d.cuotaMensual)}) el día ${d.diaPago}.`);
    }
  }
  localStorage.setItem(KEY, JSON.stringify({ mes, ids: [...set] }));
}

// Al desbloquear (datos ya cargados): deudas saldadas + recordatorios.
watch(
  () => sesion.desbloqueado,
  (v) => {
    if (v) {
      revisarDeudasSaldadas();
      recordatorioMensual();
      revisarPagosProximos();
    }
  },
  { immediate: true }
);
watch(() => f.deudas, () => revisarDeudasSaldadas(), { deep: true });
</script>

<template>
  <!-- Bienvenida (primer arranque) -->
  <Onboarding v-if="sesion.necesitaOnboarding" />

  <!-- Pantalla de bloqueo -->
  <PantallaBloqueo v-else-if="bloqueado" />

  <!-- App desbloqueada -->
  <div v-else-if="sesion.desbloqueado" class="min-h-screen flex">
    <!-- Navegación lateral -->
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

    <!-- Contenido -->
    <div class="flex-1 min-w-0 flex flex-col">
      <!-- Barra superior con el selector de mes -->
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

      <main class="flex-1 overflow-y-auto px-8 py-6">
        <component :is="compActual" />
      </main>
    </div>
  </div>

  <!-- Cargando (instante inicial) -->
  <div v-else class="min-h-screen flex items-center justify-center text-muted">{{ t("cargando") }}</div>
</template>
