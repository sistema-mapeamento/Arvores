'use strict';
// Fotos inteligentes (12/11/2026): botão "Tirar foto" (abre a câmera traseira no celular) e "Da galeria".
// Cada foto é: virada no sentido certo, reduzida para no máximo 1600 px (fica leve para enviar),
// e recebe uma marca d'água com ID da árvore, data/hora e coordenadas.
// Depois a foto entra no campo original (#treePhotos), e o photos.js continua guardando como antes.
(function () {
 const form = document.getElementById('assessment');
 const original = document.getElementById('treePhotos');
 if (!form || !original) return;
 const MAX_LADO = 1600, QUALIDADE = 0.82, LIMITE = 5;

 // monta os dois botões
 const box = document.createElement('div');
 box.className = 'cam-box';
 const camInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', hidden: true });
 camInput.setAttribute('capture', 'environment');
 const galInput = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', multiple: true, hidden: true });
 const botao = (txt, svg, input, cls) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'cam-btn ' + cls;
  b.innerHTML = svg + '<span>' + txt + '</span>';
  b.addEventListener('click', () => input.click());
  return b;
 };
 const icCam = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>';
 const icGal = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>';
 const status = document.createElement('p');
 status.className = 'cam-status'; status.setAttribute('role', 'status');
 box.append(botao('Tirar foto', icCam, camInput, 'principal'), botao('Da galeria', icGal, galInput, ''), camInput, galInput);
 original.classList.add('cam-escondido');
 original.closest('fieldset').querySelector('label[for="treePhotos"]')?.classList.add('cam-escondido');
 original.after(box, status);

 function contar() { return document.querySelectorAll('#photoPreviews > li').length; }

 async function abrirImagem(file) {
  if ('createImageBitmap' in window) {
   try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch { /* tenta o outro jeito */ }
  }
  return await new Promise((ok, erro) => {
   const img = new Image(), url = URL.createObjectURL(file);
   img.onload = () => { URL.revokeObjectURL(url); ok(img); };
   img.onerror = () => { URL.revokeObjectURL(url); erro(new Error('imagem')); };
   img.src = url;
  });
 }

 function textoMarca() {
  const id = form.elements.treeId?.value.trim() || 'Árvore sem ID';
  const d = new Date(), p = n => String(n).padStart(2, '0');
  const quando = p(d.getDate()) + '/' + p(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  const gps = form.elements.coordinates?.value.trim();
  return [id + '  ·  ' + quando, gps ? 'GPS ' + gps : 'GPS não capturado'];
 }

 async function preparar(file, n) {
  const img = await abrirImagem(file);
  const w0 = img.width, h0 = img.height, esc = Math.min(1, MAX_LADO / Math.max(w0, h0));
  const w = Math.round(w0 * esc), h = Math.round(h0 * esc);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.drawImage(img, 0, 0, w, h);
  img.close?.();
  // marca d'água: faixa escura no rodapé com 2 linhas
  const [l1, l2] = textoMarca(), fs = Math.max(14, Math.round(w / 48)), pad = Math.round(fs * 0.7), alt = fs * 2 + pad * 2.4;
  const grad = g.createLinearGradient(0, h - alt * 1.5, 0, h);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.35, 'rgba(0,0,0,.55)'); grad.addColorStop(1, 'rgba(0,0,0,.72)');
  g.fillStyle = grad; g.fillRect(0, h - alt * 1.5, w, alt * 1.5);
  g.fillStyle = '#fff'; g.textBaseline = 'bottom';
  g.font = '600 ' + fs + 'px "Segoe UI", Arial, sans-serif';
  g.fillText(l1, pad, h - pad - fs * 1.15);
  g.font = '400 ' + Math.round(fs * 0.85) + 'px "Segoe UI", Arial, sans-serif';
  g.fillStyle = 'rgba(255,255,255,.88)';
  g.fillText(l2, pad, h - pad);
  const blob = await new Promise(ok => c.toBlob(ok, 'image/jpeg', QUALIDADE));
  const id = (form.elements.treeId?.value.trim() || 'arvore').replace(/[^\w-]+/g, '_');
  return new File([blob], id + '_foto' + n + '_' + Date.now() + '.jpg', { type: 'image/jpeg', lastModified: Date.now() });
 }

 async function receber(input) {
  const arquivos = Array.from(input.files || []); input.value = '';
  if (!arquivos.length) return;
  const vagas = LIMITE - contar();
  if (vagas <= 0) { status.textContent = 'Limite de ' + LIMITE + ' fotos por avaliação. Remova uma para incluir outra.'; return; }
  const usar = arquivos.slice(0, vagas), prontas = [];
  status.textContent = 'Preparando ' + usar.length + (usar.length > 1 ? ' fotos…' : ' foto…');
  for (const [i, f] of usar.entries()) {
   try { prontas.push(await preparar(f, contar() + i + 1)); }
   catch { status.textContent = 'Não foi possível abrir uma das imagens. Use JPG, PNG ou foto da câmera.'; }
  }
  if (!prontas.length) return;
  const kb = Math.round(prontas.reduce((s, f) => s + f.size, 0) / 1024);
  const dt = new DataTransfer(); prontas.forEach(f => dt.items.add(f));
  original.files = dt.files;
  original.dispatchEvent(new Event('change', { bubbles: true }));
  status.textContent = prontas.length + (prontas.length > 1 ? ' fotos prontas' : ' foto pronta') + ' (' + kb + ' KB, com data, hora e GPS)' + (arquivos.length > vagas ? '. As demais passaram do limite de ' + LIMITE + '.' : '.');
 }
 camInput.addEventListener('change', () => receber(camInput));
 galInput.addEventListener('change', () => receber(galInput));
})();
