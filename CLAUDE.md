# NEXIA · pagos

Servicio de cobro de la tienda de NEXIA. Se está pasando de Netlify (`https://nexia-pagos.netlify.app`, despliegues pausados por créditos) a Cloudflare Workers (`worker/index.mjs`, `wrangler.toml`). Ver `README.md` para el flujo y las variables de entorno.

## Estructura
- `worker/index.mjs` (Cloudflare) y `netlify/functions/*.mjs` (Netlify): solo leen la configuración y montan dependencias reales (Stripe, almacén, Resend). En Cloudflare el almacén es KV (`almacenKV`), con la misma interfaz que Netlify Blobs.
- El webhook usa `constructEventAsync` y responde 500 si aún no ve el pedido (KV tarda unos segundos en propagarse): Stripe lo reintenta.
- `lib/handlers.mjs`: toda la lógica, con dependencias inyectadas (`stripe`, `store`, `env`, `enviar`, `esperar`) para poder probarla con simulaciones.
- `lib/pricing.mjs`: calcula el pedido. **El precio se calcula siempre aquí; nunca se fía del importe que manda el navegador.**
- `lib/precios.cjs`: tabla de precios. Es una **copia exacta** de `nexia-web/precios.js`, la única fuente. No la edites aquí: cambia la web y ejecuta `npm run sync-precios`.

## Promoción de primera compra
- `calcular(ans, { primeraCompra })`: con la promo activa (`P.promoDiseno`), el diseño de NEXIA es gratis desde 2 unidades.
- `crearPagoHandler` decide `primeraCompra` mirando en el almacén las claves `cliente:<correo>` y `cliente:tel:<9 cifras>`; el webhook las guarda cuando un pedido se paga.

## Pruebas
- `npm test` (sin red: Stripe, almacén y correo simulados). Con `nexia-web` clonado al lado (o `WEB_DIR=…`) compara además la tabla, el configurador, la calculadora y los textos de `precios.html` con el servidor.
- Antes de cualquier cambio en precios, webhook o correos: `npm test` tiene que acabar en `TODO CORRECTO`.

## Reglas
- Nunca subir claves (`sk_…`, `whsec_…`, `re_…`) al repo: van en las variables de entorno de Netlify.
- El webhook debe seguir siendo idempotente (marcas `ventaEnviada`, `pedidoEnviado`, `clienteEnviado`): Stripe puede reenviar el mismo evento.
- IVA fijo del 21 % con un tipo de IVA de Stripe (`metadata.nexia = 'iva21'`); `USAR_STRIPE_TAX=1` usa Stripe Tax.
- Las URL de vuelta solo pueden ser de `nexianfc.com`, `nexia-pagos.netlify.app` o `localhost` (`RETORNOS_OK`).
- Código, mensajes y commits en español.
