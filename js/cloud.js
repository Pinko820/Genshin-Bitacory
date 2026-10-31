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
let bridge, auth, db, api, user = null, stopListener = null, state = null, busy = false, rerun = false, remoteLoaded = false;
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
  state=read(storeKey(u.uid))||{local:{},known:{},pending:{}};
  state.local||={};state.known||={};state.pending||={};
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
        if(entry.kind==='upsert'){
          const copy=window.G.normalize({...entry.value,id:uid(),nombre:entry.value.nombre+' (conflicto local)'});
          const all=bridge.get().filter(c=>c.id!==id);
          if(remoteValue!==null)all.push(JSON.parse(remoteValue));
          // Preserva la versión remota en el próximo snapshot; nunca la sobreescribimos.
          all.push(copy);bridge.apply(all);
          state.local=Object.fromEntries(all.map(c=>[c.id,canonical(c)]));
          state.pending[copy.id]={kind:'upsert',value:copy,base:null};
        }else{
          // La eliminación entra en conflicto: se conserva la versión de nube.
        }
        delete state.pending[id];
        if(remoteValue!==null)state.known[id]=remoteValue;else delete state.known[id];
        feedback('Conflicto detectado: se conservó la versión de la nube y, si había una edición local, se creó una copia.');
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
    const [app,authentication,firestore]=await Promise.all([
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js'),
      import('https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js')
    ]);
    api={...authentication,...firestore};
    const firebaseApp=app.initializeApp(config);
    auth=authentication.getAuth(firebaseApp);db=firestore.getFirestore(firebaseApp);
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
