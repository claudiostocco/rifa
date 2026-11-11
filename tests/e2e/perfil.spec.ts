/**
 * FD-9 · Testes E2E do perfil do organizador (SPEC §4.17 · matriz §5.2
 * linha "4.17 login/perfil").
 *
 * Teste 1 (caminho feliz): com sessão ativa, salvar nome + WhatsApp exibe o
 *   feedback de sucesso (a persistência em `perfis` é provada no teste int).
 * Teste 2 (falha/borda): visita anônima a /perfil → redirect a /entrar;
 *   WhatsApp inválido submetido → erro pt-BR visível (Zod na Server Action).
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

/** Fluxo de login reaproveitado pelas telas protegidas (sessão no contexto). */
async function entrarComoOrganizador(page: Page) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("FD-9 · perfil do organizador", () => {
  test("deve salvar nome de exibição e WhatsApp do perfil com sessão ativa", async ({ page }) => {
    await entrarComoOrganizador(page);

    await page.goto("/perfil");
    await expect(page.getByRole("heading", { level: 1, name: "Meu perfil" })).toBeVisible();

    await page.getByLabel("Nome de exibição").fill("Organizador da Rifa");
    await page.getByLabel("WhatsApp").fill("(11) 98888-7777");
    await page.getByRole("button", { name: "Salvar perfil" }).click();

    await expect(page.getByText("Perfil salvo com sucesso.")).toBeVisible();
  });

  test("deve redirecionar a visita anônima de /perfil para /entrar", async ({ page }) => {
    await page.goto("/perfil");

    await expect(page).toHaveURL(/\/entrar/);
  });

  test("deve recusar WhatsApp incompleto com mensagem pt-BR visível", async ({ page }) => {
    await entrarComoOrganizador(page);

    await page.goto("/perfil");
    await page.getByLabel("Nome de exibição").fill("Organizador da Rifa");
    await page.getByLabel("WhatsApp").fill("(11) 123");
    await page.getByRole("button", { name: "Salvar perfil" }).click();

    await expect(page.getByText(/formato E\.164/i)).toBeVisible();
  });
});
