/// <reference types="vite/client" />
// ES: La línea de arriba añade los tipos de Vite (import.meta.env, assets…).
// EN: The line above adds Vite's types (import.meta.env, assets…).

// ES: Declara los ficheros .vue como componentes para que TypeScript acepte
//     `import X from "./X.vue"`.
// EN: Declares .vue files as components so TypeScript accepts
//     `import X from "./X.vue"`.
declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
