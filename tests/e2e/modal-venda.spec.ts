/**
 * VT-4 · Testes E2E do Modal T3a (organizador) — SPEC §3.4.5 · matriz §5.2
 * RF-05 (linha organizador).
 *
 * Teste 1 (caminho feliz): registrar "Maria Silva / (11) 98888-7777" no nº
 *   037 → modal fecha, pastilha fica verde ✓ e o resumo sobe para 38/100.
 * Teste 2 (borda/erro): salvar sem preencher campos → validação inline
 *   pt-BR e nada gravado; remover venda → confirmação → pastilha volta a
 *   disponível e o resumo cai.
 *
 * As rifas são provisionadas pela via administrativa do stack local (padrão
 * FD-12/VT-1) com números vendidos COM venda vigente e comprador (opção
 * `numerosVendidos`) — o prefill do modal precisa dos dados de comprador.
 * O `afterAll` restaura a base íntegra exigida pelo ET-7.
 *
 * O bloco final cobre o extra E2E da VT-6 (concorrência no mesmo número,
 * RN-03): consultor vende o nº 1s antes → recusa prescrita com rollback da
 * pastilha otimista e toast (o Teste 2 do VT-6, unit, está em
 * tests/unit/ui/grade-com-modal.test.tsx).
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import { criarRifaDeTeste, limparRifasDeTeste, venderNumeroDeTeste } from "./provisionar-rifas";

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

/**
 * 37 números vendidos (1..36 e 38 — cada um com venda vigente), deixando o
 * nº 037 DISPONÍVEL: o resumo começa em "37 de 100" e registrar o 037 o leva
 * a "38 de 100" (cenário prescrito do Teste 1).
 */
const TRINTA_E_SETE_SEM_037 = [...Array.from({ length: 36 }, (_, indice) => indice + 1), 38];

test.describe("VT-4 · T3a · Registrar venda", () => {
  test("deve registrar Maria Silva no nº 037 fechando o modal, pintando a pastilha de verde e levando o resumo a 38/100", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Modal registra o 037",
      numerosVendidos: TRINTA_E_SETE_SEM_037,
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    // Estado inicial: resumo em 37 de 100 e o 037 disponível na grade.
    const resumo = page.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumo.getByText("37 de 100")).toBeVisible();
    const pastilha037 = page.getByRole("button", { name: "Número 037, disponível" });
    await expect(pastilha037).toBeVisible();

    // Modal T3a abre com o número no título (§3.4.5).
    await pastilha037.click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();
    await expect(modal.getByRole("heading", { name: "Número 037" })).toBeVisible();

    // Nome + telefone obrigatórios com máscara (§4.19).
    await modal.getByLabel("Nome").fill("Maria Silva");
    await modal.getByLabel("Telefone").fill("(11) 98888-7777");
    await expect(modal.getByLabel("Telefone")).toHaveValue("(11) 98888-7777");
    await modal.getByRole("button", { name: "Salvar" }).click();

    // Modal fecha com Toast de sucesso (feedback da ação assíncrona).
    await expect(modal).toHaveCount(0);
    await expect(page.getByText("Venda registrada com sucesso.")).toBeVisible();

    // Pastilha vira verde com ✓ (estado vendido da grade) — VT-3.
    const pastilhaVendida = page.getByRole("button", { name: "Número 037, vendido" });
    await expect(pastilhaVendida).toBeVisible();
    await expect(pastilhaVendida).toHaveClass(/bg-verde-venda-suave/);
    await expect(pastilhaVendida.getByText("✓")).toBeVisible();

    // Resumo sobe para 38/100 (RF-04: recálculo server-side após revalidação).
    await expect(resumo.getByText("38 de 100")).toBeVisible();
  });
});

test.describe("VT-4 · T3a · Validação e remoção", () => {
  test("deve exibir validação inline ao salvar sem preencher campos e não alterar o banco", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Modal valida campos",
      numerosVendidos: [1, 2, 3],
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const resumo = page.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumo.getByText("3 de 100")).toBeVisible();

    await page.getByRole("button", { name: "Número 038, disponível" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Sem preencher nada: validação inline em pt-BR, modal segue aberto.
    await modal.getByRole("button", { name: "Salvar" }).click();
    await expect(modal.getByText("O nome deve ter no mínimo 2 caracteres")).toBeVisible();
    await expect(modal.getByText("Informe o telefone do comprador")).toBeVisible();
    await expect(modal).toBeVisible();

    // Nada gravado: o resumo permanece em 3 de 100 (estado inalterado).
    await expect(resumo.getByText("3 de 100")).toBeVisible();
  });

  test("deve remover venda com confirmação devolvendo a pastilha a disponível e o resumo a 2/100", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Modal remove a venda",
      numerosVendidos: [1, 2, 37],
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const resumo = page.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumo.getByText("3 de 100")).toBeVisible();

    // Pastilha vendida abre o modal com os dados preenchidos (§3.4.5).
    await page.getByRole("button", { name: "Número 001, vendido" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("heading", { name: "Número 001" })).toBeVisible();
    await expect(modal.getByLabel("Nome")).toHaveValue("Maria Silva");
    await expect(modal.getByLabel("Telefone")).toHaveValue("(11) 98888-7777");

    // Remoção pede confirmação (RN: remover só com confirmação).
    await modal.getByRole("button", { name: "Remover venda" }).click();
    await expect(
      modal.getByText(
        "Remover esta venda? O comprador sai do número, mas o histórico fica preservado.",
      ),
    ).toBeVisible();
    await modal.getByRole("button", { name: "Confirmar remoção" }).click();

    // Modal fecha, pastilha volta a disponível e o resumo cai para 2 de 100.
    await expect(modal).toHaveCount(0);
    await expect(page.getByText("Venda removida com sucesso.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 001, disponível" })).toBeVisible();
    await expect(resumo.getByText("2 de 100")).toBeVisible();
  });
});

test.describe("VT-6 · Concorrência no mesmo número (RN-03)", () => {
  /**
   * Extra E2E do VT-6 (o Teste 2 unit está em grade-com-modal.test.tsx): o
   * consultor vende o 037 DEPOIS de a tela do organizador ter carregado e
   * ANTES do Salvar ("1s antes"). O servidor recusa com o toast prescrito e a
   * pastilha otimista faz rollback. O estado "vendido" do consultor na grade
   * chega ao vivo pela VT-9 (realtime) — aqui a tela segue nos dados do
   * servidor do momento do carregamento.
   */
  test("deve recusar venda em número vendido 1s antes por outro consultor com rollback da pastilha e toast prescrito", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Modal recusa a corrida",
      numerosVendidos: [1, 2, 3],
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const resumo = page.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumo.getByText("3 de 100")).toBeVisible();

    // O organizador abre o 037 como DISPONÍVEL (dados do carregamento)…
    await page.getByRole("button", { name: "Número 037, disponível" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("heading", { name: "Número 037" })).toBeVisible();
    await modal.getByLabel("Nome").fill("João Pereira");
    await modal.getByLabel("Telefone").fill("(11) 97777-6666");

    // …e, 1s antes do Salvar, o consultor vende o 037 (via administrativa,
    // origem 'publico' — exatamente o que a T4/PB-2 grava).
    await venderNumeroDeTeste(rifa.id, 37, {
      nome: "Ana Ribeiro",
      telefone: "+5511966665555",
      origem: "publico",
    });

    await modal.getByRole("button", { name: "Salvar" }).click();

    // Recusa prescrita (§4.5): toast de erro + alerta inline, modal aberto.
    await expect(page.getByRole("status")).toContainText("Esse número acabou de ser vendido");
    await expect(modal.getByRole("alert")).toContainText("Esse número acabou de ser vendido");

    // Rollback: a pastilha volta a disponível (estado do servidor do
    // carregamento) e o resumo permanece inalterado — nada foi gravado 2×.
    await expect(page.getByRole("button", { name: "Número 037, disponível" })).toBeVisible();
    await expect(resumo.getByText("3 de 100")).toBeVisible();
  });
});
