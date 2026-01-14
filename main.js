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
        const loginBtn = document.querySelector('a[href="auth.html"]');

        if (session && loginBtn) {
            loginBtn.innerText = 'Dashboard';
            loginBtn.parentElement.href = 'dashboard.html';
        }
    }

    // Blog Rendering Logic with Sorting
    let currentSort = 'date'; // default sort

    async function renderBlogs(sortBy = 'date') {
        const blogContainer = document.getElementById('blog-container');
        if (!blogContainer) return;

        currentSort = sortBy;

        const { data: blogs, error } = await supabase.from('blogs').select('*').order('created_at', { ascending: false });

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

        // Get reaction counts for all blogs
        const { data: reactions } = await supabase.from('blog_reactions').select('blog_id');
        const reactionCounts = {};
        if (reactions) {
            reactions.forEach(r => {
                reactionCounts[r.blog_id] = (reactionCounts[r.blog_id] || 0) + 1;
            });
        }

        // Sort blogs based on selection
        let sortedBlogs = [...blogs];
        if (sortBy === 'views') {
            sortedBlogs.sort((a, b) => (b.views || 0) - (a.views || 0));
        } else if (sortBy === 'name') {
            sortedBlogs.sort((a, b) => a.title.localeCompare(b.title));
        } else {
            // Default: date (already sorted from query)
        }

        // Identify newest and most viewed
        const newestBlog = blogs[0]; // First in created_at desc order
        const mostViewedBlog = [...blogs].sort((a, b) => (b.views || 0) - (a.views || 0))[0];

        blogContainer.innerHTML = sortedBlogs.map(blog => {
            const isNewest = blog.id === newestBlog.id;
            const isMostViewed = blog.id === mostViewedBlog.id && (blog.views || 0) > 0;
            const reactionCount = reactionCounts[blog.id] || 0;

            return `
            <a href="blog.html?id=${blog.id}" style="text-decoration: none; color: inherit; display: block; height: 100%;">
                <article class="glass-card" style="display: flex; flex-direction: column; gap: 1rem; position: relative; cursor: pointer; transition: transform 0.2s, box-shadow 0.2s; height: 100%;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 8px 24px rgba(37, 99, 235, 0.2)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='';">
                    ${isNewest ? '<div style="position: absolute; top: 1rem; right: 1rem; background: var(--primary); color: white; padding: 0.3rem 0.8rem; border-radius: 2rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; z-index: 10;"><i class="fa-solid fa-sparkles"></i> New</div>' : ''}
                    ${isMostViewed && !isNewest ? '<div style="position: absolute; top: 1rem; right: 1rem; background: #f59e0b; color: white; padding: 0.3rem 0.8rem; border-radius: 2rem; font-size: 0.7rem; font-weight: 600; text-transform: uppercase; z-index: 10;"><i class="fa-solid fa-fire"></i> Most Viewed</div>' : ''}
                    
                    ${blog.image_url ? `
                        <div style="width: 100%; height: 200px; border-radius: 0.5rem; overflow: hidden; margin-bottom: 0.5rem; background: #1e293b; display: flex; align-items: center; justify-content: center;">
                            <img src="${blog.image_url}" style="width: 100%; height: 100%; object-fit: contain;">
                        </div>
                    ` : `
                        <div style="width: 100%; height: 200px; background: #334155; border-radius: 0.5rem; margin-bottom: 0.5rem; display: flex; align-items: center; justify-content: center;">
                            <i class="fa-solid fa-image" style="font-size: 2rem; color: var(--secondary);"></i>
                        </div>
                    `}
                    <div style="font-size: 0.8rem; color: var(--primary); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${blog.category}</div>
                    <h3 style="line-height: 1.4;">${blog.title}</h3>
                    <p style="color: var(--text-muted); font-size: 0.9rem; flex-grow: 1;">${blog.excerpt}</p>
                    
                    <div style="display: flex; gap: 1rem; font-size: 0.8rem; color: var(--text-muted); padding-top: 0.5rem; border-top: 1px solid var(--border);">
                        <span><i class="fa-solid fa-eye"></i> ${blog.views || 0}</span>
                        <span><i class="fa-solid fa-heart"></i> ${reactionCount}</span>
                    </div>

                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 0.5rem;">
                        <div style="font-size: 0.8rem; color: var(--text-muted);">${blog.date}</div>
                        <span class="btn btn-outline" style="padding: 0.5rem 1rem; font-size: 0.8rem; pointer-events: none;">Read More →</span>
                    </div>
                </article>
            </a>
        `}).join('');
    }

    // Sorting controls
    const sortButtons = document.querySelectorAll('[data-sort]');
    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            sortButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBlogs(btn.getAttribute('data-sort'));
        });
    });
});
