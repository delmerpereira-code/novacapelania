-- Schema inicial da migração Capelania (Google Sheets/Apps Script -> Supabase).
-- Baseado no mapeamento de C:\Users\Delmer Pereira\Documents\GitHub\capelania\Code.gs
-- (sistema antigo, só consultado como referência, nunca alterado).
--
-- Ambiguidades do README já resolvidas contra os CSVs reais exportados de
-- Cadastro e Equipes (ver seção "Schema definitivo" do README):
--   1. Coluna F de Cadastro: confirmado, o header real da planilha chama a
--      coluna literalmente de "senha".
--   2. Aba Equipes: confirmado que existem colunas "Hospital" e "Lider"
--      (matrícula, casa com "pin" de Cadastro em 31 de 32 times -- 1
--      referência órfã nos dados, "13929", tratar como dado sujo no import).
--      NÃO existe coluna de dia da semana -- vem embutido no texto de
--      "Equipe" (ex: "HPS 28 de Agosto - Seg 15h às 16h"); "dia_semana"
--      permanece no schema como campo NULL a preencher via tela de gestão
--      de equipes, não populado pelo import.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Função utilitária: replica getSemanaNum_() do Code.gs (equivalente a
-- WEEKNUM(data, 2) do Google Sheets -- semana começa na segunda-feira).
-- O sistema antigo tinha 3 formas diferentes e inconsistentes de calcular/
-- receber "semana" (ora client manda pronta como string, ora como número).
-- Aqui a semana nunca é aceita como entrada: é sempre derivada da data.
-- ---------------------------------------------------------------------------
create or replace function semana_legado(d date)
returns integer
language sql
immutable
as $$
  select ceil(
    (
      (d - make_date(extract(year from d)::int, 1, 1))
      + (case extract(dow from make_date(extract(year from d)::int, 1, 1))::int
           when 0 then 7
           else extract(dow from make_date(extract(year from d)::int, 1, 1))::int
         end)
    ) / 7.0
  )::int
$$;

-- ---------------------------------------------------------------------------
-- membros (Cadastro)
-- ---------------------------------------------------------------------------
create table membros (
  id                       uuid primary key default gen_random_uuid(),
  legado_id                text unique,               -- coluna "id" da planilha antiga (ex: CP040), só para rastreabilidade do import
  matricula                text not null unique,      -- coluna "pin", chave de login
  senha_hash               text not null,             -- coluna "senha", texto puro -> bcrypt nesta migração
  foto_url                 text,
  nome_completo            text not null,
  nome_social              text,
  sexo                     text,
  telefone                 text,
  telefone_normalizado     text generated always as (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) stored,
  rg                       text,
  email                    text,
  declaracao_ministerio    boolean,           -- domínio real: 'S' ou vazio -> true/null
  lider_ga                 text,              -- NÃO é booleano: guarda o nome do líder de GA do membro (ex: "Claudio Decares e Cristina")
  um_com_deus              boolean,           -- domínio real: praticamente sempre 'S' -> true/null
  batizado                 boolean,           -- domínio real: 'S' / 'Não' / vazio -> true/false/null (normalizar no import)
  grupo                    text,              -- ex: "CASADOS" -- categoria/estado civil, não enum fechado confirmado
  culto                    text,
  senib                    text,
  aniversario_mes          smallint,          -- planilha só guarda "MM/DD" (ex: "10/27"), sem ano -- sem coluna `date` possível
  aniversario_dia          smallint,
  faz_integracao           boolean,           -- domínio real: 'S' / 'N' / vazio -> não forçar not null, vazio existe nos dados
  ativo                    boolean not null default true,  -- coluna "sit": 'Ativo' -> true, 'Desativado'/'Inativo' -> false
  observacoes              text,
  perfil                   text not null default 'Membro',  -- valores reais inconsistentes em maiúscula/minúscula ('LIDER'/'Membro'/'MEMBRO') -- normalizar no import
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

-- Não migrada: 24ª coluna sem cabeçalho no CSV de Cadastro, valor
-- praticamente constante ("Único" em 161 das 165 linhas) e sem uso
-- identificado em Code.gs -- sem sinal suficiente para virar coluna.

create index membros_ativo_idx on membros (ativo);

-- ---------------------------------------------------------------------------
-- equipes
-- Confirmado contra o CSV real: colunas id, Equipe (nome, com dia/horário
-- embutidos no texto), Hospital, Hora, Lider (matrícula do líder).
-- ---------------------------------------------------------------------------
create table equipes (
  id               uuid primary key default gen_random_uuid(),
  legado_id        text unique,        -- coluna "id" da planilha antiga (ex: EQ01)
  nome             text not null unique,  -- coluna "Equipe", ex: "HPS 28 de Agosto - Seg 15h às 16h"
  hospital         text,
  hora             text,               -- não é sempre HH:MM na planilha real (ex: "SÁBADO 14 às 15 h") -- manter texto, não `time`
  dia_semana       text,               -- não existe como coluna própria na planilha -- fica NULL até a tela de gestão de equipes preencher
  lider_id         uuid references membros(id),  -- resolvido a partir da matrícula ("Lider") no import; pode ficar NULL se a matrícula não existir em Cadastro (dado órfão encontrado: "13929")
  ativa            boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Junção que substitui a coluna S (Equipes, csv) de Cadastro.
create table membro_equipe (
  membro_id  uuid not null references membros(id) on delete cascade,
  equipe_id  uuid not null references equipes(id) on delete cascade,
  primary key (membro_id, equipe_id)
);

-- ---------------------------------------------------------------------------
-- decisoes
-- Layout de origem (Decisões, colunas A-N do Code.gs):
--   A=ID B=CarimboData C=MatCapelao D=NomeCapelao E=Equipe F=DataVisita
--   G=TipoAssistido H=NomeAssistido I=Sexo J=Tel K=Integrar(S/N)
--   L=MotivoNao M=Obs N=Semana
-- Colunas O (status integração) e P (nome equipe) eram fórmulas derivadas
-- (PROCX/XLOOKUP) -- aqui viram join/view, não coluna persistida.
-- ---------------------------------------------------------------------------
create table decisoes (
  id                      uuid primary key default gen_random_uuid(),
  legado_id               text unique,
  capelao_id              uuid not null references membros(id),
  equipe_id               uuid references equipes(id),
  carimbo_data            timestamptz not null default now(),
  data_visita             date not null,
  tipo_assistido          text,                     -- TODO confirmar domínio de valores reais
  nome_assistido          text not null,
  sexo                    text,
  telefone                text,
  telefone_normalizado    text generated always as (regexp_replace(coalesce(telefone, ''), '\D', '', 'g')) stored,
  quer_integracao         boolean not null default false,   -- coluna K (S/N) na planilha antiga
  motivo_nao_integracao   text,
  observacoes             text,
  semana                  integer generated always as (semana_legado(data_visita)) stored,
  created_at              timestamptz not null default now()
);

create index decisoes_semana_idx on decisoes (semana);
create index decisoes_equipe_idx on decisoes (equipe_id);
create index decisoes_data_visita_idx on decisoes (data_visita);

-- Corrige o bug de condição de corrida do sistema antigo (gravar sem lock,
-- com retry automático do frontend gerando duplicatas): constraint única no
-- banco em vez de lock aplicativo. Só aplica quando há telefone (igual à
-- regra antiga, que só verificava duplicata se telNovo != '').
create unique index decisoes_telefone_semana_uniq
  on decisoes (telefone_normalizado, semana)
  where telefone_normalizado <> '';

-- ---------------------------------------------------------------------------
-- integracoes (fila/estado -- substitui a aba "Integração")
-- resultado_integracao (log de confirmação -- substitui a aba
-- "Resultado_Integracao"), mantido separado do estado para preservar o
-- histórico de confirmações tal como o sistema antigo fazia.
-- ---------------------------------------------------------------------------
create table integracoes (
  id              uuid primary key default gen_random_uuid(),
  decisao_id      uuid not null unique references decisoes(id) on delete cascade,
  integrador_id   uuid references membros(id),   -- definido pelo round-robin (snapshotSemanal no sistema antigo)
  integrado       boolean not null default false,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table resultado_integracao (
  id             uuid primary key default gen_random_uuid(),
  decisao_id     uuid not null references decisoes(id) on delete cascade,
  capelao_id     uuid references membros(id),
  confirmado_em  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- presenca
-- O sistema antigo tinha DUAS regras de duplicata diferentes e inconsistentes:
-- gravarPresenca_ deduplicava por (matrícula, semana); verificarPresenca_
-- checava por (matrícula, data). Aqui fixamos UMA regra canônica:
-- (membro, semana) -- uma presença registrada por pessoa por semana, que era
-- o comportamento de fato aplicado na gravação.
-- ---------------------------------------------------------------------------
create table presenca (
  id           uuid primary key default gen_random_uuid(),
  membro_id    uuid not null references membros(id),
  equipe_id    uuid not null references equipes(id),
  data         date not null,
  hora         time not null default current_time,
  semana       integer generated always as (semana_legado(data)) stored,
  created_at   timestamptz not null default now(),
  unique (membro_id, semana)
);

create index presenca_equipe_semana_idx on presenca (equipe_id, semana);

-- ---------------------------------------------------------------------------
-- resumo_visitas
-- "lancadas" e "saldo" no sistema antigo eram um snapshot no momento do
-- gravarResumo (contagem de decisões da data+equipe naquele instante), não
-- um valor sempre live -- mantido snapshot aqui de propósito, para não
-- alterar decisões passadas se novas decisões forem lançadas depois.
-- ---------------------------------------------------------------------------
create table resumo_visitas (
  id               uuid primary key default gen_random_uuid(),
  data_visita      date not null,
  equipe_id        uuid not null references equipes(id),
  lider_id         uuid references membros(id),
  total_decisoes   integer not null,
  foto_url         text,
  lancadas         integer not null,
  saldo            integer generated always as (total_decisoes - lancadas) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (data_visita, equipe_id)
);

-- ---------------------------------------------------------------------------
-- Views derivadas, substituindo abas que no sistema antigo duplicavam dados
-- já existentes em outra aba (fonte de bugs de dessincronização):
--   - "Aniv" duplicava foto/nome/telefone/aniversário de Cadastro.
--   - "Rel_Presença" era uma matriz membro x semana calculada a partir de
--     Presença + Cadastro via COUNTIFS.
-- Ambas viram views aqui, sem tabela própria.
-- ---------------------------------------------------------------------------
create view v_aniversarios as
select
  id as membro_id,
  foto_url,
  coalesce(nome_social, nome_completo) as nome,
  telefone,
  aniversario_dia as dia,
  aniversario_mes as mes
from membros
where ativo and aniversario_mes is not null and aniversario_dia is not null;

create view v_decisoes_status as
select
  d.*,
  coalesce(i.integrado, false) as status_integracao,
  e.nome as nome_equipe
from decisoes d
left join integracoes i on i.decisao_id = d.id
left join equipes e on e.id = d.equipe_id;

-- Nenhuma tabela criada para "Historico_Integracao" (era só leitura,
-- agregação de integracoes/resultado_integracao -- vira query/view quando a
-- tela de relatório for implementada) nem para "Anual" (não encontrada em
-- Code.gs; confirmar se ainda é necessária antes de desenhar).

-- ---------------------------------------------------------------------------
-- Row Level Security
-- Login não usa Supabase Auth nativo: uma Edge Function valida
-- matrícula/senha (bcrypt) e emite um JWT compatível com o projeto, com
-- claims custom (membro_id, perfil). As policies abaixo leem esse claim via
-- auth.jwt(). Ajustar/expandir por tabela conforme as telas forem
-- implementadas -- por ora só habilita RLS e um placeholder de leitura para
-- o próprio membro autenticado.
-- ---------------------------------------------------------------------------
alter table membros enable row level security;
alter table equipes enable row level security;
alter table membro_equipe enable row level security;
alter table decisoes enable row level security;
alter table integracoes enable row level security;
alter table resultado_integracao enable row level security;
alter table presenca enable row level security;
alter table resumo_visitas enable row level security;

create policy membros_select_self on membros
  for select
  using (id = (auth.jwt() ->> 'membro_id')::uuid);
