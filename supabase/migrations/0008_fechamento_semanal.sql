-- Ajuste de fluxo pedido pelo usuário: uma decisão (integrável ou não)
-- fica guardada e editável em `decisoes` a semana inteira -- pode
-- precisar de correção. Confirmar integração só troca o coração de
-- vermelho pra verde (integrado = true), sem arquivar/apagar na hora. O
-- arquivamento de verdade (virar só contador) só acontece na virada de
-- semana, junto com a distribuição -- por isso decisões não-integráveis
-- pararam de arquivar direto no INSERT (ver supaGravarDecisao no
-- frontend) e passaram a nascer como decisão viva normal.
--
-- arquivar_semana_fechada(): varre `decisoes` e arquiva duas coisas em
-- decisoes_arquivo, apagando o registro detalhado depois:
--   1. Integráveis já confirmadas (integracoes.integrado = true) --
--      "verdes" que já cumpriram o papel.
--   2. Não-integráveis (quer_integracao = false) -- nunca tiveram
--      pendência real, só ficaram guardadas pra eventual ajuste.
-- O que continua "vermelho" (integrado = false) NÃO é tocado -- continua
-- vivo, com o mesmo integrador, pra cobrança seguir na semana seguinte.
-- A "semana futura" da fila de Integração nasce automaticamente disso:
-- é só o que sobrou vivo depois desse arquivamento.
create or replace function arquivar_semana_fechada()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  total integer := 0;
  rec record;
begin
  if current_setting('request.jwt.claims', true) is not null and not auth_e_administrador() then
    raise exception 'apenas o administrador pode disparar o fechamento manualmente';
  end if;

  for rec in
    select d.id as decisao_id, d.semana,
           extract(year from d.data_visita)::int as ano,
           extract(month from d.data_visita)::int as mes,
           d.equipe_id, d.sexo, i.integrador_id
    from decisoes d
    join integracoes i on i.decisao_id = d.id
    where i.integrado = true
  loop
    insert into decisoes_arquivo (semana, ano, mes, equipe_id, sexo, quer_integracao, integrado, integrador_id)
    values (rec.semana, rec.ano, rec.mes, rec.equipe_id, rec.sexo, true, true, rec.integrador_id);
    delete from decisoes where id = rec.decisao_id;
    total := total + 1;
  end loop;

  for rec in
    select d.id as decisao_id, d.semana,
           extract(year from d.data_visita)::int as ano,
           extract(month from d.data_visita)::int as mes,
           d.equipe_id, d.sexo, d.motivo_nao_integracao
    from decisoes d
    where d.quer_integracao = false
  loop
    insert into decisoes_arquivo (semana, ano, mes, equipe_id, sexo, quer_integracao, motivo_nao_integracao, integrado, integrador_id)
    values (rec.semana, rec.ano, rec.mes, rec.equipe_id, rec.sexo, false, rec.motivo_nao_integracao, false, null);
    delete from decisoes where id = rec.decisao_id;
    total := total + 1;
  end loop;

  return total;
end;
$$;

grant execute on function arquivar_semana_fechada() to authenticated;

-- arquivar_integracao() (0005) ficou obsoleta -- o arquivamento agora é
-- sempre em lote na virada de semana, não mais individual no momento de
-- confirmar. Removida pra não ficar código morto que não é mais chamado
-- por ninguém.
drop function if exists arquivar_integracao(uuid);

-- Reagenda o cron pra rodar o fechamento antes da distribuição, no mesmo
-- horário já definido em 0006 (domingo 23:50 America/Manaus).
select cron.schedule(
  'distribuir-integracoes-semanal',
  '50 3 * * 1',
  $$ select arquivar_semana_fechada(); select distribuir_integracoes(); $$
);
