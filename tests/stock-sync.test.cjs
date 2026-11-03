const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const backend={};vm.createContext(backend);vm.runInContext(fs.readFileSync('codigo.gs','utf8'),backend);
function device(initial){
 const storage=new Map();let rows=structuredClone(initial),queue=[];
 const w={crypto:require('node:crypto').webcrypto,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},document:{getElementById:()=>null},Option:function(){},
 loadStock:()=>structuredClone(rows),saveStock:r=>{rows=structuredClone(r);return rows},cloudQueue:()=>structuredClone(queue),setCloudQueue:q=>{queue=structuredClone(q)},updateNetworkStatus(){},cloudAutoSyncSoon(){},bootstrapCloudQueue(){},applyCloudState(){},opReflected(){return false},refreshViewAfterCloudSync(){}};
 w.window=w;vm.createContext(w);vm.runInContext(fs.readFileSync('stock-sync.js','utf8'),w);w.installStockSync();return w;
}
const stock=new Map(),item={id:'pump',nombre:'Bomba',cantidad:5,costo:16000,minimo:2,creado:'2026-11-03T10:00:00Z',actualizado:'2026-11-03T10:00:00Z'};
function sync(d){d.bootstrapCloudQueue();for(const op of d.cloudQueue())backend.applyStockChange_(stock,op);const state={stock:[...stock.values()]};const pending=d.cloudQueue().filter(op=>!d.opReflected(op,state));d.setCloudQueue(pending);d.applyCloudState(state,pending)}
const pc=device([item]),mobile=device([]);sync(pc);sync(mobile);assert.equal(mobile.loadStock()[0].cantidad,5);
// Two devices consume offline from the same original quantity. Both deltas survive.
pc.saveStock([{...item,cantidad:4}]);mobile.saveStock([{...item,cantidad:4}]);const retry=pc.cloudQueue();sync(pc);sync(mobile);sync(pc);assert.equal(pc.loadStock()[0].cantidad,3);assert.equal(mobile.loadStock()[0].cantidad,3);
for(const op of retry)backend.applyStockChange_(stock,op);assert.equal(stock.get('pump').cantidad,3);
// Older backend cannot erase the only local inventory or acknowledge its seed.
const legacy=device([item]);legacy.bootstrapCloudQueue();legacy.applyCloudState({ordenes:[]},legacy.cloudQueue());assert.equal(legacy.loadStock()[0].cantidad,5);assert.equal(legacy.opReflected(legacy.cloudQueue()[0],{ordenes:[]}),false);
// A pull while offline edits are pending must preserve the local quantity.
pc.saveStock([{...pc.loadStock()[0],cantidad:2}]);pc.applyCloudState({stock:[...stock.values()]},pc.cloudQueue());assert.equal(pc.loadStock()[0].cantidad,2);sync(pc);
// Returning a part restores exactly one; repeats do not add another unit.
pc.saveStock([{...pc.loadStock()[0],cantidad:3}]);sync(pc);sync(pc);assert.equal(stock.get('pump').cantidad,3);
// Delete tombstones prevent an old device seed from resurrecting inventory.
pc.saveStock([]);sync(pc);const old=device([item]);sync(old);assert.equal(old.loadStock().length,0);sync(mobile);assert.equal(mobile.loadStock().length,0);
// Unrelated items from existing device inventories are retained on first import.
const other=device([{...item,id:'valve',nombre:'Electroválvula',cantidad:2}]);sync(other);sync(pc);assert.equal(pc.loadStock()[0].id,'valve');
// Insufficient quantity rejects without changing the shared inventory.
assert.throws(()=>backend.applyStockChange_(stock,{id:'valve',opId:'bad',data:{item,delta:-3}}));assert.equal(stock.get('valve').cantidad,2);
console.log('PASS: migration, cross-device inventory, concurrent use, retry deduplication, offline edits, returns, deletion, legacy backend, insufficient stock');
