'use strict';
// Atualização automática (12/11/2026). O GitHub Pages deixa o navegador guardar a página por 10 minutos;
// a cada publicação o GitHub Actions carimba a versão (meta "versao" e versao.json). Ao abrir a tela,
// este script confere a versão publicada e, se mudou, recarrega a página nova.
// Na tela de avaliar só confere ao abrir (para não recarregar no meio do preenchimento).
(function () {
 const eu = document.currentScript;
 const base = eu?.dataset.base || './', sempre = eu?.dataset.sempre !== 'nao';
 const atual = document.querySelector('meta[name="versao"]')?.content || '';
 if (!atual || atual.startsWith('__')) return;   // no computador (sem carimbo) não faz nada
 async function conferir() {
  try {
   const r = await fetch(base + 'versao.json?t=' + Date.now(), { cache: 'no-store' });
   const v = (await r.json()).v;
   if (!v || v === atual) return;
   const u = new URL(location.href);
   if (u.searchParams.get('_v') === v) return;   // já tentou esta versão: evita repetir
   u.searchParams.set('_v', v);
   location.replace(u.toString());
  } catch { /* sem internet: segue com a versão guardada */ }
 }
 conferir();
 if (sempre) document.addEventListener('visibilitychange', () => { if (!document.hidden) conferir(); });
})();
