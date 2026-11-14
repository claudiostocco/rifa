/**
 * VT-8 · Testes E2E da busca e dos filtros da T3 (SPEC §3.4.3 · §4.7 ·
 * matriz §5.2 RF-07).
 *
 * Teste 1 (caminho feliz): buscar "051" destaca a pastilha do número exato;
 *   buscar telefone PARCIAL de Maria revela apenas os números dela.
 * Teste 2 (borda/erro): o filtro "Disponíveis" oculta as vendidas; a busca
 *   sem resultado apresenta estado vazio claro (com "Limpar busca e
 *   filtros") e a grade volta inteira ao limpar — sem quebrar.
 *
 * Rifas provisionadas pela via administrativa do stack local (padrão
 * FD-12/VT-4) com a opção nova `vendidosComCompradores`: quem comprou o quê
 * é explícito — pré-requisito para provar "apenas os números daquela
 * pessoa". O `afterAll` restaura a base íntegra exigida pelo ET-7.
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

const BUSCA = "Buscar";

test.describe("VT-8 · Teste 1 — busca por número exato e por comprador", () => {
  test("deve destacar a pastilha do 051 na busca '051' e revelar apenas os números de Maria pelo telefone parcial", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Busca destaca e revela",
      vendidosComCompradores: [
        { numero: 1, nome: "Maria Silva", telefone: "+5511981112222" },
        { numero: 2, nome: "João Souza", telefone: "+5511973334444" },
        { numero: 37, nome: "Maria Silva", telefone: "+5511981112222" },
      ],
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    // Estado inicial: as três vendidas e as disponíveis na grade.
    await expect(page.getByRole("button", { name: "Número 001, vendido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 037, vendido" })).toBeVisible();

    // Busca por NÚMERO EXATO (§4.7): a pastilha 051 fica em destaque (anel).
    await page.getByLabel(BUSCA).fill("051");
    const destacada = page.getByRole("button", { name: "Número 051, disponível" });
    await expect(destacada).toBeVisible();
    await expect(destacada).toHaveClass(/ring-2/);
    await expect(page.getByRole("button", { name: "Número 001, vendido" })).toHaveCount(0);

    // Busca por TELEFONE PARCIAL de Maria (98111): revela APENAS os números
    // dela — os de João e os disponíveis saem da grade.
    await page.getByLabel(BUSCA).fill("98111");
    await expect(page.getByRole("button", { name: "Número 001, vendido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 037, vendido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 002, vendido" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Número 038, disponível" })).toHaveCount(0);
    await expect(page.locator('[aria-label="Grade de números da rifa"] button')).toHaveCount(2);

    // A grade segue funcional sob a busca: tocar uma pastilha de Maria abre
    // o modal T3a com o prefill (a busca não bloqueia a gestão — F2).
    await page.getByRole("button", { name: "Número 037, vendido" }).click();
    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("heading", { name: "Número 037" })).toBeVisible();
    await expect(modal.getByLabel("Nome")).toHaveValue("Maria Silva");
    await page.keyboard.press("Escape");
    await expect(modal).toHaveCount(0);
  });
});

test.describe("VT-8 · Teste 2 — filtro de estado e busca sem resultado", () => {
  test("deve ocultar as vendidas no filtro 'Disponíveis' e apresentar estado vazio claro na busca sem resultado", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Filtro oculta e estado vazio",
      vendidosComCompradores: [
        { numero: 1, nome: "Maria Silva", telefone: "+5511981112222" },
        { numero: 2, nome: "João Souza", telefone: "+5511973334444" },
        { numero: 37, nome: "Maria Silva", telefone: "+5511981112222" },
      ],
    });

    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    // Filtro "Disponíveis": TODAS as vendidas somem; só as disponíveis ficam.
    await page.getByRole("button", { name: "Disponíveis" }).click();
    await expect(page.getByRole("button", { name: "Disponíveis" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(page.getByRole("button", { name: "Número 001, vendido" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Número 002, vendido" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Número 037, vendido" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Número 038, disponível" })).toBeVisible();
    await expect(page.locator('[aria-label="Grade de números da rifa"] button')).toHaveCount(97);

    // Volta a "Todos": a grade completa retorna intacta (o filtro não apaga).
    await page.getByRole("button", { name: "Todos" }).click();
    await expect(page.getByRole("button", { name: "Número 001, vendido" })).toBeVisible();
    await expect(page.locator('[aria-label="Grade de números da rifa"] button')).toHaveCount(100);

    // Busca sem resultado ("600": fora da faixa e não está em telefone
    // nenhum): estado vazio CLARO, com a consulta citada e caminho de saída.
    await page.getByLabel(BUSCA).fill("600");
    const vazio = page.getByRole("status");
    await expect(vazio).toContainText('Nenhum número encontrado para "600".');
    await expect(vazio.getByRole("button", { name: "Limpar busca e filtros" })).toBeVisible();
    await expect(page.locator('[aria-label="Grade de números da rifa"] button')).toHaveCount(0);

    // Limpar: a grade volta INTEIRA — a busca nunca quebra a grade.
    await vazio.getByRole("button", { name: "Limpar busca e filtros" }).click();
    await expect(page.getByLabel(BUSCA)).toHaveValue("");
    await expect(page.getByRole("button", { name: "Número 001, vendido" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Número 051, disponível" })).toBeVisible();
    await expect(page.locator('[aria-label="Grade de números da rifa"] button')).toHaveCount(100);
  });
});
