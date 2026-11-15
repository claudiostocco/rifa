/**
 * PB-4 · Busca rápida da T4 — SPEC §3.5/§4.7 RF-07 · matriz §5.2.
 *
 * Teste 1 (E2E): "o 57 já foi vendido?" → buscar "57" encontra e destaca o
 *   estado atual do número exato (dados de venda reais no banco).
 * Teste 2 (E2E): buscar nome/telefone de comprador não encontra números nem
 *   expõe dados de compradores na T4 (RN-02/RNF-05).
 */
import { expect, test } from "@playwright/test";

import { provisionarOrganizador } from "./provisionar-organizador";
import { criarRifaDeTeste, limparRifasDeTeste } from "./provisionar-rifas";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

test.afterAll(async () => {
  await limparRifasDeTeste();
});

test.describe("PB-4 · Busca rápida de número na T4 (RF-07)", () => {
  test("deve mostrar e destacar o estado atual do número exato buscado", async ({ page }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Busca pública do número",
      quantidade: 500,
      vendidosComCompradores: [
        { numero: 57, nome: "Maria Silva", telefone: "+5511988887777" },
        { numero: 257, nome: "João Souza", telefone: "+5511999998888" },
      ],
    });

    await page.goto(`/r/${rifa.slug}`);
    const busca = page.getByRole("searchbox", { name: "Buscar número" });
    await expect(busca).toBeVisible();
    await busca.fill("57");

    // A busca é pelo NÚMERO exato, não por prefixo nem por dado de comprador.
    const numero = page.getByRole("button", { name: "Número 057, vendido" });
    await expect(numero).toBeVisible();
    await expect(numero).toHaveClass(/ring-2/u);
    await expect(page.getByRole("button", { name: "Número 001, disponível" })).toBeVisible();
    // O bloco contém o estado atual da grade; só o 057 recebe o anel de busca.
    await expect(page.getByRole("button", { name: "Número 001, disponível" })).not.toHaveClass(
      /ring-2/u,
    );

    // O mesmo campo localiza números fora do primeiro bloco de 100 (RNF-04).
    await busca.fill("257");
    await expect(page.getByRole("button", { name: "Número 257, vendido" })).toHaveClass(/ring-2/u);
    await expect(page.getByText("Bloco 3 de 5")).toBeVisible();
  });

  test("não deve usar nome ou telefone na busca pública nem expor comprador", async ({ page }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Busca pública sem comprador",
      vendidosComCompradores: [
        { numero: 57, nome: "Maria Silva", telefone: "+5511988887777" },
      ],
    });

    await page.goto(`/r/${rifa.slug}`);
    const busca = page.getByRole("searchbox", { name: "Buscar número" });

    // Mesmo com um comprador real atrás do RLS, buscar seu nome não revela a
    // pastilha vendida. A T4 não recebe nem consulta compradores/vendas.
    await busca.fill("Maria Silva");
    await expect(page.getByRole("status")).toContainText(
      'Nenhum número encontrado para "Maria Silva".',
    );
    await expect(page.getByRole("button", { name: /^Número \d{3},/u })).toHaveCount(0);
    await expect(page.getByText("Maria Silva", { exact: true })).toHaveCount(0);

    // Telefone completo também é texto sem correspondência — não há busca
    // parcial de telefone na variante pública (só a busca administrativa T3).
    await busca.fill("(11) 98888-7777");
    await expect(page.getByRole("status")).toContainText(
      'Nenhum número encontrado para "(11) 98888-7777".',
    );
    await expect(page.getByRole("button", { name: /^Número \d{3},/u })).toHaveCount(0);
    await expect(page.getByText("(11) 98888-7777", { exact: true })).toHaveCount(0);
  });
});
