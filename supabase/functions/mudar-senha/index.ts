// Edge Function de troca de senha: exige o token de login válido (Bearer),
// confere a senha atual contra `senha_hash` (bcrypt) e grava o novo hash.
// senha_hash nunca é exposta a nenhum client (RLS revoga a coluna, ver
// 0002_rls.sql), então essa troca só pode acontecer aqui, com service_role.
import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { verificarJwt, extrairBearer } from '../_shared/jwt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('JWT_SECRET')!;
const SENHA_MIN_LEN = 4;

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

  const token = extrairBearer(req);
  if (!token) {
    return jsonResponse(401, { erro: 'token_ausente' });
  }
  const payload = await verificarJwt(token, JWT_SECRET);
  const membroId = payload?.membro_id as string | undefined;
  if (!membroId) {
    return jsonResponse(401, { erro: 'token_invalido' });
  }

  let body: { senhaAtual?: string; novaSenha?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { erro: 'json_invalido' });
  }

  const senhaAtual = body.senhaAtual ?? '';
  const novaSenha = body.novaSenha ?? '';
  if (!senhaAtual || !novaSenha) {
    return jsonResponse(400, { erro: 'senha_atual_e_nova_obrigatorias' });
  }
  if (novaSenha.length < SENHA_MIN_LEN) {
    return jsonResponse(400, { erro: 'nova_senha_muito_curta' });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: membro, error } = await supabase
    .from('membros')
    .select('id, senha_hash')
    .eq('id', membroId)
    .maybeSingle();
  if (error || !membro) {
    return jsonResponse(404, { erro: 'membro_nao_encontrado' });
  }

  const senhaOk = await bcrypt.compare(senhaAtual, membro.senha_hash);
  if (!senhaOk) {
    return jsonResponse(401, { erro: 'senha_atual_incorreta' });
  }

  const novoHash = await bcrypt.hash(novaSenha, 10);
  const { error: errUpdate } = await supabase
    .from('membros')
    .update({ senha_hash: novoHash, updated_at: new Date().toISOString() })
    .eq('id', membroId);
  if (errUpdate) {
    return jsonResponse(500, { erro: 'erro_ao_salvar' });
  }

  return jsonResponse(200, { ok: true });
});
