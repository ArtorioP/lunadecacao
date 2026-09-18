# Luna de Cacao — prototipo v0.1

Marca: **Luna de Cacao**  
Slogan: **Hecho a mano, pensado para disfrutar.**

## Qué incluye

- Landing responsive artesanal/premium.
- 1 sabor activo: **Capuchino Cremoso**.
- Presentaciones: 1 ($50), caja de 3 ($120), caja de 4 ($160), caja de 6 ($200).
- Selector de caja preparado para combinar sabores cuando se activen nuevos productos.
- 24 sabores en estado “Próximamente”.
- Flujo de pedido con nombre, WhatsApp, municipio, fecha, dirección, notas y método de pago.
- Botón de WhatsApp al **456 127 5919**.
- Cobertura inicial: Querétaro y Corregidora.
- Backend de ejemplo para Google Sheets (`apps-script/Code.gs`).
- Estructura para Mercado Pago mediante Orders API, sin exponer el Access Token en el frontend.

## Probar localmente

Puedes abrir `index.html` directamente. Para una prueba más parecida a producción:

```bash
python -m http.server 8080
```

Luego abre `http://localhost:8080`.

## Conectar Google Sheets

1. Crea una hoja de Google Sheets.
2. Abre **Extensiones > Apps Script**.
3. Copia `apps-script/Code.gs`.
4. Ejecuta una vez `setupLunaDeCacao()` y autoriza el script.
5. Despliega como **Aplicación web**.
6. Copia la URL terminada en `/exec`.
7. En `index.html`, pega esa URL en `CONFIG.appsScriptUrl`.

Google Apps Script permite publicar scripts como web apps usando `doGet` o `doPost`, y el servicio de Spreadsheet dispone de `appendRow` para agregar pedidos a la hoja.

## Conectar Mercado Pago

La integración está pensada para **Checkout Pro vía Orders API**, que Mercado Pago presenta como el flujo recomendado para integraciones nuevas. La creación de una orden usa `POST /v1/orders`, requiere `Authorization: Bearer ...` y `X-Idempotency-Key`, y devuelve un `checkout_url` para redirigir al comprador.

En Apps Script configura **Project Settings > Script Properties**:

- `MP_ACCESS_TOKEN`: Access Token privado de Mercado Pago.
- `SITE_URL`: URL pública de GitHub Pages.

**Nunca** guardes el Access Token en `index.html` ni en un repositorio público.

Antes de producción hay que completar y probar:

- URLs de retorno.
- Notificaciones/webhooks.
- Credenciales de prueba y luego producción.
- Validación real de estados de pago.

## Publicar en GitHub Pages

1. Crea un repositorio.
2. Sube `index.html`.
3. Ve a **Settings > Pages**.
4. Elige la rama de publicación.
5. GitHub Pages generará la URL del sitio; más adelante puedes conectar un dominio propio.

## Pendientes de negocio para v0.2

- Definir costo, colonias, días y horarios de entrega.
- Confirmar reglas de pago a la entrega.
- Proporcionar banco/titular/CLABE para SPEI.
- Conectar cuenta de Mercado Pago.
- Crear fotografías originales de los 25 sabores.
- Definir aviso de privacidad, términos de compra, cambios/cancelaciones y alérgenos.
- Sustituir el logotipo tipográfico provisional si se diseña un logo definitivo.
