// Ver o sistema no computador: node ferramentas/ver-local.js  ->  http://localhost:8790
// Entrega a pasta dist/ igual ao GitHub Pages. Dados reais do banco; para dados de exemplo use http://localhost:8790/?exemplo
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const dist = path.resolve(__dirname, '..', 'dist'), porta = Number(process.argv[2] || 8790);
const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.geojson': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.txt': 'text/plain' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let arq = path.normalize(path.join(dist, p));
  if (!arq.startsWith(dist)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(arq) && fs.statSync(arq).isDirectory()) {
    if (!p.endsWith('/')) { res.writeHead(301, { location: p + '/' + (req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '') }); return res.end(); }
    arq = path.join(arq, 'index.html');
  }
  if (!fs.existsSync(arq)) { res.writeHead(404); return res.end('Página não encontrada'); }
  res.writeHead(200, { 'content-type': (tipos[path.extname(arq)] || 'application/octet-stream') + '; charset=utf-8', 'cache-control': 'no-cache' });
  fs.createReadStream(arq).pipe(res);
}).listen(porta, () => console.log('Árvores em http://localhost:' + porta));
