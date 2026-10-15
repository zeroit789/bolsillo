/* =============================================================================
 * eslint.config.js — Reglas de calidad del código / Code quality rules
 * -----------------------------------------------------------------------------
 * ES: Config plana (flat config) oficial de Vue + TypeScript:
 *       - eslint-plugin-vue "flat/essential": errores reales en componentes.
 *       - vueTsConfigs.recommended: reglas recomendadas de typescript-eslint,
 *         también dentro de los bloques <script lang="ts"> de los .vue.
 *       - skip-formatting: apaga las reglas de estilo que chocan con Prettier
 *         (el formato lo lleva Prettier por separado: `pnpm format:check`).
 * EN: Official Vue + TypeScript flat config:
 *       - eslint-plugin-vue "flat/essential": real errors in components.
 *       - vueTsConfigs.recommended: typescript-eslint recommended rules, also
 *         inside the <script lang="ts"> blocks of .vue files.
 *       - skip-formatting: turns off style rules that clash with Prettier
 *         (formatting is handled by Prettier on its own: `pnpm format:check`).
 * ===========================================================================*/
import { globalIgnores } from "eslint/config";
import pluginVue from "eslint-plugin-vue";
import { withVueTs, vueTsConfigs } from "@vue/eslint-config-typescript";
import skipFormatting from "@vue/eslint-config-prettier/skip-formatting";

export default withVueTs(
  // ES: Qué ficheros se revisan. / EN: Which files are linted.
  {
    name: "bolsillo/ficheros",
    files: ["**/*.{ts,mts,tsx,vue}"],
  },

  // ES: Generados, dependencias y backend Rust: fuera.
  // EN: Generated output, dependencies and the Rust backend: skipped.
  globalIgnores(["dist/**", "node_modules/**", "src-tauri/**", "coverage/**"]),

  pluginVue.configs["flat/essential"],
  vueTsConfigs.recommended,

  // ES: "Onboarding" es una sola palabra pero no choca con ninguna etiqueta HTML
  //     (que es lo que esta regla evita); se exime solo ese nombre en vez de
  //     renombrar el componente o apagar la regla entera.
  // EN: "Onboarding" is a single word but it does not clash with any HTML tag
  //     (which is what this rule prevents); only that name is exempted instead of
  //     renaming the component or turning the whole rule off.
  {
    name: "bolsillo/nombres-componentes",
    files: ["**/*.vue"],
    rules: {
      "vue/multi-word-component-names": ["error", { ignores: ["Onboarding"] }],
    },
  },

  // ES: Siempre el último, para que gane frente a las reglas de estilo anteriores.
  // EN: Always last, so it wins over the previous style rules.
  skipFormatting
);
