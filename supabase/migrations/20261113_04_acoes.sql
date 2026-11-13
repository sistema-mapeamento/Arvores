-- 20261113_04_acoes.sql — AÇÕES: toda avaliação gera uma ação; a baixa diz o que foi feito (13/11/2026).
-- ONDE RODAR: Supabase do projeto AVALIAÇÃO DE ÁRVORES (vzukefbkvkkvkfijuduu) > SQL Editor > New query > colar tudo > Run.
-- Precisa dos SQL 01, 02 e 03 já rodados. Rodar 2 vezes não estraga.
--
-- COMO FUNCIONA
-- - Cada avaliação nova cria 1 ação "aberta" para aquela árvore (as avaliações que já existem também ganham a sua).
-- - Se a mesma árvore for avaliada de novo com a ação anterior ainda aberta, a anterior vira "substituída"
--   (vale a avaliação mais nova; a árvore fica com 1 ação aberta só).
-- - Dar baixa: escolher PODA, PODA DRÁSTICA ou SUPRESSÃO, escrever o comentário, o nome de quem deu baixa
--   e enviar até 3 fotos do "pós" (depois do serviço).
-- - Depois da baixa ninguém de fora muda. Corrigir ou reabrir: só no painel do Supabase (Table Editor > acoes).
-- Fotos do pós: pasta "fotos", fotos/<ID da árvore>/<código da ação>/pos1.jpg e pos1_mini.jpg.

-- ===== Tabela =====
create table if not exists acoes (
  id              uuid primary key default gen_random_uuid(),
  inspecao_id     uuid not null unique references inspecoes(id) on delete cascade,
  arvore_id       text not null references arvores(id) on update cascade,
  status          text not null default 'aberta' check (status in ('aberta', 'concluida', 'substituida')),
  tipo            text check (tipo in ('poda', 'poda_drastica', 'supressao')),
  comentario      text,
  responsavel     text,
  concluida_em    timestamptz,
  baixa_envio_id  uuid unique,
  criado_em       timestamptz not null default now(),
  constraint baixa_completa check (status <> 'concluida' or (tipo is not null and concluida_em is not null and length(btrim(coalesce(responsavel, ''))) > 0))
);
create index if not exists acoes_arvore on acoes(arvore_id, criado_em desc);
create index if not exists acoes_status on acoes(status);

create table if not exists acoes_fotos (
  id         uuid primary key default gen_random_uuid(),
  acao_id    uuid not null references acoes(id) on delete cascade,
  caminho    text not null unique,
  bytes      int,
  criado_em  timestamptz not null default now()
);

-- ===== Toda avaliação gera uma ação =====
create or replace function acao_criar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- a ação aberta de uma avaliação MAIS ANTIGA da mesma árvore é substituída pela nova
  update acoes a set status = 'substituida'
    from inspecoes i
   where a.inspecao_id = i.id and a.arvore_id = new.arvore_id and a.status = 'aberta'
     and (i.inspecionado_em, i.criado_em) < (new.inspecionado_em, new.criado_em);
  insert into acoes (inspecao_id, arvore_id, status, criado_em)
  values (new.id, new.arvore_id,
          case when exists (select 1 from inspecoes i where i.arvore_id = new.arvore_id and i.id <> new.id
                             and (i.inspecionado_em, i.criado_em) > (new.inspecionado_em, new.criado_em))
               then 'substituida' else 'aberta' end,   -- avaliação lançada com data antiga: já nasce substituída
          new.criado_em)
  on conflict (inspecao_id) do nothing;
  return null;
end $$;
drop trigger if exists acao_criar on inspecoes;
create trigger acao_criar after insert on inspecoes for each row execute function acao_criar();

-- avaliações que já existem: 1 ação para cada; só a mais recente de cada árvore fica aberta
insert into acoes (inspecao_id, arvore_id, status, criado_em)
select i.id, i.arvore_id,
       case when row_number() over (partition by i.arvore_id order by i.inspecionado_em desc, i.criado_em desc) = 1 then 'aberta' else 'substituida' end,
       i.criado_em
  from inspecoes i
on conflict (inspecao_id) do nothing;

-- ===== Dar baixa (usado pelo site) =====
-- p = { acao_id, tipo: poda|poda_drastica|supressao, comentario, responsavel, envio_id }
create or replace function dar_baixa_acao(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id    uuid := nullif(p->>'acao_id', '')::uuid;
  v_envio uuid := nullif(p->>'envio_id', '')::uuid;
  v_tipo  text := p->>'tipo';
  v_resp  text := left(btrim(coalesce(p->>'responsavel', '')), 120);
  v_com   text := left(btrim(coalesce(p->>'comentario', '')), 2000);
  v       acoes;
begin
  select * into v from acoes where id = v_id for update;
  if not found then raise exception 'Ação não encontrada.'; end if;
  -- reenvio do mesmo celular: devolve o que já foi gravado
  if v.status = 'concluida' and v_envio is not null and v.baixa_envio_id = v_envio then
    return jsonb_build_object('id', v.id, 'arvore_id', v.arvore_id, 'repetido', true);
  end if;
  if v.status = 'concluida' then raise exception 'Esta ação já teve baixa.'; end if;
  if v.status = 'substituida' then raise exception 'Esta ação foi substituída por uma avaliação mais nova da árvore.'; end if;
  if v_tipo is null or v_tipo not in ('poda', 'poda_drastica', 'supressao') then raise exception 'Escolha Poda, Poda drástica ou Supressão.'; end if;
  if length(v_resp) < 3 then raise exception 'Informe quem deu baixa na ação.'; end if;
  if length(v_com) < 3 then raise exception 'Escreva um comentário sobre o serviço.'; end if;
  if (select count(*) from acoes where concluida_em > now() - interval '1 minute') >= 60 then
    raise exception 'Muitas baixas ao mesmo tempo. Tente de novo em 1 minuto.';
  end if;
  update acoes set status = 'concluida', tipo = v_tipo, comentario = v_com, responsavel = v_resp,
                   concluida_em = now(), baixa_envio_id = v_envio
   where id = v_id returning * into v;
  return jsonb_build_object('id', v.id, 'arvore_id', v.arvore_id);
end $$;
revoke all on function dar_baixa_acao(jsonb) from public;
grant execute on function dar_baixa_acao(jsonb) to anon, authenticated;

-- ===== Fotos do pós =====
-- Storage: aceita também fotos/<árvore>/<ação>/posN.jpg de ação com baixa nas últimas 48 horas (máx. 3 fotos).
create or replace function pode_subir_foto(p_nome text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_p text[] := string_to_array(p_nome, '/'); v_pasta text; v_ok boolean;
begin
  if coalesce(array_length(v_p, 1), 0) <> 3 then return false; end if;
  if v_p[1] !~ '^[A-Za-z0-9_-]{3,100}$' or v_p[2] !~ '^[0-9a-f-]{36}$' then return false; end if;
  v_pasta := v_p[1] || '/' || v_p[2] || '/';
  if v_p[3] ~ '^foto[1-5](_mini)?\.jpg$' then          -- foto da avaliação (igual ao SQL 03)
    select true into v_ok from inspecoes i
     where i.id = v_p[2]::uuid and i.arvore_id = v_p[1] and i.criado_em > now() - interval '48 hours';
    if not coalesce(v_ok, false) then return false; end if;
    return (select count(*) from storage.objects o where o.bucket_id = 'fotos' and left(o.name, length(v_pasta)) = v_pasta) < 10;
  elsif v_p[3] ~ '^pos[1-3](_mini)?\.jpg$' then        -- foto do pós (baixa da ação)
    select true into v_ok from acoes a
     where a.id = v_p[2]::uuid and a.arvore_id = v_p[1] and a.status = 'concluida' and a.concluida_em > now() - interval '48 hours';
    if not coalesce(v_ok, false) then return false; end if;
    return (select count(*) from storage.objects o where o.bucket_id = 'fotos' and left(o.name, length(v_pasta)) = v_pasta) < 6;
  end if;
  return false;
end $$;
revoke all on function pode_subir_foto(text) from public;
grant execute on function pode_subir_foto(text) to anon, authenticated;

create or replace function registrar_foto_pos(p_acao uuid, p_numero int, p_bytes int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v acoes; v_cam text;
begin
  select * into v from acoes where id = p_acao;
  if not found then raise exception 'Ação não encontrada.'; end if;
  if p_numero not between 1 and 3 then raise exception 'Número da foto inválido.'; end if;
  v_cam := v.arvore_id || '/' || v.id || '/pos' || p_numero;
  if not exists (select 1 from storage.objects where bucket_id = 'fotos' and name = v_cam || '.jpg') then
    raise exception 'A foto não chegou ao armazenamento.';
  end if;
  insert into acoes_fotos (acao_id, caminho, bytes) values (v.id, v_cam, p_bytes) on conflict (caminho) do nothing;
  return jsonb_build_object('ok', true, 'caminho', v_cam);
end $$;
revoke all on function registrar_foto_pos(uuid, int, int) from public;
grant execute on function registrar_foto_pos(uuid, int, int) to anon, authenticated;

-- ===== Segurança =====
alter table acoes enable row level security;
alter table acoes_fotos enable row level security;
revoke all on acoes, acoes_fotos from anon;
grant select on acoes, acoes_fotos to anon, authenticated;
grant update, delete on acoes, acoes_fotos to authenticated;
drop policy if exists publico on acoes;       create policy publico on acoes       for select to anon, authenticated using (true);
drop policy if exists publico on acoes_fotos; create policy publico on acoes_fotos for select to anon, authenticated using (true);
drop policy if exists corrigir on acoes;      create policy corrigir on acoes      for update to authenticated using (papel_atual() = 'admin') with check (papel_atual() = 'admin');
drop policy if exists apagar on acoes;        create policy apagar on acoes        for delete to authenticated using (papel_atual() = 'admin');
drop policy if exists apagar on acoes_fotos;  create policy apagar on acoes_fotos  for delete to authenticated using (papel_atual() = 'admin');

-- ===== Visão pronta para a tela de Ações e o Dashboard =====
create or replace view acoes_publicas with (security_invoker = on) as
select a.id, a.arvore_id, a.inspecao_id, a.status, a.tipo, a.comentario, a.responsavel, a.concluida_em, a.criado_em,
       i.inspecionado_em, i.r, i.f, i.componente, i.alvo, i.protecao_imediata,
       coalesce(i.latitude, ar.latitude) as latitude, coalesce(i.longitude, ar.longitude) as longitude,
       coalesce(i.especie, ar.especie) as especie,
       coalesce((select array_agg(coalesce(x.caminho, x.drive_id) order by x.criado_em) from fotos x where x.inspecao_id = i.id), '{}') as fotos_antes,
       coalesce((select array_agg(x.caminho order by x.caminho) from acoes_fotos x where x.acao_id = a.id), '{}') as fotos_pos
  from acoes a join inspecoes i on i.id = a.inspecao_id join arvores ar on ar.id = a.arvore_id;
grant select on acoes_publicas to anon, authenticated;

-- ===== Conferência =====
do $$ begin
  if exists (select 1 from inspecoes i where not exists (select 1 from acoes a where a.inspecao_id = i.id)) then
    raise exception 'Ficou avaliação sem ação.';
  end if;
  if has_table_privilege('anon', 'acoes', 'update') or has_table_privilege('anon', 'acoes', 'insert') then
    raise exception 'Quem não tem login não pode mexer direto na tabela de ações.';
  end if;
  if not has_function_privilege('anon', 'dar_baixa_acao(jsonb)', 'execute') then
    raise exception 'A função de dar baixa não ficou liberada.';
  end if;
end $$;
