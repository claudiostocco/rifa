-- Seed exclusivamente local/dev.
--
-- Segurança: este arquivo é opt-in. A execução sem a sessão PostgreSQL
-- configurada para `local` termina sem inserir qualquer dado. A produção
-- nunca deve receber este arquivo via `supabase db push`.
DO $$
BEGIN
  IF COALESCE(current_setting('rifa.seed_environment', true), '') <> 'local' THEN
    RAISE NOTICE 'Seed ignorado: defina rifa.seed_environment=local para executá-lo.';
    RETURN;
  END IF;

  INSERT INTO public.perfis (id, nome_exibicao, whatsapp)
  SELECT id, 'Organizador local', '5511999999999'
  FROM auth.users
  WHERE email = 'organizador@rifa.local'
  ON CONFLICT (id) DO UPDATE
    SET nome_exibicao = EXCLUDED.nome_exibicao,
        whatsapp = EXCLUDED.whatsapp;

  INSERT INTO public.rifas (
    perfil_id,
    slug,
    titulo,
    descricao,
    premio_descricao,
    premio_rotulo,
    premio_valor,
    numero_valor,
    quantidade,
    qtd_minima
  )
  SELECT
    id,
    'rifa-demo-local',
    'Rifa demo local',
    'Dados de demonstração somente no ambiente local.',
    'Cesta de café da manhã',
    'estimado',
    250.00,
    10.00,
    25,
    5
  FROM public.perfis
  WHERE id = (SELECT id FROM auth.users WHERE email = 'organizador@rifa.local')
  ON CONFLICT (slug) DO NOTHING;

  INSERT INTO public.numeros (rifa_id, numero)
  SELECT r.id, numero
  FROM public.rifas AS r
  CROSS JOIN generate_series(1, 25) AS numero
  WHERE r.slug = 'rifa-demo-local'
  ON CONFLICT (rifa_id, numero) DO NOTHING;
END
$$;
