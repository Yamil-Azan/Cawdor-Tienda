// Envía un mail a la tienda cada vez que entra un pedido.
// Usa Resend (resend.com). Variables de entorno en Vercel:
//   RESEND_API_KEY  -> la clave de Resend (obligatoria)
//   NOTIFY_EMAIL    -> mail que recibe el aviso (opcional, por defecto cawdorulrich@gmail.com)

const PAY_LABELS = {
  mercadopago: 'Mercado Pago',
  transferencia: 'Transferencia bancaria',
  debito: 'Tarjeta de débito',
  tarjeta: 'Tarjeta de crédito',
  gocuotas: 'GOcuotas',
};

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (n) => '$' + Number(n || 0).toLocaleString('es-AR');

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' });

  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL || 'cawdorulrich@gmail.com';
  if (!apiKey) return res.status(500).json({ error: 'Falta RESEND_API_KEY' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const o = body.order;
  if (!o || !o.id || !Array.isArray(o.items)) return res.status(400).json({ error: 'Pedido inválido' });

  let pago = PAY_LABELS[o.paymentMethod] || o.paymentMethod || '-';
  if (o.paymentMethod === 'gocuotas' && o.gocuotasInstallments) pago += ` (${o.gocuotasInstallments} cuotas)`;
  if (o.paymentMethod === 'tarjeta' && o.cardInstallments) pago += ` (${o.cardInstallments} cuotas)`;

  const rows = o.items.map((i) => `
    <tr>
      <td style="padding:6px 0;">${esc(i.qty)}× ${esc(i.name)} (${esc(i.size)}${i.color ? ' · ' + esc(i.color) : ''})</td>
      <td style="padding:6px 0;text-align:right;">${money(i.price * i.qty)}</td>
    </tr>`).join('');

  const c = o.customer || {};
  const a = o.address || {};
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:560px;color:#222;">
    <h2 style="margin:0 0 4px;">Nuevo pedido ${esc(o.id)}</h2>
    <p style="margin:0 0 16px;color:#666;">${new Date(o.date || Date.now()).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;">${rows}
      <tr><td style="padding-top:10px;border-top:1px solid #ddd;font-weight:bold;">Total</td>
          <td style="padding-top:10px;border-top:1px solid #ddd;font-weight:bold;text-align:right;">${money(o.total)}</td></tr>
    </table>
    <h3 style="margin:20px 0 6px;">Método de pago</h3>
    <p style="margin:0;">${esc(pago)}</p>
    <h3 style="margin:20px 0 6px;">Cliente</h3>
    <p style="margin:0;">${esc(c.name)}<br>${esc(c.phone)}<br>${esc(c.email)}</p>
    <h3 style="margin:20px 0 6px;">Envío</h3>
    <p style="margin:0;">${esc(a.street)}, ${esc(a.city)}, ${esc(a.province)} (CP ${esc(a.zip)})</p>
    ${o.notes ? `<h3 style="margin:20px 0 6px;">Notas</h3><p style="margin:0;">${esc(o.notes)}</p>` : ''}
  </div>`;

  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Cawdor Pedidos <onboarding@resend.dev>',
        to: [to],
        reply_to: c.email || undefined,
        subject: `🛍️ Nuevo pedido ${o.id} — ${money(o.total)} (${pago})`,
        html,
      }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: data.message || 'No se pudo enviar el mail' });
    return res.status(200).json({ ok: true });
  } catch (e) {
    return res.status(500).json({ error: 'Error enviando el mail' });
  }
}
