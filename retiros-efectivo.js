/* NQN Service · Retiros de efectivo a resguardo.
   Es una transferencia de fondos, NO un gasto ni un retiro personal.
   La interfaz solo permite confirmar el movimiento al administrador. */
(() => {
  'use strict';
  const KEY='nqn_service_cash_transfers_v1';
  const LIMITE=350000;
  let saving=false;
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>'$ '+Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:0});
  const today=()=>{const d=new Date();return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')};
  const movimientos=()=>{try{const rows=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(rows)?rows:[]}catch(_){return []}};
  const saldo=()=>typeof window.nqnSaldoEfectivoDisponible==='function'?Number(window.nqnSaldoEfectivoDisponible()):NaN;
  const dinero=v=>{
    const clean=String(v??'').trim().replace(/\$/g,'').replace(/\s/g,'');
    if(!/^\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$|^\d+(?:,\d{1,2})?$/.test(clean))return NaN;
    return Number(clean.replace(/\./g,'').replace(',','.'));
  };

  function renderControl(){
    const caja=$('cashFecha'),z=$('zFecha'),panel=caja?.closest('.panel')||z?.closest('.panel');
    if(!panel||!window.isAdmin?.()||$('nqnRetiroControl'))return;
    const fecha=caja?.value||z?.value||today();
    if(fecha!==today())return; // Nunca descontar saldos desde una fecha histórica
    const disponible=saldo();
    const cajaOk=Number.isFinite(disponible)&&disponible>=0;
    const rows=movimientos().filter(x=>x.subtipo==='retiro_efectivo').sort((a,b)=>String(b.creado||'').localeCompare(String(a.creado||'')));
    const recientes=rows.slice(0,5).map(x=>{
      const when=new Date(x.creado||'');
      const fechaHora=Number.isNaN(when.getTime())?esc(x.fecha||''):esc(when.toLocaleString('es-AR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}));
      return '<div class="summaryrow"><span>'+fechaHora+' · '+esc(x.operador||'Administrador')+'</span><strong>'+money(x.monto)+'</strong></div>';
    }).join('');
    const el=document.createElement('div');
    el.id='nqnRetiroControl';
    el.className='panel';
    el.style.margin='14px 0';
    el.innerHTML='<div class="panelhead"><div><div class="eyebrow">CONTROL DE EFECTIVO</div><h3>Retiro de efectivo del negocio</h3></div></div>'+
      '<p class="hint">El retiro baja el efectivo disponible de caja. No cambia la facturación, los gastos ni la ganancia.</p>'+
      '<div class="summaryrow"><span>Saldo disponible de efectivo</span><strong>'+ (cajaOk?money(disponible):'Sin calcular') +'</strong></div>'+
      (cajaOk&&disponible>LIMITE?'<p style="color:var(--red);font-weight:700">La caja superó el límite sugerido de '+money(LIMITE)+'. Conviene hacer un retiro.</p>':'')+
      '<div class="actions"><button type="button" class="btn secondary" id="nqnAbrirRetiro" '+(!cajaOk||disponible<=0?'disabled':'')+'>− Retirar efectivo</button></div>'+
      '<div id="nqnRetiroForm" hidden><div class="grid"><div class="field"><label>Monto a retirar *</label><input type="text" id="nqnRetiroMonto" inputmode="decimal" placeholder="Ej.: 300000"></div><div class="field"><label>Destino</label><input value="Resguardo del negocio" readonly></div><div class="field full"><label>Observación</label><input id="nqnRetiroObs" placeholder="Ej.: Retirado por titular, guardado en casa"></div></div><div class="actions"><button type="button" class="btn primary" id="nqnConfirmarRetiro">Confirmar retiro</button><button type="button" class="btn secondary" id="nqnCancelarRetiro">Cancelar</button></div></div>'+
      (recientes?'<div class="eyebrow" style="margin-top:16px">ÚLTIMOS RETIROS</div>'+recientes:'');
    panel.insertAdjacentElement('afterend',el);
    $('nqnAbrirRetiro').addEventListener('click',()=>{$('nqnRetiroForm').hidden=false;$('nqnRetiroMonto')?.focus()});
    $('nqnCancelarRetiro').addEventListener('click',()=>{$('nqnRetiroForm').hidden=true});
    $('nqnConfirmarRetiro').addEventListener('click',guardarRetiro);
  }

  function guardarRetiro(){
    if(saving)return;
    if(!window.isAdmin?.()){alert('Solo el administrador puede hacer retiros de efectivo.');return}
    const op=window.currentOperator?.();
    if(!op){alert('Ingresá con tu usuario para registrar el retiro.');return}
    const monto=dinero($('nqnRetiroMonto')?.value);
    const disponible=saldo();
    if(!Number.isFinite(monto)||monto<=0||Math.round(monto*100)!==monto*100){alert('Ingresá un importe válido mayor que cero.');return}
    if(!Number.isFinite(disponible)||disponible<0||monto>disponible){alert('El retiro supera el saldo de efectivo disponible. Revisá la caja.');return}
    if(!confirm('¿Confirmás que retiraste físicamente '+money(monto)+' de la caja de NQN Service para resguardo?'))return;
    saving=true;
    const ts=new Date().toISOString();
    const obj={
      id:(crypto.randomUUID?.()||'retiro-'+Date.now()+'-'+Math.random().toString(36).slice(2)),
      tipo:'transferencia',subtipo:'retiro_efectivo',
      fecha:today(),origen:'Efectivo',destino:'Resguardo NQN Service',
      monto,observacion:String($('nqnRetiroObs')?.value||'').trim(),
      operadorId:String(op.id),operador:String(op.nombre),creado:ts,actualizado:ts
    };
    try{
      const rows=movimientos();
      rows.push(obj);
      localStorage.setItem(KEY,JSON.stringify(rows));
      if(movimientos().findIndex(x=>x.id===obj.id)<0)throw new Error('El retiro no quedó guardado');
      window.queueCloudOp?.('upsertCash',obj.id,obj,ts);
      window.toast?.('Retiro de '+money(monto)+' registrado');
      if($('zFecha'))window.renderCierreZ?.(today());
      else window.showCashSummary?.();
    }catch(err){
      console.error('No se pudo guardar retiro',err);
      alert('No se pudo verificar el retiro. Revisá el historial antes de intentar de nuevo.');
    }finally{saving=false}
  }
  const observer=new MutationObserver(()=>renderControl());
  const boot=()=>{observer.observe(document.body,{childList:true,subtree:true});renderControl()};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();