/**
 * FD-12 · Testes E2E da Tela T1 · Minhas Rifas (SPEC §3.2/§4.3 · matriz §5.2
 * linha RF-03).
 *
 * Teste 1 (caminho feliz): rifa criada (via provisionamento do stack local —
 *   a T2/FD-13 ainda não existe) → card com título, progresso 0/100 e badge
 *   🟢 Aberta; filtro por status funciona.
 * Teste 2 (falha/borda): organizador sem rifas → empty state "Crie a
 *   primeira!"; rifa arquivada não aparece na listagem (RF-03).
 * Extra: arquivamento pelo menu ⋮ com feedback (toast) e saída da listagem.
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import {
  CREDENCIAIS_SEM_RIFAS,
  criarRifaDeTeste,
  limparRifasDeTeste,
  provisionarOrganizadorSemRifas,
} from "./provisionar-rifas";

test.beforeAll(async () => {
  await provisionarOrganizador();
  await provisionarOrganizadorSemRifas();
});

// ET-7/bootstrap: a base local segue íntegra depois dos E2E — cada worker
// remove as rifas que criou (DELETE em cascata leva os numeros).
test.afterAll(async () => {
  await limparRifasDeTeste();
});

/** Fluxo de login do organizador (sessão no contexto do teste). */
async function entrar(page: Page, credenciais: { email: string; senha: string }) {
  // Sessão anterior no mesmo contexto mandaria /entrar de volta à T1 (FD-8);
  // limpar os cookies torna cada login independente (troca de usuário).
  await page.context().clearCookies();
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(credenciais.email);
  await page.getByLabel("Senha").fill(credenciais.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("FD-12 · T1 · Minhas Rifas", () => {
  test("deve exibir a rifa criada com título, progresso 0/100 e badge Aberta, e filtrar por status", async ({
    page,
  }) => {
    const rifaAberta = await criarRifaDeTeste({ titulo: "Rifa do bazar beneficente" });
    const rifaEncerrada = await criarRifaDeTeste({
      titulo: "Gincana do bairro",
      status: "encerrada",
    });

    await entrar(page, CREDENCIAIS_ORGANIZADOR);

    await expect(page.getByRole("heading", { level: 1, name: "Minhas Rifas" })).toBeVisible();

    const cartaoAberta = page.getByRole("listitem").filter({ hasText: rifaAberta.titulo });
    await expect(cartaoAberta).toBeVisible();
    await expect(cartaoAberta.getByText("0/100")).toBeVisible();
    // O badge carrega emoji + rótulo no mesmo elemento (§3.2: 🟢 Aberta).
    await expect(cartaoAberta.getByText("🟢 Aberta")).toBeVisible();

    const cartaoEncerrada = page.getByRole("listitem").filter({ hasText: rifaEncerrada.titulo });
    await expect(cartaoEncerrada).toBeVisible();

    // Filtro por status (§3.2): Encerradas esconde as Abertas; Todas traz de volta.
    await page.getByRole("button", { name: "Encerradas" }).click();
    await expect(cartaoEncerrada.getByText("🔒 Encerrada")).toBeVisible();
    await expect(cartaoAberta).toBeHidden();

    await page.getByRole("button", { name: "Todas" }).click();
    await expect(cartaoAberta).toBeVisible();
    await expect(cartaoEncerrada).toBeVisible();
  });

  test("deve exibir empty state sem rifas e ocultar rifa arquivada da listagem", async ({
    page,
  }) => {
    // (a) organizador sem nenhuma rifa → empty state prescrito (§3.2).
    await entrar(page, CREDENCIAIS_SEM_RIFAS);

    await expect(page.getByRole("heading", { level: 1, name: "Minhas Rifas" })).toBeVisible();
    await expect(page.getByText("Você ainda não tem rifas. Crie a primeira!")).toBeVisible();
    await expect(page.getByRole("link", { name: "Criar primeira rifa" })).toBeVisible();

    // (b) rifa arquivada existe no banco, mas NUNCA aparece na listagem (RF-03).
    const rifaArquivada = await criarRifaDeTeste({
      titulo: "Rifa encerrada do mes passado",
      arquivada: true,
    });

    await entrar(page, CREDENCIAIS_ORGANIZADOR);
    await expect(page.getByRole("heading", { level: 1, name: "Minhas Rifas" })).toBeVisible();
    await expect(page.getByText(rifaArquivada.titulo)).toBeHidden();

    await page.getByRole("button", { name: "Todas" }).click();
    await expect(page.getByText(rifaArquivada.titulo)).toBeHidden();
  });

  test("deve arquivar pelo menu ⋮ com toast de confirmação e sair da listagem", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({ titulo: "Brevemente arquivada" });

    await entrar(page, CREDENCIAIS_ORGANIZADOR);

    const cartao = page.getByRole("listitem").filter({ hasText: rifa.titulo });
    await expect(cartao).toBeVisible();

    await page.getByRole("button", { name: `Ações da rifa ${rifa.titulo}` }).click();
    await page.getByRole("menuitem", { name: "Arquivar" }).click();

    await expect(page.getByText("Rifa arquivada com sucesso.")).toBeVisible();
    await expect(page.getByText(rifa.titulo)).toBeHidden();
  });
});
