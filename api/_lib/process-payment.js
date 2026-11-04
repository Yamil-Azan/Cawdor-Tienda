// Lógica compartida para procesar un pago de Mercado Pago.
// La usan el webhook (api/mp-webhook.js) y la verificación al volver a la web
// (api/verify-payment.js). Es segura de llamar varias veces para el mismo pago:
// el stock se descuenta una sola vez gracias a la marca "stockDeducted".
// (Vercel no publica como ruta los archivos que empiezan con "_".)

const SITE_URL = process.env.SITE_URL || 'https://cawdor.vercel.app';

// ---- Base de datos: se usa la misma API /api/storage que usa la tienda ----
async function getKey(key) {
  const r = await fetch(`${SITE_URL}/api/storage?key=${encodeURIComponent(key)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`No se pudo leer ${key} (${r.status})`);
  const data = await r.json();
  return data.value == null ? null : JSON.parse(data.value);
}
async function setKey(key, obj) {
  const r = await fetch(`${SITE_URL}/api/storage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, value: JSON.stringify(obj) })
  });
  if (!r.ok) throw new Error(`No se pudo guardar ${key} (${r.status})`);
}

// ---- Mismo cálculo de stock que usa index.html ----
const variantKey = (size, color) => `${size}|${color}`;
const hasColors = p => !!(p && Array.isArray(p.colors) && p.colors.length);
const isGeneralStock = p => hasColors(p) && !!p.stockGeneral;
function variantStock(p, size, color) {
  if (!hasColors(p) || isGeneralStock(p)) return Number(p.stock) || 0;
  return Number((p.variantStock || {})[variantKey(size, color)]) || 0;
}
function colorStock(p, color) {
  if (isGeneralStock(p)) return Number(p.stock) || 0;
  return (p.sizes || []).reduce((s, sz) => s + variantStock(p, sz, color), 0);
}
function sumVariantStock(p) {
  if (isGeneralStock(p)) return Number(p.stock) || 0;
  return (p.colors || []).reduce((s, c) => s + colorStock(p, c), 0);
}
function deductStock(p, item) {
  if (hasColors(p) && !isGeneralStock(p)) {
    const k = variantKey(item.size, item.color);
    p.variantStock = p.variantStock || {};
    p.variantStock[k] = Math.max(0, (Number(p.variantStock[k]) || 0) - item.qty);
    p.stock = sumVariantStock(p);
  } else {
    p.stock = Math.max(0, (Number(p.stock) || 0) - item.qty);
  }
}

// ---- Consultar el pago en Mercado Pago ----
async function getPayment(paymentId) {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
    headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` }
  });
  const pago = await r.json();
  if (!r.ok) throw new Error('No se pudo consultar el pago en Mercado Pago');
  return pago;
}

// ---- Procesar el pago: marcar el pedido y descontar stock si se aprobó ----
async function processPayment(paymentId) {
  const pago = await getPayment(paymentId);
  const orderId = pago.external_reference;
  const result = { status: pago.status, external_reference: orderId };
  if (!orderId) return result;

  const orders = (await getKey('orders')) || [];
  const order = orders.find(o => o.id === orderId);
  if (!order) return result;

  if (pago.status === 'approved') {
    if (order.stockDeducted) return result; // ya procesado antes

    order.status = 'pagado';
    order.stockDeducted = true;
    order.mpPaymentId = String(pago.id);
    await setKey('orders', orders);

    const products = await getKey('products');
    if (products) {
      order.items.forEach(it => {
        const p = products.find(x => x.id === it.productId);
        if (p) deductStock(p, it);
      });
      await setKey('products', products);
    }

    // Aviso por mail a la tienda (si falla, no frena nada)
    try {
      await fetch(`${SITE_URL}/api/notify-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order })
      });
    } catch (e) { console.error('No se pudo enviar el mail', e); }
  } else if ((pago.status === 'rejected' || pago.status === 'cancelled') && order.status !== 'pagado') {
    order.status = 'pago rechazado';
    await setKey('orders', orders);
  }
  return result;
}

module.exports = { getPayment, processPayment };
