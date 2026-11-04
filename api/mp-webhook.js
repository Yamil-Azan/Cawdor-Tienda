// Webhook de Mercado Pago: MP llama a esta dirección cada vez que cambia un pago,
// aunque el cliente cierre la pestaña y nunca vuelva a la web.
const { processPayment } = require('./_lib/process-payment.js');

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const body = req.body || {};
  const type = q.type || q.topic || body.type || body.topic;
  const id = q['data.id'] || (body.data && body.data.id) || q.id;

  // Solo interesan los avisos de pagos; el resto se responde OK y se ignora
  if (type !== 'payment' || !id) {
    return res.status(200).json({ ignored: true });
  }
  try {
    await processPayment(id);
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    // Si devolvemos error, Mercado Pago vuelve a intentar más tarde
    return res.status(500).json({ error: 'No se pudo procesar el pago' });
  }
};
