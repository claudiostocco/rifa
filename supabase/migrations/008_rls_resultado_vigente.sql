-- =====================================================================
-- Rifa App · Migração 008 · RLS do resultado público vigente
--
-- T5 só pode publicar o sorteio vigente. Resultados anulados continuam
-- armazenados para auditoria interna, mas não podem ser lidos pelo anon.
-- =====================================================================

drop policy if exists "sorteios_publico_le_publicadas" on public.sorteios;

create policy "sorteios_publico_le_publicadas"
  on public.sorteios for select
  to anon
  using (
    anulado_em is null
    and exists (
      select 1 from public.rifas r
      where r.id = rifa_id and not r.arquivada and not r.excluida
    )
  );

-- `public` não remove privilégios eventualmente concedidos diretamente ao
-- papel anon pelo ambiente Supabase. RPCs de escrita ficam fora do alcance
-- do visitante; somente a Server Action autenticada pode invocá-las.
revoke execute on function public.sortear_rifa(uuid) from public, anon;
revoke execute on function public.desfazer_sorteio(uuid) from public, anon;
