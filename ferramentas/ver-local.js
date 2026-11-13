// Ver o sistema no computador: node ferramentas/ver-local.js  ->  http://localhost:8790
// Entrega os arquivos de dist/ nas mesmas rotas do Worker e simula as APIs do mapa
// com o histórico de EXEMPLO (ferramentas/exemplo-historico.json). Não fala com o Google.
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const raiz = path.resolve(__dirname, '..'), dist = path.join(raiz, 'dist'), porta = Number(process.argv[2] || 8790);
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const rotas = { '/': 'mapa/index.html', '/mapa': 'mapa/index.html', '/mapa/': 'mapa/index.html', '/avaliar': 'index.html' };
function enviar(res, arq) {
  res.writeHead(200, { 'content-type': (tipos[path.extname(arq)] || 'application/octet-stream') + '; charset=utf-8', 'cache-control': 'no-cache' });
  fs.createReadStream(arq).pipe(res);
}
http.createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (p === '/api/mapa/cercas') return enviar(res, path.join(raiz, 'server/data/cercas-usiminas.geojson'));
  if (p === '/api/mapa/historico') return enviar(res, path.join(raiz, 'ferramentas/exemplo-historico.json'));
  if (p.startsWith('/exemplo-fotos/') && /^\/exemplo-fotos\/[\w-]+\.jpg$/.test(p)) return enviar(res, path.join(raiz, 'ferramentas', p));
  if (p.startsWith('/api/')) { res.writeHead(503, { 'content-type': 'application/json' }); return res.end('{"code":"local"}'); }
  const arq = path.normalize(path.join(dist, rotas[p] || p));
  if (!arq.startsWith(dist) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) { res.writeHead(404); return res.end('Página não encontrada'); }
  enviar(res, arq);
}).listen(porta, () => console.log('Árvores em http://localhost:' + porta));
