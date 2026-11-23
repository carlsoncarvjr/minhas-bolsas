# Servidor da IA (falar e foto do caderno)

O arquivo `worker.js` roda de graça na Cloudflare, **separado do B13**. Ele guarda a chave da Anthropic, que não pode ficar no site, só atende quem abre o portal pelo link com o código, anota o gasto de cada dia e para a IA quando o mês passa do limite.

Sem ele, o portal funciona normal; os botões "Falar" e "Foto do caderno" ficam em modo simulado (só na demonstração).


## 1. Chave da Anthropic
Usa a mesma conta (e os mesmos créditos) do MontAI e do Troca Flash.
1. console.anthropic.com > API Keys > **Create Key**. Nome: `minhas-bolsas` (uma chave só para isso: dá para ver o gasto separado e cancelar sem afetar os outros apps).
2. Copiar a chave (aparece uma vez só).

Custo aproximado com o modelo padrão (`claude-opus-5-5`): uns R$ 0,05 por frase falada e R$ 0,15 a R$ 0,30 por página de caderno.
Para gastar menos, coloque a variável `MODELO` = `claude-haiku-5-5` (mais barato, pode errar mais na letra à mão).

## 2. Subir o Worker (pelo terminal, nesta pasta)
```bash
npx wrangler login
npx wrangler kv namespace create USO        # copiar o id para o wrangler.toml
npx wrangler deploy
npx wrangler secret put ANTHROPIC_API_KEY   # colar a chave do passo 1
npx wrangler secret put CODIGO              # o CODIGO do arquivo ../.segredos
npx wrangler secret put GASTO_CODIGO        # o GASTO do arquivo ../.segredos
```
O endereço que o deploy mostra (`https://minhas-bolsas.SEUNOME.workers.dev`) vai em `SERVIDOR_URL` no `assets/config.js`.

Limite do mês: `LIMITE_MES_USD` no `wrangler.toml` (padrão US$ 10, uns R$ 56). Passou, a IA para até o mês virar e o portal avisa para lançar pelos botões. Para mudar o modelo: `MODELO = "claude-haiku-5-5"` em `[vars]`.

## 3. Testar
Abrir o portal pelo link, tocar em **Falar** e dizer "comprei duas bolsas pretas a 50 cada". Deve aparecer a tela "Entendi assim" com a compra. Nada é gravado até tocar em "Isso mesmo, lançar".

## Como funciona
- **Falar**: o próprio celular transforma a fala em texto (de graça). O texto vai para o Worker, que pede para a IA entender e devolver os lançamentos. Se o celular não deixar usar o microfone, ela pode tocar no microfone do teclado e ditar.
- **Foto do caderno**: a foto é reduzida no celular e enviada. A IA lê a letra e devolve uma linha por compra, venda, saída ou pagamento, com a frase original embaixo para conferir.
- Em todos os casos aparece a tela de conferência: dá para desmarcar, corrigir bolsa, valor, cliente, data e se pagou. Bolsa ou cliente que não existem são criadas na hora. Venda de bolsa que não estava cadastrada pede "quanto você pagou nela" para o lucro sair certo. Depois de lançar, o botão Desfazer desfaz tudo da leva.
- O Worker só lê: quem grava é o portal.
- Gasto: `gasto.html?c=CÓDIGO_DO_GASTO` mostra o gasto por dia e por mês, em reais, e quanto do limite já foi.
