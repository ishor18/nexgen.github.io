/**
 * Supabase Client Configuration
 */

const SUPABASE_URL = 'https://mwnalirtpsgbwokaaoif.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im13bmFsaXJ0cHNnYndva2Fhb2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzYxMjIxMTcsImV4cCI6MjA5MTY5ODExN30.2FYQ135kUzSuS49DsnnZhsV844PK65gkfHROKJK2rbA';

// The CDN exposes window.supabase as the library namespace.
// We overwrite window.supabase with the actual instantiated client.
if (window.supabase && typeof window.supabase.createClient === 'function') {
    window.supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
} else {
    console.error("Supabase library failed to load from CDN.");
}
