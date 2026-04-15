-- ============================================================
-- NEXGEN QUICK FIX — Run this in Supabase SQL Editor
-- Fixes why blogs are not showing on the homepage.
-- NO dummy data inserted — only real user/admin blogs will show.
-- ============================================================

-- STEP 1: Add missing columns (safe if already exist)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='status') THEN
    ALTER TABLE blogs ADD COLUMN status TEXT DEFAULT 'published';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='author_name') THEN
    ALTER TABLE blogs ADD COLUMN author_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='blogs' AND column_name='image_url') THEN
    ALTER TABLE blogs ADD COLUMN image_url TEXT;
  END IF;
END $$;

-- STEP 2: Fix all existing blogs stuck with NULL status — make them visible publicly
UPDATE public.blogs SET status = 'published' WHERE status IS NULL OR status = '';

-- STEP 3: Re-create the public read policy with correct permissions
DROP POLICY IF EXISTS "Public Read Published Blogs" ON blogs;
DROP POLICY IF EXISTS "Public Read Blogs" ON blogs;

CREATE POLICY "Public Read Published Blogs" ON blogs
  FOR SELECT USING (
    status = 'published'
    OR status IS NULL
    OR auth.uid() = author_id
  );

-- Done! Your real blogs will now appear on the homepage.
-- Refresh the homepage after running this.
