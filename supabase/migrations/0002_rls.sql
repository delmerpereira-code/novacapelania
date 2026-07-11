-- Policies de RLS reais, substituindo o placeholder de 0001_init.sql.
-- Pressupõe o JWT emitido pela Edge Function `login` (matrícula/senha,
-- HS256 com o Legacy JWT Secret do projeto), com claims:
--   role='authenticated', membro_id=<uuid>, matricula, perfil.
--
-- Regra geral adotada (ajustar por tela conforme forem implementadas):
--   - Qualquer membro autenticado pode LER cadastro, equipes e vínculos
--     (equivalente ao que a planilha antiga já expunha a todo usuário
--     logado).
--   - Decisões, integração e presença: cada capelão vê/edita as próprias
--     (linhas onde ele é o autor), liderança ('Líder'/'Capelão' em
--     membros.perfil) vê e edita tudo -- corrige o bug do sistema antigo
--     de editarDecisao/excluirDecisao nunca implementadas.
--   - senha_hash nunca é exposta a nenhum client (revoke de coluna),
--     só a Edge Function (service_role) lê para validar login.

drop policy if exists membros_select_self on membros;

create or replace function auth_membro_id()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'membro_id', '')::uuid
$$;

create or replace function auth_perfil()
returns text
language sql
stable
as $$
  select current_setting('request.jwt.claims', true)::json ->> 'perfil'
$$;

create or replace function auth_e_lideranca()
returns boolean
language sql
stable
as $$
  select auth_perfil() in ('Líder', 'Capelão')
$$;

-- ---------------------------------------------------------------------------
-- membros
-- ---------------------------------------------------------------------------
revoke select on membros from authenticated, anon;
grant select (
  id, legado_id, matricula, foto_url, nome_completo, nome_social, sexo,
  telefone, telefone_normalizado, rg, email, declaracao_ministerio,
  lider_ga, um_com_deus, batizado, grupo, culto, senib, aniversario_mes,
  aniversario_dia, faz_integracao, ativo, observacoes, perfil,
  created_at, updated_at
) on membros to authenticated;
-- senha_hash de propósito fora da lista acima -- só service_role (Edge
-- Function de login) enxerga essa coluna.

create policy membros_select_autenticado on membros
  for select
  to authenticated
  using (auth_membro_id() is not null);

create policy membros_update_self on membros
  for update
  to authenticated
  using (id = auth_membro_id())
  with check (id = auth_membro_id());

-- ---------------------------------------------------------------------------
-- equipes / membro_equipe
-- ---------------------------------------------------------------------------
create policy equipes_select_autenticado on equipes
  for select
  to authenticated
  using (auth_membro_id() is not null);

create policy equipes_escrita_lideranca on equipes
  for all
  to authenticated
  using (auth_e_lideranca())
  with check (auth_e_lideranca());

create policy membro_equipe_select_autenticado on membro_equipe
  for select
  to authenticated
  using (auth_membro_id() is not null);

create policy membro_equipe_escrita_lideranca on membro_equipe
  for all
  to authenticated
  using (auth_e_lideranca())
  with check (auth_e_lideranca());

-- ---------------------------------------------------------------------------
-- decisoes
-- ---------------------------------------------------------------------------
create policy decisoes_select_proprio_ou_lideranca on decisoes
  for select
  to authenticated
  using (capelao_id = auth_membro_id() or auth_e_lideranca());

create policy decisoes_insert_proprio on decisoes
  for insert
  to authenticated
  with check (capelao_id = auth_membro_id());

create policy decisoes_update_proprio_ou_lideranca on decisoes
  for update
  to authenticated
  using (capelao_id = auth_membro_id() or auth_e_lideranca())
  with check (capelao_id = auth_membro_id() or auth_e_lideranca());

create policy decisoes_delete_proprio_ou_lideranca on decisoes
  for delete
  to authenticated
  using (capelao_id = auth_membro_id() or auth_e_lideranca());

-- ---------------------------------------------------------------------------
-- integracoes / resultado_integracao
-- ---------------------------------------------------------------------------
create policy integracoes_select_autenticado on integracoes
  for select
  to authenticated
  using (auth_membro_id() is not null);

create policy integracoes_update_integrador_ou_lideranca on integracoes
  for update
  to authenticated
  using (integrador_id = auth_membro_id() or auth_e_lideranca())
  with check (integrador_id = auth_membro_id() or auth_e_lideranca());

create policy resultado_integracao_select_autenticado on resultado_integracao
  for select
  to authenticated
  using (auth_membro_id() is not null);

create policy resultado_integracao_insert_proprio_ou_lideranca on resultado_integracao
  for insert
  to authenticated
  with check (capelao_id = auth_membro_id() or auth_e_lideranca());

-- ---------------------------------------------------------------------------
-- presenca
-- ---------------------------------------------------------------------------
create policy presenca_select_proprio_ou_lideranca on presenca
  for select
  to authenticated
  using (membro_id = auth_membro_id() or auth_e_lideranca());

create policy presenca_insert_proprio on presenca
  for insert
  to authenticated
  with check (membro_id = auth_membro_id());

-- ---------------------------------------------------------------------------
-- resumo_visitas
-- ---------------------------------------------------------------------------
create policy resumo_visitas_select_autenticado on resumo_visitas
  for select
  to authenticated
  using (auth_membro_id() is not null);

create policy resumo_visitas_escrita_lideranca on resumo_visitas
  for all
  to authenticated
  using (auth_e_lideranca())
  with check (auth_e_lideranca());
