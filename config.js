// Configuração pública do PACE.
// A chave anon/public do Supabase pode ficar aqui, desde que as políticas RLS estejam ativas.
// NUNCA coloque service_role, chave privada do Google ou outros segredos neste arquivo.
window.PACE_CONFIG = {
  SUPABASE_URL: 'https://degygeypxolgduklqacb.supabase.co',
  SUPABASE_ANON_KEY: 'sb_publishable_nFrJ1ulXQ5sBHGlwUTpHkw_vSXntt6m',
  // Mude para true somente depois de implantar a função sync-google-sheet e cadastrar
  // os secrets do Google no Supabase.
  GOOGLE_SHEETS_ENABLED: false
};
