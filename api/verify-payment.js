// La web la llama al volver de Mercado Pago. Procesa el pago igual que el webhook
// (si el webhook ya lo hizo, no descuenta stock de nuevo) y devuelve el estado.
const { processPayment } = require('./_lib/process-payment.js');

module.exports = async function handler(req, res) {
  const id = String((req.query && req.query.payment_id) || '');
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'payment_id inválido' });
  }
  try {
    const result = await processPayment(id);
    return res.status(200).json(result);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Error al verificar el pago' });
  }
};
