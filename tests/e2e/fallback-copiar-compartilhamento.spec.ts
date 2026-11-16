/**
 * PB-6 · Fallback manual de compartilhamento — SPEC §3.4.1/§3.6 · matriz §5.2 RF-13.
 *
 * Teste 2 (E2E): sem Clipboard API, copiar o link mantém o endereço selecionável
 *   e copiar o resultado revela o texto formatado para seleção manual, sem crash.
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

async function entrar(page: Page): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

async function desativarClipboard(page: Page): Promise<void> {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: undefined,
    });
  });
}

test.describe("PB-6 · Fallback manual quando o clipboard não está disponível", () => {
  test("deve manter o link e o resultado copiáveis manualmente sem interromper a tela", async ({
    page,
  }) => {
    const rifaPainel = await criarRifaDeTeste({ titulo: "Fallback link público" });
    const rifaResultado = await criarRifaDeTeste({
      titulo: "Fallback resultado",
      status: "sorteada",
      vendidosComCompradores: [
        { numero: 47, nome: "Maria Silva", telefone: "+5511988884444" },
      ],
    });
    await sortearNumeroDeTeste(rifaResultado.id, 47);

    await desativarClipboard(page);
    await entrar(page);
    await page.goto(`/rifas/${rifaPainel.id}`);

    const endereco = page.getByLabel("Endereço público da rifa");
    const urlEsperada = await endereco.textContent();
    await page.getByRole("button", { name: "Copiar link público" }).click();
    await expect(
      page.getByText(
        "Não foi possível copiar automaticamente. Selecione o link acima e copie manualmente.",
      ),
    ).toBeVisible();
    await expect(endereco).toHaveText(urlEsperada ?? "");
    await expect(page.getByRole("heading", { name: rifaPainel.titulo })).toBeVisible();

    await page.goto(`/r/${rifaResultado.slug}/resultado`);
    await page.getByRole("button", { name: "Copiar resultado" }).click();
    await expect(
      page.getByText("Não foi possível copiar automaticamente. Copie o texto abaixo manualmente."),
    ).toBeVisible();

    const textoManual = page.locator("p.select-all");
    await expect(textoManual).toBeVisible();
    await expect(textoManual).toContainText("Número sorteado: 047");
    await expect(textoManual).toContainText("Ganhador: Maria Silva · (11) 9••••-••44");
    await expect(textoManual).not.toContainText("undefined");
    await expect(page.getByText("+5511988884444", { exact: true })).toHaveCount(0);
  });
});
