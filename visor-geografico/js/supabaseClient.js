/**
 * supabaseClient.js
 * ------------------------------------------------------------------
 * Conexión directa desde el navegador a Supabase (sin backend propio).
 * Reemplaza los valores de abajo por los de tu proyecto:
 * Supabase → Project Settings → API → "Project URL" y "anon public key".
 *
 * NUNCA pongas aquí la "service_role key" (esa es privada, solo para
 * uso en servidor). La "anon public key" es segura para el frontend
 * siempre que tengas Row Level Security (RLS) activado en tus tablas.
 * ------------------------------------------------------------------
 */

   const SUPABASE_URL = 'https://bfmklcrfpwvrilvbyzhv.supabase.co';      
const SUPABASE_ANON_KEY = 'sb_publishable_3FiXE1pivqaEui4ADP6Y6w_yHyic9Kp';

let supabaseClient = null;
if (SUPABASE_URL !== 'TU_SUPABASE_URL' && window.supabase) {
  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Guarda la metadata de una capa cargada (nombre, EPSG, fecha).
 * Requiere una tabla "layers" en Supabase — ver docs/arquitectura.md
 * para el SQL de creación.
 */
async function saveLayerMetadata(name, epsg) {
  if (!supabaseClient) {
    console.warn('Supabase no está configurado todavía (ver js/supabaseClient.js).');
    return;
  }
  const { data, error } = await supabaseClient
    .from('layers')
    .insert([{ name, epsg_code: epsg }]);
  if (error) console.error('Error guardando metadata en Supabase:', error);
  return data;
}

/** Lista las capas registradas previamente en Supabase. */
async function listLayersFromSupabase() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from('layers').select('*');
  if (error) {
    console.error('Error consultando capas en Supabase:', error);
    return [];
  }
  return data;
}
