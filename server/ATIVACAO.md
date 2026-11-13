# Tela 3 — Mapa das árvores
A avaliação pública continua em / e o mapa em /mapa no mesmo projeto. O mapa só consulta o histórico após login e checagem da lista de e-mails autorizados. A base original continua sendo Historico, no Google Planilhas.

## Ativação do histórico
Em um projeto Google Cloud aprovado pelo titular, ative a Google Sheets API. Crie uma conta de serviço exclusiva para a consulta, sem papéis de acesso ao projeto que não sejam necessários. Compartilhe apenas a planilha de histórico com o e-mail dessa conta, na função Leitor. Não publique a planilha nem altere o Apps Script receptor.
Configure ARVORES_SHEETS_SERVICE_ACCOUNT como segredo do Site, com o JSON da conta de serviço. Alternativamente, registre no Google Cloud o certificado público correspondente à chave privada mantida em ARVORES_SHEETS_PRIVATE_KEY, e configure apenas o endereço da conta em ARVORES_SHEETS_CLIENT_EMAIL. O servidor solicita ao Google somente o escopo spreadsheets.readonly e consulta a aba Historico no ID fixo. A resposta elimina dados de avaliadores e o texto livre de evidências. Não cole credenciais em chat ou no código.
Configure ARVORES_MAP_VIEWERS com os e-mails já autorizados a consultar a tela. Com dados reais, confira leitura automática, sessão anônima bloqueada, conta fora da lista bloqueada e formulário ainda público.
Na configuração separada, ARVORES_SHEETS_KEY_ID pode indicar a chave pública registrada no IAM. Se houver falha de consulta, procure arvores_history nos registros do Worker. O evento identifica a etapa e, quando disponível, o status HTTP do Google; não registra respostas, credenciais nem dados da planilha.
O arquivo MapaHistorico.gs preparado no editor não foi publicado e não é usado neste fluxo.

## Base do Google Maps
A camada visual oficial usa Maps Static API. Configure uma chave do projeto Google Maps autorizada para essa API como segredo ARVORES_GOOGLE_MAPS_KEY. Confirme faturamento, limites e termos com o titular do projeto antes de habilitar a camada. O navegador só recebe a imagem; a chave fica no servidor. Ao ativar a camada, a área visível do mapa é consultada no Google, sem enviar a planilha ou pontos de inspeção. O GeoJSON de vias continua disponível como base alternativa.

## Build e verificação
Execute node server/build.mjs e node server/verify.mjs. O primeiro empacota os arquivos de interface no Worker; o segundo valida rotas, autenticação, contrato da planilha e base de mapa em ambiente simulado. Os testes do formulário continuam em verify*.cjs. Publique somente após validar os serviços do Google e o acesso do proprietário. Não retire o painel antigo antes de confirmar a migração.
