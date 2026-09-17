const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY
);

module.exports = async (req, res) => {
  if (req.method === 'GET') {
    const { key } = req.query;
    if (!key) return res.status(400).json({ error: 'Falta key' });
    const { data, error } = await supabase.from('app_storage').select('value').eq('key', key).maybeSingle();
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ value: data ? data.value : null });
  }

  if (req.method === 'POST') {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: 'Falta key' });
    const { error } = await supabase.from('app_storage').upsert({ key, value });
    if (error) return res.status(500).json({ error: error.message });
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Método no permitido' });
};
