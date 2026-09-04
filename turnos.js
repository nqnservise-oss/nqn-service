(function(){
  'use strict';

  const TURNOS_KEY='nqn_turnos_v2';
  const SLOTS=['14:00','15:00','16:00'];
  const TIPOS=['Retiro','Entrega','Visita técnica','Otro'];
  const ESTADOS=['pendiente','confirmado','realizado','cancelado'];
  let selectedDate=localISODate(new Date());
  let editingSlot=null;

  function localISODate(d){
    const y=d.getFullYear();
    const m=String(d.getMonth()+1).padStart(2,'0');
    const day=String(d.getDate()).padStart(2,'0');
    return `${y}-${m}-${day}`;
  }
  function parseLocalDate(value){
    const [y,m,d]=String(value||'').split('-').map(Number);
    return new Date(y,m-1,d,12,0,0,0);
  }
  function esc(value){
    return String(value??'')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }
  function nowIso(){return new Date().toISOString()}
  function turnId(date,slot){return `${date}|${slot}`}

  function loadTurnos(){
    try{
      const raw=localStorage.getItem(TURNOS_KEY);
      const data=raw?JSON.parse(raw):{};
      return data&&typeof data==='object'&&!Array.isArray(data)?data:{};
    }catch(e){return {}}
  }
  function saveTurnos(data){localStorage.setItem(TURNOS_KEY,JSON.stringify(data||{}))}
  function dayData(date){return loadTurnos()[date]||{}}
  function normalizeRemoteTurn(t){
    const fecha=String(t?.fecha||'').slice(0,10);
    const hora=SLOTS.includes(String(t?.hora||''))?String(t.hora):'';
    if(!fecha||!hora)return null;
    return {
      id:String(t.id||turnId(fecha,hora)),fecha,hora,
      cliente:String(t.cliente||''),telefono:String(t.telefono||''),
      direccion:String(t.direccion||t.barrio||''),tipo:TIPOS.includes(t.tipo)?t.tipo:'Retiro',
      estado:ESTADOS.includes(t.estado)?t.estado:'pendiente',
      obs:String(t.obs||t.observaciones||''),
      creado:t.creado||t.updatedAt||t.actualizado||nowIso(),
      actualizado:t.actualizado||t.updatedAt||t.creado||nowIso()
    };
  }
  function localTurnToRemote(date,slot,t){
    const n=normalizeRemoteTurn({
      id:turnId(date,slot),fecha:date,hora:slot,
      cliente:t?.cliente,telefono:t?.telefono,direccion:t?.direccion,
      tipo:t?.tipo,estado:t?.estado,obs:t?.obs,
      creado:t?.creado||t?.updatedAt||nowIso(),
      actualizado:t?.actualizado||t?.updatedAt||nowIso()
    });
    return n;
  }
  function writeRemoteTurnsToLocal(rows,pendingIds){
    const all=loadTurnos();
    const next={};
    (Array.isArray(rows)?rows:[]).forEach(r=>{
      const t=normalizeRemoteTurn(r);if(!t)return;
      if(!next[t.fecha])next[t.fecha]={};
      next[t.fecha][t.hora]={cliente:t.cliente,telefono:t.telefono,direccion:t.direccion,tipo:t.tipo,estado:t.estado,obs:t.obs,creado:t.creado,actualizado:t.actualizado,updatedAt:t.actualizado};
    });
    if(pendingIds&&pendingIds.size){
      Object.keys(all).forEach(date=>Object.keys(all[date]||{}).forEach(slot=>{
        const id=turnId(date,slot);
        if(pendingIds.has(id)){
          if(!next[date])next[date]={};
          next[date][slot]=all[date][slot];
        }
      }));
    }
    saveTurnos(next);
  }
  function setTurno(date,slot,value){
    const all=loadTurnos();
    if(!all[date])all[date]={};
    if(value){
      const now=nowIso();
      const prev=all[date][slot]||{};
      value.creado=value.creado||prev.creado||now;
      value.actualizado=now;value.updatedAt=now;
      all[date][slot]=value;
    } else delete all[date][slot];
    if(Object.keys(all[date]).length===0)delete all[date];
    saveTurnos(all);
    if(typeof window.queueCloudOp==='function'){
      const id=turnId(date,slot);
      if(value)window.queueCloudOp('upsertTurn',id,localTurnToRemote(date,slot,value),value.actualizado||value.updatedAt||nowIso());
      else window.queueCloudOp('deleteTurn',id,null,nowIso());
    }
  }

  function statusBadge(estado){
    if(estado==='realizado')return '<span class="badge green">Realizado</span>';
    if(estado==='confirmado')return '<span class="badge green">Confirmado</span>';
    if(estado==='cancelado')return '<span class="badge red">Cancelado</span>';
    return '<span class="badge amber">Pendiente</span>';
  }
  function prettyDate(value){
    try{return parseLocalDate(value).toLocaleDateString('es-AR',{weekday:'long',day:'2-digit',month:'long'})}catch(e){return value}
  }

  function injectStyles(){
    if(document.getElementById('turnosStyles'))return;
    const style=document.createElement('style');style.id='turnosStyles';
    style.textContent=`
      .turnos-toolbar{display:flex;align-items:end;justify-content:space-between;gap:12px;flex-wrap:wrap}
      .turnos-datebox{display:flex;align-items:end;gap:8px;flex-wrap:wrap}
      .turnos-slots{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-top:16px}
      .turno-card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:17px;min-height:195px;display:flex;flex-direction:column;gap:10px}
      .turno-card.empty-slot{border-style:dashed;background:#fbfcfe}.turno-time{font-size:24px;font-weight:900;color:var(--blue)}
      .turno-client{font-size:16px;font-weight:850;margin-top:2px}.turno-meta{font-size:12px;color:var(--muted);line-height:1.5}
      .turno-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:auto}.turno-form{margin-top:16px;border-top:1px solid var(--line);padding-top:16px}
      .turno-emptycopy{font-size:12px;color:var(--muted);line-height:1.5;flex:1}.turnos-daytitle{text-transform:capitalize;font-size:13px;color:var(--muted);font-weight:700;margin-top:4px}
      .turnos-fixed{margin-top:14px;padding:10px 12px;border-radius:10px;background:var(--soft);border:1px solid #d4e4ff;font-size:12px;color:#3e5f8e}
      @media(max-width:950px){.turnos-slots{grid-template-columns:1fr}}
    `;document.head.appendChild(style);
  }
  function addNavButton(){
    if(document.getElementById('nav-turnos'))return;
    const nav=document.querySelector('.nav');if(!nav)return;
    const btn=document.createElement('button');btn.id='nav-turnos';btn.innerHTML='◷ Turnos';btn.onclick=()=>window.showView('turnos');
    const after=document.getElementById('nav-clientes');
    if(after&&after.nextSibling)nav.insertBefore(btn,after.nextSibling);else nav.appendChild(btn);
  }
  function setActiveNav(){document.querySelectorAll('.nav button').forEach(b=>b.classList.remove('active'));document.getElementById('nav-turnos')?.classList.add('active')}

  function renderTurnos(){
    injectStyles();addNavButton();setActiveNav();
    const title=document.getElementById('pageTitle');if(title)title.textContent='Turnos';
    const view=document.getElementById('view');if(!view)return;
    const day=dayData(selectedDate);
    const occupied=SLOTS.filter(s=>day[s]&&day[s].estado!=='cancelado').length;
    const pending=SLOTS.filter(s=>day[s]&&day[s].estado==='pendiente').length;
    view.innerHTML=`
      <div class="panel" style="margin-top:0">
        <div class="turnos-toolbar">
          <div><div class="eyebrow">AGENDA DIARIA</div><h3 style="margin:4px 0 0">Retiros, entregas y visitas</h3><div class="turnos-daytitle">${esc(prettyDate(selectedDate))}</div></div>
          <div class="turnos-datebox"><button class="btn secondary small" onclick="turnosMoveDay(-1)">‹ Día anterior</button><div class="field" style="min-width:155px"><label>Fecha</label><input id="turnosDate" type="date" value="${esc(selectedDate)}" onchange="turnosSetDate(this.value)"></div><button class="btn secondary small" onclick="turnosToday()">Hoy</button><button class="btn secondary small" onclick="turnosMoveDay(1)">Día siguiente ›</button></div>
        </div>
        <div class="turnos-fixed"><strong>Horarios fijos:</strong> 14:00 · 15:00 · 16:00</div>
        <div class="stats" style="grid-template-columns:repeat(2,minmax(0,220px));margin-bottom:0"><div class="stat soft"><div class="statlabel">TURNOS ACTIVOS</div><div class="statvalue">${occupied}/3</div></div><div class="stat"><div class="statlabel">PENDIENTES</div><div class="statvalue">${pending}</div></div></div>
      </div>
      <div class="turnos-slots">${SLOTS.map(slot=>renderSlot(slot,day[slot])).join('')}</div><div id="turnoEditor"></div>`;
    if(editingSlot)renderEditor(editingSlot,day[editingSlot]||null);
  }
  function renderSlot(slot,t){
    if(!t)return `<div class="turno-card empty-slot"><div class="turno-time">${slot}</div><div class="turno-emptycopy">Horario disponible.</div><div class="turno-actions"><button class="btn primary" onclick="turnosEdit('${slot}')">＋ Cargar turno</button></div></div>`;
    const details=[];if(t.tipo)details.push(esc(t.tipo));if(t.telefono)details.push(esc(t.telefono));if(t.direccion)details.push(esc(t.direccion));
    return `<div class="turno-card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div class="turno-time">${slot}</div>${statusBadge(t.estado)}</div><div class="turno-client">${esc(t.cliente||'Sin nombre')}</div><div class="turno-meta">${details.join(' · ')||'Sin datos adicionales'}</div>${t.obs?`<div class="turno-meta"><strong>Obs.:</strong> ${esc(t.obs)}</div>`:''}<div class="turno-actions"><button class="btn secondary small" onclick="turnosEdit('${slot}')">Editar</button>${t.estado!=='confirmado'&&t.estado!=='realizado'?`<button class="btn success small" onclick="turnosStatus('${slot}','confirmado')">Confirmar</button>`:''}${t.estado!=='realizado'?`<button class="btn success small" onclick="turnosStatus('${slot}','realizado')">Realizado</button>`:''}${t.estado!=='cancelado'?`<button class="btn danger small" onclick="turnosStatus('${slot}','cancelado')">Cancelar</button>`:''}<button class="btn secondary small" onclick="turnosDelete('${slot}')">Borrar</button></div></div>`;
  }
  function renderEditor(slot,t){
    const host=document.getElementById('turnoEditor');if(!host)return;
    const data=t||{cliente:'',telefono:'',direccion:'',tipo:'Retiro',obs:'',estado:'pendiente'};
    host.innerHTML=`<div class="panel turno-form"><div class="panelhead"><div><div class="eyebrow">${t?'EDITAR TURNO':'NUEVO TURNO'}</div><h3>${slot}</h3></div><button class="btn secondary small" onclick="turnosCloseEditor()">Cerrar</button></div><div class="grid"><div class="field"><label>Cliente *</label><input id="turnoCliente" value="${esc(data.cliente)}" placeholder="Nombre y apellido"></div><div class="field"><label>Teléfono</label><input id="turnoTelefono" inputmode="tel" value="${esc(data.telefono)}" placeholder="Ej. 299..."></div><div class="field full"><label>Dirección / barrio</label><input id="turnoDireccion" value="${esc(data.direccion)}" placeholder="Para organizar la salida"></div><div class="field"><label>Tipo</label><select id="turnoTipo">${TIPOS.map(v=>`<option ${data.tipo===v?'selected':''}>${v}</option>`).join('')}</select></div><div class="field"><label>Estado</label><select id="turnoEstado"><option value="pendiente" ${data.estado==='pendiente'?'selected':''}>Pendiente</option><option value="confirmado" ${data.estado==='confirmado'?'selected':''}>Confirmado</option><option value="realizado" ${data.estado==='realizado'?'selected':''}>Realizado</option><option value="cancelado" ${data.estado==='cancelado'?'selected':''}>Cancelado</option></select></div><div class="field full"><label>Observaciones</label><textarea id="turnoObs" rows="3" placeholder="Equipo, referencia o detalle importante">${esc(data.obs)}</textarea></div><div class="actions full"><button class="btn secondary" onclick="turnosCloseEditor()">Cancelar</button><button class="btn primary" onclick="turnosSave('${slot}')">Guardar turno</button></div></div></div>`;
    setTimeout(()=>document.getElementById('turnoCliente')?.focus(),0);
  }

  window.turnosSetDate=function(value){if(!value)return;selectedDate=value;editingSlot=null;renderTurnos()};
  window.turnosMoveDay=function(delta){const d=parseLocalDate(selectedDate);d.setDate(d.getDate()+Number(delta||0));selectedDate=localISODate(d);editingSlot=null;renderTurnos()};
  window.turnosToday=function(){selectedDate=localISODate(new Date());editingSlot=null;renderTurnos()};
  window.turnosEdit=function(slot){editingSlot=slot;renderTurnos();setTimeout(()=>document.getElementById('turnoEditor')?.scrollIntoView({behavior:'smooth',block:'start'}),20)};
  window.turnosCloseEditor=function(){editingSlot=null;renderTurnos()};
  window.turnosSave=function(slot){
    const cliente=document.getElementById('turnoCliente')?.value.trim()||'';if(!cliente){window.toast?window.toast('Ingresá el nombre del cliente'):alert('Ingresá el nombre del cliente');return}
    const turno={cliente,telefono:document.getElementById('turnoTelefono')?.value.trim()||'',direccion:document.getElementById('turnoDireccion')?.value.trim()||'',tipo:document.getElementById('turnoTipo')?.value||'Retiro',estado:document.getElementById('turnoEstado')?.value||'pendiente',obs:document.getElementById('turnoObs')?.value.trim()||''};
    setTurno(selectedDate,slot,turno);editingSlot=null;renderTurnos();window.toast&&window.toast(`Turno de ${slot} guardado`);
  };
  window.turnosStatus=function(slot,status){const t=dayData(selectedDate)[slot];if(!t)return;t.estado=status;setTurno(selectedDate,slot,t);renderTurnos()};
  window.turnosDelete=function(slot){const t=dayData(selectedDate)[slot];if(!t)return;if(!confirm(`¿Borrar el turno de ${slot} de ${t.cliente||'este cliente'}?`))return;setTurno(selectedDate,slot,null);if(editingSlot===slot)editingSlot=null;renderTurnos()};
  window.renderTurnos=renderTurnos;

  function installCloudHooks(){
    if(typeof window.queueCloudOp==='function'&&!window.queueCloudOp.__turnosWrapped){
      const base=window.queueCloudOp;
      const wrapped=function(type,id,data=null,at=(typeof window.nowISO==='function'?window.nowISO():nowIso())){
        if(!String(type).toLowerCase().includes('turn'))return base.apply(this,arguments);
        let q=window.cloudQueue?window.cloudQueue():[];
        q=q.filter(op=>!(op.entity==='turno'&&String(op.id)===String(id)));
        q.push({opId:(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random()),type,entity:'turno',id:String(id),at,data});
        window.setCloudQueue&&window.setCloudQueue(q);window.updateNetworkStatus&&window.updateNetworkStatus();window.cloudAutoSyncSoon&&window.cloudAutoSyncSoon();
      };wrapped.__turnosWrapped=true;window.queueCloudOp=wrapped;
    }
    if(typeof window.opReflected==='function'&&!window.opReflected.__turnosWrapped){
      const base=window.opReflected;
      const wrapped=function(op,state){
        if(op?.entity!=='turno')return base.apply(this,arguments);
        const rows=Array.isArray(state?.turnos)?state.turnos:[];const hit=rows.find(x=>String(x.id)===String(op.id));
        if(String(op.type||'').startsWith('delete'))return !hit;if(!hit)return false;
        const remoteAt=new Date(hit.actualizado||hit.creado||0).getTime(),localAt=new Date(op.at||op.data?.actualizado||op.data?.creado||0).getTime();return !localAt||remoteAt>=localAt;
      };wrapped.__turnosWrapped=true;window.opReflected=wrapped;
    }
    if(typeof window.applyCloudState==='function'&&!window.applyCloudState.__turnosWrapped){
      const base=window.applyCloudState;
      const wrapped=function(state,pending=[]){
        base.apply(this,arguments);
        if(!Array.isArray(state?.turnos))return;
        const p=new Set((pending||[]).filter(x=>x.entity==='turno').map(x=>String(x.id)));
        writeRemoteTurnsToLocal(state.turnos,p);
      };wrapped.__turnosWrapped=true;window.applyCloudState=wrapped;
    }
    if(typeof window.refreshViewAfterCloudSync==='function'&&!window.refreshViewAfterCloudSync.__turnosWrapped){
      const base=window.refreshViewAfterCloudSync;
      const wrapped=function(){if(window.currentView==='turnos'||document.getElementById('nav-turnos')?.classList.contains('active')){renderTurnos();return}return base.apply(this,arguments)};
      wrapped.__turnosWrapped=true;window.refreshViewAfterCloudSync=wrapped;
    }
  }
  function install(){
    injectStyles();addNavButton();installCloudHooks();
    const original=window.showView;
    if(typeof original==='function'&&!original.__turnosWrapped){
      const wrapped=function(name){if(name==='turnos')return renderTurnos();editingSlot=null;return original.apply(this,arguments)};wrapped.__turnosWrapped=true;window.showView=wrapped;
    }
    if(typeof window.cloudConfigured==='function'&&window.cloudConfigured()&&navigator.onLine&&typeof window.cloudSync==='function')setTimeout(()=>window.cloudSync(true),700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();
})();
