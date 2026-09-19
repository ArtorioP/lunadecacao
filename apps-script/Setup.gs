/** Ejecuta esta función UNA VEZ después de importar el XLSX a Google Sheets. */
function setupLunaDeCacao() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Abre el archivo Luna de Cacao en Google Sheets y ejecuta esta función desde Extensiones > Apps Script.');

  const required = ['Dashboard','Configuracion','Catalogo','Presentaciones','Pedidos','Detalle_Pedido','Clientes','Pagos','Entregas','Cupones','Eventos','Listas'];
  const missing = required.filter(name => !ss.getSheetByName(name));
  if (missing.length) throw new Error('Faltan hojas: ' + missing.join(', ') + '. Importa el XLSX entregado antes de continuar.');

  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: ss.getId(),
    LDC_BACKEND_VERSION: LDC.VERSION
  }, false);

  // Asegurar encabezados críticos si alguien los modificó.
  Object.keys(LDC.HEADERS).forEach(name => {
    const sh = ss.getSheetByName(name);
    const expected = LDC.HEADERS[name];
    const current = sh.getRange(1, 1, 1, expected.length).getValues()[0].map(String);
    if (current.join('|') !== expected.join('|')) {
      throw new Error(`Los encabezados de ${name} fueron modificados. Restaura el XLSX maestro antes de desplegar.`);
    }
  });

  ss.toast('Backend vinculado correctamente. Ahora despliega el proyecto como Web app.', 'Luna de Cacao', 5);
}

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Luna de Cacao')
    .addItem('Verificar backend', 'diagnosticoLunaDeCacao')
    .addItem('Sincronizar pagos Mercado Pago', 'sincronizarPagosPendientes')
    .addToUi();
}

function diagnosticoLunaDeCacao() {
  const c = getConfig_();
  const props = PropertiesService.getScriptProperties();
  const msg = [
    `Backend: ${LDC.VERSION}`,
    `Spreadsheet ID: ${props.getProperty('SPREADSHEET_ID') ? 'OK' : 'FALTA ejecutar setup'}`,
    `Marca: ${c.BRAND_NAME || '—'}`,
    `Mercado Pago habilitado: ${c.MERCADO_PAGO_ENABLED}`,
    `Access Token: ${props.getProperty('MP_ACCESS_TOKEN') ? 'CONFIGURADO' : 'NO CONFIGURADO'}`
  ].join('\n');
  SpreadsheetApp.getUi().alert('Diagnóstico Luna de Cacao', msg, SpreadsheetApp.getUi().ButtonSet.OK);
}
