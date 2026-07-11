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

## Schema definitivo (v1)

Schema desenhado em [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql),
com base no mapeamento de colunas real extraído do `Code.gs` antigo (não só
do `app.js`). Pontos relevantes descobertos nessa leitura:

- **Semana**: o sistema antigo calculava/recebia "semana" de 3 formas
  diferentes e inconsistentes (client manda pronta, ora string ora número).
  No novo schema, `semana` nunca é aceita como entrada — é sempre uma
  coluna gerada a partir da data (`semana_legado(data)`, réplica de
  `getSemanaNum_`/`WEEKNUM(data,2)` do Sheets).
- **Colunas O/P de Decisões** (status de integração, nome da equipe) eram
  fórmulas `ARRAYFORMULA`/`PROCX` derivadas, não dados gravados — viraram a
  view `v_decisoes_status`, não uma coluna persistida.
- **Abas `Aniv` e `Rel_Presença`** duplicavam dados já existentes em
  `Cadastro`/`Presença` (fonte de bugs de dessincronização) — viraram views
  (`v_aniversarios`) em vez de tabelas próprias.
- **Presença tinha 2 regras de duplicata diferentes** (`gravarPresenca_`
  deduplicava por matrícula+semana; `verificarPresenca_` checava por
  matrícula+data). Fixamos uma regra única no banco: `UNIQUE(membro_id,
  semana)`.
- **Aba `Historico_Integracao`**: só era lida no sistema antigo, nunca
  escrita por `Code.gs` — não recebeu tabela própria; vira query/view
  quando a tela de relatório for implementada.
- **Aba `Anual`**: não encontrada em nenhuma referência do `Code.gs` —
  confirmar se ainda é necessária antes de desenhar (pode ter sido
  descontinuada ou estar em outro arquivo do projeto Apps Script).
- **Coluna F de Cadastro**: o layout usado de forma consistente no
  `Code.gs` (comentários + uso real em `snapshotSemanal`, `lerUsuarios_`
  etc.) é `F=Senha`. Mantido como `senha_hash` (bcrypt) no novo schema, mas
  **ainda vale confirmar na planilha real** — a ambiguidade original vinha
  de uma função específica (`lerCadastro_`) tratando esse índice como
  usuário.
- **Aba Equipes**: confirmado que o backend antigo (`lerEquipes_`) só
  expõe o nome (coluna B) — `hospital`, `dia_semana`, `lider_matricula`
  são esperados pelo frontend mas **nunca foram implementados de fato**.
  Essas colunas nascem `NULL` na tabela `equipes` até confirmação/uso da
  tela de gestão de equipes (a ser implementada do zero).
- **Auth/RLS**: como o login não usa Supabase Auth nativo, a decisão foi
  ter uma Edge Function que valida matrícula/senha (bcrypt) e emite um JWT
  compatível com o projeto Supabase, com claims custom (`membro_id`,
  `perfil`). As policies de RLS leem esse claim via `auth.jwt()` — RLS real
  por linha, não apenas checagem em código.

## Status atual (infraestrutura pronta)

- ✅ Projeto Supabase criado; `0001_init.sql` e `0002_rls.sql` aplicados.
- ✅ Import rodado contra os CSVs reais: **165 membros**, **33 equipes**,
  **249 vínculos** membro-equipe (`npm run import:all`, scripts em
  `scripts/import-*.mjs` e `scripts/link-membro-equipe.mjs`). 4 nomes de
  equipe em Cadastro ficaram sem vínculo por inconsistência real da
  planilha antiga (time renomeado/horário mudou/descontinuado) — não
  resolvidos automaticamente de propósito, ver histórico de conversa ou
  rodar `scripts/link-membro-equipe.mjs` de novo para ver os avisos.
- ✅ Edge Function de login (`supabase/functions/login`) implementada e em
  produção: recebe `{matricula, senha}`, valida contra `senha_hash`
  (bcrypt) e devolve um JWT HS256 assinado com o Legacy JWT Secret do
  projeto, com claims `membro_id`/`matricula`/`perfil`. Deploy via
  `node scripts/deploy-function.mjs login` (usa `SUPABASE_ACCESS_TOKEN` +
  `SUPABASE_PROJECT_REF` + `JWT_SECRET` do `.env`).
- ✅ RLS testado ponta a ponta (`node scripts/test-login.mjs <matricula>
  <senha>`): login funciona, cada membro lê a própria linha, `senha_hash`
  é bloqueada mesmo pro dono da linha (revoke de coluna), leitura de
  `equipes` liberada pra qualquer autenticado.
- Regra de RLS adotada: liderança (`perfil` = 'Líder'/'Capelão') vê e edita
  tudo em decisões/integração/presença/resumos; membro comum só vê/edita o
  que é seu. Ver comentário no topo de `0002_rls.sql` pra ajustar por tela.
- ✅ **Frontend em `frontend/`**: cópia do `app.js`/`index.html` antigo com a
  camada de dados trocada. Portado e testado num navegador de verdade
  (Playwright headless, `npm run test:browser`): **login** (Edge Function +
  seleção de equipe quando o membro tem mais de uma), **Cadastro**
  (listagem dos 139 membros ativos + busca + detalhe individual) e
  **Equipes** (listagem das 33 equipes). `frontend/supabase-client.js`
  concentra a ponte com o Supabase e adapta os nomes de campo do schema
  novo pro formato que o `app.js` antigo espera (`nomeComp`, `sit`, `pin`
  etc.), pra não precisar reescrever as telas de exibição.
  `npm run dev` sobe um servidor estático local em `:8123` pra testar.
- ✅ **Decisões portado e testado** (`npm run test:browser` +
  `node scripts/browser-test-decisoes.mjs`, fluxo completo: criar → listar
  → editar → excluir). Diferenças importantes em relação ao sistema antigo:
  - `editarDecisao`/`excluirDecisao` **funcionam de verdade agora** — no
    sistema antigo o front chamava essas ações mas o backend nunca as
    implementou (bug #3 do README); aqui viram `UPDATE`/`DELETE` reais na
    tabela `decisoes`, protegidos por RLS (só o próprio capelão ou
    liderança podem editar/excluir).
  - A checagem de duplicata (mesmo telefone + semana) agora tem defesa real
    no banco (`decisoes_telefone_semana_uniq`), não só no cliente — o
    `supaGravarDecisao`/`supaEditarDecisao` detectam o erro `23505` do
    Postgres e mostram a mesma mensagem amigável de antes.
  - `semana` nunca é calculada/enviada pelo cliente — é sempre derivada de
    `data_visita` pela coluna gerada no banco (`semana_legado`), eliminando
    a inconsistência de tipos do sistema antigo (bug documentado na seção
    "Schema definitivo").
  - O app.js legado tinha `loadDecSemana`/`openFormDec` **duplicados**
    (declarações repetidas, a segunda sobrescrevia a primeira em runtime) —
    removido o código morto durante o port.
  - Corrigido também um bug de escaping de aspas num `onerror` inline
    (`updateBannerFoto`) que gerava `SyntaxError` quando a foto do avatar
    falhava ao carregar — não é específico de Decisões, apareceu durante os
    testes de login.
- ✅ **Integração portado e testado** (`node scripts/browser-test-integracao.mjs`,
  fluxo completo: criar decisão com integração → distribuir → aparece na
  fila → registrar integração). Pontos relevantes:
  - **`decisoes` SELECT foi reaberto pra qualquer autenticado**
    (`0003_integracao.sql`) — o `0002_rls.sql` original restringia a
    leitura ao próprio capelão + liderança, mas o `lerDecisoesSemana_` do
    sistema antigo sempre devolveu as decisões de **todos** os capelães
    pra qualquer usuário logado (é uma tela de equipe, não pessoal). A
    tela de Integração depende disso pra funcionar (join com a decisão
    original de outro capelão). UPDATE/DELETE continuam restritos.
  - **`integracoes`/`resultado_integracao` abertos pra qualquer
    autenticado** marcar como integrado — confirmado com o usuário que é
    o comportamento real do sistema antigo (time colaborativo, qualquer
    um pode cobrir a integração de um colega).
  - **Round-robin de distribuição portado como function SQL**
    (`distribuir_integracoes()`), substituindo o `snapshotSemanal` do
    sistema antigo (que rodava via trigger de domingo 23h55, nunca
    portado). Mesma regra: separa integradores ativos por sexo, pareia
    com o sexo do assistido, fallback pro outro sexo se a lista preferida
    estiver vazia. Só liderança pode disparar (`SECURITY DEFINER` +
    checagem de perfil dentro da function); por enquanto é manual (botão
    🔀 no header da tela, só visível pra Líder) — agendar via `pg_cron`
    fica pra depois.
  - `resultado_integracao.capelao_id` agora registra **quem de fato
    clicou** pra confirmar (via RLS/sessão), não mais um campo de texto
    solto que podia ser qualquer nome como no sistema antigo.
  - `scripts/apply-migration.mjs` (`npm run migrate -- <arquivo>`):
    descoberto que dá pra aplicar migrations direto pela Management API
    do Supabase (`SUPABASE_ACCESS_TOKEN`), sem precisar colar no SQL
    Editor manualmente — usado a partir da migration 0003.
- ✅ **Presença (check-in do dia) portado e testado**
  (`node scripts/browser-test-presenca.mjs`: registra, persiste após
  reload, detecta duplicata). É o botão de presença no banner da home
  (`verificarPresencaHoje`/`registrarPresenca`), não a tela de gestão —
  essa fica em `Relatórios` (`atualizarRelPresenca`/`Rel_Presença`), ainda
  não portada. Diferença do sistema antigo: as duas regras de duplicata
  inconsistentes (`gravarPresenca_` checava matrícula+semana,
  `verificarPresenca_` checava matrícula+data) viraram uma regra única
  (membro+semana, já fixada no schema desde `0001_init.sql`) — verificar e
  registrar agora sempre olham pra mesma coisa.
- ✅ **Resumo (Líder) portado e testado**
  (`node scripts/browser-test-resumo.mjs`: criar, listar agrupado por
  dia/equipe, abrir detalhe). Upload de foto continua indo direto pro
  Cloudinary do frontend (sem passar pelo Supabase) — isso já era assim no
  sistema antigo e não precisou mudar. `lancadas`/`saldo` continuam sendo
  um snapshot calculado no momento de salvar (não um valor sempre live),
  igual ao `gravarResumo_` original; salvar duas vezes pra mesma
  data+equipe substitui o registro (`upsert` em `(data_visita,
  equipe_id)`), igual ao comportamento antigo de "achar e sobrescrever".
- ✅ **Relatórios (Líder) portado e testado inteiro** — as 4 sub-abas, uma
  de cada vez, cada uma com seu próprio script de teste
  (`browser-test-rel-semana.mjs`, `-historico.mjs`, `-presenca.mjs`,
  `-anual.mjs`). Todas as 3 ações que nunca tinham sido implementadas no
  sistema antigo (`lerRelatorioSemana`, `lerRelatorioAnual`,
  `lerRelatorioPresenca` — bugs #4 do README) viraram implementações
  novas, direto em cima das tabelas já existentes, sem tabela de
  agregação própria:
  - **Semana**: total de decisões, quebra por sexo, integráveis vs. não
    (com motivos), tudo calculado em JS a partir de um único select em
    `decisoes` (join `integracoes` pro status).
  - **Histórico**: desempenho de cada integrador nas últimas 8 semanas
    (calendário, não "últimas semanas com dado" como a leitura antiga de
    `Historico_Integracao` — mais previsível). Substitui uma tabela que no
    sistema antigo nunca foi escrita por nenhuma ação do app (só leitura,
    fonte externa/manual).
  - **Presença**: grade membro × semana por equipe, calculada ao vivo em
    cima de `presenca`/`membro_equipe`. Elimina o conceito de
    "reconstruir" — no sistema antigo, `atualizarRelPresenca` regravava
    fisicamente a aba `Rel_Presença`; aqui não há mais nada pra
    reconstruir, o botão só recarrega a consulta.
  - **Anual**: comparativo de decisões por mês, ano atual vs. anterior,
    agregado em cima de `decisoes.data_visita`.
- ✅ **Conta (mudar senha / validar matrícula) portado e testado**
  (`node scripts/browser-test-conta.mjs`: senha atual errada rejeitada,
  senha certa aceita e persistida, login com senha antiga passa a falhar,
  login com a nova funciona). Nova Edge Function `supabase/functions/
  mudar-senha`: exige o token de login válido (Bearer), confere a senha
  atual via bcrypt e grava o novo hash — é a única rota que enxerga
  `senha_hash`, igual à `login`. Criado `supabase/functions/_shared/jwt.ts`
  com assinar/verificar JWT compartilhado entre as duas functions (a
  `login` foi refatorada pra usar o mesmo módulo). `resetSenha` foi
  removida — confirmado que era código morto no sistema antigo, nunca
  chamada por nenhum botão. `validarMatricula` não precisou de Edge
  Function (é só um select simples, já liberado por RLS).
- ✅ **Aniversários portado e testado** — mapeia direto pra view
  `v_aniversarios` (já existia desde `0001_init.sql`), sem precisar de
  nenhuma função nova.
- ✅ **Fotos portado e testado** (`node scripts/browser-test-foto.mjs`,
  upload real confirmado no banco). O upload em si (Cloudinary, direto do
  navegador) já funcionava mesmo no sistema antigo e não mudou — o que
  faltava era salvar a URL resultante no membro certo, que chamava
  `atualizar('Cadastro', ...)` (backend antigo, morto). Também corrigido:
  a RLS de `membros` só deixava cada um editar a própria linha
  (`0004_membros_lideranca.sql`) — o botão de câmera é só-Líder e edita a
  foto de **qualquer** membro, então a policy de UPDATE precisou abrir
  pra liderança também, igual foi feito antes pra `decisoes`/`equipes`.
- ✅ **Gestão de Equipes (CRUD) portado e testado**
  (`node scripts/browser-test-equipes-crud.mjs`: criar, editar, detectar
  nome duplicado, excluir). Era a última categoria "quebrada" do sistema
  antigo (`salvarEquipe`/`atualizarEquipe`/`excluirEquipe` nunca tiveram
  case correspondente no backend) — implementada do zero. O campo de
  líder no formulário continua sendo a matrícula digitada em texto livre
  (igual ao antigo), resolvida pra um `lider_id` real no momento de salvar;
  matrícula não encontrada não bloqueia o salvamento, só avisa que ficou
  sem líder vinculado. Excluir uma equipe não apaga os membros, só o
  vínculo (`membro_equipe` tem `on delete cascade` na FK de equipe).

## Status: todas as telas do inventário original portadas

Todo o inventário do README original — as ações "funcionando hoje" e as
"quebradas" — foi portado e testado num navegador de verdade. Não há mais
nenhuma tela chamando o `SCRIPT` (Apps Script) antigo.

## Deploy

Frontend publicado via GitHub Pages a partir de `docs/` (GitHub Pages só
serve a raiz do repo ou uma pasta `/docs`, por isso o frontend não ficou em
`frontend/`). `npm run dev` continua servindo `docs/` localmente pra testes
(`localhost:8123`).

## Modelo de arquivamento de decisões (mudança de arquitetura pedida em
2026-07-11)

Decisão do usuário: não manter decisão por decisão pra sempre — só
enquanto ela ainda está "aberta" (aguardando integração). Isso muda o
ciclo de vida de `decisoes`:

- **Quer integração**: nasce em `decisoes` (com nome/telefone, tudo
  detalhado) e fica lá até alguém confirmar a integração — só nesse
  período ela é editável/excluível e aparece nas telas de Decisões e
  Integração.
- **Não quer integração**: nasce **já arquivada** — nunca chega a virar
  linha em `decisoes` nem aparece como pendência em lugar nenhum. Vai
  direto pra `decisoes_arquivo`.
- **Ao confirmar integração**: a function `arquivar_integracao(p_integracao_id)`
  (SECURITY DEFINER, `0005_arquivamento_decisoes.sql`) grava um contador
  em `decisoes_arquivo` (semana, ano, mês, equipe, sexo, quem integrou —
  **sem** nome/telefone/observações) e apaga a decisão original numa
  operação só (o `delete` em cascata também limpa a linha correspondente
  em `integracoes`).
- **`resultado_integracao`** (log de quem confirmou cada integração) foi
  **removida** — deixou de fazer sentido nesse modelo, já que o próprio
  arquivamento guarda o integrador responsável pra fins de contagem, sem
  precisar de um log individual.
- **`v_decisoes_stats`**: view que junta `decisoes` (ainda pendentes) +
  `decisoes_arquivo` (já fechadas) numa única forma, pra que os
  relatórios (Semana/Histórico/Anual) não precisem saber se o dado ainda
  está detalhado ou já virou só contador. `supaRelatorioSemana`,
  `supaRelatorioHistorico` e `supaRelatorioAnual` foram reescritos pra
  consultar essa view em vez de `decisoes` direto.

**Efeito colateral conhecido e aceito**: a constraint de telefone
duplicado (`decisoes_telefone_semana_uniq`) só protege enquanto a decisão
está detalhada. Depois que uma decisão é arquivada (integrada), um novo
registro com o mesmo telefone na mesma semana não é mais bloqueado como
duplicata, porque não sobra nenhum dado pra comparar. Foi uma troca
consciente — o objetivo original da constraint (evitar duplo lançamento
da mesma visita, tipicamente resolvido antes da integração acontecer)
continua coberto na prática.

Testado com `node scripts/browser-test-arquivamento.mjs`: decisão não
integrável nunca aparece como pendência; decisão integrável some da lista
de pendências e da fila de Integração assim que confirmada; totais dos
relatórios continuam corretos somando pendente + arquivado; confirmado
direto no banco que o registro arquivado não tem nome/telefone/obs.

## Import de decisões históricas (semanas 26-28, dado real de produção)

`scripts/import-decisoes.mjs` — importa `data/decisoes.csv` +
`data/integracao.csv` (export da planilha antiga) já respeitando o modelo
de arquivamento: decisão não integrável ou já integrada na planilha
antiga vai direto pra `decisoes_arquivo`; só decisão que quer integração
e ainda está pendente na planilha antiga vira registro vivo em
`decisoes` (+ `integracoes`). Rodar com
`SEMANAS_ALVO=26,27,28 node scripts/import-decisoes.mjs` (variável de
ambiente opcional, default `26,27,28`).

Resultado do import feito em 2026-07-11: 2.279 linhas processadas → 696
pendentes vivas (fila de Integração real) + 1.569 arquivadas. Testado com
`node scripts/browser-test-dados-reais.mjs` — Decisões, Integração e
Relatórios renderizam corretamente com esse volume, sem erro de console,
query de Integração em ~560ms mesmo com ~700 linhas e vários joins.

**Ponto de atenção conhecido**: ~51% das decisões já integradas na
planilha antiga (582 de 1138) não conseguiram resolver o nome do
integrador (`Integrador` do CSV → `membros.nome_completo`/`nome_social`,
provavelmente diferença de grafia/acentuação) — contam certo nos totais,
mas não aparecem atribuídas a uma pessoa específica no relatório de
Histórico. Não bloqueia o uso, mas vale revisar se o relatório de
Histórico precisar refletir o passado com mais precisão.

**Bug real encontrado e corrigido** (mesmo dia): o import criava uma
linha em `integracoes` pra toda decisão pendente, mesmo quando não
conseguia resolver o integrador original da planilha antiga (mesmo
problema de grafia acima) — gravava com `integrador_id` nulo em vez de
deixar de fora. Como `distribuir_integracoes()` só processa decisões que
**ainda não têm** linha em `integracoes`, essas 609 (de 696) ficavam
invisíveis pro round-robin, presas sem integrador pra sempre. Corrigido
apagando as linhas órfãs e rodando a distribuição de novo — resultado:
693 de 696 pendentes com integrador atribuído (as 3 restantes têm
telefone inválido, mesmo critério do sistema antigo), espalhadas entre
137 integradores (4 a 10 cada), em vez de concentradas em só 21 pessoas.

## Próximos passos (não bloqueiam uso, mas valem revisão)

1. Resolver os 4 vínculos membro-equipe pendentes da importação original
   (nomes de equipe que mudaram de horário/dia na planilha desde o
   import) — a critério de quem gerencia as equipes hoje, agora que a
   tela de gestão já funciona.
2. ~~Agendar `distribuir_integracoes()` via `pg_cron`~~ — feito
   (`0006_agendamento_distribuicao.sql`): roda toda segunda 03:50 UTC
   (domingo 23:50 em America/Manaus, UTC-4 sem horário de verão —
   **ajustar o cron expression se a operação não for mais em Manaus/AM**).
   O botão manual 🔀 continua funcionando pra liderança disparar antes da
   hora se precisar. A checagem de liderança dentro da function só se
   aplica quando a chamada vem com um JWT (via API) que não é de
   liderança — chamada sem JWT nenhum (só possível internamente, cron ou
   SQL direto) é permitida, já que só quem tem acesso ao banco consegue
   chamar assim. Testado: liderança consegue disparar manualmente, membro
   comum continua bloqueado, cron registrado e ativo (`select * from
   cron.job`).
3. Decidir se o app vai continuar como está (matrícula/senha + JWT
   próprio) ou se compensa migrar pra Supabase Auth nativo no futuro —
   não é urgente, mas é uma dívida arquitetural conhecida.
4. Revisar a lista de erros de console conhecidos e não-bloqueantes: (a)
   fotos hospedadas no Google Drive não resolvem em ambientes sem acesso
   a `lh3.google.com` (irrelevante em produção real); (b) uma condição de
   corrida cosmética quando uma imagem falha ao carregar bem no momento
   em que a tela já mudou (handler `onerror` tenta atualizar um elemento
   que não existe mais) — não trava nada, só polui o console.
5. Deploy do frontend (hoje só roda local via `npm run dev`) — GitHub
   Pages é a opção mais simples, como já era antes.
