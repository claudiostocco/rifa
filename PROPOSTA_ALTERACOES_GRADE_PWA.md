# Proposta de alterações — grade responsiva e PWA por rifa

**Status:** aprovada para implementação  
**Data:** 16/11/2026  
**Escopo:** somente documentação; nenhuma implementação foi realizada.

## 1. Resumo

Esta proposta cobre duas melhorias:

1. adaptar a grade de números das telas T3 e T4 para aproveitar melhor telas com
   largura de viewport a partir de 800 px e facilitar fotografias/capturas do
   bloco completo para compartilhamento em WhatsApp e redes sociais;
2. permitir a instalação de um atalho PWA que abra diretamente a rifa pública
   selecionada.

As duas mudanças preservam o comportamento mobile-first, a URL pública
`/r/{slug}`, a paginação em blocos de 100 e as regras de privacidade da grade
pública.

## 2. Alteração 1 — grade em telas maiores

### Comportamento proposto

- Até 799 px: manter o layout mobile atual, com 5 colunas.
- A partir de 800 px: usar 10 colunas (com 9 colunas como alternativa de
  ajuste visual, caso a validação em dispositivos reais recomende pastilhas
  maiores).
- Manter a grade centralizada com `max-width: 700px`.
- Manter células quadradas (`aspect-ratio: 1`) e área de toque mínima de 44 px.
- Manter a paginação em blocos de 100; a quantidade de números exibidos no
  bloco não muda.
- Aplicar o mesmo comportamento em T3 (organizador) e T4 (público).

Com 10 colunas, um bloco de 100 números terá exatamente 10 linhas. Com 9
colunas, terá 12 linhas (a última incompleta). A recomendação de 10 colunas
prioriza que o bloco de 100 números fique mais compacto para ser fotografado ou
capturado em uma tela maior, sem alterar a numeração ou carregar mais dados.

### Regra visual sugerida

```text
grade:
  grid-template-columns: repeat(5, minmax(0, 1fr))
  @media (min-width: 800px):
    grid-template-columns: repeat(10, minmax(0, 1fr))
  max-width: 700px
```

Os valores exatos de espaçamento e tamanho da célula serão ajustados ao
design system existente, sem reduzir a acessibilidade ou criar rolagem
horizontal. Dentro de 700 px, 10 colunas devem manter células acima da área
mínima de toque; essa condição será validada em viewport de 800 px e em telas
maiores.

### Critérios de aceite

- Em viewport de 360 px, a grade continua com 5 colunas e células tocáveis.
- Em viewport de 800 px ou maior, a grade apresenta 10 colunas, salvo se a
  validação visual aprovar a alternativa de 9 colunas.
- A largura da grade nunca ultrapassa 700 px.
- Um bloco completo de 100 números ocupa exatamente 10 linhas no modo de 10
  colunas, favorecendo fotografia/captura de tela.
- A navegação anterior/próxima e o salto por bloco continuam funcionando.
- Uma rifa de 5.000 números continua renderizando somente o bloco atual de
  100 números.
- T3 continua exibindo dados de comprador somente para o organizador.
- T4 continua exibindo apenas os estados dos números, sem nome ou telefone.

### Testes previstos

1. **Caminho feliz — unitário:** `GradeNumeros` renderiza a grade desktop com
   10 colunas (ou 9, se essa alternativa for aprovada na validação visual) e a
   grade mobile com 5 colunas, preservando os números e estados.
2. **Borda — E2E/responsividade:** em viewport de 800 px, a grade não excede
   700 px, o bloco de 100 números permanece compacto para captura, e em 360 px
   não há rolagem horizontal e a célula mantém área de toque adequada.
3. Atualizar os testes existentes de T3/T4 e da paginação, caso as asserções
   atuais dependam da quantidade de colunas.

## 3. Alteração 2 — PWA/atalho por rifa pública

### Objetivo

Na tela pública T4, oferecer ao organizador ou consultor uma ação para instalar
um atalho que abra diretamente a rifa específica, sem passar pela T1 ou por
outra tela do aplicativo.

O atalho deve apontar para:

```text
/r/{slug}
```

### Comportamento proposto

- Disponibilizar na T4 uma ação **“Instalar atalho desta rifa”**.
- Gerar um manifesto PWA específico para o `slug`, com:
  - `start_url` igual a `/r/{slug}`;
  - `id` estável baseado na URL pública da rifa;
  - nome derivado do título da rifa, com fallback para “Rifa App”;
  - ícones já existentes do aplicativo;
  - tema e modo visual compatíveis com o PWA atual.
- Associar o manifesto específico à página T4 enquanto ela estiver aberta.
- Ao iniciar pelo atalho instalado, abrir diretamente a T4 da rifa.
- Manter o service worker e o shell compartilhado do aplicativo; não criar um
  service worker por rifa.
- Se o navegador não oferecer instalação PWA, exibir uma orientação em
  pt-BR, sem fingir que a instalação ocorreu.
- O atalho não concede autenticação nem permissões adicionais. A venda
  continua passando pela mesma Server Action, validação, rate limit e regras
  de concorrência.

### Importante sobre a plataforma

A instalação depende do suporte do navegador e do sistema operacional. Em
alguns navegadores, a ação poderá apenas orientar o usuário a usar o menu
“Adicionar à tela inicial”. O produto não consegue forçar o prompt nativo.

Também deve ser evitada a instalação de várias rifas com o mesmo identificador
de aplicativo. Cada rifa precisa de um `id` de manifesto distinto para que o
sistema operacional trate os atalhos como aplicativos/atalhos separados.

### Critérios de aceite

- T4 de uma rifa publicada referencia um manifesto cujo `start_url` é a T4
  daquela rifa.
- O manifesto de duas rifas diferentes possui `id` e `start_url` diferentes.
- Abrir o atalho leva diretamente a `/r/{slug}`.
- Slug inexistente, rifa arquivada ou rifa excluída não gera manifesto
  instalável nem revela dados da rifa.
- O botão/ação aparece somente quando a instalação é suportada ou quando há
  uma orientação útil para o navegador atual.
- O PWA geral já existente na T1 continua funcionando.
- O manifesto não inclui dados pessoais de compradores, telefone de comprador,
  vendas ou valores de arrecadação.

### Testes previstos

1. **Caminho feliz — E2E:** abrir T4, validar o manifesto específico e
   confirmar que `start_url` corresponde ao `slug` da rifa; validar também a
   oferta de instalação quando o navegador de teste suportar o fluxo.
2. **Borda/segurança — E2E:** solicitar manifesto para slug inexistente,
   arquivado ou excluído e confirmar resposta de não encontrado, sem conteúdo
   da rifa.
3. **Regressão — E2E:** validar que o manifesto geral e a instalação ofertada
   na T1 continuam válidos.

## 4. Arquivos e áreas potencialmente afetados

### Grade

- `components/GradeNumeros.tsx`
- estilos/configuração Tailwind associada à grade, se necessário
- testes unitários da grade
- testes E2E de T3 e T4

### PWA por rifa

- `app/r/[slug]/page.tsx` ou metadados da rota pública
- rota/handler de manifesto dinâmico para `/r/{slug}`
- componente de instalação/estado do prompt na T4
- `public/manifest.webmanifest` e `public/sw.js`, somente se a integração
  exigir ajuste de compatibilidade
- testes E2E do PWA

Não está prevista alteração de banco, tabelas, RLS, Server Actions de venda ou
contratos de venda.

## 5. Compatibilidade com a documentação atual

- **SPEC §2.1, §4.18 e §5.2:** preserva o PWA instalável e adiciona cobertura
  para a instalação contextual na T4.
- **SPEC §2.8 e §3.5:** usa a rota pública existente `/r/{slug}`.
- **SPEC §3.4 e §4.7:** mantém a grade do T3 e sua busca/filtros.
- **SPEC §4.11:** mantém T4 acessível sem login.
- **SPEC §2.3, §3.5, §4.5 e RNF-05:** não expõe dados pessoais ou
  arrecadação na T4.
- **SPEC RNF-01, RNF-03 e RNF-04:** preserva responsividade, área de toque e
  paginação.
- **ESPECIFICAÇÃO TÉCNICA §§2.1, 2.2, 5 e 6:** mantém App Router, manifest +
  service worker compartilhado e `GradeNumeros` paginada.

## 6. Decisões necessárias antes da implementação

### Decisão A — quantidade de colunas no desktop

**Decisão aprovada:** usar 10 colunas a partir de 800 px, com
`max-width: 700px`. Essa opção faz o bloco de 100 números caber em 10 linhas,
atendendo melhor à fotografia/captura para WhatsApp e redes sociais.

Alternativa: usar 9 colunas para aumentar ligeiramente o tamanho das pastilhas,
aceitando 12 linhas no bloco de 100 números. A escolha final deve considerar a
legibilidade da foto em um dispositivo real.

### Decisão B — escopo do atalho instalado

**Decisão aprovada:** o atalho abrirá diretamente a T4 da rifa e permanecerá no
shell compartilhado do Rifa App. A navegação para o resultado seguirá
disponível pela própria T4.

Alternativa: limitar o `scope` do manifesto à rifa, isolando mais a navegação,
mas isso pode tornar a experiência menos consistente e exigir mais tratamento
de navegação.

### Decisão C — quem vê a ação de instalação

**Decisão aprovada:** mostrar a ação na T4 para qualquer visitante, pois o link é
público e o objetivo inclui consultores. O organizador também poderá usar a
mesma ação pelo link público.

Alternativa: mostrar somente ao organizador, o que não atende tão bem ao uso
por consultores.

## 7. Fora do escopo desta proposta

- Não haverá venda offline ou fila de vendas.
- Não haverá autenticação automática por atalho.
- Não haverá um PWA nativo separado por rifa.
- Não haverá mudança no modelo de dados ou nos links públicos existentes.
- Não haverá redimensionamento da grade acima de 700 px.
- Não haverá alteração da privacidade da T4.

## 8. Próximo passo após aprovação

A implementação foi autorizada após a aprovação das decisões A, B e C. Ela
deve ser acompanhada de uma tarefa formal no `PLAN.md`, com código e testes no
mesmo conjunto de alterações. Antes de marcar a tarefa como concluída, deverão
passar:

```text
pnpm lint
pnpm typecheck
pnpm test
pnpm test:int   (se houver alteração de integração)
pnpm test:e2e
pnpm build
```
