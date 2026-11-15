/**
 * PL-2 · Teclado, foco e modal (SPEC §3.4.5/RNF-03).
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import { criarRifaDeTeste, limparRifasDeTeste } from "./provisionar-rifas";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

test.afterAll(async () => {
  await limparRifasDeTeste();
});

async function entrar(page: Page): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

test.describe("PL-2 · navegação por teclado na grade e no modal", () => {
  test("deve abrir a venda pela grade, preencher e salvar usando apenas teclado", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({ titulo: "PL2 salvar com teclado" });
    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const numero = page.getByRole("button", { name: "Número 037, disponível" });
    await numero.focus();
    await page.keyboard.press("Enter");

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    const nome = modal.getByLabel("Nome");
    const telefone = modal.getByLabel("Telefone");
    await expect(nome).toBeFocused();
    await page.keyboard.type("Maria Silva");
    await page.keyboard.press("Tab");
    await expect(telefone).toBeFocused();
    await page.keyboard.type("11988887777");
    await page.keyboard.press("Tab");
    const salvar = modal.getByRole("button", { name: "Salvar" });
    await expect(salvar).toBeFocused();
    await page.keyboard.press("Enter");

    await expect(modal).toHaveCount(0);
    await expect(page.getByText("Venda registrada com sucesso.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 037, vendido" })).toBeVisible();
  });

  test("deve manter o foco preso no modal e restaurá-lo ao sair com Escape", async ({ page }) => {
    const rifa = await criarRifaDeTeste({ titulo: "PL2 foco preso" });
    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const numero = page.getByRole("button", { name: "Número 037, disponível" });
    await numero.focus();
    await page.keyboard.press("Enter");
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    const fechar = modal.getByRole("button", { name: "Fechar" });
    const salvar = modal.getByRole("button", { name: "Salvar" });
    await fechar.focus();
    await page.keyboard.press("Shift+Tab");
    await expect(salvar).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(fechar).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
    await expect(numero).toBeFocused();
  });
});
