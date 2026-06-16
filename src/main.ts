/* =============================================================================
 * main.ts — App bootstrap / Punto de arranque de la aplicación
 * -----------------------------------------------------------------------------
 * EN: Entry point of the Bolsillo app. Creates the Vue application, registers
 *     Pinia for global state, loads the global stylesheet, and mounts everything
 *     into the #app element of index.html. This is the very first code that runs
 *     on the frontend.
 * ES: Punto de entrada de la app Bolsillo. Crea la aplicación Vue, registra
 *     Pinia para el estado global, carga la hoja de estilos global y monta todo
 *     en el elemento #app de index.html. Es el primer código que se ejecuta en
 *     el frontend.
 * -----------------------------------------------------------------------------
 * INDEX / ÍNDICE:
 *   1. Imports / Importaciones
 *   2. Create & mount app / Crear y montar la app
 * ===========================================================================*/

// ── 1. Imports / Importaciones ───────────────────────────────────────────────
// EN: Vue factory to create the application instance. / ES: Fábrica de Vue para crear la instancia de la app.
import { createApp } from "vue";
// EN: Pinia factory — scalable global state manager. / ES: Fábrica de Pinia — gestor de estado global escalable.
import { createPinia } from "pinia";
// EN: Root component that holds the whole UI tree. / ES: Componente raíz que contiene todo el árbol de UI.
import App from "./App.vue";
// EN: Global styles (Tailwind + app dark theme). / ES: Estilos globales (Tailwind + tema oscuro de la app).
import "./assets/main.css";

// ── 2. Create & mount app / Crear y montar la app ────────────────────────────
// EN: Create the app from the root component, plug in Pinia, and mount it into #app.
// ES: Creamos la app desde el componente raíz, enchufamos Pinia y la montamos en #app.
createApp(App).use(createPinia()).mount("#app");
