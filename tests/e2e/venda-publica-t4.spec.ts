/**
 * PB-2 · Testes E2E do modal público enxuto da T4 — SPEC §3.5 (variante da
 * §3.4.5) · matriz §5.2 RF-05a.
 *
 * Teste 1 (caminho feliz): visitante SEM login registra comprador em número
 *   disponível pela T4 → pastilha fica "vendido" na hora (otimismo) e o
 *   resumo da T3 do organizador (outro contexto, aberto ANTES da venda)
 *   sobe via Realtime sem F5 (RF-18); o banco confirma venda VIGENTE com
 *   `origem='publico'` e a T4 continua SEM dados de comprador no DOM.
 *
 * Teste 2 (borda/erro): na T4 não existe editar/transferir/remover — tocar
 *   número vendido mostra "Número já vendido." e NÃO abre formulário;
 *   rifa encerrada → toque em disponível avisa "As vendas desta rifa estão
 *   encerradas." e também não abre formulário.
 *
 * Rifas provisionadas pela via administrativa do stack local (mesmo padrão
 * VT-9/SR-6) e o `afterAll` restaura a base íntegra exigida pelo ET-7.
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import {
  criarRifaDeTeste,
  lerVendaVigenteDeTeste,
  limparRifasDeTeste,
} from "./provisionar-rifas";

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

test.describe("PB-2 · Modal público enxuto da T4 (§3.5 · RF-05a)", () => {
  test("deve registrar comprador em número disponível sem login: pastilha vendida, resumo da T3 ao vivo e venda 'publico' no banco", async ({
    page,
    browser,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Venda pública pela T4",
      descricao: "Garanta o seu número pelo link.",
      numerosVendidos: [1, 2, 3],
    });

    // Contexto A: T3 do organizador ABERTA ANTES da venda — o canal Realtime
    // dela já está ativo quando o visitante vende (prova de RF-18, não de
    // render inicial).
    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);
    const resumo = page.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumo.getByText("3 de 100")).toBeVisible();

    // Contexto B: visitante anônimo (NENHUM login) na T4 do mesmo link.
    const contextoVisitante = await browser.newContext();
    const paginaVisitante = await contextoVisitante.newPage();
    await paginaVisitante.goto(`/r/${rifa.slug}`);

    await expect(
      paginaVisitante.getByRole("button", { name: "Número 037, disponível" }),
    ).toBeVisible();
    await paginaVisitante.getByRole("button", { name: "Número 037, disponível" }).click();

    const modal = paginaVisitante.getByRole("dialog");
    await expect(modal.getByRole("heading", { name: "Número 037" })).toBeVisible();
    await modal.getByLabel("Nome").fill("Maria Silva");
    await modal.getByLabel("Telefone").fill("(11) 98888-7777");
    await modal.getByRole("button", { name: "Salvar" }).click();

    // Sucesso na T4: modal fecha, toast prescrito e pastilha verde ✓ (a
    // venda própria chega pelo otimismo/refresh — F2 "só a grade").
    await expect(modal).toHaveCount(0);
    await expect(paginaVisitante.getByText("Venda registrada com sucesso.")).toBeVisible();
    await expect(
      paginaVisitante.getByRole("button", { name: "Número 037, vendido" }),
    ).toBeVisible();

    // Privacidade (RNF-05): o nome/telefone registrado nunca volta à T4 —
    // nem no DOM visível nem no payload RSC (page.content()).
    const htmlPublico = await paginaVisitante.content();
    expect(htmlPublico).not.toContain("Maria Silva");
    expect(htmlPublico).not.toContain("98888");
    expect(htmlPublico).not.toContain("+5511");

    // Contexto A (T3) recebe ao vivo, sem F5: pastilha e resumo refletem a
    // venda feita pelo visitante (RF-18 — POSTGRES_CHANGES em numeros).
    await expect(page.getByRole("button", { name: "Número 037, vendido" })).toBeVisible();
    await expect(resumo.getByText("4 de 100")).toBeVisible();

    // Banco: EXATAMENTE o fluxo prescrito — venda vigente com origem
    // 'publico' (ficada no servidor) e comprador correto.
    const venda = await lerVendaVigenteDeTeste(rifa.id, 37);
    expect(venda).toEqual({ origem: "publico", nome: "Maria Silva" });

    await contextoVisitante.close();
  });

  test("não deve editar/transferir/remover na T4: tocar número vendido mostra 'Número já vendido.' sem abrir formulário", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "T4 sem edição de vendas",
      numerosVendidos: [1, 2, 3],
    });

    await page.goto(`/r/${rifa.slug}`);

    // Toque em número vendido: mensagem prescrita da §3.5 e NENHUM modal.
    await page.getByRole("button", { name: "Número 001, vendido" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Número já vendido.")).toBeVisible();
    await expect(page.getByLabel("Nome")).toHaveCount(0);
    await expect(page.getByLabel("Telefone")).toHaveCount(0);

    // Sem edição/transferência/remoção em NENHUMA pastilha: os botões
    // prescritos ao organizador nunca existem na T4 (RN-03).
    await expect(page.getByRole("button", { name: "Remover venda" })).toHaveCount(0);

    // Rifa encerrada: o toque em disponível também não abre formulário —
    // recusa prescrita com o mesmo texto da Server Action (§4.5).
    const encerrada = await criarRifaDeTeste({
      titulo: "T4 de rifa encerrada",
      status: "encerrada",
      vendidos: 5,
    });
    await page.goto(`/r/${encerrada.slug}`);
    await page.getByRole("button", { name: "Número 038, disponível" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("As vendas desta rifa estão encerradas.")).toBeVisible();
    await expect(page.getByLabel("Nome")).toHaveCount(0);
    await expect(page.getByLabel("Telefone")).toHaveCount(0);
  });
});
