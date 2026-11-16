/**
 * SR-6 · T5 · Resultado do sorteio (rota própria `/r/{slug}/resultado`) —
 * §2.8/§3.6 · matriz §5.2 "RF-12 T5 resultado próprio".
 *
 * Teste 1 (caminho feliz): link direto SEM login exibe "047 · Maria ·
 *   (11) 9••••-••44 · Mais de R$ 500" cruzado com o banco real do stack
 *   local; o telefone completo (E.164 e máscara integral) nunca está no DOM
 *   (RF-10 — a revelação é só no T3, SR-7).
 *
 * Teste 2 (borda/erro): rifa sem sorteio → "Sorteio ainda não realizado"
 *   (sem botão copiar); com sorteio, o botão copiar produz o texto formatado
 *   correto no clipboard (RF-13) — sem "undefined" em campos ausentes.
 *
 * Rifas provisionadas pela via administrativa do stack local (mesmo padrão
 * SR-1..SR-5), com sorteio DETERMINÍSTICO (`sortearNumeroDeTeste` — o sorteio
 * real é aleatório, RNF-07, então o vencedor é gravado direto). O `afterAll`
 * restaura a base íntegra exigida pelo ET-7.
 */
import { expect, test, type Page } from "@playwright/test";

import { criarRifaDeTeste, limparRifasDeTeste, sortearNumeroDeTeste } from "./provisionar-rifas";

test.afterAll(async () => {
  await limparRifasDeTeste();
});

/** Espaço inquebrável que o Intl pt-BR coloca entre "R$" e o valor. */
const NBSP = "\u00A0";

/**
 * RF-10 · prova de privacidade: o E.164 completo NÃO pode estar em nenhum
 * elemento — inclusive payloads RSC embutidos em <script> (page.content()).
 */
async function asseverarTelefoneAusente(page: Page, e164: string): Promise<void> {
  const html = await page.content();
  expect(html).not.toContain(e164);
  // Máscara integral da mesma máscara prescrita do §4.19: só a variante
  // oculta é exibida na tela pública.
  await expect(page.getByText("(11) 98888-4444")).toHaveCount(0);
  await expect(page.getByText(e164)).toHaveCount(0);
}

test.describe("SR-6 · T5 · Resultado do sorteio (§3.6)", () => {
  test("deve exibir o vencedor com o telefone oculto em link direto sem login, sem o telefone completo no DOM", async ({
    page,
  }) => {
    const rifa = await criarRifaDeTeste({
      titulo: "Resultado do sorteio",
      status: "sorteada",
      premioRotulo: "mais_de",
      premioValor: 500,
      vendidosComCompradores: [
        // Vencedor determinístico com o telefone que gera a máscara prescrita
        // "(11) 9••••-••44" (RF-10 · §3.6).
        { numero: 47, nome: "Maria Silva", telefone: "+5511988884444" },
        { numero: 1, nome: "João Souza", telefone: "+5511999998888" },
      ],
    });
    await sortearNumeroDeTeste(rifa.id, 47);

    // Link direto compartilhável isoladamente (decisão 5) — SEM login.
    await page.goto(`/r/${rifa.slug}/resultado`);

    await expect(page.getByText("Número sorteado: 047")).toBeVisible();
    await expect(page.getByText("Maria Silva")).toBeVisible();
    await expect(page.getByText("(11) 9••••-••44")).toBeVisible();
    // Prêmio com o rótulo da rifa ("Mais de R$ 500 — Forno elétrico", §3.6).
    await expect(page.getByText(/Mais de R\$.500,00 — Forno elétrico/u)).toBeVisible();
    await expect(page.getByText("Sorteado em: 14/11/2026 17:30")).toBeVisible();

    // RF-10: o telefone completo nunca está no DOM (nem no payload RSC).
    await asseverarTelefoneAusente(page, "+5511988884444");
  });

  test("deve exibir 'Sorteio ainda não realizado' em rifa sem sorteio e copiar o texto formatado sem 'undefined'", async ({
    page,
  }) => {
    // Rifa pública SEM sorteio: estado prescrito da §3.6, sem botão copiar.
    const rifaSemSorteio = await criarRifaDeTeste({
      titulo: "Resultado sem sorteio",
      status: "encerrada",
      vendidosComVendas: 3,
    });
    await page.goto(`/r/${rifaSemSorteio.slug}/resultado`);

    await expect(page.getByText("Sorteio ainda não realizado")).toBeVisible();
    await expect(page.getByRole("button", { name: "Copiar resultado" })).toHaveCount(0);

    // Cenário do copiar: rifa com sorteio determinístico e SEM data prevista
    // (o texto não pode conter "undefined" — matriz RF-13).
    const rifaComSorteio = await criarRifaDeTeste({
      titulo: "Copiar resultado",
      status: "sorteada",
      premioRotulo: "mais_de",
      premioValor: 500,
      vendidosComCompradores: [{ numero: 12, nome: "Maria Silva", telefone: "+5511988884444" }],
    });
    await sortearNumeroDeTeste(rifaComSorteio.id, 12);

    await page.goto(`/r/${rifaComSorteio.slug}/resultado`);
    await expect(page.getByText("Número sorteado: 012")).toBeVisible();

    await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.getByRole("button", { name: "Copiar resultado" }).click();
    await expect(
      page.getByText("Resultado copiado! Cole no WhatsApp ou onde quiser."),
    ).toBeVisible();

    const esperado = [
      `🎉 Resultado do sorteio — ${rifaComSorteio.titulo}`,
      "Número sorteado: 012",
      "Ganhador: Maria Silva · (11) 9••••-••44",
      `Prêmio: Mais de R$${NBSP}500,00 — Forno elétrico`,
      "Sorteado em: 14/11/2026 17:30",
    ].join("\n");
    const texto = await page.evaluate(() => navigator.clipboard.readText());
    expect(texto).toBe(esperado);
    expect(texto).not.toContain("undefined");
  });
});
