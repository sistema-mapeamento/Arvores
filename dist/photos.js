(function(){
 'use strict';
 const input=document.getElementById('treePhotos'), list=document.getElementById('photoPreviews'), status=document.getElementById('photoStatus');
 const maxFiles=5,maxBytes=10*1024*1024,types=new Set(['image/jpeg','image/png','image/webp']);
 let photos=[],urls=[],revision=0,dirty=false,pending=null,dbPromise;
 function db(){
  if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
   const request=indexedDB.open('arvores-fotos-v1',1);
   request.onupgradeneeded=()=>request.result.createObjectStore('registros');
   request.onsuccess=()=>resolve(request.result);
   request.onerror=()=>reject(request.error);
   request.onblocked=()=>reject(new Error('Banco de fotos bloqueado'));
  }).catch(error=>{dbPromise=null;throw error;});
  return dbPromise;
 }
 async function transact(mode,action){
  const connection=await db();
  return new Promise((resolve,reject)=>{
   const tx=connection.transaction('registros',mode);
   const request=action(tx.objectStore('registros'));
   tx.oncomplete=()=>resolve(request.result);
   tx.onabort=tx.onerror=()=>reject(tx.error);
  });
 }
 function render(){
  for(const url of urls)URL.revokeObjectURL(url);
  urls=[];
  list.replaceChildren(...photos.map((file,index)=>{
   const url=URL.createObjectURL(file);urls.push(url);
   const card=document.createElement('li'),a=document.createElement('a'),img=document.createElement('img'),remove=document.createElement('button');
   img.src=url;img.alt='';a.href=url;a.download=file.name;a.setAttribute('aria-label','Baixar '+file.name);a.append(img,document.createTextNode(file.name));
   remove.type='button';remove.className='secondary';remove.textContent='Remover';remove.setAttribute('aria-label','Remover '+file.name);
   remove.addEventListener('click',()=>{photos.splice(index,1);dirty=true;status.textContent='Salve a avaliação para aplicar a remoção.';render();});
   card.append(a,remove);return card;
  }));
 }
 input.addEventListener('change',()=>{
  const added=Array.from(input.files),errors=[];
  input.value='';
  for(const file of added){
   if(!types.has(file.type)||!file.size||file.size>maxBytes){errors.push('Use JPG, PNG ou WebP de até 10 MB por foto.');continue;}
   if(photos.some(p=>p.name===file.name&&p.size===file.size&&p.lastModified===file.lastModified))continue;
   if(photos.length>=maxFiles){errors.push('Limite de 5 fotos por avaliação.');break;}
   photos.push(file);dirty=true;
  }
  status.textContent=[...new Set(errors)].join(' ')|| (dirty?'Salve a avaliação para guardar as fotos neste navegador.':'');
  render();
 });
 async function load(id){
  const token=++revision;
  photos=[];dirty=false;input.value='';input.disabled=!!id;status.textContent='';render();
  if(!id){pending=null;return;}
  pending=(async()=>{
   try{const saved=await transact('readonly',store=>store.get(id));if(token===revision){photos=saved||[];render();}}
   catch{if(token===revision)status.textContent='Não foi possível ler as fotos neste navegador.';}
   finally{if(token===revision){input.disabled=false;pending=null;}}
  })();
  await pending;
 }
 async function save(id){
  if(pending)await pending;
  if(!dirty)return;
  const token=revision,snapshot=photos.slice();
  await transact('readwrite',store=>snapshot.length?store.put(snapshot,id):store.delete(id));
  if(token===revision){dirty=false;status.textContent=snapshot.length?'Fotos salvas neste navegador.':'Fotos removidas deste registro.';}
 }
 async function remove(id){await transact('readwrite',store=>store.delete(id));}
 window.TreePhotos={load,save,remove};
})();
