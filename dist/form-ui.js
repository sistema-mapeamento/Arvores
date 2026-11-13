'use strict';
// Camada de tela do formulário (12/11/2026): troca as listas por botões, gera o ID da árvore
// e prepara "nova avaliação" / "reavaliar". NÃO muda a regra de classificação (risk.js / app.js):
// cada botão só escolhe o valor da lista original, que continua no formulário (escondida).
(function () {
 const form = document.getElementById('assessment');
 if (!form) return;
 const CURTO = {
  f: { 1: 'Improvável', 2: 'Possível', 3: 'Provável', 4: 'Iminente' },
  e: { 1: 'Ocasional', 2: 'Frequente', 3: 'Contínua' },
  c: { 1: 'Baixa', 2: 'Média', 3: 'Alta', 4: 'Crítica' }
 };
 const TIPO = { pessoas: 'Pessoas', fixo: 'Instalação fixa', movel: 'Veículo / equipamento' };
 const grupos = [];

 function botoes(name, estilo) {
  const sel = form.elements[name];
  if (!sel || sel.tagName !== 'SELECT') return;
  const box = document.createElement('div');
  box.className = 'opts opts-' + name + ' opts-' + estilo;
  box.setAttribute('role', 'radiogroup');
  for (const o of sel.options) {
   if (!o.value) continue;
   const b = document.createElement('button');
   b.type = 'button'; b.dataset.v = o.value; b.setAttribute('role', 'radio');
   if (estilo === 'code') {
    const t = document.createElement('b'); t.textContent = name.toUpperCase() + o.value;
    const s = document.createElement('small'); s.textContent = CURTO[name][o.value];
    b.append(t, s);
   } else b.textContent = name === 'targetType' ? TIPO[o.value] || o.text : o.text;
   b.addEventListener('click', () => {
    if (b.disabled) return;
    sel.value = o.value;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
    sync();
   });
   box.append(b);
  }
  sel.classList.add('enhanced'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
  sel.after(box);
  grupos.push([sel, box]);
 }
 function sync() {
  for (const [sel, box] of grupos) {
   for (const b of box.children) {
    const opt = [...sel.options].find(o => o.value === b.dataset.v);
    b.setAttribute('aria-checked', String(sel.value === b.dataset.v));
    b.disabled = !!opt?.disabled;
   }
   box.classList.toggle('invalid', sel.getAttribute('aria-invalid') === 'true');
  }
 }

 botoes('targetType', 'chip');
 botoes('target', 'grid');
 botoes('f', 'code');
 botoes('e', 'code');
 botoes('c', 'code');
 botoes('component', 'chip');
 botoes('inspectionReason', 'chip');

 // alcance verificado: caixinha vira um botão de confirmação
 const reach = form.elements.reach;
 if (reach) reach.closest('label')?.classList.add('confirma');

 // ID da árvore gerado automaticamente (dá para editar se a árvore já tiver placa)
 const id = form.elements.treeId;
 // 13/11: sequência ARV-00001, ARV-00002... O banco mostra o próximo número livre e confirma na hora de gravar
 // (se outro celular pegou o mesmo, recebe o seguinte). Sem internet: usa o último número visto + 1.
 const CFG = window.ARVORES_CONFIG || {}, ULTIMO = 'arvores-proximo-id';
 const formatar = n => 'ARV-' + String(n).padStart(5, '0');
 function provisorio() { try { const v = localStorage.getItem(ULTIMO); if (/^ARV-\d{5}$/.test(v || '')) return v; } catch { /* nada */ } return 'ARV-00001'; }
 let pedido = 0;
 function novoId() {
  const meu = ++pedido;
  form.dataset.idAuto = '1';
  if (CFG.supabaseUrl) fetch(CFG.supabaseUrl + '/rest/v1/rpc/proximo_id_arvore', { method: 'POST', headers: { apikey: CFG.supabaseAnonKey, Authorization: 'Bearer ' + CFG.supabaseAnonKey, 'Content-Type': 'application/json' }, body: '{}' })
   .then(r => r.ok ? r.json() : null).then(v => {
    if (!/^ARV-\d{5}$/.test(v || '')) return;
    try { localStorage.setItem(ULTIMO, v); } catch { /* nada */ }
    if (meu === pedido && form.dataset.idAuto === '1') setId(v);
   }).catch(() => { /* sem internet: fica o provisório */ });
  return provisorio();
 }
 function setId(v) { id.value = v; id.dispatchEvent(new Event('input', { bubbles: true })); }
 // número gravado: o próximo provisório passa a ser o seguinte
 window.addEventListener('arvore-registrada', e => {
  const m = /^ARV-(\d{5})$/.exec(e.detail?.arvore_id || ''); if (!m) return;
  try { const atual = /^ARV-(\d{5})$/.exec(localStorage.getItem(ULTIMO) || ''); if (!atual || +atual[1] <= +m[1]) localStorage.setItem(ULTIMO, formatar(+m[1] + 1)); } catch { /* nada */ }
 });
 const editar = document.createElement('button');
 editar.type = 'button'; editar.className = 'id-edit'; editar.textContent = 'Editar';
 editar.addEventListener('click', () => { id.readOnly = !id.readOnly; if (!id.readOnly) form.dataset.idAuto = ''; editar.textContent = id.readOnly ? 'Editar' : 'Pronto'; if (!id.readOnly) id.select(); });
 const dica = document.createElement('small');
 dica.className = 'id-hint'; dica.textContent = 'Número em sequência (ARV-00001…), confirmado pelo banco ao enviar. Edite só se a árvore já tiver placa.';
 id.readOnly = true;
 id.parentElement.classList.add('id-field');
 id.after(editar);
 editar.after(dica);

 // chegada pelo mapa: ?nova=1 (árvore nova) ou ?arvore=ID (reavaliar)
 const params = new URLSearchParams(location.search);
 const nova = params.has('nova'), arvore = params.get('arvore');
 if (nova || arvore) {
  document.getElementById('newButton')?.click();
  if (arvore) form.dataset.idAuto = '';
  setId(arvore ? arvore.slice(0, 100) : novoId());
  for (const n of ['coordinates', 'species']) { form.elements[n].value = ''; form.elements[n].dispatchEvent(new Event('input', { bubbles: true })); }
  if (nova) { form.elements.component.value = ''; form.elements.component.dispatchEvent(new Event('change', { bubbles: true })); }
  history.replaceState(null, '', location.pathname);
  if (navigator.geolocation) document.getElementById('captureCoordinates')?.click();
  setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 450);
 } else if (!id.value.trim()) setId(novoId());

 form.addEventListener('input', () => setTimeout(sync));
 form.addEventListener('change', () => setTimeout(sync));
 document.addEventListener('click', () => setTimeout(sync));
 sync();
})();
