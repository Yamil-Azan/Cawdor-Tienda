// Recibe una foto (ya comprimida en el navegador), la sube a Supabase Storage
// y devuelve su link público. En el catálogo se guarda solo ese link.
const BUCKET = 'productos';
const MAX_BYTES = 8 * 1024 * 1024; // 8 MB por foto

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (!SUPABASE_URL || !KEY) {
    // Diagnóstico: muestra solo los NOMBRES de las variables que ve la función, nunca los valores.
    return res.status(500).json({
      error: 'Faltan las variables SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en Vercel',
      tieneUrl: Boolean(SUPABASE_URL),
      tieneClave: Boolean(KEY),
      entorno: process.env.VERCEL_ENV || null,
      variablesQueVe: Object.keys(process.env).filter(k => /SUPA/i.test(k))
    });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { body = {}; }
  }

  const match = /^data:(image\/(jpeg|png|webp));base64,(.+)$/.exec((body && body.image) || '');
  if (!match) {
    return res.status(400).json({ error: 'La imagen no es válida' });
  }

  const contentType = match[1];
  const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
  const buffer = Buffer.from(match[3], 'base64');
  if (buffer.length > MAX_BYTES) {
    return res.status(413).json({ error: 'La foto es demasiado pesada' });
  }

  const base = SUPABASE_URL.replace(/\/$/, '');
  const auth = { Authorization: `Bearer ${KEY}`, apikey: KEY };
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${ext}`;

  const upload = () => fetch(`${base}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST',
    headers: { ...auth, 'Content-Type': contentType, 'cache-control': 'max-age=31536000' },
    body: buffer
  });

  let r = await upload();
  if (!r.ok) {
    const text = await r.text();
    // Si el bucket todavía no existe, se crea (público) y se vuelve a intentar.
    if (/bucket not found/i.test(text)) {
      await fetch(`${base}/storage/v1/bucket`, {
        method: 'POST',
        headers: { ...auth, 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true })
      });
      r = await upload();
      if (!r.ok) {
        return res.status(500).json({ error: 'No se pudo subir la foto: ' + (await r.text()) });
      }
    } else {
      return res.status(500).json({ error: 'No se pudo subir la foto: ' + text });
    }
  }

  return res.status(200).json({ url: `${base}/storage/v1/object/public/${BUCKET}/${path}` });
}
