/**
 * FD-13 · Testes E2E da Tela T2 · Criar/Editar (SPEC §3.3/§4.1 · matriz §5.2
 * linha RF-01).
 *
 * Teste 1 (caminho feliz): preencher tudo válido → botão habilitado → cria →
 *   redirect à T3 (/rifas/{id}) com o link público e botão copiar — o
 *   cabeçalho mínimo da T3 (§3.4.1) foi entregue junto com a T2 por decisão
 *   do usuário: sem essa rota o pós-criação prescrito em §4.1 cairia em 404.
 * Teste 2 (falha/borda): campos faltantes/inválidos → botão inativo +
 *   mensagens por campo (Zod em tempo real); em edição, o seletor de
 *   quantidade fica desabilitado quando há vendas (RN-09).
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import {
  criarRifaDeTeste,
  limparRifasDeTeste,
  registrarRifaParaLimpeza,
} from "./provisionar-rifas";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

// ET-7/bootstrap: a base local segue íntegra depois dos E2E — o afterAll
// remove as rifas (inclusive as criadas pela UI, via registrarRifaParaLimpeza;
// o DELETE em cascata leva numeros/compradores/vendas).
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

test.describe("FD-13 · T2 · Criar/Editar rifa", () => {
  test("deve criar rifa válida com botão habilitado e redirecionar ao painel com link público e botão copiar", async ({
    page,
  }) => {
    await entrar(page);
    await page.goto("/rifas/nova");

    await page.getByLabel("Título da rifa").fill("Rifa do forno elétrico");
    await page.getByLabel("Descrição (opcional)").fill("Para a reforma da salinha");
    await page.getByLabel("Descrição do prêmio").fill("Forno elétrico");
    // A máscara progressiva coloca cada dígito como centavo: "850,50" fecha.
    await page.getByLabel("Valor do prêmio (R$)").fill("850,50");
    await page.getByLabel("Valor do número (R$)").fill("10,00");
    await page.getByLabel("Mínimo de números vendidos").fill("30");
    // Quantidade fica no default 100 (decisão 3) e rótulo no default "estimado".

    const botaoCriar = page.getByRole("button", { name: "Criar rifa" });
    await expect(botaoCriar).toBeEnabled();
    await botaoCriar.click();

    // Saída de sucesso do §4.1: redirect ao painel T3 (não à T1).
    await expect(page).toHaveURL(/\/rifas\/[0-9a-f-]{36}$/);

    await expect(
      page.getByRole("heading", { level: 1, name: "Rifa do forno elétrico" }),
    ).toBeVisible();
    // O Intl separa "R$" do valor com espaço inquebrável (\s cobre \u00a0).
    await expect(page.getByText(/valor estimado R\$\s850,50/)).toBeVisible();
    await expect(page.getByText("🟢 Aberta")).toBeVisible();

    // Link público com o botão copiar (§3.4.1); a cópia em si é cenário PB-6.
    await expect(page.getByText(/\/r\/rifa-do-forno-eletrico/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar link público" })).toBeVisible();

    // Data prevista não informada → campo omitido (nunca "undefined", VT-1).
    await expect(page.getByText(/Data prevista/)).toHaveCount(0);

    // A rifa criada pela UI entra na limpeza do afterAll (ET-7).
    registrarRifaParaLimpeza(new URL(page.url()).pathname.split("/")[2] ?? "");
  });

  test("deve manter o botão inativo com campos inválidos, mostrar mensagens por campo e travar a quantidade em edição com vendas", async ({
    page,
  }) => {
    // (a) Criação: botão inicia inativo; mensagem por campo após o blur.
    await entrar(page);
    await page.goto("/rifas/nova");

    const botaoCriar = page.getByRole("button", { name: "Criar rifa" });
    await expect(botaoCriar).toBeDisabled();

    await page.getByLabel("Título da rifa").fill("ab");
    await page.getByLabel("Descrição (opcional)").click(); // blur dispara a validação
    await expect(page.getByText("O título deve ter no mínimo 3 caracteres")).toBeVisible();
    await expect(botaoCriar).toBeDisabled();

    await page.getByLabel("Título da rifa").fill("Rifa válida do teste");
    await page.getByLabel("Descrição do prêmio").fill("Forno elétrico");
    await page.getByLabel("Valor do prêmio (R$)").fill("850,00");
    await page.getByLabel("Valor do número (R$)").fill("10,00");
    await page.getByLabel("Mínimo de números vendidos").fill("200");

    // RN-05: mínima acima da quantidade (default 100) → erro e botão travado.
    await expect(
      page.getByText("A quantidade mínima de vendidos não pode exceder a quantidade de números"),
    ).toBeVisible();
    await expect(botaoCriar).toBeDisabled();

    await page.getByLabel("Mínimo de números vendidos").fill("30");
    await expect(botaoCriar).toBeEnabled();

    // (b) Edição: com venda registrada, a quantidade fica desabilitada (RN-09).
    const rifaComVenda = await criarRifaDeTeste({
      titulo: "Edicao com venda travando quantidade",
      comVenda: true,
    });
    await page.goto(`/rifas/${rifaComVenda.id}/editar`);

    await expect(page.getByRole("heading", { level: 1, name: "Editar rifa" })).toBeVisible();
    await expect(page.getByLabel("Quantidade de números")).toBeDisabled();
    await expect(
      page.getByText("A quantidade não pode ser alterada porque a rifa já tem vendas registradas."),
    ).toBeVisible();

    // Formulário pré-preenchido é válido: o botão de salvar já vem habilitado.
    const botaoSalvar = page.getByRole("button", { name: "Salvar alterações" });
    await expect(botaoSalvar).toBeEnabled();
  });
});
