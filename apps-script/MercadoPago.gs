/** Mercado Pago Checkout Pro vía Orders API. */

function createMercadoPagoOrder_(data) {
  const cfg = getConfig_();
  if (!bool_(cfg.MERCADO_PAGO_ENABLED)) {
    return {ok:false, configured:false, error:'Mercado Pago está desactivado en Configuracion.'};
  }
  const token = PropertiesService.getScriptProperties().getProperty('MP_ACCESS_TOKEN');
  if (!token) return {ok:false, configured:false, error:'Falta MP_ACCESS_TOKEN en Script Properties.'};

  const orderId = String(data.order_id || data.pedido_id || '').trim();
  if (!orderId) throw new Error('Falta order_id. Primero registra el pedido con saveOrder.');
  const order = findOrder_(orderId);
  if (!order) throw new Error('Pedido no encontrado: ' + orderId);
  if (String(order.Metodo_Pago) !== 'Mercado Pago') throw new Error('El pedido no fue registrado con Mercado Pago.');

  // Idempotencia local: si ya existe una order de MP, consulta y devuelve su estado.
  if (order.MercadoPago_Order_ID) {
    const current = fetchMercadoPagoOrder_(String(order.MercadoPago_Order_ID), token);
    return {ok:true, order_id:orderId, mercado_pago_order_id:current.id, checkout_url:current.checkout_url || '', status:current.status, reused:true};
  }

  const total = num_(order.Total);
  const amount = total.toFixed(2);
  const body = {
    type: 'online',
    processing_mode: 'manual',
    total_amount: amount,
    external_reference: orderId,
    description: `Luna de Cacao · ${order.Presentacion}`,
    items: [{
      title: `Luna de Cacao · ${order.Presentacion}`,
      quantity: 1,
      unit_measure: 'unit',
      unit_price: amount,
      total_amount: amount
    }],
    config: {
      online: {
        success_url: String(cfg.MP_SUCCESS_URL || cfg.PUBLIC_SITE_URL || ''),
        failure_url: String(cfg.MP_FAILURE_URL || cfg.PUBLIC_SITE_URL || ''),
        pending_url: String(cfg.MP_PENDING_URL || cfg.PUBLIC_SITE_URL || ''),
        auto_return: 'approved'
      }
    }
  };

  const response = UrlFetchApp.fetch('https://api.mercadopago.com/v1/orders', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      'X-Idempotency-Key': Utilities.getUuid(),
      Accept: 'application/json'
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  let mp;
  try { mp = JSON.parse(text); } catch (e) { mp = {raw:text}; }
  if (code < 200 || code >= 300 || !mp.checkout_url) {
    logEvent_('MP_CREATE_ERROR', orderId, 'Mercado Pago', String(code), text.slice(0,2000), body);
    throw new Error('Mercado Pago no creó la orden. HTTP ' + code + ': ' + (mp.message || text.slice(0,300)));
  }

  updateOrderPayment_(orderId, {mpOrderId:mp.id, paymentState:'Pendiente'});
  updatePaymentRecord_(orderId, {mpOrderId:mp.id, mpStatus:mp.status || 'created', paymentState:'Pendiente'});
  logEvent_('MP_ORDER_CREATED', orderId, 'Mercado Pago', 'OK', mp.id, {status:mp.status});
  return {ok:true, configured:true, order_id:orderId, mercado_pago_order_id:mp.id, checkout_url:mp.checkout_url, status:mp.status};
}

function syncPayment_(data) {
  const token = PropertiesService.getScriptProperties().getProperty('MP_ACCESS_TOKEN');
  if (!token) throw new Error('Falta MP_ACCESS_TOKEN en Script Properties.');
  const localId = String(data.order_id || data.pedido_id || '').trim();
  const order = localId ? findOrder_(localId) : null;
  const mpId = String(data.mercado_pago_order_id || (order && order.MercadoPago_Order_ID) || '').trim();
  if (!mpId) throw new Error('No existe MercadoPago_Order_ID para sincronizar.');

  const mp = fetchMercadoPagoOrder_(mpId, token);
  const localState = mapMpStatus_(mp.status, mp.status_detail);
  const localOrderId = String((order && order.Pedido_ID) || mp.external_reference || localId || '');
  if (localOrderId) {
    updateOrderPayment_(localOrderId, {mpOrderId:mp.id, paymentState:localState, confirmIfPaid:localState==='Pagado'});
    updatePaymentRecord_(localOrderId, {mpOrderId:mp.id, mpStatus:`${mp.status || ''}/${mp.status_detail || ''}`, paymentState:localState});
  }
  logEvent_('MP_SYNC', localOrderId, 'Mercado Pago', localState, mp.id, {status:mp.status,status_detail:mp.status_detail});
  return {ok:true, order_id:localOrderId, mercado_pago_order_id:mp.id, status:mp.status, status_detail:mp.status_detail, payment_status:localState};
}

function fetchMercadoPagoOrder_(mpId, token) {
  const response = UrlFetchApp.fetch('https://api.mercadopago.com/v1/orders/' + encodeURIComponent(mpId), {
    method:'get', headers:{Authorization:'Bearer '+token, Accept:'application/json'}, muteHttpExceptions:true
  });
  const code = response.getResponseCode();
  const text = response.getContentText();
  let obj;
  try { obj = JSON.parse(text); } catch (e) { obj = {raw:text}; }
  if (code < 200 || code >= 300) throw new Error('No fue posible consultar Mercado Pago. HTTP ' + code + ': ' + (obj.message || text.slice(0,300)));
  return obj;
}

function mapMpStatus_(status, detail) {
  status = String(status || ''); detail = String(detail || '');
  if (status === 'processed' && detail === 'accredited') return 'Pagado';
  if (status === 'refunded' || detail === 'refunded' || detail === 'partially_refunded') return 'Reembolsado';
  if (status === 'failed' || status === 'canceled') return 'Fallido';
  return 'Pendiente';
}

function findOrder_(orderId) {
  return rowsToObjects_(LDC.SHEETS.ORDERS).find(r => String(r.Pedido_ID) === String(orderId)) || null;
}

function updateOrderPayment_(orderId, patch) {
  const order = findOrder_(orderId);
  if (!order) return;
  const sh = getSheet_(LDC.SHEETS.ORDERS);
  const map = headerMap_(LDC.SHEETS.ORDERS);
  if (patch.paymentState) sh.getRange(order._row, map.Estado_Pago).setValue(patch.paymentState);
  if (patch.mpOrderId) sh.getRange(order._row, map.MercadoPago_Order_ID).setValue(patch.mpOrderId);
  if (patch.confirmIfPaid && String(order.Estado) === 'Nuevo') sh.getRange(order._row, map.Estado).setValue('Confirmado');
  sh.getRange(order._row, map.Ultima_Actualizacion).setValue(now_());
}

function updatePaymentRecord_(orderId, patch) {
  const rows = rowsToObjects_(LDC.SHEETS.PAYMENTS);
  const row = rows.slice().reverse().find(r => String(r.Pedido_ID) === String(orderId));
  if (!row) return;
  const sh = getSheet_(LDC.SHEETS.PAYMENTS);
  const map = headerMap_(LDC.SHEETS.PAYMENTS);
  if (patch.paymentState) sh.getRange(row._row, map.Estado).setValue(patch.paymentState);
  if (patch.mpOrderId) sh.getRange(row._row, map.MercadoPago_Order_ID).setValue(patch.mpOrderId);
  if (patch.mpStatus) sh.getRange(row._row, map.MercadoPago_Status).setValue(patch.mpStatus);
}

/** Ejecutable manual desde el menú de la hoja. */
function sincronizarPagosPendientes() {
  const rows = rowsToObjects_(LDC.SHEETS.ORDERS).filter(r => r.MercadoPago_Order_ID && String(r.Estado_Pago) === 'Pendiente');
  let ok = 0, fail = 0;
  rows.forEach(r => {
    try { syncPayment_({order_id:r.Pedido_ID}); ok++; }
    catch (e) { fail++; logEvent_('MP_SYNC_ERROR', r.Pedido_ID, 'Manual', 'ERROR', e.message, null); }
  });
  SpreadsheetApp.getUi().alert('Sincronización Mercado Pago', `Actualizados: ${ok}\nErrores: ${fail}`, SpreadsheetApp.getUi().ButtonSet.OK);
}
