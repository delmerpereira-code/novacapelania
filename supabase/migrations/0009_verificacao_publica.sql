-- Página pública de verificação de crachá (QR code): quem escaneia não
-- está logado no app, então precisa de acesso de leitura sem
-- autenticação (role `anon`), só aos campos não sensíveis. View própria
-- em vez de abrir a tabela `membros` inteira pro anon -- nunca expõe
-- telefone/rg/email/senha_hash/etc, só o necessário pra confirmar "essa
-- pessoa é membro ativo".
create view v_verificacao_membro as
select
  id,
  coalesce(nome_social, nome_completo) as nome,
  foto_url,
  ativo,
  perfil
from membros;

grant select on v_verificacao_membro to anon, authenticated;
