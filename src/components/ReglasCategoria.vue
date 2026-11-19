<script setup lang="ts">
/* =============================================================================
 * ReglasCategoria.vue — Reglas de categorización / Categorisation rules
 * -----------------------------------------------------------------------------
 * ES: Sección de Ajustes para las reglas «si el concepto contiene X, la
 *     categoría es Y» que usa la importación de extractos:
 *       - Alta (texto, categoría y, opcional, solo ingresos o solo gastos).
 *       - Lista en el orden en que se aplican (gana la primera que encaja),
 *         con subir/bajar, activar/desactivar y borrar.
 *       - Sugerencias sacadas de las categorías que el usuario corrige a mano
 *         en los movimientos, con «Crear regla».
 * EN: Settings section for the «if the description contains X, the category
 *     is Y» rules the statement import uses:
 *       - Add (text, category and, optionally, income only or expenses only).
 *       - List in the order they apply (the first match wins), with up/down,
 *         enable/disable and delete.
 *       - Suggestions taken from the categories the user corrects by hand on
 *         transactions, with "Create rule".
 * ===========================================================================*/
import { reactive, ref, useId } from "vue";
import { useFinanzas } from "../stores/finanzas";
import { categoriasPorGrupo } from "../data/categorias";
import { crearT } from "../i18n";
import type { Signo } from "../types";

const f = useFinanzas();
const uid = useId();
// ES: Grupos de categorías para el <select>. / EN: Category groups for the <select>.
const grupos = categoriasPorGrupo();

const t = crearT({
  titulo: { es: "Reglas de categoría", en: "Category rules" },
  desc: {
    es: "Al importar un extracto, cada movimiento toma la categoría de la primera regla cuyo texto aparece en su concepto. Si ninguna encaja, va a «Otros».",
    en: "When importing a statement, each transaction takes the category of the first rule whose text appears in its description. If none matches, it goes to “Otros”.",
  },
  contiene: { es: "Si el concepto contiene", en: "If the description contains" },
  phContiene: { es: "Ej. mercadona", en: "E.g. mercadona" },
  categoria: { es: "Categoría", en: "Category" },
  signo: { es: "Aplica a", en: "Applies to" },
  ambos: { es: "Ingresos y gastos", en: "Income and expenses" },
  soloIngresos: { es: "Solo ingresos", en: "Income only" },
  soloGastos: { es: "Solo gastos", en: "Expenses only" },
  anadir: { es: "Añadir regla", en: "Add rule" },
  errTexto: { es: "Escribe el texto que debe contener el concepto.", en: "Enter the text the description must contain." },
  sinReglas: { es: "Aún no hay reglas.", en: "No rules yet." },
  subir: { es: "Subir la regla", en: "Move the rule up" },
  bajar: { es: "Bajar la regla", en: "Move the rule down" },
  activa: { es: "Activa", en: "Active" },
  eliminar: { es: "Eliminar la regla", en: "Delete the rule" },
  regla: { es: "«@x» → @c", en: "“@x” → @c" },
  sugerencias: { es: "Sugerencias", en: "Suggestions" },
  sugerenciasDesc: {
    es: "Salen de las categorías que cambias a mano en los movimientos.",
    en: "They come from the categories you change by hand on transactions.",
  },
  apoyos: { es: "@n correcciones · p. ej. @e", en: "@n corrections · e.g. @e" },
  crear: { es: "Crear regla", en: "Create rule" },
}); // prettier-ignore

// ── Alta / Add ───────────────────────────────────────────────────────────────
const form = reactive({ contiene: "", categoria: "Supermercado", signo: "" as "" | Signo });
const error = ref("");
// ES: Añade la regla del formulario (el store la valida). / EN: Adds the form's rule (the store validates it).
function anadir() {
  error.value = "";
  const ok = f.addRegla({
    contiene: form.contiene,
    categoria: form.categoria,
    ...(form.signo ? { signo: form.signo } : {}),
  });
  if (!ok) return (error.value = t("errTexto"));
  form.contiene = "";
}

// ES: Texto del signo de una regla. / EN: Text of a rule's sign.
function textoSigno(s?: Signo): string {
  return s === "ingreso" ? t("soloIngresos") : s === "gasto" ? t("soloGastos") : t("ambos");
}
</script>

<template>
  <section class="rounded-2xl bg-surface border border-border p-5">
    <h2 class="font-display font-bold text-lg text-ink">{{ t("titulo") }}</h2>
    <p class="text-muted text-sm mt-1">{{ t("desc") }}</p>

    <!-- ES: Formulario de alta. / EN: Add form. -->
    <form class="mt-4 grid gap-3 sm:grid-cols-4 items-end" @submit.prevent="anadir">
      <div class="sm:col-span-2">
        <label :for="`${uid}-contiene`" class="text-xs text-muted">{{ t("contiene") }}</label>
        <input
          :id="`${uid}-contiene`"
          v-model="form.contiene"
          type="text"
          :placeholder="t('phContiene')"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        />
      </div>
      <div>
        <label :for="`${uid}-categoria`" class="text-xs text-muted">{{ t("categoria") }}</label>
        <select
          :id="`${uid}-categoria`"
          v-model="form.categoria"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        >
          <optgroup v-for="g in grupos" :key="g.grupo" :label="g.grupo">
            <option v-for="c in g.items" :key="c" :value="c">{{ c }}</option>
          </optgroup>
        </select>
      </div>
      <div>
        <label :for="`${uid}-signo`" class="text-xs text-muted">{{ t("signo") }}</label>
        <select
          :id="`${uid}-signo`"
          v-model="form.signo"
          class="mt-1 w-full rounded-lg bg-surface-2 border border-border px-3 py-2 text-ink outline-none focus:border-brand"
        >
          <option value="">{{ t("ambos") }}</option>
          <option value="ingreso">{{ t("soloIngresos") }}</option>
          <option value="gasto">{{ t("soloGastos") }}</option>
        </select>
      </div>
      <div class="sm:col-span-4 flex justify-end">
        <button
          type="submit"
          class="rounded-lg bg-brand px-4 py-2 text-white font-medium hover:bg-brand-soft transition-colors"
        >
          {{ t("anadir") }}
        </button>
      </div>
    </form>
    <p v-if="error" role="alert" class="text-danger text-sm mt-2">{{ error }}</p>

    <!-- ES: Reglas en el orden en que se aplican. / EN: Rules in the order they apply. -->
    <ol v-if="f.reglasOrdenadas.length" class="mt-4 space-y-2">
      <li
        v-for="(r, i) in f.reglasOrdenadas"
        :key="r.id"
        class="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 border border-border px-3 py-2 text-sm"
        :class="r.activa === false ? 'opacity-60' : ''"
      >
        <span class="text-faint w-6 text-right">{{ i + 1 }}.</span>
        <span class="flex-1 min-w-0 truncate text-ink">
          {{ t("regla").replace("@x", r.contiene).replace("@c", r.categoria) }}
          <span class="text-faint">· {{ textoSigno(r.signo) }}</span>
        </span>
        <label class="flex items-center gap-1 text-xs text-muted cursor-pointer">
          <input
            type="checkbox"
            class="accent-brand"
            :checked="r.activa !== false"
            @change="
              f.actualizarRegla(r.id, { activa: ($event.target as HTMLInputElement).checked })
            "
          />
          {{ t("activa") }}
        </label>
        <button
          type="button"
          class="rounded px-2 py-1 text-muted hover:text-ink disabled:opacity-30"
          :disabled="i === 0"
          :aria-label="`${t('subir')}: ${r.contiene}`"
          @click="f.moverRegla(r.id, -1)"
        >
          <span aria-hidden="true">↑</span>
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-muted hover:text-ink disabled:opacity-30"
          :disabled="i === f.reglasOrdenadas.length - 1"
          :aria-label="`${t('bajar')}: ${r.contiene}`"
          @click="f.moverRegla(r.id, 1)"
        >
          <span aria-hidden="true">↓</span>
        </button>
        <button
          type="button"
          class="rounded px-2 py-1 text-faint hover:text-danger"
          :aria-label="`${t('eliminar')}: ${r.contiene}`"
          @click="f.eliminarRegla(r.id)"
        >
          <span aria-hidden="true">✕</span>
        </button>
      </li>
    </ol>
    <p v-else class="text-faint text-xs mt-3">{{ t("sinReglas") }}</p>

    <!-- ES: Sugerencias a partir de correcciones. / EN: Suggestions from corrections. -->
    <div v-if="f.sugerencias.length" class="mt-5">
      <h3 class="font-display font-bold text-ink">{{ t("sugerencias") }}</h3>
      <p class="text-faint text-xs">{{ t("sugerenciasDesc") }}</p>
      <ul class="mt-2 space-y-2">
        <li
          v-for="s in f.sugerencias"
          :key="s.contiene + s.categoria + (s.signo ?? '')"
          class="flex flex-wrap items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm"
        >
          <span class="flex-1 min-w-0">
            <span class="text-ink">{{
              t("regla").replace("@x", s.contiene).replace("@c", s.categoria)
            }}</span>
            <span class="block text-xs text-faint truncate">{{
              t("apoyos").replace("@n", String(s.apoyos)).replace("@e", s.ejemplos.join(" · "))
            }}</span>
          </span>
          <button
            type="button"
            class="rounded-lg bg-brand px-3 py-1 text-white text-sm font-medium hover:bg-brand-soft"
            @click="f.crearReglaDeSugerencia(s)"
          >
            {{ t("crear") }}
          </button>
        </li>
      </ul>
    </div>
  </section>
</template>
