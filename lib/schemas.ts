/**
 * FD-5 · Contratos de dados (DTOs Zod) — porta de entrada das Server Actions.
 *
 * Os formatos derivam dos contratos da SPEC §4.1 (CriarRifaInput), §4.5
 * (registrarVenda), §4.17 (perfil) e §4.9/§4.10 (saída do sorteio), e das
 * CHECKs da migração 001 — quaisquer divergências estouram no banco.
 * Atualizar algo aqui exige primeiro atualizar a SPEC (AGENTS §4.4).
 */
import { z } from "zod";

/** Tamanhos pré-definidos de rifa (decisão 3 · CHECK de `rifas.quantidade`). */
export const TAMANHOS_RIFA = [25, 50, 100, 200, 500, 1000, 5000] as const;
export type TamanhoRifa = (typeof TAMANHOS_RIFA)[number];

/** Rótulos de exibição do prêmio (RF-01 · CHECK de `rifas.premio_rotulo`). */
export const ROTULOS_PREMIO = ["estimado", "mais_de", "ate"] as const;
export type RotuloPremio = (typeof ROTULOS_PREMIO)[number];

/** Limite do numeric(10,2) do schema (§2.4): 10 dígitos, 2 decimais. */
const VALOR_BRL_MAXIMO = 99_999_999.99;

const TEMANHOS_COM_ATE_DUAS_CASAS = (valor: number) => {
  const centavos = valor * 100;
  return Math.abs(centavos - Math.round(centavos)) < 0.01;
};

/** Telefone com máscara aplicada pela UI chega aqui já em E.164 (§4.19). */
export const TelefoneE164Schema = z
  .string({ error: "Informe o telefone do comprador" })
  .regex(/^\+[1-9]\d{7,14}$/, "O telefone deve estar no formato E.164 (ex.: +5511988887777)");

const moedaBrlSchema = (campo: string) =>
  z
    .number({ error: `Informe ${campo} em reais (número)` })
    .positive(`O ${campo} deve ser maior que zero`)
    .max(VALOR_BRL_MAXIMO, `O ${campo} excede o limite de R$ 99.999.999,99`)
    .refine(TEMANHOS_COM_ATE_DUAS_CASAS, `O ${campo} deve ter no máximo 2 casas decimais`);

const valorDataISOValida = (iso: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const [ano, mes, dia] = iso.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return (
    data.getUTCFullYear() === ano && data.getUTCMonth() === mes - 1 && data.getUTCDate() === dia
  );
};

const dataPrevistaSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "A data prevista deve ser AAAA-MM-DD")
  .refine(valorDataISOValida, "A data prevista deve ser uma data real");

const quantidadeSchema = z
  .number({ error: "Informe a quantidade de números" })
  .int("A quantidade deve ser um número inteiro")
  .refine(
    (valor): valor is TamanhoRifa => (TAMANHOS_RIFA as readonly number[]).includes(valor),
    "A quantidade deve ser um dos tamanhos pré-definidos: 25, 50, 100, 200, 500, 1000 ou 5000",
  );

const qtdMinimaSchema = z
  .number({ error: "Informe a quantidade mínima de números vendidos" })
  .int("A quantidade mínima deve ser um número inteiro")
  .min(0, "A quantidade mínima não pode ser negativa");

/** RN-05: mínima ≤ quantidade — conferência transversal em criar e editar. */
const conferirQuantidadeMinima = (
  dados: { quantidade?: number; qtd_minima?: number },
  ctx: z.RefinementCtx,
) => {
  if (
    dados.quantidade === undefined ||
    dados.qtd_minima === undefined ||
    dados.qtd_minima <= dados.quantidade
  ) {
    return;
  }
  ctx.addIssue({
    code: "custom",
    path: ["qtd_minima"],
    message: "A quantidade mínima de vendidos não pode exceder a quantidade de números",
  });
};

/** URL http(s) do bucket `premios` (RF-17); null/undefined nunca chega aqui. */
function urlValida(url: string) {
  try {
    const destino = new URL(url);
    return destino.protocol === "https:" || destino.protocol === "http:";
  } catch {
    return false;
  }
}

const CamposRifaSchema = z.object({
  titulo: z
    .string({ error: "Informe o título da rifa" })
    .min(3, "O título deve ter no mínimo 3 caracteres")
    .max(60, "O título deve ter no máximo 60 caracteres"),
  descricao: z
    .string({ error: "A descrição deve ser um texto" })
    .max(500, "A descrição deve ter no máximo 500 caracteres")
    .optional(),
  premio_descricao: z
    .string({ error: "Informe a descrição do prêmio" })
    .min(1, "A descrição do prêmio é obrigatória"),
  premio_rotulo: z.enum(ROTULOS_PREMIO, {
    error: "O rótulo do prêmio deve ser 'estimado', 'mais_de' ou 'ate'",
  }),
  premio_valor: moedaBrlSchema("valor do prêmio"),
  numero_valor: moedaBrlSchema("valor do número"),
  quantidade: quantidadeSchema,
  qtd_minima: qtdMinimaSchema,
  imagem_url: z
    .string({ error: "A URL da imagem deve ser um texto" })
    .refine(urlValida, "A URL da imagem é inválida")
    .optional(),
  data_prevista: dataPrevistaSchema.optional(),
});

/** Contrato de criação (RF-01) — mínima ≤ quantidade conferida no parse. */
export const CriarRifaInputSchema = CamposRifaSchema.superRefine(conferirQuantidadeMinima);

export type CriarRifaInput = z.infer<typeof CriarRifaInputSchema>;

/** RN-09: campos editáveis `aberta`; `quantidade` é reconferida quando presente. */
export const AtualizarRifaInputSchema =
  CamposRifaSchema.partial().superRefine(conferirQuantidadeMinima);

export type AtualizarRifaInput = z.infer<typeof AtualizarRifaInputSchema>;

/** Contrato de registrarVenda (SPEC §4.5) — `origem` é definida no servidor. */
export const VendaInputSchema = z.object({
  numeroId: z.uuid({ error: "O identificador do número é inválido" }),
  nome: z
    .string({ error: "Informe o nome do comprador" })
    .min(2, "O nome deve ter no mínimo 2 caracteres")
    .max(120, "O nome deve ter no máximo 120 caracteres"),
  telefone: TelefoneE164Schema,
});

export type VendaInput = z.infer<typeof VendaInputSchema>;

/** Perfil do organizador (SPEC §4.17) — gravado em `perfis` por `salvarPerfil`. */
export const PerfilInputSchema = z.object({
  nomeExibicao: z
    .string({ error: "Informe o nome de exibição" })
    .min(2, "O nome de exibição deve ter no mínimo 2 caracteres")
    .max(120, "O nome de exibição deve ter no máximo 120 caracteres"),
  whatsapp: TelefoneE164Schema,
});

export type PerfilInput = z.infer<typeof PerfilInputSchema>;

/** Snapshot do sorteio vigente consumido por T3/T5 (SPEC §4.9 e §4.10). */
export const ResultadoSorteioSchema = z.object({
  rifaId: z.uuid({ error: "O identificador da rifa é inválido" }),
  numero: z
    .number({ error: "O número sorteado deve ser um inteiro" })
    .int()
    .min(1, "O número sorteado deve estar entre 1 e 5000")
    .max(5000, "O número sorteado deve estar entre 1 e 5000"),
  nomeVencedor: z
    .string({ error: "Informe o nome do vencedor" })
    .min(2, "O nome do vencedor deve ter no mínimo 2 caracteres")
    .max(120, "O nome do vencedor deve ter no máximo 120 caracteres"),
  telefoneVencedor: TelefoneE164Schema,
  totalVendidos: z
    .number({ error: "O total de vendidos deve ser um inteiro" })
    .int()
    .min(1, "O total de vendidos deve ser ao menos 1"),
  sorteadoEm: z.string({ error: "Informe a data/hora do sorteio" }),
  anuladoEm: z.string({ error: "Data de anulação inválida" }).nullable().optional(),
});

export type ResultadoSorteio = z.infer<typeof ResultadoSorteioSchema>;
