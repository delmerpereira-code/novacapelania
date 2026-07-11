// Edge Function de login: valida matrícula/senha contra `membros.senha_hash`
// (bcrypt) e emite um JWT HS256 assinado com o JWT secret do projeto, para
// que o cliente use como Bearer token nas chamadas ao Supabase e as
// policies de RLS leiam via auth.jwt() ->> 'membro_id'. Login não usa
// Supabase Auth nativo (decisão do README), então este é o único ponto do
// sistema que sabe validar senha.
import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { assinarJwt } from '../_shared/jwt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('JWT_SECRET')!;
const TOKEN_TTL_SECONDS = 8 * 60 * 60; // 8h, sessão de um plantão/culto

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse(405, { erro: 'method_not_allowed' });
  }

  let body: { matricula?: string; senha?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { erro: 'json_invalido' });
  }

  const matricula = (body.matricula ?? '').trim();
  const senha = body.senha ?? '';
  if (!matricula || !senha) {
    return jsonResponse(400, { erro: 'matricula_e_senha_obrigatorias' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: membro, error } = await supabase
    .from('membros')
    .select('id, matricula, senha_hash, nome_completo, nome_social, foto_url, perfil, ativo')
    .eq('matricula', matricula)
    .maybeSingle();

  // Mesma mensagem genérica para matrícula inexistente e senha errada --
  // não dar pista de qual matrícula existe (evita enumeração de usuários).
  const credenciaisInvalidas = () => jsonResponse(401, { erro: 'credenciais_invalidas' });

  if (error || !membro) {
    return credenciaisInvalidas();
  }

  const senhaOk = await bcrypt.compare(senha, membro.senha_hash);
  if (!senhaOk) {
    return credenciaisInvalidas();
  }

  if (!membro.ativo) {
    return jsonResponse(403, { erro: 'membro_inativo' });
  }

  const agora = Math.floor(Date.now() / 1000);
  const token = await assinarJwt({
    sub: membro.id,
    role: 'authenticated',
    aud: 'authenticated',
    iss: `${SUPABASE_URL}/auth/v1`,
    membro_id: membro.id,
    matricula: membro.matricula,
    perfil: membro.perfil,
    iat: agora,
    exp: agora + TOKEN_TTL_SECONDS,
  }, JWT_SECRET);

  return jsonResponse(200, {
    access_token: token,
    expira_em: TOKEN_TTL_SECONDS,
    membro: {
      id: membro.id,
      matricula: membro.matricula,
      nome_completo: membro.nome_completo,
      nome_social: membro.nome_social,
      foto_url: membro.foto_url,
      perfil: membro.perfil,
    },
  });
});
