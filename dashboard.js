/**
 * NexGen Unified Workspace & Analytics (Supabase)
 * Updated: Full feature set with suspension, role management,
 * withdrawal requests, blog status, and earnings breakdown.
 */

document.addEventListener('DOMContentLoaded', () => {

    let currentUser = null;
    let currentProfile = null;
    let isAdmin = false;
    let isSuperAdmin = false;

    let quill = null;
    // Helper: Calculate reading time
    function calculateReadingTime(text) {
        const wordsPerMinute = 200;
        const words = text.trim().split(/\s+/).length;
        return Math.max(1, Math.ceil(words / wordsPerMinute));
    }

    // ============================================================
    // AUTH CHECK
    // ============================================================
    async function checkAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { window.location.href = 'auth.html'; return; }
        currentUser = session.user;

        const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', currentUser.id)
            .single();

        currentProfile = profile || {};
        isAdmin    = profile && (profile.role === 'admin' || profile.role === 'superadmin');
        isSuperAdmin = profile && profile.role === 'superadmin';

        // Check suspension (double-guard on dashboard)
        if (profile && profile.suspended_until && profile.role !== 'superadmin') {
            const suspUntil = new Date(profile.suspended_until);
            if (suspUntil > new Date()) {
                await supabase.auth.signOut();
                window.location.href = 'auth.html';
                return;
            }
        }

        // Update sidebar UI
        const userInfoEl = document.getElementById('user-info');
        if (userInfoEl) userInfoEl.textContent = currentUser.email;

        const roleBadge = document.getElementById('role-badge');
        if (roleBadge) {
            const role = currentProfile.role || 'user';
            roleBadge.textContent = role.charAt(0).toUpperCase() + role.slice(1);
            roleBadge.className = `badge badge-${role}`;
        }

        if (isSuperAdmin) {
            document.getElementById('view-title').innerHTML = `Admin <span style="color: var(--primary);">Dashboard</span>`;
            document.getElementById('view-subtitle').innerText = 'Platform-wide overview and full control.';
            const superSection = document.getElementById('superadmin-section');
            if (superSection) superSection.style.display = 'block';
            const userStat = document.getElementById('container-stat-users');
            if (userStat) userStat.style.display = 'block';
        }

        // Initialize Quill Editor
        if (document.getElementById('blog-editor')) {
            quill = new Quill('#blog-editor', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        [{ 'header': [1, 2, 3, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        ['blockquote', 'code-block'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image', 'video'],
                        ['clean']
                    ]
                }
            });
        }
        await updateAllViews();
        setupRealtime();
        await setupReferral();
    }
    checkAuth();

    // ============================================================
    // REAL-TIME SUBSCRIPTIONS  (live updates without refreshing)
    // ============================================================
    // Called once after auth so we know the user's role
    function setupRealtime() {
        // Blogs channel
        supabase.channel('rt-blogs')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'blogs' }, () => {
                renderAdminBlogs();
                updateDashboardStats();
                renderRecentActivity();
            })
            .subscribe();

        // Files channel
        supabase.channel('rt-files')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, () => {
                renderFiles();
                updateDashboardStats();
            })
            .subscribe();

        if (isSuperAdmin) {
            supabase.channel('rt-profiles')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles' }, () => {
                    renderUsers();
                    updateDashboardStats();
                    renderRecentActivity();
                })
                .subscribe();

            supabase.channel('rt-withdrawals')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'withdrawal_requests' }, () => {
                    renderWithdrawalsAdmin();
                })
                .subscribe();

            supabase.channel('rt-comments')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'blog_comments' }, () => {
                    renderComments();
                })
                .subscribe();

            supabase.channel('rt-subscribers')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'subscribers' }, () => {
                    renderSubscribers();
                })
                .subscribe();

            supabase.channel('rt-messages')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'contact_messages' }, () => {
                    renderMessages();
                })
                .subscribe();

            supabase.channel('rt-analytics')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'analytics' }, () => {
                    // Only re-render if analytics view is currently active
                    const analyticsView = document.getElementById('analytics-view');
                    if (analyticsView && analyticsView.style.display !== 'none') renderAnalytics();
                })
                .subscribe();
        }
    }

    // ============================================================
    // VIEW SWITCHING
    // ============================================================
    const navItems = document.querySelectorAll('.nav-item');
    const adminViews = document.querySelectorAll('.admin-view');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');
            adminViews.forEach(v => v.style.display = 'none');
            document.getElementById(targetView).style.display = 'block';

            const titleText = item.innerText.trim();
            document.getElementById('view-title').innerHTML =
                `<span style="color: var(--primary);">${titleText}</span>`;

            const headerActions = document.getElementById('header-actions');
            headerActions.style.display =
                (targetView === 'dashboard-view' || targetView === 'blogs-view' || targetView === 'files-view')
                    ? 'flex' : 'none';

            if (targetView === 'analytics-view') renderAnalytics();
            if (targetView === 'earnings-view')  renderEarningsBreakdown();
            if (targetView === 'wallet-view')    renderMyWithdrawals();
            if (targetView === 'withdrawals-view') renderWithdrawalsAdmin();
        });
    });

    // ============================================================
    // UPDATE ALL VIEWS
    // ============================================================
    async function updateAllViews() {
        if (!currentUser) return;
        const tasks = [
            renderAdminBlogs(),
            renderFiles(),
            updateDashboardStats(),
            renderRecentActivity(),
        ];
        if (isSuperAdmin) {
            tasks.push(
                renderUsers(),
                renderAnalytics(),
                renderSubscribers(),
                renderComments(),
                renderAds(),
                renderMessages(),
                renderWithdrawalsAdmin()
            );
        }
        await Promise.all(tasks);
    }

    // ============================================================
    // BLOG MODAL
    // ============================================================
    const blogModal   = document.getElementById('blog-modal');
    const openBlogBtn = document.getElementById('open-blog-modal');
    const closeBlogBtn= document.getElementById('close-blog-modal');
    const newBlogForm = document.getElementById('new-blog-form');

    openBlogBtn.addEventListener('click', async () => {
        await populateFileSelectors();
        newBlogForm.reset();
        newBlogForm.removeAttribute('data-edit-id');
        document.getElementById('blog-modal-title').innerText = 'Create New Blog Post';
        document.querySelector('#new-blog-form button[type="submit"]').innerText = 'Publish Post';
        blogModal.style.display = 'flex';
    });

    closeBlogBtn.addEventListener('click', () => {
        newBlogForm.reset();
        newBlogForm.removeAttribute('data-edit-id');
        document.getElementById('blog-modal-title').innerText = 'Create New Blog Post';
        document.querySelector('#new-blog-form button[type="submit"]').innerText = 'Publish Post';
        blogModal.style.display = 'none';
    });

    // Update submit button label when status changes
    const blogStatusDropdown = document.getElementById('blog-status');
    if (blogStatusDropdown) {
        blogStatusDropdown.addEventListener('change', () => {
            const editId = newBlogForm.getAttribute('data-edit-id');
            if (!editId) {
                const submitBtn = document.querySelector('#new-blog-form button[type="submit"]');
                submitBtn.innerText = blogStatusDropdown.value === 'draft' ? 'Save as Draft' : 'Publish Post';
            }
        });
    }

    // Blog image upload
    const uploadBlogImageBtn = document.getElementById('upload-blog-image-btn');
    const blogImageFile      = document.getElementById('blog-image-file');
    const blogImageUrlInput  = document.getElementById('blog-image');

    if (uploadBlogImageBtn) {
        uploadBlogImageBtn.addEventListener('click', () => blogImageFile.click());
        blogImageFile.addEventListener('change', async (e) => {
            if (!e.target.files.length) return;
            const file = e.target.files[0];
            const ext  = file.name.split('.').pop();
            const fileName = `blog_${Date.now()}.${ext}`;
            uploadBlogImageBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            uploadBlogImageBtn.disabled = true;

            const { error: storageError } = await supabase.storage
                .from('nexgen-uploads').upload(`images/${fileName}`, file, { upsert: true });
            uploadBlogImageBtn.innerHTML = '<i class="fa-solid fa-upload"></i>';
            uploadBlogImageBtn.disabled = false;
            if (storageError) { alert(storageError.message); return; }

            const { data: { publicUrl } } = supabase.storage
                .from('nexgen-uploads').getPublicUrl(`images/${fileName}`);
            await supabase.from('files').insert([{
                name: file.name, type: file.type,
                size: (file.size / 1024).toFixed(2) + ' KB',
                url: publicUrl, author_id: currentUser.id
            }]);
            blogImageUrlInput.value = publicUrl;
            showToastMsg('Image uploaded!', 'success');
        });
    }

    // File upload (header button)
    const openFileBtn = document.getElementById('open-file-modal');
    const fileInput   = document.getElementById('file-input');
    openFileBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', async (e) => {
        if (!e.target.files.length) return;
        const file = e.target.files[0];
        const ext  = file.name.split('.').pop();
        const fileName = `file_${Date.now()}.${ext}`;

        const { error: storageError } = await supabase.storage
            .from('nexgen-uploads').upload(`files/${fileName}`, file, { upsert: true });
        if (storageError) { alert(storageError.message); return; }

        const { data: { publicUrl } } = supabase.storage
            .from('nexgen-uploads').getPublicUrl(`files/${fileName}`);
        const { error } = await supabase.from('files').insert([{
            name: file.name, type: file.type,
            size: (file.size / 1024).toFixed(2) + ' KB',
            url: publicUrl, author_id: currentUser.id
        }]);
        if (error) alert(error.message);
        else { updateAllViews(); showToastMsg('File uploaded!', 'success'); }
    });

    async function populateFileSelectors(selectedFileId = null) {
        const fileDropdown = document.getElementById('blog-file-attach');
        if (!fileDropdown) return;
        let query = supabase.from('files').select('id, name').order('created_at', { ascending: false });
        if (!isAdmin) query = query.eq('author_id', currentUser.id);
        const { data: files } = await query;
        fileDropdown.innerHTML = '<option value="">No File Attached</option>' +
            (files ? files.map(f => `<option value="${f.id}" ${selectedFileId == f.id ? 'selected' : ''}>${f.name}</option>`).join('') : '');
    }

    // Handle New / Edit Blog submission
    newBlogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const editId  = newBlogForm.getAttribute('data-edit-id');
        const content = quill ? quill.root.innerHTML : document.getElementById('blog-content').value;
        const textOnly = quill ? quill.getText() : content;
        const readingTime = calculateReadingTime(textOnly);

        const blogData = {
            title:     document.getElementById('blog-title').value,
            category:  document.getElementById('blog-category').value,
            excerpt:   document.getElementById('blog-excerpt').value,
            content:   content,
            image_url: document.getElementById('blog-image').value,
            status:    document.getElementById('blog-status').value,
            file_id:   document.getElementById('blog-file-attach').value || null,
            scheduled_for: document.getElementById('blog-scheduled-for').value || null,
            reading_time: readingTime,
            date:      new Date().toLocaleDateString(),
            author_id: currentUser.id,
            author_name: currentProfile?.full_name || currentUser.email,
            author_avatar_url: currentProfile?.avatar_url || null
        };

        const result = editId
            ? await supabase.from('blogs').update(blogData).eq('id', editId)
            : await supabase.from('blogs').insert([blogData]);

        if (result.error) { alert(result.error.message); return; }
        blogModal.style.display = 'none';
        newBlogForm.reset();
        if (quill) quill.setContents([]);
        newBlogForm.removeAttribute('data-edit-id');
        document.querySelector('#new-blog-form button[type="submit"]').innerText = 'Publish Post';
        await updateAllViews();
        showToastMsg(editId ? 'Blog updated!' : (blogData.status === 'draft' ? 'Blog saved as draft.' : 'Blog published!'), 'success');
    });

    window.editBlog = async function (id) {
        const { data: blog, error } = await supabase.from('blogs').select('*').eq('id', id).single();
        if (error) { alert(error.message); return; }
        document.getElementById('blog-title').value     = blog.title;
        document.getElementById('blog-category').value  = blog.category;
        document.getElementById('blog-excerpt').value   = blog.excerpt;
        if (quill) quill.root.innerHTML = blog.content;
        else document.getElementById('blog-content').value = blog.content;
        document.getElementById('blog-image').value     = blog.image_url || '';
        document.getElementById('blog-status').value    = blog.status || 'published';
        document.getElementById('blog-scheduled-for').value = blog.scheduled_for ? blog.scheduled_for.slice(0, 16) : '';
        await populateFileSelectors(blog.file_id);
        newBlogForm.setAttribute('data-edit-id', id);
        document.getElementById('blog-modal-title').innerText = 'Edit Blog Post';
        document.querySelector('#new-blog-form button[type="submit"]').innerText = 'Update Post';
        blogModal.style.display = 'flex';
    };

    // Toggle blog status inline
    window.toggleBlogStatus = async function (id, currentStatus) {
        const newStatus = currentStatus === 'published' ? 'draft' : 'published';
        const { error } = await supabase.from('blogs').update({ status: newStatus }).eq('id', id);
        if (error) alert(error.message);
        else { await renderAdminBlogs(); showToastMsg(`Blog set to ${newStatus}`, 'success'); }
    };

    window.deleteBlog = async function (id) {
        if (!confirm('Are you sure you want to delete this post?')) return;
        const { error } = await supabase.from('blogs').delete().eq('id', id);
        if (error) alert(error.message);
        else { await updateAllViews(); showToastMsg('Blog deleted.', 'error'); }
    };

    // ============================================================
    // RENDER BLOGS TABLE
    // ============================================================
    async function renderAdminBlogs() {
        const blogTable = document.getElementById('admin-blog-table');
        if (!blogTable) return;

        let query = supabase.from('blogs').select('*').order('created_at', { ascending: false });
        if (!isAdmin) query = query.eq('author_id', currentUser.id);

        const { data: blogs, error } = await query;
        if (error) { console.error(error); return; }

        if (!blogs || blogs.length === 0) {
            blogTable.innerHTML = '<tr><td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No blog posts found. Click "New Blog Post" to get started.</td></tr>';
            return;
        }

        blogTable.innerHTML = blogs.map(blog => {
            const earnings = ((blog.views || 0) / 100).toFixed(2);
            const statusBadge = blog.status === 'draft'
                ? '<span class="badge badge-draft">Draft</span>'
                : '<span class="badge badge-published">Published</span>';

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 1rem; color: white; max-width: 200px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${blog.image_url
                            ? `<img src="${blog.image_url}" style="width: 36px; height: 36px; border-radius: 4px; object-fit: cover; background: #1e293b; flex-shrink: 0;">`
                            : `<div style="width: 36px; height: 36px; background: #334155; border-radius: 4px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;"><i class="fa-solid fa-image" style="font-size: 0.75rem; color: var(--text-muted);"></i></div>`}
                        <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${blog.title}</span>
                    </div>
                </td>
                <td style="padding: 1rem; font-size: 0.8rem;">${blog.category}</td>
                <td style="padding: 1rem; font-size: 0.8rem;">${blog.date || 'N/A'}</td>
                <td style="padding: 1rem; color: #60a5fa;">${blog.views || 0}</td>
                <td style="padding: 1rem; color: #10b981;">Rs. ${earnings}</td>
                <td style="padding: 1rem;">${statusBadge}</td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        <button class="icon-btn" title="Edit" onclick="editBlog(${blog.id})" style="color: var(--primary);">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="icon-btn" title="${blog.status === 'published' ? 'Set as Draft' : 'Publish'}"
                            onclick="toggleBlogStatus(${blog.id}, '${blog.status || 'published'}')"
                            style="color: ${blog.status === 'published' ? '#f59e0b' : '#10b981'};">
                            <i class="fa-solid ${blog.status === 'published' ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button class="icon-btn" title="Delete" onclick="deleteBlog(${blog.id})" style="color: #f87171;">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // ============================================================
    // RENDER FILES
    // ============================================================
    async function renderFiles() {
        const fileList = document.getElementById('file-list');
        if (!fileList) return;
        let query = supabase.from('files').select('*').order('created_at', { ascending: false });
        if (!isAdmin) query = query.eq('author_id', currentUser.id);
        const { data: files } = await query;

        if (!files || files.length === 0) {
            fileList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No files uploaded yet.</p>';
            return;
        }

        const isImage = t => t && t.includes('image');
        fileList.innerHTML = files.map(file => `
            <div style="text-align: center; padding: 1rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 0.5rem; position: relative;">
                <button onclick="deleteFile(${file.id})" style="position: absolute; top: 5px; right: 5px; color: #f87171; background: none; border: none; cursor: pointer; font-size: 0.85rem; z-index: 5;">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <div style="cursor: pointer;" onclick="openLightbox('${file.url}')">
                    ${isImage(file.type) 
                        ? `<img src="${file.url}" style="width: 100%; height: 80px; object-fit: cover; border-radius: 0.25rem; margin-bottom: 0.5rem; background: #0f172a;">`
                        : `<i class="fa-solid fa-file-pdf" style="font-size: 2rem; color: var(--primary); margin-bottom: 0.5rem; display: block;"></i>`
                    }
                    <p style="font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: white;">${file.name}</p>
                </div>
                <span style="font-size: 0.7rem; color: var(--text-muted);">${file.size}</span>
                <a href="${file.url}" target="_blank" style="font-size: 0.7rem; color: var(--primary); display: block; margin-top: 0.25rem;">Download</a>
            </div>`).join('');
    }

    window.deleteFile = async function (id) {
        if (!confirm('Delete this file?')) return;
        const { error } = await supabase.from('files').delete().eq('id', id);
        if (error) alert(error.message);
        else updateAllViews();
    };

    // ============================================================
    // DASHBOARD STATS
    // ============================================================
    async function updateDashboardStats() {
        let blogsQuery = supabase.from('blogs').select('views', { count: 'exact' });
        let filesQuery = supabase.from('files').select('*', { count: 'exact', head: true });
        if (!isAdmin) {
            blogsQuery = blogsQuery.eq('author_id', currentUser.id);
            filesQuery = filesQuery.eq('author_id', currentUser.id);
        }

        const [{ data: blogs }, { count: filesCount }] = await Promise.all([blogsQuery, filesQuery]);
        const totalViews    = blogs ? blogs.reduce((s, b) => s + (b.views || 0), 0) : 0;
        const totalEarnings = (totalViews / 100).toFixed(2);
        const withdrawn     = parseFloat(currentProfile.total_withdrawn || 0).toFixed(2);
        const available     = Math.max(0, parseFloat(totalEarnings) - parseFloat(withdrawn)).toFixed(2);

        setText('stat-blogs',    blogs ? blogs.length : 0);
        setText('stat-files',    filesCount || 0);
        setText('stat-views',    totalViews);
        setText('stat-earnings', `Rs. ${totalEarnings}`);
        setText('wallet-balance',`Rs. ${available}`);

        if (isSuperAdmin) {
            const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
            setText('stat-users', usersCount || 0);
        }
    }

    function setText(id, val) {
        const el = document.getElementById(id);
        if (el) {
            el.innerText = val;
            el.classList.remove('count-up');
            void el.offsetWidth; // Trigger reflow
            el.classList.add('count-up');
        }
    }

    // ============================================================
    // EARNINGS BREAKDOWN
    // ============================================================
    async function renderEarningsBreakdown() {
        let query = supabase.from('blogs').select('id, title, category, views, status').order('views', { ascending: false });
        if (!isAdmin) query = query.eq('author_id', currentUser.id);
        const { data: blogs } = await query;

        const totalViews    = blogs ? blogs.reduce((s, b) => s + (b.views || 0), 0) : 0;
        const totalEarnings = (totalViews / 100);
        const withdrawn     = parseFloat(currentProfile.total_withdrawn || 0);
        const available     = Math.max(0, totalEarnings - withdrawn);

        setText('earn-total',     `Rs. ${totalEarnings.toFixed(2)}`);
        setText('earn-withdrawn', `Rs. ${withdrawn.toFixed(2)}`);
        setText('earn-available', `Rs. ${available.toFixed(2)}`);

        const tbody = document.getElementById('earnings-blog-table');
        if (!tbody) return;

        if (!blogs || blogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No blogs yet.</td></tr>';
            return;
        }

        tbody.innerHTML = blogs.map(b => {
            const earn = ((b.views || 0) / 100).toFixed(2);
            const pct  = totalViews > 0 ? Math.round(((b.views || 0) / totalViews) * 100) : 0;
            const badge = b.status === 'draft'
                ? '<span class="badge badge-draft">Draft</span>'
                : '<span class="badge badge-published">Published</span>';
            return `
            <tr class="earnings-row">
                <td style="color: white;">
                    ${b.title}
                    <div style="height: 3px; background: rgba(255,255,255,0.08); border-radius: 2px; margin-top: 0.4rem; overflow: hidden;">
                        <div style="width: ${pct}%; height: 100%; background: var(--primary); border-radius: 2px;"></div>
                    </div>
                </td>
                <td>${b.category}</td>
                <td style="color: #60a5fa;">${b.views || 0}</td>
                <td style="color: #10b981; font-weight: 600;">Rs. ${earn}</td>
                <td>${badge}</td>
            </tr>`;
        }).join('');
    }

    // ============================================================
    // WITHDRAWAL REQUESTS (User side)
    // ============================================================
    const openWithdrawModal   = document.getElementById('open-withdraw-modal');
    const withdrawModal       = document.getElementById('withdraw-modal');
    const cancelWithdrawBtn   = document.getElementById('cancel-withdraw-btn');
    const withdrawForm        = document.getElementById('withdraw-form');
    let currentQrUrl = null;

    if (openWithdrawModal) {
        openWithdrawModal.addEventListener('click', () => {
            withdrawForm.reset();
            clearQrPreview();
            withdrawModal.style.display = 'flex';
        });
    }

    if (cancelWithdrawBtn) cancelWithdrawBtn.addEventListener('click', () => withdrawModal.style.display = 'none');

    // QR Upload Handlers
    window.handleQrDrop = function(e) {
        e.preventDefault();
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)';
        if (e.dataTransfer.files && e.dataTransfer.files[0]) processQrFile(e.dataTransfer.files[0]);
    };

    const qrFileInput = document.getElementById('qr-file-input');
    if (qrFileInput) {
        qrFileInput.addEventListener('change', (e) => {
            if (e.target.files && e.target.files[0]) processQrFile(e.target.files[0]);
        });
    }

    async function processQrFile(file) {
        if (!file.type.startsWith('image/')) { alert('Please upload an image file (PNG, JPG).'); return; }
        if (file.size > 5 * 1024 * 1024) { alert('File is too large. Max 5MB.'); return; }

        const submitBtn = document.getElementById('withdraw-submit-btn');
        const progressBar = document.getElementById('qr-progress-bar');
        const progressDiv = document.getElementById('qr-upload-progress');
        
        if(submitBtn) submitBtn.disabled = true;
        if(progressDiv) progressDiv.style.display = 'block';
        if(progressBar) progressBar.style.width = '30%';

        const ext  = file.name.split('.').pop();
        const fileName = `qr_${currentUser.id}_${Date.now()}.${ext}`;

        const { error } = await supabase.storage
            .from('nexgen-uploads')
            .upload(`withdrawals/${fileName}`, file, { upsert: true });

        if (error) {
            alert('QR Upload failed: ' + error.message);
            if(progressDiv) progressDiv.style.display = 'none';
            if(submitBtn) submitBtn.disabled = false;
            return;
        }

        if(progressBar) progressBar.style.width = '100%';

        const { data: { publicUrl } } = supabase.storage
            .from('nexgen-uploads')
            .getPublicUrl(`withdrawals/${fileName}`);

        currentQrUrl = publicUrl;
        document.getElementById('withdraw-qr-url').value = publicUrl;

        // Show preview
        document.getElementById('qr-upload-placeholder').style.display = 'none';
        const preview = document.getElementById('qr-preview');
        preview.src = publicUrl;
        preview.style.display = 'block';
        document.getElementById('qr-clear-btn').style.display = 'block';
        
        if(progressDiv) progressDiv.style.display = 'none';
        if(submitBtn) submitBtn.disabled = false;
        showToastMsg('QR Code attached successfully!', 'success');
    }

    window.clearQrPreview = function(e) {
        if(e) e.stopPropagation();
        currentQrUrl = null;
        document.getElementById('withdraw-qr-url').value = '';
        document.getElementById('qr-file-input').value = '';
        document.getElementById('qr-preview').style.display = 'none';
        document.getElementById('qr-clear-btn').style.display = 'none';
        document.getElementById('qr-upload-placeholder').style.display = 'block';
    };

    if (withdrawForm) {
        withdrawForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount  = parseFloat(document.getElementById('withdraw-amount').value);
            const method  = document.getElementById('withdraw-method').value;
            const details = document.getElementById('withdraw-details').value;

            // Check available balance
            const { data: blogs } = await supabase.from('blogs').select('views').eq('author_id', currentUser.id);
            const totalViews    = blogs ? blogs.reduce((s, b) => s + (b.views || 0), 0) : 0;
            const totalEarnings = totalViews / 100;
            const withdrawn     = parseFloat(currentProfile.total_withdrawn || 0);
            const available     = Math.max(0, totalEarnings - withdrawn);

            if (amount < 10) { alert('Minimum withdrawal is Rs. 10.00'); return; }
            if (amount > available) { alert(`You only have Rs. ${available.toFixed(2)} available.`); return; }

            const submitBtn = document.getElementById('withdraw-submit-btn');
            if(submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Submitting...';
            }

            const { error } = await supabase.from('withdrawal_requests').insert([{
                user_id: currentUser.id,
                amount,
                payment_method: method,
                payment_details: details,
                payment_qr_url: currentQrUrl,
                status: 'pending'
            }]);

            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Submit Request';
            }

            if (error) { alert(error.message); return; }
            withdrawModal.style.display = 'none';
            await renderMyWithdrawals();
            showToastMsg('Withdrawal request submitted!', 'success');
        });
    }

    async function renderMyWithdrawals() {
        const container = document.getElementById('my-withdrawal-list');
        if (!container) return;

        const { data: requests } = await supabase
            .from('withdrawal_requests')
            .select('*')
            .eq('user_id', currentUser.id)
            .order('created_at', { ascending: false });

        if (!requests || requests.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem; text-align: center; padding: 1rem;">No withdrawal requests yet.</p>';
            return;
        }

        container.innerHTML = requests.map(r => {
            const date = new Date(r.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const statusClass = r.status === 'approved' ? 'badge-approved' : r.status === 'rejected' ? 'badge-rejected' : 'badge-pending';
            return `
            <div class="withdraw-card">
                <div class="amount">Rs. ${parseFloat(r.amount).toFixed(2)}</div>
                <div class="meta">
                    <p><strong style="color: white;">${r.payment_method.replace('_', ' ').toUpperCase()}</strong></p>
                    <p>${date}</p>
                    ${r.admin_note ? `<p style="color: #f59e0b; margin-top: 0.25rem;"><i class="fa-solid fa-circle-info"></i> ${r.admin_note}</p>` : ''}
                </div>
                <span class="badge ${statusClass}">${r.status}</span>
            </div>`;
        }).join('');
    }

    // ============================================================
    // WITHDRAWAL REQUESTS (Superadmin side)
    // ============================================================
    async function renderWithdrawalsAdmin() {
        if (!isSuperAdmin) return;
        const tbody = document.getElementById('withdrawals-table');
        const pendingCount = document.getElementById('withdrawal-pending-count');
        const badge = document.getElementById('pending-withdrawals-badge');
        if (!tbody) return;

        const { data: requests } = await supabase
            .from('withdrawal_requests')
            .select('*, profiles(full_name, email)')
            .order('created_at', { ascending: false });

        const pending = requests ? requests.filter(r => r.status === 'pending').length : 0;
        if (pendingCount) pendingCount.innerText = pending;
        if (badge) badge.innerText = pending;

        if (!requests || requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="padding: 2rem; text-align: center; color: var(--text-muted);">No withdrawal requests.</td></tr>';
            return;
        }

        tbody.innerHTML = requests.map(r => {
            const date = new Date(r.created_at).toLocaleDateString();
            const user = r.profiles;
            const statusClass = r.status === 'approved' ? 'badge-approved' : r.status === 'rejected' ? 'badge-rejected' : 'badge-pending';

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 1rem; color: white;">
                    <p style="margin: 0; font-weight: 600;">${user?.full_name || 'Unknown'}</p>
                    <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">${user?.email || ''}</p>
                </td>
                <td style="padding: 1rem; color: #10b981; font-weight: 700;">Rs. ${parseFloat(r.amount).toFixed(2)}</td>
                <td style="padding: 1rem;">${r.payment_method.replace('_', ' ').toUpperCase()}</td>
                <td style="padding: 1rem; max-width: 160px; font-size: 0.82rem; color: var(--text-muted);" title="${r.payment_details || ''}">
                    ${r.payment_details ? r.payment_details.substring(0, 30) + (r.payment_details.length > 30 ? '...' : '') : 'N/A'}
                    ${r.payment_qr_url ? `<br><a href="${r.payment_qr_url}" target="_blank" style="color:var(--primary); font-size:0.75rem; display:inline-flex; align-items:center; gap:4px; margin-top:4px;"><i class="fa-solid fa-qrcode"></i> View QR / Image</a>` : ''}
                </td>
                <td style="padding: 1rem; font-size: 0.82rem;">${date}</td>
                <td style="padding: 1rem;"><span class="badge ${statusClass}">${r.status}</span></td>
                <td style="padding: 1rem;">
                    ${r.status === 'pending' ? `
                    <div style="display: flex; gap: 6px;">
                        <button class="icon-btn" style="color: #10b981;" title="Approve" onclick="approveWithdrawal(${r.id}, '${r.user_id}', ${r.amount})">
                            <i class="fa-solid fa-check"></i>
                        </button>
                        <button class="icon-btn" style="color: #f87171;" title="Reject" onclick="rejectWithdrawal(${r.id})">
                            <i class="fa-solid fa-xmark"></i>
                        </button>
                    </div>` : `<span style="color: var(--text-muted); font-size: 0.8rem;">Resolved</span>`}
                </td>
            </tr>`;
        }).join('');
    }

    window.approveWithdrawal = async function (id, userId, amount) {
        if (!confirm(`Approve withdrawal of Rs. ${amount}? This will update the user's withdrawn total.`)) return;

        // Update the request status
        const { error: reqError } = await supabase
            .from('withdrawal_requests')
            .update({ status: 'approved', resolved_at: new Date().toISOString() })
            .eq('id', id);
        if (reqError) { alert(reqError.message); return; }

        // Update total_withdrawn on profile
        const { data: profile } = await supabase.from('profiles').select('total_withdrawn').eq('id', userId).single();
        const newTotal = parseFloat(profile?.total_withdrawn || 0) + parseFloat(amount);
        await supabase.from('profiles').update({ total_withdrawn: newTotal }).eq('id', userId);

        await renderWithdrawalsAdmin();
        showToastMsg('Withdrawal approved!', 'success');
    };

    window.rejectWithdrawal = async function (id) {
        const note = prompt('Optional: Provide a reason for rejection (visible to user):');
        const { error } = await supabase
            .from('withdrawal_requests')
            .update({ status: 'rejected', admin_note: note || null, resolved_at: new Date().toISOString() })
            .eq('id', id);
        if (error) { alert(error.message); return; }
        await renderWithdrawalsAdmin();
        showToastMsg('Withdrawal rejected.', 'error');
    };

    // ============================================================
    // USERS TABLE (Superadmin)
    // ============================================================
    async function renderUsers() {
        if (!isSuperAdmin) return;
        const userTable = document.getElementById('admin-user-table');
        if (!userTable) return;

        const { data: users, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
        if (error) { console.error(error); return; }

        if (!users || users.length === 0) {
            userTable.innerHTML = '<tr><td colspan="8" style="padding: 2rem; text-align: center; color: var(--text-muted);">No users registered yet.</td></tr>';
            return;
        }

        userTable.innerHTML = users.map(user => {
            const isOwner = user.role === 'superadmin';
            const earnings = ((user.views_total || 0) / 100).toFixed(2);

            // Suspension status
            let suspStatus = '<span class="badge badge-active">Active</span>';
            let isSuspended = false;
            if (user.suspended_until) {
                const suspUntil = new Date(user.suspended_until);
                if (suspUntil > new Date()) {
                    isSuspended = true;
                    const untilStr = suspUntil.toLocaleDateString();
                    suspStatus = `<span class="badge badge-suspended" title="Until ${untilStr}">Suspended</span>`;
                }
            }

            const roleBadgeClass = user.role === 'superadmin' ? 'badge-superadmin' : user.role === 'admin' ? 'badge-admin' : 'badge-user';

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 1rem; color: white; font-weight: 500;">${user.full_name || 'N/A'}</td>
                <td style="padding: 1rem; font-size: 0.82rem;">${user.email}</td>
                <td style="padding: 1rem;">
                    ${isOwner
                        ? `<span class="badge badge-superadmin">Superadmin</span>`
                        : `<select onchange="changeUserRole('${user.id}', this.value)"
                            style="background: #1e293b; border: 1px solid rgba(255,255,255,0.1); border-radius: 0.4rem; color: white; font-size: 0.8rem; padding: 0.2rem 0.4rem; cursor: pointer;">
                                <option value="user"  ${user.role === 'user'  ? 'selected' : ''}>User</option>
                                <option value="admin" ${user.role === 'admin' ? 'selected' : ''}>Admin</option>
                           </select>`}
                </td>
                <td style="padding: 1rem; color: #60a5fa;">${user.views_total || 0}</td>
                <td style="padding: 1rem; color: #10b981;">Rs. ${earnings}</td>
                <td style="padding: 1rem; color: #f87171;">Rs. ${parseFloat(user.total_withdrawn || 0).toFixed(2)}</td>
                <td style="padding: 1rem;">${suspStatus}</td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 6px; flex-wrap: wrap;">
                        ${!isOwner ? `
                            ${isSuspended
                                ? `<button class="icon-btn" title="Lift Suspension" onclick="liftSuspension('${user.id}')" style="color: #10b981;"><i class="fa-solid fa-user-check"></i></button>`
                                : `<button class="icon-btn" title="Suspend User" onclick="openSuspendModal('${user.id}')" style="color: #f59e0b;"><i class="fa-solid fa-user-lock"></i></button>`}
                            <button class="icon-btn" title="Reset Wallet" onclick="resetWallet('${user.id}')" style="color: #60a5fa;"><i class="fa-solid fa-rotate-left"></i></button>
                            <button class="icon-btn" title="Update Withdrawn" onclick="updateWithdrawn('${user.id}', ${user.total_withdrawn || 0})" style="color: #a78bfa;"><i class="fa-solid fa-money-bill-transfer"></i></button>
                            <button class="icon-btn" title="Delete User" onclick="deleteUser('${user.id}')" style="color: #f87171;"><i class="fa-solid fa-user-minus"></i></button>
                        ` : `<i class="fa-solid fa-shield" title="Protected" style="color: var(--primary); opacity: 0.5; padding: 0.4rem;"></i>`}
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Role Change
    window.changeUserRole = async function (userId, newRole) {
        if (!confirm(`Change this user's role to "${newRole}"?`)) { await renderUsers(); return; }
        const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
        if (error) { alert(error.message); await renderUsers(); }
        else showToastMsg(`Role updated to ${newRole}`, 'success');
    };

    // Suspension
    const suspendModal     = document.getElementById('suspend-modal');
    const confirmSuspendBtn= document.getElementById('confirm-suspend-btn');
    const cancelSuspendBtn = document.getElementById('cancel-suspend-btn');

    window.openSuspendModal = function (userId) {
        document.getElementById('suspend-user-id').value = userId;
        document.getElementById('suspend-reason').value = '';
        document.getElementById('suspend-duration').value = '3';
        suspendModal.style.display = 'flex';
    };

    cancelSuspendBtn.addEventListener('click', () => suspendModal.style.display = 'none');

    confirmSuspendBtn.addEventListener('click', async () => {
        const userId = document.getElementById('suspend-user-id').value;
        const days   = parseInt(document.getElementById('suspend-duration').value);
        const reason = document.getElementById('suspend-reason').value.trim();

        const until = new Date();
        until.setDate(until.getDate() + days);

        const { error } = await supabase.from('profiles').update({
            suspended_until:    until.toISOString(),
            suspension_reason:  reason || null
        }).eq('id', userId);

        suspendModal.style.display = 'none';
        if (error) { alert(error.message); return; }
        await renderUsers();
        showToastMsg(`User suspended for ${days} day(s).`, 'error');
    });

    window.liftSuspension = async function (userId) {
        if (!confirm('Lift this suspension?')) return;
        const { error } = await supabase.from('profiles').update({
            suspended_until:   null,
            suspension_reason: null
        }).eq('id', userId);
        if (error) { alert(error.message); return; }
        await renderUsers();
        showToastMsg('Suspension lifted.', 'success');
    };

    // Reset wallet
    window.resetWallet = async function (userId) {
        if (!confirm('Reset this user\'s wallet (zero out views and withdrawn amount)?')) return;
        const { error } = await supabase.from('profiles').update({
            total_withdrawn: 0, views_total: 0
        }).eq('id', userId);
        if (error) { alert(error.message); return; }
        await updateAllViews();
        showToastMsg('Wallet reset.', 'success');
    };

    window.updateWithdrawn = async function (userId, current) {
        const val = prompt('Enter new Total Withdrawn amount (Rs.):', current);
        if (val === null || isNaN(val)) return;
        const { error } = await supabase.from('profiles').update({ total_withdrawn: parseFloat(val) }).eq('id', userId);
        if (error) { alert(error.message); return; }
        await updateAllViews();
        showToastMsg('Withdrawn amount updated.', 'success');
    };

    window.deleteUser = async function (id) {
        const { data: user } = await supabase.from('profiles').select('email').eq('id', id).single();
        if (user?.email === 'ishoracharya977@gmail.com') {
            alert('The primary Superadmin account cannot be removed.');
            return;
        }
        if (!confirm('Permanently remove this user?')) return;
        const { error } = await supabase.from('profiles').delete().eq('id', id);
        if (error) alert(error.message);
        else { await updateAllViews(); showToastMsg('User removed.', 'error'); }
    };

    // ============================================================
    // RECENT ACTIVITY
    // ============================================================
    async function renderRecentActivity() {
        const list = document.getElementById('recent-activity-list');
        if (!list) return;

        let query = supabase.from('blogs').select('title, created_at').order('created_at', { ascending: false }).limit(5);
        if (!isAdmin) query = query.eq('author_id', currentUser.id);
        const { data: recentBlogs } = await query;

        const activities = [];
        if (recentBlogs) {
            recentBlogs.forEach(b => activities.push({
                icon: 'fa-pen-to-square', color: 'var(--primary)',
                text: `Blog <strong>"${b.title}"</strong> published`,
                time: getTimeAgo(b.created_at)
            }));
        }

        if (isSuperAdmin) {
            const { data: recentUsers } = await supabase.from('profiles')
                .select('full_name, email, created_at')
                .order('created_at', { ascending: false }).limit(3);
            if (recentUsers) {
                recentUsers.forEach(u => activities.push({
                    icon: 'fa-user-plus', color: '#10b981',
                    text: `New user <strong>${u.full_name || u.email}</strong> registered`,
                    time: getTimeAgo(u.created_at)
                }));
            }
        }

        if (activities.length === 0) {
            list.innerHTML = '<li style="padding: 0.75rem 0; color: var(--text-muted);">No recent activity yet.</li>';
            return;
        }

        list.innerHTML = activities.slice(0, 6).map(a => `
            <li style="padding: 0.75rem 0; border-bottom: 1px solid rgba(255,255,255,0.05); display: flex; align-items: center; gap: 1rem;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: rgba(37,99,235,0.1); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i class="fa-solid ${a.icon}" style="font-size: 0.8rem; color: ${a.color};"></i>
                </div>
                <span style="flex: 1; font-size: 0.9rem;">${a.text}</span>
                <span style="font-size: 0.75rem; color: var(--text-muted); white-space: nowrap;">${a.time}</span>
            </li>`).join('');
    }

    function getTimeAgo(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 1)  return 'just now';
        if (mins < 60) return `${mins}m ago`;
        const hrs = Math.floor(mins / 60);
        if (hrs < 24)  return `${hrs}h ago`;
        const days = Math.floor(hrs / 24);
        if (days < 30) return `${days}d ago`;
        return new Date(dateStr).toLocaleDateString();
    }

    // ============================================================
    // ANALYTICS (Superadmin)
    // ============================================================
    let charts = {};

    async function renderAnalytics() {
        if (!isSuperAdmin) return;
        const { data: rawEvents, error } = await supabase.from('analytics').select('*');
        const noData = document.getElementById('no-analytics-data');
        const grid   = document.getElementById('analytics-grid');

        if (error || !rawEvents || rawEvents.length === 0) {
            if (noData) noData.style.display = 'block';
            if (grid)   grid.style.display   = 'none';
            return;
        }
        if (noData) noData.style.display = 'none';
        if (grid)   grid.style.display   = 'grid';

        const stats = {
            source:  { mail: 0, random: 0 },
            type:    { link: 0, direct: 0 },
            ages:    { '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0, '41-50': 0, '51+': 0 },
            gender:  { male: 0, female: 0, other: 0 },
            browsers: {}, devices: {}, locations: {}
        };

        rawEvents.forEach(ev => {
            if (ev.source)        stats.source[ev.source === 'mail' ? 'mail' : 'random']++;
            if (ev.traffic_type)  stats.type[ev.traffic_type]++;
            if (ev.age_group)     stats.ages[ev.age_group]++;
            if (ev.gender)        stats.gender[ev.gender === 'male' ? 'male' : ev.gender === 'female' ? 'female' : 'other']++;
            if (ev.browser)       stats.browsers[ev.browser] = (stats.browsers[ev.browser] || 0) + 1;
            if (ev.device)        stats.devices[ev.device]   = (stats.devices[ev.device]   || 0) + 1;
            if (ev.location)      stats.locations[ev.location]=(stats.locations[ev.location]|| 0) + 1;
        });

        const getTop = obj => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
        setText('top-browser',  getTop(stats.browsers));
        setText('top-device',   getTop(stats.devices));
        setText('top-location', getTop(stats.locations));

        const colors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

        const baseChartOptions = (extraOptions = {}) => ({
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { size: 11, family: 'Outfit' }, padding: 12 }
                },
                tooltip: {
                    backgroundColor: '#1e293b',
                    borderColor: 'rgba(255,255,255,0.1)',
                    borderWidth: 1,
                    titleColor: 'white',
                    bodyColor: '#94a3b8',
                    padding: 10
                }
            },
            ...extraOptions
        });

        const draw = (id, type, labels, data, clrs, extraOpts = {}) => {
            if (charts[id]) charts[id].destroy();
            const canvas = document.getElementById(id);
            if (!canvas) return;
            charts[id] = new Chart(canvas.getContext('2d'), {
                type,
                data: { labels, datasets: [{ data, backgroundColor: clrs, borderColor: 'transparent', hoverOffset: 10, borderRadius: type === 'bar' ? 4 : 0 }] },
                options: baseChartOptions(extraOpts)
            });
        };

        draw('sourceChart', 'pie',      ['Mail', 'Random'],         [stats.source.mail, stats.source.random], [colors[0], colors[1]]);
        draw('typeChart',   'doughnut', ['Link', 'Direct'],         [stats.type.link, stats.type.direct],     [colors[4], colors[2]]);
        draw('ageChart',    'bar',      Object.keys(stats.ages),    Object.values(stats.ages), colors, {
            scales: {
                x: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' } },
                y: { ticks: { color: '#94a3b8', font: { size: 10 } }, grid: { color: 'rgba(255,255,255,0.04)' }, beginAtZero: true }
            }
        });
        draw('genderChart', 'pie', ['Male', 'Female', 'Other'], [stats.gender.male, stats.gender.female, stats.gender.other], [colors[0], colors[5], colors[3]]);
    }

    // NOTE: Simulate button is only shown in analytics-view HTML for superadmin.
    // Analytics auto-refresh via realtime subscription when new visits come in.
    // The simulate button is kept for dev/testing purposes only.
    const simulateBtn = document.getElementById('simulate-data-btn');
    if (simulateBtn) {
        simulateBtn.addEventListener('click', async () => {
            if (!confirm('[DEV TOOL] Generate 20 randomized visitor records to test charts? Remove this button in production.')) return;
            const sources   = ['mail','random'];
            const types     = ['link','direct'];
            const ages      = ['11-20','21-30','31-40','41-50','51+'];
            const genders   = ['male','female','other'];
            const browsers  = ['Chrome','Firefox','Safari','Edge'];
            const locations = ['Nepal','India','USA','UK','Australia'];
            const sampleData = Array.from({ length: 20 }, () => ({
                source:       sources[Math.floor(Math.random() * sources.length)],
                traffic_type: types[Math.floor(Math.random() * types.length)],
                age_group:    ages[Math.floor(Math.random() * ages.length)],
                gender:       genders[Math.floor(Math.random() * genders.length)],
                browser:      browsers[Math.floor(Math.random() * browsers.length)],
                device:       Math.random() > 0.5 ? 'Mobile' : 'Desktop',
                location:     locations[Math.floor(Math.random() * locations.length)]
            }));
            const { error } = await supabase.from('analytics').insert(sampleData);
            if (error) alert(error.message);
            else { showToastMsg('Test data inserted. Charts will update automatically.', 'success'); }
        });
    }

    // ============================================================
    // SUBSCRIBERS (Superadmin)
    // ============================================================
    async function renderSubscribers() {
        if (!isSuperAdmin) return;
        const tbody = document.getElementById('subscribers-table');
        const count = document.getElementById('subscriber-count');
        const { data: subscribers } = await supabase.from('subscribers').select('*').order('created_at', { ascending: false });

        if (count) count.innerText = subscribers ? subscribers.length : 0;
        if (!subscribers || subscribers.length === 0) {
            if (tbody) tbody.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center; color: var(--text-muted);">No subscribers yet.</td></tr>';
            return;
        }

        tbody.innerHTML = subscribers.map(sub => {
            const date = new Date(sub.created_at).toLocaleDateString();
            const statusClass = sub.status === 'active' ? 'badge-active' : 'badge-rejected';
            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 1rem; color: white;">${sub.email}</td>
                <td style="padding: 1rem;">${date}</td>
                <td style="padding: 1rem;"><span class="badge ${statusClass}">${sub.status}</span></td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 6px;">
                        <button class="icon-btn" onclick="toggleSubscriberStatus(${sub.id}, '${sub.status}')"
                            style="color: ${sub.status === 'active' ? '#f59e0b' : '#10b981'};" title="${sub.status === 'active' ? 'Unsubscribe' : 'Reactivate'}">
                            <i class="fa-solid ${sub.status === 'active' ? 'fa-user-slash' : 'fa-user-check'}"></i>
                        </button>
                        <button class="icon-btn" onclick="deleteSubscriber(${sub.id})" style="color: #f87171;" title="Delete">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    window.toggleSubscriberStatus = async function (id, current) {
        const newStatus = current === 'active' ? 'unsubscribed' : 'active';
        const { error } = await supabase.from('subscribers').update({ status: newStatus }).eq('id', id);
        if (error) alert(error.message);
        else { renderSubscribers(); showToastMsg(`Subscriber ${newStatus}.`, 'success'); }
    };

    window.deleteSubscriber = async function (id) {
        if (!confirm('Delete this subscriber?')) return;
        const { error } = await supabase.from('subscribers').delete().eq('id', id);
        if (error) alert(error.message);
        else renderSubscribers();
    };

    // ============================================================
    // COMMENTS (Superadmin)
    // ============================================================
    async function renderComments() {
        if (!isSuperAdmin) return;
        const tbody = document.getElementById('comments-table');
        const pendingCount = document.getElementById('pending-count');
        if (!tbody) return;

        const { data: comments, error } = await supabase
            .from('blog_comments')
            .select('*, blogs(title)')
            .order('created_at', { ascending: false });

        if (error) {
            tbody.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: #f87171;">${error.message}</td></tr>`;
            return;
        }

        const pending = comments ? comments.filter(c => c.status === 'pending').length : 0;
        if (pendingCount) pendingCount.innerText = pending;

        if (!comments || comments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">No comments yet.</td></tr>';
            return;
        }

        tbody.innerHTML = comments.map(c => {
            const date  = new Date(c.created_at).toLocaleDateString();
            const sc    = c.status === 'approved' ? 'badge-approved' : c.status === 'pending' ? 'badge-pending' : 'badge-rejected';
            const short = c.comment_text.length > 55 ? c.comment_text.substring(0, 55) + '...' : c.comment_text;
            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 1rem; color: white;">
                    <p style="margin: 0; font-weight: 600;">${c.author_name}</p>
                    <p style="margin: 0; font-size: 0.78rem; color: var(--text-muted);">${c.author_email}</p>
                </td>
                <td style="padding: 1rem; max-width: 180px;" title="${c.comment_text}">${short}</td>
                <td style="padding: 1rem; font-size: 0.82rem;">${c.blogs?.title || 'Unknown'}</td>
                <td style="padding: 1rem; font-size: 0.82rem;">${date}</td>
                <td style="padding: 1rem;"><span class="badge ${sc}">${c.status}</span></td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 6px;">
                        ${c.status !== 'approved' ? `<button class="icon-btn" style="color: #10b981;" onclick="approveComment(${c.id})" title="Approve"><i class="fa-solid fa-check"></i></button>` : ''}
                        ${c.status !== 'rejected' ? `<button class="icon-btn" style="color: #f59e0b;" onclick="rejectComment(${c.id})"  title="Reject"><i class="fa-solid fa-ban"></i></button>` : ''}
                        <button class="icon-btn" style="color: #f87171;" onclick="deleteComment(${c.id})" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    window.approveComment = async (id) => {
        const { error } = await supabase.from('blog_comments').update({ status: 'approved' }).eq('id', id);
        if (error) alert(error.message); else { renderComments(); showToastMsg('Comment approved.', 'success'); }
    };
    window.rejectComment = async (id) => {
        const { error } = await supabase.from('blog_comments').update({ status: 'rejected' }).eq('id', id);
        if (error) alert(error.message); else { renderComments(); showToastMsg('Comment rejected.', 'error'); }
    };
    window.deleteComment = async (id) => {
        if (!confirm('Delete this comment permanently?')) return;
        const { error } = await supabase.from('blog_comments').delete().eq('id', id);
        if (error) alert(error.message); else renderComments();
    };

    // ============================================================
    // ADS (Superadmin)
    // ============================================================
    async function renderAds() {
        if (!isSuperAdmin) return;
        const tbody = document.getElementById('ads-table');
        const { data: ads } = await supabase.from('site_ads').select('*, blogs(title)').order('created_at', { ascending: false });

        if (!tbody) return;

        // Populate targeted blog dropdown if it exists
        const adTargetDropdown = document.getElementById('ad-target-blog');
        if (adTargetDropdown && adTargetDropdown.options.length <= 1) {
            const { data: blogs } = await supabase.from('blogs').select('id, title').order('created_at', { ascending: false });
            if (blogs) {
                blogs.forEach(b => {
                    const opt = document.createElement('option');
                    opt.value = b.id;
                    opt.textContent = b.title;
                    adTargetDropdown.appendChild(opt);
                });
            }
        }

        if (!ads || ads.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No ads uploaded yet.</td></tr>';
            return;
        }

        tbody.innerHTML = ads.map(ad => {
            let placementTxt = 'Home Page';
            if (ad.placement === 'all_blogs') placementTxt = 'All Blogs';
            if (ad.placement === 'specific_blog') placementTxt = `Blog: ${ad.blogs?.title || 'Unknown'}`;

            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 1rem;"><img src="${ad.image_url}" alt="Ad" style="max-height: 50px; border-radius: 4px;"></td>
                <td style="padding: 1rem; font-size: 0.8rem; color: white;">${placementTxt}</td>
                <td style="padding: 1rem;"><a href="${ad.link_url || '#'}" target="_blank" style="color: var(--primary);">${ad.link_url ? 'View Link' : 'None'}</a></td>
                <td style="padding: 1rem;">
                    <span class="badge ${ad.is_active ? 'badge-active' : 'badge-rejected'}">${ad.is_active ? 'Active' : 'Inactive'}</span>
                </td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 6px;">
                        <button class="icon-btn" onclick="toggleAdStatus(${ad.id}, ${ad.is_active}, '${ad.placement}', ${ad.target_blog_id})" style="color: ${ad.is_active ? '#f59e0b' : '#10b981'};" title="${ad.is_active ? 'Deactivate' : 'Activate'}">
                            <i class="fa-solid ${ad.is_active ? 'fa-toggle-on' : 'fa-toggle-off'}"></i>
                        </button>
                        <button class="icon-btn" onclick="deleteAd(${ad.id})" style="color: #f87171;" title="Delete">
                            <i class="fa-solid fa-trash-can"></i>
                        </button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    // Ad targeting logic
    const placementSelector = document.getElementById('ad-placement');
    const targetBlogContainer = document.getElementById('ad-target-blog-container');
    if (placementSelector && targetBlogContainer) {
        placementSelector.addEventListener('change', () => {
            targetBlogContainer.style.display = (placementSelector.value === 'specific_blog') ? 'block' : 'none';
        });
    }

    const adImageFile    = document.getElementById('ad-image-file');
    const adImageUrl     = document.getElementById('ad-image-url');
    const uploadAdBtn    = document.getElementById('upload-ad-image-btn');
    const adPreview      = document.getElementById('ad-image-preview');
    const adPreviewIcon  = document.getElementById('ad-preview-icon');

    if (adImageUrl) {
        adImageUrl.addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val) {
                adPreview.src = val;
                adPreview.style.display = 'block';
                adPreviewIcon.style.display = 'none';
            } else {
                adPreview.style.display = 'none';
                adPreviewIcon.style.display = 'block';
            }
        });
    }

    if (uploadAdBtn && adImageFile) {
        uploadAdBtn.addEventListener('click', () => adImageFile.click());
        adImageFile.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const ext  = file.name.split('.').pop();
            const fn   = `ad_${Date.now()}.${ext}`;
            uploadAdBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
            uploadAdBtn.disabled = true;
            const { error: se } = await supabase.storage.from('nexgen-uploads').upload(`ads/${fn}`, file, { upsert: true });
            uploadAdBtn.innerHTML = '<i class="fa-solid fa-upload"></i>';
            uploadAdBtn.disabled = false;
            if (se) { alert(se.message); return; }
            const { data: { publicUrl } } = supabase.storage.from('nexgen-uploads').getPublicUrl(`ads/${fn}`);
            adImageUrl.value = publicUrl;
            
            // Show preview
            adPreview.src = publicUrl;
            adPreview.style.display = 'block';
            adPreviewIcon.style.display = 'none';
        });
    }

    const newAdForm = document.getElementById('new-ad-form');
    if (newAdForm) {
        newAdForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const imageUrl = document.getElementById('ad-image-url').value;
            const linkUrl  = document.getElementById('ad-link-url').value;
            const placement = document.getElementById('ad-placement').value;
            const targetBlogId = document.getElementById('ad-target-blog').value || null;
            const isActive = document.getElementById('ad-is-active').checked;

            if (isActive) {
                // Deactivate other ads for the same exact target
                let query = supabase.from('site_ads').update({ is_active: false }).eq('placement', placement);
                if (targetBlogId) query = query.eq('target_blog_id', targetBlogId);
                else query = query.is('target_blog_id', null);
                await query;
            }

            const { error } = await supabase.from('site_ads').insert([{
                image_url: imageUrl,
                link_url: linkUrl || null,
                placement,
                target_blog_id: targetBlogId,
                is_active: isActive
            }]);

            if (error) alert(error.message);
            else { showToastMsg('Ad published!', 'success'); newAdForm.reset(); if (targetBlogContainer) targetBlogContainer.style.display = 'none'; renderAds(); }
        });
    }

    window.toggleAdStatus = async (id, current, placement, targetId) => {
        if (!current) {
            // Deactivate other ads for this placement
            let query = supabase.from('site_ads').update({ is_active: false }).eq('placement', placement);
            if (targetId) query = query.eq('target_blog_id', targetId);
            else query = query.is('target_blog_id', null);
            await query;
        }
        const { error } = await supabase.from('site_ads').update({ is_active: !current }).eq('id', id);
        if (error) alert(error.message); else renderAds();
    };
    window.deleteAd = async (id) => {
        if (!confirm('Delete this ad?')) return;
        const { error } = await supabase.from('site_ads').delete().eq('id', id);
        if (error) alert(error.message); else renderAds();
    };

    // ============================================================
    // MESSAGES (Superadmin)
    // ============================================================
    async function renderMessages() {
        if (!isSuperAdmin) return;
        const tbody = document.getElementById('messages-table');
        const badge = document.getElementById('unread-count');
        if (!tbody) return;

        const { data: messages } = await supabase.from('contact_messages').select('*').order('created_at', { ascending: false });
        if (!messages || messages.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center; color: var(--text-muted);">No messages yet.</td></tr>';
            if (badge) badge.innerText = '0';
            return;
        }

        const unread = messages.filter(m => !m.is_read).length;
        if (badge) badge.innerText = unread;

        tbody.innerHTML = messages.map(msg => {
            const date    = new Date(msg.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
            const preview = msg.message.length > 60 ? msg.message.substring(0, 60) + '...' : msg.message;
            const rowStyle = msg.is_read ? 'opacity: 0.6;' : 'font-weight: 500;';
            return `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); ${rowStyle}">
                <td style="padding: 1rem; color: white;">
                    ${!msg.is_read ? '<span style="display:inline-block;width:8px;height:8px;background:var(--primary);border-radius:50%;margin-right:8px;"></span>' : ''}
                    ${msg.name}
                </td>
                <td style="padding: 1rem;"><a href="mailto:${msg.email}" style="color: var(--primary);">${msg.email}</a></td>
                <td style="padding: 1rem; color: var(--text-muted); max-width: 260px;" title="${msg.message}">${preview}</td>
                <td style="padding: 1rem; font-size: 0.82rem; color: var(--text-muted);">${date}</td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 6px;">
                        ${!msg.is_read ? `<button class="icon-btn" onclick="markMessageRead(${msg.id})" style="color: #10b981;" title="Mark Read"><i class="fa-solid fa-envelope-open"></i></button>` : ''}
                        <button class="icon-btn" onclick="deleteMessage(${msg.id})" style="color: #f87171;" title="Delete"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
    }

    window.markMessageRead = async (id) => {
        const { error } = await supabase.from('contact_messages').update({ is_read: true }).eq('id', id);
        if (error) alert(error.message); else renderMessages();
    };
    window.deleteMessage = async (id) => {
        if (!confirm('Delete this message permanently?')) return;
        const { error } = await supabase.from('contact_messages').delete().eq('id', id);
        if (error) alert(error.message); else renderMessages();
    };

    // ============================================================
    // CHANGE PASSWORD
    // ============================================================
    const changePasswordForm = document.getElementById('change-password-form');
    if (changePasswordForm) {
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPass     = document.getElementById('new-password').value;
            const confirmPass = document.getElementById('confirm-password').value;
            if (newPass !== confirmPass) { alert('Passwords do not match!'); return; }
            if (newPass.length < 6)     { alert('Password must be at least 6 characters.'); return; }
            const { error } = await supabase.auth.updateUser({ password: newPass });
            if (error) alert(error.message);
            else { changePasswordForm.reset(); showToastMsg('Password updated successfully!', 'success'); }
        });
    }

    // ============================================================
    // LOGOUT
    // ============================================================
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });

    // ============================================================
    // PROFILE SETTINGS
    // ============================================================
    const profileForm = document.getElementById('profile-settings-form');
    if (profileForm) {
        // Load initial data
        document.getElementById('profile-name').value = currentProfile.full_name || '';
        document.getElementById('profile-avatar-url').value = currentProfile.avatar_url || '';
        document.getElementById('profile-bio').value = currentProfile.bio || '';
        if (currentProfile.avatar_url) {
            document.getElementById('profile-avatar-preview').src = currentProfile.avatar_url;
        }

        // Live Preview on URL change
        document.getElementById('profile-avatar-url').addEventListener('input', (e) => {
            const val = e.target.value.trim();
            if (val) document.getElementById('profile-avatar-preview').src = val;
        });

        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const full_name = document.getElementById('profile-name').value;
            const avatar_url = document.getElementById('profile-avatar-url').value;
            const bio = document.getElementById('profile-bio').value;

            const { error } = await supabase.from('profiles').update({ full_name, avatar_url, bio }).eq('id', currentUser.id);
            if (error) alert(error.message);
            else {
                showToastMsg('Profile updated!', 'success');
                currentProfile.full_name = full_name;
                currentProfile.avatar_url = avatar_url;
                currentProfile.bio = bio;
            }
        });
    }

    // Avatar Upload
    const avatarFileInput = document.getElementById('avatar-file-input');
    if (avatarFileInput) {
        avatarFileInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const ext = file.name.split('.').pop();
            const fn = `avatar_${currentUser.id}_${Date.now()}.${ext}`;
            
            // Show loading on preview
            const preview = document.getElementById('profile-avatar-preview');
            const originalSrc = preview.src;
            preview.style.opacity = '0.5';

            const { error: se } = await supabase.storage.from('nexgen-uploads').upload(`avatars/${fn}`, file, { upsert: true });
            preview.style.opacity = '1';

            if (se) { alert(se.message); return; }
            const { data: { publicUrl } } = supabase.storage.from('nexgen-uploads').getPublicUrl(`avatars/${fn}`);
            document.getElementById('profile-avatar-url').value = publicUrl;
            preview.src = publicUrl;
        });
    }

    // ============================================================
    // REFERRAL LOGIC
    // ============================================================
    async function setupReferral() {
        const refLinkVal = document.getElementById('referral-link-val');
        if (!refLinkVal) return;

        // If code is missing, try to generate one (for legacy users)
        if (!currentProfile.referral_code && currentUser) {
            const newCode = 'NG-' + Math.random().toString(36).substring(2, 10).toUpperCase();
            const { error } = await supabase.from('profiles').update({ referral_code: newCode }).eq('id', currentUser.id);
            if (!error) currentProfile.referral_code = newCode;
        }

        if (currentProfile.referral_code) {
            const baseUrl = window.location.origin + window.location.pathname.replace('dashboard.html', 'auth.html');
            refLinkVal.innerText = `${baseUrl}?ref=${currentProfile.referral_code}`;
        } else {
            refLinkVal.innerText = "Error loading code";
        }
    }

    window.copyReferralLink = function() {
        const text = document.getElementById('referral-link-val').innerText;
        navigator.clipboard.writeText(text).then(() => {
            showToastMsg('Referral link copied!', 'success');
        });
    };

    // ============================================================
    // TOAST HELPER
    // ============================================================
    function showToastMsg(msg, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success'
            ? '<i class="fa-solid fa-check-circle"></i>'
            : '<i class="fa-solid fa-circle-exclamation"></i>';
        toast.innerHTML = `${icon} <span>${msg}</span>`;
        if (container.children.length > 5) container.children[0].remove();
        container.appendChild(toast);
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 3500);
    }

    // ============================================================
    // LIGHTBOX LOGIC
    // ============================================================
    function initLightbox() {
        if (window.dashboardLightboxInited) return;
        window.dashboardLightboxInited = true;

        if (!document.getElementById('lightbox')) {
            const lb = document.createElement('div');
            lb.id = 'lightbox';
            lb.className = 'lightbox';
            lb.innerHTML = `
                <span class="lightbox-close">&times;</span>
                <img class="lightbox-content" id="lightbox-img">
            `;
            document.body.appendChild(lb);
        }

        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');

        const closeLB = () => {
            if (!lightbox) return;
            lightbox.classList.remove('active');
            setTimeout(() => { 
                lightbox.style.display = 'none';
                if (lightboxImg) lightboxImg.classList.remove('zoomed');
            }, 200);
            document.body.style.overflow = '';
        };

        // Close logic
        lightbox.addEventListener('click', (e) => {
            if (e.target.id === 'lightbox' || e.target.classList.contains('lightbox-close')) {
                closeLB();
            }
        });

        if (lightboxImg) {
            lightboxImg.addEventListener('click', (e) => {
                e.stopPropagation();
                const isZoomed = lightboxImg.classList.toggle('zoomed');
                if (!isZoomed) {
                    lightboxImg.style.transformOrigin = 'center';
                }
            });

            // Panning logic: Follow mouse movement when zoomed
            lightbox.addEventListener('mousemove', (e) => {
                if (!lightboxImg.classList.contains('zoomed')) return;
                
                const { left, top, width, height } = lightbox.getBoundingClientRect();
                const x = ((e.clientX - left) / width) * 100;
                const y = ((e.clientY - top) / height) * 100;
                
                lightboxImg.style.transformOrigin = `${x}% ${y}%`;
            });

            // Touch support
            lightbox.addEventListener('touchmove', (e) => {
                if (!lightboxImg.classList.contains('zoomed')) return;
                const touch = e.touches[0];
                const { left, top, width, height } = lightbox.getBoundingClientRect();
                const x = ((touch.clientX - left) / width) * 100;
                const y = ((touch.clientY - top) / height) * 100;
                
                lightboxImg.style.transformOrigin = `${x}% ${y}%`;
            }, { passive: true });
        }
        
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && lightbox.classList.contains('active')) closeLB();
        });
    }
    initLightbox();

    window.openLightbox = function(url) {
        const lightbox = document.getElementById('lightbox');
        const lightboxImg = document.getElementById('lightbox-img');
        if (lightbox && lightboxImg) {
            lightbox.style.display = 'flex';
            lightbox.offsetHeight;
            lightbox.classList.add('active');
            lightboxImg.src = url;
            document.body.style.overflow = 'hidden';
        }
    };

    // Auto-init for images in tables
    document.addEventListener('click', (e) => {
        if (e.target.tagName === 'IMG' && !e.target.closest('.lightbox-content') && !e.target.closest('#file-list')) {
            e.preventDefault();
            e.stopPropagation();
            window.openLightbox(e.target.src);
        }
    });

}); // end DOMContentLoaded
