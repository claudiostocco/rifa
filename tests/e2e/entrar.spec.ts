/**
 * FD-8 · Testes E2E do login `/entrar` (SPEC §4.17, matriz §5.2).
 * Teste 1 (caminho feliz): credenciais válidas → redirect para T1 com
 * sessão httpOnly (@supabase/ssr).
 * Teste 2 (falha): credenciais inválidas → mensagem pt-BR e nenhuma sessão.
 * Teste 3 (extra): rota do organizador sem sessão → redirect a /entrar.
 */
import { expect, test } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

test.describe("FD-8 · login /entrar", () => {
  test("deve entrar com credenciais válidas e seguir para a T1 com sessão httpOnly", async ({
    page,
    context,
  }) => {
    await page.goto("/entrar");

    await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
    await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
    await page.getByRole("button", { name: "Entrar" }).click();

    // Redirect para a T1 (§2.8) com o placeholder da Fase 0 renderizando.
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { level: 1, name: "Rifa App" })).toBeVisible();

    const cookies = await context.cookies();
    const cookieSessao = cookies.find(
      (cookie) => cookie.name.includes("auth-token") && cookie.name.startsWith("sb-"),
    );
    expect(cookieSessao).toBeDefined();
    expect(cookieSessao?.httpOnly).toBe(true);
  });

  test("deve recusar credenciais inválidas com mensagem pt-BR e sem criar sessão", async ({
    page,
    context,
  }) => {
    await page.goto("/entrar");

    await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
    await page.getByLabel("Senha").fill("senha-totamente-errada");
    await page.getByRole("button", { name: "Entrar" }).click();

    await expect(page.getByText("E-mail ou senha incorretos.")).toBeVisible();
    await expect(page).toHaveURL(/\/entrar/);

    const cookies = await context.cookies();
    expect(
      cookies.some((cookie) => cookie.name.includes("auth-token") && cookie.name.startsWith("sb-")),
    ).toBe(false);
  });

  test("deve redirecionar visita anônima a rota protegida para /entrar", async ({ page }) => {
    await page.goto("/rifas");

    await expect(page).toHaveURL(/\/entrar/);
  });
});
