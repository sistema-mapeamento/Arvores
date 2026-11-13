(function(root){
 'use strict';
 const pad=n=>String(n).padStart(2,'0');
 function isoDate(value){
  const text=String(value||'').trim();let m=/^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(text),year,month,day;
  if(m){[,year,month,day]=m;}else{m=/^(\d{2})\/(\d{2})\/(\d{4})$/.exec(text);if(!m)return '';[,day,month,year]=m;}
  const d=new Date(Number(year),Number(month)-1,Number(day));
  return d.getFullYear()===+year&&d.getMonth()+1===+month&&d.getDate()===+day?`${year}-${pad(month)}-${pad(day)}`:'';
 }
 function formatDate(value){const date=isoDate(value);return date?date.slice(8,10)+'/'+date.slice(5,7)+'/'+date.slice(0,4):String(value||'');}
 function formatDateTime(value){
  const text=String(value||''),date=isoDate(text.split(/[T ]/)[0]);
  const time=text.match(/[T ](\d{2}:\d{2})/);
  return date?formatDate(date)+(time?' '+time[1]:''):text;
 }
 const api={isoDate,formatDate,formatDateTime};
 if(typeof module!=='undefined'&&module.exports){module.exports=api;return;}
 root.TreeDates=api;
 const months=['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
 const popup=document.createElement('div');popup.className='calendar-popup';popup.hidden=true;popup.setAttribute('role','dialog');popup.setAttribute('aria-label','Selecionar data');document.body.append(popup);
 let active=null,view=null;
 function close(){popup.hidden=true;if(active)active.button.setAttribute('aria-expanded','false');}
 function position(){const r=active.button.getBoundingClientRect();popup.style.top=(r.bottom+window.scrollY+7)+'px';popup.style.left=Math.max(8,Math.min(r.right+window.scrollX-300,window.scrollX+window.innerWidth-308))+'px';}
 function render(){
  const year=view.getFullYear(),month=view.getMonth(),selected=isoDate(active.input.value);
  const count=new Date(year,month+1,0).getDate(),first=new Date(year,month,1).getDay();
  popup.innerHTML=`<div class="calendar-head"><button type="button" data-month="-1" aria-label="Mês anterior">‹</button><strong>${months[month]} ${year}</strong><button type="button" data-month="1" aria-label="Próximo mês">›</button></div><div class="calendar-week">${['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'].map(x=>`<span>${x}</span>`).join('')}</div><div class="calendar-days">${'<span></span>'.repeat(first)}${Array.from({length:count},(_,i)=>{const date=`${year}-${pad(month+1)}-${pad(i+1)}`;return `<button type="button" data-date="${date}" aria-label="${formatDate(date)}" ${date===selected?'aria-pressed="true"':''}>${i+1}</button>`;}).join('')}</div><div class="calendar-foot"><button type="button" data-today>Hoje</button><button type="button" data-close>Fechar</button></div>`;
 }
 function sync(widget){
  const iso=isoDate(widget.input.value);widget.input.setCustomValidity(widget.input.value&&!iso?'Informe uma data válida em DD/MM/AAAA.':'');
  const time=widget.time?.value||'';widget.hidden.value=iso&&(widget.time?/^([01]\d|2[0-3]):[0-5]\d$/.test(time):true)?iso+(widget.time?'T'+time:''):'';
 }
 const widgets=[];
 document.querySelectorAll('[data-date-field]').forEach(el=>{
  const widget={hidden:el.querySelector('input[type=hidden]'),input:el.querySelector('[data-date-text]'),button:el.querySelector('[data-open-calendar]'),time:el.querySelector('[data-time-text]')};widgets.push(widget);
  widget.input.addEventListener('input',()=>sync(widget));widget.time?.addEventListener('input',()=>sync(widget));
  widget.input.addEventListener('blur',()=>{const iso=isoDate(widget.input.value);if(iso)widget.input.value=formatDate(iso);});
  widget.button.addEventListener('click',()=>{if(active===widget&&!popup.hidden){close();return;}close();active=widget;view=new Date((isoDate(widget.input.value)||isoDate(new Date().getFullYear()+'-'+pad(new Date().getMonth()+1)+'-'+pad(new Date().getDate())))+'T12:00');render();popup.hidden=false;widget.button.setAttribute('aria-expanded','true');position();popup.querySelector('[aria-pressed=true], [data-date]')?.focus();});
 });
 popup.addEventListener('click',event=>{
  const target=event.target.closest('button');if(!target)return;
  if(target.dataset.month){view=new Date(view.getFullYear(),view.getMonth()+Number(target.dataset.month),1);render();return;}
  if(target.hasAttribute('data-close')){close();active.input.focus();return;}
  const date=target.dataset.date||(target.hasAttribute('data-today')?`${new Date().getFullYear()}-${pad(new Date().getMonth()+1)}-${pad(new Date().getDate())}`:'');
  if(date){active.input.value=formatDate(date);sync(active);active.input.dispatchEvent(new Event('input',{bubbles:true}));close();active.input.focus();}
 });
 document.addEventListener('pointerdown',event=>{if(!popup.contains(event.target)&&!event.target.closest('[data-open-calendar]'))close();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!popup.hidden){close();active.button.focus();}});
 window.addEventListener('resize',()=>{if(!popup.hidden)position();});
 api.syncAll=()=>widgets.forEach(sync);
 api.loadAll=()=>widgets.forEach(widget=>{const iso=isoDate(widget.hidden.value);widget.input.value=iso?formatDate(iso):'';if(widget.time)widget.time.value=widget.hidden.value.match(/T(\d{2}:\d{2})/)?.[1]||'';sync(widget);});
})(typeof window!=='undefined'?window:globalThis);
