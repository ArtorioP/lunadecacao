/**
 * Luna de Cacao — backend inicial para Google Sheets + Mercado Pago.
 * Vincula este script a la hoja de cálculo que recibirá pedidos.
 *
 * Script Properties requeridas para Mercado Pago:
 *   MP_ACCESS_TOKEN = token privado de producción/prueba
 *   SITE_URL = URL pública de GitHub Pages (https://...)
 *
 * IMPORTANTE: nunca coloques MP_ACCESS_TOKEN en index.html ni en GitHub.
 */

const ORDER_HEADERS = [
  'Fecha','Folio','Estatus','Nombre','WhatsApp','Municipio','Fecha deseada',
  'Dirección','Presentación','Sabores','Total','Método de pago','Notas','MP Order ID'
];

function setupLunaDeCacao(){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let pedidos = ss.getSheetByName('Pedidos');
  if (!pedidos) pedidos = ss.insertSheet('Pedidos');
  if (pedidos.getLastRow() === 0) pedidos.appendRow(ORDER_HEADERS);

  let catalogo = ss.getSheetByName('Catalogo');
  if (!catalogo) catalogo = ss.insertSheet('Catalogo');
  if (catalogo.getLastRow() === 0) {
    catalogo.appendRow(['Receta','Sabor','Estado']);
    const rows = [
      [1,'Cappuccino Tradicional','Próximamente'],
      [2,'Chocolate Intenso con Marshmallow','Próximamente'],
      [3,'Cappuccino de Chocolate Cremoso','Próximamente'],
      [4,'Fresa con Chocolate','Próximamente'],
      [5,'Capuchino Cremoso','Disponible'],
      [6,'Dulce de Leche','Próximamente'],
      [7,'Dulce de Maní (tipo Paçoca Brasileña)','Próximamente'],
      [8,'Coco Cremoso','Próximamente'],[9,'Canela y Vainilla','Próximamente'],
      [10,'Avellana con Chocolate','Próximamente'],[11,'Churros','Próximamente'],
      [12,'Caramelo Salado','Próximamente'],[13,'Galletas con Crema','Próximamente'],
      [14,'Mocha Cremoso','Próximamente'],[15,'Brigadeiro Brasileño','Próximamente'],
      [16,'Chocolate Blanco y Vainilla','Próximamente'],[17,'Coco con Chocolate','Próximamente'],
      [18,'Maní Crocante','Próximamente'],[19,'Café con Caramelo','Próximamente'],
      [20,'Fresa con Leche en Polvo','Próximamente'],[21,'Cacao Extra','Próximamente'],
      [22,'Cardamomo y Canela','Próximamente'],[23,'Especias de Invierno','Próximamente'],
      [24,'Caramelo con Canela','Próximamente'],[25,'Trufa de Chocolate','Próximamente']
    ];
    catalogo.getRange(2,1,rows.length,3).setValues(rows);
  }
  pedidos.setFrozenRows(1); catalogo.setFrozenRows(1);
  pedidos.autoResizeColumns(1,ORDER_HEADERS.length); catalogo.autoResizeColumns(1,3);
}

function doGet(){
  return json_({ok:true,service:'Luna de Cacao API'});
}

function doPost(e){
  try{
    const data = JSON.parse(e.postData.contents || '{}');
    if (data.action === 'saveOrder') return json_(saveOrder_(data));
    if (data.action === 'createPayment') return json_(createPayment_(data));
    return json_({ok:false,error:'Acción no reconocida'});
  }catch(err){
    return json_({ok:false,error:String(err.message || err)});
  }
}

function saveOrder_(d){
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName('Pedidos');
  if (!sh){ setupLunaDeCacao(); sh = ss.getSheetByName('Pedidos'); }
  const folio = 'LDC-' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd-HHmmss');
  sh.appendRow([
    new Date(), folio, d.status || 'Nuevo', d.name || '', d.phone || '', d.municipality || '',
    d.deliveryDate || '', d.address || '', d.presentation || '', (d.items || []).join(' | '),
    Number(d.total || 0), d.payment || '', d.notes || '', ''
  ]);
  return {ok:true,folio:folio};
}

function createPayment_(d){
  const props = PropertiesService.getScriptProperties();
  const token = props.getProperty('MP_ACCESS_TOKEN');
  const siteUrl = props.getProperty('SITE_URL');
  if (!token) throw new Error('Falta MP_ACCESS_TOKEN en Script Properties.');

  const externalRef = 'LDC-' + Utilities.getUuid().replace(/-/g,'').slice(0,20);
  const body = {
    type: 'online',
    processing_mode: 'manual',
    total_amount: Number(d.total || 0).toFixed(2),
    external_reference: externalRef,
    payer: { email: d.email || undefined },
    items: [{
      title: 'Luna de Cacao - ' + (d.presentation || 'Pedido'),
      quantity: 1,
      unit_price: Number(d.total || 0).toFixed(2)
    }]
  };
  if (siteUrl) body.config = { online: { success_url: siteUrl, failure_url: siteUrl, pending_url: siteUrl } };

  const resp = UrlFetchApp.fetch('https://api.mercadopago.com/v1/orders', {
    method: 'post',
    contentType: 'application/json',
    headers: {
      Authorization: 'Bearer ' + token,
      'X-Idempotency-Key': Utilities.getUuid()
    },
    payload: JSON.stringify(body),
    muteHttpExceptions: true
  });
  const code = resp.getResponseCode();
  const result = JSON.parse(resp.getContentText() || '{}');
  if (code < 200 || code >= 300) throw new Error('Mercado Pago ' + code + ': ' + resp.getContentText());
  return {ok:true,order_id:result.id,checkout_url:result.checkout_url,external_reference:externalRef};
}

function json_(obj){
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
