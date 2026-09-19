/**
 * Luna de Cacao - configuración y utilidades del backend.
 * Proyecto pensado para estar VINCULADO al Google Sheet maestro.
 */

const LDC = Object.freeze({
  VERSION: '1.0.0',
  SHEETS: {
    CONFIG: 'Configuracion',
    CATALOG: 'Catalogo',
    PRESENTATIONS: 'Presentaciones',
    ORDERS: 'Pedidos',
    ORDER_ITEMS: 'Detalle_Pedido',
    CUSTOMERS: 'Clientes',
    PAYMENTS: 'Pagos',
    DELIVERIES: 'Entregas',
    COUPONS: 'Cupones',
    EVENTS: 'Eventos'
  },
  HEADERS: {
    Pedidos: ['Pedido_ID','Fecha_Creacion','Estado','Cliente_ID','Nombre_Cliente','WhatsApp','Email','Municipio','Direccion','Referencia','Fecha_Entrega_Deseada','Ventana_Entrega','Presentacion_ID','Presentacion','Piezas','Subtotal','Envio','Descuento','Total','Metodo_Pago','Estado_Pago','MercadoPago_Order_ID','Notas','Fuente','Ultima_Actualizacion'],
    Detalle_Pedido: ['Pedido_ID','Linea','Sabor_ID','Sabor','Cantidad','Precio_Extra','Subtotal_Extra','Observaciones'],
    Clientes: ['Cliente_ID','Nombre','WhatsApp','Email','Municipio','Direccion_Ultima','Fecha_Primer_Pedido','Fecha_Ultimo_Pedido','Num_Pedidos','Total_Compras','Notas'],
    Pagos: ['Pago_ID','Pedido_ID','Fecha','Metodo','Estado','Importe','Referencia','MercadoPago_Order_ID','MercadoPago_Status','Comprobante_URL','Observaciones'],
    Entregas: ['Entrega_ID','Pedido_ID','Fecha_Programada','Hora_Inicio','Hora_Fin','Municipio','Direccion','Costo_Envio','Estado','Repartidor','Notas'],
    Eventos: ['Fecha','Tipo','Pedido_ID','Origen','Resultado','IP_o_UserAgent','Detalle','JSON_Resumen']
  }
});

function getBook_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) throw new Error('No se encontró el Google Sheet maestro. Ejecuta setupLunaDeCacao() desde la hoja.');
  return active;
}

function getSheet_(name) {
  const sh = getBook_().getSheetByName(name);
  if (!sh) throw new Error('Falta la hoja requerida: ' + name);
  return sh;
}

function getConfig_() {
  const sh = getSheet_(LDC.SHEETS.CONFIG);
  const values = sh.getDataRange().getValues();
  const cfg = {};
  for (let i = 1; i < values.length; i++) {
    const key = String(values[i][0] || '').trim();
    if (key) cfg[key] = values[i][1];
  }
  return cfg;
}

function publicConfig_() {
  const c = getConfig_();
  const speiEnabled = bool_(c.SPEI_ENABLED);
  return {
    brandName: String(c.BRAND_NAME || 'Luna de Cacao'),
    slogan: String(c.SLOGAN || ''),
    whatsapp: String(c.WHATSAPP || ''),
    currency: String(c.CURRENCY || 'MXN'),
    municipalities: String(c.LAUNCH_MUNICIPALITIES || '').split('|').map(s => s.trim()).filter(Boolean),
    mercadoPagoEnabled: bool_(c.MERCADO_PAGO_ENABLED),
    speiEnabled: speiEnabled,
    cashOnDelivery: bool_(c.CASH_ON_DELIVERY),
    spei: speiEnabled ? {
      bank: String(c.SPEI_BANK || ''),
      holder: String(c.SPEI_HOLDER || ''),
      clabe: String(c.SPEI_CLABE || '')
    } : null,
    siteUrl: String(c.PUBLIC_SITE_URL || ''),
    version: String(c.APP_VERSION || '')
  };
}

function rowsToObjects_(sheetName) {
  const sh = getSheet_(sheetName);
  const data = sh.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0].map(h => String(h).trim());
  return data.slice(1).filter(row => row.some(v => v !== '' && v !== null)).map((row, idx) => {
    const obj = {_row: idx + 2};
    headers.forEach((h, i) => obj[h] = row[i]);
    return obj;
  });
}

function headerMap_(sheetName) {
  const sh = getSheet_(sheetName);
  const headers = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach((h, i) => map[String(h).trim()] = i + 1);
  return map;
}

function bool_(value) {
  return value === true || String(value).toUpperCase() === 'TRUE' || String(value) === '1';
}

function num_(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : (fallback || 0);
}

function normalizePhone_(phone) {
  return String(phone || '').replace(/\D/g, '').slice(-10);
}

function now_() {
  return new Date();
}

function id_(prefix) {
  const tz = String(getConfig_().TIMEZONE || 'America/Mexico_City');
  const stamp = Utilities.formatDate(new Date(), tz, 'yyyyMMdd-HHmmss');
  return `${prefix}-${stamp}-${Utilities.getUuid().slice(0,6).toUpperCase()}`;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function parseBody_(e) {
  if (!e || !e.postData || !e.postData.contents) return {};
  const text = e.postData.contents;
  try { return JSON.parse(text); } catch (err) {
    const out = {};
    String(text).split('&').forEach(part => {
      const p = part.split('=');
      if (p[0]) out[decodeURIComponent(p[0])] = decodeURIComponent((p[1] || '').replace(/\+/g, ' '));
    });
    return out;
  }
}

function logEvent_(type, orderId, origin, result, detail, payload) {
  try {
    getSheet_(LDC.SHEETS.EVENTS).appendRow([
      now_(), type || '', orderId || '', origin || '', result || '', '', detail || '',
      payload ? JSON.stringify(payload).slice(0, 45000) : ''
    ]);
  } catch (err) {
    console.error('No se pudo registrar evento', err);
  }
}
