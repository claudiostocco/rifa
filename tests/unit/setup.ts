/**
 * Config do projeto unit: garantir limpeza do DOM entre testes de UI
 * e carregar os matchers de acessibilidade do jest-dom (registro automático).
 */
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
