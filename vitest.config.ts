import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default node; testes de componentes podem sobrescrever via // @vitest-environment happy-dom
    environment: "node",
    include: ["tests/unit/**/*.{test,spec}.{ts,tsx}"],
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
