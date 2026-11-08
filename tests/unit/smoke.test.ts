/**
 * ET-5 · Teste 1 (smoke): a suíte unitária roda e resolve o alias `@/`
 * junto ao ambiente React/jsdom — prova de pipeline ativa.
 */
import { describe, expect, it } from "vitest";
import { Button } from "@/components/ui/Button";

describe("suíte de fumaça da infraestrutura de testes", () => {
  it("deve resolver imports de @/ e expor o componente Button como função", () => {
    expect(typeof Button).toBe("function");
    expect(Button.name).toBe("Button");
  });
});
