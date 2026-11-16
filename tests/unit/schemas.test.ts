/**
 * FD-5 · Testes unitários dos DTOs Zod (SPEC §4.1 e matriz §5.2, linha RF-01).
 * Teste 1 (caminho feliz): payload válido passa o parse — todos os rótulos de
 * prêmio e a quantidade 5000 (teto da lista pré-definida).
 * Teste 2 (validação): rejeita qtd_minima > quantidade, quantidade fora da
 * lista (333), telefone não-E.164, nome < 2 caracteres, título > 60 e preço ≤ 0.
 */
import { describe, expect, it } from "vitest";
import {
  AtualizarRifaInputSchema,
  CriarRifaInputSchema,
  eRotuloPremio,
  PerfilInputSchema,
  ResultadoSorteioSchema,
  ROTULOS_PREMIO,
  VendaInputSchema,
  type RotuloPremio,
} from "@/lib/schemas";

const payloadRifaValida = {
  titulo: "Rifa do Forno Elétrico",
  descricao: "Forno 5 bocas, usado poucas vezes",
  premio_descricao: "Forno elétrico Philco",
  premio_rotulo: "estimado",
  premio_valor: 850,
  numero_valor: 10,
  quantidade: 5000,
  qtd_minima: 1000,
  data_prevista: "2026-12-25",
} as const;

const vendaValida = {
  numeroId: "00000000-0000-4000-8000-000000000037",
  nome: "Maria Silva",
  telefone: "+5511988887777",
} as const;

const perfilValido = {
  nomeExibicao: "Cláudio Stocco",
  whatsapp: "+5511988887777",
} as const;

const resultadoSorteioValido = {
  rifaId: "00000000-0000-4000-8000-000000000001",
  numero: 47,
  nomeVencedor: "Maria Silva",
  telefoneVencedor: "+5511988887777",
  totalVendidos: 82,
  sorteadoEm: "2026-11-08T20:30:00.000Z",
  anuladoEm: null,
} as const;

describe("FD-5 · lib/schemas — DTOs Zod", () => {
  it("deve aceitar payload válido passando o parse em todos os rótulos de prêmio (quantidade 5000)", () => {
    for (const rotulo of ROTULOS_PREMIO) {
      const parseado = CriarRifaInputSchema.safeParse({
        ...payloadRifaValida,
        premio_rotulo: rotulo,
      });
      expect(parseado.success, `rótulo=${rotulo}`).toBe(true);
      expect(parseado.data?.premio_rotulo).toBe(rotulo);
      expect(parseado.data?.quantidade).toBe(5000);
    }
  });

  it("deve rejeitar qtd_minima > quantidade, quantidade 333, telefone não-E.164, nome curto, título longo e preço ≤ 0", () => {
    const casos: {
      nome: string;
      schema: typeof CriarRifaInputSchema | typeof VendaInputSchema;
      payload: Record<string, unknown>;
      caminho: string;
      trechoMensagem: string;
    }[] = [
      {
        nome: "qtd_minima maior que a quantidade",
        schema: CriarRifaInputSchema,
        payload: { ...payloadRifaValida, qtd_minima: 5001 },
        caminho: "qtd_minima",
        trechoMensagem: "quantidade mínima",
      },
      {
        nome: "quantidade fora da lista pré-definida (333)",
        schema: CriarRifaInputSchema,
        payload: { ...payloadRifaValida, quantidade: 333 },
        caminho: "quantidade",
        trechoMensagem: "tamanhos pré-definidos",
      },
      {
        nome: "telefone fora do E.164",
        schema: VendaInputSchema,
        payload: { ...vendaValida, telefone: "(11) 98888-7777" },
        caminho: "telefone",
        trechoMensagem: "E.164",
      },
      {
        nome: "nome com menos de 2 caracteres",
        schema: VendaInputSchema,
        payload: { ...vendaValida, nome: "M" },
        caminho: "nome",
        trechoMensagem: "no mínimo 2",
      },
      {
        nome: "título com mais de 60 caracteres",
        schema: CriarRifaInputSchema,
        payload: { ...payloadRifaValida, titulo: "a".repeat(61) },
        caminho: "titulo",
        trechoMensagem: "no máximo 60",
      },
      {
        nome: "premio_valor igual a zero",
        schema: CriarRifaInputSchema,
        payload: { ...payloadRifaValida, premio_valor: 0 },
        caminho: "premio_valor",
        trechoMensagem: "maior que zero",
      },
      {
        nome: "numero_valor negativo",
        schema: CriarRifaInputSchema,
        payload: { ...payloadRifaValida, numero_valor: -10 },
        caminho: "numero_valor",
        trechoMensagem: "maior que zero",
      },
    ];

    for (const caso of casos) {
      const parseado = caso.schema.safeParse(caso.payload);

      expect(parseado.success, caso.nome).toBe(false);
      const problema = parseado.error!.issues.find(
        (issue) => issue.path.join(".") === caso.caminho,
      );
      expect(problema, caso.nome).toBeDefined();
      expect(problema!.message, caso.nome).toContain(caso.trechoMensagem);
    }
  });

  it("deve aceitar venda, perfil e resultado do sorteio válidos", () => {
    expect(VendaInputSchema.safeParse(vendaValida).success).toBe(true);
    expect(PerfilInputSchema.safeParse(perfilValido).success).toBe(true);
    expect(ResultadoSorteioSchema.safeParse(resultadoSorteioValido).success).toBe(true);
  });

  it("deve aceitar edição parcial (AtualizarRifaInput) sem campos ausentes", () => {
    const parseado = AtualizarRifaInputSchema.safeParse({
      titulo: "Rifa do Forno Novato",
    });
    expect(parseado.success).toBe(true);
  });
});

describe("FD-13 · guarda eRotuloPremio (string do banco → literal do contrato)", () => {
  it("deve reconhecer os 3 rótulos do domínio e afunilar o tipo", () => {
    for (const rotulo of ROTULOS_PREMIO) {
      expect(eRotuloPremio(rotulo)).toBe(true);
    }
    const rotulo: string = "mais_de";
    if (eRotuloPremio(rotulo)) {
      // Afunilamento provado: o tipo do valor narrowed é o literal do contrato.
      const literal: RotuloPremio = rotulo;
      expect(literal).toBe("mais_de");
    } else {
      expect.unreachable("mais_de deve ser reconhecido");
    }
  });

  it("deve recusar valores fora do domínio do CHECK (não crasha a tela)", () => {
    expect(eRotuloPremio("valor")).toBe(false);
    expect(eRotuloPremio("")).toBe(false);
    expect(eRotuloPremio("ESTIMADO")).toBe(false);
    expect(eRotuloPremio("estimado ")).toBe(false);
  });
});
