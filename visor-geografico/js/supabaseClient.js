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
 * Guarda la metadata y la estructura geográfica (geojson_data) de una capa 
 * cargada en Supabase (Bloque 2 - Base de Datos Centralizada).
 */
async function saveLayerMetadata(name, epsg, geojson = null) {
  if (!supabaseClient) {
    console.warn('Supabase no está configurado todavía (ver js/supabaseClient.js).');
    return;
  }
  
  const payload = { 
    name, 
    epsg_code: epsg 
  };

  // Si se pasa el objeto geojson, lo incluimos para guardarlo en la BD
  if (geojson) {
    payload.geojson_data = geojson;
  }

  const { data, error } = await supabaseClient
    .from('layers')
    .insert([payload]);
    
  if (error) console.error('Error guardando capa en Supabase:', error);
  return data;
}

/** 
 * Lista las capas registradas previamente en Supabase junto con 
 * sus datos geográficos almacenados. 
 */
async function listLayersFromSupabase() {
  if (!supabaseClient) return [];
  const { data, error } = await supabaseClient.from('layers').select('*');
  if (error) {
    console.error('Error consultando capas en Supabase:', error);
    return [];
  }
  return data;
}