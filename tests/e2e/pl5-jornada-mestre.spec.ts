/**
 * PL-5 · Jornada-mestre e exceções críticas.
 *
 * Critério de aceite: SPEC §3.7, §5.2 e PLAN PL-5. O cenário principal usa
 * a interface real; os cenários de exceção preservam a mesma fronteira
 * pública/organizador dos fluxos de produção.
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import {
  criarRifaDeTeste,
  limparRifasDeTeste,
  registrarRifaParaLimpeza,
} from "./provisionar-rifas";

async function entrar(page: Page): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

test.beforeAll(async () => {
  await provisionarOrganizador();
});

test.afterAll(async () => {
  await limparRifasDeTeste();
});

test.describe("PL-5 · jornada-mestre", () => {
  test("deve criar, vender, encerrar, sortear, desfazer, re-sortear e consultar a T5", async ({
    page,
  }) => {
    await entrar(page);

    await page.getByRole("link", { name: /Nova Rifa/u }).click();
    await page.getByLabel("Título da rifa").fill("Jornada mestre PL5");
    await page.getByLabel("Descrição do prêmio").fill("Prêmio da jornada");
    await page.getByLabel("Valor do prêmio (R$)").fill("850,00");
    await page.getByLabel("Valor do número (R$)").fill("10,00");
    await page.getByLabel("Mínimo de números vendidos").fill("1");
    await page.getByRole("button", { name: "Criar rifa" }).click();

    await expect(page).toHaveURL(/\/rifas\/[0-9a-f-]{36}$/u);
    const rifaId = new URL(page.url()).pathname.split("/").at(-1);
    if (!rifaId) throw new Error("A criação não devolveu o identificador da rifa.");
    registrarRifaParaLimpeza(rifaId);

    const urlPublica = await page.getByLabel("Endereço público da rifa").innerText();
    const slug = new URL(urlPublica).pathname.split("/").at(-1);
    if (!slug) throw new Error("A criação não devolveu o slug público.");

    // T3 → T4: a venda é feita anonimamente pelo link compartilhado.
    await page.goto(urlPublica);
    await page.getByRole("button", { name: "Número 037, disponível" }).click();
    const modalPublico = page.getByRole("dialog");
    await modalPublico.getByLabel("Nome").fill("Maria PL5");
    await modalPublico.getByLabel("Telefone").fill("(11) 98888-7777");
    await modalPublico.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("button", { name: "Número 037, vendido" })).toBeVisible();

    // T4 → T3: encerrar e realizar o primeiro sorteio.
    await page.goto(`/rifas/${rifaId}`);
    await expect(page.getByText("1 de 100")).toBeVisible();
    await page.getByRole("button", { name: "Encerrar vendas" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();

    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "O sorteio será feito entre 1 números vendidos.",
    );
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();

    // A T5 é uma rota pública própria e deve refletir o vencedor gravado.
    await page.goto(`/r/${slug}/resultado`);
    await expect(page.getByRole("heading", { name: /Número sorteado:/u })).toBeVisible();
    await expect(page.getByText("Maria PL5")).toBeVisible();
    await expect(page.getByText(/\(11\) 9••••-••77/u)).toBeVisible();

    // T3: anular o resultado e sortear novamente.
    await page.goto(`/rifas/${rifaId}`);
    await page.getByRole("button", { name: "Anular resultado" }).click();
    const modalAnulacao = page.getByRole("dialog");
    await modalAnulacao.getByRole("button", { name: "Anular resultado" }).click();
    await expect(page.getByText("Sorteio anulado com sucesso.")).toBeVisible();
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();

    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();

    await page.goto(`/r/${slug}/resultado`);
    await expect(page.getByRole("heading", { name: /Número sorteado:/u })).toBeVisible();
  });

  test("deve bloquear sorteio vazio, negar exclusão com vendas e bloquear venda offline", async ({
    page,
    context,
  }) => {
    const semVendas = await criarRifaDeTeste({
      titulo: "PL5 sorteio vazio",
      status: "encerrada",
    });
    const comVenda = await criarRifaDeTeste({
      titulo: "PL5 exclusão protegida",
      comVenda: true,
    });

    await entrar(page);
    await page.goto(`/rifas/${semVendas.id}`);
    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    await expect(
      page.getByText("A rifa não tem números vendidos; o sorteio não pode ser realizado."),
    ).toBeVisible();
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();

    // A exclusão é recusada pelo servidor; o texto prescrito oferece arquivar.
    await page.goto("/");
    const menu = page.getByRole("menu", { name: new RegExp(comVenda.titulo, "u") });
    await page.getByRole("button", { name: `Ações da rifa ${comVenda.titulo}` }).click();
    await menu.getByRole("menuitem", { name: "Excluir" }).click();
    await expect(page.getByText("Esta rifa tem compras registradas. Você pode arquivá-la")).toBeVisible();

    if (!(await menu.isVisible())) {
      await page.getByRole("button", { name: `Ações da rifa ${comVenda.titulo}` }).click();
    }
    await expect(menu).toBeVisible();
    await menu.getByRole("menuitem", { name: "Arquivar" }).click();
    await expect(page.getByText("Rifa arquivada com sucesso.")).toBeVisible();

    // A gravação pública permanece bloqueada enquanto o navegador está offline.
    const vendaOffline = await criarRifaDeTeste({ titulo: "PL5 venda offline" });
    await page.goto(`/r/${vendaOffline.slug}`);
    await page.getByRole("button", { name: "Número 037, disponível" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nome").fill("Maria offline");
    await modal.getByLabel("Telefone").fill("(11) 98888-7777");
    await context.setOffline(true);
    await expect(modal.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await expect(modal.getByRole("alert")).toContainText("Sem conexão");
    await context.setOffline(false);
    await modal.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Venda registrada com sucesso.")).toBeVisible();
  });
});
