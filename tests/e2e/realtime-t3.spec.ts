/**
 * VT-9 · Teste 1 (E2E) — tempo real na T3 (SPEC §4.16 RF-18 · matriz §5.2
 * RF-18): "venda na T4 reflete pastilha/progresso na T3 aberta sem refresh".
 *
 * A T4 (PB-1/Fase 4) ainda não existe — precedente da VT-6: o consultor é
 * simulado pela via administrativa do stack local (`venderNumeroDeTeste` com
 * `origem: "publico"`, exatamente o que a T4/PB-2 gravará). A troca ao vivo
 * entre telas é REAL: dois CONTEXTOS de browser com a T3 aberta, canal
 * `POSTGRES_CHANGES` em `numeros` (migração 005) entregando ao anon (FD-8).
 *
 * Cenários:
 *   1. ida — consultor vende o nº 037 "de fora" → o contexto A vê a pastilha
 *      verde e o resumo subir SEM F5; com o modal aberto no número, o alerta
 *      prescrito "Esse número acabou de ser vendido" chega na hora;
 *   2. volta — o organizador vende o nº 050 PELA T3 no contexto A → o
 *      contexto B (segunda tela da mesma rifa) reflete sem refresh.
 *
 * O Teste 2 (payload anon — só `numeros`) está em
 * tests/integration/vt9-realtime.test.ts.
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

test.describe("VT-9 · T3 responde ao vivo (RF-18)", () => {
  test("deve refletir a venda do consultor na T3 aberta sem refresh: pastilha, resumo e alerta no modal", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Realtime reflete o consultor",
      numerosVendidos: [1, 2, 3],
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const resumo = page.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumo.getByText("3 de 100")).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 037, disponível" })).toBeVisible();

    // Modal aberto no nº 037: o organizador já escolheu o número quando o
    // consultor o vende "de fora" (corrida ao vivo — §4.16).
    await page.getByRole("button", { name: "Número 037, disponível" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("heading", { name: "Número 037" })).toBeVisible();

    // O consultor (T4 futura; via administrativa com origem 'publico') vende
    // o 037 DEPOIS de a tela e o modal já estarem abertos.
    await venderNumeroDeTeste(rifa.id, 37, {
      nome: "Ana Ribeiro",
      telefone: "+5511966665555",
      origem: "publico",
    });

    // Sem NENHUM F5: o canal entrega o evento — o modal avisa na hora com o
    // texto prescrito (§4.5, o mesmo do Salvar recusado na VT-6)…
    await expect(modal.getByRole("alert")).toContainText("Esse número acabou de ser vendido");
    await expect(page.getByRole("status")).toContainText("Esse número acabou de ser vendido");

    // …a pastilha antecipa o estado ao vivo…
    await expect(page.getByRole("button", { name: "Número 037, vendido" })).toBeVisible();
    // …e o resumo sobe para 4 de 100 pelo `router.refresh()` (Server
    // Components re-renderizam no servidor — RF-18 cobre progresso/resumo).
    await expect(resumo.getByText("4 de 100")).toBeVisible();
  });

  test("deve refletir a venda feita pela T3 em outra tela aberta da mesma rifa (vice-versa)", async ({
    page,
    browser,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Realtime vice-versa",
      numerosVendidos: [1, 2],
    });

    // Contexto A: quem vende pela T3.
    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);
    const resumoA = page.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumoA.getByText("2 de 100")).toBeVisible();

    // Contexto B: segunda tela (a "do consultor") na mesma rifa, aberta ANTES
    // da venda — o canal Realtime dela já está ativo.
    const contextoB = await browser.newContext();
    const paginaB = await contextoB.newPage();
    await entrar(paginaB);
    await paginaB.goto(`/rifas/${rifa.id}`);
    const resumoB = paginaB.getByRole("region", { name: "Resumo das vendas" });
    await expect(resumoB.getByText("2 de 100")).toBeVisible();

    // A vende o 050 PELA T3 (Server Action real, fluxo completo do modal).
    await page.getByRole("button", { name: "Número 050, disponível" }).click();
    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nome").fill("Maria Silva");
    await modal.getByLabel("Telefone").fill("(11) 98888-7777");
    await modal.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByText("Venda registrada com sucesso.")).toBeVisible();
    await expect(resumoA.getByText("3 de 100")).toBeVisible();

    // B recebe ao vivo, sem F5: pastilha e resumo refletem a venda de A.
    await expect(paginaB.getByRole("button", { name: "Número 050, vendido" })).toBeVisible();
    await expect(resumoB.getByText("3 de 100")).toBeVisible();

    await contextoB.close();
  });
});
