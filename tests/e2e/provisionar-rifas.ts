/**
 * FD-12 · Provisionamento de rifas para os testes E2E da T1.
 *
 * A T2 (FD-13) ainda não existe, então "criar rifa" no E2E da Fase 1 usa a
 * via administrativa do stack local (`supabase status`) — mesmo padrão de
 * `provisionar-organizador.ts`. A service_role vive apenas no processo do
 * Playwright; nunca no bundle do app (SPEC §2.2).
 *
 * Cada rifa recebe um sufixo aleatório no título/slug: os workers rodam em
 * paralelo (fullyParallel) e re-execuções acumulam linhas — os títulos
 * únicos mantêm as asserções determinísticas sem depender de reset.
 */
import { randomBytes } from "node:crypto";

import { createClient } from "@supabase/supabase-js";

import { CREDENCIAIS_ORGANIZADOR, lerStatusLocal } from "./provisionar-organizador";
import type { Database } from "@/lib/supabase/database.types";

export type RifaDeTeste = { id: string; slug: string; titulo: string };

type OpcoesRifaDeTeste = {
  /** Título base; um sufixo único é acrescentado para execução paralela. */
  titulo: string;
  status?: "aberta" | "encerrada" | "sorteada";
  /** Arquivada some da listagem T1 (RF-03) — cenário do Teste 2. */
  arquivada?: boolean;
  /** Quantidade de números 1..N marcados `vendido` (progresso da barra). */
  vendidos?: number;
  quantidade?: number;
  /**
   * Registra 1 venda real (comprador + linha em `vendas`): com QUALQUER venda
   * a quantidade fica travada na edição (RN-09 — cenário do FD-13 Teste 2).
   */
  comVenda?: boolean;
};

function clienteAdmin() {
  const { url, serviceRole } = lerStatusLocal();
  return createClient<Database>(url, serviceRole, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Rifas criadas nesta execução do worker: cada processo Playwright registra
 * os ids que criou e o `afterAll` da spec os remove — a base local volta ao
 * estado íntegro exigido pelo ET-7/bootstrap (o `pnpm test:int` conta com
 * ela limpa; o DELETE em cascata leva os `numeros` junto, migração 001).
 */
const rifasCriadas: string[] = [];

/** Remove do stack local todas as rifas de teste criadas por este worker. */
export async function limparRifasDeTeste(): Promise<void> {
  if (rifasCriadas.length === 0) return;

  const admin = clienteAdmin();
  await admin.from("rifas").delete().in("id", rifasCriadas);
  rifasCriadas.length = 0;
}

/**
 * Registra para limpeza uma rifa criada PELA UI (fluxo real da `criarRifa`,
 * FD-13) e não por este módulo — o `afterAll` da spec leva a base local de
 * volta ao estado íntegro exigido pelo ET-7 (o DELETE em cascata leva numeros
 * e o histórico de vendas/compradores junto, migração 001).
 */
export function registrarRifaParaLimpeza(id: string): void {
  rifasCriadas.push(id);
}

/**
 * Cria uma rifa completa (linha + numeração 1..N, RF-02) para o organizador
 * de teste, no formato que a `criarRifa` (FD-10) gravaria.
 */
export async function criarRifaDeTeste({
  titulo,
  status = "aberta",
  arquivada = false,
  vendidos = 0,
  quantidade = 100,
  comVenda = false,
}: OpcoesRifaDeTeste): Promise<RifaDeTeste> {
  const admin = clienteAdmin();

  const { data: listagem } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const usuario = listagem?.users.find(
    (candidato) => candidato.email === CREDENCIAIS_ORGANIZADOR.email,
  );
  if (!usuario) {
    throw new Error(
      `Organizador ${CREDENCIAIS_ORGANIZADOR.email} não encontrado — chame provisionarOrganizador() no beforeAll.`,
    );
  }

  const sufixo = randomBytes(2).toString("hex");
  const tituloUnico = `${titulo} ${sufixo}`;
  const slug = `${titulo.toLowerCase().replace(/\s+/g, "-")}-${sufixo}`;

  const { data: rifa, error: erroRifa } = await admin
    .from("rifas")
    .insert({
      perfil_id: usuario.id,
      titulo: tituloUnico,
      premio_descricao: "Forno elétrico",
      premio_rotulo: "estimado",
      premio_valor: 850,
      numero_valor: 10,
      quantidade,
      qtd_minima: 30,
      slug,
      status,
      arquivada,
    })
    .select("id, slug, titulo")
    .single();
  if (erroRifa || !rifa) {
    throw new Error(`Falha ao criar rifa de teste: ${JSON.stringify(erroRifa)}`);
  }

  const numeros = Array.from({ length: quantidade }, (_, indice) => ({
    rifa_id: rifa.id,
    numero: indice + 1,
  }));
  const { error: erroNumeros } = await admin.from("numeros").insert(numeros);
  if (erroNumeros) {
    throw new Error(`Falha ao criar números de teste: ${JSON.stringify(erroNumeros)}`);
  }

  if (vendidos > 0) {
    const { error: erroVendas } = await admin
      .from("numeros")
      .update({ status: "vendido" })
      .eq("rifa_id", rifa.id)
      .lte("numero", vendidos);
    if (erroVendas) {
      throw new Error(`Falha ao marcar vendidos de teste: ${JSON.stringify(erroVendas)}`);
    }
  }

  if (comVenda) {
    const { data: numero, error: erroNumero } = await admin
      .from("numeros")
      .select("id")
      .eq("rifa_id", rifa.id)
      .eq("numero", 1)
      .single();
    if (erroNumero || !numero) {
      throw new Error(`Falha ao buscar número 1 de teste: ${JSON.stringify(erroNumero)}`);
    }

    const { data: comprador, error: erroComprador } = await admin
      .from("compradores")
      .insert({ rifa_id: rifa.id, nome: "Maria Silva", telefone: "+5511988887777" })
      .select("id")
      .single();
    if (erroComprador || !comprador) {
      throw new Error(`Falha ao criar comprador de teste: ${JSON.stringify(erroComprador)}`);
    }

    const { error: erroVenda } = await admin.from("vendas").insert({
      numero_id: numero.id,
      comprador_id: comprador.id,
      origem: "organizador",
    });
    if (erroVenda) {
      throw new Error(`Falha ao criar venda de teste: ${JSON.stringify(erroVenda)}`);
    }
  }

  rifasCriadas.push(rifa.id);
  return rifa;
}

/** Credenciais fixas do organizador SEM rifas (cenário do empty state). */
export const CREDENCIAIS_SEM_RIFAS = {
  email: "organizador-vazio@rifa.test",
  senha: "organizador-vazio-2026",
} as const;

/**
 * Segundo organizador, nunca usado pelas seeds de rifa: garante a listagem
 * vazia mesmo com re-execuções que acumulam rifas do organizador principal.
 * Idempotência com a mesma verificação de existência de `provisionarOrganizador`.
 */
export async function provisionarOrganizadorSemRifas(): Promise<void> {
  const admin = clienteAdmin();

  const existe = async (): Promise<boolean> => {
    const { data } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
    return data?.users.some((usuario) => usuario.email === CREDENCIAIS_SEM_RIFAS.email) ?? false;
  };

  if (await existe()) return;

  await admin.auth.admin.createUser({
    email: CREDENCIAIS_SEM_RIFAS.email,
    password: CREDENCIAIS_SEM_RIFAS.senha,
    email_confirm: true,
  });

  if (!(await existe())) {
    throw new Error(
      `Organizador ${CREDENCIAIS_SEM_RIFAS.email} não ficou disponível no stack local.`,
    );
  }
}
