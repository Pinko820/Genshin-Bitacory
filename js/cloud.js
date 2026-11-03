/* Bitácora Genshin 4 — sincronización opcional. El editor local nunca depende de Firebase. */
const $ = s => document.querySelector(s);
const config = window.BITACORA_FIREBASE_CONFIG || {};
const configured = config.apiKey && config.apiKey !== 'REEMPLAZAR' && config.projectId !== 'REEMPLAZAR';
const feedback = msg => { $('#cloudFeedback').textContent = msg; };
const status = msg => { $('#cloudStatus').textContent = msg; $('#cloudBtn').textContent = '☁ ' + msg; };
const canonical = x => JSON.stringify(window.G.normalize(x));
const uid = () => window.G.uid();
const storeKey = user => `genshin-cloud-v4-${user}`;
const read = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
let bridge, auth, db, storageApi, storageDb, api, user = null, stopListener = null, state = null, busy = false, rerun = false, remoteLoaded = false;
function saveState(){ if(!user || !state)return; try{localStorage.setItem(storeKey(user.uid),JSON.stringify(state));}catch{feedback('No se pudo guardar la cola local. Exporta un respaldo JSON.');} }
function markChanges(chars){
  if(!state || !user)return;
  const current = Object.fromEntries(chars.map(c=>[c.id,canonical(c)]));
  for(const [id,json] of Object.entries(current)) if(state.local[id]!==json){ state.pending[id]={kind:'upsert',value:JSON.parse(json),base:state.known[id]??null}; }
  for(const id of Object.keys(state.local)) if(!(id in current)) state.pending[id]={kind:'delete',base:state.known[id]??null};
  state.local=current;saveState();schedule();
}
window.BitacoraCloud={onLocalSave:chars=>markChanges(chars)};
function displayUser(){const signed=!!user;$('#cloudSignedOut').hidden=signed;$('#cloudSignedIn').hidden=!signed;$('#cloudUser').textContent=signed?(user.email||'Cuenta Google')+' · '+user.uid:'';}
function applyRemote(docs){
  const map=new Map(bridge.get().map(c=>[c.id,c]));
  // Documentos eliminados remotamente se quitan solo si estaban sincronizados y no hay edición local pendiente.
  for(const id of Object.keys(state.known)) if(!docs.has(id)&&!state.pending[id]){map.delete(id);delete state.known[id];}
  for(const [id,doc] of docs){
    if(state.pending[id])continue;
    const remoteJSON=canonical(doc.data);
    if(state.known[id]!==remoteJSON || !map.has(id))map.set(id,JSON.parse(remoteJSON));
    state.known[id]=remoteJSON;
  }
  // Actualiza huellas locales después de aplicar remoto; pendientes conservan su huella anterior.
  const arr=[...map.values()];bridge.apply(arr);
  state.local=Object.fromEntries(arr.map(c=>[c.id,canonical(c)]));saveState();
}
async function connectSession(u){
  if(stopListener){stopListener();stopListener=null;}
  user=u;remoteLoaded=false;displayUser();
  if(!u){state=null;status('Modo local');return;}
  state=read(storeKey(u.uid))||{local:{},known:{},pending:{},conflicts:{}};
  state.local||={};state.known||={};state.pending||={};state.conflicts||={};
  // Primer inicio en cada PC: las fichas locales son candidatas a fusión, no a reemplazo.
  markChanges(bridge.get());
  status('Conectando…');
  const col=api.collection(db,'users',u.uid,'characters');
  stopListener=api.onSnapshot(col,snap=>{
    const docs=new Map(snap.docs.map(d=>[d.id,d.data()]));
    // La primera descarga ocurre antes de subir cualquier cambio local.
    remoteLoaded=true;applyRemote(docs);
    status(navigator.onLine?'Conectado · sincronización activa':'Sin conexión · datos locales');
    schedule();
  },err=>{remoteLoaded=false;status('Error de sincronización');feedback(err.message);});
  const imageCol=api.collection(db,'users',u.uid,'images');
  api.onSnapshot(imageCol,async snap=>{
    for(const d of snap.docs){const meta=d.data();if(!imageMap()[meta.name]?.custom){try{const url=await storageApi.getDownloadURL(storageApi.ref(storageDb,meta.path));const images=imageMap();images[meta.name]={name:meta.name,data:url,storagePath:meta.path,custom:true,updatedAt:meta.updatedAt};localStorage.setItem(IMAGE_KEY,JSON.stringify(images));}catch(e){console.warn('No se pudo recuperar imagen',e);}}}
  },err=>console.warn('Sincronización de metadatos de imágenes',err));
  // Reanuda subidas locales que se hicieron antes de iniciar sesión.
  for(const [name,item] of Object.entries(imageMap())) if(item.custom&&!item.storagePath&&item.data?.startsWith('data:')) {
    try{const path=`users/${u.uid}/images/${encodeURIComponent(name)}`;await storageApi.uploadString(storageApi.ref(storageDb,path),item.data,'data_url');item.storagePath=path;await api.setDoc(api.doc(db,'users',u.uid,'images',encodeURIComponent(name)),{name,path,updatedAt:new Date().toISOString()});const images=imageMap();images[name]=item;localStorage.setItem(IMAGE_KEY,JSON.stringify(images));}catch(e){console.warn('Subida de imagen pendiente',e);}
  }
}
let queueTimer;
function schedule(){clearTimeout(queueTimer);queueTimer=setTimeout(sync,250);}
async function sync(){
  if(busy){rerun=true;return;}
  if(!user||!state||!remoteLoaded||!navigator.onLine)return;
  busy=true;
  try{
    const session=user.uid;
    for(const [id,entry] of Object.entries({...state.pending})){
      if(!user||user.uid!==session)break;
      const ref=api.doc(db,'users',session,'characters',id);
      let conflict=null, applied=false, remoteValue=null;
      await api.runTransaction(db,async tx=>{
        const snap=await tx.get(ref);
        const exists=snap.exists();
        const remote=exists?canonical(snap.data().data):null;
        remoteValue=remote;
        const expected=entry.base;
        if(remote!==expected && !(entry.kind==='upsert'&&remote===canonical(entry.value))){
          conflict=true;return;
        }
        if(entry.kind==='delete'){if(exists)tx.delete(ref);}else tx.set(ref,{data:entry.value,updatedAt:api.serverTimestamp()});
        applied=true;
      });
      // Si hubo edición mientras se ejecutaba la transacción, no borrar la nueva operación.
      if(state.pending[id]!==entry)continue;
      if(conflict){
        state.conflicts[id]={id,kind:entry.kind,local:entry.kind==='upsert'?entry.value:null,remote:remoteValue===null?null:JSON.parse(remoteValue),detectedAt:new Date().toISOString()};
        delete state.pending[id];
        if(remoteValue!==null)state.known[id]=remoteValue;else delete state.known[id];
        renderConflicts();
      }else if(applied){
        delete state.pending[id];
        if(entry.kind==='delete')delete state.known[id];else state.known[id]=canonical(entry.value);
      }
      saveState();
    }
    status('Conectado · sincronización activa');
  }catch(err){status('Pendiente de sincronizar');feedback('Cambios locales conservados. '+err.message);}
  finally{busy=false;if(rerun){rerun=false;schedule();}}
}

function renderConflicts(){
 const host=$('#conflictList'); if(!host)return;
 const items=Object.values(state?.conflicts||{});
 host.innerHTML=items.length?items.map(c=>`<article class="panel"><h3>${window.G.esc(c.local?.nombre||c.remote?.nombre||c.id)}</h3><p>Detectado: ${new Date(c.detectedAt).toLocaleString()}</p><p>Local: ${c.local?'Edición local disponible':'Eliminación local'} · Nube: ${c.remote?'Versión remota disponible':'No existe en nube'}</p><div class="actions">${c.local?`<button class="primary" data-resolve="${c.id}" data-choice="local">Conservar local</button>`:''}${c.remote?`<button class="ghost" data-resolve="${c.id}" data-choice="remote">Conservar nube</button>`:''}</div></article>`).join(''):'<p class="muted">No hay conflictos pendientes.</p>';
}
function resolveConflict(id,choice){
 const c=state?.conflicts?.[id]; if(!c)return;
 // Punto de restauración obligatorio antes de mutar cualquier versión.
 const backup={schema:'genshin-bitacora-backup',version:43,reason:'pre-conflict-resolution',createdAt:new Date().toISOString(),characters:bridge.get(),cloudState:state};
 try{localStorage.setItem(`genshin-restore-${Date.now()}`,JSON.stringify(backup));}catch(e){feedback('No se pudo crear el respaldo. No se aplicó la resolución.');return;}
 let all=bridge.get().filter(x=>x.id!==id);
 if(choice==='local'&&c.local){all.push(c.local);state.pending[id]={kind:'upsert',value:c.local,base:c.remote?canonical(c.remote):null};}
 else if(choice==='remote'&&c.remote){all.push(c.remote);delete state.pending[id];}
 else if(choice==='local'&&!c.local){state.pending[id]={kind:'delete',base:c.remote?canonical(c.remote):null};}
 else if(choice==='remote'&&!c.remote){delete state.pending[id];}
 delete state.conflicts[id];bridge.apply(all);state.local=Object.fromEntries(all.map(x=>[x.id,canonical(x)]));saveState();renderConflicts();schedule();feedback('Resolución aplicada. Se creó un punto de restauración previo.');
}
$('#conflictBtn').onclick=()=>{renderConflicts();$('#conflictDialog').showModal();};
$('#conflictList').onclick=e=>{const b=e.target.closest('[data-resolve]');if(b)resolveConflict(b.dataset.resolve,b.dataset.choice);};
$('#imagesBtn').onclick=()=>$('#imageDialog').showModal();
const IMAGE_KEY='genshin-bitacora-images-v1';
function imageMap(){return read(IMAGE_KEY)||{};}
async function storeImage(name,file){
 if(!file||!file.type.startsWith('image/'))throw new Error('Selecciona un archivo de imagen válido.');
 const data=await new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=reject;r.readAsDataURL(file);});
 const images=imageMap();images[name]={name,data,updatedAt:new Date().toISOString(),custom:true};localStorage.setItem(IMAGE_KEY,JSON.stringify(images));
 if(user&&storageDb){const path=`users/${user.uid}/images/${encodeURIComponent(name)}`;const ref=storageApi.ref(storageDb,path);await storageApi.uploadString(ref,data,'data_url');images[name].storagePath=path;await api.setDoc(api.doc(db,'users',user.uid,'images',encodeURIComponent(name)),{name,path,updatedAt:images[name].updatedAt});localStorage.setItem(IMAGE_KEY,JSON.stringify(images));}
 $('#imageStatus').textContent='Imagen guardada localmente'+(user&&storageDb?' y subida a Firebase Storage.':'. Se subirá al conectar.');return data;
}
window.BitacoraImages={get:name=>imageMap()[name]?.data||catalogImage(name),save:storeImage};
function catalogImage(name){
 // Resolución automática de catálogo: slug estable para recursos públicos y caché persistente al cargar.
 const slug=String(name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_|_$/g,'');
 return slug?`https://api.ambr.top/assets/UI/${slug}.png`: '';
}
$('#saveImage').onclick=async()=>{try{const name=$('#imageCharacter').value.trim();if(!name)throw new Error('Indica el personaje.');const data=await storeImage(name,$('#imageFile').files[0]);$('#imagePreview').innerHTML=`<img alt="Imagen de ${window.G.esc(name)}" src="${data}" style="max-width:100%;max-height:180px">`;}catch(e){$('#imageStatus').textContent=e.message;}};
function downloadBackup(){const payload={schema:'genshin-bitacora',version:4,exportedAt:new Date().toISOString(),personajes:bridge.get()};const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const a=document.createElement('a');a.href=url;a.download='genshin-bitacora-respaldo-'+new Date().toISOString().slice(0,10)+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
$('#cloudBtn').onclick=()=>$('#cloudDialog').showModal();$('#cloudClose').onclick=()=>$('#cloudDialog').close();$('#cloudBackup').onclick=downloadBackup;
$('#cloudSyncNow').onclick=()=>{markChanges(bridge.get());schedule();feedback('Sincronización solicitada.');};
window.addEventListener('online',()=>{if(user){status('Reconectando…');schedule();}});
window.addEventListener('offline',()=>{if(user)status('Sin conexión · datos locales');});
function error(err){feedback((err?.code||'Error')+': '+(err?.message||String(err)));}
async function init(){
  bridge=window.BitacoraBridge;
  if(!bridge)return;
  if(!configured){status('Modo local · configura Firebase');feedback('Configura js/firebase-config.js para activar la nube.');return;}
  try{
    const [app,authentication,firestore,storageApi]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-storage.js')
    ]);
    api={...authentication,...firestore};
    const firebaseApp=app.initializeApp(config);
    auth=authentication.getAuth(firebaseApp);db=firestore.getFirestore(firebaseApp);storageDb=storageApi.getStorage(firebaseApp);
    $('#cloudLogin').onclick=()=>authentication.signInWithEmailAndPassword(auth,$('#cloudEmail').value,$('#cloudPassword').value).catch(error);
    $('#cloudRegister').onclick=()=>authentication.createUserWithEmailAndPassword(auth,$('#cloudEmail').value,$('#cloudPassword').value).catch(error);
    $('#cloudGoogle').onclick=async()=>{try{await authentication.signInWithPopup(auth,new authentication.GoogleAuthProvider());}catch(err){if(err.code==='auth/popup-blocked'||err.code==='auth/operation-not-supported-in-this-environment')authentication.signInWithRedirect(auth,new authentication.GoogleAuthProvider()).catch(error);else error(err);}};
    $('#cloudReset').onclick=()=>authentication.sendPasswordResetEmail(auth,$('#cloudEmail').value).then(()=>feedback('Correo de recuperación solicitado.')).catch(error);
    $('#cloudLogout').onclick=()=>authentication.signOut(auth).catch(error);
    authentication.onAuthStateChanged(auth,connectSession,error);
    status('Esperando inicio de sesión');
  }catch(err){status('Modo local · Firebase no disponible');feedback('La aplicación sigue funcionando sin conexión. '+err.message);}
}
if(window.BitacoraBridge)init();else window.addEventListener('bitacora-ready',init,{once:true});
