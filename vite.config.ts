// =============================================================================
// vite.config.ts — Configuración de Vite / Vite configuration
// -----------------------------------------------------------------------------
// ES: Build y servidor de desarrollo del frontend. Carga los plugins de Vue y
//     Tailwind CSS v4 y ajusta el servidor para que funcione dentro de Tauri
//     (`pnpm tauri dev` / `pnpm tauri build`).
// EN: Frontend build and dev server. Loads the Vue and Tailwind CSS v4 plugins
//     and tunes the dev server so it works inside Tauri
//     (`pnpm tauri dev` / `pnpm tauri build`).
// =============================================================================
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
// ES: Plugin oficial de Tailwind CSS v4 para Vite (sustituye a postcss + autoprefixer).
// EN: Official Tailwind CSS v4 plugin for Vite (replaces postcss + autoprefixer).
import tailwindcss from "@tailwindcss/vite";

// ES: Host que Tauri expone al desarrollar en un dispositivo remoto (móvil). Vacío
//     en escritorio. `process` es un global de Node que el tsconfig del navegador
//     no conoce, de ahí la directiva de abajo.
// EN: Host Tauri exposes when developing on a remote (mobile) device. Empty on
//     desktop. `process` is a Node global the browser tsconfig doesn't know,
//     hence the directive below.
// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// ES: Documentación / EN: Docs → https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [vue(), tailwindcss()],

  // ES: Opciones de Vite pensadas para Tauri; solo se aplican en `tauri dev` o `tauri build`.
  // EN: Vite options tailored for Tauri; only applied in `tauri dev` or `tauri build`.
  //
  // ES: 1. No limpiar la pantalla, para que Vite no tape los errores de Rust.
  // EN: 1. Don't clear the screen, so Vite doesn't hide Rust errors.
  clearScreen: false,
  // ES: 2. Tauri espera un puerto fijo; si está ocupado, fallar en vez de cambiarlo.
  // EN: 2. Tauri expects a fixed port; fail if it is taken instead of switching.
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    // ES: Recarga en caliente por WebSocket solo cuando hay host remoto.
    // EN: Hot reload over WebSocket only when there is a remote host.
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // ES: 3. Que Vite no vigile `src-tauri` (de eso se encarga Cargo).
      // EN: 3. Tell Vite not to watch `src-tauri` (Cargo takes care of it).
      ignored: ["**/src-tauri/**"],
    },
  },
}));
