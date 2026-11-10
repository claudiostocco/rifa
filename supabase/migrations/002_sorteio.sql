-- =====================================================================
-- Rifa App · Migração 0002 (SPEC.md §2.4 RPC do sorteio, §4.9 RF-09)
-- Função transacional sortear_rifa: trava a rifa (FOR UPDATE), confere
-- estado (RIFA_ABERTA / RIFA_SEM_VENDIDOS), sorteia com aleatoriedade
-- criptográfica (RNF-07), grava resultado e muda status em um COMMIT
-- único (tudo ou nada). RNF-06: 2º sorteio sem anular o vigente falha.
-- Idioma dos comentários de negócio: pt-BR.
-- =====================================================================

-- gen_random_bytes (pgcrypto) alimenta a aleatoriedade criptográfica
-- do servidor — RNF-07 veda Math.random e qualquer azar client-side
create extension if not exists pgcrypto;

create or replace function public.sortear_rifa(rifa uuid)
returns uuid
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  status_rifa          text;
  total_vendidos       int;
  bytes_azar           bytea;
  k                    int;
  numero_sorteado_id   uuid;
  comprador_sorteado_id uuid;
  novo_sorteio_id      uuid;
begin
  -- 1) Trava a rifa: FOR UPDATE serializa chamadas concorrentes (RNF-06).
  --    security invoker: o acesso oficial é a Server Action `sortear` com
  --    service_role (bypass de RLS); via key de organizador o próprio RLS
  --    impede tocar rifas de terceiros (sem linha → RIFA_INEXISTENTE).
  select r.status into status_rifa
  from public.rifas r
  where r.id = rifa
  for update;

  if status_rifa is null then
    raise exception 'RIFA_INEXISTENTE: a rifa informada não existe.';
  end if;

  -- 2) Estado (§2.7): sorteio só parte de encerrada. `aberta` e `sorteada`
  --    recebem códigos distintos para o mapa de toasts da Server Action.
  if status_rifa = 'aberta' then
    raise exception 'RIFA_ABERTA: a rifa precisa estar encerrada para o sorteio ser realizado.';
  end if;
  if status_rifa <> 'encerrada' then
    raise exception 'RIFA_JA_SORTEADA: anule o resultado vigente antes de sortear novamente. (RNF-06)';
  end if;

  -- 3) Conjunto de números vendidos: EXATAMENTE 1 linha por número com
  --    venda vigente (removida_em IS NULL). Se um número tiver mais de
  --    uma venda vigente (não deveria), a venda vigente mais recente
  --    define o comprador — o número conta uma única vez.
  -- > 0 é pré-condição; 0 vendidos ABORT RIFA_SEM_VENDIDOS (§4.9) e a
  -- rifa permanece encerrada (a transação inteira é desfeita).
  select count(*) into total_vendidos
  from (
    select distinct on (v.numero_id) v.numero_id, v.comprador_id
    from public.vendas v
    where v.removida_em is null
    order by v.numero_id, v.criada_em desc, v.id desc
  ) venda_vigente
  join public.numeros n on n.id = venda_vigente.numero_id
  where n.rifa_id = rifa;

  if total_vendidos = 0 then
    raise exception 'RIFA_SEM_VENDIDOS: A rifa não tem números vendidos; o sorteio não pode ser realizado.';
  end if;

  -- 4) k = uniforme(0..total_vendidos-1) a partir de 8 bytes criptográficos.
  --    (biés do módulo ≤ total/2⁶⁴ — desprezível; total limitado a 5000.)
  bytes_azar := gen_random_bytes(8);
  k := (
    (get_byte(bytes_azar, 0)::bigint << 56)
    | (get_byte(bytes_azar, 1)::bigint << 48)
    | (get_byte(bytes_azar, 2)::bigint << 40)
    | (get_byte(bytes_azar, 3)::bigint << 32)
    | (get_byte(bytes_azar, 4)::bigint << 24)
    | (get_byte(bytes_azar, 5)::bigint << 16)
    | (get_byte(bytes_azar, 6)::bigint << 8)
    | get_byte(bytes_azar, 7)::bigint
  ) % total_vendidos::bigint;

  -- 5) k-ésimo número vendido (ordem numérica estável, 001..N)
  select n.id, venda_vigente.comprador_id
  into numero_sorteado_id, comprador_sorteado_id
  from (
    select distinct on (v.numero_id) v.numero_id, v.comprador_id
    from public.vendas v
    where v.removida_em is null
    order by v.numero_id, v.criada_em desc, v.id desc
  ) venda_vigente
  join public.numeros n on n.id = venda_vigente.numero_id
  where n.rifa_id = rifa
  order by n.numero
  offset k
  limit 1;

  -- 6) Gravação + virada de estado — mesma transação, COMMIT único (§2.4)
  insert into public.sorteios (rifa_id, numero_id, comprador_id, total_vendidos)
  values (rifa, numero_sorteado_id, comprador_sorteado_id, total_vendidos)
  returning id into novo_sorteio_id;

  update public.rifas
  set status = 'sorteada'
  where id = rifa;

  return novo_sorteio_id;
end;
$$;

comment on function public.sortear_rifa(uuid) is
'RPC transacional do sorteio (SPEC §2.4/§4.9): trava a rifa com FOR UPDATE, exige encerrada com vendas vigentes (códigos RIFA_ABERTA / RIFA_SEM_VENDIDOS / RIFA_JA_SORTEADA), sorteia o k-ésimo número vendido com gen_random_bytes (RNF-07) e grava sorteio + status sorteada em commit único. Desfazer (RF-15) é Server Action em transação própria.';

-- Execução: Server Action (service_role) e organizador autenticado —
-- anon jamais (§2.3); via invoker, RLS filtra os rifas de terceiros.
revoke all on function public.sortear_rifa(uuid) from public;
grant execute on function public.sortear_rifa(uuid) to authenticated, service_role;
