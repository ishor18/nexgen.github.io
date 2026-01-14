/**
 * NexGen Content Management (Supabase)
 */

document.addEventListener('DOMContentLoaded', () => {
    updateAuthUI();
    renderBlogs();
    logVisit();

    async function logVisit() {
        // Simple visitor detection logic
        const urlParams = new URLSearchParams(window.location.search);
        const source = urlParams.get('utm_source') === 'mail' ? 'mail' : 'random';
        const trafficType = document.referrer ? 'link' : 'direct';

        // Advanced Anonymous Demographics (Simulated for this demo/setup)
        // In a real app, you might get this from user profiles or third-party cookies
        const ages = ['11-20', '21-30', '31-40', '41-50'];
        const genders = ['male', 'female'];

        const { error } = await supabase.from('analytics').insert([{
            source: source,
            traffic_type: trafficType,
            age_group: ages[Math.floor(Math.random() * ages.length)],
            gender: genders[Math.floor(Math.random() * genders.length)],
            browser: navigator.userAgent.includes('Chrome') ? 'Chrome' : 'Safari',
            device: window.innerWidth < 768 ? 'Mobile' : 'Desktop',
            location: 'Nepal'
        }]);

        if (error) console.error('Visit Log Error:', error.message);
        else console.log('Visit Logged Successfully');
    }

    // Auth State Display
    async function updateAuthUI() {
        const { data: { session } } = await supabase.auth.getSession();
        const loginBtn = document.querySelector('a[href="auth.html"] .btn');

        if (session && loginBtn) {
            loginBtn.innerText = 'Dashboard';
            loginBtn.parentElement.href = 'dashboard.html';
        }
    }

    // Blog Rendering Logic
    async function renderBlogs() {
        const blogContainer = document.getElementById('blog-container');
        if (!blogContainer) return;

        const { data: blogs, error } = await supabase.from('blogs').select('*').order('created_at', { ascending: false }).limit(6);

        if (error || !blogs || blogs.length === 0) {
            blogContainer.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 3rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 1rem;">
                    <i class="fa-solid fa-feather" style="font-size: 3rem; color: var(--primary); margin-bottom: 1.5rem;"></i>
                    <h3>No articles yet</h3>
                    <p style="color: var(--text-muted);">The admin is currently crafting some fresh insights. Check back soon!</p>
                </div>
            `;
            return;
        }

        blogContainer.innerHTML = blogs.map(blog => `
            <article class="glass-card" style="display: flex; flex-direction: column; gap: 1rem;">
                ${blog.image_url ? `
                    <div style="width: 100%; height: 200px; border-radius: 0.5rem; overflow: hidden; margin-bottom: 0.5rem;">
                        <img src="${blog.image_url}" style="width: 100%; height: 100%; object-fit: cover;">
                    </div>
                ` : `
                    <div style="width: 100%; height: 200px; background: #334155; border-radius: 0.5rem; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-image" style="font-size: 2rem; color: var(--secondary);"></i>
                    </div>
                `}
                <div style="font-size: 0.8rem; color: var(--primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${blog.category}</div>
                <h3 style="line-height: 1.4;">${blog.title}</h3>
                <p style="color: var(--text-muted); font-size: 0.9rem; flex-grow: 1;">${blog.excerpt}</p>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 1rem; padding-top: 1rem; border-top: 1px solid var(--border);">
                    <div style="font-size: 0.8rem; color: var(--text-muted);">${blog.date}</div>
                    <a href="blog.html?id=${blog.id}" class="btn btn-outline" style="padding: 0.5rem 1rem; font-size: 0.8rem;">Read More</a>
                </div>
            </article>
        `).join('');
    }
});
