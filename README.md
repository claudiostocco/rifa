# Rifa App · Controle de rifas e sorteio com transparência

Aplicação para **criar, gerenciar e sortear rifas** — organização das vendas, grade de 001..N por link público e sorteio criptográfico entre os números vendidos.

**Fontes de verdade do projeto:** `SPEC.md` (regras de negócio) · `PLAN.md` (plano de execução) · `AGENTS.md` (regras operacionais para agentes).

## Stack

Next.js 16 (App Router, RSC) · TypeScript strict · Tailwind CSS v4 · Supabase (Postgres + Auth + Storage + Realtime, planos gratuitos) · Zod · Vitest · Playwright.

## Ambiente de desenvolvimento

Requisitos: Node 22 LTS · pnpm 10 · Docker (para o Supabase local) · Supabase CLI.

```bash
# 1) dependências do projeto
pnpm install

# 2) variáveis locais (nunca versione este arquivo)
cp .local.env .env.local   # use as chaves do projeto Supabase escolhido

# 3) Postgres local (aplica as migrations)
supabase start

# 4) aplicação
pnpm dev
```

O `.env.local` deve conter `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. A chave `service_role` é somente de servidor: não a publique, não a use no browser e não a coloque em `NEXT_PUBLIC_*`.

### Primeiro acesso do organizador (sem cadastro público)

O cadastro público fica desativado (`enable_signup = false`). A conta deve ser criada manualmente por uma pessoa administradora:

1. Abra **Supabase Dashboard → Authentication → Users → Add user**.
2. Informe e-mail e senha e marque **Auto Confirm User**. Em desenvolvimento local, use o Studio em `http://127.0.0.1:54323`.
3. Configure as variáveis do app apontando para o mesmo projeto e execute `pnpm dev`.
4. Entre em `/entrar` com a conta criada.
5. No primeiro acesso, abra `/perfil` e salve nome de exibição e WhatsApp. Esse contato aparece no rodapé do link público.
6. Em `/rifas/nova`, preencha prêmio, valores, quantidade e quantidade mínima. Após criar, copie o link `/r/{slug}` para os consultores.

Nunca habilite **Allow new users to sign up** em produção. Para criar outra conta, repita o provisionamento pelo painel administrativo; o visitante usa somente o link público.

## Qualidade e testes (obrigatórios antes de todo commit pipelinelocked no CI)

| Comando                        | O que roda                                                                                                                                                                                                              |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm lint` / `pnpm typecheck` | ESLint (config Next) · `tsc --noEmit` com strict                                                                                                                                                                        |
| `pnpm test`                    | Vitest — testes unitários (`tests/unit/**`)                                                                                                                                                                             |
| `pnpm test:int`                | Vitest — integração com **Postgres real** local (`tests/integration/**`); exige `supabase start` antes                                                                                                                  |
| `pnpm test:e2e`                | Playwright — projetos `celular-360px` e `desktop`, servidor dev na porta 3100; **exige `supabase start`** (o webServer injeta as credenciais do stack local e os E2Es de login provisionam o organizador via API admin) |
| `pnpm build`                   | build de produção                                                                                                                                                                                                       |

**Política de testes (AGENTS.md/SPEC §5.2):** cada funcionalidade entra com **≥ 2 testes** (1 caminho feliz + 1 erro/borda). Integração usa Postgres real local — **nunca** mockar Postgres/RLS.

## Banco de dados

```bash
pnpm db:start     # sobe o stack Supabase local e aplica as migrations
pnpm db:reset     # reset com reaplicação das migrations
pnpm db:types     # regenera lib/supabase/database.types.ts (após mudança de schema)
```

Migrations em `supabase/migrations/`:

- `001_initial_schema.sql` — tabelas (`perfis`, `rifas`, `numeros`, `compradores`, `vendas`, `sorteios`), índices, CHECKs e políticas RLS (SPEC §2.3/§2.4) + bucket `premios`.
- `002_sorteio.sql` a `008_rls_resultado_vigente.sql` — RPCs, concorrência, Realtime, rate limit e políticas complementares.

#### Seed de demonstração local

O seed está desativado no `supabase/config.toml` de propósito (`[db.seed].enabled = false`). Assim, `supabase db reset` não injeta dados automaticamente e um `supabase db push` nunca deve levar dados de demonstração para produção.

Para usar o seed, primeiro crie no Supabase local a conta `organizador@rifa.local` pelo Studio. Depois execute-o de forma explícita, em uma única sessão PostgreSQL:

```bash
supabase db reset
{
  printf "SET rifa.seed_environment = 'local';\n"
  printf "\\i supabase/seed.sql\n"
} | psql "$(supabase status -o env | sed -n 's/^DB_URL="\(.*\)"/\1/p')" \
  -v ON_ERROR_STOP=1
```

O seed só insere a rifa `rifa-demo-local` quando a sessão possui `rifa.seed_environment=local`; sem essa guarda ele apenas emite um aviso. Ele nunca deve ser executado contra a URL do projeto hospedado. Para limpar o ambiente local, use `pnpm db:reset`.

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

## Checklist operacional antes de publicar

- [ ] `pnpm lint && pnpm typecheck && pnpm test`
- [ ] `pnpm test:int` com o Supabase local ativo
- [ ] `pnpm build`
- [ ] Variáveis de produção conferidas na Vercel; `SUPABASE_SERVICE_ROLE_KEY` não possui prefixo `NEXT_PUBLIC_`
- [ ] Cadastro público desativado no Supabase Auth
- [ ] Migrações aplicadas com `supabase db push --linked`; não executar `supabase/seed.sql` em produção
- [ ] Uma conta de organizador criada manualmente e o perfil preenchido em `/perfil`
- [ ] Uma rifa temporária arquivada após validar `/r/{slug}` e `/r/{slug}/resultado`
- [ ] Backup do banco e exportação do Storage verificados conforme PL-7
