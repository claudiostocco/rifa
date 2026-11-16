/**
 * PB-7 · PWA instalável (SPEC §3.2/§4.18/§5.2 RF-18).
 * Teste 1: manifest e ícones válidos; service worker instalado e shell
 *   disponível após navegação offline.
 * Teste 2: `beforeinstallprompt` oferece botão; sem evento o botão não aparece.
 */
import { expect, test } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";

test.beforeAll(async () => {
  await provisionarOrganizador();
});

async function entrar(page: import("@playwright/test").Page): Promise<void> {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(CREDENCIAIS_ORGANIZADOR.email);
  await page.getByLabel("Senha").fill(CREDENCIAIS_ORGANIZADOR.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

test.describe("PB-7 · PWA instalável", () => {
  test("deve validar o manifest e carregar a T1 pelo shell após ficar offline", async ({
    page,
    context,
  }) => {
    const respostaManifest = await page.request.get("/manifest.webmanifest");
    expect(respostaManifest.ok()).toBe(true);
    const manifest: unknown = await respostaManifest.json();
    expect(manifest).toMatchObject({
      name: "Rifa App",
      short_name: "Rifa",
      start_url: "/",
      display: "standalone",
      theme_color: "#9a3412",
    });
    expect(manifest).toMatchObject({
      icons: expect.arrayContaining([
        expect.objectContaining({ src: "/icons/icon-192.png", sizes: "192x192" }),
        expect.objectContaining({ src: "/icons/icon-512.png", sizes: "512x512" }),
      ]),
    });

    for (const caminho of ["/icons/icon-192.png", "/icons/icon-512.png"]) {
      const icone = await page.request.get(caminho);
      expect(icone.ok()).toBe(true);
      expect(icone.headers()["content-type"]).toContain("image/png");
    }

    await entrar(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null))
      .toBe(true);

    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole("heading", { name: "Minhas Rifas" })).toBeVisible();
    await context.setOffline(false);
  });

  test("deve exibir Instalar app após beforeinstallprompt e ocultá-lo sem suporte", async ({
    page,
  }) => {
    await entrar(page);
    await expect(page.getByRole("button", { name: "Instalar app" })).toHaveCount(0);

    await page.evaluate(() => {
      const evento = new Event("beforeinstallprompt", { cancelable: true });
      Object.assign(evento, {
        prompt: async () => undefined,
        userChoice: Promise.resolve({ outcome: "accepted", platform: "web" }),
      });
      window.dispatchEvent(evento);
    });

    const botaoInstalar = page.getByRole("button", { name: "Instalar app" });
    await expect(botaoInstalar).toBeVisible();
    await botaoInstalar.click();
    await expect(botaoInstalar).toHaveCount(0);
  });
});
