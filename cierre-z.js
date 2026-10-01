/* NQN Service - Modulo Cierre Z
   Compatible con la version actual de index.html.
   Agrega:
   - Boton "Cierre Z" al menu.
   - Informe diario cronologico tipo ticket.
   - Fecha historica seleccionable.
   - Totales: Efectivo, Mercado Pago, Debito, Credito, Gastos, Notas de credito.
   - Operador en movimientos cuando el dato existe.
   - Para cobros nuevos, intenta guardar automaticamente el operador activo.
   - Mantiene compatibilidad con tarjetas antiguas sin distinguir debito/credito.
*/
(() => {
  'use strict';

  function ready(fn){
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn, {once:true});
    else fn();
  }

  function e(v){
    if(typeof window.esc === 'function') return window.esc(v);
    return String(v ?? '').replace(/[&<>"']/g, s => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[s]));
  }
  function m(v){
    if(typeof window.money === 'function') return window.money(v);
    return '$' + Number(v || 0).toLocaleString('es-AR',{maximumFractionDigits:2});
  }
  function localDay(d=new Date()){
    if(typeof window.localISODate === 'function') return window.localISODate(d);
    const y=d.getFullYear(), mo=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
    return `${y}-${mo}-${da}`;
  }
  function dateLabel(v){
    if(typeof window.prettyDate === 'function') return window.prettyDate(v);
    if(!v) return '-';
    const d=new Date(v+'T12:00:00');
    return isNaN(d) ? v : d.toLocaleDateString('es-AR');
  }
  function fmtOT(n){
    if(typeof window.fmtOrder === 'function') return window.fmtOrder(n);
    return String(n || 0).padStart(3,'0');
  }
  function safeArray(fn){
    try{
      const x=fn();
      return Array.isArray(x) ? x : [];
    }catch(_){ return []; }
  }
  function zTime(value, fecha){
    if(!value) return '--:--';
    const d=new Date(value);
    if(Number.isNaN(d.getTime())) return '--:--';
    if(fecha && localDay(d)!==fecha) return '--:--';
    return d.toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'});
  }
  function zStamp(value, fecha, fallback=''){
    if(value){
      const d=new Date(value);
      if(!Number.isNaN(d.getTime())) return d.getTime();
    }
    if(fallback){
      const d=new Date(fecha+'T'+fallback);
      if(!Number.isNaN(d.getTime())) return d.getTime();
    }
    const d=new Date(fecha+'T23:59:59');
    return Number.isNaN(d.getTime()) ? 0 : d.getTime();
  }
  function zConceptOrder(r){
    const equipo=[r.tipo||'',r.marcaModelo||''].filter(Boolean).join(' ').trim();
    return ['OT '+fmtOT(r.numero),r.cliente||'',equipo].filter(Boolean).join(' · ');
  }

  function currentOperator(){
    try{
      return typeof window.currentOperator === 'function' ? window.currentOperator() : null;
    }catch(_){ return null; }
  }

  // Agrega Debito y Credito como opciones nuevas sin borrar la opcion historica combinada.
  function extendPaymentOptions(){
    try{
      if(typeof PAGOS !== 'undefined' && Array.isArray(PAGOS)){
        const legacy='Tarjeta crédito / débito';
        const i=PAGOS.indexOf(legacy);
        if(!PAGOS.includes('Tarjeta débito')) PAGOS.splice(i>=0?i:PAGOS.length,0,'Tarjeta débito');
        if(!PAGOS.includes('Tarjeta crédito')) PAGOS.splice((i>=0?i:PAGOS.length)+1,0,'Tarjeta crédito');
      }
    }catch(_){}
  }

  // Envuelve save() para estampar operador en pagos nuevos que todavia no lo tengan.
  function installPaymentOperatorStamp(){
    try{
      if(typeof window.save !== 'function' || window.__nqnCierreZSaveWrapped) return;
      const originalSave=window.save;
      window.save=function(rows,reason){
        const op=currentOperator();
        if(op && Array.isArray(rows)){
          const now=Date.now();
          rows.forEach(r=>{
            if(!r || !Array.isArray(r.pagos)) return;
            r.pagos.forEach(p=>{
              if(!p || p.operadorId || p.operador) return;
              const ts=new Date(p.creado||p.actualizado||0).getTime();
              // Solo marcamos pagos recien creados; no inventamos operador para historicos.
              if(Number.isFinite(ts) && Math.abs(now-ts) <= 120000){
                p.operadorId=String(op.id||'');
                p.operador=String(op.nombre||'');
              }
            });
          });
        }
        return originalSave(rows,reason);
      };
      window.__nqnCierreZSaveWrapped=true;
    }catch(_){}
  }

  function movements(fecha){
    const rows=[];

    safeArray(()=>typeof load==='function'?load():[]).forEach(r=>{
      const pagos=Array.isArray(r?.pagos)?r.pagos:[];
      if(pagos.length){
        pagos.forEach(p=>{
          if(String(p.fecha||'')!==String(fecha||'')) return;
          const monto=Math.max(0,Number(p.monto||0)); if(!monto) return;
          rows.push({
            tipo:'cobro',
            ts:zStamp(p.creado||p.actualizado,fecha),
            hora:zTime(p.creado||p.actualizado,fecha),
            ot:r.numero||0,
            concepto:zConceptOrder(r),
            medio:String(p.medioPago||r.medioPago||'Pendiente'),
            monto,
            operador:String(p.operador||'').trim()||'Sin registrar',
            efectivo:Math.max(0,Number(p.efectivo||0)),
            tarjeta:Math.max(0,Number(p.tarjeta||0))
          });
        });
      }else if(r?.estado==='Entregado' && String(r.fechaEntrega||'')===String(fecha||'')){
        const monto=Math.max(0,Number(r.pagado||0)); if(!monto) return;
        rows.push({
          tipo:'cobro',
          ts:zStamp(r.actualizado||r.creado,fecha),
          hora:zTime(r.actualizado||r.creado,fecha),
          ot:r.numero||0,
          concepto:zConceptOrder(r),
          medio:String(r.medioPago||'Pendiente'),
          monto,
          operador:'Sin registrar',
          efectivo:0,tarjeta:0
        });
      }
    });

    let turnosAll={};
    try{ turnosAll=JSON.parse(localStorage.getItem('nqn_turnos_v2')||'{}')||{}; }catch(_){}
    const turnosDia=turnosAll[String(fecha||'')]||{};
    Object.values(turnosDia).forEach(t=>{
      if(!t || !t.visitaCobrada) return;
      const monto=Math.max(0,Number(t.visitaMonto||30000)); if(!monto) return;
      const horaTurno=String(t.hora||t.horario||'').slice(0,5);
      const cliente=String(t.cliente||t.nombre||'').trim();
      const dir=String(t.direccion||'').trim();
      const stamped=t.visitaCobradoEn||t.actualizado||t.creado;
      rows.push({
        tipo:'cobro',
        ts:zStamp(stamped,fecha,horaTurno),
        hora:zTime(stamped,fecha)!=='--:--'?zTime(stamped,fecha):(horaTurno||'--:--'),
        ot:Number(t.orderNumero||t.ot||0),
        concepto:['Visita a domicilio',cliente,dir].filter(Boolean).join(' · '),
        medio:String(t.visitaMedioPago||'').trim()||'Pendiente',
        monto,
        operador:String(t.operador||t.operadorNombre||'').trim()||'Sin registrar',
        efectivo:0,tarjeta:0
      });
    });

    safeArray(()=>typeof loadEvents==='function'?loadEvents():[]).forEach(ev=>{
      if(!ev || String(ev.fecha||'')!==String(fecha||'')) return;
      const monto=Math.max(0,Number(ev.monto||0)); if(!monto) return;
      const nombre=String(ev.cliente||ev.nombre||ev.evento||ev.lugar||'Evento').trim();
      rows.push({
        tipo:'cobro',
        ts:zStamp(ev.actualizado||ev.creado,fecha,String(ev.hora||'').slice(0,5)),
        hora:zTime(ev.actualizado||ev.creado,fecha),
        ot:0,
        concepto:'Cleris Eventos · '+nombre,
        medio:String(ev.medioPago||'').trim()||'Pendiente',
        monto,
        operador:String(ev.operador||'Cleris').trim()||'Cleris',
        efectivo:0,tarjeta:0
      });
    });

    safeArray(()=>typeof window.loadExpenses==='function'?window.loadExpenses():[]).forEach(x=>{
      if(String(x.fecha||'')!==String(fecha||'')) return;
      const monto=Math.max(0,Number(x.monto||0)); if(!monto) return;
      const ot=x.orderNumero?('OT '+fmtOT(x.orderNumero)):'';
      const detalle=[x.categoria||'Gasto',x.observacion||'',ot].filter(Boolean).join(' · ');
      rows.push({
        tipo:'gasto',
        ts:zStamp(x.creado||x.actualizado,fecha),
        hora:zTime(x.creado||x.actualizado,fecha),
        ot:x.orderNumero||0,
        concepto:detalle,
        medio:String(x.medioPago||''),
        monto,
        operador:String(x.operador||'').trim()||'Sin registrar',
        efectivo:0,tarjeta:0
      });
    });

    safeArray(()=>typeof window.loadCashClosings==='function'?window.loadCashClosings():[]).forEach(x=>{
      if(String(x.fecha||'')!==String(fecha||'')) return;
      const monto=Math.max(0,Number(x.notaCredito||0)); if(!monto) return;
      rows.push({
        tipo:'nota',
        ts:zStamp(x.actualizado||x.creado,fecha),
        hora:zTime(x.actualizado||x.creado,fecha),
        ot:0,
        concepto:'Nota de crédito / devolución',
        medio:'—',
        monto,
        operador:String(x.operador||'').trim()||'Sin registrar',
        efectivo:0,tarjeta:0
      });
    });

    return rows.sort((a,b)=>a.ts-b.ts || a.tipo.localeCompare(b.tipo,'es'));
  }

  function totals(rows){
    const t={efectivo:0,mp:0,debito:0,credito:0,tarjetaLegacy:0,gastos:0,notas:0};
    rows.forEach(x=>{
      if(x.tipo==='gasto'){ t.gastos+=x.monto; return; }
      if(x.tipo==='nota'){ t.notas+=x.monto; return; }
      if(x.tipo!=='cobro') return;

      const medio=String(x.medio||'').toLowerCase();
      if(medio==='efectivo'){ t.efectivo+=x.monto; return; }
      if(medio==='mercado pago' || medio==='transferencia'){ t.mp+=x.monto; return; }
      if(medio==='tarjeta débito' || medio==='debito' || medio==='débito'){ t.debito+=x.monto; return; }
      if(medio==='tarjeta crédito' || medio==='credito' || medio==='crédito'){ t.credito+=x.monto; return; }
      if(medio==='mixto'){
        const ef=Math.max(0,Number(x.efectivo||0)), ta=Math.max(0,Number(x.tarjeta||0));
        if(ef || ta){ t.efectivo+=ef; t.tarjetaLegacy+=ta; }
        else t.tarjetaLegacy+=x.monto;
        return;
      }
      if(medio.includes('tarjeta')) t.tarjetaLegacy+=x.monto;
    });
    return t;
  }

  function setActiveNav(){
    document.querySelectorAll('.nav button').forEach(x=>x.classList.remove('active'));
    const b=document.getElementById('nav-cierrez');
    if(b) b.classList.add('active');
  }

  function render(fecha=''){
    const op=currentOperator();
    if(!op && typeof window.showView==='function'){
      try{ window.showView('dashboard'); }catch(_){}
      return;
    }

    try{ if(typeof rememberCurrentView==='function') rememberCurrentView('cierrez'); }catch(_){}
    try{ currentView='cierrez'; editingId=null; }catch(_){}
    setActiveNav();
    try{ if(typeof title==='function') title('Cierre Z'); }catch(_){}

    fecha=String(fecha || document.getElementById('zFecha')?.value || localDay());
    const rows=movements(fecha), tot=totals(rows);
    const ops=[...new Set(rows.map(x=>x.operador).filter(x=>x && x!=='Sin registrar'))];
    const ingresos=rows.filter(x=>x.tipo==='cobro').reduce((a,x)=>a+Number(x.monto||0),0);
    const egresos=Number(tot.gastos||0)+Number(tot.notas||0);
    const neto=ingresos-egresos;

    const cierres=safeArray(()=>typeof window.loadCashClosings==='function'?window.loadCashClosings():[])
      .filter(x=>String(x.fecha||'')===fecha);
    const cierreTs=cierres.map(x=>new Date(x.actualizado||x.creado||'').getTime())
      .filter(Number.isFinite).sort((a,b)=>b-a)[0]||0;
    const cierreHora=cierreTs
      ? new Date(cierreTs).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})
      : 'Sin cierre guardado';

    const icon=x=>x.tipo==='gasto'?'−':x.tipo==='nota'?'↩':'+';
    const typeLabel=x=>x.tipo==='gasto'?'Gasto':x.tipo==='nota'?'Nota de crédito':'Cobro';

    const lineas=rows.map(x=>`
      <div class="nqn-z-row">
        <div class="mono nqn-z-time">${e(x.hora||'--:--')}</div>
        <div class="nqn-z-icon nqn-z-${e(x.tipo)}" title="${e(typeLabel(x))}">${icon(x)}</div>
        <div class="nqn-z-detail"><strong>${e(x.concepto)}</strong><div class="muted">${e(typeLabel(x))} · Operador: ${e(x.operador)}</div></div>
        <div class="nqn-z-medium"><strong>${e(x.medio||'—')}</strong></div>
        <div class="nqn-z-amount"><strong>${m(x.monto)}</strong></div>
      </div>`).join('');

    const view=document.getElementById('view');
    if(!view) return;

    view.innerHTML=`
      <style>
        .nqn-z-wrap{max-width:1040px}
        .nqn-z-head{display:flex;align-items:flex-end;justify-content:space-between;gap:18px;flex-wrap:wrap}
        .nqn-z-ticket{margin-top:10px;border-top:2px solid var(--navy);border-bottom:2px solid var(--navy);padding:0 4px}
        .nqn-z-columns,.nqn-z-row{display:grid;grid-template-columns:64px 34px minmax(0,1fr) 150px 120px;gap:10px;align-items:center}
        .nqn-z-columns{padding:10px 0;font-size:12px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
        .nqn-z-row{padding:12px 0;border-bottom:1px dashed var(--line)}
        .nqn-z-row:last-child{border-bottom:0}
        .nqn-z-time{font-weight:850}
        .nqn-z-icon{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:900}
        .nqn-z-cobro{background:#eef8f2}.nqn-z-gasto{background:#fff3f3}.nqn-z-nota{background:#fff8e8}
        .nqn-z-detail{min-width:0}.nqn-z-amount{text-align:right}
        .nqn-z-totals{margin-top:22px}
        .nqn-z-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-top:10px}
        @media(max-width:760px){
          .nqn-z-columns{display:none}
          .nqn-z-row{grid-template-columns:54px 30px minmax(0,1fr);gap:8px}
          .nqn-z-medium{grid-column:3}.nqn-z-amount{grid-column:3;text-align:left;font-size:18px}
        }
      </style>
      <section class="panel nqn-z-wrap" style="margin-top:0">
        <div class="panelhead nqn-z-head">
          <div>
            <div class="eyebrow">INFORME DIARIO</div>
            <h3 style="margin-bottom:4px">CIERRE Z — ${e(dateLabel(fecha))}</h3>
            <div class="muted">Operadores: ${e(ops.length?ops.join(', '):'Sin movimientos')} · Hora de cierre: ${e(cierreHora)}</div>
            <div class="muted" style="margin-top:4px">Este informe detalla los movimientos del día. No modifica ni reemplaza el Resumen de caja.</div>
          </div>
          <div class="field short" style="margin:0">
            <label>Fecha</label>
            <input id="zFecha" type="date" value="${e(fecha)}">
          </div>
        </div>

        <div class="nqn-z-ticket">
          <div class="nqn-z-columns">
            <div>Hora</div><div></div><div>Detalle</div><div>Medio</div><div style="text-align:right">Monto</div>
          </div>
          ${lineas || '<div class="empty" style="margin:12px 0 18px">No hay movimientos registrados para esta fecha.</div>'}
        </div>

        <div class="nqn-z-totals">
          <div class="eyebrow">CONTROL DE EFECTIVO</div>
          <div class="grid" style="grid-template-columns:repeat(2,minmax(180px,260px));margin:10px 0 18px">
            <div class="field"><label>Efectivo contado</label><input id="zEfectivoContado" type="number" min="0" step="0.01" placeholder="Ingresá el efectivo que tenés"></div>
            <div class="stat"><div class="statlabel">Diferencia efectivo</div><div id="zDiferenciaEfectivo" class="statvalue smallmoney">—</div></div>
            <div class="field"><label>Saldo real Mercado Pago</label><input id="zMercadoPagoReal" type="number" min="0" step="0.01" placeholder="Ingresá el saldo que ves en Mercado Pago"></div>
            <div class="stat"><div class="statlabel">Diferencia Mercado Pago</div><div id="zDiferenciaMP" class="statvalue smallmoney">—</div></div>
          </div>
          <div class="eyebrow">TOTALES DEL DÍA</div>
          <div class="nqn-z-stats">
            <div class="stat"><div class="statlabel">Efectivo</div><div class="statvalue smallmoney">${m(tot.efectivo)}</div></div>
            <div class="stat"><div class="statlabel">Mercado Pago</div><div class="statvalue smallmoney">${m(tot.mp)}</div></div>
            <div class="stat"><div class="statlabel">Débito</div><div class="statvalue smallmoney">${m(tot.debito)}</div></div>
            <div class="stat"><div class="statlabel">Crédito</div><div class="statvalue smallmoney">${m(tot.credito)}</div></div>
            <div class="stat"><div class="statlabel">Gastos</div><div class="statvalue smallmoney">${m(tot.gastos)}</div></div>
            <div class="stat"><div class="statlabel">Notas de crédito</div><div class="statvalue smallmoney">${m(tot.notas)}</div></div>
            <div class="stat soft"><div class="statlabel">Total ingresos</div><div class="statvalue smallmoney">${m(ingresos)}</div></div>
            <div class="stat soft"><div class="statlabel">Neto del día</div><div class="statvalue smallmoney">${m(neto)}</div></div>
          </div>
          ${tot.tarjetaLegacy>0
            ? `<div class="alert amber" style="margin-top:14px"><strong>Tarjetas anteriores sin distinguir débito/crédito: ${m(tot.tarjetaLegacy)}</strong><span>Los cobros nuevos permiten elegir Débito o Crédito por separado. Los registros viejos quedan identificados sin inventar una categoría.</span></div>`
            : ''}
        </div>
      </section>`;

    const input=document.getElementById('zFecha');
    if(input) input.addEventListener('change',()=>render(input.value));
    const contado=document.getElementById('zEfectivoContado');
    const diferencia=document.getElementById('zDiferenciaEfectivo');
    if(contado && diferencia){
      contado.addEventListener('input',()=>{
        if(contado.value===''){ diferencia.textContent='—'; return; }
        const dif=Number(contado.value||0)-Number(tot.efectivo||0);
        diferencia.textContent=m(dif);
      });
    }
    const mpReal=document.getElementById('zMercadoPagoReal');
    const mpDif=document.getElementById('zDiferenciaMP');
    if(mpReal && mpDif){
      mpReal.addEventListener('input',()=>{
        if(mpReal.value===''){ mpDif.textContent='—'; return; }
        const dif=Number(mpReal.value||0)-Number(tot.mp||0);
        mpDif.textContent=m(dif);
      });
    }
  }

  function ensureNavButton(){
    const nav=document.querySelector('.nav');
    if(!nav) return;
    let b=document.getElementById('nav-cierrez');
    if(!b){
      b=document.createElement('button');
      b.id='nav-cierrez';
      b.innerHTML='▤ Cierre Z';
      b.addEventListener('click',()=>render());
      const caja=document.getElementById('nav-caja');
      if(caja && caja.nextSibling) nav.insertBefore(b,caja.nextSibling);
      else if(caja) nav.appendChild(b);
      else{
        const ops=document.getElementById('nav-operadores');
        ops ? nav.insertBefore(b,ops) : nav.appendChild(b);
      }
    }
    b.style.display='';
  }

  function installViewRouter(){
    if(window.__nqnCierreZRouterInstalled) return;
    const original=window.showView;
    if(typeof original!=='function') return;
    window.showView=function(v,...args){
      if(v==='cierrez') return render(args[0]||'');
      return original.apply(this,[v,...args]);
    };
    window.__nqnCierreZRouterInstalled=true;
  }

  function boot(){
    extendPaymentOptions();
    installPaymentOperatorStamp();
    ensureNavButton();
    installViewRouter();

    const observer=new MutationObserver(()=>{
      ensureNavButton();
      installViewRouter();
      installPaymentOperatorStamp();
    });
    observer.observe(document.body,{childList:true,subtree:true});

    window.renderCierreZ=render;
  }

  ready(()=>setTimeout(boot,0));
})();
