/**
 * PL-3 · Desempenho da grade pública (SPEC §3.5/RNF-04; PLAN PL-3).
 *
 * A rifa de 5.000 números é real no Postgres local. O teste mede o comportamento
 * observável do browser, não uma função sintética: somente um bloco entra no
 * DOM e a troca de bloco não pode produzir uma pausa longa de frames.
 */
import { expect, test, type Page } from "@playwright/test";

import { provisionarOrganizador } from "./provisionar-organizador";
import { criarRifaDeTeste, limparRifasDeTeste } from "./provisionar-rifas";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

test.afterAll(async () => {
  await limparRifasDeTeste();
});

async function iniciarMedicaoDeFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const janela = window as unknown as {
      __pl3Frames?: { ativo: boolean; ultimo: number; maiores: number[] };
    };
    const medicao = { ativo: true, ultimo: performance.now(), maiores: [] as number[] };
    janela.__pl3Frames = medicao;
    const observar = (agora: number) => {
      if (!medicao.ativo) return;
      medicao.maiores.push(agora - medicao.ultimo);
      medicao.ultimo = agora;
      requestAnimationFrame(observar);
    };
    requestAnimationFrame(observar);
  });
}

async function encerrarMedicaoDeFrames(page: Page): Promise<number> {
  return page.evaluate(() => {
    const janela = window as unknown as {
      __pl3Frames?: { ativo: boolean; maiores: number[] };
    };
    const medicao = janela.__pl3Frames;
    if (!medicao) return 0;
    medicao.ativo = false;
    return Math.max(...medicao.maiores, 0);
  });
}

test.describe("PL-3 · grade de 5.000 números", () => {
  test("deve trocar o bloco sem renderizar 5.000 células nem gerar jank crítico", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "PL3 paginação cinco mil",
      quantidade: 5000,
    });
    await page.goto(`/r/${rifa.slug}`);

    const grade = page.getByRole("region", { name: "Grade de números da rifa" });
    const celulas = grade.getByRole("button", { name: /^Número \d+, disponível$/u });
    await expect(celulas).toHaveCount(100);
    await expect(grade.getByRole("button", { name: "Número 001, disponível" })).toBeVisible();
    await expect(grade.getByRole("button", { name: "Número 101, disponível" })).toHaveCount(0);

    await iniciarMedicaoDeFrames(page);
    const inicio = await page.evaluate(() => performance.now());
    await grade.getByRole("button", { name: "Próxima" }).click();
    await expect(grade.getByRole("button", { name: "Número 101, disponível" })).toBeVisible();
    const duracao = (await page.evaluate(() => performance.now())) - inicio;
    const maiorPausa = await encerrarMedicaoDeFrames(page);

    await expect(celulas).toHaveCount(100);
    await expect(grade.getByRole("button", { name: "Número 001, disponível" })).toHaveCount(0);
    expect(duracao).toBeLessThan(500);
    expect(maiorPausa).toBeLessThan(250);
  });

  test("deve carregar a T4 de 5.000 números em menos de 2 segundos na média de três cargas frias", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "PL3 carga fria cinco mil",
      quantidade: 5000,
    });
    const url = `/r/${rifa.slug}`;
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });

    const duracoes: number[] = [];
    for (let tentativa = 0; tentativa < 3; tentativa += 1) {
      const inicio = performance.now();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      await expect(page.getByRole("button", { name: "Número 001, disponível" })).toBeVisible();
      duracoes.push(performance.now() - inicio);
    }

    const media = duracoes.reduce((total, duracao) => total + duracao, 0) / duracoes.length;
    expect(media, `cargas medidas: ${duracoes.map((valor) => Math.round(valor)).join(", ")} ms`).toBeLessThan(
      2000,
    );
  });
});
