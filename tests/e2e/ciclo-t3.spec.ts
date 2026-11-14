/**
 * SR-1 · Testes E2E do ciclo da rifa na T3 — `encerrarVendas` / `reabrirVendas`
 * (SPEC §4.8/§3.4.6 · matriz §5.2 RF-08).
 *
 * Teste 1 (caminho feliz): encerrar rifa aberta (acima do mínimo) → badge 🔒
 *   e nova venda RECUSADA pela UI; reabrir → badge 🟢 e a venda volta a
 *   funcionar (VT-5 recusa "As vendas desta rifa estão encerradas." no meio).
 * Teste 2 (borda/aviso de mínimo): rifa com 12 vendidos e mínimo 30 → aviso
 *   prescrito "12 vendidos — abaixo do mínimo 30. Encerrar mesmo assim?" com
 *   os 2 caminhos (Cancelar mantém aberta; Encerrar mesmo assim fecha).
 *   A recusa de `reabrirVendas` em rifa `sorteada` (transição inválida) é
 *   cobertura INTEGRADA — `tests/integration/sr1-ciclo.test.ts` (a UI nem
 *   oferece o botão nessa etapa).
 *
 * Rifas provisionadas pela via administrativa do stack local (mesmo padrão
 * VT-1..VT-9) e o `afterAll` restaura a base íntegra exigida pelo ET-7.
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

/** Fluxo de login do organizador (sessão no contexto do teste). */
async function entrar(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/);
}

test.describe("SR-1 · T3 · Encerrar e reabrir vendas (F4)", () => {
  test("deve encerrar as vendas com badge 🔒 e recusar nova venda, e reabrir com badge 🟢 e a venda voltando a funcionar", async ({
    page,
  }) => {
    // 37 vendidos ≥ mínimo 30: encerramento pelo caminho normal (confirmação
    // simples, sem o aviso de mínimo).
    const rifa = await criarRifaDeTeste({ titulo: "Ciclo encerrar reabrir", vendidos: 37 });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    await expect(page.getByText("🟢 Aberta")).toBeVisible();

    // Encerrar com confirmação (§3.4.6): modal de confirmação do ciclo.
    await page.getByRole("button", { name: "Encerrar vendas" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toBeVisible();
    await expect(
      confirmacao.getByText(
        "As vendas serão encerradas e o link público deixará de aceitar novas compras.",
      ),
    ).toBeVisible();
    await confirmacao.getByRole("button", { name: "Confirmar" }).click();

    // Badge do cabeçalho re-renderiza no servidor (router.refresh()).
    await expect(page.getByText("Vendas encerradas com sucesso.")).toBeVisible();
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();
    await expect(page.getByText("🟢 Aberta")).toHaveCount(0);

    // Nova venda RECUSADA (§4.5 — rifa encerrada): modal T3a abre, o servidor
    // recusa e o erro prescrito aparece com o modal aberto (nunca engolida).
    const pastilhaDisponivel = page.getByRole("button", { name: "Número 038, disponível" });
    await pastilhaDisponivel.click();
    const modalVenda = page.getByRole("dialog");
    await expect(modalVenda).toBeVisible();
    await modalVenda.getByLabel("Nome").fill("Maria Silva");
    await modalVenda.getByLabel("Telefone").fill("(11) 98888-7777");
    await modalVenda.getByRole("button", { name: "Salvar" }).click();
    await expect(modalVenda.getByText("As vendas desta rifa estão encerradas.")).toBeVisible();
    await modalVenda.getByRole("button", { name: "Fechar" }).click();

    // Reabrir volta a 🟢 (§2.7 — reversão encerrada → aberta).
    await page.getByRole("button", { name: "Reabrir vendas" }).click();
    await expect(page.getByText("Vendas reabertas com sucesso.")).toBeVisible();
    await expect(page.getByText("🟢 Aberta")).toBeVisible();
    await expect(page.getByText("🔒 Encerrada")).toHaveCount(0);

    // E a venda volta a funcionar (F2 de pé de novo no número 038).
    await pastilhaDisponivel.click();
    await expect(modalVenda).toBeVisible();
    await modalVenda.getByLabel("Nome").fill("Maria Silva");
    await modalVenda.getByLabel("Telefone").fill("(11) 98888-7777");
    await modalVenda.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Venda registrada com sucesso.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 038, vendido" })).toBeVisible();
  });

  test("deve avisar '12 vendidos — abaixo do mínimo 30. Encerrar mesmo assim?' com os 2 caminhos (cancelar mantém aberta; confirmar encerra)", async ({
    page,
  }) => {
    // 12 vendidos < mínimo 30: aviso prescrito da §4.8/RN-06 (decisão 10).
    const rifa = await criarRifaDeTeste({ titulo: "Ciclo abaixo do minimo", vendidos: 12 });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    await expect(page.getByText("🟢 Aberta")).toBeVisible();

    // CAMINHO 1 — Cancelar: o aviso aparece e a rifa permanece aberta.
    await page.getByRole("button", { name: "Encerrar vendas" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toBeVisible();
    await expect(
      confirmacao.getByText("12 vendidos — abaixo do mínimo 30. Encerrar mesmo assim?"),
    ).toBeVisible();
    await confirmacao.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirmacao).toHaveCount(0);
    await expect(page.getByText("🟢 Aberta")).toBeVisible();
    await expect(page.getByText("🔒 Encerrada")).toHaveCount(0);

    // CAMINHO 2 — Encerrar mesmo assim: o mínimo é aviso, não bloqueio.
    await page.getByRole("button", { name: "Encerrar vendas" }).click();
    await expect(
      confirmacao.getByText("12 vendidos — abaixo do mínimo 30. Encerrar mesmo assim?"),
    ).toBeVisible();
    await confirmacao.getByRole("button", { name: "Encerrar mesmo assim" }).click();
    await expect(page.getByText("Vendas encerradas com sucesso.")).toBeVisible();
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();
    await expect(page.getByText("🟢 Aberta")).toHaveCount(0);
  });
});
