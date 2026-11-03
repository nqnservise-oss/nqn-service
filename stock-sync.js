/* Shared inventory. Install after the existing cloud and local inventory hooks. */
window.installStockSync = function () {
  'use strict';
  const SEED='nqn_stock_cloud_seed_v1', BACKUP='nqn_stock_before_cloud_v1';
  const localSave=window.saveStock, baseBoot=window.bootstrapCloudQueue;
  const baseApply=window.applyCloudState, baseReflected=window.opReflected;
  const baseRefresh=window.refreshViewAfterCloudSync;
  const stamp=()=>new Date().toISOString();
  const opId=()=>crypto.randomUUID();
  function enqueue(changes) {
    if(!changes.length)return;
    window.setCloudQueue(window.cloudQueue().concat(changes));
    window.updateNetworkStatus();window.cloudAutoSyncSoon();
  }
  function operation(item, data) {
    return {opId:opId(),type:'stockChange',entity:'stock',id:String(item.id),at:stamp(),data};
  }
  function seed() {
    if(localStorage.getItem(SEED))return;
    const rows=window.loadStock();
    // Keep the original device inventory even after shared data is received.
    if(localStorage.getItem(BACKUP)===null)localStorage.setItem(BACKUP,JSON.stringify(rows));
    const pending=new Set(window.cloudQueue().filter(x=>x.entity==='stock'&&x.data?.seed).map(x=>String(x.id)));
    enqueue(rows.filter(x=>!pending.has(String(x.id))).map(item=>operation(item,{seed:true,item})));
    localStorage.setItem(SEED,'1');
  }
  window.bootstrapCloudQueue=function(){seed();return baseBoot.apply(this,arguments)};
  window.saveStock=function(rows){
    seed();
    const before=window.loadStock(), old=new Map(before.map(x=>[String(x.id),x]));
    const next=new Map(rows.map(x=>[String(x.id),x])), changes=[];
    next.forEach((item,id)=>{
      const prev=old.get(id);
      if(!prev||['cantidad','nombre','minimo','costo'].some(k=>item[k]!==prev[k])){
        changes.push(operation(item,{item,delta:Number(item.cantidad||0)-Number(prev?.cantidad||0)}));
      }
    });
    old.forEach((item,id)=>{if(!next.has(id))changes.push(operation(item,{item,delta:0,deleted:true}))});
    // Persist the outgoing operations before the local inventory changes.
    enqueue(changes);
    return localSave(rows);
  };
  window.opReflected=function(op,state){
    if(op.entity!=='stock')return baseReflected.apply(this,arguments);
    return Array.isArray(state?.stock)&&state.stock.some(x=>String(x.id)===String(op.id)&&Array.isArray(x.stockOps)&&x.stockOps.includes(String(op.opId)));
  };
  window.applyCloudState=function(state,pending=[]){
    baseApply.apply(this,arguments);
    // Older backends omit stock: never interpret that as an empty inventory.
    if(!Array.isArray(state?.stock))return;
    seed();
    const ops=window.cloudQueue().filter(x=>x.entity==='stock');
    const ids=new Set(ops.map(x=>String(x.id)));
    const map=new Map(state.stock.filter(x=>!x.deleted).map(x=>[String(x.id),x]));
    // Keep unsent edits and offline consumption until the server acknowledges them.
    const local=new Map(window.loadStock().map(x=>[String(x.id),x]));
    ids.forEach(id=>{if(local.has(id))map.set(id,local.get(id));else map.delete(id)});
    localSave([...map.values()]);
  };
  window.refreshViewAfterCloudSync=function(){
    baseRefresh.apply(this,arguments);
    // Refresh counts without rebuilding a form the operator may be filling in.
    if(document.getElementById('stockTableBox'))window.filterStockTable();
    const picker=document.getElementById('stockUsedId');
    if(picker){
      const selected=picker.value;
      const rows=window.loadStock().sort((a,b)=>a.nombre.localeCompare(b.nombre,'es'));
      picker.replaceChildren(new Option('— Ninguno —',''));
      rows.forEach(x=>{const o=new Option(x.nombre+' · '+Number(x.cantidad||0)+' disp.',x.id);o.disabled=Number(x.cantidad||0)<=0;picker.add(o)});
      picker.value=selected;
    }
  };
};
