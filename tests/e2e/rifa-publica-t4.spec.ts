/**
 * PB-1 · Testes E2E da T4 · Rifa pública (`/r/{slug}`) — SPEC §3.5 · matriz
 * §5.2 linha "RF-11 T4 pública".
 *
 * Teste 1 (caminho feliz): abrir `/r/{slug}` SEM login (viewport 360px é a
 *   referência mínima) → banner (título/descrição), prêmio com rótulo,
 *   preço do número, data prevista, progresso "37 de 100 números vendidos"
 *   com a marca VISUAL do mínimo (RN-06) e a grade com os estados — zero
 *   nomes/telefones de compradores no DOM inteiro, inclusive payload RSC
 *   (RNF-05; dados REAIS de comprador existem por trás do RLS neste cenário).
 *
 * Teste 2 (borda/erro): T4 de rifa arquivada/excluída ou slug inexistente →
 *   recusa pt-BR própria (nunca o 404 default em inglês) e ZERO células da
 *   grade no DOM; grade pública nunca mostra nome/telefone (validar DOM).
 *
 * Extra da matriz (§3.5, estado "sorteada"): destaque dourado 🏆 do vencedor
 *   na grade + link "Ver resultado" para a T5 (F6).
 *
 * Rifas provisionadas pela via administrativa do stack local (mesmo padrão
 * VT-1/SR-6) e o `afterAll` restaura a base íntegra exigida pelo ET-7.
 */
import { expect, test, type Page } from "@playwright/test";

import { provisionarOrganizador } from "./provisionar-organizador";
import { criarRifaDeTeste, limparRifasDeTeste, sortearNumeroDeTeste } from "./provisionar-rifas";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

test.afterAll(async () => {
  await limparRifasDeTeste();
});

/**
 * RNF-05 · prova de privacidade: nada de comprador pode estar em NENHUM
 * elemento — inclusive payloads RSC embutidos em <script> (page.content()).
 * O telefone mascarado "(11) 9••••-••44" também é vedado na T4: nem o
 * vencedor é exibido aqui (o resultado é da T5).
 */
async function asseverarCompradorAusente(page: Page): Promise<void> {
  const html = await page.content();
  expect(html).not.toContain("Maria Silva");
  expect(html).not.toContain("João");
  expect(html).not.toContain("+5511");
  expect(html).not.toContain("9••••");
  expect(html).not.toContain("98888");
  expect(html).not.toContain("99999");
}

test.describe("PB-1 · T4 · Rifa pública (§3.5)", () => {
  test("deve abrir a rifa pública sem login em 360px com dados corretos, progresso com marca do mínimo e grade sem dados de comprador", async ({
    page,
  }) => {
    // Dados REAIS de comprador por trás do RLS (padrão FD-2 de bypass): a
    // grade pública deve mostrar apenas estados — nunca o nome/telefone.
    const rifa = await criarRifaDeTeste({
      titulo: "Rifa pública do bazar",
      descricao: "Venda de doces para a festa junina.",
      premioRotulo: "mais_de",
      premioValor: 500,
      dataPrevista: "2026-12-25",
      vendidos: 37,
      vendidosComCompradores: [{ numero: 5, nome: "Maria Silva", telefone: "+5511988887777" }],
    });

    // Visitante sem login: nenhum login é executado — o contexto é anônimo.
    await page.goto(`/r/${rifa.slug}`);

    // Cabeçalho (§3.5): banner título/descrição, prêmio com rótulo e preço.
    await expect(page.getByRole("heading", { level: 1, name: rifa.titulo })).toBeVisible();
    await expect(page.getByText("Venda de doces para a festa junina.")).toBeVisible();
    // O Intl separa "R$" do valor com espaço inquebrável (\s cobre \u00a0).
    await expect(page.getByText(/Mais de R\$\s500,00 — Forno elétrico/u)).toBeVisible();
    await expect(page.getByText(/Número: R\$\s10,00/u)).toBeVisible();

    // Data prevista informada → exibida em DD/MM/AAAA (§4.19).
    await expect(page.getByText("Data prevista: 25/12/2026")).toBeVisible();

    // Badge de status (decisão do usuário, 15/11/2026 — §3.5 não o lista).
    await expect(page.getByText("🟢 Aberta")).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver resultado/ })).toHaveCount(0);

    // Progresso (§3.5): frase prescrita + marca VISUAL do mínimo (RN-06 ·
    // decisão 10 — qtd_minima 30 do provisionamento).
    await expect(page.getByText("37 de 100 números vendidos")).toBeVisible();
    await expect(page.getByText("Mínimo: 30")).toBeVisible();
    const progresso = page.getByRole("progressbar");
    await expect(progresso).toHaveAttribute("aria-valuenow", "37");
    await expect(progresso).toHaveAttribute(
      "aria-label",
      "Progresso de vendas: 37 de 100 números vendidos (mínimo 30)",
    );

    // Grade (§3.5): 100 pastilhas com os estados — vendida marcada, disponível
    // presente; sem navegação de blocos nesta rifa de 100.
    await expect(page.getByLabel("Número 001, vendido")).toBeVisible();
    await expect(page.getByLabel("Número 005, vendido")).toBeVisible();
    await expect(page.getByLabel("Número 038, disponível")).toBeVisible();
    await expect(page.getByLabel("Número 100, disponível")).toBeVisible();
    await expect(page.getByLabel(/^Número \d{3},/)).toHaveCount(100);

    // PB-1 ainda não entrega interação (o modal público é a PB-2): nenhuma
    // pastilha é botão — o toque chega com o modal enxuto.
    await expect(page.getByRole("button", { name: /^Número \d{3},/ })).toHaveCount(0);

    // Privacidade (RNF-05): zero nomes/telefones no DOM inteiro.
    await asseverarCompradorAusente(page);
  });

  test("não deve exibir rifa arquivada, excluída ou de slug inexistente (e nenhuma célula da grade no DOM)", async ({
    page,
  }) => {
    const RECUSA = "Não encontramos essa rifa. Confira o link com quem a criou.";

    // Arquivada: some da publicação do anon (RLS `rifas_publico_le_publicadas`).
    const arquivada = await criarRifaDeTeste({
      titulo: "T4 de rifa arquivada",
      arquivada: true,
      vendidos: 5,
    });
    await page.goto(`/r/${arquivada.slug}`);
    await expect(page.getByText(RECUSA)).toBeVisible();
    await expect(page.getByLabel(/^Número \d{3},/)).toHaveCount(0);

    // Excluída: soft delete (§2.4) também sai da publicação do anon.
    const excluida = await criarRifaDeTeste({ titulo: "T4 de rifa excluída", excluida: true });
    await page.goto(`/r/${excluida.slug}`);
    await expect(page.getByText(RECUSA)).toBeVisible();
    await expect(page.getByLabel(/^Número \d{3},/)).toHaveCount(0);

    // Slug inexistente: mesma recusa pt-BR — nunca o 404 default em inglês.
    await page.goto("/r/esse-slug-nao-existe");
    await expect(page.getByText(RECUSA)).toBeVisible();
    await expect(page.getByText("This page could not be found")).toHaveCount(0);

    // Nenhum nome/telefone vaza nem na recusa (dados da arquivada existem).
    await asseverarCompradorAusente(page);
  });

  test("deve destacar o vencedor em dourado 🏆 e oferecer 'Ver resultado' quando a rifa está sorteada (estado da §3.5)", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "T4 da rifa sorteada",
      status: "sorteada",
      vendidosComCompradores: [
        { numero: 47, nome: "Maria Silva", telefone: "+5511988884444" },
        { numero: 1, nome: "João Souza", telefone: "+5511999998888" },
      ],
    });
    // Sorteio determinístico (o real é aleatório — RNF-07): vencedor é o 047.
    await sortearNumeroDeTeste(rifa.id, 47);

    await page.goto(`/r/${rifa.slug}`);

    // Badge coerente com o banco + link prescrito do estado "sorteada" (§3.5).
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();
    await expect(page.getByRole("link", { name: /Ver resultado/ })).toHaveAttribute(
      "href",
      `/r/${rifa.slug}/resultado`,
    );

    // Destaque do vencedor na grade (§2.7: estado de EXIBIÇÃO sobre a tabela):
    // a pastilha 047 é sorteada; a 001 segue vendida comum.
    await expect(page.getByLabel("Número 047, sorteado")).toBeVisible();
    await expect(page.getByLabel("Número 001, vendido")).toBeVisible();

    // O nome do vencedor também é dado de comprador: T4 mostra só a pastilha.
    await asseverarCompradorAusente(page);
  });
});
