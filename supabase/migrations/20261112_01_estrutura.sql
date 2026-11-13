-- 20261112_01_estrutura.sql — estrutura do banco do sistema Avaliação de Árvores.
-- ONDE RODAR: Supabase do projeto AVALIAÇÃO DE ÁRVORES (vzukefbkvkkvkfijuduu) > SQL Editor > New query > colar tudo > Run.
-- Resultado esperado: "Success. No rows returned".  Rodar 2 vezes não estraga.
--
-- O QUE CRIA
-- acessos    quem pode entrar e o que pode fazer (admin, avaliador, leitor)
-- arvores    1 linha por árvore (ID, posição, área, último risco)
-- inspecoes  1 linha por avaliação (F, E, C e o resultado J e R)
-- fotos      1 linha por foto (o arquivo fica no Google Drive; aqui fica o endereço)
-- mapa_arvores  visão pronta para o mapa: última inspeção de cada árvore e quantas fotos tem
--
-- A REGRA DE CLASSIFICAÇÃO é a mesma do risk.js (matrizes do item 6 da norma):
--   J = matriz F × E,  R = matriz J × C.  O banco calcula J e R sozinho; o site não consegue gravar outro valor.

-- ===== Acessos =====
create table if not exists acessos (
  email      text primary key check (email = lower(btrim(email)) and email like '%@%'),
  nome       text not null default '',
  papel      text not null default 'avaliador' check (papel in ('admin', 'avaliador', 'leitor')),
  ativo      boolean not null default true,
  criado_em  timestamptz not null default now()
);

-- papel de quem está logado (null = sem acesso)
create or replace function papel_atual() returns text
language sql stable security definer set search_path = public as $$
  select papel from acessos where email = lower(coalesce(auth.jwt() ->> 'email', '')) and ativo
$$;
revoke all on function papel_atual() from public, anon;
grant execute on function papel_atual() to authenticated;

-- ===== Regra da norma (igual ao risk.js) =====
create or replace function calcular_j(p_f int, p_e int) returns int
language sql immutable as $$
  select (array[[1,1,1,1],[1,1,2,2],[1,2,3,3],[1,2,3,4]])[p_f][p_e + 1]
$$;
create or replace function calcular_r(p_j int, p_c int) returns int
language sql immutable as $$
  select (array[[1,1,2,2],[1,2,3,3],[2,3,3,4],[2,3,4,4]])[p_j][p_c]
$$;

-- ===== Árvores =====
create table if not exists arvores (
  id               text primary key check (id ~ '^[A-Za-z0-9_-]{3,100}$'),
  latitude         numeric(10,7) check (latitude between -90 and 90),
  longitude        numeric(10,7) check (longitude between -180 and 180),
  area             text,
  especie          text,
  ultimo_r         smallint,
  ultima_inspecao  timestamptz,
  inspecoes        int not null default 0,
  criado_em        timestamptz not null default now(),
  criado_por       text default lower(auth.jwt() ->> 'email')
);

-- ===== Inspeções =====
create table if not exists inspecoes (
  id                  uuid primary key default gen_random_uuid(),
  arvore_id           text not null references arvores(id) on update cascade,
  inspecionado_em     timestamptz not null default now(),
  avaliador           text not null,
  avaliador_email     text not null default lower(auth.jwt() ->> 'email'),
  motivo              text not null default 'rotina' check (motivo in ('rotina', 'pos-evento', 'alteracao', 'outro')),
  componente          text not null,
  tipo_alvo           text not null check (tipo_alvo in ('pessoas', 'fixo', 'movel')),
  alvo                text not null,
  situacao_controles  text not null default 'inicial' check (situacao_controles in ('inicial', 'apos-controles')),
  alcance_verificado  boolean not null check (alcance_verificado),
  f                   smallint not null check (f between 1 and 4),
  e                   smallint not null check (e between 1 and 3),
  c                   smallint not null check (c between 1 and 4),
  j                   smallint,
  r                   smallint,
  protecao_imediata   boolean generated always as (f = 4) stored,
  latitude            numeric(10,7) check (latitude between -90 and 90),
  longitude           numeric(10,7) check (longitude between -180 and 180),
  especie             text,
  geometria           text not null check (length(btrim(geometria)) > 0),
  evidencias          text not null check (length(btrim(evidencias)) > 0),
  observacoes         text,
  criado_em           timestamptz not null default now(),
  constraint alvo_fixo_e3 check (tipo_alvo <> 'fixo' or e = 3)
);
create index if not exists inspecoes_arvore on inspecoes(arvore_id, inspecionado_em desc);

-- o banco calcula J e R (ignora o que vier do site)
create or replace function inspecao_calcular() returns trigger
language plpgsql as $$
begin
  new.j := calcular_j(new.f, new.e);
  new.r := calcular_r(new.j, new.c);
  return new;
end $$;
drop trigger if exists inspecao_calcular on inspecoes;
create trigger inspecao_calcular before insert or update of f, e, c on inspecoes
for each row execute function inspecao_calcular();

-- a árvore guarda o último risco, a última data e a posição mais recente
create or replace function arvore_atualizar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text := coalesce(new.arvore_id, old.arvore_id);
begin
  update arvores a set
    ultimo_r        = u.r,
    ultima_inspecao = u.inspecionado_em,
    inspecoes       = (select count(*) from inspecoes where arvore_id = v_id),
    latitude        = coalesce(u.latitude, a.latitude),
    longitude       = coalesce(u.longitude, a.longitude),
    especie         = coalesce(nullif(btrim(u.especie), ''), a.especie)
  from (select * from inspecoes where arvore_id = v_id order by inspecionado_em desc, criado_em desc limit 1) u
  where a.id = v_id;
  if not found then
    update arvores set ultimo_r = null, ultima_inspecao = null, inspecoes = 0 where id = v_id;
  end if;
  return null;
end $$;
drop trigger if exists arvore_atualizar on inspecoes;
create trigger arvore_atualizar after insert or update or delete on inspecoes
for each row execute function arvore_atualizar();

-- ===== Fotos (arquivo no Google Drive) =====
create table if not exists fotos (
  id              uuid primary key default gen_random_uuid(),
  inspecao_id     uuid not null references inspecoes(id) on delete cascade,
  arvore_id       text not null references arvores(id) on update cascade,
  drive_id        text not null unique,
  nome            text not null,
  bytes           int,
  criado_em       timestamptz not null default now(),
  criado_por      text default lower(auth.jwt() ->> 'email')
);
create index if not exists fotos_arvore on fotos(arvore_id, criado_em desc);

-- ===== Visão pronta para o mapa =====
create or replace view mapa_arvores with (security_invoker = on) as
select a.id, a.latitude, a.longitude, a.area, a.especie, a.ultimo_r, a.ultima_inspecao, a.inspecoes,
       u.componente, u.alvo, u.tipo_alvo, u.f, u.e, u.c, u.protecao_imediata,
       (select count(*) from fotos x where x.arvore_id = a.id) as fotos,
       (select x.drive_id from fotos x where x.arvore_id = a.id order by x.criado_em desc limit 1) as foto_capa
  from arvores a
  left join lateral (select * from inspecoes i where i.arvore_id = a.id order by i.inspecionado_em desc, i.criado_em desc limit 1) u on true;

-- ===== Segurança (RLS): só quem está na tabela acessos =====
alter table acessos   enable row level security;
alter table arvores   enable row level security;
alter table inspecoes enable row level security;
alter table fotos     enable row level security;

revoke all on acessos, arvores, inspecoes, fotos from anon;
revoke all on mapa_arvores from anon;
grant select on acessos, arvores, inspecoes, fotos, mapa_arvores to authenticated;
grant insert on arvores, inspecoes, fotos to authenticated;
grant update, delete on arvores, inspecoes, fotos to authenticated;
grant insert, update, delete on acessos to authenticated;

-- acessos: cada um vê o próprio; admin vê e muda todos
drop policy if exists ler on acessos;
drop policy if exists admin on acessos;
create policy ler on acessos for select to authenticated using (email = lower(auth.jwt() ->> 'email') or papel_atual() = 'admin');
create policy admin on acessos for all to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');

-- ler: qualquer pessoa com acesso ativo
drop policy if exists ler on arvores;   create policy ler on arvores   for select to authenticated using (papel_atual() is not null);
drop policy if exists ler on inspecoes; create policy ler on inspecoes for select to authenticated using (papel_atual() is not null);
drop policy if exists ler on fotos;     create policy ler on fotos     for select to authenticated using (papel_atual() is not null);

-- gravar: avaliador e admin
drop policy if exists incluir on arvores;   create policy incluir on arvores   for insert to authenticated with check (papel_atual() in ('admin', 'avaliador'));
drop policy if exists incluir on inspecoes; create policy incluir on inspecoes for insert to authenticated with check (papel_atual() in ('admin', 'avaliador') and avaliador_email = lower(auth.jwt() ->> 'email'));
drop policy if exists incluir on fotos;     create policy incluir on fotos     for insert to authenticated with check (papel_atual() in ('admin', 'avaliador'));

-- corrigir e apagar: só admin
drop policy if exists corrigir on arvores;   create policy corrigir on arvores   for update to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');
drop policy if exists corrigir on inspecoes; create policy corrigir on inspecoes for update to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');
drop policy if exists corrigir on fotos;     create policy corrigir on fotos     for update to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');
drop policy if exists apagar on arvores;     create policy apagar on arvores     for delete to authenticated using (papel_atual() = 'admin');
drop policy if exists apagar on inspecoes;   create policy apagar on inspecoes   for delete to authenticated using (papel_atual() = 'admin');
drop policy if exists apagar on fotos;       create policy apagar on fotos       for delete to authenticated using (papel_atual() = 'admin');

-- ===== Conferência da regra (deve devolver 0 linhas erradas) =====
-- Casos do teste do colega: F4+E3 -> J4; J4+C4 -> R4; F1+E1 -> J1; J1+C1 -> R1; F2+E3 -> J2; J2+C3 -> R3.
do $$ begin
  if calcular_j(4,3) <> 4 or calcular_r(4,4) <> 4 or calcular_j(1,1) <> 1 or calcular_r(1,1) <> 1
     or calcular_j(2,3) <> 2 or calcular_r(2,3) <> 3 or calcular_j(3,2) <> 3 or calcular_r(3,1) <> 2 then
    raise exception 'A regra de classificação não confere com o risk.js. Nada foi gravado.';
  end if;
end $$;
