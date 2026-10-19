# NEXIA · pagos (Netlify Functions)

Servicio de cobro de la tienda de NEXIA en `https://nexia-pagos.netlify.app`. Ver `README.md` para el flujo y las variables de entorno.

## Estructura
- `netlify/functions/crear-pago.mjs` y `webhook-stripe.mjs`: solo leen variables de entorno y montan dependencias reales (Stripe, Netlify Blobs, Resend).
- `lib/handlers.mjs`: toda la lógica, con dependencias inyectadas (`stripe`, `store`, `env`, `enviar`, `esperar`) para poder probarla con simulaciones.
- `lib/pricing.mjs`: calcula el pedido. **El precio se calcula siempre aquí; nunca se fía del importe que manda el navegador.**
- `lib/precios.cjs`: tabla de precios. Es una **copia exacta** de `nexia-web/precios.js`, la única fuente. No la edites aquí: cambia la web y ejecuta `npm run sync-precios`.

## Pruebas
- `npm test` (sin red: Stripe, almacén y correo simulados). Con `nexia-web` clonado al lado (o `WEB_DIR=…`) compara además la tabla, el configurador, la calculadora y los textos de `precios.html` con el servidor.
- Antes de cualquier cambio en precios, webhook o correos: `npm test` tiene que acabar en `TODO CORRECTO`.

## Reglas
- Nunca subir claves (`sk_…`, `whsec_…`, `re_…`) al repo: van en las variables de entorno de Netlify.
- El webhook debe seguir siendo idempotente (marcas `ventaEnviada`, `pedidoEnviado`, `clienteEnviado`): Stripe puede reenviar el mismo evento.
- IVA fijo del 21 % con un tipo de IVA de Stripe (`metadata.nexia = 'iva21'`); `USAR_STRIPE_TAX=1` usa Stripe Tax.
- Las URL de vuelta solo pueden ser de `nexianfc.com`, `nexia-pagos.netlify.app` o `localhost` (`RETORNOS_OK`).
- Código, mensajes y commits en español.
