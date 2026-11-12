# Documento de Produto — Rifa App

**Versão:** 1.1 — Data: 08/11/2026
**Status:** Aprovado pelo dono do produto

---

## 1. Visão Geral

O **Rifa App** é um aplicativo web para criação, controle e sorteio de rifas. O organizador cria uma rifa informando prêmio, preço do número, quantidade de números e qtd minima de números vendidos para sorteio; durante a venda, marca cada número como vendido registrando nome e telefone do comprador; ao encerrar o período de vendas, realiza o sorteio entre os números vendidos.

O aplicativo é acessado pelo **navegador** (computador ou celular), funciona **online** com **persistência de dados** e foi desenhado para ser **simples**: qualquer pessoa com pouca experiência técnica deve conseguir usá-lo sem treinamento.

### 1.1 Objetivos

| Objetivo                      | Descrição                                                                               |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| Simplificar a gestão de rifas | Substituir controles manuais (caderno, planilha, listas de WhatsApp) por um único lugar |
| Dar transparência             | Mostrar publicamente quais números estão vendidos/livres                                |
| Sorteio justo e comprovável   | Sorteio apenas entre números vendidos, com registro do resultado                        |
| Acesso universal              | Funcionar em celular e computador, sem instalar nada                                    |

### 1.2 Público-alvo

- **Organizador de rifa** (persona principal): pessoa que promove uma rifa para arrecadar fundos (igreja, escola, ONG, evento, família). Realiza rifas de forma eventual ou recorrente.
- **Comprador / Consultor** (persona secundária): pessoa que consulta a rifa para ver a lista de números e o prêmio (a marcação de vendas continua sendo feita pelo organizador, conforme escopo, mas também pode ser feita pelo consultor pela tela publica).

### 1.3 Fora de escopo (versão 1)

Para manter a simplicidade, **não** estão incluídos na primeira versão:

- Pagamento online integrado (Pix automático, cartão)
- Compra self-service pelo visitante (o visitante não marca números; o organizador marca)
- Múltiplos organizadores por rifa com permissões diferenciadas
- Envio automático de mensagens/WhatsApp para compradores
- Relatórios financeiros avançados
- App nativo (instalação em loja)

Cada item pode entrar futuramente como evolução (ver seção 7).

---

## 2. Regras de Negócio

**RN-01 — Quantidade de números:** o organizador escolhe a quantidade entre tamanhos padrão: 25, 50, 100, 200, 500, 1000 e 5000 (opcional: valor livre até 5000). A numeração vai de **001 até quantidade**, sempre com 3+ dígitos e zero à esquerda (ex.: 001, 002, … 099, 100).

**RN-02 — Valor:** o prêmio e o preço do número são valores monetários em Real (R$), com duas casas decimais. O preço do número deve ser maior que zero. As telas **públicas** (T4/T5) **não exibem arrecadação** nem valores totais de faturamento; o resumo financeiro (arrecadado e potencial) fica restrito ao **painel do organizador (T3)**. O valor do prêmio usa um **rótulo** escolhido pelo organizador: "Valor estimado de", "Mais de" ou "Até" (evita prometer valor exato do prêmio).

**RN-03 — Venda:** o **organizador** marca números como vendidos no painel (T3) e o **consultor** pode registrar um comprador pela tela pública (T4), apenas em números **disponíveis** e somente preenchendo **nome** e **telefone**. Somente o organizador pode **editar/transferir** um registro existente ou **remover** uma venda. Um número vende-se uma única vez.

**RN-04 — Estados do número:**

- **Disponível** — não vendido
- **Vendido** — com comprador registrado
- **Sorteado** — resultado do sorteio (o número vencedor)

**RN-05 — Ciclo da rifa:**

- **Aberta** → vendas em andamento (marcação liberada)
- **Encerrada** → vendas suspensas, sorteio liberado
- **Sorteada** → resultado publicado, imutável (a menos que o organizador "desfaça" o sorteio — ver RN-08)

**RN-06 — Sorteio:** realizado **somente sobre números vendidos**. O organizador encerra as vendas antes de sortear. Deve haver uma **animação de uma roleta girando** com os primeiros nomes dos participantes (dar emoção). O resultado exibe: número sorteado, nome e **os dois últimos dígitos do telefone** do comprador (como o sorteio pode estar sendo filmado, para o organizador ver o telefone completo basta **tocar sobre os dois dígitos** — revelação restrita ao painel T3), além de data/hora do sorteio. A **quantidade mínima** não impede o sorteio: ela gera apenas um **aviso no momento de encerrar as vendas** ("vendas abaixo do mínimo definido — encerrar mesmo assim?"); no momento do sorteio não há bloqueio nem aviso, o organizador simplesmente prossegue.

**RN-07 — Persistência:** todas as rifas, números, compradores e sorteios ficam salvos no servidor (banco de dados). Ao reabrir o app, os dados continuam lá. Nada é perdido por fechar o navegador.

**RN-08 — Desfazer sorteio (recontagem):** para segurança operacional, o organizador pode **desfazer** um sorteio e voltar a rifa ao estado "Encerrada"; o evento fica registrado no histórico com data/hora (auditoria simples, **não exibida em tela**), e o resultado anterior não é apagado — fica marcado como "anulado".

**RN-09 — Exclusão:** é permitido **editar** a rifa enquanto ela está "Aberta" (título, descrição, prêmio, preço, imagem) — mas **não** a quantidade de números, se algum já foi vendido. A rifa pode ser **excluída** somente se nenhum número foi vendido; com vendas, o máximo é **arquivar** (fica fora da listagem principal, mas preserva os dados).

**RN-10 — Acesso simples:** para a versão 1, o acesso é por **links únicos por rifa** (o organizador guarda os links) + uma senha mestra simples definida no primeiro uso para funções de organizador, OU via conta única de organizador (ver decisão na especificação técnica, seção "Autenticação"). O comprador/consultor acessa a tela pública da rifa sem senha.

**RN-11 — Foto do prêmio:** opcional na criação. Formatos aceitos: JPG, PNG, WEBP. Tamanho máximo: 5 MB. O app redimensiona para exibição responsiva.

---

## 3. Telas

A navegação tem **uma lista de rifas** como ponto de partida e **uma tela por rifa**. Total: **5 telas** + 1 modal (editor de número).

### 3.1 Mapa de telas

```
┌─────────────────────────────┐
│  T1 · Minhas Rifas (home)   │
└──────────┬──────────────────┘
           │ + Nova rifa
           ▼
┌─────────────────────────────┐      ┌──────────────────────────────┐
│  T2 · Criar/Editar Rifa     │─────▶│  T1 · Minhas Rifas           │
└─────────────────────────────┘      └──────────┬───────────────────┘
                                                │ abre painel (T3)
                                                ▼
                        ┌────────────────────────────────────────┐
                        │  T3 · Painel da Rifa (gestão)          │
                        │   • dados, progresso, grid de números  │
                        │   • modal T3a: registrar comprador     │
                        │   • ações: encerrar → sorteio          │
                        └────────────────┬───────────────────────┘
                                         │ compartilha link/sorteia
                                         ▼
                        ┌────────────────────────────────────────┐
                        │  T4 · Tela pública da Rifa (consultor) │
                        │  T5 · Resultado do Sorteio (público)   │
                        └────────────────────────────────────────┘
```

---

### T1 · Minhas Rifas (Home)

**Objetivo:** ver todas as rifas e acessar rapidamente a que está ativa.

**Elementos:**

- Cabeçalho com nome do app ("Rifa App") e botão **+ Nova Rifa**
- **Vazio** (primeiro uso): ilustração/texto "Você ainda não tem rifas. Crie a primeira!" + botão criar
- **Card por rifa** com:
  - Miniatura da imagem do prêmio (ou ícone de presente quando não houver foto)
  - Título da rifa
  - Prêmio e preço do número (ex.: "Prêmio: Forno R$ 850 · Número R$ 10")
  - Barra de progresso de vendas: `vendas / total` (ex.: 37/100)
  - Badge de status: 🟢 **Aberta** · 🔒 **Encerrada** · 🎉 **Sorteada**
  - Menu de atalhos (⋮): abrir, editar, arquivar
- Filtro simples por status (Todas / Abertas / Encerradas / Sorteadas)

**Ações:** tocar em card → abre **T3**. Tocar em "+ Nova Rifa" → abre **T2**.

---

### T2 · Criar / Editar Rifa

**Objetivo:** formulário único, enxuto, com validações claras.

**Campos:**

| Campo                         | Obrig. | Formato / notável                                                                               |
| ----------------------------- | ------ | ----------------------------------------------------------------------------------------------- |
| Título                        | ✔      | texto livre, até 60 caracteres, contador visível                                                |
| Descrição                     | ✖      | texto livre, até 500 caracteres                                                                 |
| Prêmio (descrição)            | ✔      | texto (ex.: "Forno elétrico", "Cesta natalina")                                                 |
| **Label do valor do prêmio**  | ✔      | seletor: Valor estimado · Mais de · Até                                                         |
| **Valor do prêmio (R$)**      | ✔      | número decimal, formato moeda                                                                   |
| **Valor de cada número (R$)** | ✔      | número decimal, maior que zero                                                                  |
| **Quantidade de números**     | ✔      | seletor: 25 · 50 · 100 · 200 · 500 · 1.000 · 5.000                                              |
| **Quantidade mínima**         | ✔      | Número inteiro de 0 até a quantidade de números escolhida (usado como aviso ao encerrar vendas) |
| Foto do prêmio                | ✖      | upload ou câmera no celular; preview imediato; máx. 5 MB                                        |
| Data prevista do sorteio      | ✖      | data opcional, apenas informativa (exibida no painel e na tela pública)                         |

**Validação em tempo real:** evidencia preenchimento faltante e valores negativos. Botão **Criar Rifa** fica inativo até o formulário mínimo estar válido.

**Regras:**

- Em modo **edição**, campo de "Quantidade de números" fica desabilitado se já houver número vendido (RN-09).
- "Criar" gera a lista de números vazia (todos "Disponíveis") e redireciona para **T3**.
- Ao criar, o app registra o **link público** da rifa e o exibe com botão **Copiar link** (para divulgar no WhatsApp).

> No **primeiro acesso**, o organizador informa **nome de exibição** e **WhatsApp/telefone de contato** (perfil da conta, uma única vez). Esses dados aparecem no rodapé da tela pública (T4).

---

### T3 · Painel da Rifa (tela de gestão)

**Objetivo:** a tela de trabalho do organizador: ver e gerenciar todas as vendas da rifa.

**Estrutura:**

1. **Cabeçalho da rifa**
   - Imagem do prêmio (banner), título, descrição
   - Prêmio e Valor (ex.: "Forno elétrico — valor estimado R$ 850")
   - "Número: R$ 10 · Quantidade: 100 · Total potencial: R$ 1.000"
   - Status (badge) + data prevista do sorteio (se preenchida)
   - Botão **Copiar link público** (compartilhar com compradores/consultores)

2. **Painel de resumo** (cartões, dashboard compacto)
   - Vendidos / Total (ex.: 37/100 — com percentual)
   - Disponíveis
   - Arrecadado até agora (R$) — soma dos números vendidos
   - Previsão total (R$) — se vender todos

3. **Ferramentas de busca na lista**
   - **Buscar número** por número exato (ex.: "37") — destaca/mostra o número
   - **Buscar comprador** por nome ou telefone — revela números vendidos para aquela pessoa
   - Filtro: Todos / Disponíveis / Vendidos

4. **Grade de números** (o componente central)
   - Todos os números em sequência (001 a quantidade; ex.: 001 a 100 numa rifa de 100), cada um como uma **pastilha/célula**
   - **Disponível:** fundo claro, número na cor normal, tocável
   - **Vendido:** fundo verde/colorido com um símbolo ✓ (ou cor de venda), tocável
   - **Sorteado (após sorteio):** destaque especial (estrela/destaque dourado)
   - Em telas pequenas, a grade permanece em colunas compactas com rolagem vertical natural.
   - Em rifas de 1.000 e 5.000 números, a grade é paginada por blocos de 100 (001–100, 101–200, …) com navegação "‹ anterior / próxima ›" e salto direto por bloco.

5. **Modal T3a · Registrar comprador**
   Abre ao **tocar num número** (disponível ou vendido):
   - Título: "Número 037"
   - Campos: **Nome do comprador** (obrigatório), **Telefone** (obrigatório, com máscara (XX) XXXXX-XXXX)
   - Se o número já estava vendido, os dados aparecem preenchidos (edição/transferência)
   - Botões: **Salvar venda** · **Remover venda** (liberar número — pede confirmação) · **Cancelar**
   - No **link público (T4)**, o modal é enxuto: permite apenas **registrar comprador em número disponível**; se o número já está vendido, exibe "Número já vendido" e não abre edição
   - Ao salvar: a pastilha do número muda para "vendido" instantaneamente (feedback visual) e o resumo (2) é atualizado.

6. **Barra de ações da rifa** (fixa no rodapé ou no topo, conforme etapa)
   - **Rifa Aberta:** [🔒 Encerrar vendas] (pede confirmação; **se as vendas estiverem abaixo da quantidade mínima, exibe o aviso "X vendidos — abaixo do mínimo Y. Encerrar mesmo assim?"** e o organizador decide) — [✏️ Editar] — [Arquivar]
   - **Rifa Encerrada:** [🎉 Realizar Sorteio] (destaque grande, pede confirmação mostrando "O sorteio será feito entre X números vendidos") — [↩️ Reabrir vendas]
   - **Rifa Sorteada:** [🏆 Ver resultado] — [Desfazer sorteio (RN-08)] — [Arquivar]

---

### T4 · Tela pública da Rifa (consultor/comprador)

**Objetivo:** página que o organizador compartilha via link; o consultor/comprador visualiza a rifa e a lista de números e pode **registrar um comprador em número disponível**; editar, transferir ou remover uma venda já registrada é exclusivo do organizador (painel T3).

**Elementos:**

- Banner com imagem do prêmio, título, descrição
- Prêmio com rótulo e valor (ex.: "Mais de R$ 500 — Forno elétrico") · preço do número · data prevista do sorteio (se não informada, o campo não é exibido)
- Barra de progresso de vendas (ex.: "37 de 100 números vendidos") com marca visual do mínimo definido
- Grade de números: disponíveis tocáveis (registro de venda), vendidos apenas marcados ("vendido") — sem nome e sem telefone de compradores
- Busca rápida de número ("o 57 já foi vendido?") na versão 1 (opcional)
- Rodapé: "Para comprar, fale com o organizador" + contato do organizador (nome de exibição e WhatsApp definidos no perfil da conta)

> Decisão de produto: na v1 o comprador não paga diretamente pelo app (fora de escopo).

---

### T5 · Resultado do Sorteio (público)

**Objetivo:** publicar e comemorar o resultado — também acessível pelo link público.

**Elementos:**

- Visual de destaque: 🎉 "Número sorteado: **047**"
- Card grande com: número · **nome do comprador** · **telefone com apenas os 2 últimos dígitos visíveis** (ex.: "(11) 9••••-••44" — a revelação completa fica restrita ao painel T3, RN-06) · prêmio com rótulo (ex.: "Mais de R$ 500 — Forno elétrico")
- Data e hora do sorteio
- Botão "Copiar resultado" (texto formatado para colar no WhatsApp)
- Se o organizador desfez o sorteio (RN-08): o resultado anterior exibe badge "Sorteio anulado em DD/MM/AAAA HH:MM" e a tela pública volta a mostrar "Sorteio ainda não realizado".

---

## 4. Fluxos de Uso (end-to-end)

### F1 · Criar uma rifa (happy path)

1. Organizador abre o app → **T1**.
2. Toca **+ Nova Rifa** → **T2**.
3. Preenche: Título "Rifa do Forno", Prêmio "Forno elétrico 220V", Valor do prêmio "850,00", Valor do número "10,00", Quantidade "100", foto (tirada na hora pelo celular).
4. Toca **Criar Rifa** → sistema cria a rifa com 100 números disponíveis e abre **T3**.
5. O app mostra o **link público** com botão copiar; o organizador cola no grupo de WhatsApp.

### F2 · Registrar venda (loop principal)

1. Comprador confirma interesse pelo WhatsApp.
2. O organizador abre **T3** (ou o consultor abre **T4** pelo link público) → toca o número **037** na grade.
3. Modal **T3a** abre com título "Número 037".
4. Preenche Nome "Maria Silva" e Telefone "(11) 98888-7777" → **Salvar venda**.
5. Modal fecha; número 037 fica verde com ✓; no **T3** o resumo sobe para 38/100 e o arrecadado é recalculado (no **T4** apenas a grade é atualizada — sem valores financeiros).
6. O organizador envia comprovante/aviso ao comprador (fora do app).

_feliz alternativa:_ comprador desiste → organizador abre o número 037 → **Remover venda** → confirma → número volta a "Disponível". (Opção **não disponível** pelo link público — só o organizador.)

_alternativa:_ recarregar a página/fechar o app não perde nada — dados são gravados no servidor a cada salvamento (RN-07).

### F3 · Acompanhar e buscar

1. Alguém pergunta "o 051 vendeu?".
2. Organizador (ou o próprio consultor via link público) busca "051" ou filtra por "Disponíveis".
3. A pastilha 051 aparece em destaque com estado atual.

### F4 · Encerrar e sortear

1. Fim do prazo de vendas → organizador em **T3** toca **Encerrar vendas** → confirmação; **se as vendas estiverem abaixo do mínimo (ex.: 12/30)**, o aviso destaca isso e o organizador decide **encerrar mesmo assim** ou **continuar vendendo** → status 🔒 **Encerrada**.
2. Organizador toca **Realizar Sorteio** → confirmação mostra: "O sorteio será feito entre 82 números vendidos." → confirma. (Sem novo aviso sobre o mínimo.)
3. Sistema sorteia aleatoriamente entre os 82 números vendidos, exibe por alguns segundos a **animação de uma roleta girando com os primeiros nomes dos participantes** (dar emoção) → grava resultado (número, comprador, data/hora) → status 🎉 **Sorteada**.
4. App abre/cai em **T5** com o vencedor em destaque; link da rifa passa a exibir o resultado publicamente.

### F5 · Consultar rifa pelo link (comprador)

1. Comprador recebe link no WhatsApp → abre **T4** no navegador do celular.
2. Vê prêmio, preço, barra de progresso e a lista de números.
3. Diz ao organizador qual número quer (ex.: "quero o 57") → organizador ou consultor registra a venda (F2).

### F6 · Ver resultado

1. Consultor abre o link da rifa → **T5** (ou via **T4**, com botão "Ver resultado").
2. Vê número, nome do ganhador, data do sorteio; pode copiar o resultado para divulgar.

### F7 · Erro/contorno (situações de exceção)

- **Sorteio sem vendas:** se o organizador tentar sortear com **0 vendidos**, o app bloqueia e informa "A rifa não tem números vendidos; o sorteio não pode ser realizado." A rifa permanece encerrada (ele pode reabrir ou arquivar).
- **Sorteio abaixo do mínimo:** o aviso acontece **uma única vez**, no momento de encerrar as vendas (F4). No sorteio, nenhum aviso relacionado ao mínimo — apenas prossegue.
- **Sorteio errado:** organizador desfez o sorteio (RN-08) → T5 mostra "anulado" e a rifa volta a "Encerrada" para re-sorteio.
- **Excluir rifa com vendas:** tentativa de excluir → aviso "Esta rifa tem compras registradas. Você pode arquivá-la para preservar o histórico." → só arquivar.
- **Sem internet:** o app detecta offline e avisa "Sem conexão — os dados não serão salvos até reconectar"; operações de gravação são bloqueadas com mensagem clara (v1 simples: sem fila offline).

---

## 5. Requisitos Funcionais (resumo numerado)

| ID     | Requisito                                                                                                                                                                                                                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RF-01  | Criar rifa com: título, descrição (opc), nome do prêmio, **rótulo do valor do prêmio** (Valor estimado · Mais de · Até) e valor, valor do número, quantidade (25–5.000), quantidade mínima, foto (opc), data prevista (opc) |
| RF-02  | Gerar automaticamente a lista de números de **001 até a quantidade**, com zero à esquerda e no mínimo 3 dígitos                                                                                                             |
| RF-03  | Listar rifas na home com status, progresso de vendas e foto                                                                                                                                                                 |
| RF-04  | Exibir painel da rifa (T3) com dados, resumo financeiro **visível apenas aqui** (vendidos/total, disponíveis, arrecadado, potencial) e grade de números                                                                     |
| RF-05  | Ao tocar um número, abrir modal para informar nome e telefone do comprador; salvar marca como vendido                                                                                                                       |
| RF-05a | Pelo **link público (T4)**, permitir registrar comprador apenas em números disponíveis; edição/transferência/remoção exclusivas do organizador (T3)                                                                         |
| RF-06  | Editar e remover venda (transferência/desistência), com confirmação na remoção                                                                                                                                              |
| RF-07  | Buscar por número e por comprador (nome/telefone); filtrar por estado                                                                                                                                                       |
| RF-08  | Encerrar vendas (bloqueia novas marcações) e reabrir; **ao encerrar abaixo da quantidade mínima, exibir aviso e deixar o organizador decidir**                                                                              |
| RF-09  | Realizar sorteio somente entre números vendidos (bloqueia com 0 vendidos), com confirmação prévia                                                                                                                           |
| RF-09a | **Animação de roleta** com os primeiros nomes dos participantes durante o sorteio                                                                                                                                           |
| RF-10  | Registrar e exibir resultado do sorteio: número, comprador, data/hora; telefone exibido apenas com **2 últimos dígitos** (revelação completa só no painel do organizador, ao tocar)                                         |
| RF-11  | Tela pública por link com dados, progresso com marca do mínimo e lista de números; telefone e nomes dos compradores não expostos na grade                                                                                   |
| RF-12  | Tela pública de resultado do sorteio em **rota própria** (#/r/{slug}/resultado)                                                                                                                                             |
| RF-13  | Copiar link da rifa e copiar o texto do resultado para compartilhamento                                                                                                                                                     |
| RF-14  | Editar rifa (exceto quantidade com vendas); arquivar; excluir só sem vendas                                                                                                                                                 |
| RF-15  | Desfazer sorteio, mantendo histórico do resultado anulado (invisível em tela)                                                                                                                                               |
| RF-16  | Persistir tudo em banco de dados no servidor (rifas, números, compradores, sorteios)                                                                                                                                        |
| RF-17  | Upload e redimensionamento de imagem de prêmio (JPG/PNG/WEBP, máx 5 MB)                                                                                                                                                     |
| RF-18  | Refletir vendas em tempo real na grade e atualizar resumos/percentuais a cada venda                                                                                                                                         |

## 6. Requisitos Não-Funcionais

| ID     | Requisito                                                                                                                                                                       |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| RNF-01 | **Multiplataforma:** web responsiva, 360px (celular pequeno) a desktop; touch-first                                                                                             |
| RNF-02 | **Online:** funciona como site com **PWA** (instalável na tela inicial do celular, com ícone); dados no servidor                                                                |
| RNF-03 | **Usabilidade:** qualquer operação principal em ≤ 3 toques; rótulos em português claro; fontes grandes e botões com área ≥ 44px                                                 |
| RNF-04 | **Desempenho:** grade de até 5.000 números fluida (paginação/virtualização); tempo de carregamento da rifa < 2s em 4G                                                           |
| RNF-05 | **Privacidade:** nomes dos compradores não aparecem na grade pública; telefone do ganhador aparece apenas com 2 últimos dígitos, com revelação completa restrita ao organizador |
| RNF-06 | **Confiabilidade:** gravação no servidor em cada ação; sortear é atômico (não sorteia duas vezes sem que o registro anterior seja anulado)                                      |
| RNF-07 | **Aleatoriedade:** sorteio com gerador aleatório criptográfico do servidor (não `Math.random`), para confiança                                                                  |
| RNF-08 | **Idioma:** todo em português (pt-BR); moeda Real                                                                                                                               |

---

## 7. Evoluções Futuras (pós-versão 1)

Ordem sugerida por valor/complexidade:

| Fase | Melhoria                                                                              | Valor                                |
| ---- | ------------------------------------------------------------------------------------- | ------------------------------------ |
| 2    | Compra self-service: visitante escolhe e "reserva" número; organizador confirma       | Reduz trabalho manual do organizador |
| 2    | Integração Pix: chave Pix exibida a cada compra + confirmação automática de pagamento | Agiliza arrecadação                  |
| 2    | Sorteio com transmissão ao vivo / link direto para acompanhar                         | Transparência e engajamento          |
| 3    | Notificações: lembrete automático quando o sorteio estiver próximo                    | Reduz rifas esquecidas               |
| 4    | Extrato financeiro por rifa (vendido, recebido, a receber)                            | Controle financeiro                  |
