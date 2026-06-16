<script setup lang="ts">
/* ===========================================================================
   Vista de Presupuestos.
   Permite poner un tope mensual de gasto por categoría y ver, con una barra de
   progreso, cuánto se lleva gastado del límite en el mes seleccionado.

   - El gasto de cada categoría se lee de finanzas.gastoPorCategoria (ya
     calculado por el store para el mes seleccionado). Si una categoría no
     aparece en esa lista, su gasto es 0.
   - Colores de la barra según el porcentaje gastado:
       < 80%   -> verde (ok)        situación tranquila
       80-100% -> amarillo (warn)   ojo, te acercas al tope
       > 100%  -> rojo (danger)     te has pasado del presupuesto

   Convenciones tomadas del resto de vistas (PlanesView):
     - Store central useFinanzas ya inicializado en la app.
     - Mismas clases de paleta (bg-surface, border-border, bg-brand...).
   =========================================================================== */
import { ref, computed } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { euro } from "../utils/format";
import { NOMBRES_CATEGORIA, colorCategoria } from "../data/categorias";
import { crearT } from "../i18n";

// Store central de finanzas (ya inicializado en la app).
const finanzas = useFinanzas();

// Función de traducción del componente (ES/EN). Reúne todos los textos visibles.
const t = crearT({
  titulo: { es: "Presupuestos", en: "Budgets" },
  subtitulo: {
    es: "Pon un tope mensual por categoría y controla cuánto llevas",
    en: "Set a monthly cap per category and track how much you've spent",
  },
  nuevoTope: { es: "Nuevo tope o editar", en: "New cap or edit" },
  categoria: { es: "Categoría", en: "Category" },
  topeMensual: { es: "Tope mensual (€)", en: "Monthly cap (€)" },
  placeholderImporte: { es: "Ej: 300", en: "E.g. 300" },
  guardarTope: { es: "Guardar tope", en: "Save cap" },
  errorCategoria: { es: "Elige una categoría.", en: "Choose a category." },
  errorImporte: { es: "Pon un importe mayor que 0 €.", en: "Enter an amount greater than €0." },
  vacioTitulo: { es: "Aún no tienes ningún tope", en: "You don't have any caps yet" },
  vacioTexto: {
    es: "Define un límite mensual por categoría para vigilar tus gastos del mes.",
    en: "Set a monthly limit per category to keep an eye on this month's spending.",
  },
  eliminarTope: { es: "Eliminar tope", en: "Delete cap" },
  // Función para el texto "Gastado X de Y" (interpola los importes ya formateados).
  gastado: { es: "Gastado", en: "Spent" },
  de: { es: "de", en: "of" },
  pasado: { es: "¡Te has pasado!", en: "You've gone over!" },
  // Mensaje del confirm de borrado (lleva el nombre de la categoría interpolado aparte).
  confirmEliminarA: { es: '¿Eliminar el tope de "', en: 'Delete the cap for "' },
  confirmEliminarB: { es: '"?', en: '"?' },
});

// --- Estado del formulario de alta/edición de un tope ---
// Categoría seleccionada en el <select> (por defecto, la primera del catálogo).
const categoriaSel = ref<string>(NOMBRES_CATEGORIA[0] ?? "");
// Límite introducido como texto crudo (admite coma o punto decimal).
const limiteTexto = ref<string>("");
// Mensaje de error de validación (vacío = sin error).
const error = ref<string>("");

// --- Helpers de cálculo ---

// Normaliza un texto numérico ("12,50" o "12.50") a número con 2 decimales.
function aNumero(valor: string): number {
  const n = Number(valor.replace(",", "."));
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

// Mapa categoría -> gasto del mes (a partir de finanzas.gastoPorCategoria).
// Se recalcula de forma reactiva cuando cambia el gasto del mes.
const gastoPorCat = computed<Map<string, number>>(() => {
  const mapa = new Map<string, number>();
  for (const g of finanzas.gastoPorCategoria) {
    mapa.set(g.categoria, g.total);
  }
  return mapa;
});

// Gasto del mes para una categoría concreta (0 si no hay gasto registrado).
function gastoDe(categoria: string): number {
  return gastoPorCat.value.get(categoria) ?? 0;
}

// Porcentaje REAL gastado sobre el límite (puede superar 100).
// Si el límite es <= 0 devolvemos 0 para evitar dividir por cero.
function porcentajeReal(categoria: string, limite: number): number {
  if (limite <= 0) return 0;
  return Math.round((gastoDe(categoria) / limite) * 100);
}

// Porcentaje recortado (clamp) al rango 0..100 para el ancho de la barra.
function porcentajeBarra(categoria: string, limite: number): number {
  return Math.min(100, Math.max(0, porcentajeReal(categoria, limite)));
}

// ¿Se ha pasado del presupuesto? (gastado > límite)
function pasado(categoria: string, limite: number): boolean {
  return porcentajeReal(categoria, limite) > 100;
}

// Clase de color del relleno de la barra según el % gastado.
function colorBarra(categoria: string, limite: number): string {
  const pct = porcentajeReal(categoria, limite);
  if (pct > 100) return "bg-danger"; // rojo — pasado
  if (pct >= 80) return "bg-warn"; // amarillo — al borde
  return "bg-ok"; // verde — tranquilo
}

// Clase de color del texto del porcentaje (a juego con la barra).
function colorTexto(categoria: string, limite: number): string {
  const pct = porcentajeReal(categoria, limite);
  if (pct > 100) return "text-danger";
  if (pct >= 80) return "text-warn";
  return "text-ok";
}

// --- Acciones ---

// Guarda (upsert) el tope de la categoría seleccionada.
function guardarTope(): void {
  error.value = "";
  const cat = categoriaSel.value.trim();
  // Debe haber una categoría elegida.
  if (!cat) {
    error.value = t("errorCategoria");
    return;
  }
  const limite = aNumero(limiteTexto.value);
  // El límite debe ser mayor que 0 (un 0 lo borraría; aquí pedimos uno válido).
  if (limite <= 0) {
    error.value = t("errorImporte");
    return;
  }
  // El store hace el upsert: si ya existe la categoría la reemplaza.
  finanzas.setPresupuesto(cat, limite);
  // Limpia el campo de importe tras guardar (deja la categoría por comodidad).
  limiteTexto.value = "";
}

// Elimina el presupuesto de una categoría (con confirmación nativa).
function borrarTope(categoria: string): void {
  // confirm() nativo: si el usuario cancela, no se borra nada.
  if (!confirm(`${t("confirmEliminarA")}${categoria}${t("confirmEliminarB")}`)) return;
  finanzas.eliminarPresupuesto(categoria);
}
</script>

<template>
  <!-- Contenedor de la vista -->
  <div class="min-h-full bg-base p-6 text-ink">
    <!-- 1. Cabecera: título + texto explicativo -->
    <header class="mb-6">
      <h1 class="font-display text-2xl font-bold">{{ t("titulo") }}</h1>
      <p class="mt-1 text-sm text-muted">
        {{ t("subtitulo") }}
      </p>
    </header>

    <!-- 2. Formulario para añadir / editar un tope -->
    <section class="rounded-2xl bg-surface border border-border p-5 mb-6">
      <h2 class="font-display font-bold mb-4">{{ t("nuevoTope") }}</h2>
      <!-- @submit.prevent para no recargar la app (es una SPA de escritorio) -->
      <form class="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end" @submit.prevent="guardarTope">
        <!-- Selector de categoría -->
        <div>
          <label class="mb-1 block text-sm text-muted">{{ t("categoria") }}</label>
          <select
            v-model="categoriaSel"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
          >
            <option v-for="nombre in NOMBRES_CATEGORIA" :key="nombre" :value="nombre">
              {{ nombre }}
            </option>
          </select>
        </div>

        <!-- Importe del tope (€) -->
        <div>
          <label class="mb-1 block text-sm text-muted">{{ t("topeMensual") }}</label>
          <input
            v-model="limiteTexto"
            type="text"
            inputmode="decimal"
            :placeholder="t('placeholderImporte')"
            class="w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand sm:w-40"
          />
        </div>

        <!-- Botón guardar -->
        <button
          type="submit"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft"
        >
          {{ t("guardarTope") }}
        </button>
      </form>

      <!-- Mensaje de error de validación -->
      <p v-if="error" class="mt-3 text-sm text-danger">{{ error }}</p>
    </section>

    <!-- 3. Estado vacío: no hay presupuestos definidos -->
    <div
      v-if="finanzas.presupuestos.length === 0"
      class="rounded-2xl bg-surface border border-border p-10 text-center"
    >
      <p class="text-4xl">💰</p>
      <p class="mt-3 font-display font-bold text-ink">{{ t("vacioTitulo") }}</p>
      <p class="mt-1 text-sm text-muted">
        {{ t("vacioTexto") }}
      </p>
    </div>

    <!-- 4. Listado de presupuestos definidos: una tarjeta por categoría -->
    <div v-else class="grid gap-4 sm:grid-cols-2">
      <article
        v-for="p in finanzas.presupuestos"
        :key="p.categoria"
        class="rounded-2xl bg-surface border border-border p-5"
      >
        <!-- Cabecera de la tarjeta: punto de color + categoría + botón eliminar -->
        <div class="flex items-start justify-between gap-3">
          <div class="flex items-center gap-2 min-w-0">
            <!-- Punto del color de la categoría -->
            <span
              class="h-3 w-3 shrink-0 rounded-full"
              :style="{ backgroundColor: colorCategoria(p.categoria) }"
            ></span>
            <h2 class="font-display font-bold leading-tight truncate">
              {{ p.categoria }}
            </h2>
          </div>
          <!-- Botón eliminar (con confirm) -->
          <button
            class="shrink-0 rounded-lg bg-surface-2 border border-border px-2 py-1 text-sm text-muted hover:text-danger hover:border-danger"
            :title="t('eliminarTope')"
            :aria-label="t('eliminarTope')"
            @click="borrarTope(p.categoria)"
          >
            🗑️
          </button>
        </div>

        <!-- Barra de progreso gastado / límite -->
        <div class="mt-4">
          <div class="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <!-- Relleno: ancho recortado a 0..100, color según el % gastado -->
            <div
              class="h-full rounded-full transition-all"
              :class="colorBarra(p.categoria, p.limite)"
              :style="{ width: porcentajeBarra(p.categoria, p.limite) + '%' }"
            ></div>
          </div>

          <!-- Texto: gastado X de Y (N%) — el % mostrado es el REAL (puede pasar de 100) -->
          <p class="mt-2 text-xs text-muted">
            {{ t("gastado") }} {{ euro(gastoDe(p.categoria)) }} {{ t("de") }} {{ euro(p.limite) }}
            (<span :class="colorTexto(p.categoria, p.limite)">{{ porcentajeReal(p.categoria, p.limite) }}%</span>)
          </p>

          <!-- Aviso cuando se ha pasado del tope -->
          <p v-if="pasado(p.categoria, p.limite)" class="mt-1 text-xs font-medium text-danger">
            {{ t("pasado") }}
          </p>
        </div>
      </article>
    </div>
  </div>
</template>
