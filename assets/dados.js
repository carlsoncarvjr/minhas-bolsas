// Camada de dados. O mesmo conjunto de funções roda em dois modos:
// - demo: tudo no localStorage, com bolsas de exemplo
// - firebase: Firestore no plano gratuito, dentro de lojas/{código do link}
//
// Coleções:
//   bolsas/{id}      nome, custo, preco, qtd, obs, mini (miniatura), criada
//   fotos/{id}       img (foto grande da bolsa, mesmo id da bolsa)
//   movimentos/{id}  tipo (entrada | venda | saida), bolsaId, nome, qtd, custo, preco,
//                    clienteId, clienteNome, pago, data, obs
//   clientes/{id}    nome, whats, obs, criada
//
// bolsas, movimentos e clientes ficam todos em memória (cache) depois do carregamento.
// As fotos grandes só são lidas quando alguém abre a bolsa.
import { FB_CFG, FB_HOSTS } from './config.js';

// O código vem no link (?c=...) e fica guardado no aparelho para as próximas vezes.
function lerCodigo() {
  const daUrl = new URLSearchParams(location.search).get('c');
  try {
    if (daUrl) localStorage.setItem('bolsas-codigo', daUrl);
    return daUrl || localStorage.getItem('bolsas-codigo') || '';
  } catch { return daUrl || ''; }
}
export const codigo = /^[A-Za-z0-9]{20,}$/.test(lerCodigo()) ? lerCodigo() : '';
export const modo = FB_CFG && codigo && FB_HOSTS.includes(location.hostname) ? 'firebase' : 'demo';
const CACHE = ['bolsas', 'movimentos', 'clientes'];

export const novoId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

// Aplica uma lista de operações num objeto { colecao: { id: doc } }.
// op: { col, id, dados, merge?, soma?: { campo: n } }  ou  { col, id, apagar: true }
function aplicar(alvo, ops) {
  for (const op of ops) {
    if (!alvo[op.col]) continue;
    const c = alvo[op.col];
    if (op.apagar) { delete c[op.id]; continue; }
    const base = op.merge || op.soma ? { ...(c[op.id] || {}) } : {};
    Object.assign(base, op.dados || {});
    for (const [k, n] of Object.entries(op.soma || {})) base[k] = (Number(base[k]) || 0) + n;
    c[op.id] = { ...base, id: op.id };
  }
}

const limpo = (o) => Object.fromEntries(Object.entries(o || {}).filter(([k, v]) => v !== undefined && k !== 'id'));

let api;
export async function abrir() {
  if (!api) api = modo === 'firebase' ? await firebaseApi() : demoApi();
  return api;
}

/* ---------------- modo demonstração ---------------- */
function demoApi() {
  const KEY = 'bolsas-demo-v1';
  let s;
  try { s = JSON.parse(localStorage.getItem(KEY)); } catch { s = null; }
  if (!s) s = exemplo();
  const salvar = () => localStorage.setItem(KEY, JSON.stringify(s));
  salvar();
  const cache = { bolsas: s.bolsas, movimentos: s.movimentos, clientes: s.clientes };

  return {
    modo: 'demo',
    cache,
    async carregar() { return cache; },
    async foto(id) { return s.fotos[id]?.img || null; },
    async grava(ops) {
      const antes = JSON.stringify(s);
      aplicar(s, ops);
      try { salvar(); }
      catch {
        s = JSON.parse(antes);
        Object.assign(cache, { bolsas: s.bolsas, movimentos: s.movimentos, clientes: s.clientes });
        throw new Error('O modo demonstração guarda pouca coisa no navegador (fotos ocupam espaço). Com o Firebase ligado esse limite some.');
      }
      Object.assign(cache, { bolsas: s.bolsas, movimentos: s.movimentos, clientes: s.clientes });
    },
    recomecar() { localStorage.removeItem(KEY); location.reload(); }
  };
}

/* ---------------- Firebase ---------------- */
async function firebaseApi() {
  const V = '10.12.2';
  const base = `https://www.gstatic.com/firebasejs/${V}/`;
  const [A, F] = await Promise.all([
    import(base + 'firebase-app.js'),
    import(base + 'firebase-firestore.js')
  ]);
  const app = A.initializeApp(FB_CFG);
  let db;
  try {
    // guarda uma cópia no aparelho: abre rápido e aguenta sinal fraco
    db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
  } catch {
    db = F.getFirestore(app);
  }
  const { doc, collection, getDoc, getDocs, writeBatch, increment } = F;
  const cache = { bolsas: {}, movimentos: {}, clientes: {} };

  return {
    modo: 'firebase',
    cache,
    async carregar() {
      const listas = await Promise.all(CACHE.map((c) => getDocs(collection(db, 'lojas', codigo, c))));
      CACHE.forEach((c, i) => { cache[c] = Object.fromEntries(listas[i].docs.map((d) => [d.id, { id: d.id, ...d.data() }])); });
      return cache;
    },
    async foto(id) {
      const d = await getDoc(doc(db, 'lojas', codigo, 'fotos', id));
      return d.exists() ? d.data().img : null;
    },
    async grava(ops) {
      const b = writeBatch(db);
      for (const op of ops) {
        const ref = doc(db, 'lojas', codigo, op.col, op.id);
        if (op.apagar) { b.delete(ref); continue; }
        const d = limpo(op.dados);
        for (const [k, n] of Object.entries(op.soma || {})) d[k] = increment(n);
        b.set(ref, d, { merge: !!(op.merge || op.soma) });
      }
      // Sem internet o Firestore guarda a gravação no aparelho e envia depois,
      // mas a promessa só termina quando o servidor responde. Espera até 6 s.
      const envio = b.commit();
      const r = await Promise.race([envio.then(() => 'ok'), new Promise((ok) => setTimeout(() => ok('espera'), 6000))]);
      aplicar(cache, ops);
      if (r === 'espera') {
        envio.catch((e) => console.error('Gravação recusada pelo servidor', e));
        return { pendente: true };
      }
    }
  };
}

function traduz(e) {
  const c = e?.code || '';
  if (c.includes('invalid-credential') || c.includes('wrong-password') || c.includes('user-not-found')) return 'E-mail ou senha não conferem.';
  if (c.includes('invalid-email')) return 'Esse e-mail não parece certo.';
  if (c.includes('too-many-requests')) return 'Muitas tentativas. Espere um pouco e tente de novo.';
  if (c.includes('network')) return 'Sem internet. Confira a conexão.';
  return 'Não deu certo: ' + (e?.message || c);
}

/* ---------------- dados de exemplo ---------------- */
function desenho(cor, alca) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 300"><rect width="300" height="300" fill="#f3ece4"/><path d="M110 120 C110 70 190 70 190 120" fill="none" stroke="${alca}" stroke-width="12" stroke-linecap="round"/><rect x="62" y="115" width="176" height="130" rx="22" fill="${cor}"/><rect x="62" y="150" width="176" height="10" fill="rgba(0,0,0,.12)"/><circle cx="150" cy="160" r="9" fill="#e8c77d"/></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function exemplo() {
  const dia = 864e5;
  const agora = Date.now();
  const bolsas = {};
  const fotos = {};
  const movimentos = {};
  const clientes = {};
  const B = [
    ['Tote caramelo couro', 89, 189, 4, '#b5793f', '#7a4a20'],
    ['Transversal preta pequena', 45, 99, 0, '#2d2a2b', '#111'],
    ['Bolsa saco off-white', 70, 159, 2, '#e9e0d2', '#b9ab95'],
    ['Clutch dourada festa', 38, 89, 3, '#d9b45a', '#a07d2a'],
    ['Mochila nylon verde', 55, 129, 1, '#4f6b4a', '#2f432b'],
    ['Baú vermelha', 62, 139, 2, '#a3322d', '#6d1f1b']
  ];
  const C = [['Ana Paula', '73999990001'], ['Dona Célia', '73999990002'], ['Juliana (trabalho)', '73999990003']];
  C.forEach(([nome, whats], i) => { const id = 'c' + i; clientes[id] = { id, nome, whats, obs: '', criada: agora - 50 * dia }; });

  let n = 0;
  const mov = (m) => { const id = 'm' + ++n; movimentos[id] = { id, ...m }; };
  B.forEach(([nome, custo, preco, sobra, cor, alca], i) => {
    const id = 'b' + i;
    const vendidas = [2, 3, 1, 1, 2, 0][i];
    const comprou = sobra + vendidas;
    const img = desenho(cor, alca);
    bolsas[id] = { id, nome, custo, preco, qtd: sobra, obs: '', mini: img, criada: agora - 55 * dia };
    fotos[id] = { img };
    mov({ tipo: 'entrada', bolsaId: id, nome, qtd: comprou, custo, preco: 0, data: agora - (55 - i) * dia, obs: 'Cadastro' });
    for (let k = 0; k < vendidas; k++) {
      const c = (i + k) % 3;
      mov({
        tipo: 'venda', bolsaId: id, nome, qtd: 1, custo, preco: k === 1 ? preco - 10 : preco,
        clienteId: 'c' + c, clienteNome: C[c][0], pago: !(i === 0 && k === 1),
        data: agora - (40 - i * 6 - k * 3) * dia, obs: ''
      });
    }
  });
  return { bolsas, fotos, movimentos, clientes };
}
