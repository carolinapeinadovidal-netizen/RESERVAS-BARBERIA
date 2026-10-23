const { createClient } = require('@supabase/supabase-js');

const { SUPABASE_URL, SUPABASE_KEY } = process.env;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  throw new Error('Faltan SUPABASE_URL o SUPABASE_KEY en el archivo .env');
}

module.exports = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});
