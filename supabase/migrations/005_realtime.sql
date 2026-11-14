-- VT-9 · RF-18 (SPEC §2.5/§4.16): publica `numeros` no canal Realtime
-- (POSTGRES_CHANGES) para grade, progresso e resumo atualizarem ao vivo em
-- todas as telas. O anon lê só os ESTADOS da rifa publicada (RLS
-- `numeros_publico_le_publicadas`, migração 001) — o payload carrega
-- id/rifa_id/numero/status, nunca dados de comprador (RN-02/RNF-05).
-- Compradores/vendas NÃO entram na publicação: nenhuma tela os assina e o
-- navegador é sempre anônimo (sessão httpOnly, FD-8) — a conferência deles
-- é do servidor, não do cliente (§2.7).
alter publication supabase_realtime add table public.numeros;
