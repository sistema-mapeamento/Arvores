-- 20261113_06_id_sequencial.sql — ID da árvore em sequência: ARV-00001, ARV-00002, ... (13/11/2026).
-- ONDE RODAR: Supabase do projeto AVALIAÇÃO DE ÁRVORES (vzukefbkvkkvkfijuduu) > SQL Editor > New query > colar tudo > Run.
-- Precisa dos SQL 01 a 05 já rodados. Rodar 2 vezes não estraga.
--
-- COMO FUNCIONA
-- - O formulário mostra o próximo número livre (proximo_id_arvore).
-- - Na hora de gravar, quem dá o número final é o banco: se dois celulares pegaram o mesmo número,
--   o segundo recebe o seguinte. Assim nunca repete e não pula número.
-- - Reavaliar uma árvore mantém o ID dela. ID digitado à mão (placa) continua aceito.
-- - Na 1ª vez que roda, as árvores que já existem com ID fora do padrão são renumeradas na ordem em que foram criadas
--   (avaliações, ações e fotos acompanham sozinhas; as fotos continuam no mesmo lugar).

-- ===== Próximo número livre =====
create or replace function proximo_id_arvore() returns text
language sql stable security definer set search_path = public as $$
  select 'ARV-' || lpad((coalesce(max(substring(id from '^ARV-(\d{5})$')::int), 0) + 1)::text, 5, '0') from arvores
$$;
revoke all on function proximo_id_arvore() from public;
grant execute on function proximo_id_arvore() to anon, authenticated;

-- ===== Renumerar as árvores antigas (só as que estão fora do padrão ARV-00000) =====
do $$
declare r record;
begin
  perform pg_advisory_xact_lock(hashtext('arvores-id'));
  if exists (select 1 from arvores where id ~ '^ARV-\d{5}$') then return; end if;   -- já renumerado antes: não mexe de novo
  for r in select id from arvores where id !~ '^ARV-\d{5}$' order by criado_em, id loop
    update arvores set id = proximo_id_arvore() where id = r.id;   -- avaliações, fotos e ações vão junto (on update cascade)
  end loop;
end $$;

-- ===== Registrar avaliação: número automático =====
-- p.id_auto = true -> o banco dá o próximo número da fila. Devolve o arvore_id final.
create or replace function registrar_inspecao(p jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id     text := btrim(coalesce(p->>'arvore_id', ''));
  v_auto   boolean := coalesce((p->>'id_auto')::boolean, false);
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
    if found then return jsonb_build_object('id', v.id, 'j', v.j, 'r', v.r, 'arvore_id', v.arvore_id, 'repetido', true); end if;
  end if;
  if v_auto then
    perform pg_advisory_xact_lock(hashtext('arvores-id'));            -- um de cada vez pega número
    v_id := proximo_id_arvore();                                       -- sempre o próximo da fila: não repete nem pula
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
  return jsonb_build_object('id', v.id, 'j', v.j, 'r', v.r, 'arvore_id', v.arvore_id);
end $$;
revoke all on function registrar_inspecao(jsonb) from public;
grant execute on function registrar_inspecao(jsonb) to anon, authenticated;

-- ===== Conferência =====
do $$ begin
  if not has_function_privilege('anon', 'proximo_id_arvore()', 'execute') then raise exception 'Próximo ID não ficou liberado.'; end if;
end $$;
-- Ver como ficou:  select id, criado_em from arvores order by id;
