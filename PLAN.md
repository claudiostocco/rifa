# PLAN.md — Plano de Ação · Rifa App

**Versão:** 1.2 — Data: 11/11/2026
**Fontes de verdade:** `SPEC.md` (documento principal) · `PRODUTO.md` v1.1 · `ESPECIFICACAO_TECNICA.md` v1.1
**Finalidade:** plano de ação passo a passo, do zero à entrega, para a equipe e agentes autônomos de código. As tarefas seguem a ordem de dependência; dentro de cada fase, execute na sequência listada.

---

## ⚠️ REGRA ESTRITA DE TESTES (vale para TODA tarefa abaixo)

> 1. Nenhuma funcionalidade é "Done" sem testes automatizados **criados, commitados e verdes no CI**.
> 2. Para cada tarefa/funcionalidade há **no mínimo 2 testes obrigatórios**: **Teste 1** (caminho feliz) e **Teste 2** (erro/validação/borda). Testes extras são bem-vindos; menos de 2, nunca.
> 3. Os cenários vêm diretamente da Matriz de Testes da `SPEC.md` §5.2 — reutilize a mesma terminologia nos títulos dos testes.
> 4. Um pull request que entrega testes sem a funcionalidade (ou vice-versa) **não completa** a tarefa.

**Prefixos de ID:** `ET-` (setup) · `FD-` (fundação) · `VT-` (vendas/gestão) · `SR-` (sorteio/ciclo) · `PB-` (público/foto/PWA) · `PL-` (polimento/deploy).

---

## Fase 0 · Setup & Boilerplate (meta: ambiente rodando "olá, mundo" + runners de teste verdes)

- [x] **ET-1 · Criar projeto Next.js + TypeScript (App Router)**
  - [x] Rodar `create-next-app` com TypeScript, App Router e Tailwind
  - [x] `tsconfig.json` com `strict: true` (tipagem estrita obrigatória)
  - [x] Página inicial mínima renderizando sem erros
- [x] **ET-2 · Tooling de qualidade**
  - [x] ESLint (config Next) + Prettier
  - [x] Scripts no `package.json`: `dev`, `build`, `lint`, `typecheck`, `test`, `test:int`, `test:e2e`
  - [x] Verificar: lint e typecheck passam no código recém-criado
- [x] **ET-3 · Provisionar Supabase (projeto gratuito) + Storage**
  - [x] Criar projeto; coletar `URL`, `anon key`, `service_role key` (.local.env/.env.local)
  - [x] Criar bucket `premios` (criado pela migração 001; aplicado no projeto cloud no primeiro `db push`)
  - [x] Instalar `@supabase/ssr` e `@supabase/supabase-js`
- [x] **ET-4 · Bootstrap dos clients Supabase** (`lib/supabase/client.ts` · `server.ts` · `realtime.ts`)
  - [x] Teste 1 (int): client anon no browser executa um SELECT trivial com sucesso
  - [x] Teste 2 (unit): chave `service_role` jamais acessível no bundle do browser (assert de variáveis de ambiente restritas ao servidor)
- [x] **ET-5 · Runner de testes unitários/integração (Vitest)**
  - [x] Instalar Vitest; configurar paths de `tests/unit/**` e `tests/integration/**`
  - [x] Teste 1 (smoke): suíte roda e encontra 1 teste passando
  - [x] Teste 2 (smoke): teste propositalmente falhante faz `pnpm test` falhar (prova de que o CI honra falhas — verificado e removido após comprovação)
- [x] **ET-6 · Runner E2E (Playwright)**
  - [x] Instalar Playwright; config com `baseURL` local, 1 projeto mobile 360px + 1 desktop
  - [x] Teste 1 (smoke): spec acessa a home e valida um conteúdo mínimo
  - [x] Teste 2 (smoke): spec propositalmente falha com seletor inexistente (verificado e removido após comprovação)
- [x] **ET-7 · Postgres real local (Supabase CLI) para integração**
  - [x] `supabase start` local; migrações aplicadas no ambiente de teste
  - [x] Documentar o comando `pnpm test:int` que sobe/reseta o banco local (README)
- [x] **ET-8 · CI (GitHub Actions)**
  - [x] Pipeline: lint → typecheck → test → test:int → build (.github/workflows/ci.yml) — *run #3 verde no push (commit c106574): setup-cli@v3 com CLI 3.0.0 fixado + `--ignore-health-check` + espera de prontidão; runs #1/#2 ficaram vermelhos quando o CI falhou (comprovado empíricamente)*
  - [x] Verificar: MR com lint ou teste falho fica vermelho (bloqueio ativo) — *comprovado empíricamente (PR #1, commit 519d64e): branch protection em `main` ativa via API (`Settings → Branches` equivalente) com required status check `CI / qualidade-e-testes` + `qualidade-e-testes`, `strict: true` e `enforce_admins: true`; teste propositalmente falhante deixou o check vermelho e o merge foi recusado pela API com HTTP 405 "Required status check expected — 1 failing". Teste-prova e branch removidos após a comprovação (mesma metodologia de ET-5/ET-6). MR verde segue liberada ao merge (validado via dry-run no PR do checkout final desta tarefa).*
- [x] **ET-9 · Shell base + esqueleto PWA**
  - [x] `app/layout.tsx`, `manifest.webmanifest`, ícones e `sw.js` leve
  - [x] `components/ui/` (Button, Input, Badge, Modal, Toast) estilizados com Tailwind
  - [x] Teste 1 (unit): Button/Input renderizam estados básicos (habilitado, desabilitado, foco)
  - [x] Teste 2 (unit): Toast exibe mensagem em pt-BR e desaparece após o timeout

**Checkpoint Fase 0:** build verde no CI, dois runners de teste operantes, Supabase conectado, design system básico presente. Só então avance.

---

## Fase 1 · Fundação & Modelos (marco M1 — banco, contratos, máquina de estados, autenticação)

### 1.1 Banco de dados

- [x] **FD-1 · Migração `0001_init.sql`** — tabelas (perfis, rifas, numeros, compradores, vendas, sorteios), índices e CHECKs conforme §2.4 da SPEC *(migração em `supabase/migrations/001_initial_schema.sql`, aplicada no stack local e no cloud)*
  - [x] Teste 1 (int): migração aplicada e INSERT válido em cada tabela (rifa com quantidade 25) funciona — *tests/integration/fd1-schema.test.ts: perfis via trigger OCR, rifas aberta, 25 números 1..N, comprador E.164, venda `organizador`, sorteio vigente*
  - [x] Teste 2 (int): CHECKs bloqueiam dados inválidos (quantidade 333, premio_valor ≤ 0, numero 5001, duplicidade em UNIQUE (rifa_id, numero)) — *código `23514` (CHECK) e `23505` (UNIQUE) asserido no Postgres real*
- [x] **FD-2 · Políticas RLS conforme §2.3 da SPEC** *(políticas já presentes na migração 001; cobertura de RLS entregue em `tests/integration/fd2-rls.test.ts` contra o Postgres real)*
  - [x] Teste 1 (int): `anon` faz SELECT em rifas publicadas e em numeros — *anon (sem sessão) lê a rifa aberta e os 25 estados 001..025; linha "RLS (transversal)" da matriz §5.2*
  - [x] Teste 2 (int): `anon` é NEGADO em SELECT de compradores/vendas e em todo INSERT/UPDATE (cobertura de bypass) — *SELECT de compradores/vendas com dados reais detrás do RLS devolve vazio; INSERT em rifas/numeros/compradores/vendas → `42501`; UPDATE em rifas/numeros é no-op com estado inalterado (semântica Postgres: RLS esconde a linha em vez de elevar erro)*
- [x] **FD-3 · Migração `0002_sorteio.sql`** — função RPC `sortear_rifa` (transacional: FOR UPDATE, ABORT `RIFA_ABERTA` / `RIFA_SEM_VENDIDOS`, COMMIT único) *(migração em `supabase/migrations/002_sorteio.sql`, aplicada no stack local; `security invoker` — via oficial é a Server Action com service_role; código extra `RIFA_JA_SORTEADA` para a RNF-06; aleatoriedade via pgcrypto `gen_random_bytes` (RNF-07); execution revogada de `public` e liberada a `authenticated`/`service_role`)*
  - [x] Implementar a função completa (os cenários avançados de sorteio seguem recebendo cobertura na Fase 3) — *trava FOR UPDATE + set de vendidos = 1 linha por número (auditável), grava sorteio e vira status em um COMMIT*
  - [x] Teste 1 (int): RPC em rifa encerrada com vendas → 1 registro em sorteios + status sorteada — *tests/integration/fd3-sorteio.test.ts: 1 sorteio vigente, vencedor ∈ vendidos, total_vendidos=3, comprador correto, encerrada→sorteada*
  - [x] Teste 2 (int): RPC em rifa aberta → erro RIFA_ABERTA; com 0 vendidos → RIFA_SEM_VENDIDOS; 2ª chamada sem anular falha — *códigos_assert no token da mensagem postgREST; transação inteira desfeita (estado inalterado em todas as negações; 2ª chamada → RIFA_JA_SORTEADA); função corrigida pela migração `003_correcoes.sql` (11/11/2026): byte alto sem máscara estourava o bigint com sinal → OFFSET negativo intermitente*
- [x] **FD-4 · Tipos do banco** — `supabase gen types` + helpers de tipagem *(artefato em `lib/supabase/database.types.ts` regenerado por `pnpm db:types` (inclui a RPC da FD-3); helpers estritamente derivados em `lib/supabase/tipos.ts` — `Row` das 6 tabelas, `Insert/Update` de rifas e assinatura de `sortear_rifa`; proibido digitar forma de tabela à mão)*
  - [x] Verificação: typecheck passa usando somente os tipos gerados do schema — *`pnpm typecheck` (strict) verde; provas type-level de identidade (`Igual`/`Esperar`) nos helpers e literal completo de `RifaRow` tipado no teste — divergência do schema quebra o CI*

### 1.2 Contratos e domínio (lib/)

- [x] **FD-5 · `lib/schemas.ts`** — DTOs Zod: `CriarRifaInput`, `AtualizarRifaInput`, `VendaInput`, `PerfilInput`, `ResultadoSorteio` *(Zod v4; `quantidade` conferida contra `TAMANHOS_RIFA` (decisão 3), moeda restrita a numeric(10,2) com ≤ 2 casas, E.164 compartilhado; `qtd_minima ≤ quantidade` conferida transversalmente em criar e editar; `origem` ficada no servidor — nunca no payload)*
  - [x] Teste 1 (unit): payload válido passa o parse (todos os rótulos de prêmio, quantidade 5000) — *tests/unit/schemas.test.ts: os 3 rótulos (`estimado`, `mais_de`, `ate`) parseados com quantidade 5000; parse adicional de VendaInput, PerfilInput, ResultadoSorteio e AtualizarRifaInput parciais*
  - [x] Teste 2 (unit): rejeita qtd_minima > quantidade, quantidade 333, telefone não-E.164, nome < 2 caracteres, título > 60, preço ≤ 0 — *7 casos negativos com caminho (`path`) e mensagem pt-BR asseridos individualmente*
- [x] **FD-6 · `lib/formato.ts`** — `formatarNumero` (padLeft ≥ 3), moeda BRL, telefone E.164 ↔ máscara, datas *(padLeft com domínio validado 1..5000 (CHECK do `numeros.numero`); BRL via `Intl` pt-BR; telefone brasileiro-only (DDI 55) em três direções: E.164→máscara, máscara→E.164 e oculto "(11) 9••••-••44" (RF-10); exibição de data/timestamp em testes determinística (fuso America/Sao_Paulo fixado — hosts UTC como o Vercel exibiriam horário errado)*
  - [x] Teste 1 (unit): (1)→"001", (37)→"037", (1200)→"1200"; 850 → "R$ 850,00"; "+5511988887777" ↔ "(11) 98888-7777" — *tests/unit/formato.test.ts: incluindo ciclo fechado de ida e volta (máscara → E.164 → máscara), pré/Sufixos de moeda (10,50; 1.000,00), datas §4.19 (25/12/2026 e 08/11/2026 17:30 de 20:30Z) e oculto RF-10 "(11) 9••••-••44" sem vazamento de dígitos*
  - [x] Teste 2 (unit): entradas fora do domínio (0, 5001, número não inteiro, telefone inválido) retornam erro claro em pt-BR — *0/5001/37.5 em `formatarNumero`, NaN/Infinity em moeda, DDI estrangeiro e 9 dígitos em telefone, "2026-02-30" e "25/12/2026" em data, string aleatória em timestamp — todos com mensagem asserida*
- [x] **FD-7 · `lib/estados.ts`** — máquina de estados de rifa e de número *(transições completas por construção: `Record<StatusRifa, ...>` tipado com o `status` de `RifaRow`/`NumeroRow` derivado dos tipos gerados (regra da FD-4 — sem literal digitado à mão); guardas booleanas `podeTransicionar*` para UI + `transicionar*` que lançam erro pt-BR pronto para Toast; bandeiras `arquivada`/`excluida` ficam fora da máquina (§2.7: são colunas, não estados); conferência é sempre no servidor — a UI usa as guardas só para desabilitar botões)*
  - [x] Teste 1 (unit): transições válidas autorizadas (aberta→encerrada→sorteada; encerrada→aberta; sorteada→encerrada via desfazer) — *tests/unit/estados.test.ts: ciclo F4 completo + reabrir + desfazer; número `disponivel⇄vendido`; `transicoesRifa('encerrada') = [aberta, sorteada]`*
  - [x] Teste 2 (unit): transições inválidas recusadas (aberta→sorteada direto; reabrir rifa sorteada) — *erro pt-BR com destino citado ("aberta" não pode ir para "sorteada"); sem estado estático (`disponivel→disponivel`, `vendido→vendido`) e guardas booleanas falsas*

### 1.3 Autenticação e perfil

- [x] **FD-8 · Login `/entrar` (Supabase Auth e-mail+senha; cadastro público DESATIVADO no painel do Supabase)** *(Server Action `entrar` em `actions/autenticacao.ts` com Zod (`EntrarInputSchema`) e mapeamento pt-BR dos erros do GoTrue; UI em `app/entrar` (card, `role=alert`, botão pendente "Entrando…" via `useActionState`); cadastro público desativado no `config.toml` local **e verificado no cloud (08/11/2026): sonda `POST /auth/v1/signup` → 422 "Signups not allowed for this instance", sem criação de usuário**; sessão httpOnly forçada via `cookieOptions` no Server/proxy clients (default do @supabase/ssr é `false` — o browser fica anônimo, conforme §2.3); proxy do Next 16 (`proxy.ts` — `middleware.ts` está descontinuado) protege `/`, `/rifas/*`, `/perfil/*` e devolve usuário logado de `/entrar` à T1, com `getUser()` e renovação de sessão por cookie; E2Es injetam as variáveis do stack local no webServer a partir de `supabase status`)*
  - [x] Teste 1 (E2E): credenciais válidas → redirect para T1 com sessão httpOnly — *tests/e2e/entrar.spec.ts: URL `/`, heading T1 renderizando e cookie `sb-…auth-token` com `httpOnly: true` (celular 360px + desktop)*
  - [x] Teste 2 (E2E): credenciais inválidas → mensagem de erro em pt-BR, sem sessão criada — *alerta "E-mail ou senha incorretos." visível, URL continua `/entrar` e nenhum cookie de sessão; extra: visita anônima a `/rifas` → redirect a `/entrar` (guarda do proxy)*
- [x] **FD-9 · Rota protegida + perfil do organizador (`/perfil`)** — nome de exibição + WhatsApp, exibidos depois no rodapé da T4 *(Server Action `salvarPerfil` em `actions/perfil.ts`: Zod `PerfilInputSchema` + normalização máscara→E.164 no servidor (`formatarTelefoneE164`), client de sessão sob a RLS `perfis_atualiza_proprio`, UPDATE confirmado por linhas retornadas (0 linhas ≠ sucesso silencioso) e erros de rede/permissão mapeados em pt-BR; UI em `app/perfil`: Server Component que reconfirma a sessão no servidor (`redirect("/entrar")` — o proxy da FD-8 já guarda a rota), lê a própria linha pré-preenchendo o formulário, `loading.tsx` com skeleton estável, formulário client com máscara progressiva `mascaraTelefoneDigitacao` (nova em `lib/formato.ts`), erro inline por campo, botão pendente "Salvando…" e feedback acessível `role=status`/`role=alert`; inclui a migração `003_correcoes.sql` — delta não destrutivo sobre as 001/002 já aplicadas: trigger próprio para `perfis.atualizado_em` (o UPDATE em perfis falhava com 42703, descoberto aqui) e máscara `& 127` no byte alto de `sortear_rifa` (OFFSET negativo intermitente na FD-3))*
  - [x] Teste 1 (unit): Server Action `salvarPerfil` grava nome + telefone E.164 (UPDATE em perfis) — *tests/integration/fd9-perfil.test.ts: sessão e Postgres reais do stack local (Política de Testes §5.1 proíbe mock de banco/RLS — precedentes FD-2/FD-3; só `next/headers` é substituído por cookies em memória, como a Request real). "(11) 98888-7777" gravado como "+5511988887777" e nome persistido via RLS*
  - [x] Teste 2 (unit/E2E): usuário não autenticado em rota protegida → redirect a /entrar; perfil com WhatsApp inválido → erro Zod — *int: "(11) 123" e nome "A" recusados com mensagem pt-BR e banco inalterado; sem sessão → recusa ("Sua sessão expirou…"); E2E (tests/e2e/perfil.spec.ts, 360px + desktop): salva com sessão ativa exibindo "Perfil salvo com sucesso.", anônimo em /perfil → redirect a /entrar e WhatsApp incompleto submetido → erro visível do contrato E.164*

### 1.4 Server Actions de rifa (escrita autenticada)

- [ ] **FD-10 · `criarRifa`** — validação Zod, slug único, gravação da rifa + números 001..N
  - [ ] Teste 1 (int): criar rifa de 100 → persistida com slug, status aberta e 100 números disponivel
  - [ ] Teste 2 (int): payload inválido (cenários do FD-5) → erro de Zod sem rifa criada; colisão de slug → slug alternativo gerado
- [ ] **FD-11 · `editarRifa` / `arquivarRifa` / `excluirRifa`** — regras RN-09 (quantidade bloqueada com vendas; exclusão só sem vendas)
  - [ ] Teste 1 (int): editar título/preço persiste; arquivar oculta da listagem T1 mas preserva os dados
  - [ ] Teste 2 (int): editar quantidade com vendas → recusado; excluir rifa com vendas → erro "Esta rifa tem compras registradas…"
- [ ] **FD-12 · Tela T1 · Minhas Rifas** — lista, badges de status, barra de progresso, filtro, empty state, menu ⋮
  - [ ] Teste 1 (E2E): criar rifa → card com título, progresso 0/100 e badge 🟢 Aberta; filtro por status funciona
  - [ ] Teste 2 (E2E): zero rifas → empty state "Crie a primeira!"; rifa arquivada não aparece na listagem
- [ ] **FD-13 · Tela T2 · Criar/Editar** — formulário com validação em tempo real, contadores, máscara de moeda/telefone, botão inativo até válido
  - [ ] Teste 1 (E2E): preencher tudo válido → botão habilitado → cria → redirect a T3 com o link público e botão copiar
  - [ ] Teste 2 (E2E): campos faltantes/inválidos → botão inativo + mensagens por campo; em edição, seletor de quantidade desabilitado quando há vendas

**Checkpoint Fase 1:** sem a tela T3 ainda, mas a rifa é criada e persistida end-to-end; 100% dos testes da fase verdes no CI.

---

## Fase 2 · Vendas & Gestão (marco M2 — T3, grade, modal de venda, tempo real)

- [ ] **VT-1 · Tela T3 · Painel (estrutura)** — cabeçalho com banner/título/prêmio/valor/número/badge/data prevista + botão "Copiar link público"
  - [ ] Teste 1 (E2E): abrir T3 de rifa criada → dados do cabeçalho e link público corretos
  - [ ] Teste 2 (E2E): sem data prevista → campo omitido (nunca "undefined"); badge e status coerentes com o banco
- [ ] **VT-2 · Painel de resumo (exclusivo do T3)** — vendidos/total (%), disponíveis, arrecadado, potencial
  - [ ] Teste 1 (unit/int): 37 vendidos a R$ 10 em rifa de 100 → 37%, arrecadado R$ 370,00, potencial R$ 1.000,00
  - [ ] Teste 2 (int): consulta `anon` NUNCA retorna esses valores/nomes (garantias RNF-05 e RN-02)
- [ ] **VT-3 · Componente `GradeNumeros`** — pastilhas 001..N, três estados visuais (disponível/vendido/sorteado), blocos de 100 com navegação
  - [ ] Teste 1 (unit): renderiza 100 pastilhas com formatarNumero; rifa de 5000 pagina em blocos de 100 com navegação anterior/próxima
  - [ ] Teste 2 (unit): pastilha vendida tem estilo e rótulo acessível (aria) distintos da disponível; número fora da faixa não é renderizado
- [ ] **VT-4 · Modal T3a (organizador)** — número no título, nome+telefone obrigatórios com máscara, salvar/transferir/remover com confirmação
  - [ ] Teste 1 (E2E): registrar "Maria Silva / (11) 98888-7777" no nº 037 → modal fecha, pastilha verde ✓, resumo sobe para 38/100
  - [ ] Teste 2 (E2E): salvar sem preencher campos → validação inline; remover venda → confirmação → pastilha volta a disponível
- [ ] **VT-5 · Server Action `registrarVenda` (organizador)** — conferências na ordem: rifa aberta → número disponivel → dados válidos; origem `organizador`
  - [ ] Teste 1 (int): venda válida → numero vira vendido, venda gravada com origem correta, comprador registrado
  - [ ] Teste 2 (int): venda em número já vendido → erro "Esse número acabou de ser vendido" com estado inalterado; venda em rifa encerrada → recusada
- [ ] **VT-6 · Concorrência no mesmo número** (crítico, RN-03)
  - [ ] Teste 1 (int): 2 requisições simultâneas no mesmo número → exatamente 1 sucesso e 1 bloqueio; banco consistente
  - [ ] Teste 2 (unit/E2E): UI otimista troca a pastilha na hora e faz rollback + toast quando o servidor recusa (nº vendido 1s antes por outro consultor)
- [ ] **VT-7 · `editarVenda` / `removerVenda`** — histórico preservado (`removida_em`), transferência de comprador
  - [ ] Teste 1 (int): editar venda transfere nome/telefone; remover marca `removida_em` e o número volta a disponivel
  - [ ] Teste 2 (int): `anon` tentando editar/remover venda pelo banco → negado (RLS); organizador só opera em rifas próprias
- [ ] **VT-8 · Busca e filtros (T3)** — número exato, comprador por nome/telefone, filtro de estado
  - [ ] Teste 1 (E2E): buscar "051" destaca a pastilha; buscar telefone parcial revela apenas os números daquela pessoa
  - [ ] Teste 2 (E2E): filtro "Disponíveis" oculta vendidas; busca sem resultado apresenta estado vazio claro (sem quebrar a grade)
- [ ] **VT-9 · Realtime (RF-18)** — `POSTGRES_CHANGES` na tabela numeros; pastilha, resumo e modal respondem ao vivo
  - [ ] Teste 1 (E2E, 2 contextos): venda registrada por consultor na T4 reflete na T3 do organizador sem refresh (e vice-versa)
  - [ ] Teste 2 (int): payload realtime do `anon` contém só eventos de numeros (nunca compradores/vendas)

**Checkpoint Fase 2:** loop principal F2 funciona ponta a ponta; concorrência resolvida; Realtime testado. Estabilize a fase antes de avançar.

---

## Fase 3 · Ciclo & Sorteio (marco M3 — encerrar, sortear, roleta, T5, desfazer)

- [ ] **SR-1 · `encerrarVendas` / `reabrirVendas`** — transições apenas aberta↔encerrada
  - [ ] Teste 1 (E2E): encerrar → badge 🔒 e nova venda recusada; reabrir → badge 🟢 e venda volta a funcionar
  - [ ] Teste 2 (int/E2E): encerrar abaixo do mínimo (ex.: 12/30) → aviso "X vendidos — abaixo do mínimo Y. Encerrar mesmo assim?" com os 2 caminhos; reabrir rifa sorteada → recusada
- [ ] **SR-2 · Confirmação de sorteio (UI)** — botão em destaque, "O sorteio será feito entre X números vendidos"
  - [ ] Teste 1 (E2E): rifa encerrada com 82 vendidas → confirmação exibindo a contagem exata; ao confirmar o sorteio executa
  - [ ] Teste 2 (E2E): sortear com 0 vendidos (rifa encerrada) → bloqueio com a mensagem prescrita e a rifa permanece encerrada
- [ ] **SR-3 · Server Action `sortear(id)`** — delega à RPC (única via autenticada); mapas de código de erro → mensagem pt-BR
  - [ ] Teste 1 (int): rifa encerrada com vendas → grava sorteio (número, comprador, snapshot total_vendidos, sorteado_em) e rifa vira sorteada
  - [ ] Teste 2 (int): códigos RIFA_ABERTA / RIFA_SEM_VENDIDOS viram toasts legíveis; 2º sorteio consecutivo sem desfazer → falha (RNF-06)
- [ ] **SR-4 · Aleatoriedade e distribuição (RNF-07)**
  - [ ] Teste 1 (int): N sorteios em rifas de amostra criadas para o teste → o vencedor está sempre dentro do conjunto de números vendidos, nunca de um disponível
  - [ ] Teste 2 (unit): geração NÃO usa `Math.random` (inspeção/lint) e a aleatoriedade criptográfica é demonstrável no código
- [ ] **SR-5 · `RoletaSorteio` (RF-09a)** — animação no browser de 3–5s com primeiros nomes dos vendedores, desacelera no resultado já gravado pelo servidor
  - [ ] Teste 1 (E2E): após confirmar, roleta aparece com os nomes e ao final T5 exibe o vencedor do banco
  - [ ] Teste 2 (unit): roleta sem participantes (borda) renderiza neutra, não bloqueia a gravação do resultado e honra prefers-reduced-motion
- [ ] **SR-6 · T5 · Resultado (rota própria `/r/{slug}/resultado`)** — número, nome, 2 últimos dígitos do telefone, prêmio com rótulo, data/hora, copiar resultado
  - [ ] Teste 1 (E2E): link direto sem login exibe "047 · Maria · (11) 9••••-••44 · Mais de R$ 500"; telefone completo nunca presente no DOM
  - [ ] Teste 2 (E2E): rifa sem sorteio → "Sorteio ainda não realizado"; botão copiar produz texto formatado correto (sem `undefined` em campos ausentes)
- [ ] **SR-7 · Revelação do telefone (RF-10)** — no T3, toque nos "••" mostra o telefone completo; autorização verificada no servidor
  - [ ] Teste 1 (E2E): organizador logado no T3 toca "••" → telefone completo aparece; `anon` nunca recebe o valor (checar rede/DOM)
  - [ ] Teste 2 (int): chamada da ação de revelação por `anon` → negada; evento registrado na auditoria do servidor quando aplicável
- [ ] **SR-8 · `desfazerSorteio` (RF-15/RN-08)** — marca `anulado_em`, volta a rifa a encerrada, preserva histórico invisível em tela
  - [ ] Teste 1 (int): desfazer → sorteio ganha `anulado_em`, rifa volta a encerrada, re-sorteio é permitido e gera novo registro (o anterior permanece anulado)
  - [ ] Teste 2 (int): desfazer sem sorteio vigente / rifa aberta → falha; T5 passa a "Sorteio ainda não realizado" com badge "Sorteio anulado em DD/MM/AAAA HH:MM"

**Checkpoint Fase 3:** fluxo F4 completo (encerrar → sortear → T5 → desfazer), com atomicidade provada; marco M3 fechado.

---

## Fase 4 · Público, Foto & PWA (marco M4 — T4 completa, upload, compartilhamento, instalável)

- [ ] **PB-1 · T4 · rifa pública (Server Component + leitura anon)** — banner, prêmio com rótulo, preço, data (omissível), progresso com marca do mínimo, grade
  - [ ] Teste 1 (E2E): abrir `/r/{slug}` sem login em viewport 360px → dados corretos e progresso com marca do mínimo
  - [ ] Teste 2 (E2E): T4 de rifa arquivada/excluída ou slug inexistente → 404/página "não encontrada"; DOM da grade pública contém ZERO nomes/telefones
- [ ] **PB-2 · Modal público enxuto (T4)** — só registra comprador em número disponível (origem `publico`); vendido → "Número já vendido", sem edição
  - [ ] Teste 1 (E2E): visitante registra comprador em número disponível sem login → pastilha fica vendida e o resumo do T3 atualiza via realtime
  - [ ] Teste 2 (E2E): no T4 não existe editar/transferir/remover; tocar número vendido mostra "Número já vendido" e não abre formulário
- [ ] **PB-3 · Guardas backend da venda pública** — rate limit simples por sessão/IP + validações completas na Server Action (nunca INSERT direto do anon)
  - [ ] Teste 1 (int): rajada de `registrarVenda` acima do limite → requisições refusadas com mensagem clara, sem corromper dados
  - [ ] Teste 2 (int): `anon` tentando INSERT direto em vendas/compradores via client Supabase → negado por RLS (o servidor escreve; o anon só lê)
- [ ] **PB-4 · Busca rápida de número na T4**
  - [ ] Teste 1 (E2E): "o 57 já foi vendido?" → buscar "57" mostra o estado atual da pastilha
  - [ ] Teste 2 (E2E): busca por nome/telefone na T4 NÃO expõe dados de compradores (privacidade RNF-05)
- [ ] **PB-5 · Upload de foto (`enviarFoto` + `FotoPremio`)** — input com `capture="environment"`, compressão client (canvas), validação de magic bytes, ≤ 5 MB, bucket `premios`
  - [ ] Teste 1 (unit/int): JPG/PNG/WEBP de 3 MB → comprimido e gravado; `imagem_url` retornado e preview renderiza
  - [ ] Teste 2 (unit/int): PDF renomeado para .jpg → recusado por magic bytes; arquivo > 5 MB → recusado com mensagem pt-BR
- [ ] **PB-6 · Copiar link/resultado (RF-13)** — na T2 pós-criação, no T3 e na T5
  - [ ] Teste 1 (E2E): copiar link público copia exatamente `/r/{slug}`; copiar resultado na T5 coloca o texto formatado no clipboard
  - [ ] Teste 2 (E2E/unit): permissão de clipboard negada → fallback de copiar manualmente, sem crash
- [ ] **PB-7 · PWA instalável (decisão 6)** — manifest válido, ícones, `sw.js` de shell, botão "Instalar app" na T1 quando suportado
  - [ ] Teste 1 (E2E): manifest válido (nome/ícones/tema) e shell cacheado funciona em recarga offline
  - [ ] Teste 2 (E2E): evento `beforeinstallprompt` → botão aparece quando suportado e fica oculto quando não suportado
- [ ] **PB-8 · Banner de offline (F7)** — `navigator.onLine` + banner; gravações bloqueadas, sem fila offline (v1)
  - [ ] Teste 1 (E2E): `setOffline` → banner "Sem conexão — os dados não serão salvos até reconectar" aparece
  - [ ] Teste 2 (E2E): offline + tentativa de salvar venda → bloqueado com mensagem clara; ao reconectar, a gravação volta a funcionar
- [ ] **PB-9 · Rodapé da T4 com contato do organizador (perfil da conta)**
  - [ ] Teste 1 (E2E): nome de exibição + WhatsApp do perfil aparecem no rodapé
  - [ ] Teste 2 (E2E): perfil incompleto → rodapé exibe fallback claro (sem placeholder técnico)

**Checkpoint Fase 4:** visitante sem login vê a rifa e o resultado; venda via link público persistida; app instalável — marco M4 fechado.

---

## Fase 5 · Polimento, Testes Globais & Deploy (marco M5)

- [ ] **PL-1 · Empty states, toasts e erros consistentes** — toda falha retorna mensagem em pt-BR pronta para Toast (padrão da SPEC §2.2)
  - [ ] Teste 1 (E2E): varredura dos fluxos F1–F6 sem nenhuma mensagem técnica em inglês exposta (inclui erros brutos)
  - [ ] Teste 2 (E2E): cada ação principal completa em ≤ 3 toques (verificação RNF-03)
- [ ] **PL-2 · Acessibilidade & touch (RNF-03)** — áreas ≥ 44px, contraste, rótulos, prefers-reduced-motion
  - [ ] Teste 1 (unit/E2E): navegação por teclado grade → modal → salvar, com focus trap correto no modal
  - [ ] Teste 2 (unit): auditoria automática de contraste e tamanhos nos componentes `ui/` sem violações críticas
- [ ] **PL-3 · Desempenho (RNF-04)** — grade de 5.000 números fluida; carregamento da rifa < 2s em 4G
  - [ ] Teste 1 (E2E/perf): paginação na rifa de 5.000 sem travamentos (medição de fps/jank)
  - [ ] Teste 2 (E2E/perf): carga fria de `/r/{slug}` < 2s em ambiente mobile (média de 3 execuções)
- [ ] **PL-4 · Revisão de segurança end-to-end**
  - [ ] Teste 1 (int): suíte completa de RLS reexecutada em staging (anon lê o permitido, grava nada e nunca vê compradores)
  - [ ] Teste 2 (int): `service_role` e segredos não aparecem no bundle do client (grep do build + testes de runtime)
- [ ] **PL-5 · E2E jornada-mestre (critério de aceite): criar → vender → encerrar → sortear → desfazer → re-sortear → T5**
  - [ ] Teste 1 (E2E): jornada de sucesso completa passando por T1→T2→T3→T4→T5 em viewport mobile
  - [ ] Teste 2 (E2E): jornada com cenários de exceção: sorteio com 0 vendidos, exclusão negada oferecendo arquivar, offline durante venda
- [ ] **PL-6 · Deploy em produção (Vercel)**
  - [ ] Configurar env vars, `remotePatterns` do storage no `next.config.mjs`, domínio e HTTPS
  - [ ] [ ] Verificar: em produção, o acesso público à T4/T5 e o login do organizador funcionam
- [ ] **PL-7 · Migrações em prod + backup/monitoramento**
  - [ ] Rodar migrações via CI/CLI; backup diário ativo; rotina de export do storage; UptimeRobot monitorando `/r/{slug}` de uma rifa-teste
  - [ ] Teste 1 (int/smoke): pós-deploy, o pipeline staging→prod executa a suíte crítica sem regressão
  - [ ] Teste 2 (operacional): restaurar backup local comprovando a integridade de banco + storage
- [ ] **PL-8 · README + checklist operacional do organizador** (seeds de dev, como provisionar a conta sem cadastro público)
  - [ ] Teste 1 (smoke): um organizador zero-to-one cria a primeira rifa seguindo o README
  - [ ] Teste 2 (smoke): `seed.sql` de dev não polui produção (guardas de ambiente documentadas e testadas)

**Checkpoint Final:** Definition of Done global 100% atendido; custo R$ 0/mês confirmado nos serviços usados.

---

## Critérios de Aceite Globais (Definition of Done)

Uma tarefa/fase só está "Done" quando TODOS os itens forem válidos:

1. **Build verde** — o projeto compila e roda (`pnpm build`) sem erros e sem warnings bloqueadores.
2. **Tipagem estrita** — `pnpm typecheck` passa com `strict: true`; sem `any` desnecessário (exceção precisa de comentário justificado).
3. **Lint limpo** — `pnpm lint` sem erros.
4. **100% dos testes associados verdes** — todo checklist de teste da tarefa validado (`unit`/`int`/`E2E` conforme marcado); nenhum teste obrigatório pendente ou ignorado sem justificativa registrada na PR.
5. **Regra dos ≥ 2 testes por funcionalidade** — respeitada literalmente (norma da SPEC, Política de Testes); funcionalidade sem os 2 cenários → tarefa é recusada.
6. **pt-BR** — mensagens de UI e erros em português; dados formatados conforme o contrato de `lib/formato.ts`.
7. **Segurança transversal** — nada de `compradores`/`vendas` exposto ao `anon`; `service_role` confinado a Server Actions.
8. **CI bloqueia regressão** — pipeline lint → typecheck → testes rodando em todo MR; merge só com tudo verde.

---

## Ordem de Execução Resumida (para agentes)

```
Fase 0 (ET-1..9)  →  Fase 1 (FD-1..13)  →  Fase 2 (VT-1..9)
  →  Fase 3 (SR-1..8)  →  Fase 4 (PB-1..9)  →  Fase 5 (PL-1..8)
```

- Execute as fases **em ordem**; dentro da fase, as tarefas também são sequenciais quando dependem de esquema/dados (ex.: FD-1 antecede FD-2 e FD-3; VT-5 antecede VT-6).
- Tarefas independentes podem ser paralelizadas por agentes distintos (ex.: PB-5 e PB-7 após a Fase 2; componentes `ui/` na Fase 0).
- Ao fechar cada fase, rode a suíte **completa** (não apenas a da fase) e atualize este arquivo marcando os checkboxes.

**Estimativa alinhada à SPEC:** ~2 a 3 semanas (1 pessoa) · M1 ≈ 3–4d · M2 ≈ 4–5d · M3 ≈ 3–4d · M4 ≈ 3–4d · M5 ≈ 3d.
