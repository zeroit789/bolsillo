/* =============================================================================
 * vitest.config.ts — Configuración de los tests / Test configuration
 * -----------------------------------------------------------------------------
 * ES: Tests unitarios de la lógica (deudas, planes, comparativas, copia de
 *     seguridad y cifrado). happy-dom aporta localStorage y el resto de APIs
 *     del navegador que usan los stores; Web Crypto viene de Node.
 * EN: Unit tests for the logic (debts, plans, comparisons, backup and
 *     encryption). happy-dom provides localStorage and the other browser APIs
 *     the stores use; Web Crypto comes from Node.
 * ===========================================================================*/
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.ts"],
  },
});
