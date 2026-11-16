/**
 * PB-10 · Grade desktop para compartilhamento e manifesto PWA contextual.
 *
 * Teste 1: T4 expõe 10 colunas no desktop e o manifesto aponta para a rifa.
 * Teste 2: rifas não publicadas não geram manifesto e a T1 mantém o manifesto geral.
 */
import { expect, test } from "@playwright/test";

import {
  criarRifaDeTeste,
  limparRifasDeTeste,
} from "./provisionar-rifas";

test.afterAll(async () => {
  await limparRifasDeTeste();
});

test.describe("PB-10 · atalho da rifa pública", () => {
  test("deve exibir 10 colunas no desktop e manifesto com início na T4", async ({ page }) => {
    const rifa = await criarRifaDeTeste({ titulo: "Atalho desktop" });

    await page.setViewportSize({ width: 800, height: 900 });
    await page.goto(`/r/${rifa.slug}`);

    const grade = page.getByRole("region", { name: "Grade de números da rifa" });
    await expect(grade).toBeVisible();
    await expect(grade.locator("div.grid")).toHaveClass(/min-\[800px\]:grid-cols-10/u);
    await expect(grade.locator("div.grid")).toHaveClass(/max-w-\[700px\]/u);
    await expect(grade.locator("[aria-label^='Número']")).toHaveCount(100);

    const resposta = await page.request.get(`/r/${rifa.slug}/manifest.webmanifest`);
    expect(resposta.ok()).toBe(true);
    expect(resposta.headers()["content-type"]).toContain("manifest+json");
    await expect(resposta.json()).resolves.toMatchObject({
      id: `/r/${rifa.slug}`,
      start_url: `/r/${rifa.slug}`,
      name: rifa.titulo,
      display: "standalone",
    });

    await expect(page.locator("link[rel='manifest']")).toHaveAttribute(
      "href",
      `/r/${rifa.slug}/manifest.webmanifest`,
    );

    await page.evaluate(() => {
      const evento = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(evento, {
        prompt: async () => undefined,
        userChoice: Promise.resolve({ outcome: "dismissed", platform: "web" }),
      });
      window.dispatchEvent(evento);
    });
    await expect(
      page.getByRole("button", { name: "Instalar atalho desta rifa" }),
    ).toBeVisible();
  });

  test("não deve gerar manifesto para rifa não publicada e deve manter manifesto geral na T1", async ({
    page,
  }) => {
    const arquivada = await criarRifaDeTeste({
      titulo: "Atalho arquivado",
      arquivada: true,
    });
    const excluida = await criarRifaDeTeste({
      titulo: "Atalho excluído",
      excluida: true,
    });

    for (const slug of [arquivada.slug, excluida.slug, "slug-inexistente-pb10"]) {
      const resposta = await page.request.get(`/r/${slug}/manifest.webmanifest`);
      expect(resposta.status()).toBe(404);
    }

    await page.goto("/");
    await expect(page.locator("link[rel='manifest']")).toHaveAttribute(
      "href",
      "/manifest.webmanifest",
    );
  });
});
