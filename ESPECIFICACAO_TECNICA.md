# Especificação Técnica — Rifa App

**Versão:** 1.1 — Data: 08/11/2026
**Complemento de:** `PRODUTO.md` (documento de produto v1.1)

---

## 1. Stack Definida (única decisão, sem alternativas)

| Camada | Tecnologia | Papel |
|---|---|---|
| **Framework** | **Next.js (versão LTS atual) + TypeScript + App Router** | Front-end e "back-end" (Server Actions e Route Handlers) em um único projeto |
| **Estilo/UI** | **Tailwind CSS** | UI responsiva e mobile-first, grid de números |
| **Banco de dados** | **PostgreSQL gerenciado pelo Supabase** (plano gratuito) | Rifas, números, compradores, sorteios |
| **Autenticação** | **Supabase Auth** (e-mail + senha) | Conta única do organizador |
| **Armazenamento de imagens** | **Supabase Storage** (plano gratuito) | Foto do prêmio |
| **Hospedagem** | **Vercel** (plano Hobby, gratuito) | Deploy do app, HTTPS e CDN automáticos |
| **PWA** | Manifest + service worker (PWA nativo do Next.js) | Ícone na tela inicial do celular |
| **Validação** | **Zod** | Validar formulários e payloads |

### 1.1 Por que essa combinação

- **Uma linguagem só (TypeScript)** do browser ao servidor → menos peças, menos ambiente para manter.
- **Zero back-end separado:** Server Actions do Next.js fazem as operações de escrita (venda, sorteio); o banco nunca é exposto ao browser para escrita.
- **100% gratuito** nos planos usados (ver seção 8) e suficiente para a escala do problema (rifas de até 5.000 números).
- **Sorteio no servidor** com aleatoriedade criptográfica (Node `crypto.randomInt`), preservando a regra de confiança (RNF-07).

### 1.2 Limites do plano gratuito (confortáveis para a v1)

| Serviço | Limite gratuito | Encaixe no Rifa App |
|---|---|---|
| Vercel Hobby | Deploy ilimitado de uso pessoal, HTTPS/CDN | Cobre o app inteiro |
| Supabase DB | 500 MB | ~100 mil números cabem em poucos MB; anos de uso |
| Supabase Storage | 1 GB | ~200 fotos de 5 MB reduzidas (< 300 KB cada após compressão) |
| Supabase Auth | 50 mil usuários/mês | 1 organizador |

---

## 2. Arquitetura

```
┌─────────────────────────────┐
│   Next.js (Vercel — free)   │
│                             │
│  App Router + React 19      │
│  ├── Páginas (RSC/Client)   │── Leitura: Supabase anon (RLS permite só leitura pública)
│  └── Server Actions         │── Escrita: chave de serviço (service role) no servidor
│      (venda, encerrar,      │      + validação Zod
│       sorteio, upload)      │
└──────────────┬──────────────┘
               │
     ┌─────────▼─────────┐        ┌─────────────────────┐
     │  Supabase (free)  │        │ Supabase Storage    │
     │  • PostgreSQL+RLS │        │ bucket "premios"    │
     │  • Auth (organiz.)│        │ (fotos do prêmio)   │
     │  • RPC do sorteio │        └─────────────────────┘
     └───────────────────┘
```

**Divisão clara:**
- **Leitura** (tela pública T4/T5): chamada direta do browser ao Supabase com a chave pública `anon`, protegida por **Row Level Security** (RLS) que só permite ver rifas não excluídas/arquivadas e **nunca** retorna telefone de comprador (ver modelo de dados).
- **Escrita** (criar rifa, marcar venda, encerrar, sortear, upload): sempre por **Server Action** (roda no servidor Vercel), valida com Zod e usa a chave de serviço. Assim nem consultores nem visitantes conseguem escrever direto — só pela interface.
- **Sorteio:** implementado como **função no Postgres (RPC)** chamada pela Server Action — garante **atomicidade** (uma única transação: confere estado, sorteia, grava resultado, muda status), mesmo se dois cliques acontecerem ao mesmo tempo.
- **Animação da roleta** (RF-09a): roda no navegador, após o servidor retornar o resultado já gravado — a emoção é presentacional, o resultado é único e auditável.

### 2.1 Acesso e autenticação (decisão 2 do produto)

| Perfil | Como acessa | Pode fazer |
|---|---|---|
| **Organizador** | Login e-mail + senha (Supabase Auth). Conta criada no primeiro uso; **sem cadastro público** | Todas as telas do organizador (T1/T2/T3) e operações de escrita |
| **Visitante / Consultor** | Link público `/r/{slug}` e `/r/{slug}/resultado`, sem login | Ver T4/T5 e **registrar comprador em número disponível** |

- No primeiro login, o organizador preenche **nome de exibição** e **WhatsApp/telefone de contato** (perfil), exibidos no rodapé da tela pública.
- Sessão via cookies do Supabase Auth (`@supabase/ssr`), httpOnly.

### 2.2 URLs

| Rota | Tela | Acesso |
|---|---|---|
| `/` | T1 · Minhas Rifas | organizador |
| `/rifas/nova` e `/rifas/{id}/editar` | T2 · Criar/Editar | organizador |
| `/rifas/{id}` | T3 · Painel da Rifa | organizador |
| `/r/{slug}` | T4 · Rifa pública | público |
| `/r/{slug}/resultado` | T5 · Resultado do sorteio | público (rota própria, decisão 5) |
| `/entrar` | Login | público |

- **Slug** único, gerado do título + sufixo curto (ex.: `rifa-do-forno-2026-x7k2`), é a chave das URLs públicas.

---

## 3. Modelo de Dados (PostgreSQL / Supabase)

### 3.1 Diagrama ER

```
perfis (1)───(N) rifas (1)───(N) numeros (0..1)───(1) vendas ──(1) compradores
                 │
                 └──(0..N) sorteios (resultado vigente + anulados)
```

> `perfis` corresponde a cada usuário do Supabase Auth (neste app, o único organizador), carregando nome de exibição e contato.

### 3.2 Tabelas

```sql
-- Perfil ligado ao usuário do Supabase Auth
CREATE TABLE perfis (
  id              uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_exibicao   text NOT NULL,
  whatsapp        text NOT NULL          -- contato público; normalizado: 5511988887777
);

CREATE TABLE rifas (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  perfil_id           uuid NOT NULL REFERENCES perfis(id),
  slug                text NOT NULL UNIQUE,
  titulo              text NOT NULL CHECK (char_length(titulo) BETWEEN 3 AND 60),
  descricao           text CHECK (char_length(descricao) <= 500),
  premio_descricao    text NOT NULL,
  premio_rotulo       text NOT NULL DEFAULT 'estimado'
                      CHECK (premio_rotulo IN ('estimado','mais_de','ate')),  -- RF-01
  premio_valor        numeric(10,2) NOT NULL CHECK (premio_valor > 0),
  numero_valor        numeric(10,2) NOT NULL CHECK (numero_valor > 0),
  quantidade          int  NOT NULL CHECK (quantidade IN (25,50,100,200,500,1000,5000)),
  qtd_minima          int  NOT NULL CHECK (qtd_minima BETWEEN 0 AND quantidade),
  imagem_url          text,
  data_prevista       date,
  status              text NOT NULL DEFAULT 'aberta'
                      CHECK (status IN ('aberta','encerrada','sorteada')),
  criada_em           timestamptz NOT NULL DEFAULT now(),
  atualizada_em       timestamptz NOT NULL DEFAULT now(),
  arquivada           boolean NOT NULL DEFAULT false,
  excluida            boolean NOT NULL DEFAULT false
);

-- Números são 1..quantidade, com padLeft de no mínimo 3 dígitos apenas na EXIBIÇÃO
CREATE TABLE numeros (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rifa_id   uuid NOT NULL REFERENCES rifas(id) ON DELETE CASCADE,
  numero    int  NOT NULL CHECK (numero BETWEEN 1 AND 5000),
  status    text NOT NULL DEFAULT 'disponivel'
            CHECK (status IN ('disponivel','vendido')),
  UNIQUE (rifa_id, numero)                     -- nenhum número duplicado por rifa
);

CREATE TABLE compradores (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rifa_id   uuid NOT NULL REFERENCES rifas(id) ON DELETE CASCADE,
  nome      text NOT NULL CHECK (char_length(nome) BETWEEN 2 AND 120),
  telefone  text NOT NULL                      -- E.164: +5511988887777; máscara aplicada na UI
);

CREATE TABLE vendas (                           -- vínculo número ↔ comprador, com histórico
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_id     uuid NOT NULL REFERENCES numeros(id) ON DELETE CASCADE,
  comprador_id  uuid NOT NULL REFERENCES compradores(id),
  criada_em     timestamptz NOT NULL DEFAULT now(),
  origem        text NOT NULL DEFAULT 'organizador'
                CHECK (origem IN ('organizador','publico')),   -- quem registrou (RN-03)
  removida_em   timestamptz                     -- NULL = venda vigente
);

CREATE TABLE sorteios (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rifa_id        uuid NOT NULL REFERENCES rifas(id) ON DELETE CASCADE,
  numero_id      uuid NOT NULL REFERENCES numeros(id),
  comprador_id   uuid NOT NULL REFERENCES compradores(id),
  total_vendidos int  NOT NULL,                 -- snapshot p/ registro interno
  sorteado_em    timestamptz NOT NULL DEFAULT now(),
  anulado_em     timestamptz                    -- RN-08: vigente = anulado_em IS NULL
);
```

**Índices:** `numeros (rifa_id, status)`, `compradores (rifa_id, telefone)`, `sorteios (rifa_id)`.

### 3.3 Segurança de dados com RLS (essencial neste app)

| Tabela | Papel `anon` (visitante) | Papel `authenticated` (organizador) |
|---|---|---|
| `rifas` | SELECT (sem arquivada/excluida) | tudo (próprias) |
| `numeros` | SELECT | tudo |
| `compradores` | **nenhum** | tudo |
| `vendas` | **nenhum** (telefone fica fora do alcance público) | tudo |
| `sorteios` | SELECT (resultado vigente) | tudo |
| `perfis` | SELECT (nome + whatsapp p/ rodapé da T4) | própria (UPDATE) |

- Escritas de venda pelo **link público** passam por **Server Action** (chave de serviço + validações de estado), evitando abrir INSERT de `vendas` ao anon no banco. Regra: o anon lê, o servidor escreve.
- Escritas do organizador também passam por Server Actions (autenticadas), sempre com validação Zod.

### 3.4 Função RPC do sorteio (atomicidade — RN-05/RN-06/RNF-06)

```sql
-- assinatura lógica (implementa-se como função transacional)
sortear_rifa(rifa uuid)
  1. SELECT ... FROM rifas WHERE id = rifa FOR UPDATE;      -- trava a rifa
  2. exige status = 'encerrada' (senão ABORT com código RIFA_ABERTA);
  3. exige COUNT(vendas vigentes) > 0 (senão ABORT RIFA_SEM_VENDIDOS);
  4. sorteia k = random_uniforme(0..total_vendidos-1);      -- setseed/pgcrypto
  5. pega o k-ésimo número vendido (ORDER BY numero OFFSET k LIMIT 1);
  6. INSERT em sorteios; UPDATE rifas SET status='sorteada';
  7. COMMIT;                                                -- tudo ou nada
```

- Chamada apenas pela Server Action autenticada do organizador.
- **Desfazer sorteio (RF-15):** Server Action marca `anulado_em` no sorteio vigente e volta a rifa para `encerrada` — tudo numa transação.

---

## 4. Server Actions (a "API" do app)

Sem REST próprio — o front chama funções de servidor:

| Server Action | Acesso | Validações principais |
|---|---|---|
| `criarRifa(dados)` / `editarRifa(id, dados)` | organizador | Zod; edição bloqueia `quantidade` com vendas (RN-09) |
| `excluirRifa(id)` / `arquivarRifa(id)` | organizador | exclusão só sem vendas (RN-09) |
| `registrarVenda(numeroId, nome, telefone)` | **público** | rifa `aberta`, número `disponivel` (RN-03); valida telefone |
| `editarVenda(numeroId, ...)` / `removerVenda(numeroId)` | organizador | transfêre/libera número |
| `encerrarVendas(id)` / `reabrirVendas(id)` | organizador | transições apenas `aberta↔encerrada` |
| `sortear(id)` | organizador | delega à RPC `sortear_rifa` |
| `desfazerSorteio(id)` | organizador | só se `status = 'sorteada'` |
| `enviarFoto(file)` | organizador | JPG/PNG/WEBP ≤ 5 MB → Supabase Storage |

**Regras de erro:** cada falha devolve mensagem já em pt-BR pronta para o toast (ex.: "Esse número acabou de ser vendido").

**Tempo real:** `POSTGRES_CHANGES` via Supabase Realtime (gratuito) na tabela `numeros` da rifa aberta — organizador e consultores veem a grade atualizar em tempo real (RF-18), inclusive quando o consultor marca no T4 e o organizador está no T3.

---

## 5. Estrutura do Projeto (single app — sem monorepo)

```
rifa-app/
├── app/
│   ├── layout.tsx                    # shell + PWA (manifest em public/)
│   ├── page.tsx                      # redirect → / ou /entrar
│   ├── entrar/page.tsx               # login (Supabase Auth)
│   ├── perfil/page.tsx               # nome de exibição + WhatsApp (1ª config.)
│   ├── rifas/
│   │   ├── page.tsx                  # T1 · Minhas Rifas
│   │   ├── nova/page.tsx             # T2 · Criar
│   │   └── [id]/
│   │       ├── page.tsx              # T3 · Painel da rifa
│   │       └── editar/page.tsx       # T2 · Editar
│   ├── r/[slug]/
│   │   ├── page.tsx                  # T4 · rifa pública (Server Component)
│   │   └── resultado/page.tsx        # T5 · resultado (rota própria)
│   └── api/
│       └── revalidate/route.ts       # revalidação de cache público (opcional)
├── actions/
│   ├── rifas.ts                      # criar/editar/arquivar/excluir
│   ├── vendas.ts                     # registrar/editar/remover venda
│   ├── ciclo.ts                      # encerrar/reabrir
│   ├── sorteio.ts                    # sortear (RPC) / desfazer
│   └── perfil.ts                     # perfil do organizador
├── components/
│   ├── GradeNumeros.tsx              # grid paginada (blocos de 100; 001–100, 101–200, …)
│   ├── ModalVenda.tsx                # T3a (variantes: organizador | público)
│   ├── ResumoRifa.tsx                # cards vendidos/disponíveis/arrecadado (só T3)
│   ├── RoletaSorteio.tsx             # animação da roleta com primeiros nomes (RF-09a)
│   ├── FotoPremio.tsx                # upload + preview
│   └── ui/                           # botão, input, badge, modal, toast (base UI própria)
├── lib/
│   ├── supabase/
│   │   ├── client.ts                 # client anon (browser)
│   │   ├── server.ts                 # client service role (Server Actions)
│   │   └── realtime.ts               # subscrição de mudanças da grade
│   ├── schemas.ts                    # Zod — todos os DTOs
│   ├── formato.ts                    # moeda BRL, telefone E.164↔(11) 9…, padLeft 3 dígitos
│   └── estados.ts                    # máquina de estados rifa/número
├── supabase/
│   ├── migrations/0001_init.sql      # tabelas + RLS + índices
│   ├── migrations/0002_sorteio.sql   # função RPC sortear_rifa
│   └── seed.sql                      # (dev) rifa de exemplo
├── public/
│   ├── manifest.webmanifest          # PWA (decisão 6): nome, ícones, tema
│   ├── sw.js                         # service worker leve (cache shell)
│   └── icons/                        # ícone do app
├── next.config.mjs                   # next/image remotePatterns: cdn do storage
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── README.md
```

**Decisões estruturais:**
- **Um único app Next.js** — sem pacote separado de tipos; `lib/schemas.ts` + tipos do Supabase (`supabase gen types`) cobrem o contrato.
- Migrações SQL versionadas no repositório (`supabase/migrations`), aplicadas via Supabase CLI/CI.
- Testes focados no domínio crítico, com Postgres real local (Supabase CLI): `sortear_rifa` (atomicidade, estados, 0 vendidos, sorteio repetido) e `vendas` (concorrência no mesmo número, RN-03). Vitest + Playwright para E2E (criar → vender → sortear).

---

## 6. Front-end — pontos-chave de implementação
| Desafio | Solução |
|---|---|
| Números de 001 a quantidade (decisão 4) | `formatarNumero(n)`: padStart para no mínimo 3 dígitos — "001", "037", "1200" (4 dígitos quando precisar) |
| Grade de até 5.000 números fluida (RNF-04) | Grade paginada por blocos de 100 + navegação "‹ anterior/próxima ›" e salto por bloco; CSS Grid `aspect-ratio: 1` |
| Moeda e telefone pt-BR | `Intl.NumberFormat('pt-BR')` para BRL; máscara "(XX) XXXXX-XXXX" durante digitação; grava em E.164 |
| Atualização em tempo real (RF-18) | Supabase Realtime: grade, progresso e modal respondem a mudanças no número |
| Otimismo com rollback | Venda salva: pastilha muda na hora; se o servidor recusar (ex.: número vendido 1 segundo antes por outro consultor), rollback + toast "Esse número acabou de ser vendido" |
| Animação da roleta (RF-09a) | Componente client: recebe os primeiros nomes dos vendidos, gira 3–5 s (CSS/JS), desacelera no número retornado pelo sorteio — gravação e exibição ficam prontas depois |
| Revelação do telefone do ganhador (RF-10) | No T3, dígitos "••" clicáveis; ao tocar, mostra telefone completo (só organizador; auditado no lado servidor por permissão) |
| Foto do prêmio | `<input type="file" accept="image/*" capture="environment">` (abre câmera no celular); compressão client (canvas) antes do upload; exibição via `next/image` (redimensionamento/otimização na Vercel) |
| PWA (decisão 6) | `manifest.webmanifest` + service worker simples (offline de shells); botão "Instalar app" no T1 quando suportado |
| Estados visuais do número | Disponível `bg-slate-100` · Vendido `bg-emerald-500 ✓` · Sorteado `bg-amber-400 🏆 ring` |
| Offline (F7) | `navigator.onLine` + banner "Sem conexão"; ações de gravação bloqueadas (sem fila offline na v1) |

---

## 7. Segurança & Privacidade

| Tema | Providência |
|---|---|
| Senhas | Geridas pelo Supabase Auth (hash interno, política mínima configurável) |
| Sessão | Cookies httpOnly do `@supabase/ssr` |
| Telefone/nome dos compradores | **Nunca** retornados ao papel `anon` (RLS bloqueia `compradores`/`vendas`); tela pública só mostra estado "vendido". Resultado (T5) exibe o nome do ganhador e só os **2 últimos dígitos do telefone** |
| Chaves | `anon` pública no browser; `service_role` **somente** em Server Actions (variáveis de ambiente do servidor) |
| Upload | Validação de tipo real (magic bytes) + tamanho ≤ 5 MB; redimensionamento e compressão client antes do upload |
| SQL | Todas as queries via client tipado do Supabase (parametrizadas) |
| Rate limit | Supabase Auth já limita login; Server Action crítica (registrarVenda) tem guarda simples de ritmo por sessão/IP |
| CORS/Domínio | Front na Vercel; Supabase restrito ao domínio do app |

---

## 8. Deploy & Operação

1. **Supabase** (projeto free): criar projeto → aplicar migrações (`supabase/migrations`) → bucket `premios` criado → configurar Auth (provedor e-mail; **desativar registro público**, o organizador é criado manualmente).
2. **Vercel** (Hobby): importar repositório → variáveis: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (só servidor) → deploy. HTTPS e CDN automáticos.
3. **CI (GitHub Actions):** lint → tipos → testes → aplicar migrações no Supabase → deploy Vercel.
4. **Backup:** Supabase free inclui backup diário do banco (7 dias); exportar Storage junto na rotina de segurança.
5. **Monitor:** uptime simples (UptimeRobot, plano free) na rota `/r/{slug}` de uma rifa teste.

**Custo mensal estimado:** **R$ 0** com os planos gratuitos (Vercel Hobby + Supabase Free). Passará a cobrar somente se muito além do escopo v1.

---

## 9. Roteiro de Implementação

| Marco | Escopo | Critério de aceite |
|---|---|---|
| **M1 — Fundação** (≈ 3–4 dias) | Projeto Next.js + Supabase, migrações + RLS, login do organizador, perfil (nome de exibição + WhatsApp), T1/T2 | criar/listar rifa (sem foto) |
| **M2 — Tela de gestão** (≈ 4–5 dias) | T3: grade paginada, modal de venda (organizador e via link público simples), resumo, busca, Realtime | registrar/editar/remover venda com persistência e sync em tempo real |
| **M3 — Ciclo + sorteio** (≈ 3–4 dias) | Encerrar (com aviso abaixo do mínimo)/reabrir, RPC do sorteio, T5 rota própria, desfazer sorteio, roleta | sorteio só entre vendidos, atômico; anulação funciona |
| **M4 — Público + foto + PWA** (≈ 3–4 dias) | T4 completa (modal público restrito), upload/compressão de foto, copiar link/resultado, PWA instalável | visitante sem login vê rifa e resultado; app instala no celular |
| **M5 — Polimento** (≈ 3 dias) | Empty states, toasts, responsividade final, E2E Playwright (criar→vender→sortear), revisão de segurança | pronto para uso real |

**Total estimado:** ~2 a 3 semanas de trabalho focado (1 pessoa).

---

## 10. Decisões já aprovadas (registro)

1. **Multi-rifa**: o app gerencia várias rifas com lista na home (T1).
2. **Acesso**: somente o organizador entra no app (login); demais pessoas usam apenas o link público (T4/T5).
3. **Quantidades pré-definidas**: 25/50/100/200/500/1.000/5.000 — sem valor livre.
4. **Numeração de 001 até a quantidade** (zero à esquerda, mínimo 3 dígitos).
5. **T5 em rota própria** (`/r/{slug}/resultado`), compartilhável isoladamente.
6. **PWA sim**: instalável na tela inicial do celular.
7. **Contato do organizador** na tela pública: informado no perfil da conta no primeiro acesso.
8. **Arrecadação** (arrecadado + potencial): exibida **somente no painel do organizador (T3)**; telas públicas nunca mostram valores de faturamento.
9. **Venda pelo link público**: marca o número como vendido imediatamente (nome + telefone obrigatórios), sem aprovação do organizador; edição/transferência/remoção e encerrar/sortear ficam restritos ao organizador.
10. **Quantidade mínima**: gera aviso **apenas ao encerrar as vendas**; no sorteio não há bloqueio nem aviso.

---
*Documento acompanha `PRODUTO.md` v1.1. Nenhum código-fonte foi criado nesta fase.*
