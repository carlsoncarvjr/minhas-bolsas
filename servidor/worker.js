// Servidor do portal de bolsas (Cloudflare Worker, plano grátis). Separado do B13.
//
//   POST /interpretar  recebe a foto de uma página do caderno ou a frase falada ("vendi a caramelo pra Ana por 150")
//                      e devolve uma lista de lançamentos para conferir na tela. Nada é gravado aqui:
//                      quem grava é o próprio portal, depois do "Lançar". Cada chamada soma o gasto do dia.
//   GET  /gasto        quanto a IA gastou por dia (para a página gasto.html). Só com o código do gasto.
//
// Variáveis (wrangler.toml e `wrangler secret put`). Passo a passo em servidor/LEIA-ME.md.
//   ANTHROPIC_API_KEY  chave da API da Anthropic (secreto)
//   CODIGO             o mesmo código do link do portal (secreto)
//   GASTO_CODIGO       código do link da página de gasto (secreto)
//   LIMITE_MES_USD     teto de gasto por mês em dólar; passou, a IA para até o mês virar (padrão 10)
//   SITE_URL           endereço do portal, ex.: https://carlsoncarvjr.github.io (sem barra no fim)
//   MODELO             opcional; padrão claude-opus-5-5
//   USO                (KV) onde fica o gasto de cada dia

const MODELO_PADRAO = 'claude-opus-5-5';
const API = 'https://api.anthropic.com/v1/messages';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (req.method === 'GET' && url.pathname === '/') return json({ ok: true, servico: 'Minhas Bolsas' }, 200, cors);
    try {
      if (req.method === 'GET' && url.pathname === '/gasto') {
        if (!env.GASTO_CODIGO || !igual(req.headers.get('X-Codigo'), env.GASTO_CODIGO)) throw falha('Link do gasto inválido.', 403);
        return json(await relatorio(env), 200, cors);
      }
      if (req.method !== 'POST' || url.pathname !== '/interpretar') return json({ erro: 'Caminho não encontrado' }, 404, cors);
      if (!env.CODIGO || !igual(req.headers.get('X-Codigo'), env.CODIGO)) throw falha('Link inválido. Abra o portal pelo link que você recebeu.', 403);
      const b = await req.json().catch(() => null);
      if (!b) throw falha('Pedido inválido');
      return json(await interpretar(env, b), 200, cors);
    } catch (e) {
      if (!e.publico) console.error(e);
      return json({ erro: e.publico ? e.message : 'Não consegui entender agora. Tente de novo em instantes.' }, e.status || 500, cors);
    }
  }
};

/* ---------------- IA ---------------- */
const NULO = (t) => ({ anyOf: [{ type: t }, { type: 'null' }] });
const ESQUEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['itens', 'observacao'],
  properties: {
    observacao: NULO('string'),
    itens: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['tipo', 'bolsaId', 'bolsaNome', 'qtd', 'valor', 'precoVenda', 'clienteId', 'clienteNome', 'pago', 'data', 'texto', 'duvida'],
        properties: {
          tipo: { type: 'string', enum: ['venda', 'entrada', 'saida', 'pagamento'] },
          bolsaId: NULO('string'),
          bolsaNome: NULO('string'),
          qtd: { type: 'integer' },
          valor: NULO('number'),
          precoVenda: NULO('number'),
          clienteId: NULO('string'),
          clienteNome: NULO('string'),
          pago: { type: 'boolean' },
          data: NULO('string'),
          texto: { type: 'string' },
          duvida: NULO('string')
        }
      }
    }
  }
};

const INSTRUCOES = `Você ajuda uma revendedora de bolsas no Brasil, que não tem costume com tecnologia, a lançar o que ela vendeu e comprou.
Você recebe a frase que ela falou ou a foto de uma página do caderno dela, escrita à mão, e devolve a lista de lançamentos.

Tipos:
- "venda": ela vendeu. "valor" = preço de UMA bolsa (se ela disse o total de várias, divida pela quantidade).
- "entrada": ela comprou bolsas para revender. "valor" = quanto pagou em UMA. "precoVenda" = por quanto pretende vender, se aparecer.
- "saida": a bolsa saiu sem venda (deu de presente, estragou, devolveu, ficou para ela). "valor" = null.
- "pagamento": uma cliente pagou o que devia. "valor" = quanto pagou (null se pagou tudo). "bolsaId" e "bolsaNome" = null, "qtd" = 1.

Bolsas e clientes:
- Use "bolsaId" de uma bolsa da lista SÓ quando tiver certeza de que é ela (pela cor, material, modelo ou apelido). Sempre preencha "bolsaNome" com um nome curto, como ela chamaria.
- Se não achar a bolsa na lista, "bolsaId" = null e "bolsaNome" = nome curto e descritivo (ex.: "Tote caramelo").
- Mesma regra para "clienteId" e "clienteNome". Sem nome de cliente, os dois null.

Pagamento da venda:
- "pago" = false quando ela disser fiado, vai pagar, deve, depois, a receber, pendente, parcelado sem dizer que recebeu. Senão true.

Datas e números:
- "data" no formato AAAA-MM-DD. Datas escritas como 12/11 ou 12/11/25 são dia/mês/ano. Sem data, null.
- Valores em reais como número: "150" = 150, "89,90" = 89.9, "1.200" = 1200, "1,5 mil" = 1500.
- "qtd" é a quantidade (1 se não disser).

Caderno:
- Leia linha por linha. Cada linha que for uma compra, venda, saída ou pagamento vira um item. Ignore rabiscos, somas e totais.
- "texto" = a linha original como está escrita (ou a frase falada), para ela conferir.
- Se uma linha tiver só nome e dois valores (ex.: "bolsa preta 60 / 120"), é uma compra: o menor é o custo e o maior o preço de venda; explique em "duvida".
- Quando não tiver certeza de algo (letra difícil, valor que pode ser outro, bolsa que pode ser outra), preencha "duvida" com uma frase curta e simples. Senão null.
- Nunca invente lançamento que não está escrito ou falado.

"observacao": frase curta se algo da página não pôde ser lido, senão null.`;

async function interpretar(env, b) {
  if (!env.ANTHROPIC_API_KEY) throw falha('O servidor ainda não tem a chave da IA.', 503);
  const tipo = b.tipo === 'caderno' ? 'caderno' : 'voz';
  const limite = Number(env.LIMITE_MES_USD) || 10;
  if ((await gastoDoMes(env)) >= limite)
    throw falha('O limite de uso da IA deste mês acabou. Lance pelos botões Vendi e Comprei, ou fale com o Carlson.', 429);
  const conteudo = [];
  if (tipo === 'caderno') {
    const m = String(b.imagem || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!m) throw falha('Mande a foto da página do caderno.');
    if (m[2].length > 6_000_000) throw falha('Foto grande demais.', 413);
    conteudo.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  } else {
    const t = String(b.texto || '').trim();
    if (t.length < 3) throw falha('Não ouvi nada. Tente falar de novo.');
    if (t.length > 2000) throw falha('Fala muito longa. Diga uma coisa de cada vez.');
  }
  const bolsas = (Array.isArray(b.bolsas) ? b.bolsas : []).slice(0, 400)
    .map((x) => `- id=${limpa(x.id, 40)} | ${limpa(x.nome, 80)} | paguei ${num(x.custo)} | vendo ${num(x.preco)} | em casa ${num(x.qtd)}`).join('\n') || '(nenhuma)';
  const clientes = (Array.isArray(b.clientes) ? b.clientes : []).slice(0, 400)
    .map((x) => `- id=${limpa(x.id, 40)} | ${limpa(x.nome, 60)}`).join('\n') || '(nenhuma)';
  const hoje = /^\d{4}-\d{2}-\d{2}$/.test(b.hoje || '') ? b.hoje : new Date().toISOString().slice(0, 10);
  conteudo.push({
    type: 'text',
    text: `Hoje é ${hoje}.\n\nBOLSAS CADASTRADAS:\n${bolsas}\n\nCLIENTES CADASTRADAS:\n${clientes}\n\n` +
      (tipo === 'caderno' ? 'Leia a página do caderno da foto acima.' : `Ela falou: "${String(b.texto).trim()}"`)
  });

  let r;
  try {
    r = await fetch(API, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2026-10-21',
        'anthropic-beta': 'server-side-fallback-2026-07-01'
      },
      body: JSON.stringify({
        model: env.MODELO || MODELO_PADRAO,
        max_tokens: 16000,
        fallbacks: 'default',
        system: INSTRUCOES,
        output_config: { effort: tipo === 'caderno' ? 'medium' : 'low', format: { type: 'json_schema', schema: ESQUEMA } },
        messages: [{ role: 'user', content: conteudo }]
      })
    });
  } catch (e) {
    throw falha('Sem conexão com a IA agora. Tente de novo.', 502);
  }
  if (!r.ok) {
    console.error('anthropic', r.status, await r.text().catch(() => ''));
    throw falha(r.status === 429 || r.status === 529 ? 'A IA está ocupada. Tente de novo em um minuto.' : 'Não consegui entender agora. Tente de novo.', 502);
  }
  const d = await r.json();
  await registrar(env, tipo, d).catch((e) => console.error('uso', e));
  if (d.stop_reason === 'refusal') throw falha('Não consegui ler isso. Tente de novo ou lance na mão.', 422);
  if (d.stop_reason === 'max_tokens') throw falha('Página com coisa demais. Fotografe metade de cada vez.', 422);
  const txt = (d.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  let out;
  try { out = JSON.parse(txt); } catch { throw falha('Não consegui entender a resposta. Tente de novo.', 422); }
  const itens = (out.itens || []).slice(0, 80).map(limpaItem);
  return { itens, observacao: out.observacao || null };
}

function limpaItem(i) {
  const n = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null);
  return {
    tipo: ['venda', 'entrada', 'saida', 'pagamento'].includes(i.tipo) ? i.tipo : 'venda',
    bolsaId: i.bolsaId ? limpa(i.bolsaId, 40) : null,
    bolsaNome: i.bolsaNome ? limpa(i.bolsaNome, 80) : null,
    qtd: Math.min(999, Math.max(1, Math.round(Number(i.qtd) || 1))),
    valor: n(i.valor),
    precoVenda: n(i.precoVenda),
    clienteId: i.clienteId ? limpa(i.clienteId, 40) : null,
    clienteNome: i.clienteNome ? limpa(i.clienteNome, 60) : null,
    pago: i.pago !== false,
    data: /^\d{4}-\d{2}-\d{2}$/.test(i.data || '') ? i.data : null,
    texto: limpa(i.texto, 200),
    duvida: i.duvida ? limpa(i.duvida, 200) : null
  };
}

/* ---------------- gasto ---------------- */
// Preço por milhão de tokens (entrada, saída), em dólar. Modelo fora da tabela usa o do Opus 5.5.
const PRECOS = {
  'claude-opus-5-5': [4, 20], 'claude-sonnet-5-5': [2, 10], 'claude-haiku-5-5': [0.1, 0.5],
  'claude-opus-5': [5, 25], 'claude-opus-4-8': [5, 25], 'claude-sonnet-5': [2, 10]
};
const diaBR = () => new Date(Date.now() - 3 * 3600e3).toISOString().slice(0, 10); // horário de Brasília

function custo(d) {
  const u = d.usage || {};
  const [pe, ps] = PRECOS[d.model] || PRECOS['claude-opus-5-5'];
  const entrada = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) * 1.25 + (u.cache_read_input_tokens || 0) * 0.1;
  return (entrada * pe + (u.output_tokens || 0) * ps) / 1e6;
}

async function registrar(env, tipo, d) {
  if (!env.USO) return;
  const k = 'dia:' + diaBR();
  const x = JSON.parse((await env.USO.get(k)) || '{}');
  x.voz = (x.voz || 0) + (tipo === 'voz' ? 1 : 0);
  x.caderno = (x.caderno || 0) + (tipo === 'caderno' ? 1 : 0);
  x.entrada = (x.entrada || 0) + (d.usage?.input_tokens || 0);
  x.saida = (x.saida || 0) + (d.usage?.output_tokens || 0);
  x.usd = Math.round(((x.usd || 0) + custo(d)) * 1e6) / 1e6;
  await env.USO.put(k, JSON.stringify(x), { expirationTtl: 400 * 86400 });
}

async function gastoDoMes(env) {
  if (!env.USO) return 0;
  const mes = diaBR().slice(0, 7);
  const lista = await env.USO.list({ prefix: 'dia:' + mes });
  let t = 0;
  for (const k of lista.keys) t += JSON.parse((await env.USO.get(k.name)) || '{}').usd || 0;
  return t;
}

async function relatorio(env) {
  const dias = {};
  if (env.USO) {
    let cursor;
    do {
      const l = await env.USO.list({ prefix: 'dia:', cursor });
      for (const k of l.keys) dias[k.name.slice(4)] = JSON.parse((await env.USO.get(k.name)) || '{}');
      cursor = l.list_complete ? null : l.cursor;
    } while (cursor);
  }
  return { dias, limiteMesUsd: Number(env.LIMITE_MES_USD) || 10, modelo: env.MODELO || MODELO_PADRAO, hoje: diaBR() };
}

// Compara sem vazar pelo tempo de resposta.
function igual(a, b) {
  a = String(a || ''); b = String(b || '');
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

/* ---------------- utilidades ---------------- */
function falha(msg, status = 400) {
  const e = new Error(msg);
  e.publico = true;
  e.status = status;
  return e;
}
const limpa = (s, max) => String(s ?? '').replace(/[\r\n|]+/g, ' ').trim().slice(0, max);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

function corsHeaders(req, env) {
  const origem = req.headers.get('Origin') || '';
  const site = String(env.SITE_URL || '').replace(/\/+$/, '');
  const ok = origem && (origem === site || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origem));
  return {
    'Access-Control-Allow-Origin': ok ? origem : site || 'null',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Codigo',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
}

function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...headers } });
}
