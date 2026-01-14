/**
 * Supabase Client Configuration
 */

const SUPABASE_URL = 'https://liykhdbbdeiwttrdykqm.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxpeWtoZGJiZGVpd3R0cmR5a3FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgyODExODQsImV4cCI6MjA4Mzg1NzE4NH0.zyg0QftZKPjSNoxKNSH-KObvSrxU3Cwrp7BXcZ1ZF7o';

// Initialize Supabase client
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
// Set global variable for other scripts
window.supabase = supabaseClient;
