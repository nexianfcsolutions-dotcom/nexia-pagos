// ÚNICA tabla de precios de NEXIA (todo SIN IVA). Mismo modelo que el Excel «NEXIA_Precios_y_reglas».
// La usan el configurador (configurar.html), la calculadora (precios.html) y el servidor de pagos (nexia-pagos/lib/precios.cjs, copia exacta).
// Si cambia un precio: cámbialo AQUÍ, copia el archivo a nexia-pagos (npm run sync-precios), revisa los textos fijos de precios.html y lanza npm test en nexia-pagos.
(function (root) {
  var P = {
    // Precio por tarjeta según unidades (chip estándar incluido); entre dos tramos se interpola, así que cada unidad extra abarata un poco.
    tramos: [[1, 5], [5, 4], [10, 3], [25, 2.8], [50, 2.7]],
    // Placa de mesa = mismo precio que la tarjeta. Soporte de mostrador = el doble por unidad.
    multFormato: { tarjeta: 1, placa: 1, soporte: 2 },
    // Suplemento por unidad sobre el chip estándar.
    chip: { estandar: 0, pro: 0.2, super: 0.5 },
    acrilico: 0.5,        // por unidad
    caras2: 1,            // por unidad
    diseno: 15,           // por diseño (una vez por pedido)
    portalBasico: 20,     // por portal
    portalCompleto: 50,   // mínimo: el portal avanzado se presupuesta
    maxUnidades: 50,      // más de esto se presupuesta aparte
    iva: 0.21
  };
  P.r2 = function (n) { return Math.round(n * 100) / 100; };
  // Precio por unidad para n unidades del formato dado.
  P.unidad = function (n, formato) {
    var t = P.tramos, u = t[t.length - 1][1];
    if (n <= t[0][0]) u = t[0][1];
    else {
      for (var k = 1; k < t.length; k++) {
        if (n <= t[k][0]) { var a = t[k - 1], b = t[k]; u = P.r2(a[1] + (b[1] - a[1]) * (n - a[0]) / (b[0] - a[0])); break; }
      }
    }
    return P.r2(u * (P.multFormato[formato] || 1));
  };
  // 12.5 -> "12,50 €", 12 -> "12 €"
  P.fmt = function (n) { return (Number.isInteger(P.r2(n)) ? String(P.r2(n)) : P.r2(n).toFixed(2)).replace('.', ',') + ' €'; };
  if (typeof module === 'object' && module.exports) module.exports = P;
  else root.NEXIA_PRECIOS = P;
})(typeof globalThis !== 'undefined' ? globalThis : this);
