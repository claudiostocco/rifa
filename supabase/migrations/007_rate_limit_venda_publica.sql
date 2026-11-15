-- =====================================================================
-- Rifa App · Migração 007 · rate limit compartilhado da venda pública
-- (PB-3, SPEC §2.3).
--
-- O contador é persistente/atômico entre instâncias serverless. A chave é
-- SHA-256 do IP calculado pela Server Action; IP em claro nunca é gravado.
-- A tabela não é acessível por anon/authenticated; somente a RPC, executada
-- pela service_role, pode consumir uma tentativa.
-- =====================================================================

create table public.limites_venda_publica (
  chave_hash text primary key
    check (chave_hash ~ '^[0-9a-f]{64}$'),
  janela_iniciada_em timestamptz not null,
  tentativas integer not null check (tentativas >= 1),
  atualizado_em timestamptz not null default now()
);

alter table public.limites_venda_publica enable row level security;

revoke all on table public.limites_venda_publica from public, anon, authenticated;
grant all on table public.limites_venda_publica to service_role;

create or replace function public.consumir_limite_venda_publica(p_chave_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tentativas integer;
begin
  if p_chave_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'CHAVE_RATE_LIMIT_INVALIDA';
  end if;

  -- Limpeza oportunista para impedir crescimento indefinido da tabela.
  delete from public.limites_venda_publica
  where atualizado_em < now() - interval '1 day';

  insert into public.limites_venda_publica as limite (
    chave_hash,
    janela_iniciada_em,
    tentativas,
    atualizado_em
  )
  values (p_chave_hash, now(), 1, now())
  on conflict (chave_hash) do update
    set janela_iniciada_em = case
          when limite.janela_iniciada_em <= now() - interval '10 seconds' then now()
          else limite.janela_iniciada_em
        end,
        tentativas = case
          when limite.janela_iniciada_em <= now() - interval '10 seconds' then 1
          else least(limite.tentativas + 1, 6)
        end,
        atualizado_em = now()
  returning tentativas into v_tentativas;

  return v_tentativas <= 5;
end;
$$;

revoke all on function public.consumir_limite_venda_publica(text) from public, anon, authenticated;
grant execute on function public.consumir_limite_venda_publica(text) to service_role;

comment on table public.limites_venda_publica is
  'Contadores temporários por SHA-256 do IP para rate limit da venda pública (5/10s); sem IP em claro.';
