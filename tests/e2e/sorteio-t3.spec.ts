/**
 * SR-2 · Confirmação de sorteio na T3 — SPEC §3.4.6 (item 6, etapa
 * encerrada) e §4.9 · matriz §5.2 "RF-09 sorteio (RPC)".
 *
 * Teste 1 (caminho feliz): rifa encerrada com 82 vendidos → botão em destaque
 *   [🎉 Realizar Sorteio] abre a confirmação prescrita "O sorteio será feito
 *   entre 82 números vendidos." e, ao confirmar, o sorteio EXECUTA (SR-3
 *   delega à RPC): toast de sucesso e badge 🎉 Sorteada (a barra de ações
 *   some — etapa sorteada não tem ações do ciclo ainda).
 * Teste 2 (borda/bloqueio): sortear com 0 vendidos → bloqueio com a mensagem
 *   PRESCRITA "A rifa não tem números vendidos; o sorteio não pode ser
 *   realizado." e a rifa permanece encerrada (badge 🔒, F7).
 *
 * Rifas provisionadas pela via administrativa do stack local (mesmo padrão
 * VT-1..VT-9/SR-1) — com `vendidosComVendas`, pois a RPC conta apenas vendas
 * VIGENTES. O `afterAll` restaura a base íntegra exigida pelo ET-7.
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

test.describe("SR-2 · T3 · Confirmação do sorteio (F4)", () => {
  test("deve exibir a contagem exata (82 vendidos) na confirmação e executar o sorteio ao confirmar", async ({
    page,
  }) => {
    // 82 vendidos COM venda vigente (a RPC conta só vendas vigentes) — o
    // mínimo 30 fica muito abaixo e NUNCA avisa nem bloqueia o sorteio (§4.8).
    const rifa = await criarRifaDeTeste({
      titulo: "Sorteio oitenta e dois",
      status: "encerrada",
      vendidosComVendas: 82,
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    await expect(page.getByText("🔒 Encerrada")).toBeVisible();

    // Botão em DESTAQUE (§3.4.6) na etapa encerrada, acima de Reabrir vendas.
    const botaoSortear = page.getByRole("button", { name: "Realizar Sorteio" });
    await expect(botaoSortear).toBeVisible();
    const botaoReabrir = page.getByRole("button", { name: "Reabrir vendas" });
    await expect(botaoReabrir).toBeVisible();
    const caixaSortear = await botaoSortear.boundingBox();
    const caixaReabrir = await botaoReabrir.boundingBox();
    expect(caixaSortear?.y ?? Infinity).toBeLessThan(caixaReabrir?.y ?? -Infinity);

    // Confirmação prescrita (§4.9) com a contagem EXATA.
    await botaoSortear.click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toBeVisible();
    await expect(
      confirmacao.getByText("O sorteio será feito entre 82 números vendidos."),
    ).toBeVisible();

    // Ao confirmar o sorteio EXECUTA (SR-3 → RPC transacional): badge 🎉.
    await confirmacao.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("Sorteio realizado com sucesso.")).toBeVisible();
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();
    await expect(page.getByText("🔒 Encerrada")).toHaveCount(0);

    // A etapa sorteada fica sem barra de ações do ciclo (SR-4/SR-6/SR-8
    // entregam as dela); a confirmação não deve permitir re-sortear.
    await expect(page.getByRole("button", { name: "Realizar Sorteio" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Reabrir vendas" })).toHaveCount(0);
  });

  test("deve bloquear o sorteio com 0 vendidos exibindo a mensagem prescrita e manter a rifa encerrada", async ({
    page,
  }) => {
    // Rifa encerrada SEM nenhuma venda: o bloqueio prescrito da §4.9/F7.
    const rifa = await criarRifaDeTeste({ titulo: "Sorteio sem vendidos", status: "encerrada" });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    await expect(page.getByText("🔒 Encerrada")).toBeVisible();

    // A confirmação aparece mesmo com 0 (contagem literal prescrita); o
    // bloqueio vem do SERVIDOR (nunca confie só na UI — AGENTS §4.3).
    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toBeVisible();
    await expect(
      confirmacao.getByText("O sorteio será feito entre 0 números vendidos."),
    ).toBeVisible();

    await confirmacao.getByRole("button", { name: "Confirmar" }).click();
    await expect(
      page.getByText("A rifa não tem números vendidos; o sorteio não pode ser realizado."),
    ).toBeVisible();

    // A rifa permanece encerrada: badge 🔒 e as ações da etapa intactas.
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();
    await expect(page.getByText("🎉 Sorteada")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Realizar Sorteio" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reabrir vendas" })).toBeVisible();
  });
});
