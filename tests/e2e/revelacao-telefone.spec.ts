/**
 * SR-7 · Revelação do telefone do ganhador na T3 (RF-10) — SPEC §3.4.6
 * item 7 · matriz §5.2 "RF-10 privacidade do telefone" (coluna Int/E2E).
 *
 * Teste 1 (caminho feliz): organizador logado na T3 vê o cartão do resultado
 *   com o telefone JÁ mascarado "(11) 9••••-••44"; o toque nos "••" mostra o
 *   telefone completo — valor que chega APENAS pela resposta da Server Action
 *   autorizada no servidor. `anon` NUNCA recebe o valor (checar rede/DOM):
 *   em `/rifas/{id}` é mandado ao login sem nenhum E.164 no DOM, e na T5
 *   pública vê só a máscara, SEM botão de revelação.
 *
 * O vencedor é determinístico (`sortearNumeroDeTeste` — o sorteio real é
 * aleatório, RNF-07). Rifas provisionadas pela via administrativa do stack
 * local (mesmo padrão SR-1..SR-6); o `afterAll` restaura a base íntegra do
 * ET-7. A negação da action pelo anon em si é provada no Teste 2 (int).
 */
import { expect, test, type Page } from "@playwright/test";

import { CREDENCIAIS_ORGANIZADOR, provisionarOrganizador } from "./provisionar-organizador";
import {
  criarRifaDeTeste,
  limparRifasDeTeste,
  sortearNumeroDeTeste,
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

test.describe("SR-7 · T3 · Revelação do telefone do ganhador (RF-10)", () => {
  test("deve revelar o telefone completo ao organizador no toque nos '••' e nunca entregar o valor ao anon", async ({
    page,
    browser,
  }) => {
    // Vencedor determinístico (número 47, Maria) com o telefone que gera a
    // máscara prescrita "(11) 9••••-••44" (§3.6/RF-10), e um segundo
    // comprador para provar que o cartão mostra o GANHADOR, não "um comprador".
    const rifa = await criarRifaDeTeste({
      titulo: "Revelação do telefone",
      status: "sorteada",
      vendidosComCompradores: [
        { numero: 47, nome: "Maria Silva", telefone: "+5511988884444" },
        { numero: 1, nome: "João Souza", telefone: "+5511999998888" },
      ],
    });
    await sortearNumeroDeTeste(rifa.id, 47);

    // -------- organizador logado na T3 --------
    await entrar(page);
    await page.goto(`/rifas/${rifa.id}`);

    const cartao = page.getByRole("region", { name: "Resultado do sorteio" });
    await expect(cartao).toBeVisible();
    await expect(cartao.getByText("047")).toBeVisible();
    await expect(cartao.getByText("Maria Silva")).toBeVisible();

    // Antes do toque: só a máscara prescrita — os trechos "••" são botões e o
    // telefone completo (E.164 e máscara integral) não está em lugar nenhum.
    await expect(cartao.getByText("(11) 9", { exact: true })).toBeVisible();
    await expect(cartao.getByText("44", { exact: true })).toBeVisible();
    await expect(page.getByText("(11) 98888-4444")).toHaveCount(0);
    const revelacoes = cartao.getByRole("button", {
      name: "Revelar o telefone completo do ganhador",
    });
    await expect(revelacoes).toHaveCount(2);

    // Toque nos "••": o telefone completo aparece — valor autorizado no
    // servidor para o organizador logado.
    await revelacoes.first().click();
    await expect(page.getByText("(11) 98888-4444")).toBeVisible();
    await expect(page.getByText("Telefone visível só para você.")).toBeVisible();
    await expect(revelacoes).toHaveCount(0);

    // -------- anon (novo contexto, sem sessão) --------
    const contextoAnonimo = await browser.newContext();
    const anonimo = await contextoAnonimo.newPage();
    try {
      // Rede: `/rifas/{id}` protegida → o anon vai ao login, sem dados.
      await anonimo.goto(`/rifas/${rifa.id}`);
      await expect(anonimo).toHaveURL(/\/entrar/);
      expect((await anonimo.content())).not.toContain("+5511988884444");
      expect((await anonimo.content())).not.toContain("(11) 98888-4444");

      // T5 pública: só a máscara — SEM botão de revelação (RF-10: a revelação
      // é exclusiva do T3) e sem o valor completo em rede/DOM.
      await anonimo.goto(`/r/${rifa.slug}/resultado`);
      await expect(anonimo.getByText("(11) 9••••-••44")).toBeVisible();
      await expect(
        anonimo.getByRole("button", { name: "Revelar o telefone completo do ganhador" }),
      ).toHaveCount(0);
      const htmlPublico = await anonimo.content();
      expect(htmlPublico).not.toContain("+5511988884444");
      expect(htmlPublico).not.toContain("(11) 98888-4444");
    } finally {
      await contextoAnonimo.close();
    }
  });
});
