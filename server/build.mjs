import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
const pages=[
 ['/', 'mapa/index.html','text/html'],['/mapa','mapa/index.html','text/html'],['/avaliar','index.html','text/html'],
 ['/libs/leaflet.js','libs/leaflet.js','text/javascript'],['/libs/leaflet.css','libs/leaflet.css','text/css'],['/icone.svg','icone.svg','image/svg+xml'],
 ...['app','form-ui','camera','dates','drive','photos','risk','mapa/app','mapa/data'].map(x=>['/'+x+'.js',x+'.js','text/javascript']),
 ...['style','mapa/style'].map(x=>['/'+x+'.css',x+'.css','text/css'])
];
const source=readFileSync('server/worker.mjs','utf8');
const assets=pages.map(([route,file,type])=>[route,{body:readFileSync('dist/'+file,'utf8'),type:type+'; charset=utf-8'}]);
const fences=JSON.parse(readFileSync('server/data/cercas-usiminas.geojson','utf8'));
mkdirSync('dist/server',{recursive:true});
writeFileSync('dist/server/index.js',source+'\nexport default createWorker(new Map('+JSON.stringify(assets)+'), '+JSON.stringify(fences)+');\n');
