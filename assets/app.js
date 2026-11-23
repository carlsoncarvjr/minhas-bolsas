import { abrir, modo, novoId, codigo } from './dados.js';
import { NOME, SERVIDOR_URL } from './config.js';

let api;
let D; // { bolsas, movimentos, clientes } em memória
const UI = { per: 'mes', filtroBolsas: 'disp', buscaBolsas: '', buscaClientes: '', filtroHist: 'tudo' };

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (v) => {
  let s = String(v ?? '').trim().replace(/\s|R\$/g, '');
  if (!s) return 0;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : NaN;
};
const emCampo = (n) => (n || n === 0 ? String(Math.round(n * 100) / 100).replace('.', ',') : '');
const pad = (n) => String(n).padStart(2, '0');
const isoDe = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const hoje = () => isoDe(Date.now());
const msDe = (iso) => (iso === hoje() ? Date.now() : new Date(iso + 'T12:00:00').getTime());
const dataCurta = (ms) => new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }).replace('.', '');
const dataLonga = (ms) => new Date(ms).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
const inicial = (nome) => esc((nome || '?').trim().charAt(0).toUpperCase());
const soDigitos = (s) => String(s || '').replace(/\D/g, '');
const zap = (w) => { const d = soDigitos(w); return d ? 'https://wa.me/' + (d.length <= 11 ? '55' + d : d) : ''; };
const fundo = (src) => (src ? `style="background-image:url('${src}')"` : '');

const ic = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  casa: ic('<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  bolsa: ic('<path d="M5 8h14l-1 12H6z"/><path d="M9 8a3 3 0 0 1 6 0"/>'),
  mais: ic('<path d="M12 5v14M5 12h14"/>'),
  pessoas: ic('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.4 3.5 5.2"/>'),
  lista: ic('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>'),
  ajustes: ic('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  enviar: ic('<path d="M12 3v12M7 8l5-5 5 5M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5"/>'),
  cifrao: ic('<circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.6-.9-1.7-1.4-3-1.4-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.3-3 2.3-1.4 0-2.6-.6-3.2-1.6M12 6v1.8M12 16.9v1.6"/>'),
  mic: ic('<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>'),
  caderno: ic('<path d="M6 3h11a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6z"/><path d="M6 3v18M4 7h4M4 12h4M4 17h4M11 8h4"/>'),
  camera: ic('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>')
};

let toastT;
function toast(msg, erro = false) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'ver' + (erro ? ' erro' : '');
  clearTimeout(toastT);
  toastT = setTimeout(() => (t.className = ''), erro ? 4500 : 2800);
}

/* ---------------- contas ---------------- */
const bolsas = () => Object.values(D.bolsas).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const movs = () => Object.values(D.movimentos).sort((a, b) => b.data - a.data);
const clientes = () => Object.values(D.clientes).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
const valor = (m) => (m.tipo === 'venda' ? m.preco * m.qtd : m.custo * m.qtd);
const lucroDe = (m) => (m.preco - (m.custo || 0)) * m.qtd;
const fiados = () => movs().filter((m) => m.tipo === 'venda' && !m.pago);

function intervalo(p) {
  const d = new Date();
  const y = d.getFullYear();
  const m = d.getMonth();
  if (p === 'mes') return [new Date(y, m, 1).getTime(), Infinity];
  if (p === 'passado') return [new Date(y, m - 1, 1).getTime(), new Date(y, m, 1).getTime()];
  if (p === 'ano') return [new Date(y, 0, 1).getTime(), Infinity];
  return [0, Infinity];
}
const nomeMesPassado = () => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); const m = d.toLocaleDateString('pt-BR', { month: 'long' }); return m.charAt(0).toUpperCase() + m.slice(1); };

function resumo(per) {
  const [ini, fim] = intervalo(per);
  const r = { vendeu: 0, lucro: 0, pecas: 0, comprou: 0, porBolsa: {} };
  for (const m of Object.values(D.movimentos)) {
    if (m.data < ini || m.data >= fim) continue;
    if (m.tipo === 'venda') {
      r.vendeu += m.preco * m.qtd;
      r.lucro += lucroDe(m);
      r.pecas += m.qtd;
      r.porBolsa[m.bolsaId] = (r.porBolsa[m.bolsaId] || 0) + m.qtd;
    } else if (m.tipo === 'entrada') r.comprou += m.custo * m.qtd;
  }
  r.estoque = 0; r.investido = 0; r.potencial = 0;
  for (const b of Object.values(D.bolsas)) {
    const q = Math.max(0, b.qtd || 0);
    r.estoque += q; r.investido += q * (b.custo || 0); r.potencial += q * (b.preco || 0);
  }
  r.fiado = fiados().reduce((s, m) => s + m.preco * m.qtd, 0);
  return r;
}

function doCliente(id) {
  const lista = movs().filter((m) => m.tipo === 'venda' && m.clienteId === id);
  return {
    lista,
    total: lista.reduce((s, m) => s + m.preco * m.qtd, 0),
    deve: lista.filter((m) => !m.pago).reduce((s, m) => s + m.preco * m.qtd, 0)
  };
}

/* ---------------- telas ---------------- */
const ABAS = [
  ['inicio', 'Início', I.casa],
  ['bolsas', 'Bolsas', I.bolsa],
  ['vender', 'Vendi', I.mais],
  ['clientes', 'Clientes', I.pessoas],
  ['mais', 'Mais', I.lista]
];

function aba() {
  const h = location.hash.slice(1);
  if (h === 'historico') return 'mais';
  return ['inicio', 'bolsas', 'clientes', 'mais'].includes(h) ? h : 'inicio';
}

function render() {
  const a = aba();
  const telas = { inicio: telaInicio, bolsas: telaBolsas, clientes: telaClientes, mais: telaMais };
  const titulo = { inicio: NOME, bolsas: 'Bolsas', clientes: 'Clientes', mais: 'Números e histórico' }[a];
  $('#app').innerHTML = `
    <header class="topo">
      <h1>${esc(titulo)}</h1>
      ${a === 'mais' ? `<button class="fechar" data-acao="ajustes" aria-label="Ajustes">${I.ajustes}</button>` : ''}
    </header>
    <main class="pagina">${modo === 'demo' ? '<div class="aviso-demo">Modo demonstração: os dados são de exemplo e ficam só neste navegador.</div>' : ''}${telas[a]()}</main>
    <nav class="nav">${ABAS.map(([id, nome, icone]) => id === 'vender'
      ? `<a href="#" class="vender" data-acao="vender"><span class="bola">${icone}</span>${nome}</a>`
      : `<a href="#${id}" class="${a === id ? 'ativo' : ''}">${icone}${nome}</a>`).join('')}</nav>`;
}

function chips(lista, atual, chave) {
  return `<div class="chips">${lista.map(([v, t]) => `<button class="chip ${v === atual ? 'ativo' : ''}" data-chip="${chave}" data-v="${v}">${esc(t)}</button>`).join('')}</div>`;
}

function telaInicio() {
  const r = resumo('mes');
  const fi = fiados();
  const ult = movs().filter((m) => m.tipo === 'venda').slice(0, 4);
  // quem deve, somado por cliente
  const dev = {};
  for (const m of fi) {
    const k = m.clienteId || m.clienteNome || '?';
    dev[k] = dev[k] || { nome: m.clienteNome || 'Sem nome', id: m.clienteId, total: 0 };
    dev[k].total += m.preco * m.qtd;
  }
  const devendo = Object.values(dev).sort((a, b) => b.total - a.total);
  let frase = r.pecas
    ? `Este mês você vendeu <b>${brl(r.vendeu)}</b> e lucrou <b class="pos">${brl(r.lucro)}</b>.`
    : 'Este mês ainda não teve venda.';
  frase += ` Você tem <b>${r.estoque} ${r.estoque === 1 ? 'bolsa' : 'bolsas'}</b> em casa.`;
  return `
    <p class="frase">${frase}</p>
    <div class="grandes">
      <button class="grande vendi" data-acao="vender"><span class="ico">${I.cifrao}</span>Vendi</button>
      <button class="grande comprei" data-acao="comprei"><span class="ico">${I.bolsa}</span>Comprei</button>
    </div>
    ${modo === 'demo' || SERVIDOR_URL ? `<div class="atalhos">
      <button class="atalho" data-acao="falar">${I.mic}<span>Falar</span></button>
      <button class="atalho" data-acao="caderno">${I.caderno}<span>Foto do caderno</span></button>
    </div>` : ''}
    ${devendo.length ? `<div class="secao"><h2>Quem te deve</h2></div><div class="lista">${devendo.slice(0, 6).map((d) => `
      <button class="item" ${d.id && D.clientes[d.id] ? `data-cliente="${d.id}"` : ''}><div class="avatar">${inicial(d.nome)}</div>
        <div class="meio"><div class="t1">${esc(d.nome)}</div></div><div class="dir"><span class="tag fiado grande-tag">${brl(d.total)}</span></div></button>`).join('')}</div>` : ''}
    ${ult.length ? `<div class="secao"><h2>Últimas vendas</h2><a href="#mais" data-acao="ver-vendas">Ver todas</a></div><div class="lista">${ult.map(itemMov).join('')}</div>` : ''}`;
}

function telaMais() {
  const r = resumo(UI.per);
  const top = Object.entries(r.porBolsa).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const nomeDe = (id) => D.bolsas[id]?.nome || Object.values(D.movimentos).find((m) => m.bolsaId === id)?.nome || 'Bolsa apagada';
  const f = UI.filtroHist;
  const lista = movs().filter((m) => f === 'tudo' || (f === 'fiado' ? m.tipo === 'venda' && !m.pago : m.tipo === f));
  let hist = '';
  let dia = '';
  let aberto = false;
  for (const m of lista.slice(0, 300)) {
    const d = isoDe(m.data);
    if (d !== dia) {
      if (aberto) hist += '</div>';
      hist += `<div class="dia">${d === hoje() ? 'Hoje' : esc(dataLonga(m.data))}</div><div class="lista">`;
      dia = d; aberto = true;
    }
    hist += itemMov(m);
  }
  if (aberto) hist += '</div>';
  if (!lista.length) hist = '<div class="cartao vazio">Nada por aqui.</div>';
  if (lista.length > 300) hist += '<p class="muted pequeno" style="text-align:center">Mostrando os 300 mais recentes.</p>';
  return `
    ${chips([['mes', 'Este mês'], ['passado', nomeMesPassado()], ['ano', 'Este ano'], ['tudo', 'Desde o começo']], UI.per, 'per')}
    <div class="numeros">
      <div class="numero destaque"><div class="rot">Lucro</div><div class="val">${brl(r.lucro)}</div><div class="det">o que sobrou depois de pagar as bolsas vendidas</div></div>
      <div class="numero"><div class="rot">Vendeu</div><div class="val">${brl(r.vendeu)}</div><div class="det">${r.pecas} ${r.pecas === 1 ? 'bolsa' : 'bolsas'}</div></div>
      <div class="numero"><div class="rot">Comprou</div><div class="val">${brl(r.comprou)}</div><div class="det">gasto com mercadoria</div></div>
      <div class="numero"><div class="rot">Tem em casa</div><div class="val">${r.estoque}</div><div class="det">${brl(r.investido)} pagos · vale ${brl(r.potencial)}</div></div>
      <div class="numero ${r.fiado > 0 ? 'alerta' : ''}"><div class="rot">Falta receber</div><div class="val">${brl(r.fiado)}</div><div class="det">de todas as vendas fiado</div></div>
    </div>
    ${top.length ? `<div class="secao"><h2>Mais vendidas</h2></div><div class="lista">${top.map(([id, q]) => {
      const b = D.bolsas[id];
      return `<button class="item" ${b ? `data-bolsa="${id}"` : ''}><div class="mini" ${fundo(b?.mini)}></div><div class="meio"><div class="t1">${esc(nomeDe(id))}</div><div class="t2">${b ? (b.qtd > 0 ? b.qtd + ' em casa' : 'esgotada') : ''}</div></div><div class="dir"><div class="v">${q}</div><div class="t2 pequeno muted">vendidas</div></div></button>`;
    }).join('')}</div>` : ''}
    <div class="secao"><h2>Histórico</h2></div>
    ${chips([['tudo', 'Tudo'], ['venda', 'Vendas'], ['entrada', 'Compras'], ['saida', 'Saídas'], ['fiado', 'Fiado']], f, 'filtroHist')}
    ${hist}`;
}

function telaBolsas() {
  const q = UI.buscaBolsas.trim().toLowerCase();
  const todas = bolsas();
  let lista = todas.filter((b) => !q || b.nome.toLowerCase().includes(q));
  if (UI.filtroBolsas === 'disp') lista = lista.filter((b) => b.qtd > 0);
  if (UI.filtroBolsas === 'esg') lista = lista.filter((b) => b.qtd <= 0);
  const disp = todas.filter((b) => b.qtd > 0).length;
  return `
    <input class="busca" type="search" placeholder="Procurar bolsa" value="${esc(UI.buscaBolsas)}" data-busca="buscaBolsas">
    ${chips([['disp', `Disponíveis (${disp})`], ['esg', `Esgotadas (${todas.length - disp})`], ['todas', 'Todas']], UI.filtroBolsas, 'filtroBolsas')}
    ${lista.length ? `<div class="grade">${lista.map(cardBolsa).join('')}</div>` : `<div class="cartao vazio">${todas.length ? 'Nenhuma bolsa aqui.' : 'Cadastre a primeira bolsa com foto, quanto pagou e por quanto vende.'}</div>`}
    <button class="btn flutuante" data-acao="nova-bolsa">${I.mais} Nova bolsa</button>`;
}

function cardBolsa(b) {
  const q = b.qtd || 0;
  return `<button class="bolsa ${q <= 0 ? 'esgotada' : ''}" data-bolsa="${b.id}">
    <div class="img" ${fundo(b.mini)}></div>
    <span class="selo ${q <= 0 ? 'zero' : ''}">${q <= 0 ? 'Esgotada' : q + (q === 1 ? ' disponível' : ' disponíveis')}</span>
    <div class="info"><div class="nome">${esc(b.nome)}</div><div class="preco">${brl(b.preco)}</div></div>
  </button>`;
}

function telaClientes() {
  const q = UI.buscaClientes.trim().toLowerCase();
  const lista = clientes().filter((c) => !q || c.nome.toLowerCase().includes(q) || soDigitos(c.whats).includes(soDigitos(q) || '#'));
  return `
    <input class="busca" type="search" placeholder="Procurar cliente" value="${esc(UI.buscaClientes)}" data-busca="buscaClientes">
    ${lista.length ? `<div class="lista">${lista.map((c) => {
      const r = doCliente(c.id);
      return `<button class="item" data-cliente="${c.id}"><div class="avatar">${inicial(c.nome)}</div>
        <div class="meio"><div class="t1">${esc(c.nome)}</div><div class="t2">${r.lista.length ? `${r.lista.length} ${r.lista.length === 1 ? 'compra' : 'compras'} · ${brl(r.total)}` : 'ainda não comprou'}</div></div>
        <div class="dir">${r.deve > 0 ? `<span class="tag fiado">deve ${brl(r.deve)}</span>` : ''}</div></button>`;
    }).join('')}</div>` : `<div class="cartao vazio">${D.clientes && Object.keys(D.clientes).length ? 'Ninguém com esse nome.' : 'As clientes aparecem aqui quando você coloca o nome numa venda, ou cadastra por aqui.'}</div>`}
    <button class="btn flutuante" data-acao="nova-cliente">${I.mais} Nova cliente</button>`;
}

const ROTULO = { venda: 'Venda', entrada: 'Compra', saida: 'Saída' };
function itemMov(m) {
  const b = D.bolsas[m.bolsaId];
  const quem = m.tipo === 'venda' ? (m.clienteNome || 'sem nome') : m.tipo === 'saida' ? (m.obs || 'saída') : 'entrou no estoque';
  return `<button class="item" data-mov="${m.id}">
    <div class="mini" ${fundo(b?.mini)}></div>
    <div class="meio"><div class="t1">${esc(m.nome)}${m.qtd > 1 ? ` <span class="muted">×${m.qtd}</span>` : ''}</div>
      <div class="t2"><span class="tag ${m.tipo === 'venda' && !m.pago ? 'fiado' : m.tipo}">${m.tipo === 'venda' && !m.pago ? 'Fiado' : ROTULO[m.tipo]}</span> ${esc(quem)} · ${dataCurta(m.data)}</div></div>
    <div class="dir"><div class="v ${m.tipo === 'venda' ? 'pos' : ''}">${m.tipo === 'saida' ? '−' + m.qtd : brl(valor(m))}</div>
      ${m.tipo === 'venda' ? `<div class="pequeno muted">lucro ${brl(lucroDe(m))}</div>` : ''}</div>
  </button>`;
}

/* ---------------- folha (janela de baixo) ---------------- */
const folha = () => $('#folha');
function abrirFolha(titulo, corpo) {
  $('#folha-conteudo').innerHTML = `<div class="folha-topo"><h2>${esc(titulo)}</h2><button class="fechar" data-acao="fechar" aria-label="Fechar">×</button></div>${corpo}`;
  if (!folha().open) folha().showModal();
  folha().scrollTop = 0;
}
const fecharFolha = () => folha().open && folha().close();

// Guarda como cada documento estava antes, para o botão Desfazer.
async function retrato(ops) {
  const inv = [];
  const vistos = new Set();
  for (const op of ops) {
    const k = op.col + '/' + op.id;
    if (vistos.has(k)) continue;
    vistos.add(k);
    if (op.col === 'fotos') {
      const img = D.bolsas[op.id] ? await api.foto(op.id).catch(() => null) : null;
      inv.push(img ? { col: 'fotos', id: op.id, dados: { img } } : { col: 'fotos', id: op.id, apagar: true });
      continue;
    }
    const antes = D[op.col]?.[op.id];
    inv.push(antes ? { col: op.col, id: op.id, dados: { ...antes } } : { col: op.col, id: op.id, apagar: true });
  }
  return inv;
}

let desfazerT;
function mostrarDesfazer(msg, inv) {
  const el = $('#desfazer');
  el.innerHTML = `<span>${esc(msg)}</span><button type="button">Desfazer</button>`;
  el.className = 'ver';
  clearTimeout(desfazerT);
  desfazerT = setTimeout(() => (el.className = ''), 10000);
  el.querySelector('button').onclick = async () => {
    clearTimeout(desfazerT);
    el.className = '';
    try {
      await api.grava(inv);
      fecharFolha();
      render();
      toast('Pronto, desfeito');
    } catch (e) {
      toast('Não consegui desfazer: ' + e.message, true);
    }
  };
}

async function gravar(ops, msg, btn) {
  if (btn) { btn.disabled = true; btn.dataset.txt = btn.textContent; btn.textContent = 'Salvando…'; }
  try {
    const inv = await retrato(ops);
    const r = await api.grava(ops);
    fecharFolha();
    render();
    mostrarDesfazer(r?.pendente ? msg + ' (envia quando a internet voltar)' : msg, inv);
    return true;
  } catch (e) {
    console.error(e);
    toast(e.message || 'Não deu certo. Tente de novo.', true);
    if (btn) { btn.disabled = false; btn.textContent = btn.dataset.txt; }
    return false;
  }
}

const campoDinheiro = (nome, rot, val, extra = '') => `<label class="campo"><span>${rot}</span><div class="dinheiro"><input name="${nome}" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${emCampo(val)}" ${extra}></div></label>`;
const campoQtd = (nome, rot, val, max) => `<label class="campo"><span>${rot}${max ? ` <span class="muted">(tem ${max})</span>` : ''}</span><div class="qtd"><button type="button" data-passo="-1">−</button><input name="${nome}" inputmode="numeric" value="${val}" ${max ? `data-max="${max}"` : ''}><button type="button" data-passo="1">+</button></div></label>`;
const campoData = (val) => `<label class="campo"><span>Data</span><input type="date" name="data" value="${val || hoje()}" max="${hoje()}"></label>`;

/* ----- bolsa ----- */
async function folhaBolsa(id) {
  const b = D.bolsas[id];
  if (!b) return;
  const hist = movs().filter((m) => m.bolsaId === id);
  const vendidas = hist.filter((m) => m.tipo === 'venda').reduce((s, m) => s + m.qtd, 0);
  const lucroPeca = (b.preco || 0) - (b.custo || 0);
  abrirFolha(b.nome, `
    <img class="foto-grande" id="foto-grande" src="${b.mini || ''}" alt="">
    <dl class="linhas">
      <div><dt>Em casa</dt><dd>${b.qtd > 0 ? b.qtd : '<span class="neg">Esgotada</span>'}</dd></div>
      <div><dt>Paguei (cada)</dt><dd>${brl(b.custo)}</dd></div>
      <div><dt>Vendo por</dt><dd>${brl(b.preco)}</dd></div>
      <div><dt>Lucro por bolsa</dt><dd class="${lucroPeca >= 0 ? 'pos' : 'neg'}">${brl(lucroPeca)}</dd></div>
      <div><dt>Já vendi</dt><dd>${vendidas}</dd></div>
      ${b.obs ? `<div><dt>Anotação</dt><dd style="font-weight:600;text-align:right;max-width:60%">${esc(b.obs)}</dd></div>` : ''}
    </dl>
    <button class="btn cheio verde" data-acao="vender-bolsa" data-id="${id}" ${b.qtd > 0 ? '' : 'disabled'}>Vender esta bolsa</button>
    <div class="botoes" style="margin-top:10px">
      <button class="btn sec" data-acao="entrada" data-id="${id}">Comprei mais</button>
      <button class="btn claro" data-acao="saida" data-id="${id}" ${b.qtd > 0 ? '' : 'disabled'}>Saída</button>
      <button class="btn claro" data-acao="compartilhar" data-id="${id}">${I.enviar} Enviar foto</button>
      <button class="btn claro" data-acao="editar-bolsa" data-id="${id}">Editar</button>
    </div>
    ${hist.length ? `<div class="secao"><h2>Movimentação</h2></div><div class="lista">${hist.map(itemMov).join('')}</div>` : ''}`);
  const img = await api.foto(id).catch(() => null);
  const el = $('#foto-grande');
  if (img && el) el.src = img;
}

function formBolsa(id) {
  const b = id ? D.bolsas[id] : null;
  const st = { mini: b?.mini || '', foto: null };
  abrirFolha(b ? 'Editar bolsa' : 'Nova bolsa', `
    <form id="f-bolsa" autocomplete="off">
      <label class="foto-campo ${st.mini ? 'tem' : ''}" id="foto-campo" ${fundo(st.mini)}>
        <input type="file" accept="image/*" name="arquivo">
        <span class="${st.mini ? 'dica' : ''}">${st.mini ? 'Trocar foto' : `${I.camera}<br>Tirar ou escolher foto`}</span>
      </label>
      <label class="campo"><span>Nome da bolsa</span><input name="nome" required maxlength="80" placeholder="Ex.: Tote caramelo" value="${esc(b?.nome)}"></label>
      <div class="lado">
        ${campoDinheiro('custo', 'Paguei (cada)', b?.custo)}
        ${campoDinheiro('preco', 'Vendo por', b?.preco)}
      </div>
      ${b ? '' : campoQtd('qtd', 'Quantas comprei', 1)}
      <label class="campo"><span>Anotação <span class="muted">(opcional)</span></span><input name="obs" maxlength="200" placeholder="Cor, fornecedor, tamanho…" value="${esc(b?.obs)}"></label>
      <button class="btn cheio" type="submit">${b ? 'Salvar' : 'Cadastrar bolsa'}</button>
      ${b ? `<button class="btn perigo cheio" style="margin-top:10px" type="button" data-acao="apagar-bolsa" data-id="${id}">Apagar bolsa</button>` : ''}
    </form>`);

  const f = $('#f-bolsa');
  f.arquivo.addEventListener('change', async () => {
    const arq = f.arquivo.files[0];
    if (!arq) return;
    const campo = $('#foto-campo');
    campo.querySelector('span').textContent = 'Preparando foto…';
    try {
      const grande = modo === 'demo' ? await comprimir(arq, 700, 0.7, 250e3) : await comprimir(arq, 1280, 0.82, 650e3);
      st.foto = grande;
      st.mini = await comprimir(arq, 320, 0.72, 40e3, true);
      campo.style.backgroundImage = `url('${st.mini}')`;
      campo.classList.add('tem');
      campo.querySelector('span').className = 'dica';
      campo.querySelector('span').textContent = 'Trocar foto';
    } catch (e) {
      console.error(e);
      campo.querySelector('span').textContent = 'Não consegui abrir essa foto. Tente outra.';
    }
  });

  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = f.nome.value.trim();
    const custo = num(f.custo.value);
    const preco = num(f.preco.value);
    if (!nome) return toast('Coloque um nome na bolsa.', true);
    if (Number.isNaN(custo) || Number.isNaN(preco)) return toast('Confira os valores (use só números, ex.: 89,90).', true);
    const obs = f.obs.value.trim();
    const bid = id || novoId();
    const ops = [];
    if (b) {
      ops.push({ col: 'bolsas', id: bid, merge: true, dados: { nome, custo, preco, obs, mini: st.mini } });
    } else {
      const qtd = Math.max(0, parseInt(f.qtd.value, 10) || 0);
      ops.push({ col: 'bolsas', id: bid, dados: { nome, custo, preco, obs, mini: st.mini, qtd, criada: Date.now() } });
      if (qtd > 0) ops.push({ col: 'movimentos', id: novoId(), dados: { tipo: 'entrada', bolsaId: bid, nome, qtd, custo, preco: 0, data: Date.now(), obs: 'Cadastro' } });
    }
    if (st.foto) ops.push({ col: 'fotos', id: bid, dados: { img: st.foto } });
    await gravar(ops, b ? 'Bolsa atualizada' : 'Bolsa cadastrada', f.querySelector('[type=submit]'));
  });
}

// Cadastro de bolsa nova, uma pergunta por vez.
function novaBolsa() {
  const st = { passo: 0, foto: null, mini: '', custo: '', preco: '', qtd: 1, nome: '' };
  const total = 5;
  const nomePadrao = `Bolsa ${Object.keys(D.bolsas).length + 1}`;
  const pontos = () => `<div class="pontos">${Array.from({ length: total }, (_, i) => `<i class="${i <= st.passo ? 'on' : ''}"></i>`).join('')}</div>`;
  const rodape = (rotulo = 'Continuar') => `<div class="botoes" style="margin-top:18px">
      <button type="button" class="btn claro" data-voltar>${st.passo ? 'Voltar' : 'Cancelar'}</button>
      <button type="submit" class="btn">${rotulo}</button></div>`;

  const desenha = () => {
    let corpo = '';
    if (st.passo === 0) {
      corpo = `<p class="pergunta">Tire uma foto da bolsa</p>
        <label class="foto-campo grande ${st.mini ? 'tem' : ''}" id="foto-campo" ${fundo(st.mini)}>
          <input type="file" accept="image/*" name="arquivo">
          <span class="${st.mini ? 'dica' : ''}">${st.mini ? 'Trocar foto' : `${I.camera}<br>Toque aqui`}</span>
        </label>
        <div class="botoes"><button type="button" class="btn claro" data-voltar>Cancelar</button>
        <button type="submit" class="btn">${st.mini ? 'Continuar' : 'Sem foto'}</button></div>`;
    } else if (st.passo === 1) {
      corpo = `<p class="pergunta">Quanto você pagou em cada uma?</p>
        <div class="dinheiro enorme"><input name="v" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(st.custo)}"></div>${rodape()}`;
    } else if (st.passo === 2) {
      corpo = `<p class="pergunta">Por quanto você vai vender?</p>
        <div class="dinheiro enorme"><input name="v" inputmode="decimal" autocomplete="off" placeholder="0,00" value="${esc(st.preco)}"></div>
        <p class="dica-lucro" id="dica-lucro"></p>${rodape()}`;
    } else if (st.passo === 3) {
      corpo = `<p class="pergunta">Quantas você comprou?</p>
        <div class="qtd enorme"><button type="button" data-passo="-1">−</button><input name="v" inputmode="numeric" value="${st.qtd}"><button type="button" data-passo="1">+</button></div>${rodape()}`;
    } else {
      corpo = `<p class="pergunta">Quer dar um nome? <span class="muted">(pode pular)</span></p>
        <input class="busca enorme-txt" name="v" maxlength="80" placeholder="${esc(nomePadrao)}" value="${esc(st.nome)}">
        <p class="muted pequeno">Ex.: "caramelo grande", "preta da Shein". Sem nome, fica "${esc(nomePadrao)}".</p>${rodape('Salvar bolsa')}`;
    }
    abrirFolha('Bolsa nova', `<form id="f-nova" autocomplete="off">${pontos()}${corpo}</form>`);
    const f = $('#f-nova');
    const v = f.querySelector('[name=v]');
    if (v) setTimeout(() => v.focus(), 50);

    if (st.passo === 0) {
      f.arquivo.addEventListener('change', async () => {
        const arq = f.arquivo.files[0];
        if (!arq) return;
        const span = $('#foto-campo span');
        span.textContent = 'Preparando foto…';
        try {
          st.foto = modo === 'demo' ? await comprimir(arq, 700, 0.7, 250e3) : await comprimir(arq, 1280, 0.82, 650e3);
          st.mini = await comprimir(arq, 320, 0.72, 40e3, true);
          st.passo = 1;
          desenha();
        } catch (e) {
          console.error(e);
          span.textContent = 'Não consegui abrir essa foto. Tente outra.';
        }
      });
    }
    if (st.passo === 2) {
      const dica = () => {
        const l = (num(v.value) || 0) - (num(st.custo) || 0);
        $('#dica-lucro').innerHTML = v.value ? `Lucro de <b class="${l >= 0 ? 'pos' : 'neg'}">${brl(l)}</b> em cada uma` : '';
      };
      v.addEventListener('input', dica);
      dica();
    }
    f.querySelector('[data-voltar]').addEventListener('click', () => {
      if (!st.passo) return fecharFolha();
      st.passo--;
      desenha();
    });
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (st.passo === 1 || st.passo === 2) {
        const n = num(v.value);
        if (!v.value.trim() || Number.isNaN(n)) return toast('Escreva o valor, ex.: 89,90', true);
        st[st.passo === 1 ? 'custo' : 'preco'] = v.value.trim();
      }
      if (st.passo === 3) {
        st.qtd = parseInt(v.value, 10) || 0;
        if (st.qtd < 1) return toast('Pelo menos 1.', true);
      }
      if (st.passo < total - 1) { st.passo++; desenha(); return; }
      st.nome = v.value.trim();
      const nome = st.nome || nomePadrao;
      const custo = num(st.custo);
      const bid = novoId();
      const ops = [
        { col: 'bolsas', id: bid, dados: { nome, custo, preco: num(st.preco), obs: '', mini: st.mini, qtd: st.qtd, criada: Date.now() } },
        { col: 'movimentos', id: novoId(), dados: { tipo: 'entrada', bolsaId: bid, nome, qtd: st.qtd, custo, preco: 0, data: Date.now(), obs: 'Cadastro' } }
      ];
      if (st.foto) ops.push({ col: 'fotos', id: bid, dados: { img: st.foto } });
      await gravar(ops, `${nome} cadastrada`, f.querySelector('[type=submit]'));
    });
  };
  desenha();
}

function formComprei() {
  const lista = bolsas();
  abrirFolha('O que você comprou?', `
    <button class="btn cheio alto" data-acao="nova-bolsa">${I.camera} Uma bolsa nova</button>
    ${lista.length ? `<p class="muted" style="margin:18px 0 8px">Ou mais unidades de uma que você já tem:</p>
    <div class="escolher-bolsa">${lista.map((b) => `<button type="button" data-acao="entrada" data-id="${b.id}"><div class="img" ${fundo(b.mini)}></div><div class="n">${esc(b.nome)}</div></button>`).join('')}</div>` : ''}`);
}

function apagarBolsa(id) {
  const b = D.bolsas[id];
  if (!b) return;
  if (!confirm(`Apagar "${b.nome}"?\n\nAs vendas e compras dela continuam no histórico e no lucro.`)) return;
  gravar([{ col: 'bolsas', id, apagar: true }, { col: 'fotos', id, apagar: true }], 'Bolsa apagada');
}

async function compartilhar(id) {
  const b = D.bolsas[id];
  if (!b) return;
  try {
    const src = (await api.foto(id).catch(() => null)) || b.mini;
    const texto = `${b.nome} · ${brl(b.preco)}`;
    if (!src) {
      if (navigator.share) await navigator.share({ text: texto });
      return;
    }
    const blob = await (await fetch(src)).blob();
    const ext = blob.type.includes('svg') ? 'svg' : 'jpg';
    const arq = new File([blob], `${b.nome.replace(/[^\w\-]+/g, '-').toLowerCase()}.${ext}`, { type: blob.type });
    if (navigator.canShare?.({ files: [arq] })) {
      await navigator.share({ files: [arq], text: texto });
    } else {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = arq.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      toast('Foto baixada');
    }
  } catch (e) {
    if (e?.name !== 'AbortError') toast('Não consegui enviar a foto.', true);
  }
}

/* ----- venda ----- */
function formVenda(bolsaId, clienteId) {
  const st = { bolsaId, busca: '' };
  const escolherBolsa = () => {
    const disp = bolsas().filter((b) => b.qtd > 0);
    const q = st.busca.trim().toLowerCase();
    const lista = disp.filter((b) => !q || b.nome.toLowerCase().includes(q));
    abrirFolha('Qual bolsa vendeu?', disp.length ? `
      <input class="busca" type="search" placeholder="Procurar bolsa" value="${esc(st.busca)}" id="busca-venda">
      <div class="escolher-bolsa">${lista.map((b) => `<button type="button" data-escolhe="${b.id}"><div class="img" ${fundo(b.mini)}></div><div class="n">${esc(b.nome)}</div></button>`).join('') || '<p class="muted">Nenhuma com esse nome.</p>'}</div>
      <p class="muted pequeno">Só aparecem as bolsas que você tem em casa.</p>` : `
      <div class="vazio">Nenhuma bolsa disponível.<br>Cadastre ou registre uma compra primeiro.<br><br><button class="btn" data-acao="nova-bolsa">Cadastrar bolsa</button></div>`);
    const busca = $('#busca-venda');
    if (busca) {
      busca.addEventListener('input', () => {
        st.busca = busca.value;
        const pos = busca.selectionStart;
        escolherBolsa();
        const nova = $('#busca-venda');
        nova.focus();
        nova.setSelectionRange(pos, pos);
      });
    }
    $('#folha-conteudo').querySelectorAll('[data-escolhe]').forEach((el) => el.addEventListener('click', () => { st.bolsaId = el.dataset.escolhe; formulario(); }));
  };

  const formulario = () => {
    const b = D.bolsas[st.bolsaId];
    const c = clienteId ? D.clientes[clienteId] : null;
    abrirFolha('Registrar venda', `
      <form id="f-venda" autocomplete="off">
        <div class="escolhida"><div class="mini" ${fundo(b.mini)}></div><div class="meio"><div class="t1">${esc(b.nome)}</div><div class="muted pequeno">${b.qtd} em casa · paguei ${brl(b.custo)}</div></div>
          ${bolsaId ? '' : '<button type="button" class="link" id="trocar-bolsa">Trocar</button>'}</div>
        <div class="lado">
          ${campoQtd('qtd', 'Quantas', 1, b.qtd)}
          ${campoDinheiro('preco', 'Preço (cada)', b.preco)}
        </div>
        <label class="campo"><span>Para quem? <span class="muted">(pode deixar em branco)</span></span><input name="cliente" placeholder="Nome da cliente" value="${esc(c?.nome)}" maxlength="60"><input type="hidden" name="clienteId" value="${c?.id || ''}"></label>
        <div id="sugestoes"></div>
        <div class="campo"><span>Pagamento</span><div class="escolha">
          <label><input type="radio" name="pago" value="1" checked><span>Já pagou</span></label>
          <label><input type="radio" name="pago" value="0"><span>Vai pagar depois</span></label>
        </div></div>
        <div class="resumo-venda" id="resumo-venda"></div>
        <details class="opcoes"><summary>Outra data ou anotação</summary>
          ${campoData()}
          <label class="campo"><span>Anotação</span><input name="obs" maxlength="200" placeholder="Pix, parcelado, entrega…"></label>
        </details>
        <button class="btn cheio verde" type="submit">Salvar venda</button>
      </form>`);
    const f = $('#f-venda');
    $('#trocar-bolsa')?.addEventListener('click', escolherBolsa);
    const atualiza = () => {
      const q = Math.max(1, parseInt(f.qtd.value, 10) || 1);
      const p = num(f.preco.value) || 0;
      const total = q * p;
      const lucro = total - q * (b.custo || 0);
      $('#resumo-venda').innerHTML = `<div><span>Total</span><b>${brl(total)}</b></div><div><span>Lucro</span><b class="${lucro >= 0 ? 'pos' : 'neg'}">${brl(lucro)}</b></div>`;
    };
    f.addEventListener('input', atualiza);
    f.addEventListener('passo', atualiza);
    atualiza();
    ligaSugestoes(f);

    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const qtd = parseInt(f.qtd.value, 10) || 0;
      const preco = num(f.preco.value);
      const pago = f.pago.value === '1';
      const nomeC = f.cliente.value.trim();
      if (qtd < 1) return toast('Quantidade precisa ser pelo menos 1.', true);
      if (qtd > b.qtd) return toast(`Você só tem ${b.qtd} dessa bolsa. Registre a compra primeiro.`, true);
      if (Number.isNaN(preco)) return toast('Confira o preço (ex.: 149,90).', true);
      if (!pago && !nomeC) return toast('Fiado precisa do nome da cliente.', true);
      const ops = [];
      let cid = f.clienteId.value || '';
      if (nomeC && !cid) {
        cid = novoId();
        ops.push({ col: 'clientes', id: cid, dados: { nome: nomeC, whats: '', obs: '', criada: Date.now() } });
      }
      ops.push({
        col: 'movimentos', id: novoId(), dados: {
          tipo: 'venda', bolsaId: b.id, nome: b.nome, qtd, custo: b.custo || 0, preco,
          clienteId: cid, clienteNome: nomeC, pago, data: msDe(f.data.value || hoje()), obs: f.obs.value.trim()
        }
      });
      ops.push({ col: 'bolsas', id: b.id, soma: { qtd: -qtd } });
      const lucro = (preco - (b.custo || 0)) * qtd;
      await gravar(ops, `Venda salva! Lucro de ${brl(lucro)}`, f.querySelector('[type=submit]'));
    });
  };

  if (st.bolsaId && D.bolsas[st.bolsaId]?.qtd > 0) formulario();
  else escolherBolsa();
}

function ligaSugestoes(f) {
  const caixa = $('#sugestoes');
  const mostra = () => {
    const q = f.cliente.value.trim().toLowerCase();
    const exata = clientes().find((c) => c.nome.trim().toLowerCase() === q);
    f.clienteId.value = exata ? exata.id : '';
    if (!q || exata) { caixa.innerHTML = ''; return; }
    const achou = clientes().filter((c) => c.nome.toLowerCase().includes(q)).slice(0, 4);
    caixa.innerHTML = achou.length
      ? `<div class="sugestoes">${achou.map((c) => `<button type="button" data-cid="${c.id}">${esc(c.nome)}</button>`).join('')}</div>`
      : `<p class="muted pequeno" style="margin:-8px 0 14px">Cliente nova: vai ficar salva na aba Clientes.</p>`;
  };
  f.cliente.addEventListener('input', mostra);
  caixa.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-cid]');
    if (!el) return;
    const c = D.clientes[el.dataset.cid];
    f.cliente.value = c.nome;
    f.clienteId.value = c.id;
    caixa.innerHTML = '';
  });
}

/* ----- entrada e saída ----- */
function formEntrada(id) {
  const b = D.bolsas[id];
  abrirFolha('Comprei mais', `
    <form id="f-entrada" autocomplete="off">
      <div class="escolhida"><div class="mini" ${fundo(b.mini)}></div><div class="meio"><div class="t1">${esc(b.nome)}</div><div class="muted pequeno">${b.qtd} em casa agora</div></div></div>
      ${campoQtd('qtd', 'Quantas chegaram', 1)}
      ${campoDinheiro('custo', 'Paguei em cada uma', b.custo)}
      <div class="resumo-venda" id="resumo-entrada"></div>
      <details class="opcoes"><summary>Mudar preço de venda ou data</summary>
        ${campoDinheiro('preco', 'Vendo por', b.preco)}
        ${campoData()}
      </details>
      <button class="btn cheio" type="submit">Salvar compra</button>
    </form>`);
  const f = $('#f-entrada');
  const atualiza = () => {
    const q = Math.max(0, parseInt(f.qtd.value, 10) || 0);
    $('#resumo-entrada').innerHTML = `<div><span>Total gasto</span><b>${brl(q * (num(f.custo.value) || 0))}</b></div><div><span>Vai ficar com</span><b>${b.qtd + q}</b></div>`;
  };
  f.addEventListener('input', atualiza);
  f.addEventListener('passo', atualiza);
  atualiza();
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const qtd = parseInt(f.qtd.value, 10) || 0;
    const custo = num(f.custo.value);
    const preco = num(f.preco.value);
    if (qtd < 1) return toast('Quantidade precisa ser pelo menos 1.', true);
    if (Number.isNaN(custo) || Number.isNaN(preco)) return toast('Confira os valores.', true);
    await gravar([
      { col: 'movimentos', id: novoId(), dados: { tipo: 'entrada', bolsaId: id, nome: b.nome, qtd, custo, preco: 0, data: msDe(f.data.value || hoje()), obs: '' } },
      { col: 'bolsas', id, merge: true, dados: { custo, preco }, soma: { qtd } }
    ], `+${qtd} no estoque`, f.querySelector('[type=submit]'));
  });
}

const MOTIVOS = ['Dei de presente', 'Defeito ou perdi', 'Devolvi ao fornecedor', 'Fiquei para mim', 'Outro'];
function formSaida(id) {
  const b = D.bolsas[id];
  abrirFolha('Saída sem venda', `
    <form id="f-saida" autocomplete="off">
      <div class="escolhida"><div class="mini" ${fundo(b.mini)}></div><div class="meio"><div class="t1">${esc(b.nome)}</div><div class="muted pequeno">${b.qtd} em casa agora</div></div></div>
      ${campoQtd('qtd', 'Quantas saíram', 1, b.qtd)}
      <label class="campo"><span>Motivo</span><select name="motivo">${MOTIVOS.map((m) => `<option>${m}</option>`).join('')}</select></label>
      ${campoData()}
      <p class="muted pequeno">Use para bolsa que saiu sem ser vendida. Para venda, use o botão Vender.</p>
      <button class="btn cheio" type="submit">Dar baixa</button>
    </form>`);
  const f = $('#f-saida');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const qtd = parseInt(f.qtd.value, 10) || 0;
    if (qtd < 1 || qtd > b.qtd) return toast(`Quantidade entre 1 e ${b.qtd}.`, true);
    await gravar([
      { col: 'movimentos', id: novoId(), dados: { tipo: 'saida', bolsaId: id, nome: b.nome, qtd, custo: b.custo || 0, preco: 0, data: msDe(f.data.value || hoje()), obs: f.motivo.value } },
      { col: 'bolsas', id, soma: { qtd: -qtd } }
    ], 'Baixa registrada', f.querySelector('[type=submit]'));
  });
}

/* ----- lançamento ----- */
function folhaMov(id) {
  const m = D.movimentos[id];
  if (!m) return;
  const b = D.bolsas[m.bolsaId];
  const c = m.clienteId && D.clientes[m.clienteId];
  const titulo = { venda: 'Venda', entrada: 'Compra', saida: 'Saída' }[m.tipo];
  abrirFolha(titulo, `
    <div class="escolhida"><div class="mini" ${fundo(b?.mini)}></div><div class="meio"><div class="t1">${esc(m.nome)}</div><div class="muted pequeno">${esc(dataLonga(m.data))}</div></div>
      ${b ? `<button class="link" data-bolsa="${b.id}">Ver bolsa</button>` : ''}</div>
    <dl class="linhas">
      <div><dt>Quantidade</dt><dd>${m.qtd}</dd></div>
      ${m.tipo === 'venda' ? `
        <div><dt>Preço (cada)</dt><dd>${brl(m.preco)}</dd></div>
        <div><dt>Total</dt><dd>${brl(m.preco * m.qtd)}</dd></div>
        <div><dt>Lucro</dt><dd class="${lucroDe(m) >= 0 ? 'pos' : 'neg'}">${brl(lucroDe(m))}</dd></div>
        <div><dt>Cliente</dt><dd>${c ? `<button class="link" data-cliente="${c.id}">${esc(c.nome)}</button>` : esc(m.clienteNome || '—')}</dd></div>
        <div><dt>Pagamento</dt><dd>${m.pago ? '<span class="pos">Pago</span>' : '<span class="tag fiado">Falta pagar</span>'}</dd></div>`
      : `<div><dt>Custo (cada)</dt><dd>${brl(m.custo)}</dd></div><div><dt>Total</dt><dd>${brl(m.custo * m.qtd)}</dd></div>`}
      ${m.obs ? `<div><dt>Anotação</dt><dd style="font-weight:600;text-align:right;max-width:60%">${esc(m.obs)}</dd></div>` : ''}
    </dl>
    ${m.tipo === 'venda' ? `<button class="btn cheio ${m.pago ? 'claro' : 'verde'}" data-acao="pago" data-id="${id}">${m.pago ? 'Marcar como não pago' : 'Recebi o pagamento'}</button>` : ''}
    <button class="btn perigo cheio" style="margin-top:10px" data-acao="apagar-mov" data-id="${id}">Apagar lançamento</button>
    <p class="muted pequeno">Apagar desfaz o efeito no estoque${m.tipo === 'venda' ? ' (a bolsa volta para casa)' : ''}.</p>`);
}

function apagarMov(id) {
  const m = D.movimentos[id];
  if (!m) return;
  if (!confirm('Apagar este lançamento? O estoque da bolsa é corrigido.')) return;
  const ops = [{ col: 'movimentos', id, apagar: true }];
  if (D.bolsas[m.bolsaId]) ops.push({ col: 'bolsas', id: m.bolsaId, soma: { qtd: m.tipo === 'entrada' ? -m.qtd : m.qtd } });
  gravar(ops, 'Lançamento apagado');
}

/* ----- clientes ----- */
function folhaCliente(id) {
  const c = D.clientes[id];
  if (!c) return;
  const r = doCliente(id);
  const link = zap(c.whats);
  const cobranca = link && r.deve > 0
    ? `${link}?text=${encodeURIComponent(`Oi, ${c.nome.split(' ')[0]}! Tudo bem? Passando para lembrar do valor de ${brl(r.deve)} das bolsas. Obrigada!`)}`
    : '';
  abrirFolha(c.nome, `
    <dl class="linhas">
      <div><dt>WhatsApp</dt><dd>${link ? `<a class="link" href="${link}" target="_blank" rel="noopener">${esc(c.whats)}</a>` : '<span class="muted">não cadastrado</span>'}</dd></div>
      <div><dt>Já comprou</dt><dd>${brl(r.total)}</dd></div>
      <div><dt>Falta pagar</dt><dd class="${r.deve > 0 ? 'neg' : ''}">${brl(r.deve)}</dd></div>
      ${c.obs ? `<div><dt>Anotação</dt><dd style="font-weight:600;text-align:right;max-width:60%">${esc(c.obs)}</dd></div>` : ''}
    </dl>
    <button class="btn cheio verde" data-acao="vender-cliente" data-id="${id}">Vender para ${esc(c.nome.split(' ')[0])}</button>
    <div class="botoes" style="margin-top:10px">
      ${cobranca ? `<a class="btn sec" href="${cobranca}" target="_blank" rel="noopener">Cobrar no WhatsApp</a>` : r.deve > 0 ? `<button class="btn sec" data-acao="quitar" data-id="${id}">Recebi tudo</button>` : '<span></span>'}
      <button class="btn claro" data-acao="editar-cliente" data-id="${id}">Editar</button>
    </div>
    ${cobranca ? `<button class="btn claro cheio" style="margin-top:10px" data-acao="quitar" data-id="${id}">Recebi tudo (${brl(r.deve)})</button>` : ''}
    <div class="secao"><h2>Compras</h2></div>
    ${r.lista.length ? `<div class="lista">${r.lista.map(itemMov).join('')}</div>` : '<div class="cartao vazio">Nenhuma compra ainda.</div>'}`);
}

function quitar(id) {
  const lista = doCliente(id).lista.filter((m) => !m.pago);
  if (!lista.length) return;
  gravar(lista.map((m) => ({ col: 'movimentos', id: m.id, merge: true, dados: { pago: true } })), 'Tudo recebido');
}

function formCliente(id) {
  const c = id ? D.clientes[id] : null;
  abrirFolha(c ? 'Editar cliente' : 'Nova cliente', `
    <form id="f-cliente" autocomplete="off">
      <label class="campo"><span>Nome</span><input name="nome" required maxlength="60" value="${esc(c?.nome)}"></label>
      <label class="campo"><span>WhatsApp <span class="muted">(opcional)</span></span><input name="whats" type="tel" inputmode="tel" placeholder="(73) 99999-9999" value="${esc(c?.whats)}"></label>
      <label class="campo"><span>Anotação <span class="muted">(opcional)</span></span><input name="obs" maxlength="200" placeholder="Bairro, gosto, indicação…" value="${esc(c?.obs)}"></label>
      <button class="btn cheio" type="submit">Salvar</button>
      ${c ? `<button class="btn perigo cheio" style="margin-top:10px" type="button" data-acao="apagar-cliente" data-id="${id}">Apagar cliente</button>` : ''}
    </form>`);
  const f = $('#f-cliente');
  f.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const nome = f.nome.value.trim();
    if (!nome) return toast('Coloque o nome.', true);
    const cid = id || novoId();
    const ops = [{ col: 'clientes', id: cid, merge: true, dados: { nome, whats: f.whats.value.trim(), obs: f.obs.value.trim(), ...(c ? {} : { criada: Date.now() }) } }];
    // mantém o nome certo nas vendas antigas
    if (c && c.nome !== nome) doCliente(cid).lista.forEach((m) => ops.push({ col: 'movimentos', id: m.id, merge: true, dados: { clienteNome: nome } }));
    await gravar(ops, 'Cliente salva', f.querySelector('[type=submit]'));
  });
}

function apagarCliente(id) {
  const c = D.clientes[id];
  if (!c || !confirm(`Apagar ${c.nome}? As vendas continuam no histórico.`)) return;
  gravar([{ col: 'clientes', id, apagar: true }], 'Cliente apagada');
}

/* ----- ajustes ----- */
function folhaAjustes() {
  abrirFolha('Ajustes', `
    <dl class="linhas">
      <div><dt>Onde ficam os dados</dt><dd>${modo === 'demo' ? 'Só neste navegador' : 'Na nuvem (Firebase)'}</dd></div>
      <div><dt>Bolsas</dt><dd>${Object.keys(D.bolsas).length}</dd></div>
      <div><dt>Clientes</dt><dd>${Object.keys(D.clientes).length}</dd></div>
      <div><dt>Lançamentos</dt><dd>${Object.keys(D.movimentos).length}</dd></div>
    </dl>
    <button class="btn claro cheio" data-acao="planilha">Baixar planilha (Excel)</button>
    ${modo === 'demo'
      ? '<button class="btn perigo cheio" style="margin-top:10px" data-acao="recomecar">Apagar tudo e voltar ao exemplo</button>'
      : ''}
    <p class="muted pequeno">Dica: no celular, use "Adicionar à tela de início" no navegador para abrir como aplicativo.</p>`);
}

function planilha() {
  const linhas = [['Data', 'Tipo', 'Bolsa', 'Quantidade', 'Custo cada', 'Preço cada', 'Total', 'Lucro', 'Cliente', 'Pago', 'Anotação']];
  for (const m of movs()) {
    linhas.push([
      new Date(m.data).toLocaleDateString('pt-BR'), ROTULO[m.tipo], m.nome, m.qtd,
      emCampo(m.custo || 0), m.tipo === 'venda' ? emCampo(m.preco) : '', emCampo(valor(m)),
      m.tipo === 'venda' ? emCampo(lucroDe(m)) : '', m.clienteNome || '', m.tipo === 'venda' ? (m.pago ? 'sim' : 'não') : '', m.obs || ''
    ]);
  }
  const csv = '﻿' + linhas.map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `bolsas-${hoje()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ---------------- falar e caderno (IA) ---------------- */
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

async function interpretar(pedido) {
  const corpo = {
    ...pedido,
    hoje: hoje(),
    bolsas: bolsas().map((b) => ({ id: b.id, nome: b.nome, custo: b.custo, preco: b.preco, qtd: b.qtd })),
    clientes: clientes().map((c) => ({ id: c.id, nome: c.nome }))
  };
  if (modo === 'demo') return simular(corpo);
  if (!SERVIDOR_URL) throw new Error('A leitura por IA ainda não foi ligada.');
  const r = await fetch(SERVIDOR_URL.replace(/\/+$/, '') + '/interpretar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Codigo': codigo },
    body: JSON.stringify(corpo)
  }).catch(() => null);
  if (!r) throw new Error('Sem internet. Tente de novo.');
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.erro || 'Não consegui entender agora.');
  return d;
}

// Modo demonstração: sem IA, entende frases simples e inventa uma página de caderno.
async function simular(c) {
  await new Promise((ok) => setTimeout(ok, 900));
  const achaBolsa = (t) => {
    const p = semAcento(t).split(/\W+/).filter((x) => x.length > 2);
    let melhor = null, nota = 0;
    for (const b of c.bolsas) {
      const n = semAcento(b.nome).split(/\W+/).filter((x) => p.includes(x)).length;
      if (n > nota) { nota = n; melhor = b; }
    }
    return melhor;
  };
  const achaCliente = (nome) => nome && c.clientes.find((x) => semAcento(x.nome).startsWith(semAcento(nome).split(' ')[0]));
  if (c.tipo === 'voz') {
    const t = semAcento(c.texto);
    const tipo = /pagou|me pagou|acertou/.test(t) ? 'pagamento' : /comprei|chegou|peguei/.test(t) ? 'entrada' : /dei |perdi|estragou|devolvi/.test(t) ? 'saida' : 'venda';
    const v = (c.texto.match(/(\d+[.,]?\d*)/) || [])[1];
    const nomeC = (c.texto.match(/\b(?:pra|para|pro|a)\s+([A-ZÀ-Ú][\wÀ-ú]+(?:\s[A-ZÀ-Ú][\wÀ-ú]+)?)/) || [])[1]
      || (tipo === 'pagamento' ? (c.texto.match(/^([A-ZÀ-Ú][\wÀ-ú]+)/) || [])[1] : null);
    const b = tipo === 'pagamento' ? null : achaBolsa(c.texto);
    const cl = achaCliente(nomeC);
    return {
      observacao: 'Leitura simulada (modo demonstração, sem IA).',
      itens: [{
        tipo, bolsaId: b?.id || null, bolsaNome: b?.nome || 'Bolsa nova', qtd: 1, valor: v ? num(v) : null, precoVenda: null,
        clienteId: cl?.id || null, clienteNome: cl?.nome || nomeC || null, pago: !/fiado|depois|deve|vai pagar|que vem/.test(t),
        data: null, texto: c.texto, duvida: b || tipo === 'pagamento' ? null : 'Não achei essa bolsa nas cadastradas.'
      }]
    };
  }
  const b = c.bolsas;
  const ontem = isoDe(Date.now() - 864e5);
  return {
    observacao: 'Página de exemplo (modo demonstração, sem IA). Com o servidor ligado, a foto é lida de verdade.',
    itens: [
      { tipo: 'entrada', bolsaId: null, bolsaNome: 'Bolsa de palha', qtd: 2, valor: 45, precoVenda: 110, clienteId: null, clienteNome: null, pago: true, data: ontem, texto: '2 bolsas palha 45 cada / vender 110', duvida: null },
      b[0] && { tipo: 'venda', bolsaId: b[0].id, bolsaNome: b[0].nome, qtd: 1, valor: 150, precoVenda: null, clienteId: c.clientes[0]?.id || null, clienteNome: c.clientes[0]?.nome || 'Ana', pago: false, data: ontem, texto: `${b[0].nome.split(' ')[0].toLowerCase()} - ${(c.clientes[0]?.nome || 'Ana').split(' ')[0]} 150 (deve)`, duvida: null },
      { tipo: 'venda', bolsaId: null, bolsaNome: 'Carteira rosa', qtd: 1, valor: 60, precoVenda: null, clienteId: null, clienteNome: 'Rosa', pago: true, data: hoje(), texto: 'carteira rosa 60 pg', duvida: 'Não achei essa carteira nas bolsas. Quanto você pagou nela?' },
      c.clientes[1] && { tipo: 'pagamento', bolsaId: null, bolsaNome: null, qtd: 1, valor: null, precoVenda: null, clienteId: c.clientes[1].id, clienteNome: c.clientes[1].nome, pago: true, data: hoje(), texto: `${c.clientes[1].nome.split(' ').pop()} pagou`, duvida: null }
    ].filter(Boolean)
  };
}

function carregando(titulo, msg) {
  abrirFolha(titulo, `<div class="esperando"><div class="giro"></div><p>${esc(msg)}</p></div>`);
}

function falar() {
  const R = window.SpeechRecognition || window.webkitSpeechRecognition;
  abrirFolha('Fale o que aconteceu', `
    <p class="muted">Ex.: "Vendi a bolsa caramelo pra Ana por 150, ela paga semana que vem"</p>
    ${R ? `<button type="button" class="mic" id="mic" aria-label="Microfone">${I.mic}</button><p class="mic-estado" id="mic-estado">Pode falar…</p>` : ''}
    <textarea id="fala" class="fala" rows="3" placeholder="${R ? 'O que você falou aparece aqui' : 'Toque aqui e use o microfone do teclado'}"></textarea>
    <button class="btn cheio verde" id="entender">Pronto</button>`);
  const caixa = $('#fala');
  const estado = $('#mic-estado');
  const mic = $('#mic');
  let rec = null;
  let ouvindo = false;
  let base = '';
  const enviar = async () => {
    const texto = caixa.value.trim();
    if (rec && ouvindo) { try { rec.abort(); } catch {} }
    if (texto.length < 3) return toast('Fale ou escreva o que aconteceu.', true);
    carregando('Entendendo…', `"${texto}"`);
    try {
      const r = await interpretar({ tipo: 'voz', texto });
      conferir(r, 'voz');
    } catch (e) {
      falar();
      $('#fala').value = texto;
      toast(e.message, true);
    }
  };
  $('#entender').addEventListener('click', enviar);
  if (!R) { caixa.focus(); return; }
  const comecar = () => {
    rec = new R();
    rec.lang = 'pt-BR';
    rec.interimResults = true;
    rec.continuous = false;
    base = caixa.value ? caixa.value.trim() + ' ' : '';
    rec.onresult = (ev) => {
      let t = '';
      for (const r of ev.results) t += r[0].transcript;
      caixa.value = base + t;
    };
    rec.onerror = (ev) => {
      estado.textContent = ev.error === 'not-allowed' || ev.error === 'service-not-allowed'
        ? 'O celular não deixou usar o microfone. Escreva aqui embaixo.'
        : ev.error === 'no-speech' ? 'Não ouvi nada. Toque no microfone e fale.' : 'Toque no microfone para tentar de novo.';
    };
    rec.onend = () => {
      ouvindo = false;
      mic?.classList.remove('ouvindo');
      if (!$('#fala')) return; // a folha já mudou
      if (caixa.value.trim().length >= 8 && estado.textContent === 'Pode falar…') { enviar(); return; }
      if (estado.textContent === 'Pode falar…') estado.textContent = 'Toque no microfone para falar de novo.';
    };
    try {
      rec.start();
      ouvindo = true;
      mic.classList.add('ouvindo');
      estado.textContent = 'Pode falar…';
    } catch { estado.textContent = 'Toque no microfone para falar.'; }
  };
  mic.addEventListener('click', () => { if (ouvindo) rec.stop(); else comecar(); });
  comecar();
}

function caderno() {
  abrirFolha('Foto do caderno', `
    <p class="pergunta">Tire uma foto da página</p>
    <p class="muted">Uma página por vez, com boa luz e a página inteira aparecendo. Depois você confere tudo antes de lançar.</p>
    <label class="foto-campo grande" id="foto-caderno"><input type="file" accept="image/*" name="arquivo"><span>${I.camera}<br>Toque aqui</span></label>`);
  $('#foto-caderno input').addEventListener('change', async (ev) => {
    const arq = ev.target.files[0];
    if (!arq) return;
    carregando('Lendo o caderno…', 'Isso pode levar até um minuto.');
    try {
      const imagem = await comprimir(arq, 1800, 0.85, 1.6e6);
      const r = await interpretar({ tipo: 'caderno', imagem });
      conferir(r, 'caderno');
    } catch (e) {
      console.error(e);
      caderno();
      toast(e.message || 'Não consegui ler a foto.', true);
    }
  });
}

// Tela de conferência: cada linha entendida vira um cartão que dá para corrigir ou desmarcar.
function conferir(resp, origem) {
  const itens = (resp.itens || []).map((i) => {
    const b = i.bolsaId && D.bolsas[i.bolsaId];
    const c = i.clienteId && D.clientes[i.clienteId];
    return {
      ...i,
      on: true,
      bolsaId: b ? b.id : '',
      bolsaNome: b ? b.nome : (i.bolsaNome || ''),
      clienteId: c ? c.id : '',
      clienteNome: c ? c.nome : (i.clienteNome || ''),
      valor: i.valor ?? (i.tipo === 'venda' && b ? b.preco : i.tipo === 'entrada' && b ? b.custo : null),
      custoNovo: i.tipo === 'venda' && !b ? null : undefined,
      data: i.data || hoje(),
      aberto: false
    };
  });
  if (!itens.length) {
    abrirFolha('Não entendi', `<p class="pergunta">Não achei nenhuma venda ou compra.</p>
      ${resp.observacao ? `<p class="muted">${esc(resp.observacao)}</p>` : ''}
      <button class="btn cheio" data-acao="${origem === 'voz' ? 'falar' : 'caderno'}">Tentar de novo</button>`);
    return;
  }

  const problema = (i) => {
    if (i.tipo === 'pagamento') {
      if (!i.clienteId) return 'Escolha quem pagou.';
      if (!doCliente(i.clienteId).deve) return 'Essa cliente não está devendo nada.';
      return '';
    }
    if (!i.bolsaId && !i.bolsaNome.trim()) return 'Falta dizer qual bolsa.';
    if ((i.tipo === 'venda' || i.tipo === 'entrada') && !(i.valor >= 0 && i.valor !== null)) return i.tipo === 'venda' ? 'Falta o valor da venda.' : 'Falta quanto pagou.';
    if (i.tipo === 'venda' && !i.bolsaId && !(i.custoNovo >= 0 && i.custoNovo !== null)) return 'Bolsa nova: diga quanto pagou nela.';
    if (i.tipo === 'venda' && !i.pago && !i.clienteNome.trim()) return 'Fiado precisa do nome da cliente.';
    return '';
  };

  const frase = (i) => {
    const b = i.bolsaId ? D.bolsas[i.bolsaId] : null;
    const nomeB = esc(b ? b.nome : i.bolsaNome || '?');
    const q = i.qtd > 1 ? `${i.qtd} ` : '';
    const quem = i.clienteNome ? ` para <b>${esc(i.clienteNome)}</b>` : '';
    if (i.tipo === 'venda') return `Vendeu <b>${q}${nomeB}</b> por <b>${i.valor != null ? brl(i.valor) : '?'}</b>${quem}${i.pago ? '' : ' <span class="tag fiado">vai pagar depois</span>'}`;
    if (i.tipo === 'entrada') return `Comprou <b>${q}${nomeB}</b> a <b>${i.valor != null ? brl(i.valor) : '?'}</b>${i.qtd > 1 ? ' cada' : ''}`;
    if (i.tipo === 'saida') return `Saiu sem venda: <b>${q}${nomeB}</b>`;
    return `<b>${esc(i.clienteNome || '?')}</b> pagou ${i.valor != null ? '<b>' + brl(i.valor) + '</b>' : 'tudo que devia'}`;
  };

  const cartao = (i, k) => {
    const b = i.bolsaId ? D.bolsas[i.bolsaId] : null;
    const erro = i.on ? problema(i) : '';
    const opcoesBolsa = `<option value="">Bolsa nova…</option>` + bolsas().map((x) => `<option value="${x.id}" ${x.id === i.bolsaId ? 'selected' : ''}>${esc(x.nome)} (${x.qtd} em casa)</option>`).join('');
    const opcoesCliente = `<option value="">${i.tipo === 'pagamento' ? 'Escolha…' : 'Nova ou sem nome'}</option>` + clientes().map((x) => `<option value="${x.id}" ${x.id === i.clienteId ? 'selected' : ''}>${esc(x.nome)}</option>`).join('');
    return `<div class="conf ${i.on ? '' : 'off'} ${erro ? 'com-erro' : ''}" data-k="${k}">
      <label class="conf-topo"><input type="checkbox" data-campo="on" ${i.on ? 'checked' : ''}>
        <div class="mini" ${fundo(b?.mini)}>${b?.mini ? '' : i.tipo === 'pagamento' ? '💰' : '👜'}</div>
        <div class="conf-frase">${frase(i)}${!b && i.tipo !== 'pagamento' ? ' <span class="tag entrada">bolsa nova</span>' : ''}${i.data !== hoje() ? `<div class="muted pequeno">${esc(dataLonga(msDe(i.data)))}</div>` : ''}</div>
      </label>
      ${erro ? `<p class="conf-aviso">${esc(erro)}</p>` : i.duvida && i.on ? `<p class="conf-duvida">${esc(i.duvida)}</p>` : ''}
      ${origem === 'caderno' && i.texto ? `<p class="conf-texto">Escrito: “${esc(i.texto)}”</p>` : ''}
      <details ${i.aberto || erro ? 'open' : ''} data-aberto><summary>Corrigir</summary>
        <label class="campo"><span>O que foi</span><select data-campo="tipo">
          ${[['venda', 'Venda'], ['entrada', 'Compra'], ['saida', 'Saída sem venda'], ['pagamento', 'Cliente pagou']].map(([v, t]) => `<option value="${v}" ${v === i.tipo ? 'selected' : ''}>${t}</option>`).join('')}
        </select></label>
        ${i.tipo !== 'pagamento' ? `
          <label class="campo"><span>Bolsa</span><select data-campo="bolsaId">${opcoesBolsa}</select></label>
          ${!i.bolsaId ? `<label class="campo"><span>Nome da bolsa nova</span><input data-campo="bolsaNome" value="${esc(i.bolsaNome)}"></label>` : ''}
          <label class="campo"><span>Quantas</span><input data-campo="qtd" inputmode="numeric" value="${i.qtd}"></label>` : ''}
        ${i.tipo === 'venda' || i.tipo === 'entrada' || i.tipo === 'pagamento' ? `<label class="campo"><span>${i.tipo === 'venda' ? 'Vendeu por (cada)' : i.tipo === 'entrada' ? 'Pagou (cada)' : 'Quanto pagou (vazio = tudo)'}</span><div class="dinheiro"><input data-campo="valor" inputmode="decimal" value="${emCampo(i.valor)}"></div></label>` : ''}
        ${i.tipo === 'venda' && !i.bolsaId ? `<label class="campo"><span>Quanto você pagou nela</span><div class="dinheiro"><input data-campo="custoNovo" inputmode="decimal" value="${emCampo(i.custoNovo)}"></div></label>` : ''}
        ${i.tipo === 'entrada' && !i.bolsaId ? `<label class="campo"><span>Vai vender por</span><div class="dinheiro"><input data-campo="precoVenda" inputmode="decimal" value="${emCampo(i.precoVenda)}"></div></label>` : ''}
        ${i.tipo === 'venda' || i.tipo === 'pagamento' ? `<label class="campo"><span>Cliente</span><select data-campo="clienteId">${opcoesCliente}</select></label>
          ${!i.clienteId && i.tipo === 'venda' ? `<label class="campo"><span>Nome (cliente nova)</span><input data-campo="clienteNome" value="${esc(i.clienteNome)}"></label>` : ''}` : ''}
        ${i.tipo === 'venda' ? `<label class="campo"><span>Pagamento</span><select data-campo="pago"><option value="1" ${i.pago ? 'selected' : ''}>Já pagou</option><option value="0" ${i.pago ? '' : 'selected'}>Vai pagar depois</option></select></label>` : ''}
        <label class="campo"><span>Data</span><input type="date" data-campo="data" value="${i.data}" max="${hoje()}"></label>
      </details>
    </div>`;
  };

  const desenha = () => {
    const marcados = itens.filter((i) => i.on);
    const comErro = marcados.filter(problema).length;
    abrirFolha(origem === 'voz' ? 'Entendi assim' : 'Confira o caderno', `
      ${resp.observacao ? `<p class="muted pequeno">${esc(resp.observacao)}</p>` : ''}
      ${itens.length > 1 ? '<p class="muted pequeno">Desmarque o que estiver errado ou toque em Corrigir.</p>' : ''}
      <div id="confs">${itens.map(cartao).join('')}</div>
      <button class="btn cheio verde alto" id="lancar" ${!marcados.length || comErro ? 'disabled' : ''}>
        ${!marcados.length ? 'Nada marcado' : comErro ? `Corrija ${comErro === 1 ? '1 item' : comErro + ' itens'} acima` : itens.length === 1 ? 'Isso mesmo, lançar' : `Lançar ${marcados.length} ${marcados.length === 1 ? 'item' : 'itens'}`}
      </button>
      <button class="btn claro cheio" style="margin-top:10px" data-acao="${origem === 'voz' ? 'falar' : 'caderno'}">${origem === 'voz' ? 'Falar de novo' : 'Outra foto'}</button>`);
    const box = $('#confs');
    box.addEventListener('change', (ev) => {
      const el = ev.target.closest('[data-campo]');
      const k = Number(ev.target.closest('[data-k]')?.dataset.k);
      if (!el || Number.isNaN(k)) return;
      const i = itens[k];
      const c = el.dataset.campo;
      if (c === 'on') i.on = el.checked;
      else if (c === 'qtd') i.qtd = Math.max(1, parseInt(el.value, 10) || 1);
      else if (c === 'valor' || c === 'custoNovo' || c === 'precoVenda') { const n = num(el.value); i[c] = el.value.trim() === '' || Number.isNaN(n) ? null : n; }
      else if (c === 'pago') i.pago = el.value === '1';
      else if (c === 'bolsaId') { i.bolsaId = el.value; const b = D.bolsas[el.value]; if (b && i.valor == null) i.valor = i.tipo === 'entrada' ? b.custo : b.preco; }
      else if (c === 'clienteId') { i.clienteId = el.value; i.clienteNome = D.clientes[el.value]?.nome || ''; }
      else i[c] = el.value;
      i.aberto = c !== 'on';
      const y = folha().scrollTop;
      desenha();
      folha().scrollTop = y;
    });
    box.querySelectorAll('details[data-aberto]').forEach((d) => d.addEventListener('toggle', () => { itens[Number(d.closest('[data-k]').dataset.k)].aberto = d.open; }));
    $('#lancar').addEventListener('click', () => lancar(itens.filter((i) => i.on), $('#lancar')));
  };
  desenha();
}

// Transforma os itens conferidos em gravações (mesmas regras das telas de venda e compra).
async function lancar(itens, btn) {
  const ops = [];
  const novasBolsas = {};
  const novasClientes = {};
  const deveAinda = {}; // vendas fiado já quitadas nesta leva
  const ordem = [...itens].sort((a, b) => a.data.localeCompare(b.data) || (a.tipo === 'entrada' ? -1 : 0) - (b.tipo === 'entrada' ? -1 : 0));
  const idBolsa = (i, custo, preco) => {
    if (i.bolsaId) return i.bolsaId;
    const chave = semAcento(i.bolsaNome);
    if (!novasBolsas[chave]) {
      novasBolsas[chave] = novoId();
      ops.push({ col: 'bolsas', id: novasBolsas[chave], dados: { nome: i.bolsaNome.trim(), custo: custo || 0, preco: preco || 0, qtd: 0, obs: '', mini: '', criada: Date.now() } });
    }
    return novasBolsas[chave];
  };
  const idCliente = (i) => {
    if (i.clienteId) return i.clienteId;
    const nome = (i.clienteNome || '').trim();
    if (!nome) return '';
    const ja = clientes().find((c) => semAcento(c.nome) === semAcento(nome));
    if (ja) return ja.id;
    const chave = semAcento(nome);
    if (!novasClientes[chave]) {
      novasClientes[chave] = novoId();
      ops.push({ col: 'clientes', id: novasClientes[chave], dados: { nome, whats: '', obs: '', criada: Date.now() } });
    }
    return novasClientes[chave];
  };
  const nomeDe = (id, i) => D.bolsas[id]?.nome || i.bolsaNome.trim();
  const custoDe = (id, i) => D.bolsas[id]?.custo ?? (i.tipo === 'venda' ? i.custoNovo : i.valor) ?? 0;
  for (const i of ordem) {
    const data = msDe(i.data);
    if (i.tipo === 'entrada') {
      const id = idBolsa(i, i.valor, i.precoVenda);
      ops.push({ col: 'movimentos', id: novoId(), dados: { tipo: 'entrada', bolsaId: id, nome: nomeDe(id, i), qtd: i.qtd, custo: i.valor, preco: 0, data, obs: 'Lançado pela ' + (i.texto ? 'leitura' : 'fala') } });
      ops.push({ col: 'bolsas', id, merge: true, dados: { custo: i.valor, ...(i.precoVenda ? { preco: i.precoVenda } : {}) }, soma: { qtd: i.qtd } });
    } else if (i.tipo === 'venda') {
      const nova = !i.bolsaId;
      const id = idBolsa(i, i.custoNovo, i.valor);
      if (nova) { // vendeu uma que não estava cadastrada: entra e sai, para o estoque e o lucro ficarem certos
        ops.push({ col: 'movimentos', id: novoId(), dados: { tipo: 'entrada', bolsaId: id, nome: nomeDe(id, i), qtd: i.qtd, custo: i.custoNovo, preco: 0, data: data - 1, obs: 'Cadastrada na venda' } });
        ops.push({ col: 'bolsas', id, soma: { qtd: i.qtd } });
      }
      const cid = idCliente(i);
      ops.push({ col: 'movimentos', id: novoId(), dados: {
        tipo: 'venda', bolsaId: id, nome: nomeDe(id, i), qtd: i.qtd, custo: custoDe(id, i), preco: i.valor,
        clienteId: cid, clienteNome: (D.clientes[cid]?.nome || i.clienteNome || '').trim(), pago: i.pago, data, obs: ''
      } });
      ops.push({ col: 'bolsas', id, soma: { qtd: -i.qtd } });
    } else if (i.tipo === 'saida') {
      const id = idBolsa(i, 0, 0);
      ops.push({ col: 'movimentos', id: novoId(), dados: { tipo: 'saida', bolsaId: id, nome: nomeDe(id, i), qtd: i.qtd, custo: custoDe(id, i), preco: 0, data, obs: i.texto || 'Saída' } });
      ops.push({ col: 'bolsas', id, soma: { qtd: -i.qtd } });
    } else if (i.tipo === 'pagamento') {
      // quita as vendas fiado mais antigas até cobrir o valor (vazio = todas)
      let falta = i.valor == null ? Infinity : i.valor;
      const fi = doCliente(i.clienteId).lista.filter((m) => !m.pago && !deveAinda[m.id]).sort((a, b) => a.data - b.data);
      for (const m of fi) {
        if (falta <= 0.009) break;
        ops.push({ col: 'movimentos', id: m.id, merge: true, dados: { pago: true } });
        deveAinda[m.id] = true;
        falta -= m.preco * m.qtd;
      }
    }
  }
  if (!ops.length) return toast('Nada para lançar.', true);
  const n = itens.length;
  await gravar(ops, n === 1 ? 'Lançado!' : `${n} lançamentos feitos`, btn);
}

/* ---------------- fotos ---------------- */
async function lerImagem(arq) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(arq, { imageOrientation: 'from-image' }); } catch {}
  }
  const url = URL.createObjectURL(arq);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

// Reduz a foto para caber no banco: lado maior até `max`, JPEG, abaixando a qualidade até ficar abaixo de `limite` caracteres.
async function comprimir(arq, max, q, limite, quadrado = false) {
  const img = await lerImagem(arq);
  const w = img.width;
  const h = img.height;
  let sx = 0, sy = 0, sw = w, sh = h;
  if (quadrado) { const l = Math.min(w, h); sx = (w - l) / 2; sy = (h - l) / 2; sw = sh = l; }
  let escala = Math.min(1, max / Math.max(sw, sh));
  const c = document.createElement('canvas');
  let url = '';
  for (let i = 0; i < 8; i++) {
    c.width = Math.round(sw * escala);
    c.height = Math.round(sh * escala);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
    url = c.toDataURL('image/jpeg', q);
    if (url.length <= limite) break;
    if (q > 0.5) q -= 0.1; else escala *= 0.8;
  }
  return url;
}

/* ---------------- eventos ---------------- */
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-acao], [data-bolsa], [data-mov], [data-cliente], [data-chip], [data-passo]');
  if (!el) return;
  if (el.dataset.passo) {
    const inp = el.parentElement.querySelector('input');
    const max = parseInt(inp.dataset.max, 10) || Infinity;
    inp.value = Math.min(max, Math.max(1, (parseInt(inp.value, 10) || 0) + Number(el.dataset.passo)));
    inp.closest('form')?.dispatchEvent(new Event('passo'));
    return;
  }
  if (el.dataset.chip) { UI[el.dataset.chip] = el.dataset.v; render(); return; }
  if (el.dataset.bolsa) { folhaBolsa(el.dataset.bolsa); return; }
  if (el.dataset.mov) { folhaMov(el.dataset.mov); return; }
  if (el.dataset.cliente) { folhaCliente(el.dataset.cliente); return; }
  const id = el.dataset.id;
  const acoes = {
    fechar: fecharFolha,
    ajustes: folhaAjustes,
    vender: () => formVenda(),
    'vender-bolsa': () => formVenda(id),
    'vender-cliente': () => formVenda(null, id),
    'nova-bolsa': () => novaBolsa(),
    comprei: formComprei,
    falar,
    caderno,
    'editar-bolsa': () => formBolsa(id),
    'apagar-bolsa': () => apagarBolsa(id),
    entrada: () => formEntrada(id),
    saida: () => formSaida(id),
    compartilhar: () => compartilhar(id),
    pago: () => gravar([{ col: 'movimentos', id, merge: true, dados: { pago: !D.movimentos[id].pago } }], D.movimentos[id].pago ? 'Marcado como não pago' : 'Pagamento recebido'),
    'apagar-mov': () => apagarMov(id),
    'nova-cliente': () => formCliente(),
    'editar-cliente': () => formCliente(id),
    'apagar-cliente': () => apagarCliente(id),
    quitar: () => quitar(id),
    planilha,
    recomecar: () => confirm('Apagar tudo deste navegador e voltar aos dados de exemplo?') && api.recomecar(),
    'ver-esgotadas': () => { UI.filtroBolsas = 'esg'; },
    'ver-vendas': () => { UI.filtroHist = 'venda'; }
  };
  if (!acoes[el.dataset.acao]) return;
  if (el.tagName === 'A' && el.getAttribute('href') === '#') ev.preventDefault();
  acoes[el.dataset.acao]();
});

document.addEventListener('input', (ev) => {
  const k = ev.target.dataset?.busca;
  if (!k) return;
  UI[k] = ev.target.value;
  const pos = ev.target.selectionStart;
  render();
  const novo = document.querySelector(`[data-busca="${k}"]`);
  novo.focus();
  novo.setSelectionRange(pos, pos);
});

// fecha a folha tocando fora dela
folha().addEventListener('click', (ev) => { if (ev.target === folha()) fecharFolha(); });
window.addEventListener('hashchange', () => { fecharFolha(); render(); window.scrollTo(0, 0); });

/* ---------------- início ---------------- */
(async () => {
  try {
    api = await abrir();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = '<div class="carregando">Não consegui abrir. Confira a internet e recarregue a página.</div>';
    return;
  }
  $('#app').innerHTML = '<div class="carregando">Carregando…</div>';
  try {
    await api.carregar();
    D = api.cache;
    render();
  } catch (e) {
    console.error(e);
    $('#app').innerHTML = `<div class="carregando">Não consegui carregar os dados. Confira a internet e abra de novo.<br><small>${esc(e.message)}</small></div>`;
  }
})();
