# 🔍 Debug Guide: Comments Not Showing in Admin Panel

## Quick Diagnosis Steps

### Step 1: Verify You're Logged in as Admin

1. **Open your dashboard** in the browser
2. **Press F12** to open Developer Tools
3. **Go to the Console tab**
4. **Type this command** and press Enter:

```javascript
supabase.from('profiles').select('role').eq('id', (await supabase.auth.getSession()).data.session.user.id).single().then(console.log)
```

**Expected Result:**
```javascript
{ data: { role: 'admin' }, error: null }
```

**If you see `role: 'user'`**, you need to update your role in Supabase:
- Go to Supabase Dashboard → Table Editor → `profiles` table
- Find your user row
- Change the `role` column from `'user'` to `'admin'`
- Save and refresh the dashboard

---

### Step 2: Check if Comments Exist in Database

In the browser console, run:

```javascript
supabase.from('blog_comments').select('*').then(console.log)
```

**Expected Result:**
```javascript
{ data: [ { id: 1, author_name: '...', comment_text: '...', ... } ], error: null }
```

**If you see `error`**, check the error message:
- If it says **"relation does not exist"**: Run `setup.sql` in Supabase SQL Editor
- If it says **"permission denied"**: Your RLS policies aren't set up correctly

---

### Step 3: Check Console Logs for renderComments

1. **Refresh the dashboard** (Ctrl+Shift+R)
2. **Click on "Comments"** in the sidebar
3. **Look for these console messages**:

```
renderComments: Fetching comments...
renderComments: Fetch result: { comments: [...], error: null }
renderComments: Total comments: X, Pending: Y
```

**If you see:**
- `"User is not admin, skipping"` → You're not logged in as admin (see Step 1)
- `error: { message: "..." }` → There's a database/policy issue
- `Total comments: 0` → No comments in the database yet

---

## Common Issues & Fixes

### Issue 1: "User is not admin"
**Fix:** Update your profile role to `'admin'` in Supabase

### Issue 2: "relation does not exist"
**Fix:** Run the complete `setup.sql` in Supabase SQL Editor

### Issue 3: "permission denied" or empty results
**Fix:** Check RLS policies. Run this in Supabase SQL Editor:

```sql
-- Verify the is_admin function works
SELECT public.is_admin();

-- If it returns FALSE, update your role:
UPDATE profiles SET role = 'admin' WHERE email = 'YOUR_EMAIL@example.com';
```

### Issue 4: Comments exist but don't show
**Fix:** The join with `blogs` table might be failing. Try this in console:

```javascript
supabase.from('blog_comments').select('*, blogs(title)').then(console.log)
```

If you see an error about the join, it means the `blog_id` in comments doesn't match any existing blog.

---

## Quick Test

Run this complete test in the browser console:

```javascript
(async () => {
    console.log('=== COMMENT DEBUG TEST ===');
    
    // 1. Check session
    const { data: { session } } = await supabase.auth.getSession();
    console.log('1. Logged in:', !!session, session?.user?.email);
    
    // 2. Check role
    if (session) {
        const { data: profile } = await supabase.from('profiles')
            .select('role').eq('id', session.user.id).single();
        console.log('2. User role:', profile?.role);
    }
    
    // 3. Check comments
    const { data: comments, error } = await supabase.from('blog_comments')
        .select('*, blogs(title)').order('created_at', { ascending: false });
    console.log('3. Comments fetch:', { count: comments?.length || 0, error: error?.message });
    
    // 4. Check if renderComments was called
    console.log('4. Check the logs above for "renderComments:" messages');
    
    console.log('=== END DEBUG TEST ===');
})();
```

---

## Next Steps

After running the debug test above, share the console output with me and I'll help you fix the specific issue!
