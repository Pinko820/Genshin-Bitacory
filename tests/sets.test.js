const fs=require('fs'),vm=require('vm'),assert=require('assert');
function load(dir,files){const w={};w.window=w;w.globalThis=w;w.crypto=require('crypto');vm.createContext(w);
 files.forEach(f=>vm.runInContext(fs.readFileSync(dir+'/'+f,'utf8'),w,{filename:f}));return w;}
const NEW=__dirname+'/..';
const W=load(NEW,['data/razor.js','js/sets.js','js/core.js']),G=W.G,S=W.GSets;
const art=(sets)=>G.slots.map((r,i)=>({ranura:r,nombre:'x',conjunto:sets[i]??''}));
const T=(name,sets,exp)=>{const r=S.compute(art(sets),G.slots);
 for(const [k,v] of Object.entries(exp))assert.strictEqual(JSON.stringify(r[k]),JSON.stringify(v),`${name}: ${k} -> ${JSON.stringify(r[k])}`);console.log('ok',name,r.tipo,r.patron)};
T('5 iguales',Array(5).fill('A'),{tipo:'cuatro_piezas',patron:'5',equipadas:5});
T('4+1',['A','A','A','A','B'],{tipo:'cuatro_piezas',patron:'4+1',sueltas:[{ranura:'Tiara',conjunto:'B'}]});
T('4+0 vacía',['A','A','A','A',''],{tipo:'cuatro_piezas',patron:'4',sinConjunto:['Tiara']});
T('2+2+1',['A','A','B','B','C'],{tipo:'dos_mas_dos',patron:'2+2+1'});
T('3+2',['A','A','A','B','B'],{tipo:'dos_mas_dos',patron:'3+2'});
T('2+1+1+1',['A','A','B','C','D'],{tipo:'dos_piezas'});
T('3+1+1',['A','B','A','C','A'],{tipo:'dos_piezas'});
T('1x5',['A','B','C','D','E'],{tipo:'sin_bono',bonosActivos:[]});
T('vacío',[],{tipo:'sin_bono',patron:'0',equipadas:0});
T('case/acentos/espacios',['Caballería  Sanguinaria','caballeria sanguinaria','CABALLERÍA SANGUINARIA','Bloodstained Chivalry',"Caballeria Sanguinaria "],{tipo:'cuatro_piezas',patron:'5'});
// 4 piezas: ambos bonos
let r=S.compute(art(['A','A','A','A','B']));assert.strictEqual(r.bonosActivos.map(b=>b.piezas).join(),'2,4');
// umbral especial 1 pieza
S.registerSet({nombre:'Oración X',umbrales:[1]});r=S.compute(art(['Oración X','B','C','D','E']));assert.strictEqual(r.bonosActivos.length,1);console.log('ok umbral 1p',r.tipo);
// duplicados de ranura / basura
r=S.compute([{ranura:'Flor',conjunto:'A'},{ranura:'Flor',conjunto:'A'},null,'x',{ranura:'Foo',conjunto:'A'}],G.slots);assert.strictEqual(r.equipadas,1);
// legado
const razor=W.RAZOR_SEED,n=G.normalize(razor);assert.strictEqual(n.conjuntosActivos.tipo,'cuatro_piezas');assert.strictEqual(n.conjuntosActivos.patron,'5');
assert.strictEqual(n.artefactos[0].conjunto,'Caballería Sanguinaria');console.log('ok Razor v1/v2 seed ->',S.summary(n.conjuntosActivos));
const noArts=G.normalize({nombre:'Z'});assert.strictEqual(noArts.conjuntosActivos.tipo,'sin_bono');
const weird=G.normalize({nombre:'Z',artefactos:'basura'});assert.strictEqual(weird.conjuntosActivos.equipadas,0);
// valor entrante obsoleto se ignora
const stale=G.normalize({...razor,conjuntosActivos:{tipo:'sin_bono',patron:'FAKE'}});assert.strictEqual(stale.conjuntosActivos.patron,'5');
// idempotencia y JSON seguro (sin undefined, sin arrays anidados)
const again=G.normalize(JSON.parse(JSON.stringify(n)));assert.strictEqual(JSON.stringify(again.conjuntosActivos),JSON.stringify(n.conjuntosActivos));
assert.strictEqual(JSON.stringify(G.normalize(n)),JSON.stringify(n));
const noNested=v=>{if(Array.isArray(v)){v.forEach(x=>assert(!Array.isArray(x)));v.forEach(noNested)}else if(v&&typeof v==='object')Object.values(v).forEach(x=>{assert(x!==undefined);noNested(x)})};noNested(n);console.log('ok idempotente + Firestore-safe');
assert.ok(G.markdown(n).includes('## Conjuntos de artefactos')&&G.markdown(n).includes('Daño Físico'));
const d=G.defaults();assert.strictEqual(d.conjuntosActivos.tipo,'sin_bono');
console.log('TODO OK');
