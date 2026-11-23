// Configuração do portal de bolsas.
//
// Enquanto FB_CFG estiver vazio, o portal roda em "modo demonstração":
// tudo fica só neste navegador, com bolsas de exemplo.
//
// Não tem login: o acesso é pelo link com o código (?c=...). Ver README.

export const NOME = 'Minhas Bolsas';

// Projeto "Minhas Bolsas" (minhas-bolsas-01beo) na conta Google do Carlson.
export const FB_CFG = {
  apiKey: 'AIzaSyDZ5t6oYTbDMoJX_nD_ZXXjvhNLk6XmVrQ',
  authDomain: 'minhas-bolsas-01beo.firebaseapp.com',
  projectId: 'minhas-bolsas-01beo',
  storageBucket: 'minhas-bolsas-01beo.firebasestorage.app',
  messagingSenderId: '516721486667',
  appId: '1:516721486667:web:bfc3ac3445215181d9d6ce'
};

// Endereços onde o portal usa o Firebase. Em qualquer outro, ou sem o código do link, fica em demonstração.
export const FB_HOSTS = ['carlsoncarvjr.github.io', 'localhost'];

// Endereço do servidor da IA (Cloudflare Worker, pasta servidor/): lê o caderno e entende a fala.
// Vazio = em demonstração a leitura é simulada, sem IA.
export const SERVIDOR_URL = 'https://minhas-bolsas.carlsoncarvjr.workers.dev';
