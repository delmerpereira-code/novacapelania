-- Mudança de modelo pedida pelo usuário: não guardar decisão por decisão
-- pra sempre. Uma decisão só fica detalhada (nome, telefone) enquanto
-- ainda "não fechou":
--   - "Não quer integração"  -> nasce já arquivada (nunca teve pendência).
--   - "Quer integração"      -> fica em `decisoes` até alguém confirmar a
--     integração; nesse momento vira só contador em `decisoes_arquivo` e a
--     linha detalhada é apagada (arquivar_integracao()).
-- `resultado_integracao` (log de quem confirmou cada uma) deixou de fazer
-- sentido nesse modelo -- o próprio arquivamento já guarda o integrador
-- responsável pela contagem, sem precisar do log individual.

drop table if exists resultado_integracao cascade;

-- ---------------------------------------------------------------------------
-- decisoes_arquivo: sem nome/telefone/observações de propósito -- só o que
-- os relatórios precisam pra contar.
-- ---------------------------------------------------------------------------
create table decisoes_arquivo (
  id             uuid primary key default gen_random_uuid(),
  semana         integer not null,
  ano            integer not null,
  mes            integer not null,
  equipe_id      uuid references equipes(id) on delete set null,
  sexo           text,
  quer_integracao boolean not null,
  motivo_nao_integracao text,
  integrado      boolean not null default false,
  integrador_id  uuid references membros(id) on delete set null,
  created_at     timestamptz not null default now()
);

create index decisoes_arquivo_semana_idx on decisoes_arquivo (semana);
create index decisoes_arquivo_ano_mes_idx on decisoes_arquivo (ano, mes);
create index decisoes_arquivo_integrador_semana_idx on decisoes_arquivo (integrador_id, semana);

alter table decisoes_arquivo enable row level security;

create policy decisoes_arquivo_select_autenticado on decisoes_arquivo
  for select
  to authenticated
  using (auth_membro_id() is not null);

-- Insert aberto pra qualquer autenticado: tanto quem grava uma decisão não
-- integrável (arquivamento imediato, direto do cliente) quanto a function
-- arquivar_integracao() (abaixo) precisam gravar aqui.
create policy decisoes_arquivo_insert_autenticado on decisoes_arquivo
  for insert
  to authenticated
  with check (auth_membro_id() is not null);

-- ---------------------------------------------------------------------------
-- v_decisoes_stats: uma linha "achatada" por decisão, seja ela ainda uma
-- decisão pendente em `decisoes` ou já um registro em `decisoes_arquivo`.
-- Os relatórios (Semana/Histórico/Anual) consultam essa view em vez das
-- tabelas diretamente, pra não precisar saber se o dado ainda está
-- detalhado ou já foi arquivado.
-- ---------------------------------------------------------------------------
create view v_decisoes_stats as
select
  d.semana,
  extract(year from d.data_visita)::int as ano,
  extract(month from d.data_visita)::int as mes,
  d.equipe_id,
  d.sexo,
  d.quer_integracao,
  d.motivo_nao_integracao,
  coalesce(i.integrado, false) as integrado,
  i.integrador_id
from decisoes d
left join integracoes i on i.decisao_id = d.id
union all
select semana, ano, mes, equipe_id, sexo, quer_integracao, motivo_nao_integracao, integrado, integrador_id
from decisoes_arquivo;

-- ---------------------------------------------------------------------------
-- arquivar_integracao(): "fecha" uma integração pendente -- grava o
-- contador em decisoes_arquivo e apaga a decisão original (cascade também
-- remove a linha correspondente em `integracoes`). Roda como
-- SECURITY DEFINER porque qualquer autenticado pode confirmar uma
-- integração de outro colega (já decidido em 0003_integracao.sql), mas a
-- policy de DELETE em `decisoes` continua restrita a "próprio capelão ou
-- liderança" -- essa function é o único caminho autorizado pra apagar uma
-- decisão por causa de arquivamento, sem abrir um DELETE geral na tabela.
-- ---------------------------------------------------------------------------
create or replace function arquivar_integracao(p_integracao_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decisao_id     uuid;
  v_integrador_id  uuid;
  v_semana         integer;
  v_ano            integer;
  v_mes            integer;
  v_equipe_id      uuid;
  v_sexo           text;
begin
  select i.integrador_id, d.id, d.semana,
         extract(year from d.data_visita)::int, extract(month from d.data_visita)::int,
         d.equipe_id, d.sexo
    into v_integrador_id, v_decisao_id, v_semana, v_ano, v_mes, v_equipe_id, v_sexo
  from integracoes i
  join decisoes d on d.id = i.decisao_id
  where i.id = p_integracao_id;

  if v_decisao_id is null then
    raise exception 'integração não encontrada';
  end if;

  insert into decisoes_arquivo (semana, ano, mes, equipe_id, sexo, quer_integracao, integrado, integrador_id)
  values (v_semana, v_ano, v_mes, v_equipe_id, v_sexo, true, true, v_integrador_id);

  delete from decisoes where id = v_decisao_id;
end;
$$;

grant execute on function arquivar_integracao(uuid) to authenticated;
