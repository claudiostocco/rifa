/**
 * SR-5 · Roleta do sorteio na T3 (RF-09a) — SPEC §4.9/§2.2 · matriz §5.2
 * "RF-09a roleta" (Cenário A, conforme decisão do usuário de 14/11/2026: a
 * verificação do vencedor na T5 pertence à SR-6, tela ainda inexistente).
 *
 * Teste 1 (caminho feliz): confirmado o sorteio, a roleta aparece girando
 *   pelos primeiros nomes dos vendidos e desacelera no resultado JÁ gravado
 *   pelo servidor — cruzado com o banco via via administrativa do stack
 *   local (lerSorteioVigente); resultado único no banco (RNF-06); ao fechar,
 *   o painel revela badge 🎉 e a pastilha do vencedor dourada 🏆 com o
 *   MESMO número (wiring da prop `numeroSorteado` da VT-3).
 *
 * Rifas provisionadas pela via administrativa do stack local (mesmo padrão
 * SR-1..SR-4) — com `vendidosComVendas`, pois a RPC conta apenas vendas
 * VIGENTES. O `afterAll` restaura a base íntegra exigida pelo ET-7.
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import {
  contarSorteiosVigentes,
  criarRifaDeTeste,
  lerSorteioVigente,
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

test.describe("SR-5 · T3 · Roleta do sorteio (RF-09a)", () => {
  test("deve exibir a roleta com os nomes dos vendidos e desacelerar no resultado gravado no banco", async ({
    page,
  }) => {
    // 12 vendidos COM venda vigente (Maria/João alternados): o conjunto de
    // participantes do giro, no formato que a RPC conta.
    const rifa = await criarRifaDeTeste({
      titulo: "Roleta do sorteio",
      status: "encerrada",
      vendidosComVendas: 12,
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();

    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    const confirmacao = page.getByRole("dialog");
    await expect(
      confirmacao.getByText("O sorteio será feito entre 12 números vendidos."),
    ).toBeVisible();
    await confirmacao.getByRole("button", { name: "Confirmar" }).click();

    // Toast prescrito da gravação é IMEDIATO (§4.9 — a gravação não espera a
    // animação); a roleta abre por cima, girando.
    await expect(page.getByText("Sorteio realizado com sucesso.")).toBeVisible();

    const roleta = page.getByRole("dialog");
    await expect(roleta).toBeVisible();

    // GIRO pelos primeiros nomes dos vendidos (§4.9): enquanto gira, o título
    // é "Sorteando o vencedor…" e um nome aparece — a revelação está a ≥ 3 s
    // de distância (janela prescrita), então a janela curta abaixo é segura.
    await expect(roleta.getByRole("heading", { name: "Sorteando o vencedor…" })).toBeVisible({
      timeout: 2_000,
    });
    await expect(roleta.getByText(/^(Maria|João)$/)).toBeVisible();

    // DESACELERA no resultado servido: aguarda a revelação (giro ~3–5 s).
    await expect(roleta.getByText("Número sorteado:")).toBeVisible({ timeout: 10_000 });
    await expect(
      roleta.getByRole("heading", { name: "Resultado do sorteio" }),
    ).toBeVisible();

    // O que parou na roleta É o que o servidor gravou (banco real do stack
    // local, via administrativa) — §4.9: "desacelera no número já retornado".
    const gravado = await lerSorteioVigente(rifa.id);
    expect(gravado).not.toBeNull();
    const numeroGravado = String(gravado!.numero).padStart(3, "0");
    await expect(roleta.getByText(numeroGravado)).toBeVisible();
    await expect(roleta.getByText(gravado!.nome)).toBeVisible();

    // Resultado ÚNICO no banco (RNF-06) — 1 sorteio vigente.
    expect(await contarSorteiosVigentes(rifa.id)).toBe(1);

    // Fechar → o painel revela o estado real: badge 🎉, barra de ações da
    // etapa fora e a pastilha do vencedor DOURADA 🏆 com o MESMO número
    // (wiring `numeroSorteado` da VT-3 na T3, pendência da SR-2+SR-3).
    await roleta.getByRole("button", { name: "Voltar ao painel" }).click();
    await expect(page.getByText("🎉 Sorteada")).toBeVisible();
    await expect(page.getByRole("button", { name: `Número ${numeroGravado}, sorteado` })).toBeVisible();
    await expect(page.getByRole("button", { name: "Realizar Sorteio" })).toHaveCount(0);
  });
});
