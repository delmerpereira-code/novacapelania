# Contexto inicial da migração

Estou começando a reescrita do app de Capelania usando Supabase no lugar de
Google Sheets + Apps Script.

## Resumo

- Sistema antigo (produção, intocado) está em
  `C:\Users\Delmer Pereira\Documents\GitHub\capelania` — não mexer lá, só
  consultar como referência.
- Decisões já tomadas: repo novo (este), manter visual/fluxo do
  `app.js`/`index.html` atual só trocando a camada de dados por Supabase,
  seed inicial só com Cadastro (membros) e Equipes — o resto (Decisões,
  Integração, Presença, Resumo, Anual) nasce vazio. Login continua por
  matrícula/senha (não usar Supabase Auth nativo), mas com senha em hash em
  vez de texto puro.
- A auditoria encontrou bugs reais em produção que NÃO devem ser repetidos:
  condição de corrida ao gravar decisão (resolver com constraint única no
  banco, não com lock), telefone salvo sem normalização, e várias ações que
  o frontend chama mas o backend nunca implementou — `editarDecisao`,
  `excluirDecisao`, `lerRelatorioSemana`, `lerRelatorioAnual`,
  `lerRelatorioPresenca`, `salvarEquipe`, `atualizarEquipe`, `excluirEquipe`
  (hoje falham, algumas silenciosamente). Tudo isso está detalhado no
  README com os arquivos/linhas do sistema antigo.
- Próximo passo: confirmar duas ambiguidades direto na planilha real
  (coluna F de Cadastro — é "usuario" ou "senha"; e quais colunas a aba
  Equipes realmente tem), depois desenhar o schema definitivo no Supabase e
  o script de import do Cadastro/Equipes.

Ver [README.md](README.md) para o detalhamento completo (auditoria,
mapeamento de colunas, inventário de ações, arquitetura sugerida).
