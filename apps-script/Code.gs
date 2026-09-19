/**
 * API Web App - Luna de Cacao
 * Compatible con el frontend de GitHub Pages.
 */

function doGet(e) {
  try {
    const action = String((e && e.parameter && e.parameter.action) || 'health');
    if (action === 'health') {
      return json_({ok:true, service:'Luna de Cacao', version:LDC.VERSION, time:new Date().toISOString()});
    }
    if (action === 'bootstrap') {
      return json_({
        ok: true,
        config: publicConfig_(),
        catalog: getPublicCatalog_(),
        presentations: getPublicPresentations_()
      });
    }
    if (action === 'catalog') return json_({ok:true, catalog:getPublicCatalog_()});
    if (action === 'presentations') return json_({ok:true, presentations:getPublicPresentations_()});
    return json_({ok:false, error:'Acción GET no reconocida'});
  } catch (err) {
    logEvent_('API_ERROR', '', 'doGet', 'ERROR', err.message, {stack:err.stack});
    return json_({ok:false, error:err.message});
  }
}

function doPost(e) {
  const data = parseBody_(e);
  try {
    const action = String(data.action || '').trim();
    if (action === 'saveOrder') return json_(saveOrder_(data));
    if (action === 'createPayment') return json_(createMercadoPagoOrder_(data));
    if (action === 'syncPayment') return json_(syncPayment_(data));

    // Las notificaciones de Mercado Pago se registran, pero la validación de firma
    // requiere cabeceras HTTP y Apps Script Web Apps no las exponen en doPost(e).
    if (data.type === 'order' || String(data.action || '').indexOf('order.') === 0) {
      logEvent_('MP_WEBHOOK_UNVERIFIED', data.data && data.data.external_reference || '', 'Mercado Pago', 'RECIBIDO', 'Webhook registrado sin procesar automáticamente por limitación de validación de firma en Apps Script.', data);
      return json_({ok:true, received:true});
    }

    return json_({ok:false, error:'Acción POST no reconocida'});
  } catch (err) {
    logEvent_('API_ERROR', data.order_id || data.pedido_id || '', 'doPost', 'ERROR', err.message, data);
    return json_({ok:false, error:err.message});
  }
}

function getPublicCatalog_() {
  return rowsToObjects_(LDC.SHEETS.CATALOG)
    .filter(r => String(r.Estado) !== 'Oculto')
    .sort((a,b) => num_(a.Orden) - num_(b.Orden))
    .map(r => ({
      id: String(r.ID_Sabor || ''),
      name: String(r.Nombre || ''),
      recipe: num_(r.Receta_PDF),
      status: String(r.Estado || ''),
      available: bool_(r.Disponible_Web) && bool_(r.Activo),
      order: num_(r.Orden),
      description: String(r.Descripcion_Corta || ''),
      image: String(r.Imagen || ''),
      extraPrice: num_(r.Precio_Extra),
      allergens: String(r.Alergenos_Notas || '')
    }));
}

function getPublicPresentations_() {
  return rowsToObjects_(LDC.SHEETS.PRESENTATIONS)
    .filter(r => bool_(r.Activa))
    .sort((a,b) => num_(a.Orden) - num_(b.Orden))
    .map(r => ({
      id: String(r.ID || ''),
      name: String(r.Nombre || ''),
      pieces: num_(r.Piezas),
      price: num_(r.Precio),
      combinable: bool_(r.Permite_Combinacion),
      description: String(r.Descripcion || '')
    }));
}

function saveOrder_(data) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const customerName = String(data.name || '').trim();
    const phone = normalizePhone_(data.phone);
    const municipality = String(data.municipality || '').trim();
    const paymentMethod = String(data.payment || '').trim();
    const items = Array.isArray(data.items) ? data.items.map(String) : [];

    if (!customerName) throw new Error('Falta el nombre del cliente.');
    if (phone.length !== 10) throw new Error('El WhatsApp debe contener 10 dígitos.');
    if (!municipality) throw new Error('Selecciona municipio.');
    if (!paymentMethod) throw new Error('Selecciona método de pago.');
    if (!items.length) throw new Error('El pedido no contiene sabores.');

    const cfg = getConfig_();
    const allowedMunicipalities = String(cfg.LAUNCH_MUNICIPALITIES || '').split('|').map(s=>s.trim()).filter(Boolean);
    if (allowedMunicipalities.length && allowedMunicipalities.indexOf(municipality) < 0) throw new Error('Municipio fuera de la zona de entrega actual.');

    const presentations = rowsToObjects_(LDC.SHEETS.PRESENTATIONS).filter(r => bool_(r.Activa));
    const presentation = presentations.find(r => String(r.ID) === String(data.presentationId || '') || String(r.Nombre) === String(data.presentation || ''));
    if (!presentation) throw new Error('Presentación no disponible.');

    const pieces = num_(presentation.Piezas);
    if (items.length !== pieces) throw new Error(`La presentación ${presentation.Nombre} requiere ${pieces} pieza(s).`);

    const catalog = rowsToObjects_(LDC.SHEETS.CATALOG);
    const byName = {};
    catalog.forEach(r => byName[String(r.Nombre)] = r);
    let extras = 0;
    const details = items.map((name, idx) => {
      const f = byName[name];
      if (!f || !bool_(f.Activo) || !bool_(f.Disponible_Web)) throw new Error(`El sabor "${name}" no está disponible para pedido.`);
      const extra = num_(f.Precio_Extra);
      extras += extra;
      return {line:idx+1, id:String(f.ID_Sabor), name:String(f.Nombre), extra:extra};
    });

    const subtotal = num_(presentation.Precio) + extras;
    const shipping = num_(cfg.DELIVERY_FEE_DEFAULT);
    const discount = 0;
    const total = subtotal + shipping - discount;
    const orderId = id_(String(cfg.ORDER_PREFIX || 'LDC'));
    const customer = upsertCustomer_({name:customerName, phone:phone, email:String(data.email||''), municipality:municipality, address:String(data.address||''), orderTotal:total});
    const paymentState = paymentMethod === 'Pago a la entrega' ? 'Contra entrega' : 'Pendiente';
    const now = now_();

    getSheet_(LDC.SHEETS.ORDERS).appendRow([
      orderId, now, 'Nuevo', customer.id, customerName, phone, String(data.email||''), municipality,
      String(data.address||''), String(data.reference||''), data.deliveryDate || '', String(data.deliveryWindow||''),
      String(presentation.ID), String(presentation.Nombre), pieces, subtotal, shipping, discount, total,
      paymentMethod, paymentState, '', String(data.notes||''), String(data.source||'Web GitHub Pages'), now
    ]);

    const detailSheet = getSheet_(LDC.SHEETS.ORDER_ITEMS);
    details.forEach(d => detailSheet.appendRow([orderId,d.line,d.id,d.name,1,d.extra,d.extra,'']));

    getSheet_(LDC.SHEETS.PAYMENTS).appendRow([
      id_('PAG'), orderId, now, paymentMethod, paymentState, total, '', '', '', '', ''
    ]);

    if (data.address || data.deliveryDate) {
      getSheet_(LDC.SHEETS.DELIVERIES).appendRow([
        id_('ENT'), orderId, data.deliveryDate || '', '', '', municipality, String(data.address||''), shipping, 'Pendiente', '', String(data.notes||'')
      ]);
    }

    logEvent_('ORDER_CREATED', orderId, 'Web', 'OK', `${presentation.Nombre} · ${items.join(', ')}`, {total:total, payment:paymentMethod});
    return {ok:true, order_id:orderId, total:total, payment_status:paymentState, message:'Pedido registrado'};
  } finally {
    lock.releaseLock();
  }
}

function upsertCustomer_(input) {
  const sh = getSheet_(LDC.SHEETS.CUSTOMERS);
  const rows = rowsToObjects_(LDC.SHEETS.CUSTOMERS);
  const existing = rows.find(r => normalizePhone_(r.WhatsApp) === input.phone);
  const now = now_();
  if (existing) {
    const map = headerMap_(LDC.SHEETS.CUSTOMERS);
    sh.getRange(existing._row, map.Nombre).setValue(input.name);
    sh.getRange(existing._row, map.Email).setValue(input.email || existing.Email || '');
    sh.getRange(existing._row, map.Municipio).setValue(input.municipality);
    sh.getRange(existing._row, map.Direccion_Ultima).setValue(input.address || existing.Direccion_Ultima || '');
    sh.getRange(existing._row, map.Fecha_Ultimo_Pedido).setValue(now);
    sh.getRange(existing._row, map.Num_Pedidos).setValue(num_(existing.Num_Pedidos) + 1);
    sh.getRange(existing._row, map.Total_Compras).setValue(num_(existing.Total_Compras) + input.orderTotal);
    return {id:String(existing.Cliente_ID), row:existing._row};
  }
  const customerId = id_('CLI');
  sh.appendRow([customerId,input.name,input.phone,input.email,input.municipality,input.address,now,now,1,input.orderTotal,'']);
  return {id:customerId, row:sh.getLastRow()};
}
