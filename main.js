/**
 * NexGen Content Management (Supabase)
 * Real-time blog feed, visitor analytics, ad rendering.
 * Loads 6 blogs at a time with a "Load More" button.
 */

document.addEventListener('DOMContentLoaded', () => {

    // ── Scroll animations ──────────────────────────────────────
    window.initScrollAnimations = function () {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-visible');
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        document.querySelectorAll('.animate-on-scroll').forEach(el => {
            if (!el.classList.contains('is-visible')) observer.observe(el);
        });
    };
    setTimeout(() => { if (window.initScrollAnimations) window.initScrollAnimations(); }, 100);

    // ── Theme Toggle ───────────────────────────────────────────
    const themeBtn = document.getElementById('theme-toggle');
    const currentTheme = localStorage.getItem('theme') || 'dark';
    document.body.setAttribute('data-theme', currentTheme);
    updateThemeIcon(currentTheme);

    if (themeBtn) {
        themeBtn.addEventListener('click', () => {
            const newTheme = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            document.body.setAttribute('data-theme', newTheme);
            localStorage.setItem('theme', newTheme);
            updateThemeIcon(newTheme);
        });
    }

    function updateThemeIcon(theme) {
        if (!themeBtn) return;
        const icon = themeBtn.querySelector('i');
        if (theme === 'light') {
            icon.className = 'fa-solid fa-sun';
        } else {
            icon.className = 'fa-solid fa-moon';
        }
    }

    // ── Search & Filtering ─────────────────────────────────────
    const searchInput = document.getElementById('blog-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = allBlogs.filter(b => 
                b.title.toLowerCase().includes(query) || 
                b.category.toLowerCase().includes(query) ||
                (b.excerpt && b.excerpt.toLowerCase().includes(query))
            );
            
            const blogContainer = document.getElementById('blog-container');
            const loadMoreBtn   = document.getElementById('load-more-btn');
            
            if (blogContainer) {
                if (filtered.length === 0) {
                    blogContainer.innerHTML = `<div style="grid-column:1/-1; text-align:center; padding:3rem; color:var(--text-muted);">No matching articles found.</div>`;
                    if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                } else {
                    renderBlogCards(blogContainer, filtered.slice(0, (currentPage + 1) * PAGE_SIZE), true);
                    if (loadMoreBtn) updateLoadMoreBtn(loadMoreBtn);
                }
            }
        });
    }

    // ── Real-time blog feed ────────────────────────────────────
    supabase
        .channel('public-blog-feed')
        .on('postgres_changes', {
            event: '*',
            schema: 'public',
            table: 'blogs'
        }, () => {
            renderBlogs(currentSort);
        })
        .subscribe();

    // ── Visitor Logging ────────────────────────────────────────
    async function logVisit() {
        if (sessionStorage.getItem('visit_logged')) return;
        sessionStorage.setItem('visit_logged', 'true');

        const urlParams   = new URLSearchParams(window.location.search);
        const source      = urlParams.get('utm_source') === 'mail' ? 'mail' : 'random';
        const trafficType = document.referrer ? 'link' : 'direct';

        const ua = navigator.userAgent;
        let browser = 'Other';
        if (ua.includes('Firefox'))                          browser = 'Firefox';
        else if (ua.includes('Edg'))                         browser = 'Edge';
        else if (ua.includes('OPR') || ua.includes('Opera')) browser = 'Opera';
        else if (ua.includes('Chrome'))                      browser = 'Chrome';
        else if (ua.includes('Safari'))                      browser = 'Safari';

        const device = /Mobi|Android|iPhone|iPad/i.test(ua) ? 'Mobile' : 'Desktop';

        const { error } = await supabase.from('analytics').insert([{
            source, traffic_type: trafficType,
            age_group: null, gender: null,
            browser, device, location: null
        }]);
        if (error) console.warn('Visit log:', error.message);
    }

    // ── Auth UI ────────────────────────────────────────────────
    async function updateAuthUI() {
        const { data: { session } } = await supabase.auth.getSession();
        const navLinks = document.querySelectorAll('a[href="auth.html"]');
        if (session) {
            navLinks.forEach(link => {
                if (link.classList.contains('btn-outline')) {
                    link.innerText = 'Dashboard';
                    link.href = 'dashboard.html';
                } else if (link.classList.contains('btn-primary')) {
                    link.innerText = 'My Dashboard';
                    link.href = 'dashboard.html';
                }
            });
        }
    }

    // ── Advertisement Rendering ────────────────────────────────
    async function renderAd() {
        const adContainer = document.getElementById('global-ad-container');
        if (!adContainer) return;

        // On Home page, fetch ad with placement = 'home'
        const { data: ads, error } = await supabase
            .from('site_ads')
            .select('*')
            .eq('is_active', true)
            .eq('placement', 'home')
            .limit(1);

        if (!error && ads && ads.length > 0) {
            const ad = ads[0];
            adContainer.style.cssText = 'padding: 0; background: transparent; border: none;';
            let adHtml = `<img src="${ad.image_url}" style="max-width: 100%; height: auto; border-radius: 0.5rem; display: block; margin: 0 auto; object-fit: contain;" alt="Advertisement">`;
            if (ad.link_url) adHtml = `<a href="${ad.link_url}" target="_blank" rel="noopener" style="display: block;">${adHtml}</a>`;
            adContainer.innerHTML = adHtml;
        } else {
            // No home ad found
            adContainer.innerHTML = `<p style="color: var(--text-muted);">ADVERTISEMENT SPACE</p><small>Placeholder for Google AdSense</small>`;
            adContainer.style.cssText = ''; 
        }

        // Real-time updates for ad changes
        supabase.channel('active-ad-home')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'site_ads' }, () => renderAd())
            .subscribe();
    }

    // ── Blog Rendering with Pagination ─────────────────────────
    const PAGE_SIZE = 6;
    let currentSort  = 'date';
    let currentPage  = 0;     // 0-based page index
    let allBlogs     = [];    // full fetched set for client-side sort/page
    let totalFetched = 0;

    // Expose globally so Retry button works
    window.renderBlogs = renderBlogs;

    async function renderBlogs(sortBy = 'date') {
        const blogContainer = document.getElementById('blog-container');
        const loadMoreBtn   = document.getElementById('load-more-btn');
        if (!blogContainer) return;

        currentSort = sortBy;
        currentPage = 0;

        // Show loading skeleton
        // Show premium skeleton loading
        blogContainer.innerHTML = Array(3).fill(0).map(() => `
            <div class="glass-card" style="display:flex; flex-direction:column; gap:1rem;">
                <div class="skeleton" style="width:100%; height:200px; border-radius:0.5rem;"></div>
                <div class="skeleton" style="width:40%; height:1rem;"></div>
                <div class="skeleton" style="width:90%; height:1.5rem;"></div>
                <div class="skeleton" style="width:100%; height:3rem;"></div>
                <div style="display:flex; gap:1rem; margin-top:auto;">
                    <div class="skeleton" style="width:30%; height:0.8rem;"></div>
                    <div class="skeleton" style="width:30%; height:0.8rem;"></div>
                </div>
            </div>
        `).join('');
        if (loadMoreBtn) loadMoreBtn.style.display = 'none';

        try {
            // Fetch all visible blogs for sorting purposes (max 200).
            // Matches: status='published' OR status IS NULL (legacy blogs before column was added).
            const { data: blogs, error } = await supabase
                .from('blogs')
                .select('*')
                .or('status.eq.published,status.is.null')
                .order('created_at', { ascending: false })
                .limit(200);

            if (error) throw error;

            if (!blogs || blogs.length === 0) {
                blogContainer.innerHTML = `
                    <div style="grid-column:1/-1; text-align:center; padding:4rem;
                                background:rgba(255,255,255,0.02); border:1px solid var(--border);
                                border-radius:1rem;">
                        <i class="fa-solid fa-feather" style="font-size:3rem; color:var(--primary); margin-bottom:1.5rem;"></i>
                        <h3 style="color:white; margin-bottom:0.5rem;">No articles yet</h3>
                        <p style="color:var(--text-muted);">Be the first to publish! Go to your Dashboard → New Blog Post.</p>
                        <a href="auth.html" class="btn btn-primary" style="margin-top:1.5rem; display:inline-flex;">
                            <i class="fa-solid fa-pen-to-square"></i> Start Writing
                        </a>
                    </div>`;
                if (loadMoreBtn) loadMoreBtn.style.display = 'none';
                return;
            }

            // Apply sort
            allBlogs = [...blogs];
            if (sortBy === 'views') allBlogs.sort((a, b) => (b.views || 0) - (a.views || 0));
            else if (sortBy === 'name') allBlogs.sort((a, b) => a.title.localeCompare(b.title));
            // 'date' is already sorted by created_at DESC from DB

            totalFetched = allBlogs.length;

            // Render first page
            const firstPage = allBlogs.slice(0, PAGE_SIZE);
            await renderBlogCards(blogContainer, firstPage, true);

            // Show/hide Load More button
            updateLoadMoreBtn(loadMoreBtn);

        } catch (err) {
            console.error('renderBlogs error:', err);
            blogContainer.innerHTML = `
                <div style="grid-column:1/-1; text-align:center; padding:3rem;
                            background:rgba(255,255,255,0.02); border:1px solid var(--border);
                            border-radius:1rem;">
                    <i class="fa-solid fa-triangle-exclamation" style="font-size:3rem; color:#ef4444; margin-bottom:1.5rem;"></i>
                    <h3 style="color:white;">Could not load articles</h3>
                    <p style="color:var(--text-muted);">Check your internet connection. (${err.message})</p>
                    <button onclick="renderBlogs()" class="btn btn-outline" style="margin-top:1rem;">
                        <i class="fa-solid fa-rotate-right"></i> Retry
                    </button>
                </div>`;
        }
    }

    // Load the next page of blogs (appends to grid)
    window.loadMoreBlogs = async function () {
        const blogContainer = document.getElementById('blog-container');
        const loadMoreBtn   = document.getElementById('load-more-btn');
        if (!blogContainer || !allBlogs.length) return;

        currentPage++;
        const start = currentPage * PAGE_SIZE;
        const nextPage = allBlogs.slice(start, start + PAGE_SIZE);
        if (!nextPage.length) { if (loadMoreBtn) loadMoreBtn.style.display = 'none'; return; }

        // Show loading state on button
        if (loadMoreBtn) {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Loading...';
        }

        await renderBlogCards(blogContainer, nextPage, false);

        if (loadMoreBtn) {
            loadMoreBtn.disabled = false;
            loadMoreBtn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Load More';
        }
        updateLoadMoreBtn(loadMoreBtn);
    };

    function updateLoadMoreBtn(btn) {
        if (!btn) return;
        const shown = (currentPage + 1) * PAGE_SIZE;
        if (shown >= totalFetched) {
            btn.style.display = 'none';
        } else {
            btn.style.display = 'inline-flex';
            btn.innerHTML = '<i class="fa-solid fa-chevron-down"></i> Load More';
        }
    }

    // Render an array of blog cards into the container (replace or append)
    async function renderBlogCards(container, blogs, replace) {
        // Fetch reaction counts for these blogs
        const reactionCounts = {};
        try {
            const ids = blogs.map(b => b.id);
            const { data: reactions } = await supabase
                .from('blog_reactions').select('blog_id').in('blog_id', ids);
            (reactions || []).forEach(r => {
                reactionCounts[r.blog_id] = (reactionCounts[r.blog_id] || 0) + 1;
            });
        } catch (e) { /* reactions are optional */ }

        // Badges: newest & most-viewed from the FULL allBlogs set
        const newestId   = allBlogs[0]?.id;
        const mostViewed = [...allBlogs].sort((a, b) => (b.views || 0) - (a.views || 0))[0];

        const html = blogs.map(blog => {
            const isNewest     = blog.id === newestId;
            const isMostViewed = blog.id === mostViewed?.id && (blog.views || 0) > 0 && !isNewest;
            const reactions_ct = reactionCounts[blog.id] || 0;

            return `
            <a href="blog.html?id=${blog.id}"
               style="text-decoration:none; color:inherit; display:block; height:100%;">
               <article class="glass-card"
                    style="display:flex; flex-direction:column; gap:1rem; position:relative;
                           cursor:pointer; height:100%; transition:transform 0.2s, box-shadow 0.2s;"
                    onmouseover="this.style.transform='translateY(-4px)';this.style.boxShadow='0 8px 24px rgba(37,99,235,0.25)';"
                    onmouseout="this.style.transform='';this.style.boxShadow='';">

                    ${isNewest ? `<div style="position:absolute;top:1rem;right:1rem;background:var(--primary);color:white;
                                              padding:0.3rem 0.8rem;border-radius:2rem;font-size:0.7rem;font-weight:700;
                                              text-transform:uppercase;z-index:10;">
                                      <i class="fa-solid fa-star"></i> New</div>` : ''}
                    ${isMostViewed ? `<div style="position:absolute;top:1rem;right:1rem;background:#f59e0b;color:white;
                                                 padding:0.3rem 0.8rem;border-radius:2rem;font-size:0.7rem;font-weight:700;
                                                 text-transform:uppercase;z-index:10;">
                                         <i class="fa-solid fa-fire"></i> Hot</div>` : ''}

                    ${blog.image_url
                        ? `<div style="width:100%;height:200px;border-radius:0.5rem;overflow:hidden;background:#1e293b;display:flex;align-items:center;justify-content:center;">
                               <img src="${blog.image_url}" style="max-width:100%;max-height:100%;object-fit:contain;" loading="lazy" alt="${blog.title}">
                           </div>`
                        : `<div style="width:100%;height:200px;background:linear-gradient(135deg,#1e293b,#334155);
                                       border-radius:0.5rem;display:flex;align-items:center;justify-content:center;">
                               <i class="fa-solid fa-feather-pointed" style="font-size:2.5rem;color:var(--primary);opacity:0.5;"></i>
                           </div>`}

                    <div style="font-size:0.78rem;color:var(--primary);font-weight:600;text-transform:uppercase;letter-spacing:0.05em;">
                        ${blog.category}
                    </div>
                    <h3 style="line-height:1.4;margin:0;">${blog.title}</h3>
                    <p style="color:var(--text-muted);font-size:0.9rem;flex-grow:1;margin:0;">${blog.excerpt}</p>

                    <div style="font-size:0.75rem;color:var(--text-muted);margin-top:0.5rem;display:flex;align-items:center;gap:0.5rem;">
                        <i class="fa-solid fa-circle-user"></i>
                        ${blog.author_name || 'NexGen Author'}
                    </div>

                    <div style="display:flex;gap:1rem;font-size:0.8rem;color:var(--text-muted);
                                padding-top:0.75rem;border-top:1px solid var(--border);">
                        <span><i class="fa-solid fa-eye"></i> ${blog.views || 0}</span>
                        <span><i class="fa-solid fa-heart"></i> ${reactions_ct}</span>
                        <span style="margin-left:auto;">${blog.date || ''}</span>
                    </div>

                    <span class="btn btn-outline"
                          style="padding:0.5rem 1rem;font-size:0.8rem;pointer-events:none;justify-content:center;">
                        Read More →
                    </span>
               </article>
            </a>`;
        }).join('');

        if (replace) {
            container.innerHTML = html;
        } else {
            container.insertAdjacentHTML('beforeend', html);
        }

        if (window.initScrollAnimations) setTimeout(() => window.initScrollAnimations(), 50);
    }

    // ── Sorting controls ───────────────────────────────────────
    const sortButtons = document.querySelectorAll('[data-sort]');
    sortButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            sortButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderBlogs(btn.getAttribute('data-sort'));
        });
    });

    // ── Mobile Menu Toggle ─────────────────────────────────────
    const hamburgerBtn = document.getElementById('hamburger-btn');
    const navMenu      = document.getElementById('nav-menu');
    if (hamburgerBtn && navMenu) {
        hamburgerBtn.addEventListener('click', () => navMenu.classList.toggle('active'));
    }

    // ── Toast ──────────────────────────────────────────────────
    window.showToast = function (message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success'
            ? '<i class="fa-solid fa-check-circle"></i>'
            : '<i class="fa-solid fa-circle-exclamation"></i>';
        toast.innerHTML = `${icon} <span>${message}</span>`;
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
    };

    // ── Fire Initial Loads ─────────────────────────────────────
    updateAuthUI();
    renderAd();
    logVisit();
    renderBlogs();
});
