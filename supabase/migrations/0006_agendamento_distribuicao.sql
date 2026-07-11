-- Reativa o comportamento automático do snapshotSemanal antigo (disparado
-- por trigger de planilha todo domingo 23h55): agenda
-- distribuir_integracoes() via pg_cron pra rodar toda semana, sem precisar
-- do botão manual 🔀.
--
-- distribuir_integracoes() checava liderança lendo o claim do JWT
-- (auth_e_lideranca()) -- isso só existe quando a chamada vem da API
-- (PostgREST) com um token de login. Uma chamada de dentro do próprio
-- banco (cron, SQL direto) não tem esse contexto nenhum -- por isso o
-- bloqueio só se aplica quando EXISTE um JWT no contexto e ele não é de
-- liderança; chamada sem JWT nenhum (só possível internamente, nunca via
-- API pública) continua permitida.
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
  if current_setting('request.jwt.claims', true) is not null and not auth_e_lideranca() then
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

-- ---------------------------------------------------------------------------
-- Agendamento: toda segunda-feira 03:50 UTC = domingo 23:50 em
-- America/Manaus (UTC-4, sem horário de verão). Ajustar o cron expression
-- se a operação não for mais em Manaus/AM.
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.schedule(
  'distribuir-integracoes-semanal',
  '50 3 * * 1',
  $$ select distribuir_integracoes(); $$
);
