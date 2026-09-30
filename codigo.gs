const NQN_ACCESS_TOKEN = "NQN--jhsACAfN5LPuj-ncaYiiqlLZyjfNnhE";
const NQN_SCHEMA_VERSION = 4;
const ORDER_HEADERS = ['ID','N° Orden','N° Cliente','Fecha ingreso','Fecha entrega','Cliente','Teléfono','Marca / Modelo','Tipo','Falla / diagnóstico','Accesorios','Observaciones','Estado','Monto','Pagado','Medio de pago','Creado','Actualizado','JSON'];
const EVENT_HEADERS = ['ID','Fecha','Evento','Monto','Medio de pago','Observaciones','Creado','Actualizado','JSON'];
const CASH_HEADERS = ['ID','Fecha','Operador','Efectivo','Mercado Pago / Transferencias','Tarjetas','Nota de crédito','Gastos','Total cobrado','Neto','Observaciones','Creado','Actualizado','JSON'];
const OPERATOR_HEADERS = ['ID','Nombre','Rol','Activo','PIN hash','Creado','Actualizado','JSON'];
const TURNO_HEADERS = ['ID','Fecha','Hora','Cliente','Teléfono','Motivo / servicio','Estado','Observaciones','Creado','Actualizado','JSON'];

function normalizeAccessToken_(value) {
  let s = String(value == null ? '' : value).trim();

  // Si se pegó desde el código incluyendo comillas, extrae solo el valor.
  const quoted = s.match(/["'“”‘’]([^"'“”‘’]+)["'“”‘’]/);
  if (quoted && quoted[1]) s = quoted[1];

  // Limpia comillas, espacios y signos que suelen copiarse junto al token.
  return s.replace(/^[\s"'“”‘’`;=]+|[\s"'“”‘’`;]+$/g, '').trim();
}

function isAuthorizedToken_(value) {
  const props = PropertiesService.getScriptProperties();
  const allowed = [
    NQN_ACCESS_TOKEN,
    props.getProperty('SYNC_KEY')
  ]
    .map(normalizeAccessToken_)
    .filter(Boolean);

  return allowed.includes(normalizeAccessToken_(value));
}

function setupNQNService() {
  const ctx = getContext_();
  ensureSheets_(ctx.ss);
  const result = {
    ok: true,
    spreadsheetUrl: ctx.ss.getUrl(),
    rootFolderUrl: 'https://drive.google.com/drive/folders/' + ctx.rootFolder.getId(),
    backupFolderUrl: 'https://drive.google.com/drive/folders/' + ctx.backupFolder.getId()
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function doGet(e) {
  try {
    const p = (e && e.parameter) || {};
    if (!isAuthorizedToken_(p.token)) return jsonp_(p.callback, {ok:false,error:'Acceso no autorizado'});
    const action = p.action || 'pull';
    if (action === 'pull' || action === 'ping') {
      const state = readState_();
      return jsonp_(p.callback, state);
    }
    return jsonp_(p.callback, {ok:false,error:'Acción desconocida'});
  } catch (err) {
    return jsonp_(e && e.parameter && e.parameter.callback, {ok:false,error:String(err && err.message || err)});
  }
}

function doPost(e) {
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!isAuthorizedToken_(body.token)) return json_({ok:false,error:'Acceso no autorizado'});
    if (body.action !== 'apply' || !Array.isArray(body.ops)) return json_({ok:false,error:'Solicitud inválida'});
    const result = applyOperations_(body.ops, body.device || '');
    return json_(result);
  } catch (err) {
    return json_({ok:false,error:String(err && err.message || err)});
  }
}

function getContext_() {
  const props = PropertiesService.getScriptProperties();
  let rootId = props.getProperty('NQN_ROOT_FOLDER_ID');
  let backupId = props.getProperty('NQN_BACKUP_FOLDER_ID');
  let spreadsheetId = props.getProperty('NQN_SPREADSHEET_ID');
  let rootFolder, backupFolder, ss;

  try { if (rootId) rootFolder = DriveApp.getFolderById(rootId); } catch (_) {}
  if (!rootFolder) {
    rootFolder = DriveApp.createFolder('NQN SERVICE CLOUD');
    props.setProperty('NQN_ROOT_FOLDER_ID', rootFolder.getId());
  }

  try { if (backupId) backupFolder = DriveApp.getFolderById(backupId); } catch (_) {}
  if (!backupFolder) {
    backupFolder = rootFolder.createFolder('BACKUPS AUTOMÁTICOS');
    props.setProperty('NQN_BACKUP_FOLDER_ID', backupFolder.getId());
  }

  try { if (spreadsheetId) ss = SpreadsheetApp.openById(spreadsheetId); } catch (_) {}
  if (!ss) {
    ss = SpreadsheetApp.create('NQN Service - Base central');
    DriveApp.getFileById(ss.getId()).moveTo(rootFolder);
    props.setProperty('NQN_SPREADSHEET_ID', ss.getId());
  }
  return {rootFolder, backupFolder, ss};
}

function ensureSheets_(ss) {
  let orders = ss.getSheetByName('ORDENES');
  if (!orders) orders = ss.insertSheet('ORDENES');
  let events = ss.getSheetByName('CLERIS');
  if (!events) events = ss.insertSheet('CLERIS');
  let cash = ss.getSheetByName('CAJA');
  if (!cash) cash = ss.insertSheet('CAJA');
  let operators = ss.getSheetByName('OPERADORES');
  if (!operators) operators = ss.insertSheet('OPERADORES');
  let turnos = ss.getSheetByName('TURNOS');
  if (!turnos) turnos = ss.insertSheet('TURNOS');
  let info = ss.getSheetByName('INFO');
  if (!info) info = ss.insertSheet('INFO');

  if (orders.getLastRow() === 0) {
    orders.getRange(1,1,1,ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
    orders.setFrozenRows(1);
  }
  if (events.getLastRow() === 0) {
    events.getRange(1,1,1,EVENT_HEADERS.length).setValues([EVENT_HEADERS]);
    events.setFrozenRows(1);
  }
  if (cash.getLastRow() === 0) {
    cash.getRange(1,1,1,CASH_HEADERS.length).setValues([CASH_HEADERS]);
    cash.setFrozenRows(1);
  }
  if (operators.getLastRow() === 0) {
    operators.getRange(1,1,1,OPERATOR_HEADERS.length).setValues([OPERATOR_HEADERS]);
    operators.setFrozenRows(1);
  }
  if (turnos.getLastRow() === 0) {
    turnos.getRange(1,1,1,TURNO_HEADERS.length).setValues([TURNO_HEADERS]);
    turnos.setFrozenRows(1);
  }
  try { operators.hideColumns(5); operators.hideColumns(8); } catch (_) {}
  info.getRange('A1:B5').setValues([
    ['NQN SERVICE','Base central sincronizada'],
    ['Versión de esquema',NQN_SCHEMA_VERSION],
    ['Uso','Base de consulta. No editar manualmente las hojas ORDENES, CLERIS, CAJA, OPERADORES ni TURNOS'],
    ['Backups','Carpeta BACKUPS AUTOMÁTICOS en Drive'],
    ['Última actualización',new Date()]
  ]);
  info.autoResizeColumns(1,2);
  return {orders, events, cash, operators, turnos, info};
}

function readState_() {
  const ctx = getContext_();
  const sh = ensureSheets_(ctx.ss);
  const orders = readJsonRows_(sh.orders, ORDER_HEADERS.length);
  const events = readJsonRows_(sh.events, EVENT_HEADERS.length);
  const cash = readJsonRows_(sh.cash, CASH_HEADERS.length);
  const operators = readJsonRows_(sh.operators, OPERATOR_HEADERS.length);
  const turnos = readJsonRows_(sh.turnos, TURNO_HEADERS.length);
  return {
    ok: true,
    schema: NQN_SCHEMA_VERSION,
    syncAt: new Date().toISOString(),
    ordenes: orders.sort((a,b)=>(Number(a.numero)||0)-(Number(b.numero)||0)),
    cleriseventos: events.sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||''))),
    cierrescaja: cash.sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||''))),
    operadores: operators.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es')),
    turnos: turnos.sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||'')) || String(a.hora||'').localeCompare(String(b.hora||''))),
    meta: {
      spreadsheetUrl: ctx.ss.getUrl(),
      rootFolderUrl: 'https://drive.google.com/drive/folders/' + ctx.rootFolder.getId(),
      backupFolderUrl: 'https://drive.google.com/drive/folders/' + ctx.backupFolder.getId()
    }
  };
}

function readJsonRows_(sheet, width) {
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const values = sheet.getRange(2,1,last-1,width).getValues();
  const out = [];
  values.forEach(row => {
    const raw = row[width-1];
    if (!raw) return;
    try {
      const obj = JSON.parse(raw);
      if (obj && obj.id) out.push(obj);
    } catch (_) {}
  });
  return out;
}

function applyOperations_(ops, device) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const ctx = getContext_();
    const sh = ensureSheets_(ctx.ss);
    let orders = readJsonRows_(sh.orders, ORDER_HEADERS.length);
    let events = readJsonRows_(sh.events, EVENT_HEADERS.length);
    let cash = readJsonRows_(sh.cash, CASH_HEADERS.length);
    let operators = readJsonRows_(sh.operators, OPERATOR_HEADERS.length);
    let turnos = readJsonRows_(sh.turnos, TURNO_HEADERS.length);
    const orderMap = new Map(orders.map(x=>[String(x.id),x]));
    const eventMap = new Map(events.map(x=>[String(x.id),x]));
    const cashMap = new Map(cash.map(x=>[String(x.id),x]));
    const operatorMap = new Map(operators.map(x=>[String(x.id),x]));
    const turnoMap = new Map(turnos.map(x=>[String(x.id),x]));

    ops.forEach(op => {
      if (!op || !op.type || !op.id) return;
      if (op.type === 'upsertOrder' && op.data) upsertOrder_(orderMap, op.data);
      else if (op.type === 'deleteOrder') deleteOrder_(orderMap, op.id, op.at);
      else if (op.type === 'upsertEvent' && op.data) upsertEvent_(eventMap, op.data);
      else if (op.type === 'deleteEvent') deleteEvent_(eventMap, op.id, op.at);
      else if (op.type === 'upsertCash' && op.data) upsertCash_(cashMap, op.data);
      else if (op.type === 'deleteCash') deleteCash_(cashMap, op.id, op.at);
      else if (op.type === 'upsertOperator' && op.data) upsertOperator_(operatorMap, op.data);
      else if (op.type === 'deleteOperator') deleteOperator_(operatorMap, op.id, op.at);
      else if (op.type === 'upsertTurno' && op.data) upsertTurno_(turnoMap, op.data);
      else if (op.type === 'deleteTurno') deleteTurno_(turnoMap, op.id, op.at);
    });

    orders = Array.from(orderMap.values());
    events = Array.from(eventMap.values());
    cash = Array.from(cashMap.values());
    operators = Array.from(operatorMap.values());
    turnos = Array.from(turnoMap.values());
    canonicalizeOrders_(orders);
    writeOrders_(sh.orders, orders);
    writeEvents_(sh.events, events);
    writeCash_(sh.cash, cash);
    writeOperators_(sh.operators, operators);
    writeTurnos_(sh.turnos, turnos);
    sh.info.getRange('B5').setValue(new Date());
    maybeDailyBackup_(ctx, orders, events, cash, operators, turnos, device);

    return {ok:true,applied:ops.length,orders:orders.length,events:events.length,cash:cash.length,operators:operators.length,turnos:turnos.length};
  } finally {
    lock.releaseLock();
  }
}

function newerOrEqual_(incoming, existing) {
  const a = new Date(incoming && (incoming.actualizado || incoming.creado) || 0).getTime();
  const b = new Date(existing && (existing.actualizado || existing.creado) || 0).getTime();
  if (!a || !b) return true;
  return a >= b;
}

function upsertOrder_(map, incoming) {
  const id = String(incoming.id || '');
  if (!id) return;
  const old = map.get(id);
  if (old && !newerOrEqual_(incoming, old)) return;
  const x = Object.assign({}, old || {}, incoming);
  x.id = id;
  x.numero = Number(x.numero)||0;
  x.clienteNumero = Number(x.clienteNumero)||0;
  x.monto = Number(x.monto)||0;
  x.pagado = Number(x.pagado)||0;
  x.estado = x.fechaEntrega ? 'Entregado' : 'En taller';
  x.actualizado = x.actualizado || new Date().toISOString();
  x.creado = x.creado || x.actualizado;
  map.set(id, x);
}

function deleteOrder_(map, id, at) {
  const old = map.get(String(id));
  if (!old) return;
  const deleteAt = new Date(at || 0).getTime();
  const oldAt = new Date(old.actualizado || old.creado || 0).getTime();
  if (!deleteAt || !oldAt || deleteAt >= oldAt) map.delete(String(id));
}

function upsertEvent_(map, incoming) {
  const id = String(incoming.id || '');
  if (!id) return;
  const old = map.get(id);
  if (old && !newerOrEqual_(incoming, old)) return;
  const x = Object.assign({}, old || {}, incoming);
  x.id = id;
  x.monto = Number(x.monto)||0;
  x.actualizado = x.actualizado || x.creado || new Date().toISOString();
  x.creado = x.creado || x.actualizado;
  map.set(id, x);
}

function deleteEvent_(map, id, at) {
  const old = map.get(String(id));
  if (!old) return;
  const deleteAt = new Date(at || 0).getTime();
  const oldAt = new Date(old.actualizado || old.creado || 0).getTime();
  if (!deleteAt || !oldAt || deleteAt >= oldAt) map.delete(String(id));
}

function upsertCash_(map, incoming) {
  const id = String(incoming.id || '');
  if (!id) return;
  const old = map.get(id);
  if (old && !newerOrEqual_(incoming, old)) return;
  const x = Object.assign({}, old || {}, incoming);
  x.id = id;
  x.fecha = String(x.fecha || '');
  x.operador = String(x.operador || '').trim();
  x.efectivo = Math.max(0, Number(x.efectivo)||0);
  x.mercadoPago = Math.max(0, Number(x.mercadoPago)||0);
  x.tarjetas = Math.max(0, Number(x.tarjetas)||0);
  x.notaCredito = Math.max(0, Number(x.notaCredito)||0);
  x.gastos = Math.max(0, Number(x.gastos)||0);
  x.observaciones = String(x.observaciones || '');
  x.actualizado = x.actualizado || x.creado || new Date().toISOString();
  x.creado = x.creado || x.actualizado;
  map.set(id, x);
}

function deleteCash_(map, id, at) {
  const old = map.get(String(id));
  if (!old) return;
  const deleteAt = new Date(at || 0).getTime();
  const oldAt = new Date(old.actualizado || old.creado || 0).getTime();
  if (!deleteAt || !oldAt || deleteAt >= oldAt) map.delete(String(id));
}

function upsertOperator_(map, incoming) {
  const id = String(incoming.id || '');
  if (!id) return;
  const old = map.get(id);
  if (old && !newerOrEqual_(incoming, old)) return;
  const x = Object.assign({}, old || {}, incoming);
  x.id = id;
  x.nombre = String(x.nombre || '').trim();
  x.rol = String(x.rol || 'operador').toLowerCase() === 'admin' ? 'admin' : 'operador';
  x.activo = x.activo !== false;
  x.pinHash = String(x.pinHash || '');
  x.actualizado = x.actualizado || x.creado || new Date().toISOString();
  x.creado = x.creado || x.actualizado;
  if (x.nombre && x.pinHash) map.set(id, x);
}

function deleteOperator_(map, id, at) {
  const old = map.get(String(id));
  if (!old) return;
  const deleteAt = new Date(at || 0).getTime();
  const oldAt = new Date(old.actualizado || old.creado || 0).getTime();
  if (!deleteAt || !oldAt || deleteAt >= oldAt) map.delete(String(id));
}

function upsertTurno_(map, incoming) {
  const id = String(incoming.id || '');
  if (!id) return;
  const old = map.get(id);
  if (old && !newerOrEqual_(incoming, old)) return;
  const x = Object.assign({}, old || {}, incoming);
  x.id = id;
  x.fecha = String(x.fecha || '').slice(0,10);
  x.hora = String(x.hora || '');
  x.cliente = String(x.cliente || '').trim();
  x.telefono = String(x.telefono || '').trim();
  x.motivo = String(x.motivo || '').trim();
  x.observaciones = String(x.observaciones || '').trim();
  const estados = ['Pendiente','Confirmado','Completado','Cancelado'];
  x.estado = estados.includes(String(x.estado || '')) ? String(x.estado) : 'Pendiente';
  x.actualizado = x.actualizado || x.creado || new Date().toISOString();
  x.creado = x.creado || x.actualizado;
  if (x.fecha && x.hora && x.cliente) map.set(id, x);
}

function deleteTurno_(map, id, at) {
  const old = map.get(String(id));
  if (!old) return;
  const deleteAt = new Date(at || 0).getTime();
  const oldAt = new Date(old.actualizado || old.creado || 0).getTime();
  if (!deleteAt || !oldAt || deleteAt >= oldAt) map.delete(String(id));
}

function canonicalizeOrders_(orders) {
  orders.sort((a,b)=>new Date(a.creado||0)-new Date(b.creado||0));
  const usedOrder = new Set();
  let maxOrder = orders.reduce((m,x)=>Math.max(m,Number(x.numero)||0),0);
  orders.forEach(x=>{
    let n=Number(x.numero)||0;
    if (!n || usedOrder.has(n)) n=++maxOrder;
    x.numero=n;usedOrder.add(n);
  });

  const phoneToClient = new Map();
  const usedClient = new Set();
  let maxClient = Math.max(1000,...orders.map(x=>Number(x.clienteNumero)||0));
  orders.forEach(x=>{
    const phone = String(x.telefono||'').replace(/\D/g,'');
    if (phone && phoneToClient.has(phone)) {
      x.clienteNumero = phoneToClient.get(phone);
      return;
    }
    let c=Number(x.clienteNumero)||0;
    if (!c || usedClient.has(c)) c=++maxClient;
    x.clienteNumero=c;
    usedClient.add(c);
    if (phone) phoneToClient.set(phone,c);
  });
}

function writeOrders_(sheet, rows) {
  rows.sort((a,b)=>(Number(a.numero)||0)-(Number(b.numero)||0));
  sheet.clearContents();
  sheet.getRange(1,1,1,ORDER_HEADERS.length).setValues([ORDER_HEADERS]);
  if (rows.length) {
    const data = rows.map(x=>[
      x.id,Number(x.numero)||0,Number(x.clienteNumero)||0,x.fechaIngreso||'',x.fechaEntrega||'',x.cliente||'',x.telefono||'',x.marcaModelo||'',x.tipo||'',x.falla||'',x.accesorios||'',x.observaciones||'',x.estado||'',Number(x.monto)||0,Number(x.pagado)||0,x.medioPago||'',x.creado||'',x.actualizado||'',JSON.stringify(x)
    ]);
    sheet.getRange(2,1,data.length,ORDER_HEADERS.length).setValues(data);
  }
  sheet.setFrozenRows(1);
  sheet.getRange('N:O').setNumberFormat('$#,##0');
}

function writeEvents_(sheet, rows) {
  rows.sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||'')));
  sheet.clearContents();
  sheet.getRange(1,1,1,EVENT_HEADERS.length).setValues([EVENT_HEADERS]);
  if (rows.length) {
    const data = rows.map(x=>[
      x.id,x.fecha||'',x.descripcion||'',Number(x.monto)||0,x.medioPago||'',x.observaciones||'',x.creado||'',x.actualizado||'',JSON.stringify(x)
    ]);
    sheet.getRange(2,1,data.length,EVENT_HEADERS.length).setValues(data);
  }
  sheet.setFrozenRows(1);
  sheet.getRange('D:D').setNumberFormat('$#,##0');
}

function writeCash_(sheet, rows) {
  rows.sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||'')) || String(a.operador||'').localeCompare(String(b.operador||'')));
  sheet.clearContents();
  sheet.getRange(1,1,1,CASH_HEADERS.length).setValues([CASH_HEADERS]);
  if (rows.length) {
    const data = rows.map(x=>{
      const total = Number(x.efectivo||0)+Number(x.mercadoPago||0)+Number(x.tarjetas||0);
      const neto = total-Number(x.notaCredito||0)-Number(x.gastos||0);
      return [
        x.id,x.fecha||'',x.operador||'',Number(x.efectivo)||0,Number(x.mercadoPago)||0,Number(x.tarjetas)||0,
        Number(x.notaCredito)||0,Number(x.gastos)||0,total,neto,x.observaciones||'',x.creado||'',x.actualizado||'',JSON.stringify(x)
      ];
    });
    sheet.getRange(2,1,data.length,CASH_HEADERS.length).setValues(data);
  }
  sheet.setFrozenRows(1);
  sheet.getRange('D:J').setNumberFormat('$#,##0');
}

function writeOperators_(sheet, rows) {
  rows.sort((a,b)=>String(a.nombre||'').localeCompare(String(b.nombre||''),'es'));
  sheet.clearContents();
  sheet.getRange(1,1,1,OPERATOR_HEADERS.length).setValues([OPERATOR_HEADERS]);
  if (rows.length) {
    const data = rows.map(x=>[
      x.id,x.nombre||'',x.rol||'operador',x.activo!==false?'SI':'NO',x.pinHash||'',x.creado||'',x.actualizado||'',JSON.stringify(x)
    ]);
    sheet.getRange(2,1,data.length,OPERATOR_HEADERS.length).setValues(data);
  }
  sheet.setFrozenRows(1);
  try { sheet.hideColumns(5); sheet.hideColumns(8); } catch (_) {}
}

function writeTurnos_(sheet, rows) {
  rows.sort((a,b)=>String(a.fecha||'').localeCompare(String(b.fecha||'')) || String(a.hora||'').localeCompare(String(b.hora||'')));
  sheet.clearContents();
  sheet.getRange(1,1,1,TURNO_HEADERS.length).setValues([TURNO_HEADERS]);
  if (rows.length) {
    const data = rows.map(x=>[
      x.id,x.fecha||'',x.hora||'',x.cliente||'',x.telefono||'',x.motivo||'',x.estado||'Pendiente',x.observaciones||'',x.creado||'',x.actualizado||'',JSON.stringify(x)
    ]);
    sheet.getRange(2,1,data.length,TURNO_HEADERS.length).setValues(data);
  }
  sheet.setFrozenRows(1);
}

function maybeDailyBackup_(ctx, orders, events, cash, operators, turnos, device) {
  const props = PropertiesService.getScriptProperties();
  const tz = Session.getScriptTimeZone() || 'America/Argentina/Buenos_Aires';
  const day = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd');
  if (props.getProperty('NQN_LAST_BACKUP_DAY') === day) return;
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyy-MM-dd_HHmm');
  const payload = {
    app:'NQN Service',
    version:9,
    origen:'Google Drive Sync',
    creado:new Date().toISOString(),
    device:device||'',
    ordenes:orders,
    cleriseventos:events,
    cierrescaja:cash,
    operadores:operators,
    turnos:turnos
  };
  ctx.backupFolder.createFile('NQN_SERVICE_BACKUP_'+stamp+'.json', JSON.stringify(payload,null,2), MimeType.PLAIN_TEXT);
  props.setProperty('NQN_LAST_BACKUP_DAY', day);
  trimBackups_(ctx.backupFolder, 30);
}

function trimBackups_(folder, keep) {
  const arr = [];
  const it = folder.getFiles();
  while (it.hasNext()) {
    const f = it.next();
    if (/^NQN_SERVICE_BACKUP_.*\.json$/i.test(f.getName())) arr.push(f);
  }
  arr.sort((a,b)=>b.getDateCreated().getTime()-a.getDateCreated().getTime());
  arr.slice(keep).forEach(f=>f.setTrashed(true));
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function jsonp_(callback, obj) {
  const cb = String(callback || '').trim();
  const json = JSON.stringify(obj).replace(/<\//g,'<\\/');
  if (/^[A-Za-z_$][0-9A-Za-z_$.]*$/.test(cb)) {
    return ContentService.createTextOutput(cb+'('+json+');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return json_(obj);
}
