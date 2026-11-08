# Rifa App · Controle de rifas e sorteio com transparência

Aplicação para **criar, gerenciar e sortear rifas** — organização das vendas, grade de 001..N por link público e sorteio criptográfico entre os números vendidos.

**Fontes de verdade do projeto:** `SPEC.md` (regras de negócio) · `PLAN.md` (plano de execução) · `AGENTS.md` (regras operacionais para agentes).

## Stack

Next.js 16 (App Router, RSC) · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres + Auth + Storage + Realtime, planos gratuitos) · Zod · Vitest · Playwright.

## Ambiente de desenvolvimento

Requisitos: Node 22 LTS · pnpm 10 · Docker (para o Supabase local) · Supabase CLI.

```bash
# 0) dependências do projeto
pnpm install

# 1) variáveis de ambiente do projeto (crave as chaves do painel do Supabase)
cp .local.env .env.local   # ou crie manualmente com NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY

# 2) Postgres real local (aplica as migrations de supabase/migrations/)
supabase start

# 3) desenvolvimento
pnpm dev
```

> O projeto usa prefixo local de binários (Node 22 em `~/.local/opt/node22`, pnpm via `~/.npm-global/bin`) no ambiente de sandbox. Em máquina com Node 22 no PATH, os comandos rodam direto.

## Qualidade e testes (obrigatórios antes de todo commit pipelinelocked no CI)

| Comando | O que roda |
|---|---|
| `pnpm lint` / `pnpm typecheck` | ESLint (config Next) · `tsc --noEmit` com strict |
| `pnpm test` | Vitest — testes unitários (`tests/unit/**`) |
| `pnpm test:int` | Vitest — integração com **Postgres real** local (`tests/integration/**`); exige `supabase start` antes |
| `pnpm test:e2e` | Playwright — projetos `celular-360px` e `desktop`, servidor dev na porta 3100 |
| `pnpm build` | build de produção |

**Política de testes (AGENTS.md/SPEC §5.2):** cada funcionalidade entra com **≥ 2 testes** (1 caminho feliz + 1 erro/borda). Integração usa Postgres real local — **nunca** mockar Postgres/RLS.

## Banco de dados

```bash
pnpm db:start     # sobe o stack Supabase local e aplica as migrations
pnpm db:reset     # reset com reaplicação das migrations
pnpm db:types     # regenera lib/supabase/database.types.ts (após mudança de schema)
```

Migrations em `supabase/migrations/`:

- `001_initial_schema.sql` — tabelas (`perfis`, `rifas`, `numeros`, `compradores`, `vendas`, `sorteios`), índices, CHECKs e políticas RLS (SPEC §2.3/§2.4) + bucket `premios`.

## Estrutura (SPEC §2.6)

```
app/        rotas (App Router) · components/  UI (ui = design system base)
actions/    Server Actions (única porta de escrita, Fases 1-3)
lib/        clients supabase (SSR), schemas, formato e estados
supabase/   migrations · config local
tests/      unit/ · integration/ · e2e/
```

## Segurança (resumo)

- **Leitura pública** via `anon` + RLS — nunca expõe `compradores`/`vendas`.
- **Escrita** apenas em Server Actions no servidor, validada com Zod.
- `service_role` confinado a `lib/supabase/server.ts` (client administrador), testado para não vazar ao browser.
