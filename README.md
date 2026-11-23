# Minhas Bolsas

Portal simples para controlar a venda de bolsas: foto, quanto pagou, por quanto vende, estoque, vendas, fiado e clientes.
Site estático (HTML, CSS e JS puros, sem build), no mesmo esquema do catálogo B13: GitHub Pages + Firebase no plano gratuito.

## O que tem
Feito para quem é leiga em celular: letra grande, uma coisa por tela, quase nada para digitar.

- **Início**: uma frase com o resumo do mês ("Este mês você vendeu R$ 615 e lucrou R$ 343. Você tem 12 bolsas em casa."), dois botões grandes **Vendi** e **Comprei**, quem está devendo e as últimas vendas.
- **Vendi**: toca na foto da bolsa e em Salvar. Preço já vem preenchido; cliente é opcional (sugere as já cadastradas, cria a nova sozinho); "já pagou" ou "vai pagar depois". Data e anotação ficam escondidas em "Outra data ou anotação".
- **Comprei**: "Uma bolsa nova" abre o cadastro passo a passo (foto, quanto pagou, por quanto vende, quantas, nome opcional: sem nome vira "Bolsa 7"), ou toca numa bolsa que já tem para somar mais unidades.
- **Falar** e **Foto do caderno**: ela fala "vendi a caramelo pra Ana por 150, ela paga depois" ou fotografa a página do caderno. A IA entende e mostra uma tela de conferência (com a foto da bolsa quando ela já está cadastrada) para corrigir ou desmarcar antes de lançar. Precisa do servidor em `servidor/` (passo a passo em `servidor/LEIA-ME.md`); sem ele, em demonstração, a leitura é simulada.
- **Desfazer**: depois de qualquer gravação aparece por 10 segundos uma barra com o botão Desfazer.
- **Bolsas**: galeria com foto e quantidade. Cada bolsa tem Vender, Comprei mais, Saída (presente, defeito, devolução), Enviar foto (abre o compartilhar do celular, ex.: WhatsApp) e Editar.
- **Clientes**: quanto cada uma já comprou e deve, botão de cobrar no WhatsApp com a mensagem pronta e "Recebi tudo".
- **Mais** (a parte "do filho"): números por período (este mês, mês passado, ano, tudo), mais vendidas, histórico completo com filtro e planilha para Excel.

Como o lucro é calculado: preço da venda menos o custo da bolsa **no dia da venda**. Se ela comprar a mesma bolsa mais cara depois, o lucro das vendas antigas não muda. Saídas sem venda (presente, defeito) não entram no lucro, só tiram do estoque.

## Acesso: link com código, sem login
Não tem senha. O portal abre pelo link `https://carlsoncarvjr.github.io/minhas-bolsas/?c=CÓDIGO`.
- O código fica só no arquivo `.segredos` (fora do git) e nas regras publicadas no Firebase. Sem ele, o site abre em **modo demonstração** (dados de exemplo, só no navegador).
- O aparelho guarda o código na primeira vez. No celular, abrir o link e usar **Adicionar à tela de início**.
- Quem tiver o link entra. Se o link vazar, é só gerar outro código em `.segredos` e publicar de novo (passos abaixo); os dados antigos ficam no código antigo e precisam ser copiados.
- `gasto.html?c=CÓDIGO_DO_GASTO` mostra só o gasto da IA (outro código, para o Carlson).

## Publicar
- **Firebase** (projeto `minhas-bolsas-01beo`, conta do Carlson): regras com o código trocado e publicadas por
  `. ./.segredos && sed "s/__CODIGO__/$CODIGO/" firestore.rules > firestore.gerado.rules && firebase deploy --only firestore:rules`
- **Site**: GitHub Pages do repositório `carlsoncarvjr/minhas-bolsas` (branch `main`). Basta dar push.
- **Servidor da IA**: `servidor/` (passo a passo em `servidor/LEIA-ME.md`).

Para testar no Mac: `python3 -m http.server 8010` nesta pasta, abrir http://localhost:8010 (demonstração) ou http://localhost:8010/?c=CÓDIGO (dados de verdade).

## Estrutura no Firestore
Tudo dentro de `lojas/{código}/`:
- `bolsas/{id}`: nome, custo, preco, qtd, obs, mini (miniatura da foto), criada
- `fotos/{id}`: foto grande (mesmo id da bolsa), só carregada quando abre a bolsa
- `movimentos/{id}`: tipo (`entrada`, `venda`, `saida`), bolsa, quantidade, custo e preço do dia, cliente, pago, data, anotação
- `clientes/{id}`: nome, whats, obs

Sem internet, o Firebase guarda o que ela lançar no aparelho e envia quando a conexão voltar.

## Limite do plano grátis
50 mil leituras e 20 mil gravações por dia, 1 GB de dados. Cada bolsa com foto ocupa uns 150 a 500 KB, então dá para alguns milhares de bolsas antes de pensar nisso.
