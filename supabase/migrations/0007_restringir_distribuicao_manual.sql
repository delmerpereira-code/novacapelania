-- Disparo manual da distribuição (botão 🔀) fica restrito a uma única
-- matrícula (pedido do usuário), em vez de qualquer perfil Líder. O
-- agendamento automático de domingo (0006) continua rodando pra todo
-- mundo normalmente -- essa restrição só afeta quem pode acionar fora da
-- hora.
create or replace function auth_e_administrador()
returns boolean
language sql
stable
as $$
  select (current_setting('request.jwt.claims', true)::json ->> 'matricula') = '17027'
$$;

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
  if current_setting('request.jwt.claims', true) is not null and not auth_e_administrador() then
    raise exception 'apenas o administrador pode disparar a distribuição manualmente';
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
