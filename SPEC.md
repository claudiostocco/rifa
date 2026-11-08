# SPEC.md — Especificação Consolidada · Rifa App

**Versão:** 1.0 — Data: 08/11/2026
**Fontes consolidadas:** `PRODUTO.md` v1.1 + `ESPECIFICACAO_TECNICA.md` v1.1
**Status:** Fonte única de verdade (Single Source of Truth) para engenharia e agentes autônomos de código.
**Idioma do produto:** pt-BR (obrigatório em toda a UI, mensagens de erro e dados formatados).

---

## POLÍTICA DE TESTES OBRIGATÓRIA (leia antes de implementar qualquer recurso)

> **NORMA INVIOLÁVEL:** todo recurso, funcionalidade, Server Action, endpoint, componente ou função RPC implementado **DEVE** conter, no momento da implementação, **no mínimo 2 (dois) testes automatizados**:
>
> - **Cenário A (Sucesso / caminho feliz):** o caso de uso válido mais representativo do recurso.
> - **Cenário B (Erro ou borda):** a validação, exceção, estado inválido ou limite mais relevante do recurso.
>
> Um pull request que entrega código sem seus ≥ 2 testes é considerado **incompleto e rejeitado**. A Matriz de Testes (Seção 5) já lista os cenários A/B mínimos por funcionalidade — implemente-os, e adicione mais quando fizer sentido.

---

## 1. Visão Geral do Sistema

### 1.1 Propósito
O **Rifa App** é um aplicativo web para **criação, controle e sorteio de rifas**. O organizador cria uma rifa informando prêmio, preço e quantidade de números e quantidade mínima de vendidos para sorteio; durante a venda, cada número é marcado como vendido com nome e telefone do comprador (pelo organizador no painel, ou por consultores via link público); ao encerrar as vendas, o sistema realiza o sorteio **apenas entre os números vendidos**, com aleatoriedade criptográfica no servidor e resultado publicado publicamente.

### 1.2 Problema que resolve
| Objetivo | Descrição |
|---|---|
| Simplificar a gestão de rifas | Substituir controles manuais (caderno, planilha, listas de WhatsApp) por um único lugar |
| Dar transparência | Mostrar publicamente quais números estão vendidos/livres |
| Sorteio justo e comprovável | Sorteio apenas entre números vendidos, com registro auditável do resultado |
| Acesso universal | Funciona em celular e computador, no navegador, sem instalar nada (PWA opcional) |

### 1.3 Público-alvo
- **Organizador** (persona principal): pessoa que promove uma rifa para arrecadar fundos (igreja, escola, ONG, evento, família). Único perfil com login.
- **Comprador / Consultor** (secundária): acessa a rifa por **link público sem login**; visualiza números/prêmio e **pode registrar comprador em número disponível** (nome + telefone). Editar, transferir ou remover vendas é exclusivo do organizador.

### 1.4 Fora de escopo (v1)
Pagamento online (Pix/cartão), compra self-service com reserva, múltiplos organizadores com permissões, mensagens automáticas/WhatsApp, relatórios financeiros avançados, app nativo de loja. (Ver `PRODUTO.md` §7 para evoluções futuras.)

### 1.5 Decisões de produto já aprovadas (não negociáveis)
1. Multi-rifa com lista na home (T1).
2. Somente o organizador faz login; demais pessoas usam apenas o link público.
3. Quantidades pré-definidas: **25 / 50 / 100 / 200 / 500 / 1.000 / 5.000** — sem valor livre.
4. Numeração de **001 até a quantidade** (zero à esquerda, mínimo 3 dígitos — ex.: 001, 037, 1200).
5. T5 (resultado) em **rota própria** `/r/{slug}/resultado`, compartilhável isoladamente.
6. **PWA sim**: instalável na tela inicial do celular.
7. Contato do organizador na tela pública vem do **perfil da conta** (definido no primeiro acesso).
8. **Arrecadação (arrecadado + potencial) exibida somente no painel T3**; telas públicas nunca mostram faturamento.
9. **Venda pelo link público** registra nome + telefone e marca o número como vendido **imediatamente**, sem aprovação do organizador.
10. **Quantidade mínima**: gera aviso **apenas ao encerrar vendas**; no sorteio não há bloqueio nem aviso.

---

## 2. Arquitetura & Stack Tecnológica

### 2.1 Stack (única decisão, sem alternativas)
| Camada | Tecnologia | Papel |
|---|---|---|
| Framework | **Next.js (LTS atual) + TypeScript + App Router** | Front-end e "back-end" (Server Actions + Route Handlers) em um único projeto |
| Estilo/UI | **Tailwind CSS** | UI responsiva mobile-first, grid de números |
| Banco de dados | **PostgreSQL gerenciado pelo Supabase** (plano gratuito) | Rifas, números, compradores, vendas, sorteios |
| Autenticação | **Supabase Auth** (e-mail + senha) | Conta única do organizador; **sem cadastro público** |
| Storage | **Supabase Storage** (bucket `premios`) | Foto do prêmio |
| Hospedagem | **Vercel** (Hobby) | Deploy, HTTPS e CDN automáticos |
| PWA | Manifest + service worker (nativo do Next.js) | Instalável no celular |
| Validação | **Zod** | Validar formulários e payloads (todos os DTOs em `lib/schemas.ts`) |
| Tempo real | **Supabase Realtime** (`POSTGRES_CHANGES` em `numeros`) | Grade e resumos atualizam ao vivo (RF-18) |

### 2.2 Arquitetura de referência
```
┌─────────────────────────────┐
│   Next.js (Vercel — free)   │
│  App Router + React 19      │
│  ├── Páginas (RSC/Client)   │── Leitura: Supabase anon (RLS só leitura pública)
│  └── Server Actions         │── Escrita: service_role no servidor
│      (venda, encerrar,      │      + validação Zod
│       sorteio, upload)      │
└──────────────┬──────────────┘
     ┌─────────▼─────────┐        ┌─────────────────────┐
     │  Supabase (free)  │        │ Supabase Storage    │
     │  • PostgreSQL+RLS │        │ bucket "premios"    │
     │  • Auth (organiz.)│        └─────────────────────┘
     │  • RPC do sorteio │
     └───────────────────┘
```

**Divisão de responsabilidades (regra de ouro):**
- **Leitura pública**: browser → Supabase com chave `anon`, protegida por **RLS** (nunca expõe rifas arquivadas/excluídas e **nunca** retorna `compradores`/`vendas`).
- **Escrita**: **sempre** via Server Action (servidor Vercel), validada com Zod, com `service_role`. O `anon` lê; **o servidor escreve**.
- **Sorteio**: função **RPC transacional no Postgres** (`sortear_rifa`) chamada pela Server Action — atomicidade garantida (trava a rifa, confere estado, sorteia, grava resultado, muda status em uma única transação).
- **Roleta (RF-09a)**: puramente presentacional no browser; roda **depois** de o servidor gravar o resultado — o resultado é único e auditável.
- **Interface de erros**: toda falha de Server Action devolve mensagem em **pt-BR pronta para toast** (ex.: "Esse número acabou de ser vendido").

### 2.3 Segurança de dados com RLS
| Tabela | `anon` (visitante) | `authenticated` (organizador) |
|---|---|---|
| `rifas` | SELECT (sem arquivadas/excluídas) | tudo (próprias) |
| `numeros` | SELECT | tudo |
| `compradores` | **nenhum** | tudo |
| `vendas` | **nenhum** (telefone fora do alcance público) | tudo |
| `sorteios` | SELECT (resultado vigente) | tudo |
| `perfis` | SELECT (nome + whatsapp para rodapé da T4) | própria (UPDATE) |

Demais providências: sessão via cookies httpOnly (`@supabase/ssr`); `service_role` **somente** em Server Actions; upload com validação de tipo real (magic bytes) + ≤ 5 MB; queries parametrizadas via client tipado; rate limit simples na Server Action `registrarVenda` (por sessão/IP); Supabase restrito ao domínio do app.

### 2.4 Modelo de dados

**Diagrama ER:** `perfis (1)──(N) rifas (1)──(N) numeros (0..1)──(1) vendas ──(1) compradores`; `rifas ──(0..N) sorteios` (resultado vigente + anulados).

```sql
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

**Função RPC do sorteio (assinatura lógica):**
```
sortear_rifa(rifa uuid)
  1. SELECT ... FROM rifas WHERE id = rifa FOR UPDATE;      -- trava a rifa
  2. exige status = 'encerrada' (senão ABORT RIFA_ABERTA);
  3. exige COUNT(vendas vigentes) > 0 (senão ABORT RIFA_SEM_VENDIDOS);
  4. sorteia k = random_uniforme(0..total_vendidos-1);      -- aleatoriedade criptográfica
  5. pega o k-ésimo número vendido (ORDER BY numero OFFSET k LIMIT 1);
  6. INSERT em sorteios; UPDATE rifas SET status='sorteada';
  7. COMMIT;                                                -- tudo ou nada
```
Desfazer sorteio (RF-15): Server Action marca `anulado_em` no sorteio vigente e devolve a rifa a `encerrada` — tudo em uma transação.

### 2.5 Server Actions (a "API" do app)
Sem REST próprio — o front chama funções de servidor:

| Server Action | Acesso | Validações principais |
|---|---|---|
| `criarRifa(dados)` / `editarRifa(id, dados)` | organizador | Zod; edição bloqueia `quantidade` com vendas (RN-09) |
| `excluirRifa(id)` / `arquivarRifa(id)` | organizador | exclusão só sem vendas (RN-09) |
| `registrarVenda(numeroId, nome, telefone)` | **público** | rifa `aberta`, número `disponivel` (RN-03); valida telefone |
| `editarVenda(numeroId, ...)` / `removerVenda(numeroId)` | organizador | transfere/libera número |
| `encerrarVendas(id)` / `reabrirVendas(id)` | organizador | transições apenas `aberta↔encerrada` |
| `sortear(id)` | organizador | delega à RPC `sortear_rifa` |
| `desfazerSorteio(id)` | organizador | só se `status = 'sorteada'` |
| `enviarFoto(file)` | organizador | JPG/PNG/WEBP ≤ 5 MB → Supabase Storage |

### 2.6 Estrutura de diretórios (single app, sem monorepo)
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
│   └── api/revalidate/route.ts       # revalidação de cache público (opcional)
├── actions/
│   ├── rifas.ts                      # criar/editar/arquivar/excluir
│   ├── vendas.ts                     # registrar/editar/remover venda
│   ├── ciclo.ts                      # encerrar/reabrir
│   ├── sorteio.ts                    # sortear (RPC) / desfazer
│   └── perfil.ts                     # perfil do organizador
├── components/
│   ├── GradeNumeros.tsx              # grid paginada (blocos de 100)
│   ├── ModalVenda.tsx                # T3a (variantes: organizador | público)
│   ├── ResumoRifa.tsx                # cards vendidos/disponíveis/arrecadado (só T3)
│   ├── RoletaSorteio.tsx             # animação da roleta (RF-09a)
│   ├── FotoPremio.tsx                # upload + preview
│   └── ui/                           # botão, input, badge, modal, toast (base UI própria)
├── lib/
│   ├── supabase/{client.ts, server.ts, realtime.ts}
│   ├── schemas.ts                    # Zod — todos os DTOs
│   ├── formato.ts                    # moeda BRL, telefone E.164↔máscara, padLeft 3 dígitos
│   └── estados.ts                    # máquina de estados rifa/número
├── supabase/
│   ├── migrations/0001_init.sql      # tabelas + RLS + índices
│   ├── migrations/0002_sorteio.sql   # função RPC sortear_rifa
│   └── seed.sql                      # (dev) rifa de exemplo
├── public/{manifest.webmanifest, sw.js, icons/}
├── next.config.mjs                   # next/image remotePatterns: cdn do storage
├── package.json / tsconfig.json / tailwind.config.ts / README.md
```

**Decisões estruturais:** um único app Next.js; tipos de DB gerados via `supabase gen types`; migrações SQL versionadas no repositório; **testes com Postgres real local (Supabase CLI)**.

### 2.7 Máquina de estados
- **Rifa:** `aberta → encerrada → sorteada`, com reversões `encerrada → aberta` (reabrir) e `sorteada → encerrada` (desfazer sorteio). Banderas adicionais: `arquivada`, `excluida` (soft delete).
- **Número:** `disponivel ⇄ vendido`; o vencedor recebe destaque visual de **Sorteado** (estado de exibição, não de tabela).
- Transições inválidas **devem** ser bloqueadas no servidor (não só na UI).

### 2.8 URLs
| Rota | Tela | Acesso |
|---|---|---|
| `/` | T1 · Minhas Rifas | organizador |
| `/rifas/nova` e `/rifas/{id}/editar` | T2 · Criar/Editar | organizador |
| `/rifas/{id}` | T3 · Painel da Rifa | organizador |
| `/r/{slug}` | T4 · Rifa pública | público |
| `/r/{slug}/resultado` | T5 · Resultado do sorteio | público |
| `/entrar` | Login | público |

**Slug** único, gerado do título + sufixo curto (ex.: `rifa-do-forno-2026-x7k2`); é a chave das URLs públicas.

---

## 3. Mapeamento de Telas e Fluxos

### 3.1 Mapa de navegação
```
T1 · Minhas Rifas ──(+ Nova Rifa)──▶ T2 · Criar/Editar ──▶ T1
T1 ──(tocar card)──▶ T3 · Painel da Rifa (gestão, modal T3a)
T3 ──(copiar link / sortear)──▶ T4 · Rifa pública · T5 · Resultado
```

### 3.2 T1 · Minhas Rifas (home)
**Objetivo:** ver todas as rifas e acessar rapidamente a ativa.
- **Componentes:** cabeçalho ("Rifa App") + botão **+ Nova Rifa**; filtro por status (Todas / Abertas / Encerradas / Sorteadas); card por rifa (miniatura da foto ou ícone de presente, título, prêmio e preço — ex.: "Prêmio: Forno R$ 850 · Número R$ 10", barra de progresso `vendas/total`, badge 🟢 Aberta · 🔒 Encerrada · 🎉 Sorteada, menu ⋮: abrir, editar, arquivar); botão "Instalar app" quando suportado (PWA).
- **Empty state:** "Você ainda não tem rifas. Crie a primeira!" + botão criar.
- **Estados:** vazio | lista com cards | sem internet (banner de offline).
- **Interações:** tocar card → T3; "+ Nova Rifa" → T2; menu ⋮ → ações.

### 3.3 T2 · Criar / Editar Rifa
**Objetivo:** formulário único, enxuto, com validações claras.
- **Campos:** ver Seção 4.1 (contrato `CriarRifaInput`).
- **Validação em tempo real** (Zod + UI): campos faltantes, valores negativos, contador de caracteres (título 60, descrição 500). Botão **Criar Rifa** fica inativo até o mínimo válido.
- **Regras de tela (RN-09):** em edição, "Quantidade de números" desabilitado se já houver venda. Ao criar: gera números 001..N todos `disponivel`, registra e exibe o **link público** com botão **Copiar link**, redireciona para **T3**.
- **Estados:** formulário válido | inválido (botão inativo + mensagens) | enviando (loading) | erro de servidor (toast pt-BR).

### 3.4 T3 · Painel da Rifa (gestão)
**Objetivo:** tela de trabalho do organizador — gerenciar todas as vendas.
1. **Cabeçalho:** banner da foto, título, descrição, prêmio com rótulo e valor ("Forno elétrico — valor estimado R$ 850"), "Número: R$ 10 · Quantidade: 100 · Total potencial: R$ 1.000", badge de status, data prevista (se houver), botão **Copiar link público**.
2. **Painel de resumo (exclusivo do T3):** vendidos/total com percentual, disponíveis, arrecadado (R$), potencial total (R$).
3. **Buscas/filtros:** por número exato (destaca a pastilha), por comprador (nome ou telefone — revela os números dessa pessoa), filtro Todos/Disponíveis/Vendidos.
4. **Grade de números (componente central):** 001..N como pastilhas; disponível (fundo claro, tocável), vendido (verde com ✓, tocável), sorteado (destaque dourado 🏆); blocos de 100 com navegação "‹ anterior / próxima ›" e salto por bloco (rifas ≥ 1.000).
5. **Modal T3a · Registrar comprador:** abre ao tocar número; título "Número 037"; campos obrigatórios Nome (2–120) e Telefone com máscara (XX) XXXXX-XXXX; se vendido, dados preenchidos (edição/transferência) + **Remover venda** (com confirmação); salvar atualiza pastilha e resumo na hora (otimista, com rollback).
6. **Barra de ações por etapa:**
   - **Aberta:** [🔒 Encerrar vendas] (confirmar; se abaixo do mínimo: "X vendidos — abaixo do mínimo Y. Encerrar mesmo assim?") · [✏️ Editar] · [Arquivar]
   - **Encerrada:** [🎉 Realizar Sorteio] (destaque; confirmação "O sorteio será feito entre X números vendidos") · [↩️ Reabrir vendas]
   - **Sorteada:** [🏆 Ver resultado] · [Desfazer sorteio] · [Arquivar]
7. **Revelação de telefone (RF-10):** no resultado, dígitos "••" clicáveis; toque mostra telefone completo (**somente organizador**; permissão auditada no servidor).

### 3.5 T4 · Rifa pública (consultor/comprador)
- **Componentes:** banner foto/título/descrição; prêmio com rótulo e valor ("Mais de R$ 500 — Forno elétrico"); preço do número; data prevista (**campo omitido** se não informado); barra de progresso "37 de 100 números vendidos" com marca visual do mínimo; grade de números (disponíveis tocáveis; vendidos **apenas marcados "vendido" — sem nome nem telefone**); busca rápida de número; rodapé "Para comprar, fale com o organizador" + nome e WhatsApp do perfil.
- **Modal público (T3a variante enxuta):** só **registrar comprador em número disponível**; número vendido → "Número já vendido", sem edição.
- **Proibido:** exibir arrecadação, nomes ou telefones de compradores (RN-02, RNF-05).
- **Estados:** carregando | pronta | offline (banner "Sem conexão"; gravações bloqueadas) | sorteada (destaque do vencedor + link "Ver resultado").

### 3.6 T5 · Resultado do Sorteio (público)
- **Componentes:** 🎉 "Número sorteado: **047**"; card grande com número · nome do ganhador · telefone com **só os 2 últimos dígitos** ("(11) 9••••-••44") · prêmio com rótulo; data e hora do sorteio; botão **Copiar resultado** (texto formatado para WhatsApp).
- **Anulação (RN-08):** resultado anulado exibe badge "Sorteio anulado em DD/MM/AAAA HH:MM" e a tela volta a "Sorteio ainda não realizado".

### 3.7 Fluxos end-to-end
| Fluxo | Resumo |
|---|---|
| **F1 · Criar rifa** | T1 → +Nova → T2 → preencher (título, prêmio, valores, quantidade, foto) → Criar → T3 com 100 números disponíveis + link público exibido |
| **F2 · Registrar venda** | Tocar número (T3 ou T4) → modal T3a → nome + telefone → Salvar → pastilha verde ✓, resumo recalculado (T4 atualiza só a grade, sem valores). *Alternativa:* remover venda (só organizador). *Persistência:* nada se perde ao recarregar (RN-07) |
| **F3 · Buscar** | Busca "051" ou filtro "Disponíveis" → pastilha em destaque com estado atual |
| **F4 · Encerrar e sortear** | Encerrar (aviso de mínimo se abaixo) → Realizar Sorteio (confirmação com total vendido) → roleta animada 3–5 s → grava resultado → 🎉 Sorteada → T5 |
| **F5 · Consultar pelo link** | Comprador abre T4 no celular → vê números → organiza a compra pela conversa (venda registrada em F2) |
| **F6 · Ver resultado** | Link direto `/r/{slug}/resultado` ou botão na T4 → vencedor em destaque → copiar resultado |
| **F7 · Exceções** | Sorteio com 0 vendidos → bloqueado ("A rifa não tem números vendidos…") e rifa permanece encerrada; excluir com vendas → oferecer **arquivar** apenas; offline → gravações bloqueadas com aviso claro (sem fila offline na v1) |

---

## 4. Especificação Funcional Detalhada

> Lista exaustiva de funcionalidades, com contratos de entrada/saída e regras de negócio. Os **cenários de teste obrigatórios** de cada item estão na Seção 5.

### 4.1 RF-01 · Criar/Editar rifa (Server Action `criarRifa` / `editarRifa`)
**Contrato de entrada (DTO Zod em `lib/schemas.ts`):**
```
CriarRifaInput {
  titulo: string            // obrigatório, 3–60 caracteres
  descricao?: string        // opcional, ≤ 500 caracteres
  premio_descricao: string  // obrigatório (ex.: "Forno elétrico")
  premio_rotulo: 'estimado' | 'mais_de' | 'ate'   // RF-01 · RN-02
  premio_valor: number      // > 0, moeda BRL, 2 casas
  numero_valor: number      // > 0, moeda BRL, 2 casas
  quantidade: 25|50|100|200|500|1000|5000
  qtd_minima: number        // 0 ≤ qtd_minima ≤ quantidade
  imagem_url?: string       // preenchida após upload (4.12)
  data_prevista?: date      // opcional, informativa
}
```
**Saída de sucesso:** rifa criada (id, slug, status `aberta`, 001..N `disponivel`) → redireciona a T3 e exibe link público com copiar.
**Erros (toast pt-BR):** campos inválidos (Zod), quantidade fora da lista, qtd_minima > quantidade.
**Regra de edição (RN-09):** título, descrição, prêmio, preço, imagem, data editáveis se rifa `aberta`; **quantidade bloqueada se houver qualquer venda**.

### 4.2 RF-02 · Geração da numeração
- Criada a rifa, inserir linhas `numeros` de **1..quantidade** (apenas exibição usa padLeft ≥ 3 dígitos: `001`, `037`, `1200` — função `formatarNumero`).
- `UNIQUE (rifa_id, numero)` no banco.

### 4.3 RF-03 · Listar rifas (T1)
- Lista do organizador com foto/miniatura, título, prêmio/preço, progresso `vendidos/total`, badge de status, filtro por status e arquivadas ocultas da listagem principal (dados preservados).

### 4.4 RF-04 · Painel da rifa com resumo financeiro (T3)
- **Somente aqui:** `vendidos/total (%)`, `disponíveis`, `arrecadado = soma(numero_valor dos vendidos vigentes)`, `potencial = quantidade × numero_valor`. Telas públicas **nunca** exibem esses valores (RN-02, decisão 8).

### 4.5 RF-05 / RF-05a · Registrar venda (Server Action `registrarVenda`)
**Contrato:** `registrarVenda({ numeroId, nome: string(2..120), telefone: string(E.164) })` — chamada por **organizador (T3)** e **visitante (T4, variante enxuta)**.
**Saída de sucesso:** número → `vendido`, venda criada com `origem = 'organizador' | 'publico'`, comprador gravado; UI atualiza em tempo real.
**Validações (ordem de conferência):** (1) rifa `aberta`; (2) número `disponivel`; (3) nome/telefone válidos. Em condição de corrida (número vendido por outra pessoa no mesmo instante): rollback do optimismo + toast "Esse número acabou de ser vendido".
**RN-03:** um número vende-se **uma única vez**; edição/transferência/remoção **exclusivas do organizador**.

### 4.6 RF-06 · Editar / remover venda (organizador)
- `editarVenda`: altera/transfer comprador (regrava nome/telefone). `removerVenda`: marca `removida_em`, número volta a `disponivel`; **pede confirmação**; histórico preservado (removida_em ≠ NULL).

### 4.7 RF-07 · Buscar e filtrar
- Busca por **número exato** (destaca pastilha), busca por **nome ou telefone** de comprador (revela as pastilhas vendidas para a pessoa — organizador), filtro Todos/Disponíveis/Vendidos. Na T4: busca rápida de número (opcional) sem dados de comprador.

### 4.8 RF-08 · Encerrar / reabrir vendas (`encerrarVendas` / `reabrirVendas`)
- Transições válidas apenas `aberta ↔ encerrada`.
- Ao encerrar **abaixo da quantidade mínima**: aviso "X vendidos — abaixo do mínimo Y. Encerrar mesmo assim?" e o organizador decide (RN-06, decisão 10). **No sorteio não há aviso nem bloqueio pelo mínimo.**

### 4.9 RF-09 / RF-09a · Sorteio (`sortear` → RPC `sortear_rifa`)
- **Pré-condições:** status `encerrada` e ≥ 1 venda vigente; senão ABORT (`RIFA_ABERTA` / `RIFA_SEM_VENDIDOS`). Zero vendidos: bloquear com "A rifa não tem números vendidos; o sorteio não pode ser realizado." (rifa permanece encerrada).
- **Confirmação prévia:** "O sorteio será feito feito entre X números vendidos."
- **Execução:** única, atômica, aleatoriedade **criptográfica do servidor** (RNF-07 — nunca `Math.random`); resultado gravado (número, comprador, `total_vendidos` snapshot, `sorteado_em`).
- **RF-09a (RoletaSorteio):** animação no browser com primeiros nomes dos participantes, gira 3–5 s e desacelera no número **já retornado pelo servidor** — emoção é presentacional; resultado único e auditável.
- **Não é possível sortear duas vezes** sem que o resultado anterior seja anulado (RNF-06).

### 4.10 RF-10 · Resultado e privacidade do telefone
- Grava e exibe: número, nome do comprador, data/hora. Telefone público na T5: apenas **2 últimos dígitos**. Revelação dos dígitos completos: **somente**, com toque, no painel T3 — autorizada no servidor pelo papel (nunca via anon).
- **Copiar resultado** (RF-13): texto formatado pronto para colar no WhatsApp.

### 4.11 RF-11 / RF-12 · Telas públicas por link
- T4 em `/r/{slug}`: dados, progresso **com marca do mínimo**, grade sem dados de compradores; acessível sem login.
- T5 em **rota própria** `/r/{slug}/resultado` (decisão 5), compartilhável isoladamente.

### 4.12 RF-17 · Foto do prêmio (`enviarFoto`)
- **Entrada:** arquivo JPG/PNG/WEBP com `accept="image/*" capture="environment"` (câmera no celular); **≤ 5 MB**; validação de **magic bytes** (tipo real); compressão/redimensionamento **client** (canvas) antes do upload (< ~300 KB típico).
- **Saída:** `imagem_url` no bucket `premios` (Supabase Storage); exibição via `next/image` (otimização na Vercel). Foto é **opcional** na criação (RN-11).

### 4.13 RF-14 · Editar / arquivar / excluir rifa
- **Editar:** regras de 4.1 (quantidade bloqueada com vendas).
- **Excluir** (`excluirRifa`): **somente sem nenhuma venda**; caso contrário, mensagem "Esta rifa tem compras registradas. Você pode arquivá-la para preservar o histórico."
- **Arquivar** (`arquivarRifa`): sempre permitido; sai da listagem principal, dados preservados.

### 4.14 RF-15 · Desfazer sorteio (`desfazerSorteio`)
- Só com `status = 'sorteada'`; marca `anulado_em` no sorteio vigente, rifa volta a `encerrada` (transação única); histórico de anulação existe (auditoria) mas **não é exibido em tela**; T5 passa a mostrar "Sorteio ainda não realizado" (com badge de anulação conforme 3.6).

### 4.15 RF-16 · Persistência (RN-07)
- Tudo (rifas, números, compradores, vendas, sorteios) no banco do servidor; recarregar/fechar o navegador **nunca** perde dados gravados.

### 4.16 RF-18 · Tempo real
- Supabase Realtime (`POSTGRES_CHANGES`) na tabela `numeros` da rifa aberta: grade, progresso e resumo atualizam ao vivo **em todas as telas** (organizador em T3 vê venda registrada por consultor em T4, e vice-versa).

### 4.17 Autenticação, sessão e perfil
- Login `/entrar` (e-mail + senha, Supabase Auth); **sem cadastro público** (conta criada no primeiro provisionamento).
- Primeiro acesso: perfil com **nome de exibição** + **WhatsApp** (`/perfil`), exibidos no rodapé da T4.
- Sessão httpOnly via `@supabase/ssr`; logout disponível.

### 4.18 PWA e offline
- PWA instalável (manifest + service worker leve de shell; botão "Instalar app" na T1 quando suportado).
- Offline: `navigator.onLine` + banner "Sem conexão"; **ações de gravação bloqueadas** sem fila offline (v1).

### 4.19 Contratos de formatação (`lib/formato.ts`)
| Dado | Formato de exibição | Formato gravado |
|---|---|---|
| Número da rifa | padLeft ≥ 3 dígitos: `001`, `037`, `1200` | inteiro int |
| Moeda | `Intl.NumberFormat('pt-BR')` BRL: "R$ 850,00" | numeric(10,2) |
| Telefone | máscara "(XX) XXXXX-XXXX" ao digitar | E.164: `+5511988887777` |
| Data prevista | DD/MM/AAAA | date |
| Data/hora de sorteio | DD/MM/AAAA HH:MM | timestamptz |

---

## 5. Estratégia e Matriz de Testes

### 5.1 Frameworks e padrão
| Tipo | Ferramenta | Onde roda |
|---|---|---|
| Unitários | **Vitest** | Funções de `lib/` (formato, estados, schemas Zod) e lógica de Server Actions |
| Integração | **Vitest + Postgres real local (Supabase CLI)** | RLS, RPC `sortear_rifa`, concorrência de vendas — **com banco de verdade** |
| E2E | **Playwright** | Jornadas completas: criar → vender → sortear; telas públicas; PWA básico |

**Padrão de localização/namespace:** `tests/unit/**` espelhando `lib/` e `actions/`; `tests/integration/**` por tabela/RPC; `tests/e2e/**` por jornadas (ex.: `criar-vender-sortear.spec.ts`).

**⚠️ REGRA DE QUALQUER PR (repetida por ser a norma máster):** cada recurso entregue traz **no mínimo 2 testes** — **Cenário A** (sucesso/caminho feliz) e **Cenário B** (erro/borda/validação) — declarados na matriz abaixo. Nenhum item pode ser marcado como "pronto" sem eles.

### 5.2 Matriz de testes obrigatórios por funcionalidade
> "Int." = teste de integração com Postgres real. A coluna Cenário B lista a validação mais crítica; testes adicionais são bem-vindos.

| Funcionalidade | Cenário A — Sucesso | Cenário B — Erro / Borda |
|---|---|---|
| **RF-01/4.1 `criarRifa`** | E2E: criar rifa válida (título, prêmio, valores, quantidade 100) → registro criado, 100 números, redirect a T3 | Unit: Zod rejeita payload inválido (qtd_minima > quantidade; quantidade 333 fora da lista; preço ≤ 0; título com 2 caracteres) |
| **RF-01 editar** | Int.: editar título/preço de rifa aberta → persiste | Int.: editar `quantidade` com ≥ 1 venda → falha com erro de RN-09 |
| **RF-02 numeração (RF-03 listar)** | Unit: `formatarNumero(1)→"001"`, `(37)→"037"`, `(1200)→"1200"`; Int.: criar rifa gera exatamente N números `disponivel`, únicos | Unit: `formatarNumero(0)` e valores fora de 1..5000 lançam erro |
| **RF-04 resumo financeiro** | Unit: rifa com 37 vendidos a R$ 10 → arrecadado 370,00; potencial 1.000,00 | Int.: usuário `anon` consultando a rifa **não recebe** valores de arrecadação/nomes |
| **RF-05 `registrarVenda` (organizador)** | Int.: registrar Maria Silva / (11) 98888-7777 no nº 037 → número `vendido`, venda `origem='organizador'` | Int.: vender **número já vendido** → erro "Esse número acabou de ser vendido", estado inalterado; Int. (concorrência): duas vendas simultâneas no mesmo número → exatamente 1 sucesso |
| **RF-05a `registrarVenda` (público)** | E2E: visitante em T4 registra comprador em número disponível sem login → pastilha fica "vendido" | Int.: venda pública com telefone inválido (não-E.164) ou nome < 2 caracteres → rejeitada por Zod |
| **RF-06 editar/remover venda** | Int.: editar comprador da venda → venda nova vigente; remover venda (org.) → número volta a `disponivel`, `removida_em` gravado | E2E: no T4 **não existe** opção de remover/editar venda (modal só registra em disponível ou mostra "Número já vendido") |
| **RF-07 busca/filtro** | Unit/E2E: buscar "051" destaca pastilha 051; filtrar "Disponíveis" oculta vendidas | E2E: busca por telefone **parcial** não vaza nomes no T4 público (só organizador busca compradores) |
| **RF-08 encerrar/reabrir** | E2E: encerrar rifa → status `encerrada`, vendas bloqueadas; reabrir → `aberta` novamente | E2E: encerrar com vendas abaixo do mínimo (12/30) → aviso visível "X vendidos — abaixo do mínimo Y…" e opção "encerrar mesmo assim"; Int.: `reabrirVendas` em rifa `sorteada` → falha (transição inválida) |
| **RF-09 sorteio (RPC)** | Int.: rifa `encerrada` com vendas → `sortear_rifa` grava 1 sorteio vigente, status `sorteada`, vencedor ∈ vendidos | Int.: `sortear_rifa` em rifa `aberta` → ABORT `RIFA_ABERTA`; com 0 vendidos → ABORT `RIFA_SEM_VENDIDOS`; **sortear 2×** sem anular → 2ª falha (atomicidade RNF-06) |
| **RF-09a roleta** | E2E: após confirmação, roleta renderiza com nomes dos vendidos e desacelera no resultado servido; resultado no banco é único | Unit: componente acessível sem nomes (0 exibidos quando sem participantes) e nunca bloqueia gravação do resultado |
| **RF-10 privacidade do telefone** | Unit: formatador oculta telefone → "(11) 9••••-••44" na T5 | Int/E2E: `anon` **não consegue** ler telefone completo; revelação por toque funciona **só** autenticado no T3 |
| **RF-11 T4 pública** | E2E: abrir `/r/{slug}` sem login → banner, prêmio com rótulo, progresso com marca do mínimo, grade | E2E: T4 de rifa **arquivada/excluída** ou slug inexistente → 404/mensagem, sem dados; grade pública nunca mostra nome/telefone (validar DOM) |
| **RF-12 T5 resultado próprio** | E2E: `/r/{slug}/resultado` isolada exibe número, nome, 2 dígitos do telefone, data/hora | E2E: rifa sem sorteio → "Sorteio ainda não realizado"; sorteio anulado → badge "Sorteio anulado em…" |
| **RF-13 copiar link/resultado** | E2E: botões copiam link público e texto do resultado para a área de transferência | Unit: texto de resultado gerado com campos ausentes (sem data prevista) não inclui valores "undefined" |
| **RF-14 editar/arquivar/excluir** | Int.: excluir rifa **sem vendas** → registro removido/soft-delete; arquivar rifa → some da T1, dados preservados | Int.: `excluirRifa` com vendas → bloqueada com aviso "Esta rifa tem compras registradas…" (só arquivar) |
| **RF-15 desfazer sorteio** | Int.: desfazer → `anulado_em` marcado, rifa volta a `encerrada`, re-sorteio permitido, histórico preservado | Int.: `desfazerSorteio` em rifa `aberta/encerrada` (sem sorteio vigente) → falha |
| **RF-16 persistência** | E2E: registrar venda → recarregar página → dados intactos | E2E: fechar e reabrir navegador mantém sessão do organizador e dados da rifa |
| **RF-17 upload de foto** | Unit: `enviarFoto` com JPG 3 MB → grava no bucket `premios`, `imagem_url` retornado, preview na T2Edit | Unit: rejeita PDF renomeado (magic bytes) e arquivo > 5 MB, com mensagem pt-BR |
| **RF-18 tempo real** | E2E (2 contextos): venda na T4 reflete pastilha/progresso na T3 aberta sem refresh | Int.: Realtime não entrega linhas de `compradores`/`vendas` para `anon` (payload só de `numeros`) |
| **4.17 login/perfil** | E2E: login com credenciais válidas → T1; perfil salva nome + WhatsApp e aparece no rodapé da T4 | E2E: credenciais inválidas → mensagem de erro, sem sessão; `anon` tentando gravar via DB (bypass de UI) → negado por RLS |
| **4.18 PWA/offline** | E2E: manifest válido; "Instalar app" ofertado quando suportado | E2E: `context.setOffline(true)` → banner "Sem conexão" e botões de gravação desabilitados |
| **RLS (transversal)** | Int.: `anon` SELECT lê rifas/numeros publicados | Int.: `anon` INSERT/UPDATE em qualquer tabela e SELECT em `compradores`/`vendas` → **negado** |

### 5.3 Critério de aceite de qualidade
- **CI (GitHub Actions):** lint → tipos → **todos os testes** → migrações → deploy. Pipeline vermelho = merge bloqueado.
- Suíte mínima por marco: M1·T1/T2 + schemas · M2·vendas/concorrência/Realtime · M3·RPC do sorteio · M4·público/foto/PWA · M5·E2E ponto a ponto (criar→vender→sortear).
- Cobertura focalizada no domínio crítico (sorteio, vendas, RLS) — 100% dos cenários da tabela acima implementados é o piso, não o teto.

---

## 6. Requisitos Não-Funcionais

| ID | Requisito | Como atender / verificar |
|---|---|---|
| **RNF-01** | Multiplataforma: web responsiva de 360px (celular pequeno) a desktop, touch-first | Tailwind mobile-first; testar em 360px |
| **RNF-02** | Online com PWA instalável (ícone na tela inicial); dados no servidor | manifest + service worker; plausável de testar via E2E |
| **RNF-03** | Usabilidade: qualquer operação principal em ≤ 3 toques; rótulos pt-BR claros; fontes grandes; área de toque ≥ 44px | Revisão de design; grade com células confortáveis |
| **RNF-04** | Desempenho: grade de até 5.000 números fluida (paginação em blocos de 100); carregamento da rifa < 2s em 4G | `GradeNumeros` paginada; Server Components; Lighthouse/Playwright |
| **RNF-05** | Privacidade: nomes compradores nunca na grade pública; telefone do ganhador só com 2 últimos dígitos; revelação completa restrita ao organizador | RLS + redação na UI + autorização no servidor; coberto por testes RF-10/RLS |
| **RNF-06** | Confiabilidade: gravação no servidor a cada ação; sorteio atômico (não sorteia 2× sem anular o anterior) | RPC transacional `FOR UPDATE`; teste de sorteio repetido |
| **RNF-07** | Aleatoriedade criptográfica no servidor (nunca `Math.random`) | `crypto.randomInt`/pgcrypto; revisão de código |
| **RNF-08** | Idioma/moeda: todo em pt-BR; Real (BRL), 2 casas | `Intl.NumberFormat('pt-BR')`; revisão de copy e toasts |

**Limites operacionais e infra:**
- Área de teste constante: "rifas de até 5.000 números".
- Planos gratuitos confortáveis: Vercel Hobby (deploy/HTTPS/CDN) · Supabase DB 500 MB (~100 mil números cabem em poucos MB) · Storage 1 GB (~200 fotos pós-compressão) · Auth 50 mil usuários/mês (1 organizador).
- **Custo mensal alvo: R$ 0** com os planos gratuitos.
- **Deploy/CI:** variáveis `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (somente servidor); pipeline lint→tipos→testes→migrações→deploy; backup diário (7 dias, Supabase free) + export do Storage; monitor de uptime (ex.: UptimeRobot free) em `/r/{slug}` de rifa-teste.
- **Roteiro de marcos** (prazos em `ESPECIFICACAO_TECNICA.md` §9): M1 Fundação → M2 Gestão → M3 Ciclo+sorteio → M4 Público+foto+PWA → M5 Polimento. Cada marco só é "feito" com seus testes da matriz 5.2 verdes no CI.

---

*Fim da especificação. Este documento substitui consultas pontuais a `PRODUTO.md`/`ESPECIFICACAO_TECNICA.md` como referência de implementação; divergências devem ser resolvidas em favor deste arquivo e os originais atualizados em seguida.*
