<h1 align="center">Bolsillo</h1>

<p align="center">
  <strong>Gestor de gastos personales de escritorio — offline, privado y rápido.</strong><br>
  App nativa multiplataforma hecha con Tauri 2 + Vue 3.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-2-FFC131?logo=tauri&logoColor=black" alt="Tauri 2">
  <img src="https://img.shields.io/badge/Vue-3-42B883?logo=vuedotjs&logoColor=white" alt="Vue 3">
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind 4">
  <img src="https://img.shields.io/badge/license-MIT-7c6af7" alt="MIT">
</p>

<p align="center">
  <img src="art/dashboard.png" alt="Dashboard de Bolsillo" width="820">
</p>

---

## Qué es

**Bolsillo** es una app de escritorio para llevar tus gastos e ingresos mes a mes, sin servidores ni cuentas: **todo se queda en tu equipo**. Pensada para ser rápida, bonita en modo oscuro y fácil de mantener y ampliar.

> Los datos que trae al abrir son de **ejemplo** (genéricos). No contiene información personal de nadie.

## Características

- 📊 **Dashboard** con KPIs del mes: ingresos, gastos totales, disponible y gastos fijos.
- 🧾 **Movimientos** con tipo (ingreso / gasto fijo / gasto variable), categoría y fecha.
- 📅 **Vista por mes** con selector entre los meses con datos.
- 🏷️ **Gasto por categoría** con barras de reparto.
- 💾 **Offline** — persistencia local, sin backend ni telemetría.
- 🌙 **Modo oscuro** cuidado (tipografías Syne + DM Sans).

### En camino

- Deudas y patrimonio · situaciones de vida · exportar a XLSX/PDF · bloqueo por PIN.

## Stack

| Capa | Tecnología |
|------|------------|
| **Núcleo desktop** | Tauri 2 (Rust) |
| **Interfaz** | Vue 3 + TypeScript (`<script setup>`) |
| **Estilos** | Tailwind CSS 4 |
| **Estado** | Pinia |
| **Build** | Vite |

## Desarrollo

Requisitos: [Node.js](https://nodejs.org) + [pnpm](https://pnpm.io), [Rust](https://rustup.rs) y los [prerequisitos de Tauri](https://tauri.app/start/prerequisites/).

```bash
pnpm install        # instalar dependencias
pnpm tauri dev      # app de escritorio en modo desarrollo
pnpm dev            # solo el frontend en el navegador (http://localhost:1420)
pnpm tauri build    # generar el ejecutable de producción
```

## Licencia

[MIT](LICENSE) — © Daniel Castaños Mefle
