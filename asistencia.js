/* NQN Service - Control de asistencia (versión en revisión)
 * El fichaje sólo es válido si el servidor lo confirma. No hay fichaje offline.
 * La autorización real del puesto se verifica también en Apps Script.
 */
(function(){
  'use strict';
  var KEY='nqn_asistencia_puesto_v1';
  var TZ='America/Argentina/Buenos_Aires';
  var events=[], loading=false, selectedMonth='', selectedOperator='', errorText='';
  function esc(x){return String(x==null?'':x).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c];});}
  function op(){return typeof window.currentOperator==='function'?window.currentOperator():null;}
  function admin(){return typeof window.isAdmin==='function'&&window.isAdmin();}
  function today(){var p=new Intl.DateTimeFormat('es-AR',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()),get=function(k){return p.find(function(x){return x.type===k;}).value;};return get('year')+'-'+get('month')+'-'+get('day');}
  function minute(h){var a=String(h||'').split(':');return Number(a[0])*60+Number(a[1]);}
  // Conservar los minutos originales; convertir solo para la presentación.
  function duration(value){var n=Math.max(0,Math.floor(Number(value)||0)),h=Math.floor(n/60),m=n%60;if(!h)return n+' '+(n===1?'minuto':'minutos');if(!m)return h+' '+(h===1?'hora':'horas');return h+' '+(h===1?'hora':'horas')+' y '+m+' '+(m===1?'minuto':'minutos');}
  function hhmm(x){return /^\d{2}:\d{2}$/.test(String(x||''))?x:'--:--';}
  function getKey(){try{return localStorage.getItem(KEY)||'';}catch(_){return '';}}
  function configured(){var c=typeof window.cloudConfig==='function'?window.cloudConfig():null;return c&&c.enabled&&c.url&&c.token?c:null;}
  function computer(){return !/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);}
  function notify(msg){errorText=msg||'';var e=document.getElementById('attFeedback');if(e){e.textContent=errorText;e.style.display=errorText?'block':'none';}}
  function addMenu(){
    var nav=document.querySelector('.sidebar .nav');
    if(!nav||document.getElementById('nav-asistencia'))return;
    var b=document.createElement('button');b.id='nav-asistencia';b.type='button';
    b.textContent='◷ Control de asistencia';
    b.onclick=function(){window.showView('asistencia');};
    var k=document.getElementById('nav-operadores')||document.getElementById('nav-backup');
    if(k)nav.insertBefore(b,k);else nav.appendChild(b);
  }
  function request(params){
    return new Promise(function(resolve,reject){
      var c=configured(),key=getKey();
      if(!c||!key){reject(new Error('Falta vincular la PC con el servidor de asistencia.'));return;}
      if(!navigator.onLine){reject(new Error('Sin internet. El fichaje no se registró.'));return;}
      var cb='nqn_att_'+Date.now()+'_'+Math.random().toString(36).slice(2);
      var tag=document.createElement('script'),finished=false;
      var timer=setTimeout(function(){done(new Error('El servidor no respondió.'));},15000);
      function done(err,data){
        if(finished)return;finished=true;clearTimeout(timer);
        try{delete window[cb];}catch(_){window[cb]=undefined;}
        tag.remove();if(err)reject(err);else if(!data||data.ok!==true)reject(new Error(data&&data.error||'Error del servidor de asistencia'));else resolve(data);
      }
      window[cb]=function(data){done(null,data);};
      var q=Object.assign({action:'attendanceRead',token:c.token,deviceKey:key,callback:cb},params||{});
      tag.src=c.url+(c.url.indexOf('?')===-1?'?':'&')+Object.keys(q).map(function(k){return encodeURIComponent(k)+'='+encodeURIComponent(q[k]);}).join('&')+'&_='+Date.now();
      tag.onerror=function(){done(new Error('No se pudo consultar el servidor de asistencia.'));};
      document.head.appendChild(tag);
    });
  }
  async function pull(){
    var data=await request();events=Array.isArray(data.events)?data.events:[];
    return events;
  }
  async function post(body){
    var c=configured();if(!c||!getKey())throw new Error('La computadora no está vinculada.');
    if(!navigator.onLine)throw new Error('Sin internet. No se registró ningún fichaje.');
    await fetch(c.url,{method:'POST',mode:'no-cors',redirect:'follow',headers:{'Content-Type':'text/plain;charset=utf-8'},body:JSON.stringify(Object.assign({action:'attendanceEvent',token:c.token,deviceKey:getKey()},body))});
    // En Apps Script el POST no-cors no da respuesta legible. Sólo se confirma al releer la nube.
  }
  async function confirmed(requestId){
    for(var attempt=0;attempt<4;attempt++){
      if(attempt)await new Promise(function(resolve){setTimeout(resolve,attempt*500);});
      await pull();
      if(events.some(function(r){return r.solicitud===requestId;}))return true;
    }
    return false;
  }
  function effective(dayId,date){
    var chosen={entrada:null,salida:null};
    events.filter(function(r){return String(r.operadorId)===String(dayId)&&r.fecha===date;}).forEach(function(r){
      if(r.tipo==='entrada'||r.tipo==='salida')chosen[r.tipo]=r.hora;
      else if(r.tipo==='ajuste'&&(r.objetivo==='entrada'||r.objetivo==='salida'))chosen[r.objetivo]=r.hora;
    });
    return chosen;
  }
  function monthDays(ym){
    if(!/^\d{4}-\d{2}$/.test(ym))return [];
    var start=new Date(ym+'-01T12:00:00'),res=[],current=today();
    for(var d=1;d<=new Date(start.getFullYear(),start.getMonth()+1,0).getDate();d++){
      var date=ym+'-'+String(d).padStart(2,'0');
      var dow=new Date(date+'T12:00:00').getDay();
      if(dow!==0&&dow!==6&&date<=current)res.push(date);
    }return res;
  }
  function report(id,ym){
    var rows=[],tot={tardanzas:0,minutosTarde:0,salidasAntes:0,minutosSalida:0,sinIngreso:0,sinSalida:0};
    monthDays(ym).forEach(function(date){
      var s=effective(id,date),late=s.entrada&&minute(s.entrada)>555?minute(s.entrada)-540:0;
      var early=s.salida&&minute(s.salida)<1020?1020-minute(s.salida):0;
      if(late){tot.tardanzas++;tot.minutosTarde+=late;}
      if(early){tot.salidasAntes++;tot.minutosSalida+=early;}
      if(!s.entrada)tot.sinIngreso++;
      if(!s.salida)tot.sinSalida++;
      rows.push({fecha:date,entrada:s.entrada||'',salida:s.salida||'',tarde:late,anticipada:early});
    });
    return {rows:rows,total:tot};
  }
  function selectData(){
    var user=op();if(!user)return null;
    var ops=typeof window.loadOperators==='function'?window.loadOperators():[];
    if(!admin())selectedOperator=user.id;
    if(!selectedOperator)selectedOperator=user.id;
    var id=selectedOperator;
    if(!admin()||!ops.some(function(o){return o.id===id;}))id=user.id;
    var employee=ops.find(function(o){return o.id===id;})||user;
    return {id:id,employee:employee,ops:ops,report:report(id,selectedMonth)};
  }
  function render(){
    addMenu();var user=op();
    if(!user)return;
    if(typeof window.rememberCurrentView==='function')window.rememberCurrentView('asistencia');
    currentView='asistencia';
    if(typeof window.setNav==='function')window.setNav('asistencia');
    if(typeof window.title==='function')window.title('Control de asistencia');
    var host=document.getElementById('view');if(!host)return;
    var date=today();if(!selectedMonth)selectedMonth=date.slice(0,7);
    var data=selectData(),todayState=effective(user.id,date);
    var badge=todayState.salida?'Jornada cerrada':todayState.entrada?'Ingreso registrado':'Sin ingreso registrado';
    var html='<section class="panel"><div class="panelhead"><div><div class="eyebrow">PERSONAL · 09:00 A 17:00</div><h3>Control de asistencia</h3></div><span class="badge">'+esc(badge)+'</span></div>';
    html+='<p class="sectionnote">Tolerancia hasta 09:15 inclusive. Si se supera, se cuentan todos los minutos desde las 09:00. El servidor fija la hora oficial del registro.</p>';
    if(!computer())html+='<div class="alert red"><strong>Sólo computadora del taller</strong><span>Los fichajes no están habilitados en celulares.</span></div>';
    else if(!configured())html+='<div class="alert red"><strong>Sin conexión a la nube</strong><span>Configurá Google Drive en Copias antes de usar asistencia. No hay fichajes offline.</span></div>';
    else if(!getKey())html+='<div class="alert red"><strong>Esta PC no está vinculada</strong><span>El administrador debe ingresar la clave de puesto asignada en Apps Script.</span></div>';
    else html+='<div class="sidecard" style="margin:14px 0"><strong>'+esc(user.nombre)+'</strong><p>Hoy '+esc(date)+' · Ingreso: '+esc(hhmm(todayState.entrada))+' · Salida: '+esc(hhmm(todayState.salida))+'</p></div>';
    if(computer()&&admin())html+='<details style="margin:15px 0"><summary>Configuración de la computadora del taller</summary><div class="field"><label>Clave de puesto (se guarda sólo en este navegador)</label><input id="attDeviceKey" type="password" autocomplete="off" placeholder="Clave creada con setupAttendanceKiosk()" value=""><div class="hint">Para cambiarla, pegá la clave y presioná Vincular. No la compartas con el personal.</div></div><div class="actions"><button type="button" class="btn secondary" onclick="attSaveKiosk()">Vincular esta PC</button><button type="button" class="btn danger" onclick="attUnlinkKiosk()">Desvincular</button></div></details>';
    if(computer()&&configured()&&getKey())html+='<div class="grid" style="align-items:end"><div class="field"><label>PIN personal para registrar el fichaje</label><input id="attPin" type="password" inputmode="numeric" autocomplete="off" placeholder="Ingresá tu PIN"></div><div class="actions"><button type="button" class="btn primary" '+(todayState.entrada||loading?'disabled':'')+' onclick="attMark(\'entrada\')">Registrar ingreso</button><button type="button" class="btn secondary" '+(!todayState.entrada||todayState.salida||loading?'disabled':'')+' onclick="attMark(\'salida\')">Registrar salida</button></div></div>';
    html+='<p id="attFeedback" class="sectionnote" style="display:'+(errorText?'block':'none')+'">'+esc(errorText)+'</p></section>';
    if(data){
      html+='<section class="panel"><div class="panelhead"><div><div class="eyebrow">REPORTE MENSUAL</div><h3>Historial de asistencia</h3></div><button type="button" class="btn secondary small" onclick="attRefresh()">Actualizar</button></div>';
      html+='<div class="grid"><div class="field"><label>Mes</label><input id="attMonth" type="month" value="'+esc(selectedMonth)+'" onchange="attChangeMonth(this.value)"></div>';
      if(admin())html+='<div class="field"><label>Empleado</label><select id="attEmployee" onchange="attChangeEmployee(this.value)">'+data.ops.map(function(r){return '<option value="'+esc(r.id)+'" '+(r.id===data.id?'selected':'')+'>'+esc(r.nombre)+'</option>';}).join('')+'</select></div>';
      html+='</div>';
      var t=data.report.total;
      html+='<div class="sidecard" style="margin:15px 0"><strong>'+esc(data.employee.nombre)+'</strong><p>Llegadas tarde: '+t.tardanzas+' · '+duration(t.minutosTarde)+'</p><p>Salidas anticipadas: '+t.salidasAntes+' · '+duration(t.minutosSalida)+'</p><p><strong>Total a revisar: '+duration(t.minutosTarde+t.minutosSalida)+'</strong></p><p>Sin registro de entrada: '+t.sinIngreso+' días · Sin registro de salida: '+t.sinSalida+' días (no se consideran ausencias automáticamente).</p></div>';
      html+='<div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Ingreso</th><th>Salida</th><th>Tiempo de tardanza</th><th>Salida anticipada</th></tr></thead><tbody>';
      html+=data.report.rows.map(function(r){return '<tr><td>'+esc(r.fecha)+'</td><td>'+esc(hhmm(r.entrada))+'</td><td>'+esc(hhmm(r.salida))+'</td><td>'+duration(r.tarde)+'</td><td>'+duration(r.anticipada)+'</td></tr>';}).join('');
      html+='</tbody></table></div><div class="actions"><button type="button" class="btn secondary" onclick="attPrint()">Imprimir / Guardar PDF</button></div></section>';
    }
    if(admin()&&computer()&&configured()&&getKey()){
      html+='<section class="panel"><div class="panelhead"><div><div class="eyebrow">ADMINISTRACIÓN</div><h3>Corregir fichaje con motivo</h3></div></div>';
      html+='<p class="sectionnote">El ajuste no borra el original. Queda registrado quién corrigió, cuándo y por qué.</p>';
      html+='<div class="grid"><div class="field"><label>Empleado</label><select id="attAdjustOperator">'+data.ops.map(function(o){return '<option value="'+esc(o.id)+'">'+esc(o.nombre)+'</option>';}).join('')+'</select></div><div class="field"><label>Fecha</label><input id="attAdjustDate" type="date" value="'+esc(date)+'" max="'+esc(date)+'"></div><div class="field"><label>Tipo</label><select id="attAdjustKind"><option value="entrada">Ingreso</option><option value="salida">Salida</option></select></div><div class="field"><label>Hora corregida</label><input id="attAdjustTime" type="time" required></div><div class="field full"><label>Motivo (obligatorio)</label><input id="attAdjustReason" placeholder="Ej.: olvido de fichaje, autorizado por gerencia"></div><div class="field"><label>PIN del administrador</label><input id="attAdjustPin" type="password" inputmode="numeric" autocomplete="off"></div><div class="actions"><button type="button" class="btn primary" onclick="attAdjust()">Guardar ajuste</button></div></div></section>';
      var changes=events.filter(function(r){return r.tipo==='ajuste'&&r.fecha.slice(0,7)===selectedMonth&&r.operadorId===selectedOperator;});
      if(changes.length)html+='<section class="panel"><h3>Auditoría de cambios</h3><div class="tablewrap"><table><thead><tr><th>Fecha</th><th>Tipo</th><th>Hora nueva</th><th>Motivo</th><th>Autorizó</th><th>Registrado</th></tr></thead><tbody>'+changes.map(function(r){return '<tr><td>'+esc(r.fecha)+'</td><td>'+esc(r.objetivo)+'</td><td>'+esc(r.hora)+'</td><td>'+esc(r.motivo)+'</td><td>'+esc(r.admin)+'</td><td>'+esc(r.creado)+'</td></tr>';}).join('')+'</tbody></table></div></section>';
    }
    host.innerHTML=html;
  }
  function updateError(e){notify(e&&e.message||String(e));}
  window.attSaveKiosk=function(){
    if(!admin()||!computer())return;
    var x=String(document.getElementById('attDeviceKey').value||'').trim();
    if(x.length<24){alert('La clave de puesto no es válida.');return;}
    localStorage.setItem(KEY,x);errorText='PC vinculada. Comprobando servidor...';render();window.attRefresh();
  };
  window.attUnlinkKiosk=function(){
    if(!admin()||!computer()||!confirm('¿Desvincular esta computadora de asistencia?'))return;
    localStorage.removeItem(KEY);events=[];errorText='PC desvinculada';render();
  };
  window.attChangeMonth=function(v){if(/^\d{4}-\d{2}$/.test(v)){selectedMonth=v;errorText='';render();}};
  window.attChangeEmployee=function(v){if(admin()){selectedOperator=v;errorText='';render();}};
  window.attRefresh=async function(){
    if(loading)return;
    loading=true;try{await pull();errorText='Datos actualizados desde el servidor.';}catch(e){updateError(e);}finally{loading=false;render();}
  };
  window.attMark=async function(kind){
    var user=op(),pin=document.getElementById('attPin')?.value||'';
    if(!user||!computer()||!['entrada','salida'].includes(kind)||loading)return;
    if(!pin.trim()){notify('Ingresá tu PIN personal.');return;}
    var id=crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random();
    loading=true;notify('Registrando en el servidor...');try{
      await post({kind:'punch',tipo:kind,operadorId:user.id,pin:pin,solicitud:id});
      if(!await confirmed(id))throw new Error('No se pudo confirmar el fichaje. No lo des por registrado.');
      errorText=(kind==='entrada'?'Ingreso':'Salida')+' confirmado por el servidor.';
    }catch(e){updateError(e);}finally{loading=false;render();}
  };
  window.attAdjust=async function(){
    if(!admin()||!computer()||loading)return;
    var id=document.getElementById('attAdjustOperator')?.value||'';
    var date=document.getElementById('attAdjustDate')?.value||'';
    var kind=document.getElementById('attAdjustKind')?.value||'';
    var time=document.getElementById('attAdjustTime')?.value||'';
    var reason=(document.getElementById('attAdjustReason')?.value||'').trim();
    var pin=document.getElementById('attAdjustPin')?.value||'';
    if(!id||!date||!time||reason.length<6||!pin){notify('Completá todos los campos. El motivo debe tener 6 caracteres o más.');return;}
    if(!confirm('¿Registrar este ajuste? Quedará auditado.'))return;
    var rid=crypto.randomUUID?crypto.randomUUID():String(Date.now())+'-'+Math.random();
    loading=true;notify('Guardando ajuste...');try{
      await post({kind:'adjust',operadorId:id,fecha:date,objetivo:kind,hora:time,motivo:reason,adminId:op().id,pin:pin,solicitud:rid});
      if(!await confirmed(rid))throw new Error('El ajuste no fue confirmado por el servidor.');
      errorText='Ajuste guardado con auditoría.';
    }catch(e){updateError(e);}finally{loading=false;render();}
  };
  window.attPrint=function(){
    var d=selectData();if(!d)return;
    var t=d.report.total;
    var rows=d.report.rows.map(function(r){return '<tr><td>'+esc(r.fecha)+'</td><td>'+esc(hhmm(r.entrada))+'</td><td>'+esc(hhmm(r.salida))+'</td><td>'+duration(r.tarde)+'</td><td>'+duration(r.anticipada)+'</td></tr>';}).join('');
    var w=window.open('','_blank');if(!w){alert('Permití ventanas emergentes para exportar el reporte.');return;}
    var doc='<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Asistencia '+esc(d.employee.nombre)+'</title><style>body{font:14px Arial,sans-serif;color:#17243a;margin:35px}table{width:100%;border-collapse:collapse;margin-top:22px}th,td{border:1px solid #ccc;padding:8px;text-align:left}th{background:#eef2f6}h1{color:#0d5bd8}@media print{button{display:none}}</style></head><body><h1>NQN Service · Asistencia</h1><p><b>Empleado:</b> '+esc(d.employee.nombre)+' · <b>Mes:</b> '+esc(selectedMonth)+'</p><p><b>Tardanzas:</b> '+t.tardanzas+' ('+duration(t.minutosTarde)+') · <b>Salidas anticipadas:</b> '+t.salidasAntes+' ('+duration(t.minutosSalida)+')</p><p><b>Total a revisar:</b> '+duration(t.minutosTarde+t.minutosSalida)+' · <b>Sin entrada:</b> '+t.sinIngreso+' · <b>Sin salida:</b> '+t.sinSalida+'</p><p>Los días sin fichaje requieren revisión; no constituyen ausencias confirmadas.</p><table><thead><tr><th>Fecha</th><th>Ingreso</th><th>Salida</th><th>Tiempo de tardanza</th><th>Salida anticipada</th></tr></thead><tbody>'+rows+'</tbody></table><p>Reporte de consulta, sin descuento salarial automático.</p><button onclick="window.print()">Imprimir / Guardar PDF</button></body></html>';
    w.document.write(doc);w.document.close();
  };
  function show(){
    addMenu();selectedMonth=selectedMonth||today().slice(0,7);
    var user=op();if(!user)return;
    selectedOperator=admin()?(selectedOperator||user.id):user.id;
    events=[];errorText='';
    render();
    if(configured()&&getKey()&&computer())window.attRefresh();
  }
  var previous=window.showView;
  window.showView=function(v){if(v==='asistencia')return show();return previous.apply(this,arguments);};
  var baseLogout=window.logoutOperator;
  if(typeof baseLogout==='function')window.logoutOperator=function(){baseLogout.apply(this,arguments);var b=document.getElementById('nav-asistencia');if(b)b.style.display='none';};
  var baseLogin=window.loginOperator;
  if(typeof baseLogin==='function')window.loginOperator=async function(){var v=await baseLogin.apply(this,arguments);var b=document.getElementById('nav-asistencia');if(b)b.style.display=op()?'':'none';return v;};
  var baseCreateAdmin=window.createFirstAdmin;
  if(typeof baseCreateAdmin==='function')window.createFirstAdmin=async function(){var v=await baseCreateAdmin.apply(this,arguments);var b=document.getElementById('nav-asistencia');if(b)b.style.display=op()?'':'none';return v;};
  addMenu();
  var menu=document.getElementById('nav-asistencia');if(menu)menu.style.display=op()?'':'none';
})();