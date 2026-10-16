/* NQN Service | Asistencia - Google Apps Script
 * Agregar este archivo al MISMO proyecto de Apps Script donde vive codigo.gs.
 * Los hooks de doGet / doPost están documentados en INSTALAR_ASISTENCIA.md.
 * Nunca colocar la clave de puesto en el repositorio.
 */
const ATTENDANCE_HEADERS = ['ID','Solicitud','Operador ID','Empleado','Fecha','Tipo','Hora','Registrado en servidor','Objetivo del ajuste','Motivo','Admin ID','Administrador','JSON'];
const ATTENDANCE_TIMEZONE = 'America/Argentina/Buenos_Aires';

function setupAttendanceKiosk() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('NQN_ATTENDANCE_KIOSK_KEY');
  if (!secret) {
    secret = Utilities.getUuid().replace(/-/g,'') + Utilities.getUuid().replace(/-/g,'');
    props.setProperty('NQN_ATTENDANCE_KIOSK_KEY',secret);
  }
  Logger.log('Clave privada para vincular la PC del taller: ' + secret);
  return {ok:true,configured:true};
}
function attendanceKioskAuthorized_(key) {
  const configured = PropertiesService.getScriptProperties().getProperty('NQN_ATTENDANCE_KIOSK_KEY') || '';
  return configured.length >= 32 && String(key || '') === configured;
}
function attendanceSheet_(ss) {
  let sh=ss.getSheetByName('ASISTENCIA');
  if (!sh) sh=ss.insertSheet('ASISTENCIA');
  if (!sh.getLastRow()) {
    sh.getRange(1,1,1,ATTENDANCE_HEADERS.length).setValues([ATTENDANCE_HEADERS]);
    sh.setFrozenRows(1);
  }
  return sh;
}
function attendanceDoGet_(params) {
  if (!attendanceKioskAuthorized_(params.deviceKey))
    return jsonp_(params.callback,{ok:false,error:'Computadora no autorizada para asistencia'});
  const ctx=getContext_();
  const sh=attendanceSheet_(ctx.ss);
  return jsonp_(params.callback,{ok:true,events:readJsonRows_(sh,ATTENDANCE_HEADERS.length),serverAt:new Date().toISOString()});
}
function attendancePinHash_(pin) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,
    'NQN_SERVICE_PIN|' + String(pin), Utilities.Charset.UTF_8);
  return digest.map(x => ('0' + (x & 255).toString(16)).slice(-2)).join('');
}
function attendanceLegacyHash_(pin) {
  const raw = 'NQN_SERVICE_PIN|' + String(pin);
  let h = 2166136261;
  for (let i=0;i<raw.length;i++) { h ^= raw.charCodeAt(i); h = Math.imul(h,16777619); }
  return 'fnv1a-' + (h >>> 0).toString(16);
}
function attendancePinValid_(operator,value) {
  if (!operator || operator.activo === false || !operator.pinHash) return false;
  const pin=String(value||'').trim(), digits=pin.replace(/\D/g,'');
  const candidates=[pin,digits];
  if (digits.length===4) candidates.push(digits.slice(0,2)+'-'+digits.slice(2));
  return [...new Set(candidates.filter(Boolean))].some(p =>
    operator.pinHash===attendancePinHash_(p)||operator.pinHash===attendanceLegacyHash_(p));
}
function attendanceTime_(date) {
  return Utilities.formatDate(date,ATTENDANCE_TIMEZONE,'HH:mm');
}
function attendanceDate_(date) {
  return Utilities.formatDate(date,ATTENDANCE_TIMEZONE,'yyyy-MM-dd');
}
function attendanceValidTime_(x) {
  if(!/^\d{2}:\d{2}$/.test(String(x||'')))return false;
  const h=Number(x.slice(0,2)),m=Number(x.slice(3,5));
  return h>=0&&h<=23&&m>=0&&m<=59;
}
function attendanceCurrent_(events,operatorId,day) {
  const out={entrada:'',salida:''};
  events.forEach(r=>{
    if(String(r.operadorId)!==String(operatorId)||r.fecha!==day)return;
    if(r.tipo==='entrada'||r.tipo==='salida')out[r.tipo]=r.hora;
    else if(r.tipo==='ajuste'&&(r.objetivo==='entrada'||r.objetivo==='salida'))out[r.objetivo]=r.hora;
  });
  return out;
}
function attendanceEvent_(body) {
  if(!attendanceKioskAuthorized_(body.deviceKey))
    return {ok:false,error:'Computadora no autorizada'};
  const lock=LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ss=getContext_().ss;
    const sh=ensureSheets_(ss);
    const people=readJsonRows_(sh.operators,OPERATOR_HEADERS.length);
    const attendance=attendanceSheet_(ss);
    const events=readJsonRows_(attendance,ATTENDANCE_HEADERS.length);
    const requestId=String(body.solicitud||'').trim();
    if(!/^[\w-]{16,100}$/.test(requestId))
      return {ok:false,error:'Identificador de solicitud inválido'};
    const existing=events.find(r=>r.solicitud===requestId);
    if(existing)return {ok:true,id:existing.id,created:false};
    const who=people.find(r=>String(r.id)===String(body.operadorId)&&r.activo!==false);
    if(!who)return {ok:false,error:'Empleado inactivo o inexistente'};
    const kind=String(body.kind||''),clock=new Date(),now=clock.toISOString(),today=attendanceDate_(clock);
    const row={id:Utilities.getUuid(),solicitud:requestId,operadorId:String(who.id),
      operador:String(who.nombre||''),fecha:today,tipo:'',hora:'',creado:now,
      objetivo:'',motivo:'',adminId:'',admin:''};
    if(kind==='punch'){
      if(!attendancePinValid_(who,body.pin))return {ok:false,error:'PIN incorrecto'};
      const typ=String(body.tipo||'');
      if(typ!=='entrada'&&typ!=='salida')return {ok:false,error:'Tipo de fichaje inválido'};
      const current=attendanceCurrent_(events,who.id,today);
      if(typ==='entrada'&&(current.entrada||current.salida))
        return {ok:false,error:'El ingreso ya está registrado'};
      if(typ==='salida'&&(!current.entrada||current.salida))
        return {ok:false,error:'No hay ingreso abierto o la salida ya está registrada'};
      row.tipo=typ;
      row.hora=attendanceTime_(clock);
    }else if(kind==='adjust'){
      const manager=people.find(r=>String(r.id)===String(body.adminId)&&r.activo!==false&&r.rol==='admin');
      if(!manager||!attendancePinValid_(manager,body.pin))
        return {ok:false,error:'Administrador o PIN inválido'};
      const day=String(body.fecha||''),target=String(body.objetivo||'');
      if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||isNaN(Date.parse(day+'T12:00:00'))||day>today)
        return {ok:false,error:'Fecha de corrección inválida'};
      if((target!=='entrada'&&target!=='salida')||!attendanceValidTime_(body.hora))
        return {ok:false,error:'Hora o tipo de corrección inválido'};
      const reason=String(body.motivo||'').trim();
      if(reason.length<6||reason.length>500)
        return {ok:false,error:'El motivo debe tener entre 6 y 500 caracteres'};
      row.tipo='ajuste';row.fecha=day;row.objetivo=target;
      row.hora=String(body.hora);row.motivo=reason;
      row.adminId=String(manager.id);row.admin=String(manager.nombre||'');
    }else return {ok:false,error:'Operación inválida'};
    attendance.appendRow([row.id,row.solicitud,row.operadorId,row.operador,row.fecha,
      row.tipo,row.hora,row.creado,row.objetivo,row.motivo,row.adminId,row.admin,JSON.stringify(row)]);
    return {ok:true,id:row.id,created:true,serverAt:now};
  }finally{lock.releaseLock();}
}