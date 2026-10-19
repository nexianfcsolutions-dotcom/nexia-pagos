# NEXIA · pagos

Servicio de cobro de la tienda de NEXIA en Cloudflare Workers: `https://nexia-pagos.nexianfcsolutions.workers.dev` (`worker/index.mjs`, `wrangler.toml`). Se despliega solo al subir a `main` (Cloudflare Workers Builds). Netlify ya no se usa. Ver `README.md` para el flujo y las variables de entorno.

## Estructura
- `worker/index.mjs`: solo lee la configuración y monta las dependencias reales (Stripe, almacén de pedidos en Cloudflare KV `nexia-pedidos` vía `almacenKV`, Resend).
- `public/prueba-pago/`: copia interna del configurador contra este mismo servidor (noindex).
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
- Nunca subir claves (`sk_…`, `whsec_…`, `re_…`) al repo: van como *Secrets* del Worker en Cloudflare.
- El webhook debe seguir siendo idempotente (marcas `ventaEnviada`, `pedidoEnviado`, `clienteEnviado`): Stripe puede reenviar el mismo evento.
- IVA fijo del 21 % con un tipo de IVA de Stripe (`metadata.nexia = 'iva21'`); `USAR_STRIPE_TAX=1` usa Stripe Tax.
- Las URL de vuelta solo pueden ser de `nexianfc.com`, `nexia-pagos.*.workers.dev` o `localhost` (`RETORNOS_OK`).
- Webhook de Stripe (modo real): `https://nexia-pagos.nexianfcsolutions.workers.dev/api/webhook-stripe`.
- Código, mensajes y commits en español.
