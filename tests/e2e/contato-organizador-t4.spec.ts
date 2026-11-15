/**
 * PB-9 · Rodapé T4 com contato do perfil (SPEC §1.5 decisão 7/§3.5/§4.17).
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";

import type { Database } from "@/lib/supabase/database.types";

import { lerStatusLocal } from "./provisionar-organizador";
import { criarRifaDeTeste, limparRifasDeTeste } from "./provisionar-rifas";

const credenciaisPerfil = {
  email: `pb9-perfil-${randomUUID()}@rifa.test`,
  senha: "perfil-pb9-rifa-2026",
};
let perfilId = "";

test.beforeAll(async () => {
  const admin = clienteAdmin();
  const { data, error } = await admin.auth.admin.createUser({
    email: credenciaisPerfil.email,
    password: credenciaisPerfil.senha,
    email_confirm: true,
  });
  if (error || !data.user) {
    throw new Error(`Não foi possível provisionar organizador PB-9: ${error?.message ?? "sem usuário"}`);
  }
  perfilId = data.user.id;
});

test.afterAll(async () => {
  await limparRifasDeTeste();
  if (perfilId) await clienteAdmin().auth.admin.deleteUser(perfilId);
});

function clienteAdmin() {
  const { url, serviceRole } = lerStatusLocal();
  return createClient<Database>(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function entrar(
  page: import("@playwright/test").Page,
  credenciais: { email: string; senha: string },
) {
  await page.goto("/entrar");
  await page.getByLabel("E-mail").fill(credenciais.email);
  await page.getByLabel("Senha").fill(credenciais.senha);
  await page.getByRole("button", { name: "Entrar" }).click();
  await expect(page).toHaveURL(/\/$/u);
}

test.describe("PB-9 · Contato do organizador no rodapé público", () => {
  test.describe.configure({ mode: "serial" });

  test("deve mostrar nome e WhatsApp do perfil em formato clicável na T4", async ({ page }) => {
    await entrar(page, credenciaisPerfil);
    await page.goto("/perfil");
    await page.getByLabel("Nome de exibição").fill("Organizador da Comunidade");
    await page.getByLabel("WhatsApp").fill("(11) 97777-6666");
    await page.getByRole("button", { name: "Salvar perfil" }).click();
    await expect(page.getByText("Perfil salvo com sucesso.")).toBeVisible();

    const rifa = await criarRifaDeTeste({
      titulo: "Contato da comunidade",
      perfilId,
    });
    await page.goto(`/r/${rifa.slug}`);

    const rodape = page.locator('footer[aria-label="Contato do organizador"]');
    await expect(rodape).toContainText("Para comprar, fale com o organizador");
    await expect(rodape).toContainText("Organizador da Comunidade");
    const linkWhatsApp = rodape.getByRole("link", { name: "WhatsApp: (11) 97777-6666" });
    await expect(linkWhatsApp).toHaveAttribute("href", "https://wa.me/5511977776666");
  });

  test("deve exibir fallback claro quando nome e WhatsApp do perfil estão vazios", async ({ page }) => {
    const admin = clienteAdmin();
    const { error } = await admin
      .from("perfis")
      .update({ nome_exibicao: "", whatsapp: "" })
      .eq("id", perfilId);
    expect(error).toBeNull();

    const rifa = await criarRifaDeTeste({
      titulo: "Contato não informado",
      perfilId,
    });
    await page.goto(`/r/${rifa.slug}`);

    const rodape = page.locator('footer[aria-label="Contato do organizador"]');
    await expect(rodape).toContainText("Para comprar, fale com o organizador");
    await expect(rodape).toContainText("Nome do organizador não informado.");
    await expect(rodape).toContainText("WhatsApp do organizador não informado.");
    await expect(rodape.getByRole("link")).toHaveCount(0);
    await expect(rodape).not.toContainText("undefined");
  });
});
