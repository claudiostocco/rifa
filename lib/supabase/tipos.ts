/**
 * FD-4 · Helpers de tipagem do banco (SPEC §5.1 — Política de Tipagem)
 *
 * TODOS os tipos derivam EXCLUSIVAMENTE do artefato gerado por
 * `supabase gen types` (`pnpm db:types` em `database.types.ts`).
 * É proibido digitar à mão a forma de qualquer tabela aqui — se o schema
 * mudar, rode `pnpm db:types`; qualquer divergência estoura no `typecheck`
 * (objetivo "typecheck passa usando somente os tipos gerados", FD-4).
 */
import type { Database } from "@/lib/supabase/database.types";

export type TabelasPublicas = Database["public"]["Tables"];

export type PerfilRow = TabelasPublicas["perfis"]["Row"];
export type RifaRow = TabelasPublicas["rifas"]["Row"];
export type NumeroRow = TabelasPublicas["numeros"]["Row"];
export type CompradorRow = TabelasPublicas["compradores"]["Row"];
export type VendaRow = TabelasPublicas["vendas"]["Row"];
export type SorteioRow = TabelasPublicas["sorteios"]["Row"];

/** Escritas via service_role nas Server Actions (`criarRifa`/`editarRifa`, FD-10/FD-11). */
export type RifaInsert = TabelasPublicas["rifas"]["Insert"];
export type RifaUpdate = TabelasPublicas["rifas"]["Update"];

/** Assinatura da RPC transacional do sorteio (`actions/sorteio.ts`, FD-3/SR-3). */
export type SortearRifaArgs = Database["public"]["Functions"]["sortear_rifa"]["Args"];
