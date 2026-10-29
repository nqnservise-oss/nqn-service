/* NQN Service - Libro de movimientos por período.
   Consulta de solo lectura: nunca modifica pagos, gastos, saldos ni cierres Z. */
(() => {
  'use strict';
  const rawSummary=window.showCashSummary;
  if(typeof rawSummary!=='function')return;
  const TRANSFERS_KEY='nqn_service_cash_transfers_v1';
  const $=id=>document.getElementById(id);
  const money=n=>typeof window.money==='function'?window.money(n):'$'+Number(n||0).toLocaleString('es-AR',{maximumFractionDigits:2});
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const num=v=>Number.isFinite(Number(v))?Number(v):0;
  const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
  const labelDate=day=>{const parts=String(day).split('-');return parts.length===3?parts[2]+'/'+parts[1]+'/'+parts[0]:day};
  const timeFrom=(stamp,day)=>{
    const d=new Date(stamp||'');
    return !isNaN(d.getTime())&&todayFor(d)===day?d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'}):'--:--';
  };
  const todayFor=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const stampFor=(stamp,day)=>{
    const parsed=new Date(stamp||'');
    if(!isNaN(parsed.getTime())&&todayFor(parsed)===day)return parsed.getTime();
    return new Date(day+'T23:59:59').getTime();
  };
  const localArray=key=>{try{const x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(_){return []}};

  function allMovements(from,to){
    const rows=[];
    // El Cierre Z ya conoce los pagos individuales de OT, visitas, gastos y notas.
    // Se excluye Cleris porque no integra el resumen de caja de NQN Service.
    const zMove=window.nqnMovimientosDia;
    const start=new Date(from+'T12:00:00');
    const end=new Date(to+'T12:00:00');
    for(const d=new Date(start);d<=end;d.setDate(d.getDate()+1)){
      const day=todayFor(d);
      const daily=typeof zMove==='function'?zMove(day):[];
      daily.forEach(x=>{
        if(String(x.concepto||'').startsWith('Cleris Eventos ·'))return;
        rows.push({...x,fecha:day,tipo:x.tipo||'cobro',operador:x.operador||'Sin registrar'});
      });
    }
    localArray(TRANSFERS_KEY).forEach(x=>{
      const day=String(x.fecha||'');
      const monto=num(x.monto);
      if(day<from||day>to||monto<=0)return;
      const origen=String(x.origen||'');
      const destino=String(x.destino||'');
      rows.push({tipo:'transferencia',subtipo:x.subtipo||'',fecha:day,ts:stampFor(x.creado,day),hora:timeFrom(x.creado,day),
        concepto:(x.subtipo==='retiro_efectivo'?'Retiro a resguardo':'Transferencia entre cajas')+(x.observacion?' · '+x.observacion:''),
        medio:origen+' → '+destino,origen,destino,monto,operador:x.operador||'Sin registrar'});
    });
    if(typeof window.loadCashClosings==='function')window.loadCashClosings().forEach(x=>{
      const day=String(x.fecha||'');
      if(day<from||day>to||x.tipo==='cierre_z')return;
      // Estos campos son acumulados del registro: no se los presenta
      // falsamente como cada ajuste histórico si el mismo cierre fue editado.
      for(const item of [
        {key:'ajusteEfectivo',medio:'Efectivo',cuenta:'ef'},
        {key:'ajusteMP',medio:'Mercado Pago',cuenta:'mp'}
      ]){
        const delta=num(x[item.key]);
        if(!delta)continue;
        rows.push({tipo:'ajuste',fecha:day,ts:stampFor(x.saldoRealSnapshot?.at||x.actualizado||x.creado,day),
          hora:timeFrom(x.saldoRealSnapshot?.at||x.actualizado||x.creado,day),
          concepto:'Ajuste acumulado de saldo'+(x.ajusteMotivo?' · '+x.ajusteMotivo:''),
          medio:item.medio,cuenta:item.cuenta,delta,monto:Math.abs(delta),
          operador:x.operador||'Sin registrar'});
      }
      if(num(x.ajusteGastos)||num(x.ajusteNotas)){
        rows.push({tipo:'informativo',fecha:day,ts:stampFor(x.actualizado||x.creado,day),
          hora:timeFrom(x.actualizado||x.creado,day),concepto:'Ajuste contable de gastos / notas de crédito (no es un cobro nuevo)',
          medio:'Sin especificar',monto:0,operador:x.operador||'Sin registrar'});
      }
    });
    return rows.sort((a,b)=>a.fecha.localeCompare(b.fecha)||num(a.ts)-num(b.ts)||String(a.tipo).localeCompare(String(b.tipo),'es'));
  }

  function accountEffect(x){
    const o={ef:0,mp:0,tarjeta:0,otro:0};
    if(x.tipo==='transferencia'){
      if(x.origen==='Efectivo')o.ef-=num(x.monto);
      if(x.origen==='Mercado Pago')o.mp-=num(x.monto);
      if(x.destino==='Efectivo')o.ef+=num(x.monto);
      if(x.destino==='Mercado Pago')o.mp+=num(x.monto);
      return o;
    }
    if(x.tipo==='ajuste'){
      if(x.cuenta==='ef')o.ef=num(x.delta);
      if(x.cuenta==='mp')o.mp=num(x.delta);
      return o;
    }
    if(x.tipo==='informativo'||x.tipo==='nota'){o.otro=-num(x.monto);return o}
    const sign=x.tipo==='gasto'?-1:1;
    const medio=String(x.medio||'').toLocaleLowerCase('es-AR').trim();
    const amount=sign*num(x.monto);
    if(medio==='efectivo')o.ef+=amount;
    else if(medio==='mercado pago'||medio==='transferencia')o.mp+=amount;
    else if(medio==='mixto'){
      const ef=num(x.efectivo),ta=num(x.tarjeta);
      if(ef||ta){o.ef+=sign*ef;o.tarjeta+=sign*ta}
      else o.otro+=amount;
    }
    else if(medio.includes('tarjeta')||medio==='débito'||medio==='crédito')o.tarjeta+=amount;
    else o.otro+=amount;
    return o;
  }
  function filterByMedia(x,filter){
    if(filter==='todos')return true;
    const a=accountEffect(x);
    if(filter==='efectivo')return a.ef!==0;
    if(filter==='mp')return a.mp!==0;
    if(filter==='tarjeta')return a.tarjeta!==0;
    return a.otro!==0||x.tipo==='informativo';
  }
  function moneySigned(amount){
    return (amount<0?'− ':amount>0?'+ ':'')+money(Math.abs(amount));
  }
  function lineAmount(x,filter){
    const a=accountEffect(x);
    if(filter==='efectivo')return moneySigned(a.ef);
    if(filter==='mp')return moneySigned(a.mp);
    if(filter==='tarjeta')return moneySigned(a.tarjeta);
    if(filter==='otros')return moneySigned(a.otro);
    if(x.tipo==='transferencia')return money(num(x.monto));
    if(x.tipo==='ajuste')return moneySigned(num(x.delta));
    return moneySigned(num(x.monto)*(x.tipo==='gasto'||x.tipo==='nota'?-1:1));
  }
  const titleFor=x=>x.tipo==='cobro'?'Cobro':x.tipo==='gasto'?'Gasto':x.tipo==='nota'?'Nota de crédito':x.tipo==='transferencia'?(x.subtipo==='retiro_efectivo'?'Retiro de efectivo':'Transferencia'):x.tipo==='ajuste'?'Ajuste de saldo':'Ajuste contable';

  function run(){
    const from=$('libroDesde')?.value||'';
    const to=$('libroHasta')?.value||'';
    const media=$('libroMedio')?.value||'todos';
    const box=$('libroResultado');if(!box)return;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||from>to){box.innerHTML='<div class="empty">Elegí un rango de fechas válido.</div>';return}
    const a=new Date(from+'T12:00:00'),b=new Date(to+'T12:00:00');
    const days=Math.round((b-a)/86400000);
    if(!Number.isFinite(days)||days>366){box.innerHTML='<div class="empty">Consultá períodos de hasta 367 días. Podés consultar otro rango después.</div>';return}
    if(typeof window.nqnMovimientosDia!=='function'){box.innerHTML='<div class="empty">El detalle todavía no se cargó. Actualizá la app y volvé a entrar.</div>';return}
    const all=allMovements(from,to);
    const shown=all.filter(x=>filterByMedia(x,media));
    const accounting={ef:{cobros:0,gastos:0,transfers:0,ajustes:0},mp:{cobros:0,gastos:0,transfers:0,ajustes:0}};
    all.forEach(x=>{
      const c=accountEffect(x);
      for(const k of ['ef','mp']){
        if(x.tipo==='cobro')accounting[k].cobros+=c[k];
        if(x.tipo==='gasto')accounting[k].gastos+=c[k];
        if(x.tipo==='transferencia')accounting[k].transfers+=c[k];
        if(x.tipo==='ajuste')accounting[k].ajustes+=c[k];
      }
    });
    const ledger=shown.map((x,i)=>{
      const dateChanged=i===0||shown[i-1].fecha!==x.fecha;
      const sign=x.tipo==='gasto'||x.tipo==='nota'?'gasto':x.tipo==='transferencia'?'transferencia':x.tipo==='ajuste'?'ajuste':'cobro';
      const detail=x.tipo==='cobro'&&x.medio==='Mixto'&&(num(x.efectivo)||num(x.tarjeta))
        ?' · Efectivo '+money(x.efectivo)+' / Tarjeta '+money(x.tarjeta):'';
      return (dateChanged?'<div class="libro-dia">'+esc(labelDate(x.fecha))+'</div>':'')+
        '<div class="libro-fila"><div class="libro-hora">'+esc(x.hora||'--:--')+'</div>'+
        '<div class="libro-detalle"><strong>'+esc(titleFor(x))+' · '+esc(x.concepto||'Sin detalle')+'</strong>'+
        '<div class="muted">'+esc(x.medio||'Sin especificar')+esc(detail)+' · Operador: '+esc(x.operador||'Sin registrar')+'</div></div>'+
        '<div class="libro-monto libro-'+sign+'">'+esc(lineAmount(x,media))+'</div></div>';
    }).join('');
    const sum=k=>{
      const x=accounting[k];
      return x.cobros+x.gastos+x.transfers+x.ajustes;
    };
    const calc=k=>{const x=accounting[k];return '<div><strong>Cobros: '+esc(moneySigned(x.cobros))+'</strong> · Gastos: '+esc(moneySigned(x.gastos))+
      ' · Transferencias: '+esc(moneySigned(x.transfers))+' · Ajustes: '+esc(moneySigned(x.ajustes))+
      ' · <strong>Variación: '+esc(moneySigned(sum(k)))+'</strong></div>'};
    box.innerHTML='<div class="libro-aviso"><strong>'+shown.length+' movimientos</strong> del '+esc(labelDate(from))+' al '+esc(labelDate(to))+
      ' · Se muestran operaciones individuales, no totales duplicados de los cierres.</div>'+
      '<div class="libro-ticket">'+(ledger||'<div class="empty">No hay movimientos registrados con estos filtros.</div>')+'</div>'+
      '<div class="libro-totales"><strong>Control por medio de pago — período completo</strong>'+
      '<div style="margin-top:8px">Mercado Pago</div>'+calc('mp')+
      '<div style="margin-top:10px">Efectivo</div>'+calc('ef')+
      '<p class="hint" style="margin-bottom:0">La variación NO es el saldo real de la billetera ni de la caja: es la suma de movimientos registrados en estas fechas. Las notas sin medio identificado no se asignan a ninguna cuenta. Los ajustes acumulados no permiten reconstruir cada edición histórica. Las transferencias se consultan desde los datos guardados en este dispositivo.</p></div>';
  }

  function openPanel(){
    if($('libroMovimientosCaja')){$('libroMovimientosCaja').remove();return}
    const cashForm=$('cashFecha')?.closest('.panel');
    if(!cashForm)return;
    const d=today();
    const panel=document.createElement('section');
    panel.id='libroMovimientosCaja';panel.className='panel';
    panel.innerHTML='<style>'+
      '.libro-ticket{border-top:2px solid var(--navy);margin-top:14px}.libro-dia{font-weight:850;background:var(--soft);padding:10px 12px;margin-top:12px;border-radius:8px}'+
      '.libro-fila{display:grid;grid-template-columns:60px minmax(0,1fr) 140px;gap:10px;align-items:center;padding:12px 4px;border-bottom:1px dashed var(--line)}'+
      '.libro-hora{font-size:12px;font-weight:850}.libro-detalle{min-width:0;overflow-wrap:anywhere;font-size:13px}.libro-monto{text-align:right;font-weight:850}'+
      '.libro-gasto{color:var(--red)}.libro-cobro{color:var(--green)}.libro-ajuste{color:var(--blue)}'+
      '.libro-aviso{font-size:13px;padding-top:14px}.libro-totales{margin-top:20px;background:#f5f8fc;border-radius:12px;padding:14px;font-size:12px;line-height:1.7;overflow-wrap:anywhere}'+
      '@media(max-width:650px){.libro-fila{grid-template-columns:48px minmax(0,1fr);gap:7px}.libro-monto{grid-column:2;text-align:left;font-size:16px}}'+
      '</style>'+
      '<div class="panelhead"><div><div class="eyebrow">AUDITORÍA DE CAJA</div><h3>Movimientos uno por uno</h3></div><button id="libroCerrar" type="button" class="btn secondary small">Cerrar</button></div>'+
      '<div class="grid"><div class="field"><label>Desde</label><input id="libroDesde" type="date" value="'+esc(d.slice(0,7)+'-01')+'"></div>'+
      '<div class="field"><label>Hasta</label><input id="libroHasta" type="date" value="'+esc(d)+'"></div>'+
      '<div class="field"><label>Medio de pago</label><select id="libroMedio"><option value="todos">Todos</option><option value="mp">Mercado Pago / transferencias</option><option value="efectivo">Efectivo</option><option value="tarjeta">Tarjetas</option><option value="otros">No especificado</option></select></div>'+
      '<div class="field" style="justify-content:end"><button id="libroBuscar" class="btn primary" type="button">Consultar movimientos</button></div></div>'+
      '<p class="hint">Incluye la caja de NQN Service; Cleris Eventos se controla por separado.</p><div id="libroResultado"></div>';
    cashForm.after(panel);
    $('libroCerrar').addEventListener('click',()=>panel.remove());
    $('libroBuscar').addEventListener('click',run);
    $('libroMedio').addEventListener('change',run);
    run();
    panel.scrollIntoView({behavior:'smooth',block:'start'});
  }
  window.showCashSummary=function(){
    const result=rawSummary.apply(this,arguments);
    if(typeof window.isAdmin==='function'&&!window.isAdmin())return result;
    const host=$('cashFecha')?.closest('form')?.querySelector('.actions.full');
    if(host&&!$('btnMovimientosCaja')){
      const b=document.createElement('button');
      b.id='btnMovimientosCaja';b.type='button';b.className='btn secondary';
      b.textContent='▤ Consultar movimientos por fechas';
      b.addEventListener('click',openPanel);
      host.prepend(b);
    }
    return result;
  };
  if($('cashFecha')&&typeof window.isAdmin==='function'&&window.isAdmin()){
    // La vista de caja puede haberse dibujado durante el inicio.
    const host=$('cashFecha')?.closest('form')?.querySelector('.actions.full');
    if(host&&!$('btnMovimientosCaja')){
      const b=document.createElement('button');
      b.id='btnMovimientosCaja';b.type='button';b.className='btn secondary';
      b.textContent='▤ Consultar movimientos por fechas';
      b.addEventListener('click',openPanel);
      host.prepend(b);
    }
  }
})();