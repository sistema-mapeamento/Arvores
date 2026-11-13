# Sistema de Avaliação de Árvores — código-fonte v34

Código correspondente à versão 34 publicada. Revisão Git: `f39e668d0150f409ac30642f803dffcc4e0afcb5`.

## Conteúdo

- `dist/` contém os arquivos editáveis da interface das três telas: Classificar, Identificar e Mapa das Árvores.
- `server/worker.mjs` atende as rotas e verifica o acesso ao mapa e ao histórico. `server/data/cercas-usiminas.geojson` contém os 224 perímetros usados pela Tela 3.
- `integration/` contém os scripts de integração mantidos no código-fonte. A versão publicada lê a planilha pela API do Google Sheets no Worker. O script alternativo `integration/mapa-historico.gs` não faz parte desse fluxo.
- `server/ATIVACAO.md` orienta a configuração do histórico e dos acessos.

## Reconstruir e verificar

Abra o terminal na pasta que contém este arquivo. A reconstrução foi verificada com Node.js 24, sem instalação de pacotes.

```sh
node server/build.mjs
node server/verify.mjs
node verify.cjs
node verify-dates.cjs
node verify-drive.cjs
node verify-two-steps.cjs
```

O primeiro comando gera `dist/server/index.js`, o arquivo de entrada do Worker. Os comandos seguintes verificam a classificação, os fluxos do formulário, as integrações simuladas e a proteção das rotas.

## Operação

O sistema em produção usa o Worker com os serviços de autenticação da hospedagem e a integração com o Google configurados. Ao recuperar a implantação, configure as variáveis no ambiente de destino conforme `server/ATIVACAO.md`. Para apontar para uma cópia da planilha, confira também o identificador da planilha e o contrato da aba `Historico` em `server/worker.mjs`.

A imagem de satélite 2D da Esri é carregada pelo navegador. O GeoJSON dos perímetros é fornecido aos usuários autorizados pelo próprio sistema. Este pacote contém o código e os perímetros, sem credenciais e sem cópia do histórico de inspeções.
