/**
 * ET-6 · Teste 1 (smoke E2E): a home acessa com conteúdo mínimo visível
 * em ambos os projetos (celular 360px e desktop).
 */
import { expect, test } from "@playwright/test";

test.describe("fumaça · tela inicial", () => {
  test("deve exibir o título do Rifa App sem erros de renderização", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { level: 1, name: "Rifa App" })).toBeVisible();
    await expect(
      page.getByText("Crie rifas, registre vendas e realize o sorteio com transparência.")
    ).toBeVisible();
  });

  test("deve declarar o manifest da PWA (decisão 6 — instalável)", async ({ page }) => {
    await page.goto("/");

    const manifesto = await page
      .locator("link[rel='manifest']")
      .getAttribute("href");

    expect(manifesto).toBe("/manifest.webmanifest");
  });
});
