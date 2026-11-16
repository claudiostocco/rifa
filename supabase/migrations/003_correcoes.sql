-- =====================================================================
-- Rifa App · Migração 003 · Correções de schema expostas pela suíte de
-- integração (FD-9 + FD-3, 11/11/2026). As migrações 001/002 já foram
-- aplicadas (stack local e cloud) — correções entram como delta, sem
-- editar migração já aplicada.
--
-- a) trg_perfis_atualizado_em reaproveitava marcar_atualizada_em(), que
--    grava a coluna `atualizada_em` — existente apenas em `rifas`. Todo
--    UPDATE em `perfis` falhava com 42703 ("record new has no field
--    atualizada_em"). Correção: função própria para a coluna
--    `atualizado_em` de perfis.
--
-- b) sortear_rifa: o byte mais significativo de gen_random_bytes sem
--    máscara estourava o bigint COM sinal (valores ≥ 2⁶³ deslocados em
--    56 bits viram negativos) e o módulo devolvia k negativo → Postgres
--    abortava com "OFFSET must not be negative" em ~50% das chamadas.
--    Correção: byte 0 mascarado com & 127 (63 bits aleatórios) — o viés
--    do módulo segue ≤ total/2⁶³, desprezível (RNF-07 preservado).
-- =====================================================================

-- (a) Trigger de atualizado_em próprio da tabela perfis (§2.4)
create function public.marcar_atualizado_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizado_em = now();
  return new;
end;
$$;

drop trigger if exists trg_perfis_atualizado_em on public.perfis;
create trigger trg_perfis_atualizado_em
  before update on public.perfis
  for each row execute function public.marcar_atualizado_em();

-- (b) sortear_rifa com a aleatoriedade sem estouro de sinal (RNF-06/07)
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

  -- 4) k = uniforme(0..total_vendidos-1) a partir de 63 bits criptográficos.
  --    O byte 0 recebe & 127 para o bigint de 64 bits COM sinal nunca
  --    estourar (deslocar byte ≥ 128 por 56 bits vira negativo). Viés do
  --    módulo ≤ total/2⁶³ — desprezível; total limitado a 5000 (RNF-07).
  bytes_azar := gen_random_bytes(8);
  k := (
    ((get_byte(bytes_azar, 0) & 127)::bigint << 56)
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

-- Repõe os comentários e grants da migração 002 (create or replace não os preserva)
comment on function public.sortear_rifa(uuid) is
'RPC transacional do sorteio (SPEC §2.4/§4.9): trava a rifa com FOR UPDATE, exige encerrada com vendas vigentes (códigos RIFA_ABERTA / RIFA_SEM_VENDIDOS / RIFA_JA_SORTEADA), sorteia o k-ésimo número vendido com gen_random_bytes (RNF-07) e grava sorteio + status sorteada em commit único. Desfazer (RF-15) é Server Action em transação própria.';

revoke all on function public.sortear_rifa(uuid) from public;
grant execute on function public.sortear_rifa(uuid) to authenticated, service_role;
