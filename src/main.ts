/* =============================================================================
 * main.ts — Punto de arranque de la aplicación / App bootstrap
 * -----------------------------------------------------------------------------
 * ES: Punto de entrada de la app Bolsillo. Crea la aplicación Vue, registra
 *     Pinia para el estado global, carga la hoja de estilos global y monta todo
 *     en el elemento #app de index.html. Es el primer código que se ejecuta en
 *     el frontend.
 * EN: Entry point of the Bolsillo app. Creates the Vue application, registers
 *     Pinia for global state, loads the global stylesheet, and mounts everything
 *     into the #app element of index.html. This is the very first code that runs
 *     on the frontend.
 * -----------------------------------------------------------------------------
 * ÍNDICE / INDEX:
 *   1. Importaciones / Imports
 *   2. Crear y montar la app / Create & mount app
 * ===========================================================================*/

// ── 1. Importaciones / Imports ───────────────────────────────────────────────
// ES: Fábrica de Vue para crear la instancia de la app. / EN: Vue factory to create the application instance.
import { createApp } from "vue";
// ES: Fábrica de Pinia — gestor de estado global escalable. / EN: Pinia factory — scalable global state manager.
import { createPinia } from "pinia";
// ES: Componente raíz que contiene todo el árbol de UI. / EN: Root component that holds the whole UI tree.
import App from "./App.vue";
// ES: Estilos globales (Tailwind + tema oscuro de la app). / EN: Global styles (Tailwind + app dark theme).
import "./assets/main.css";

// ── 2. Crear y montar la app / Create & mount app ────────────────────────────
// ES: Creamos la app desde el componente raíz, enchufamos Pinia y la montamos en #app.
// EN: Create the app from the root component, plug in Pinia, and mount it into #app.
createApp(App).use(createPinia()).mount("#app");
