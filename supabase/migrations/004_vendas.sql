-- =====================================================================
-- Rifa App · Migração 004 · RN-03 no banco (VT-4/VT-5, 13/11/2026).
--
-- "Um número vende-se uma única vez" (RN-03, §4.5) precisa de garantia
-- DECLARATIVA: a corrida de duas vendas no mesmo número (VT-6) não pode
-- depender de conferência na Server Action. O índice parcial UNIQUE
-- admite qualquer número de vendas HISTÓRICAS (removidas) e permite
-- re-venda após remoção, mas rejeita a 2ª venda VIGENTE do mesmo número
-- (código 23505 — a Server Action mapeia para o toast prescrito
-- "Esse número acabou de ser vendido"). Delta não destrutivo sobre
-- 001/002/003, no padrão da 003.
-- =====================================================================

create unique index if not exists vendas_vigente_por_numero
  on public.vendas (numero_id)
  where removida_em is null;

comment on index vendas_vigente_por_numero is
  'RN-03 (§4.5): no máximo uma venda vigente (removida_em IS NULL) por número; remoção (RF-06) libera o número para nova venda.';
