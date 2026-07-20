-- ---------------------------------------------------------------------------
-- decisoes_resumo_historico: contagem mensal de decisões de períodos
-- anteriores à existência do sistema (2024, 2025 e início de 2026), quando
-- só existia a planilha antiga e não há detalhe por trás do número, só o
-- total já apurado manualmente.
--
-- Não é atualizada em tempo real -- a partir do mês em que o sistema já
-- tem dado detalhado, o relatório passa a contar direto de
-- `v_decisoes_stats` (ver relatorio_anual_completo() abaixo). Se existir
-- linha aqui para um (ano, mes) que já tem dado ao vivo, a linha histórica
-- é ignorada (o dado ao vivo sempre vence) -- assim não corre risco de
-- contar em dobro.
-- ---------------------------------------------------------------------------
create table decisoes_resumo_historico (
  ano   integer not null,
  mes   integer not null check (mes between 1 and 12),
  qtde  integer not null default 0 check (qtde >= 0),
  primary key (ano, mes)
);

alter table decisoes_resumo_historico enable row level security;

create policy decisoes_resumo_historico_select_autenticado on decisoes_resumo_historico
  for select
  to authenticated
  using (auth_membro_id() is not null);

-- Só o dono do sistema ajusta números históricos manualmente.
create policy decisoes_resumo_historico_write_admin on decisoes_resumo_historico
  for all
  to authenticated
  using (auth_e_administrador())
  with check (auth_e_administrador());

-- ---------------------------------------------------------------------------
-- relatorio_anual_completo(): uma linha por (ano, mes) no intervalo pedido,
-- já resolvendo qual fonte vale -- dado ao vivo (v_decisoes_stats) quando
-- existir, senão o número histórico gravado manualmente, senão zero.
-- ---------------------------------------------------------------------------
create or replace function relatorio_anual_completo(p_ano_ini integer, p_ano_fim integer)
returns table (ano integer, mes integer, qtde integer)
language sql
stable
security definer
set search_path = public
as $$
  with meses as (
    select g.ano, m.mes
    from generate_series(p_ano_ini, p_ano_fim) as g(ano)
    cross join generate_series(1, 12) as m(mes)
  ),
  vivo as (
    select v.ano, v.mes, count(*)::int as qtde
    from v_decisoes_stats v
    where v.ano between p_ano_ini and p_ano_fim
    group by v.ano, v.mes
  )
  select
    meses.ano,
    meses.mes,
    coalesce(vivo.qtde, hist.qtde, 0) as qtde
  from meses
  left join vivo on vivo.ano = meses.ano and vivo.mes = meses.mes
  left join decisoes_resumo_historico hist on hist.ano = meses.ano and hist.mes = meses.mes
  order by meses.ano, meses.mes;
$$;

grant execute on function relatorio_anual_completo(integer, integer) to authenticated;
