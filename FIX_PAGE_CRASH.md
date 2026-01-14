# 🔧 Fix: Page Crashing / Reloading Issue

## The Problem
Your browser is showing this error:
```
Uncaught (in promise) ReferenceError: Cannot access 'currentSort' before initialization
```

This is likely caused by **browser caching** - your browser is loading an old version of `main.js`.

---

## ✅ Solution: Clear Browser Cache

### **Method 1: Hard Refresh (Quickest)**
1. Open your website in the browser
2. Press **Ctrl + Shift + R** (Windows) or **Cmd + Shift + R** (Mac)
3. This forces the browser to reload all files from disk

### **Method 2: Clear Cache Completely**
1. Press **F12** to open DevTools
2. **Right-click** on the refresh button (next to the address bar)
3. Select **"Empty Cache and Hard Reload"**

### **Method 3: Disable Cache in DevTools**
1. Press **F12** to open DevTools
2. Go to the **Network** tab
3. Check the box that says **"Disable cache"**
4. Keep DevTools open while testing
5. Refresh the page normally

---

## 🎯 After Clearing Cache

Once you've cleared the cache:

1. **Refresh the homepage** - the error should be gone
2. **Log in to the dashboard**
3. **Click on "Comments"** in the sidebar
4. **Check if comments are showing**

---

## 📋 If Comments Still Don't Show

After fixing the cache issue, if comments still don't appear:

1. **Check your admin role** in the browser console (F12):
```javascript
supabase.from('profiles').select('role').eq('id', (await supabase.auth.getSession()).data.session.user.id).single().then(r => console.log('Your role:', r.data.role))
```

2. **If role is not "admin"**:
   - Go to Supabase Dashboard → Table Editor → `profiles`
   - Find your email
   - Change `role` to `'admin'`
   - Save and refresh

3. **Check if comments exist**:
```javascript
supabase.from('blog_comments').select('*').then(r => console.log('Comments:', r.data))
```

---

## 🚀 Quick Test

After clearing cache, run this in the console to verify everything:

```javascript
(async () => {
    console.log('=== SYSTEM CHECK ===');
    
    // 1. Check if logged in
    const { data: { session } } = await supabase.auth.getSession();
    console.log('✓ Logged in:', !!session);
    
    if (session) {
        // 2. Check role
        const { data: profile } = await supabase.from('profiles')
            .select('role').eq('id', session.user.id).single();
        console.log('✓ Role:', profile?.role);
        
        // 3. Check comments
        const { data: comments } = await supabase.from('blog_comments').select('*');
        console.log('✓ Comments in DB:', comments?.length || 0);
    }
})();
```

---

**Try the hard refresh first (Ctrl+Shift+R) and let me know if the error goes away!**
