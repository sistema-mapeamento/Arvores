-- 20261112_03_fotos_supabase.sql — fotos guardadas no próprio Supabase (Storage), 12/11/2026.
-- ONDE RODAR: Supabase do projeto AVALIAÇÃO DE ÁRVORES (vzukefbkvkkvkfijuduu) > SQL Editor > New query > colar tudo > Run.
-- Precisa dos SQL 01 e 02 já rodados. Rodar 2 vezes não estraga.
--
-- COMO FICA
-- Pasta "fotos" (bucket público, só leitura para quem vê o mapa):
--   fotos/<ID da árvore>/<código da avaliação>/foto1.jpg       (foto inteira, ~1280 px)
--   fotos/<ID da árvore>/<código da avaliação>/foto1_mini.jpg  (miniatura, ~480 px, usada no mapa e nas listas)
-- PROTEÇÕES (sistema aberto, sem login)
-- - Só JPG, no máximo 3 MB por arquivo.
-- - Só sobe foto de avaliação que existe, é daquela árvore e foi feita nas últimas 48 horas.
-- - No máximo 5 fotos (10 arquivos, com as miniaturas) por avaliação. Ninguém de fora troca ou apaga foto.

-- ===== Pasta das fotos =====
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos', 'fotos', true, 3145728, array['image/jpeg'])
on conflict (id) do update set public = true, file_size_limit = 3145728, allowed_mime_types = array['image/jpeg'];

-- pode subir este arquivo? (usado pela regra de segurança do Storage)
create or replace function pode_subir_foto(p_nome text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare v_p text[] := string_to_array(p_nome, '/'); v_pasta text; v_ok boolean;
begin
  if coalesce(array_length(v_p, 1), 0) <> 3 then return false; end if;
  if v_p[1] !~ '^[A-Za-z0-9_-]{3,100}$' or v_p[2] !~ '^[0-9a-f-]{36}$' or v_p[3] !~ '^foto[1-5](_mini)?\.jpg$' then return false; end if;
  select true into v_ok from inspecoes i
   where i.id = v_p[2]::uuid and i.arvore_id = v_p[1] and i.criado_em > now() - interval '48 hours';
  if not coalesce(v_ok, false) then return false; end if;
  v_pasta := v_p[1] || '/' || v_p[2] || '/';
  return (select count(*) from storage.objects o where o.bucket_id = 'fotos' and left(o.name, length(v_pasta)) = v_pasta) < 10;
end $$;
revoke all on function pode_subir_foto(text) from public;
grant execute on function pode_subir_foto(text) to anon, authenticated;

drop policy if exists "fotos: subir" on storage.objects;
create policy "fotos: subir" on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'fotos' and public.pode_subir_foto(name));

-- ===== Registro da foto no banco =====
alter table fotos alter column drive_id drop not null;
alter table fotos add column if not exists caminho text unique;
grant select (caminho) on fotos to anon;

-- p_numero 1 a 5: confere se o arquivo foi mesmo salvo e registra (repetir não duplica)
create or replace function registrar_foto(p_inspecao uuid, p_numero int, p_bytes int) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_insp inspecoes; v_cam text;
begin
  select * into v_insp from inspecoes where id = p_inspecao;
  if not found then raise exception 'Avaliação não encontrada.'; end if;
  if p_numero not between 1 and 5 then raise exception 'Número da foto inválido.'; end if;
  v_cam := v_insp.arvore_id || '/' || v_insp.id || '/foto' || p_numero;
  if not exists (select 1 from storage.objects where bucket_id = 'fotos' and name = v_cam || '.jpg') then
    raise exception 'A foto não chegou ao armazenamento.';
  end if;
  insert into fotos (inspecao_id, arvore_id, caminho, nome, bytes, criado_por)
  values (v_insp.id, v_insp.arvore_id, v_cam, 'foto' || p_numero || '.jpg', p_bytes, 'site')
  on conflict (caminho) do nothing;
  return jsonb_build_object('ok', true, 'caminho', v_cam);
end $$;
revoke all on function registrar_foto(uuid, int, int) from public;
grant execute on function registrar_foto(uuid, int, int) to anon, authenticated;

-- o mapa passa a receber o caminho da foto
create or replace view inspecoes_publicas with (security_invoker = on) as
select i.id, i.arvore_id, i.inspecionado_em, i.motivo, i.componente, i.tipo_alvo, i.alvo, i.situacao_controles,
       i.f, i.e, i.c, i.j, i.r, i.protecao_imediata,
       coalesce(i.latitude, a.latitude) as latitude, coalesce(i.longitude, a.longitude) as longitude,
       coalesce(i.especie, a.especie) as especie,
       coalesce((select array_agg(coalesce(x.caminho, x.drive_id) order by x.criado_em) from fotos x where x.inspecao_id = i.id), '{}') as fotos
  from inspecoes i join arvores a on a.id = i.arvore_id;
grant select on inspecoes_publicas to anon, authenticated;

-- ===== Quanto espaço já foi usado (rodar quando quiser conferir) =====
-- select count(*) as arquivos, pg_size_pretty(sum((metadata->>'size')::bigint)) as espaco
--   from storage.objects where bucket_id = 'fotos';
