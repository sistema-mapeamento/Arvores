-- 20261113_05_excluir_avaliacao.sql — excluir uma avaliação pelo site (13/11/2026).
-- ONDE RODAR: Supabase do projeto AVALIAÇÃO DE ÁRVORES (vzukefbkvkkvkfijuduu) > SQL Editor > New query > colar tudo > Run.
-- Precisa dos SQL 01 a 04 já rodados. Rodar 2 vezes não estraga.
--
-- COMO FUNCIONA
-- - "Excluir" no site pede o motivo e quem está excluindo. A avaliação some do mapa, das Ações e do Dashboard.
-- - Nada é apagado de verdade: a linha fica marcada (excluida_em, excluida_por, excluida_motivo).
--   Para desfazer: Table Editor > inspecoes > apagar o conteúdo de excluida_em daquela linha.
-- - Não exclui avaliação cuja ação já teve baixa (o registro do serviço feito fica guardado).
-- - Se a avaliação excluída era a mais nova da árvore, a ação da avaliação anterior volta a ficar aberta.
-- - Limite: 20 exclusões por minuto no total.

alter table inspecoes add column if not exists excluida_em timestamptz;
alter table inspecoes add column if not exists excluida_por text;
alter table inspecoes add column if not exists excluida_motivo text;
grant select (excluida_em) on inspecoes to anon;

-- a árvore passa a olhar só as avaliações não excluídas
create or replace function arvore_atualizar() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_id text := coalesce(new.arvore_id, old.arvore_id);
begin
  update arvores a set
    ultimo_r        = u.r,
    ultima_inspecao = u.inspecionado_em,
    inspecoes       = (select count(*) from inspecoes where arvore_id = v_id and excluida_em is null),
    latitude        = coalesce(u.latitude, a.latitude),
    longitude       = coalesce(u.longitude, a.longitude),
    especie         = coalesce(nullif(btrim(u.especie), ''), a.especie)
  from (select * from inspecoes where arvore_id = v_id and excluida_em is null order by inspecionado_em desc, criado_em desc limit 1) u
  where a.id = v_id;
  if not found then
    update arvores set ultimo_r = null, ultima_inspecao = null, inspecoes = 0 where id = v_id;
  end if;
  return null;
end $$;

-- ação nova: compara só com avaliações não excluídas
create or replace function acao_criar() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update acoes a set status = 'substituida'
    from inspecoes i
   where a.inspecao_id = i.id and a.arvore_id = new.arvore_id and a.status = 'aberta' and i.excluida_em is null
     and (i.inspecionado_em, i.criado_em) < (new.inspecionado_em, new.criado_em);
  insert into acoes (inspecao_id, arvore_id, status, criado_em)
  values (new.id, new.arvore_id,
          case when exists (select 1 from inspecoes i where i.arvore_id = new.arvore_id and i.id <> new.id and i.excluida_em is null
                             and (i.inspecionado_em, i.criado_em) > (new.inspecionado_em, new.criado_em))
               then 'substituida' else 'aberta' end,
          new.criado_em)
  on conflict (inspecao_id) do nothing;
  return null;
end $$;

-- ===== Excluir (usado pelo site) =====
create or replace function excluir_inspecao(p_id uuid, p_motivo text, p_responsavel text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v       inspecoes;
  v_acao  acoes;
  v_mot   text := left(btrim(coalesce(p_motivo, '')), 500);
  v_resp  text := left(btrim(coalesce(p_responsavel, '')), 120);
  v_ult   uuid;
begin
  select * into v from inspecoes where id = p_id for update;
  if not found then raise exception 'Avaliação não encontrada.'; end if;
  if v.excluida_em is not null then return jsonb_build_object('id', v.id, 'repetido', true); end if;
  if length(v_mot) < 3 then raise exception 'Escreva o motivo da exclusão.'; end if;
  if length(v_resp) < 3 then raise exception 'Informe quem está excluindo.'; end if;
  select * into v_acao from acoes where inspecao_id = v.id;
  if found and v_acao.status = 'concluida' then
    raise exception 'Esta avaliação já tem ação com baixa (%). Não pode ser excluída.',
      case v_acao.tipo when 'poda' then 'poda' when 'poda_drastica' then 'poda drástica' else 'supressão' end;
  end if;
  if (select count(*) from inspecoes where excluida_em > now() - interval '1 minute') >= 20 then
    raise exception 'Muitas exclusões ao mesmo tempo. Tente de novo em 1 minuto.';
  end if;

  update inspecoes set excluida_em = now(), excluida_por = v_resp, excluida_motivo = v_mot where id = v.id;
  update acoes set status = 'substituida' where inspecao_id = v.id and status = 'aberta';

  -- a avaliação mais nova que sobrou volta a ter a ação aberta (se não houver outra aberta nem baixa depois dela)
  select i.id into v_ult from inspecoes i
   where i.arvore_id = v.arvore_id and i.excluida_em is null
   order by i.inspecionado_em desc, i.criado_em desc limit 1;
  if v_ult is not null and not exists (select 1 from acoes a join inspecoes i on i.id = a.inspecao_id
                                        where a.arvore_id = v.arvore_id and i.excluida_em is null and a.status = 'aberta') then
    update acoes set status = 'aberta' where inspecao_id = v_ult and status = 'substituida';
  end if;
  return jsonb_build_object('id', v.id, 'arvore_id', v.arvore_id);
end $$;
revoke all on function excluir_inspecao(uuid, text, text) from public;
grant execute on function excluir_inspecao(uuid, text, text) to anon, authenticated;

-- ===== Visões sem as excluídas =====
create or replace view inspecoes_publicas with (security_invoker = on) as
select i.id, i.arvore_id, i.inspecionado_em, i.motivo, i.componente, i.tipo_alvo, i.alvo, i.situacao_controles,
       i.f, i.e, i.c, i.j, i.r, i.protecao_imediata,
       coalesce(i.latitude, a.latitude) as latitude, coalesce(i.longitude, a.longitude) as longitude,
       coalesce(i.especie, a.especie) as especie,
       coalesce((select array_agg(coalesce(x.caminho, x.drive_id) order by x.criado_em) from fotos x where x.inspecao_id = i.id), '{}') as fotos
  from inspecoes i join arvores a on a.id = i.arvore_id
 where i.excluida_em is null;
grant select on inspecoes_publicas to anon, authenticated;

create or replace view acoes_publicas with (security_invoker = on) as
select a.id, a.arvore_id, a.inspecao_id, a.status, a.tipo, a.comentario, a.responsavel, a.concluida_em, a.criado_em,
       i.inspecionado_em, i.r, i.f, i.componente, i.alvo, i.protecao_imediata,
       coalesce(i.latitude, ar.latitude) as latitude, coalesce(i.longitude, ar.longitude) as longitude,
       coalesce(i.especie, ar.especie) as especie,
       coalesce((select array_agg(coalesce(x.caminho, x.drive_id) order by x.criado_em) from fotos x where x.inspecao_id = i.id), '{}') as fotos_antes,
       coalesce((select array_agg(x.caminho order by x.caminho) from acoes_fotos x where x.acao_id = a.id), '{}') as fotos_pos
  from acoes a join inspecoes i on i.id = a.inspecao_id join arvores ar on ar.id = a.arvore_id
 where i.excluida_em is null;
grant select on acoes_publicas to anon, authenticated;

-- ===== Conferência =====
do $$ begin
  if not has_function_privilege('anon', 'excluir_inspecao(uuid, text, text)', 'execute') then
    raise exception 'A função de excluir não ficou liberada.';
  end if;
  if has_table_privilege('anon', 'inspecoes', 'update') or has_table_privilege('anon', 'inspecoes', 'delete') then
    raise exception 'Quem não tem login não pode mexer direto na tabela.';
  end if;
end $$;
