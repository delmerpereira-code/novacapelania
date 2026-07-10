# Capelania — Migração para Supabase

Reescrita do app de Capelania trocando o armazenamento (hoje Google Sheets +
Apps Script) por **Supabase** (Postgres). Este documento é o ponto de partida
para a nova sessão/janela de trabalho — leia antes de começar a codar.

Sistema original intocado em: `C:\Users\Delmer Pereira\Documents\GitHub\capelania`
(NÃO alterar o projeto antigo — ele está em produção).

## Decisões já tomadas

- **Repositório**: novo, independente do projeto atual.
- **Frontend**: manter visual e fluxo atuais (`app.js` + `index.html` como
  referência de UX) — só trocar a camada de dados.
- **Dados migrados no seed inicial**: somente `Cadastro` (membros) e `Equipes`.
  Tudo o mais (`Decisões`, `Integração`, `Resumo`, `Presença`,
  `Historico_Integracao`, `Anual`) nasce vazio e passa a operar só a partir
  da entrada em produção do novo sistema.
- **Login**: manter login por matrícula/senha (não usar Supabase Auth nativo)
  — tabela própria de membros com matrícula como usuário. Trocar senha em
  texto puro (como é hoje na planilha) por hash (ex: bcrypt) já nesta
  migração — ganho de segurança "de graça".

## O que aprendemos auditando o sistema atual (Code.gs + app.js)

Vale ler com atenção — vários desses problemas **não devem ser replicados**
no novo sistema; a nova arquitetura já deve nascer sem eles.

### Bugs confirmados no sistema atual (produção)

1. **Condição de corrida em `gravar` (Decisões)**: o fluxo é
   ler-planilha → checar duplicata → `appendRow`, sem `LockService`. O
   `callScript` do frontend tem retry automático que reenvia a mesma
   requisição se demorar — isso pode gerar duas gravações idênticas em
   paralelo (mesmo telefone, mesma semana).
   → **No Supabase**: resolver com constraint única no banco
   (`UNIQUE(telefone_normalizado, semana)`), não com lock aplicativo.
2. **Telefone salvo sem normalização** — cada gravação salva o texto cru
   digitado pelo usuário (com ou sem máscara), então o mesmo número aparece
   de formas diferentes na planilha.
   → **No Supabase**: normalizar (armazenar só dígitos, formatar na
   exibição) antes de gravar, ou usar uma coluna gerada/trigger.
3. **`editarDecisao` e `excluirDecisao` chamadas pelo frontend não existem
   no backend** (`Code.gs`) — o app mostra "✅ atualizado/excluído" mas na
   verdade recebe `{erro:'Ação desconhecida'}` e ignora, porque o código do
   frontend não checa `res.erro` nesses dois fluxos. Editar/excluir decisão
   **não funciona hoje**, apesar de parecer que funciona.
4. **`lerRelatorioSemana`, `lerRelatorioAnual`, `lerRelatorioPresenca`,
   `salvarEquipe`, `atualizarEquipe`, `excluirEquipe`** — chamadas pelo
   frontend, sem case correspondente no backend. Relatórios mostram erro
   visível; gestão de equipes está sem persistência real.
5. **`lerEquipes_` (backend) devolve só uma lista de nomes** (col B da aba
   Equipes), mas o frontend espera objetos `{id, nome, hospital, diaSemana,
   liderMatricula}` (ver `app.js` `renderEquipesMgr`/`salvarEquipeForm`).
   Confirmar contra a planilha real quais colunas a aba Equipes realmente
   tem antes de desenhar a tabela `equipes`.
6. **Ambiguidade na coluna F de Cadastro**: `lerUsuarios_` trata `r[5]`
   (col F) como **senha**; `lerCadastro_` trata a mesma coluna como
   **usuario**. Confirmar contra os cabeçalhos reais da planilha antes de
   migrar — pode ser a mesma coisa ou um bug já existente.
7. **`snapshotSemanal` e a checagem de duplicata em `gravar` leem a aba
   Decisões inteira (`getDataRange().getValues()`)** toda vez — cresce
   para sempre e piora a performance com o tempo. Motivador original desta
   migração. No Supabase isso vira uma query indexada (`WHERE
   semana = ?`), sem esse problema por natureza.

### Mapeamento de colunas — Cadastro (planilha) → `membros` (Supabase)

Baseado em `lerCadastro_` (Code.gs). **Confirmar contra os cabeçalhos reais
da planilha antes do import** — os índices abaixo vêm da leitura do código,
não da planilha em si.

| Col | Índice | Campo atual (JS) | Sugestão de coluna Postgres |
|---|---|---|---|
| A | 0 | id | `id` (manter como texto ou gerar novo uuid) |
| B | 1 | foto | `foto_url` |
| C | 2 | pin (matrícula/login) | `matricula` (unique, chave de login) |
| D | 3 | nomeComp | `nome_completo` |
| E | 4 | nomeSoc | `nome_social` |
| F | 5 | usuario **ou** senha (ambíguo — ver item 6 acima) | a confirmar |
| G | 6 | sexo | `sexo` |
| H | 7 | tel | `telefone` |
| I | 8 | rg | `rg` |
| J | 9 | email | `email` |
| K | 10 | declaMinist | `declaracao_ministerio` |
| L | 11 | liderGA | `lider_ga` |
| M | 12 | umComDeus | `um_com_deus` |
| N | 13 | batizado | `batizado` |
| O | 14 | grupo | `grupo` |
| P | 15 | culto | `culto` |
| Q | 16 | senib | `senib` |
| R | 17 | aniversario (Date) | `data_aniversario` |
| S | 18 | equipes (string, separada por vírgula) | tabela de junção `membro_equipe` |
| T | 19 | fazInteg (S/N) | `faz_integracao` (bool) |
| U | 20 | sit (Ativo/Inativo) | `ativo` (bool) |
| V | 21 | obs | `observacoes` |
| W | 22 | perfil | `perfil` |

### Mapeamento — Equipes (planilha) → `equipes` (Supabase)

O backend atual só expõe o nome (col B). O frontend de gestão de equipes
espera: `nome`, `hospital`, `diaSemana`, `liderMatricula`, `id`. Desenhar a
tabela `equipes` com essas colunas e **confirmar na planilha real** se elas
já existem lá (podem estar presentes na aba mas nunca lidas pelo
`lerEquipes_` atual, que é bem mais simples que o que o frontend espera).

### Inventário de ações (`acao=`) do sistema atual — o que portar

**Funcionando hoje (portar mantendo o comportamento):**
`lerUsuarios`, `lerCadastro`, `lerEquipes` (redesenhar, ver acima),
`lerDecisoesSemana`, `gravar` (Decisões — corrigir race + normalização),
`atualizar` (genérico), `lerIntegracao`, `gravarIntegracao`, `mudarSenha`,
`resetSenha`, `validarMatricula`, `lerAniv`, `atualizarRelPresenca`,
`gravarPresenca`, `verificarPresenca`, `lerResumos`, `gravarResumo`,
`uploadFotoVisita`, `uploadFoto`, `lerFotoUsuario`.

**Quebradas hoje — implementar do zero e corretamente no novo sistema:**
`editarDecisao`, `excluirDecisao`, `lerRelatorioSemana`, `lerRelatorioAnual`,
`lerRelatorioPresenca`, `salvarEquipe`, `atualizarEquipe`, `excluirEquipe`.

## Arquitetura sugerida para a nova versão

- **Frontend**: mesmo `app.js`/`index.html` como base, trocando as chamadas
  `callScript({acao:...})` pelo cliente `@supabase/supabase-js`
  (`supabase.from('decisoes').select()...`) ou por Edge Functions quando a
  lógica for sensível (ex: verificar senha) e não puder ficar exposta via
  RLS direto no cliente.
- **Backend**: Postgres (Supabase) com Row Level Security; lógica de
  negócio que hoje está em `Code.gs` (cálculo de semana, snapshot semanal,
  distribuição round-robin de integradores) vira **Postgres functions** ou
  **Edge Functions** agendadas (Supabase tem cron via `pg_cron` ou
  Scheduled Edge Functions) — equivalente ao trigger de domingo 23h55 atual.
- **Hospedagem do frontend**: pode continuar no GitHub Pages, só apontando
  para o Supabase em vez do Apps Script.

## Próximos passos

1. Confirmar as ambiguidades marcadas acima direto na planilha real
   (coluna F de Cadastro; colunas reais da aba Equipes).
2. Criar projeto no Supabase e desenhar o schema definitivo (`membros`,
   `equipes`, `membro_equipe`, `decisoes`, `integracoes`,
   `resultado_integracao`, `presenca`, `resumo_visitas`).
3. Escrever script de import do Cadastro/Equipes atuais para o Supabase
   (seed único, manual).
4. Portar tela a tela do `app.js`, começando pelas ações "funcionando hoje"
   antes de implementar as quebradas do zero.
