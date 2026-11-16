-- =====================================================================
-- Rifa App · Migração 0006 (SPEC.md §2.4 RF-15 · §4.14 · matriz §5.2)
-- SR-8 · RPC transacional desfazer_sorteio: trava a rifa (FOR UPDATE),
-- exige status 'sorteada' (§2.7), marca anulado_em no sorteio VIGENTE
-- (RN-08: anulado_em IS NULL) e devolve a rifa a 'encerrada' — tudo em
-- UM COMMIT (tudo ou nada). O histórico de anulação fica preservado em
-- sorteios (auditoria, RF-15) e NUNCA é apagado; o re-sorteio volta a
-- ser permitido (a RPC sortear_rifa só bloqueia com vigente, RNF-06).
-- Idioma dos comentários de negócio: pt-BR.
-- =====================================================================

create or replace function public.desfazer_sorteio(rifa uuid)
returns timestamptz
language plpgsql
volatile
set search_path = public, extensions
as $$
declare
  status_rifa     text;
  anulado_quando  timestamptz;
begin
  -- 1) Trava a rifa: FOR UPDATE serializa desfazer concorrente com
  --    sortear/reabrir/encerrar (mesma linha, mesmo padrão da 002).
  --    security invoker: a via oficial é a Server Action `desfazerSorteio`
  --    com service_role (bypass de RLS); via key de organizador o próprio
  --    RLS impede tocar rifas de terceiros (sem linha → RIFA_INEXISTENTE).
  select r.status into status_rifa
  from public.rifas r
  where r.id = rifa
  for update;

  if status_rifa is null then
    raise exception 'RIFA_INEXISTENTE: a rifa informada não existe.';
  end if;

  -- 2) Estado (§2.7/§4.14): anulação só parte de 'sorteada'. `aberta` e
  --    `encerrada` não têm resultado a anular — código próprio para o mapa
  --    de toasts da Server Action.
  if status_rifa <> 'sorteada' then
    raise exception 'RIFA_NAO_SORTEADA: só é possível anular o resultado de uma rifa sorteada.';
  end if;

  -- 3) Marca anulado_em APENAS no sorteio VIGENTE (RN-08). 0 linhas =
  --    rifa marcada 'sorteada' sem resultado vigente (gravação direta)
  --    → ABORT e a transação inteira é desfeita (status intacto).
  update public.sorteios
  set anulado_em = now()
  where rifa_id = rifa
    and anulado_em is null
  returning anulado_em into anulado_quando;

  if anulado_quando is null then
    raise exception 'RIFA_SEM_SORTEIO: não há sorteio vigente nesta rifa para anular.';
  end if;

  -- 4) Devolve a rifa a 'encerrada' (§2.7 — reversão sorteada → encerrada):
  --    gravação + virada de estado na MESMA transação, COMMIT único (§2.4).
  --    As vendas vigentes permanecem intactas — sortear novamente parte
  --    delas (o conjunto de vendidos é reconstruído pela RPC da 002).
  update public.rifas
  set status = 'encerrada'
  where id = rifa;

  return anulado_quando;
end;
$$;

comment on function public.desfazer_sorteio(uuid) is
'RPC transacional da anulação (SPEC §2.4/§4.14 RF-15 · RN-08): trava a rifa com FOR UPDATE, exige status sorteada (RIFA_NAO_SORTEADA), marca anulado_em no sorteio vigente (RIFA_SEM_SORTEIO se não houver) e devolve a rifa a encerrada em commit único. O histórico anulado fica preservado (auditoria RF-15) e o re-sorteio volta a ser permitido.';

-- Execução: Server Action (service_role) e organizador autenticado —
-- anon jamais (§2.3); via invoker, RLS filtra as rifas de terceiros.
revoke all on function public.desfazer_sorteio(uuid) from public;
grant execute on function public.desfazer_sorteio(uuid) to authenticated, service_role;
