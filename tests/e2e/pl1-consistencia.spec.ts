/**
 * PL-1 · Varredura de mensagens e fricção das ações principais.
 * SPEC §2.2, §3.7 (F1–F6) e RNF-03; PLAN PL-1.
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import {
  criarRifaDeTeste,
  limparRifasDeTeste,
  registrarRifaParaLimpeza,
} from "./provisionar-rifas";

const mensagensTecnicas =
  /\b(?:internal server error|unhandled runtime error|postgresterror|typeerror|referenceerror|syntaxerror|stack trace|undefined|null)\b|could not find|failed to fetch/iu;

async function entrar(page: Page): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

async function verificarSemMensagemTecnica(page: Page): Promise<void> {
  const textoVisivel = await page.locator("body").innerText();
  expect(textoVisivel).not.toMatch(mensagensTecnicas);
}

test.beforeAll(async () => {
  await provisionarOrganizador();
});

test.afterAll(async () => {
  await limparRifasDeTeste();
});

test.describe("PL-1 · mensagens consistentes e ações diretas", () => {
  test("deve manter mensagens dos estados de falha em pt-BR sem expor detalhes técnicos", async ({
    page,
  }) => {
    const errosDePagina: string[] = [];
    page.on("pageerror", (erro) => errosDePagina.push(erro.message));

    await page.goto("/entrar");
    await page.getByLabel("E-mail").fill("invalido@rifa.test");
    await page.getByLabel("Senha").fill("senha-incorreta");
    await page.getByRole("button", { name: "Entrar" }).click();
    await expect(page.locator('p[role="alert"]')).toContainText("E-mail ou senha incorretos.");
    await verificarSemMensagemTecnica(page);

    await page.goto("/r/slug-que-nao-existe-pl1");
    await expect(page.getByText("Não encontramos essa rifa. Confira o link com quem a criou.")).toBeVisible();
    await verificarSemMensagemTecnica(page);

    await entrar(page);
    const rifa = await criarRifaDeTeste({
      titulo: "PL1 sorteio sem vendas",
      status: "encerrada",
    });
    await page.goto(`/rifas/${rifa.id}`);
    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    const confirmacao = page.getByRole("dialog");
    await confirmacao.getByRole("button", { name: "Confirmar" }).click();
    await expect(
      page.getByText("A rifa não tem números vendidos; o sorteio não pode ser realizado."),
    ).toBeVisible();
    await verificarSemMensagemTecnica(page);

    expect(errosDePagina).toEqual([]);
  });

  test("deve concluir as ações principais com até três ativações explícitas", async ({ page }) => {
    await entrar(page);
    await page.getByRole("link", { name: /Nova Rifa/u }).click();
    await page.getByLabel("Título da rifa").fill("PL1 ações diretas");
    await page.getByLabel("Descrição do prêmio").fill("Prêmio do teste");
    await page.getByLabel("Valor do prêmio (R$)").fill("100,00");
    await page.getByLabel("Valor do número (R$)").fill("10,00");
    await page.getByLabel("Mínimo de números vendidos").fill("1");
    const criar = page.getByRole("button", { name: "Criar rifa" });
    await expect(criar).toBeEnabled();
    await criar.click();
    await expect(page).toHaveURL(/\/rifas\/[0-9a-f-]{36}$/u);
    const rifaId = new URL(page.url()).pathname.split("/").at(-1);
    expect(rifaId).toMatch(/^[0-9a-f-]{36}$/u);
    registrarRifaParaLimpeza(rifaId ?? "");
    const enderecoPublico = page.getByLabel("Endereço público da rifa");
    await expect(enderecoPublico).toHaveText(/^https?:\/\//u);
    const caminhoPublico = new URL(await enderecoPublico.innerText()).pathname;
    const slug = caminhoPublico.split("/").at(-1);
    expect(slug).toBeTruthy();
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copiar link público" }).click();
    await expect(page.getByText("Link copiado! Cole no WhatsApp ou onde quiser.")).toBeVisible();

    // F1: abrir cadastro + criar = 2 ativações; copiar link exige só 1.
    // F5/F3: abrir link, buscar número exato e verificar estado atual.
    await page.goto(caminhoPublico);
    await page.getByLabel("Buscar número").fill("1");
    await expect(page.getByRole("button", { name: "Número 001, disponível" })).toBeVisible();
    await page.getByLabel("Buscar número").fill("");

    // F2 público: tocar número + salvar = 2 ativações (digitação não conta).
    await page.getByRole("button", { name: "Número 001, disponível" }).click();
    const modalPublico = page.getByRole("dialog");
    await modalPublico.getByLabel("Nome").fill("Pessoa PL1");
    await modalPublico.getByLabel("Telefone").fill("(11) 97777-1212");
    await modalPublico.getByRole("button", { name: "Salvar" }).click();
    await expect(page.getByRole("button", { name: "Número 001, vendido" })).toBeVisible();

    await page.goto(`/rifas/${rifaId}`);

    // F4 encerrar: abrir confirmação + confirmar = 2 ativações.
    await page.getByRole("button", { name: "Encerrar vendas" }).click();
    const confirmacaoEncerramento = page.getByRole("dialog");
    await expect(confirmacaoEncerramento).toBeVisible();
    await confirmacaoEncerramento.getByRole("button", { name: "Confirmar" }).click();
    await expect(page.getByText("🔒 Encerrada")).toBeVisible();

    // F4 sortear: abrir confirmação + confirmar = 2 ativações.
    await page.getByRole("button", { name: "Realizar Sorteio" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Confirmar" }).click();
    const roleta = page.getByRole("dialog");
    await expect(roleta.getByRole("heading", { name: "Resultado do sorteio" })).toBeVisible({
      timeout: 10_000,
    });
    await roleta.getByRole("button", { name: "Voltar ao painel" }).click();

    // F6 copiar resultado: uma ativação após acessar a T5.
    await page.goto(`/r/${slug}/resultado`);
    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copiar resultado" }).click();
    await expect(page.getByText(/Resultado copiado/u)).toBeVisible();
  });
});
