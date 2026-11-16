/**
 * VT-1 · Testes E2E da Tela T3 · Painel (estrutura) — cabeçalho com banner,
 * título, prêmio com rótulo, valor do número/quantidade/total potencial,
 * badge de status, data prevista e botão "Copiar link público" (SPEC §3.4.1 ·
 * matriz §5.2 linha RF-04).
 *
 * Teste 1 (caminho feliz): abrir T3 de rifa criada → dados do cabeçalho e
 *   link público corretos (data prevista informada aparece formatada).
 * Teste 2 (borda/falha): sem data prevista → campo omitido, nunca
 *   "undefined"; badge e status coerentes com o banco (rifa encerrada →
 *   🔒 Encerrada, jamais 🟢 Aberta).
 *
 * As rifas são provisionadas pela via administrativa do stack local (mesmo
 * padrão do FD-12/FD-13 — a criação pela UI já é cenário do FD-13) e o
 * `afterAll` restaura a base íntegra exigida pelo ET-7.
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

test.describe("VT-1 · T3 · Painel (estrutura)", () => {
  test("deve abrir o painel de rifa criada exibindo dados do cabeçalho e link público corretos", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Painel com data prevista",
      dataPrevista: "2026-12-25",
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    // Cabeçalho (§3.4.1): título, prêmio com rótulo e valores derivados.
    await expect(page.getByRole("heading", { level: 1, name: rifa.titulo })).toBeVisible();
    // O Intl separa "R$" do valor com espaço inquebrável (\s cobre \u00a0).
    await expect(page.getByText(/valor estimado R\$\s850,00/)).toBeVisible();
    await expect(
      page.getByText("Número: R$ 10,00 · Quantidade: 100 · Total potencial: R$ 1.000,00"),
    ).toBeVisible();

    // Data prevista informada → exibida em DD/MM/AAAA (§4.19; sem deslocamento de fuso).
    await expect(page.getByText("Data prevista: 25/12/2026")).toBeVisible();

    // Badge coerente com o status gravado no banco (aberta).
    await expect(page.getByText("🟢 Aberta")).toBeVisible();

    // Link público correto: o endereço exibido termina em /r/{slug} gravado.
    const endereco = page.getByLabel("Endereço público da rifa");
    await expect(endereco).toHaveText(/^https?:\/\//);
    await expect(endereco).toHaveText(new RegExp(`/r/${rifa.slug}$`));

    // Botão "Copiar link público" presente (a cópia em si é cenário PB-6).
    await expect(page.getByRole("button", { name: "Copiar link público" })).toBeVisible();
  });

  test("deve omitir a data prevista não informada (nunca 'undefined') e refletir o status do banco no badge", async ({
    page,
  }) => {
    const rifaEncerrada = await criarRifaDeTeste({
      titulo: "Painel sem data prevista",
      status: "encerrada",
    });

    await entrar(page);
    await page.goto(`/rifas/${rifaEncerrada.id}`);

    await expect(page.getByRole("heading", { level: 1, name: rifaEncerrada.titulo })).toBeVisible();

    // Campo omitido quando não informado (§3.4.1) — e nenhum "undefined"
    // vaza para o texto visível da UI (RF-13 · Cenário B da matriz §5.2).
    // (O payload RSC de dev do Next contém "$undefined" em scripts — fora do
    // escopo, pois nunca é texto visível.)
    await expect(page.getByText(/Data prevista/)).toHaveCount(0);
    await expect(page.getByText("undefined", { exact: false })).toHaveCount(0);

    // Status do banco (encerrada) governa o badge: 🔒 visível, 🟢 ausente.
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();
    await expect(page.getByText("🟢 Aberta")).toHaveCount(0);

    // O painel segue entregando o link público e o botão copiar no mesmo cenário.
    await expect(page.getByText(new RegExp(`/r/${rifaEncerrada.slug}$`))).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar link público" })).toBeVisible();
  });
});

/**
 * VT-2 · Painel de resumo (exclusivo do T3 — SPEC §3.4.2, RF-04): vendidos/
 * total com percentual, disponíveis, arrecadado e potencial, em streaming com
 * skeleton. Os valores saem SEMPRE de `calcularResumo` (lib/resumo.ts) — o
 * cenário de unidade/integração já prova os números; aqui é a entrega na tela.
 */
test.describe("VT-2 · T3 · Painel de resumo", () => {
  test("deve exibir o resumo de rifa com 37 vendidos a R$ 10 como 37%, R$ 370,00 arrecadados e potencial R$ 1.000,00", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Resumo com 37 vendidos",
      vendidos: 37,
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    // O resumo é a única região `region` "Resumo das vendas" da tela — o
    // cabeçalho (VT-1) já mostra "Total potencial", então as asserções
    // financeiras ficam dentro dela.
    const resumo = page.getByRole("region", { name: "Resumo das vendas" });

    await expect(resumo.getByText("37 de 100")).toBeVisible();
    await expect(resumo.getByText("37%", { exact: true })).toBeVisible();
    await expect(resumo.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "37");
    await expect(resumo.getByText("Disponíveis")).toBeVisible();
    await expect(resumo.getByText("63", { exact: true })).toBeVisible();
    await expect(resumo.getByText("Arrecadado")).toBeVisible();
    // O Intl separa "R$" do valor com espaço inquebrável (\s cobre \u00a0).
    await expect(resumo.getByText(/R\$\s370,00/u)).toBeVisible();
    await expect(resumo.getByText("Potencial")).toBeVisible();
    await expect(resumo.getByText(/R\$\s1\.000,00/u)).toBeVisible();
  });

  test("deve exibir o resumo de rifa sem vendas como 0 de 100 (nunca estado de erro)", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({ titulo: "Resumo sem vendas" });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const resumo = page.getByRole("region", { name: "Resumo das vendas" });

    await expect(resumo.getByText("0 de 100")).toBeVisible();
    await expect(resumo.getByText("0%", { exact: true })).toBeVisible();
    await expect(resumo.getByText(/R\$\s0,00/u)).toBeVisible();

    // Zero vendido não é falha de leitura: nenhum alerta de rede na tela.
    // (O Next injeta um route announcer `role=alert` fora do main — o escopo
    // é o conteúdo da própria página.)
    await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  });

  test("não deve entregar o painel (e o resumo) a visitante anônimo (RN-02/decisão 8)", async ({
    browser,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Resumo protegido do anon",
      vendidos: 37,
    });

    // Contexto novo, sem sessão: o proxy (FD-8) e o Server Component guardam a
    // rota — o anon nunca recebe o DOM do resumo.
    const anonima = await browser.newContext();
    const page = await anonima.newPage();
    await page.goto(`/rifas/${rifa.id}`);

    await expect(page).toHaveURL(/\/entrar/);
    await expect(page.getByRole("region", { name: "Resumo das vendas" })).toHaveCount(0);
    await anonima.close();
  });
});
