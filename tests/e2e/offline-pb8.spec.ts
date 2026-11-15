/**
 * PB-8 · Offline sem fila de gravação (SPEC §3.2/§3.5/§4.18 · matriz RF-18).
 */
import { expect, test } from "@playwright/test";

import { criarRifaDeTeste, lerVendaVigenteDeTeste, limparRifasDeTeste } from "./provisionar-rifas";

test.afterAll(async () => {
  await limparRifasDeTeste();
});

test.describe("PB-8 · aviso offline e gravações bloqueadas", () => {
  test("deve exibir o aviso global ao perder a conexão e removê-lo ao reconectar", async ({
    page,
    context,
  }) => {
    await page.goto("/entrar");
    await expect(page.getByRole("heading", { name: "Rifa App" })).toBeVisible();

    await context.setOffline(true);
    await expect(
      page.getByRole("status").filter({
        hasText: "Sem conexão — os dados não serão salvos até reconectar",
      }),
    ).toBeVisible();

    await context.setOffline(false);
    await expect(
      page.getByRole("status").filter({
        hasText: "Sem conexão — os dados não serão salvos até reconectar",
      }),
    ).toHaveCount(0);
  });

  test("deve bloquear venda sem gravar offline e permitir salvar após reconectar", async ({
    page,
    context,
  }) => {
    const rifa = await criarRifaDeTeste({ titulo: "Venda bloqueada offline" });
    await page.goto(`/r/${rifa.slug}`);
    await page.getByRole("button", { name: "Número 037, disponível" }).click();

    const modal = page.getByRole("dialog");
    await modal.getByLabel("Nome").fill("Maria Silva");
    await modal.getByLabel("Telefone").fill("(11) 98888-7777");

    await context.setOffline(true);
    await expect(modal.getByRole("alert")).toContainText(
      "Sem conexão — os dados não serão salvos até reconectar.",
    );
    await expect(modal.getByRole("button", { name: "Salvar" })).toBeDisabled();
    await expect(page.getByRole("status")).toContainText(
      "Sem conexão — os dados não serão salvos até reconectar",
    );
    expect(await lerVendaVigenteDeTeste(rifa.id, 37)).toBeNull();

    await context.setOffline(false);
    await expect(modal.getByRole("button", { name: "Salvar" })).toBeEnabled();
    await modal.getByRole("button", { name: "Salvar" }).click();
    await expect(modal).toHaveCount(0);
    await expect(page.getByText("Venda registrada com sucesso.")).toBeVisible();
    expect(await lerVendaVigenteDeTeste(rifa.id, 37)).toEqual({
      origem: "publico",
      nome: "Maria Silva",
    });
  });
});
