/**
 * SR-8 · Testes E2E do desfazer sorteio (RF-15/RN-08 · §4.14) — a parte
 * INTEGRADA (transação, re-sorteio, recusas) vive em
 * `tests/integration/sr8-desfazer.test.ts`; aqui a UI e a T5:
 *
 * Teste 1 (confirmação em 2 passos + T5): no cartão "🏆 Resultado do sorteio"
 *   da T3, "Cancelar" mantém o resultado (🎉 permanece); "Anular resultado"
 *   confirma → toast prescrito, cartão sai de cena (RN-08 — não há mais
 *   vigente), badge vira 🔒 Encerrada e a barra de ações da etapa `encerrada`
 *   volta. A T5 passa a "Sorteio ainda não realizado" com a badge prescrita
 *   "Sorteio anulado em DD/MM/AAAA HH:MM" (§3.6 — o wiring do SR-6).
 *
 * Teste 2 (re-sorteio permitido): após anular, "Realizar Sorteio" funciona
 *   de novo (RNF-06 só bloqueia com vigente) e o cartão volta com um novo
 *   resultado — o histórico anulado fica invisível em tela (RF-15).
 *
 * Rifas provisionadas pela via administrativa do stack local (mesmo padrão
 * SR-1..SR-6) e o `afterAll` restaura a base íntegra exigida pelo ET-7.
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import { criarRifaDeTeste, limparRifasDeTeste, sortearNumeroDeTeste } from "./provisionar-rifas";

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

/** Cartão do resultado na T3 (Server Component com aria-label de seção). */
function cartaoResultado(page: Page) {
  return page.getByRole("region", { name: "Resultado do sorteio" });
}

/**
 * Rifa `sorteada` com resultado VIGENTE determinístico: 12 vendidos com
 * venda vigente (compradores alternados Maria/João — o 5º é Maria) e a
 * linha em `sorteios` no formato da RPC (FD-3).
 */
async function provisionarRifaSorteada(titulo: string) {
  const rifa = await criarRifaDeTeste({
    titulo,
    status: "sorteada",
    vendidosComVendas: 12,
  });
  await sortearNumeroDeTeste(rifa.id, 5);
  return rifa;
}

test.describe("SR-8 · T3/T5 · Anular o resultado do sorteio (RF-15)", () => {
  test("deve anular pela T3 com confirmação (cancelar mantém; confirmar devolve 🔒 e revela a badge de anulação na T5)", async ({
    page,
  }) => {
    const rifa = await provisionarRifaSorteada("Desfazer sorteio");

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    // Estado inicial: 🎉 no cabeçalho e cartão do resultado vigente.
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();
    await expect(cartaoResultado(page)).toBeVisible();
    await expect(cartaoResultado(page).getByText("005")).toBeVisible();
    await expect(cartaoResultado(page).getByText("Maria Silva")).toBeVisible();

    // CAMINHO 1 — Cancelar: a confirmação abre e fecha sem mudar nada.
    await cartaoResultado(page).getByRole("button", { name: "Anular resultado" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(confirmacao).toBeVisible();
    await expect(
      confirmacao.getByText(
        "O resultado atual será anulado e a rifa voltará para encerrada. Você poderá sortear novamente — o histórico da anulação fica preservado.",
      ),
    ).toBeVisible();
    await confirmacao.getByRole("button", { name: "Cancelar" }).click();
    await expect(confirmacao).toHaveCount(0);
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();
    await expect(cartaoResultado(page)).toBeVisible();

    // CAMINHO 2 — Confirmar: transação única na RPC `desfazer_sorteio`
    // (migração 006) — anula o vigente e devolve a rifa a `encerrada`.
    await cartaoResultado(page).getByRole("button", { name: "Anular resultado" }).click();
    await confirmacao.getByRole("button", { name: "Anular resultado" }).click();
    await expect(page.getByText("Sorteio anulado com sucesso.")).toBeVisible();

    // O cartão sai de cena (não há mais sorteio VIGENTE, RN-08) e o painel
    // volta ao estado pré-sorteio: badge 🔒 e ações da etapa `encerrada`.
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();
    await expect(page.getByText("🎉 Sorteada")).toHaveCount(0);
    await expect(cartaoResultado(page)).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Realizar Sorteio" })).toBeVisible();

    // §3.6: a T5 pública passa a "Sorteio ainda não realizado" com a badge
    // prescrita de anulação (data/hora formatadas por formatarDataHora).
    await page.goto(`/r/${rifa.slug}/resultado`);
    await expect(page.getByText("Sorteio ainda não realizado")).toBeVisible();
    await expect(
      page.getByText(/Sorteio anulado em \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/u),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar resultado" })).toHaveCount(0);
  });

  test("deve permitir re-sorteio após a anulação: novo resultado vigente no cartão, sem o histórico anulado em tela", async ({
    page,
  }) => {
    const rifa = await provisionarRifaSorteada("Re-sortear apos anular");

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);
    await expect(cartaoResultado(page)).toBeVisible();

    // Anula o resultado vigente (caminho direto da confirmação).
    await cartaoResultado(page).getByRole("button", { name: "Anular resultado" }).click();
    const confirmacao = page.getByRole("dialog");
    await confirmacao.getByRole("button", { name: "Anular resultado" }).click();
    await expect(page.getByText("Sorteio anulado com sucesso.")).toBeVisible();
    await expect(cartaoResultado(page)).toHaveCount(0);

    // RNF-06: sem vigente, o re-sorteio é permitido — a confirmação da SR-2
    // reaparece com a contagem exata de vendidos e o sorteio executa.
    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    const confirmacaoSorteio = page.getByRole("dialog");
    await expect(
      confirmacaoSorteio.getByText("O sorteio será feito entre 12 números vendidos."),
    ).toBeVisible();
    await confirmacaoSorteio.getByRole("button", { name: "Confirmar" }).click();

    // Toast prescrito (gravação não espera a animação, §4.9) + badge 🎉 de
    // volta; a roleta gira sobre o NOVO resultado já gravado no servidor.
    await expect(page.getByText("Sorteio realizado com sucesso.")).toBeVisible();
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();

    const roleta = page.getByRole("dialog");
    await expect(roleta.getByRole("heading", { name: "Resultado do sorteio" })).toBeVisible({
      timeout: 15_000,
    });
    await roleta.getByRole("button", { name: "Voltar ao painel" }).click();

    // O cartão volta com o NOVO resultado vigente — o histórico da anulação
    // fica preservado no banco e invisível em tela (RF-15).
    await expect(cartaoResultado(page)).toBeVisible();
    await expect(page.getByText("Sorteio anulado em")).toHaveCount(0);
  });
});
