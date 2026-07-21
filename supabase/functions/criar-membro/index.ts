// Edge Function de criação de membro: só existe porque `senha_hash` nunca
// é exposta a nenhum client (RLS revoga a coluna, ver 0002_rls.sql) -- não
// dá pra fazer isso com um insert direto do front, igual acontece em
// mudar-senha/login. Senha padrão do novo cadastro = a própria matrícula
// (igual ao sistema antigo).
import { createClient } from 'npm:@supabase/supabase-js@2';
import bcrypt from 'npm:bcryptjs@2.4.3';
import { verificarJwt, extrairBearer } from '../_shared/jwt.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('JWT_SECRET')!;

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

const COLUNAS_MEMBRO_PUBLICAS =
  'id, legado_id, matricula, foto_url, nome_completo, nome_social, sexo, telefone, rg, ' +
  'email, declaracao_ministerio, lider_ga, um_com_deus, batizado, grupo, culto, senib, ' +
  'aniversario_mes, aniversario_dia, faz_integracao, ativo, observacoes, perfil';

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
  if (!payload) {
    return jsonResponse(401, { erro: 'token_invalido' });
  }
  const perfil = payload.perfil as string | undefined;
  if (perfil !== 'Líder' && perfil !== 'Capelão') {
    return jsonResponse(403, { erro: 'sem_permissao' });
  }

  let body: {
    matricula?: string; nomeCompleto?: string; nomeSocial?: string;
    sexo?: string; telefone?: string; email?: string; perfil?: string;
  };
  try {
    body = await req.json();
  } catch {
    return jsonResponse(400, { erro: 'json_invalido' });
  }

  const matricula = (body.matricula ?? '').trim();
  const nomeCompleto = (body.nomeCompleto ?? '').trim();
  const nomeSocial = (body.nomeSocial ?? '').trim();
  if (!matricula || !nomeCompleto || !nomeSocial) {
    return jsonResponse(400, { erro: 'campos_obrigatorios_faltando' });
  }
  const novoPerfil = body.perfil === 'Líder' ? 'Líder' : 'Membro';

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: existente } = await supabase
    .from('membros')
    .select('id')
    .eq('matricula', matricula)
    .maybeSingle();
  if (existente) {
    return jsonResponse(409, { erro: 'matricula_ja_cadastrada' });
  }

  const senhaHash = await bcrypt.hash(matricula, 10);

  const { data: novo, error } = await supabase
    .from('membros')
    .insert({
      matricula,
      senha_hash: senhaHash,
      nome_completo: nomeCompleto,
      nome_social: nomeSocial,
      sexo: body.sexo || null,
      telefone: body.telefone || null,
      email: body.email || null,
      perfil: novoPerfil,
      ativo: true,
    })
    .select(COLUNAS_MEMBRO_PUBLICAS)
    .single();

  if (error || !novo) {
    return jsonResponse(500, { erro: 'erro_ao_criar' });
  }

  return jsonResponse(200, { membro: novo });
});
