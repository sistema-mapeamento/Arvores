-- 20261112_02_sistema_aberto.sql — sistema ABERTO (decisão do dono, 12/11/2026):
-- todos veem o mapa e todos registram avaliações, sem login.
-- ONDE RODAR: Supabase do projeto AVALIAÇÃO DE ÁRVORES (vzukefbkvkkvkfijuduu) > SQL Editor > New query > colar tudo > Run.
-- Precisa do 20261112_01_estrutura.sql já rodado. Rodar 2 vezes não estraga.
--
-- PROTEÇÕES
-- - Sem login só dá para INCLUIR avaliação (pela função registrar_inspecao). Ninguém de fora altera ou apaga.
-- - O mapa público (inspecoes_publicas) não mostra nome do avaliador, geometria nem textos de evidências.
-- - Limite de 60 envios por minuto no total e reenvio do mesmo celular não duplica (envio_id).
-- - Correções e exclusões: só no painel do Supabase (Table Editor) ou por quem tiver papel admin.

alter table inspecoes alter column avaliador_email drop not null;
alter table inspecoes add column if not exists envio_id uuid unique;

-- ===== Registrar avaliação (usado pelo site) =====
create or replace function registrar_inspecao(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     text := btrim(coalesce(p->>'arvore_id', ''));
  v_envio  uuid := nullif(p->>'envio_id', '')::uuid;
  v_lat    numeric := nullif(p->>'latitude', '')::numeric;
  v_lon    numeric := nullif(p->>'longitude', '')::numeric;
  v_quando timestamptz := coalesce(nullif(p->>'inspecionado_em', '')::timestamptz, now());
  v_esp    text := nullif(left(btrim(coalesce(p->>'especie', '')), 120), '');
  v        inspecoes;
begin
  -- reenvio do mesmo celular: devolve o que já foi gravado
  if v_envio is not null then
    select * into v from inspecoes where envio_id = v_envio;
    if found then return jsonb_build_object('id', v.id, 'j', v.j, 'r', v.r, 'repetido', true); end if;
  end if;
  if v_id !~ '^[A-Za-z0-9_-]{3,100}$' then raise exception 'ID da árvore inválido.'; end if;
  if (select count(*) from inspecoes where criado_em > now() - interval '1 minute') >= 60 then
    raise exception 'Muitos envios ao mesmo tempo. Tente de novo em 1 minuto.';
  end if;
  if v_quando > now() + interval '1 day' or v_quando < now() - interval '2 years' then
    raise exception 'Data da inspeção fora do esperado.';
  end if;
  if length(coalesce(p->>'avaliador', '')) > 180 or length(coalesce(p->>'geometria', '')) > 4000
     or length(coalesce(p->>'evidencias', '')) > 6000 or length(coalesce(p->>'observacoes', '')) > 4000 then
    raise exception 'Texto longo demais em um dos campos.';
  end if;

  insert into arvores (id, latitude, longitude, especie) values (v_id, v_lat, v_lon, v_esp)
  on conflict (id) do nothing;

  insert into inspecoes (envio_id, arvore_id, inspecionado_em, avaliador, avaliador_email, motivo, componente, tipo_alvo, alvo,
                         situacao_controles, alcance_verificado, f, e, c, latitude, longitude, especie, geometria, evidencias, observacoes)
  values (v_envio, v_id, v_quando, btrim(coalesce(p->>'avaliador', '')), lower(auth.jwt() ->> 'email'),
          coalesce(nullif(p->>'motivo', ''), 'rotina'), left(btrim(coalesce(p->>'componente', '')), 120),
          p->>'tipo_alvo', left(btrim(coalesce(p->>'alvo', '')), 200), coalesce(nullif(p->>'situacao_controles', ''), 'inicial'),
          coalesce((p->>'alcance_verificado')::boolean, false), (p->>'f')::smallint, (p->>'e')::smallint, (p->>'c')::smallint,
          v_lat, v_lon, v_esp, p->>'geometria', p->>'evidencias', nullif(btrim(coalesce(p->>'observacoes', '')), ''))
  returning * into v;
  return jsonb_build_object('id', v.id, 'j', v.j, 'r', v.r);
end $$;
revoke all on function registrar_inspecao(jsonb) from public;
grant execute on function registrar_inspecao(jsonb) to anon, authenticated;

-- ===== Leitura pública (só colunas que podem aparecer) =====
grant select (id, latitude, longitude, area, especie, ultimo_r, ultima_inspecao, inspecoes, criado_em) on arvores to anon;
grant select (id, arvore_id, inspecionado_em, motivo, componente, tipo_alvo, alvo, situacao_controles, f, e, c, j, r,
              protecao_imediata, latitude, longitude, especie, criado_em) on inspecoes to anon;
grant select (id, inspecao_id, arvore_id, drive_id, criado_em) on fotos to anon;

drop policy if exists publico on arvores;   create policy publico on arvores   for select to anon using (true);
drop policy if exists publico on inspecoes; create policy publico on inspecoes for select to anon using (true);
drop policy if exists publico on fotos;     create policy publico on fotos     for select to anon using (true);

create or replace view inspecoes_publicas with (security_invoker = on) as
select i.id, i.arvore_id, i.inspecionado_em, i.motivo, i.componente, i.tipo_alvo, i.alvo, i.situacao_controles,
       i.f, i.e, i.c, i.j, i.r, i.protecao_imediata,
       coalesce(i.latitude, a.latitude) as latitude, coalesce(i.longitude, a.longitude) as longitude,
       coalesce(i.especie, a.especie) as especie,
       coalesce((select array_agg(x.drive_id order by x.criado_em) from fotos x where x.inspecao_id = i.id), '{}') as fotos
  from inspecoes i join arvores a on a.id = i.arvore_id;
grant select on inspecoes_publicas to anon, authenticated;

-- ===== Conferência =====
do $$ begin
  if not has_function_privilege('anon', 'registrar_inspecao(jsonb)', 'execute') then
    raise exception 'A função de registrar não ficou liberada.';
  end if;
  if has_table_privilege('anon', 'inspecoes', 'insert') or has_table_privilege('anon', 'inspecoes', 'delete') then
    raise exception 'Quem não tem login não pode gravar direto na tabela.';
  end if;
end $$;
