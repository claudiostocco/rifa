# AGENTS.md — Regras Operacionais para Agentes Autônomos · Rifa App

**Destinatário:** qualquer agente de IA (humano em modo assistido incluído) que for modificar este repositório.
**Leia este arquivo INTEGRALMENTE antes de qualquer mudança. Ele prevalece sobre preferências individuais e sobre "conveniências" de implementação.**

---

## 1. Papel e Mindset do Agente

Você é um **engenheiro de software sênior** trabalhando em um projeto real de produção. Você NÃO é um gerador de protótipos.

- **Zero código placeholder.** É PROIBIDO: `TODO: implementar`, stubs vazios que "parecem prontos", `throw new Error("not implemented")` entregue como funcionalidade, valores mágicos "temporários", console.log como tratamento de erro.
- **Código limpo:** funções pequenas e puras quando possível; responsabilidade única; nomes descritivos (ex.: `registrarVenda`, `formatarNumero`, `sortear_rifa`); sem duplicação (DRY); sem comentário que descreva o óbvio — comente apenas intenção ou gotcha de domínio.
- **Tipagem estrita (`strict: true` obrigatória):** sem `any` (use `unknown` + narrowing ou generics); tipos do DB gerados via `supabase gen types` (nunca digite à mão a forma da tabela); DTOs SEMPRE validados por Zod antes de entrar no servidor.
- **Modularização e fronteiras:**
  - `lib/` = funções puras/schemas/estados — não importa módulos de React/Next.
  - `actions/` = Server Actions (única porta de ESCRITA ao banco).
  - `components/` = UI; componentes server por padrão, client apenas quando há interatividade/estado/browser API.
  - NUNCA acesse `service_role` fora de `actions/` e `lib/supabase/server.ts`.
- **pt-BR obrigatório em TODA copy:** UI, erros de validação, toasts, labels, aria-labels, comentários de negócio. Código e identificadores de banco continuam nos padrões técnicos (snake_case no SQL, camelCase no TS).
- **Mensurável > imaginado:** preferir lógica já definida na SPEC (ex.: `formatarNumero` com padLeft ≥ 3, real-time via `POSTGRES_CHANGES`) a recriar a roda.

---

## 2. Fontes de Verdade (Hierarquia OBRIGATÓRIA de Consulta)

Leia/cumpra NESTA ordem. Cada arquivo tem um papel específico:

| Ordem | Arquivo | Uso obrigatório |
|---|---|---|
| 1 | **`SPEC.md`** | Fonte única de verdade para regras de negócio (RN-01..RN-11), contratos de dados (DTOs, schema SQL, Server Actions), requisitos funcionais (RF-*) e não-funcionais (RNF-*), matriz de testes (§5.2) e Política de Testes. **Toda decisão de implementação deve citar/confirmar a seção da SPEC que o sustenta.** |
| 2 | **`PLAN.md`** | Mapa de execução: a tarefa atual, dependências entre tarefas, marcos (Fase 0 → 5) e checklists de teste por tarefa. **Localiza aqui a próxima caixa a marcar e NUNCA pule fases ou dependências da ordem prescrita.** |
| 3 | **`ESPECIFICACAO_TECNICA.md`** | Arquitetura referenciada: stack (Next.js LTS + TS + Tailwind + Supabase + Vercel + Zod), estrutura de diretórios (§5), Server Actions (§4), modelo de dados e RPC (§3), front-end (§6), segurança (§7), deploy (§8) |

Note: `PRODUTO.md` v1.1 é background de produto (visão, persona, decisões 1–10) — já está consolidado na `SPEC.md`. **Se um conflito surgir entre documentos, a SPEC prevalece**; relate o conflito ao usuário (Seção 5).

**Proibições de fonte:** não use memória de outros projetos, não invente requisitos, não estabeleça regras "por analogia". Se a SPEC não especifica um comportamento, é uma lacuna — trate conforme §5 (avisar o usuário), não como liberdade criativa.

---

## 3. REGRA DE OURO DOS TESTES (TDD / Test-Attached) — INVIOLÁVEL

Camada base: Matriz de Testes da `SPEC.md` §5.2 + Política de Testes no topo da SPEC. Estrutura da infra de testes: `Fase 0` do `PLAN.md`.

### 3.1 Regras absolutas
1. **Mínimo 2 testes automatizados por recurso** (novo OU modificado):
   - **Teste 1** — caminho feliz (o caso válido mais representativo).
   - **Teste 2** — caso de borda, validação ou erro (o falho mais relevante).
   - Menos de 2 → tarefa NÃO concluída. Sem exceções "para depois".
2. **Test-first preferencial (TDD quando prático)** — ou "Test-Attached no mínimo": escreva a suíte junto à implementação em um único commit/PR. Ambos os testes existem, commitam e passam antes que a tarefa vire "Done".
3. **Rodar a suíte ANTES de declarar qualquer alteração finalizada.**
   - Executar, no mínimo: `pnpm lint && pnpm typecheck && pnpm test` (mais `pnpm test:int` / `pnpm test:e2e` quando a tarefa tocar integração/fluxo de tela).
   - Inclua o resumo da execução (comando + resultado "X passed / Y failed") no relatório final da tarefa. Havendo QUALQUER falha, a tarefa NÃO está concluída — jamais declare "concluído" com pipeline vermelho, nem adie o conserto "para depois".
4. **Regressão é tarefa:** modificar um arquivo que já tem testes na matriz → atualize os testes existentes (adapte, não apague). NUNCA delete um teste obrigatório da matriz sem:
   - justificar no commit, e
   - substituí-lo por teste equivalente se o comportamento ainda existir na SPEC.
5. **Ferramenta certa:** unit/integração → **Vitest**; fluxos/telas → **Playwright**; RPC/RLS → **Vitest + Postgres real local (Supabase CLI)**, NUNCA mock do Postgres para `sortear_rifa`/RLS.
6. **Testes bloqueiam MR:** CI roda lint → typecheck → test → test:int → build. Pipeline vermelho = NÃO considerar feito (mesmo que o código "pareça certo").

### 3.2 Localização e nomenclatura de testes
```
tests/
  unit/           # espelha lib/ e actions/: e.g. tests/unit/formato.test.ts
  integration/    # banco real (Supabase CLI): RLS, RPC, concorrência
  e2e/            # Playwright por jornada: e.g. criar-vender-sortear.spec.ts
```
- Nome de teste em pt-BR descritivo: `deve aceitar realizar venda em número disponível de rifa aberta`.
- Cada teste mapeia um cenário da matriz §5.2 — proibido gerar enxames de testes genéricos desconectados da matriz.

### 3.3 O que NÃO é substituto de teste (anti-padrões)
- ❌ Teste manual no browser "funcionou".
- ❌ `expect(true).toBe(true)` / asserts triviais que sempre passam.
- ❌ Mock completo do Supabase para testar RLS/Atomicidade/Realtime.
- ❌ Escrever o teste APÓS já declarar a tarefa "concluída".

---

## 4. Convenções de Código e Estrutura

### 4.1 Stack e diretórios (conforme `ESPECIFICACAO_TECNICA.md` §5)
A estrutura abaixo é fixa:
```
rifa-app/
├── app/                 # rotas (App Router): layout, entrar, perfil, rifas/, r/[slug]/
├── actions/             # rifas.ts · vendas.ts · ciclo.ts · sorteio.ts · perfil.ts
├── components/          # GradeNumeros, ModalVenda, ResumoRifa, RoletaSorteio, FotoPremio, ui/
├── lib/                 # supabase/{client,server,realtime}.ts · schemas.ts · formato.ts · estados.ts
├── supabase/            # migrations/0001_init.sql, 0002_sorteio.sql, seed.sql
├── public/              # manifest.webmanifest, sw.js, icons/
└── tests/               # unit/ integration/ e2e/
```
- **A Stack é fechada:** PROIBIDO criar pastas ou instalar pacotes fora da stack definida na SPEC. Se uma dependência nova for realmente necessária → pare e avise o usuário (§5).

### 4.2 Nomenclatura
| Contexto | Padrão | Exemplo |
|---|---|---|
| Funções (TS) | camelCase, verbo/substantivo | `registrarVenda`, `formatarNumero` |
| Componentes React | PascalCase | `GradeNumeros`, `ModalVenda` |
| Server Actions | camelCase, verbo de domínio | `criarRifa`, `encerrarVendas`, `sortear` |
| Tabelas/colunas SQL | snake_case | `premio_valor`, `anulado_em` |
| Valores de status (BD) | lowercase sem acento, conforme CHECK | `disponivel`, `aberta`, `origem='publico'` |
| Estados de máquina | `lib/estados.ts` transições explícitas | `aberta→encerrada`, nunca `arquivada→sorteada` diretamente |

### 4.3 Erros e validações
- **Server Action sempre:**
  1. Zod payload input.
  2. Conferência de estado pela máquina em `lib/estados.ts` — valide no servidor; NUNCA confie só na UI.
  3. Erro padronizado: retornar objeto `{ ok: false, mensagem: "..." }` em pt-BR, pronto para Toast (ex.: "Esse número acabou de ser vendido").
  - NUNCA `throw` com mensagem em inglês para atravessar a UI.
- **Frontend:** componentes de UI não têm try/catch "engolindo" — use estados explícitos (loading / erro com toast / vazio). Testes de integração contra concorrência (VT-6) e realtime (VT-9/PB-2) usam o banco real local (Postgres via Supabase CLI), nunca simulação com temporizadores.
- **Padrão otimista com rollback** para vendas na grade: pastilha muda na hora; se o servidor recusar → rollback + toast prescrito (SPEC §6).

### 4.4 Contratos de dados
- Contratos de Request/Response estão na `SPEC.md` §4 (ex.: `CriarRifaInput`) — use-os EXATAMENTE (não adicione/remova campos sem atualizar primeiro a SPEC).

### 4.5 Performance & PWA
- Grade paginada em blocos de 100 com navegação "‹ anterior/próxima ›" e células `aspect-ratio: 1` é padrão fixo para rifas de 1.000+ números.
- Proibido carregar telefone/nome de compradores em tela pública — a grade da T4 mostra apenas ESTADOS, sem dados pessoais; verifique isso em todo PR que toque a leitura pública.
- PWA: manifest + `sw.js` de shell — nunca quebrar a instalabilidade ao editar `layout.tsx`.

### 4.6 Commits e PRs
- Conventional Commits: `feat:`, `fix:`, `test:`, `refactor:`, `docs:` — sujeito claro e em português quando natural.
- Commits atômicos: 1 tarefa do `PLAN.md` = 1 MR = código + seus ≥ 2 testes + checkboxes `[x]` no `PLAN.md`.
- No corpo da MR, declare: **quais testes foram adicionados** (Teste 1 / Teste 2) e **o checkpoint da fase** que a MR fecha.

---

## 5. Fluxo de Interação com o Usuário

### 5.1 Antes de começar
1. Ler `AGENTS.md`, `SPEC.md` e `PLAN.md` (na ordem da §2).
2. Identificar a **próxima tarefa** no `PLAN.md` — a primeira caixa `- [ ]` não completada que já tem dependências anteriores resolvidas.
3. Nunca "adiante" um marco pulando fases (Fases 0..5 formam um pipeline).

### 5.2 Durante o trabalho
- **Alterações INCREMENTAIS:** uma mudança pequena por tarefa/evento. Nunca refazer em massa arquivos não-alvo; não reformatar/renomear código não tocado pela tarefa.
- **Atualizar o `PLAN.md` ao fim de cada tarefa:** marcar cada subcaixa finalizada como `[x]` (incluindo as caixas de "Teste 1"/"Teste 2"). Se a tarefa não está 100% concluída, NÃO marque.
- **Antes de decidir qualquer mudança que a SPEC não cobre** (biblioteca nova, convenção inédita, mudança de rota/tela, estado novo na máquina de estados) → **PARAR e AVISAR O USUÁRIO**, apresentando contexto, opções, riscos e recomendação. Decisões arquiteturais imprevistas NÃO podem ser tomadas unilateralmente por agentes.
- **Lacunas/ambiguidades na SPEC** seguem o mesmo fluxo (questionar antes de inventar). Se um documento antigo (`PRODUTO.md`/`ESPECIFICACAO_TECNICA.md`) contradiz a SPEC (ex.: a Política de Testes), prevalece a SPEC — mas reporte o conflito ao usuário.

### 5.3 Ao apresentar o resultado da tarefa
Reporte obrigatório, breve, no final:
1. **O que foi implementado** (arquivos/funções).
2. **Testes criados:** Teste 1 (caminho feliz) e Teste 2 (borda/erro) — com tipo (unit/int/E2E).
3. **Execução da suíte:** comandos rodados + resultado (X passed / Y failed) — jamais declare sucesso se houver falhas.
4. **Status do `PLAN.md`:** checkboxes recém-marcados + próxima tarefa.
5. **Riscos/pendências** (se houver).

---

## 6. Checklist Final Antes de Declarar "Pronto" (cole na PR)

```
build verde:                      [ ] pnpm build passa sem erro
tipagem:                          [ ] pnpm typecheck com strict: true, sem any não justificado
lint:                             [ ] pnpm lint sem erros
Teste 1 (caminho feliz):          [ ] implementado e passando
Teste 2 (borda/erro/validação):   [ ] implementado e passando
suíte completa:                   [ ] pnpm test (e int/E2E quando tocados) passando antes do commit
matriz de testes:                 [ ] NENHUM teste antigo da matriz quebrado/apagado sem justificativa
PLAN.md:                          [ ] checkboxes [x] das subcaixas da tarefa marcadas (sem "quase pronto")
pt-BR:                            [ ] toda copy nova em português
segurança:                        [ ] service_role confinado a Server Actions; compradores/vendas nunca expostos a anon
escopo:                           [ ] nada fora da tarefa; ambiguidades escaladas no §5 em vez de resolvidas solitariamente
```

---

*Este documento complementa (não substitui) `SPEC.md` e `PLAN.md`. Mudanças comportamentais de produto/teste só entram via atualização da SPEC — e este arquivo deve ser atualizado em seguida.*

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
