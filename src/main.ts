import { createApp } from "vue";
import { createPinia } from "pinia"; // gestor de estado escalable
import App from "./App.vue";
import "./assets/main.css"; // Tailwind + tema dark de la app

// Monta la app con Pinia (estado global) en el div #app
createApp(App).use(createPinia()).mount("#app");
