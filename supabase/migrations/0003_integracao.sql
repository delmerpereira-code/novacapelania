-- Ajustes de RLS descobertos ao portar a tela de Integração + distribuição
-- round-robin de integradores (substitui o snapshotSemanal do sistema
-- antigo, hoje disparado por trigger de domingo 23h55 -- aqui vira uma
-- function chamável manualmente; agendamento via pg_cron fica pra depois).

-- ---------------------------------------------------------------------------
-- decisoes: o lerDecisoesSemana_ original devolve TODAS as decisões da
-- semana pra qualquer usuário logado, sem filtrar por capelão -- é uma
-- tela de equipe, não uma tela pessoal. A policy de 0002 restringia a
-- leitura ao próprio capelão + liderança por engano; corrigido aqui.
-- UPDATE/DELETE continuam restritos (própria decisão ou liderança) --
-- diferente da leitura, isso nunca funcionou de verdade no sistema antigo
-- (editarDecisao/excluirDecisao eram só botões na UI, sem enforcement
-- real no backend), então mantemos o enforcement mais seguro aqui.
-- ---------------------------------------------------------------------------
drop policy if exists decisoes_select_proprio_ou_lideranca on decisoes;

create policy decisoes_select_autenticado on decisoes
  for select
  to authenticated
  using (auth_membro_id() is not null);

-- ---------------------------------------------------------------------------
-- integracoes / resultado_integracao: no sistema antigo qualquer capelão
-- logado podia marcar como integrada QUALQUER pendência da fila (não só a
-- atribuída a ele) -- comportamento de time colaborativo, mantido de
-- propósito (decisão confirmada com o usuário).
-- ---------------------------------------------------------------------------
drop policy if exists integracoes_update_integrador_ou_lideranca on integracoes;

create policy integracoes_update_autenticado on integracoes
  for update
  to authenticated
  using (auth_membro_id() is not null)
  with check (auth_membro_id() is not null);

drop policy if exists resultado_integracao_insert_proprio_ou_lideranca on resultado_integracao;

create policy resultado_integracao_insert_autenticado on resultado_integracao
  for insert
  to authenticated
  with check (auth_membro_id() is not null);

-- ---------------------------------------------------------------------------
-- distribuir_integracoes(): round-robin de decisões pendentes (quer
-- integração, telefone válido, ainda sem linha em `integracoes`) entre
-- membros com faz_integracao=true e ativo=true, pareando pelo sexo do
-- assistido (mesma regra do snapshotSemanal antigo: listas separadas de
-- integradores por sexo, com fallback pro outro sexo se a lista preferida
-- estiver vazia). SECURITY DEFINER + checagem de perfil porque só
-- liderança deve disparar -- é uma ação administrativa, não uma tela de
-- uso diário.
-- ---------------------------------------------------------------------------
create or replace function distribuir_integracoes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  pendente record;
  integradores_m uuid[];
  integradores_f uuid[];
  idx_m integer := 0;
  idx_f integer := 0;
  alvo_id uuid;
  total integer := 0;
begin
  if not auth_e_lideranca() then
    raise exception 'apenas liderança pode disparar a distribuição de integrações';
  end if;

  select array_agg(id order by nome_completo) into integradores_m
    from membros where faz_integracao and ativo and sexo = 'M';
  select array_agg(id order by nome_completo) into integradores_f
    from membros where faz_integracao and ativo and sexo = 'F';

  for pendente in
    select d.id, d.sexo
    from decisoes d
    where d.quer_integracao
      and length(d.telefone_normalizado) >= 10
      and not exists (select 1 from integracoes i where i.decisao_id = d.id)
    order by d.created_at
  loop
    alvo_id := null;
    if pendente.sexo = 'F' then
      if integradores_f is not null and array_length(integradores_f, 1) > 0 then
        alvo_id := integradores_f[(idx_f % array_length(integradores_f, 1)) + 1];
        idx_f := idx_f + 1;
      elsif integradores_m is not null and array_length(integradores_m, 1) > 0 then
        alvo_id := integradores_m[(idx_m % array_length(integradores_m, 1)) + 1];
        idx_m := idx_m + 1;
      end if;
    else
      if integradores_m is not null and array_length(integradores_m, 1) > 0 then
        alvo_id := integradores_m[(idx_m % array_length(integradores_m, 1)) + 1];
        idx_m := idx_m + 1;
      elsif integradores_f is not null and array_length(integradores_f, 1) > 0 then
        alvo_id := integradores_f[(idx_f % array_length(integradores_f, 1)) + 1];
        idx_f := idx_f + 1;
      end if;
    end if;

    insert into integracoes (decisao_id, integrador_id, integrado)
    values (pendente.id, alvo_id, false);
    total := total + 1;
  end loop;

  return total;
end;
$$;

grant execute on function distribuir_integracoes() to authenticated;
