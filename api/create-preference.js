// api/create-preference.js
//
// Función serverless (Vercel) que crea una "preferencia de pago" en
// Mercado Pago Checkout Pro. El sitio le manda el carrito y los datos
// del cliente, y esta función le devuelve el link de pago (init_point)
// al que hay que redirigir al comprador.
//
// El token secreto de Mercado Pago (MP_ACCESS_TOKEN) NUNCA viaja al
// navegador del cliente: solo vive acá, en el servidor, como variable
// de entorno. Por eso hace falta este backend.

const { MercadoPagoConfig, Preference } = require('mercadopago');

module.exports = async (req, res) => {
  // Solo aceptamos pedidos POST
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const accessToken = process.env.MP_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('Falta configurar MP_ACCESS_TOKEN en las variables de entorno');
    return res.status(500).json({ error: 'La tienda no tiene el pago configurado todavía.' });
  }

  try {
    const { items, payer, orderId, installments } = req.body || {};

    // Validación básica: sin items no hay nada que cobrar
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'El carrito está vacío.' });
    }

    // Recalculamos el total en el servidor a partir de lo que mandó el
    // cliente, sin confiar ciegamente en precios que pudieran venir
    // manipulados desde el navegador.
    const mpItems = items.map((it) => {
      const unitPrice = Number(it.price);
      const quantity = Number(it.qty);
      if (!Number.isFinite(unitPrice) || unitPrice <= 0 || !Number.isFinite(quantity) || quantity <= 0) {
        throw new Error('Producto con precio o cantidad inválidos');
      }
      return {
        title: String(it.name || 'Producto Cawdor').slice(0, 250),
        quantity,
        unit_price: unitPrice,
        currency_id: 'ARS'
      };
    });

    const client = new MercadoPagoConfig({ accessToken });
    const preference = new Preference(client);

    const baseUrl = process.env.SITE_URL || `https://${req.headers.host}`;

    const body = {
      items: mpItems,
      payer: payer && payer.email ? { email: payer.email, name: payer.name, phone: { number: payer.phone } } : undefined,
      external_reference: orderId || undefined,
      back_urls: {
        success: `${baseUrl}/?pago=exito&pedido=${encodeURIComponent(orderId || '')}`,
        pending: `${baseUrl}/?pago=pendiente&pedido=${encodeURIComponent(orderId || '')}`,
        failure: `${baseUrl}/?pago=error&pedido=${encodeURIComponent(orderId || '')}`
      },
      auto_return: 'approved',
      payment_methods: {
        installments: Number.isFinite(Number(installments)) ? Number(installments) : 1
      }
    };

    const result = await preference.create({ body });

    return res.status(200).json({
      init_point: result.init_point,
      preference_id: result.id
    });
  } catch (err) {
    console.error('Error creando la preferencia de Mercado Pago:', err);
    return res.status(500).json({ error: 'No se pudo generar el link de pago. Intentá de nuevo en unos minutos.' });
  }
};
