-- =====================================================================
-- Rifa App · Migração inicial (SPEC.md §2.4 modelo de dados, §2.3 RLS)
-- Tabelas: perfis, rifas, numeros, compradores, vendas, sorteios
-- Índices, CHECKs e políticas de Row Level Security conforme SPEC.
-- Idioma dos comentários de negócio: pt-BR.
-- =====================================================================

-- ---------------------------------------------------------------------
-- perfis · organizador (SPEC §2.4)
-- ---------------------------------------------------------------------
create table public.perfis (
  id             uuid primary key references auth.users (id) on delete cascade,
  nome_exibicao  text not null,
  whatsapp       text not null,            -- contato público; normalizado: 5511988887777
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now()
);

-- Provisionamento automático do perfil ao criar a conta (SPEC §4.17)
create function public.criar_perfil_novo_usuario()
returns trigger
language plpgsql
security definer set search_path = public, auth
as $$
begin
  insert into public.perfis (id, nome_exibicao, whatsapp)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_exibicao', split_part(new.email, '@', 1)),
    coalesce(new.raw_user_meta_data ->> 'whatsapp', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger trg_criar_perfil_novo_usuario
  after insert on auth.users
  for each row execute function public.criar_perfil_novo_usuario();

-- ---------------------------------------------------------------------
-- rifas (SPEC §2.4) · status: aberta → encerrada → sorteada (§2.7)
-- ---------------------------------------------------------------------
create table public.rifas (
  id                uuid primary key default gen_random_uuid(),
  perfil_id         uuid not null references public.perfis (id),
  slug              text not null unique,
  titulo            text not null check (char_length(titulo) between 3 and 60),
  descricao         text check (char_length(descricao) <= 500),
  premio_descricao  text not null,
  premio_rotulo     text not null default 'estimado'
                    check (premio_rotulo in ('estimado','mais_de','ate')),  -- RF-01
  premio_valor      numeric(10,2) not null check (premio_valor > 0),
  numero_valor      numeric(10,2) not null check (numero_valor > 0),
  quantidade        int not null check (quantidade in (25,50,100,200,500,1000,5000)),  -- decisão 3
  qtd_minima        int not null check (qtd_minima between 0 and quantidade),
  imagem_url        text,
  data_prevista     date,
  status            text not null default 'aberta'
                    check (status in ('aberta','encerrada','sorteada')),
  criada_em         timestamptz not null default now(),
  atualizada_em     timestamptz not null default now(),
  arquivada         boolean not null default false,
  excluida          boolean not null default false     -- soft delete
);

comment on column public.rifas.quantidade is
  'Somente os tamanhos pré-definidos (decisão 3): 25/50/100/200/500/1000/5000. Edição bloqueada com vendas — RN-09 na Server Action.';

-- ---------------------------------------------------------------------
-- numeros · 1..quantidade por rifa (RF-02); UNIQUE(rifa_id, numero)
-- ---------------------------------------------------------------------
create table public.numeros (
  id      uuid primary key default gen_random_uuid(),
  rifa_id uuid not null references public.rifas (id) on delete cascade,
  numero  int not null check (numero between 1 and 5000),   -- limite operacional
  status  text not null default 'disponivel'
          check (status in ('disponivel','vendido')),
  unique (rifa_id, numero)                                  -- nenhum número duplicado por rifa
);

-- ---------------------------------------------------------------------
-- compradores (PHONE/armazena contato; anon JAMAIS lê — SPEC §2.3)
-- ---------------------------------------------------------------------
create table public.compradores (
  id        uuid primary key default gen_random_uuid(),
  rifa_id   uuid not null references public.rifas (id) on delete cascade,
  nome      text not null check (char_length(nome) between 2 and 120),
  telefone  text not null,          -- E.164: +5511988887777; máscara aplicada na UI
  criado_em timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- vendas · vínculo número ↔ comprador com histórico (RN-03, RN-07)
-- removida_em NULL = venda vigente
-- ---------------------------------------------------------------------
create table public.vendas (
  id           uuid primary key default gen_random_uuid(),
  numero_id    uuid not null references public.numeros (id) on delete cascade,
  comprador_id uuid not null references public.compradores (id),
  criada_em    timestamptz not null default now(),
  origem       text not null default 'organizador'
               check (origem in ('organizador','publico')),   -- quem registrou (RN-03)
  removida_em  timestamptz                                    -- NULL = venda vigente
);

-- ---------------------------------------------------------------------
-- sorteios · resultado vigente = anulado_em IS NULL (RN-08)
-- ---------------------------------------------------------------------
create table public.sorteios (
  id             uuid primary key default gen_random_uuid(),
  rifa_id        uuid not null references public.rifas (id) on delete cascade,
  numero_id      uuid not null references public.numeros (id),
  comprador_id   uuid not null references public.compradores (id),
  total_vendidos int not null,             -- snapshot p/ registro interno
  sorteado_em    timestamptz not null default now(),
  anulado_em     timestamptz               -- RN-08: vigente = anulado_em IS NULL
);

-- ---------------------------------------------------------------------
-- Índices (SPEC §2.4)
-- ---------------------------------------------------------------------
create index idx_numeros_rifa_status on public.numeros (rifa_id, status);
create index idx_numeros_rifa_numero on public.numeros (rifa_id, numero);
create index idx_compradores_rifa_telefone on public.compradores (rifa_id, telefone);
create index idx_sorteios_rifa on public.sorteios (rifa_id);
create index idx_rifas_perfil on public.rifas (perfil_id);

-- ---------------------------------------------------------------------
-- Trigger updated_at (rifas e perfis, §2.4)
-- ---------------------------------------------------------------------
create function public.marcar_atualizada_em()
returns trigger
language plpgsql
as $$
begin
  new.atualizada_em = now();
  return new;
end;
$$;

create trigger trg_rifas_atualizada_em
  before update on public.rifas
  for each row execute function public.marcar_atualizada_em();

create trigger trg_perfis_atualizado_em
  before update on public.perfis
  for each row execute function public.marcar_atualizada_em();

-- ---------------------------------------------------------------------
-- Row Level Security (SPEC §2.3)
-- anon  = visitante do link público · authenticated = organizador logado
-- ---------------------------------------------------------------------

-- Helpers de RLS (definidos após as tabelas; `stable` = consultáveis em políticas)
create function public.perfil_do_usuario()
returns uuid
language sql
stable
as $$
  select id from public.perfis where id = auth.uid()
$$;

create function public.pertence_ao_propria_rifa(rifa uuid)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from public.rifas r
    where r.id = rifa and r.perfil_id = public.perfil_do_usuario()
  )
$$;

-- perfis: SELECT público (nome + whatsapp para o rodapé da T4); UPDATE própria
alter table public.perfis       enable row level security;
alter table public.rifas        enable row level security;
alter table public.numeros      enable row level security;
alter table public.compradores  enable row level security;
alter table public.vendas       enable row level security;
alter table public.sorteios     enable row level security;

create policy "perfis_leitura_publica"
  on public.perfis for select
  using (true);

create policy "perfis_atualiza_proprio"
  on public.perfis for update
  to authenticated
  using (id = auth.uid());

-- rifas
create policy "rifas_publico_le_publicadas"
  on public.rifas for select
  to anon
  using (not arquivada and not excluida);

create policy "rifas_organizador_le_proprias"
  on public.rifas for select
  to authenticated
  using (perfil_id = public.perfil_do_usuario());

create policy "rifas_organizador_cria_proprias"
  on public.rifas for insert
  to authenticated
  with check (perfil_id = public.perfil_do_usuario());

create policy "rifas_organizador_edita_proprias"
  on public.rifas for update
  to authenticated
  using (perfil_id = public.perfil_do_usuario())
  with check (perfil_id = public.perfil_do_usuario());

create policy "rifas_organizador_exclui_proprias"
  on public.rifas for delete
  to authenticated
  using (perfil_id = public.perfil_do_usuario());

-- numeros: público lê os estados da rifa publicada; organizador tem tudo nas próprias
create policy "numeros_publico_le_publicadas"
  on public.numeros for select
  to anon
  using (
    exists (
      select 1 from public.rifas r
      where r.id = rifa_id and not r.arquivada and not r.excluida
    )
  );

create policy "numeros_organizador_proprias"
  on public.numeros for all
  to authenticated
  using (public.pertence_ao_propria_rifa(rifa_id))
  with check (public.pertence_ao_propria_rifa(rifa_id));

-- compradores: NENHUM acesso anon (privacidade RNF-05)
create policy "compradores_organizador_proprias"
  on public.compradores for all
  to authenticated
  using (public.pertence_ao_propria_rifa(rifa_id))
  with check (public.pertence_ao_propria_rifa(rifa_id));

-- vendas: NENHUM acesso anon (telefone fora do alcance público — §2.3)
create policy "vendas_organizador_proprias"
  on public.vendas for all
  to authenticated
  using (
    exists (
      select 1
      from public.numeros n
      join public.rifas r on r.id = n.rifa_id
      where n.id = numero_id and public.pertence_ao_propria_rifa(r.id)
    )
  )
  with check (
    exists (
      select 1
      from public.numeros n
      join public.rifas r on r.id = n.rifa_id
      where n.id = numero_id and public.pertence_ao_propria_rifa(r.id)
    )
  );

-- sorteios: público lê o resultado vigente da rifa publicada (decisão 5 · T5)
create policy "sorteios_publico_le_publicadas"
  on public.sorteios for select
  to anon
  using (
    exists (
      select 1 from public.rifas r
      where r.id = rifa_id and not r.arquivada and not r.excluida
    )
  );

create policy "sorteios_organizador_proprias"
  on public.sorteios for all
  to authenticated
  using (public.pertence_ao_propria_rifa(rifa_id))
  with check (public.pertence_ao_propria_rifa(rifa_id));

-- ---------------------------------------------------------------------
-- Storage · bucket "premios" (ET-3) — público de leitura, escrita pelo servidor
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('premios', 'premios', true)
on conflict (id) do nothing;

create policy "premios_leitura_publica"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'premios');

create policy "premios_upload_servidor"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'premios');

create policy "premios_atualizacao_servidor"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'premios');

create policy "premios_remocao_servidor"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'premios');
