/**
 * NexGen Unified Workspace & Analytics (Supabase)
 */

document.addEventListener('DOMContentLoaded', () => {
    // Auth Check
    // Auth & UI Role Check
    let currentUser = null;
    let isAdmin = false;

    async function checkAuth() {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
            window.location.href = 'auth.html';
            return;
        }
        currentUser = session.user;

        const { data: profile, error: profileError } = await supabase.from('profiles').select('role').eq('id', currentUser.id).single();

        if (profileError) {
            console.warn('Profile lookup error:', profileError.message);
            // If profile doesn't exist yet, we treat as regular user by default
        }

        isAdmin = profile && profile.role === 'admin';

        // Update UI based on role
        if (isAdmin) {
            const navUsers = document.getElementById('nav-users');
            if (navUsers) navUsers.style.display = 'flex';
            const navAnalytics = document.getElementById('nav-analytics');
            if (navAnalytics) navAnalytics.style.display = 'flex';
            const navSubscribers = document.getElementById('nav-subscribers');
            if (navSubscribers) navSubscribers.style.display = 'flex';
            const navComments = document.getElementById('nav-comments');
            if (navComments) navComments.style.display = 'flex';
            const userStat = document.getElementById('container-stat-users');
            if (userStat) userStat.style.display = 'block';
            document.getElementById('view-title').innerHTML = `Admin <span style="color: var(--primary);">Dashboard</span>`;
            document.getElementById('view-subtitle').innerText = "System-wide overview and management.";
        } else {
            document.getElementById('view-title').innerHTML = `My <span style="color: var(--primary);">Workspace</span>`;
            document.getElementById('view-subtitle').innerText = "Manage your content and track your performance.";
            const navUsers = document.getElementById('nav-users');
            if (navUsers) navUsers.style.display = 'none';
            const navAnalytics = document.getElementById('nav-analytics');
            if (navAnalytics) navAnalytics.style.display = 'none';
            const navSubscribers = document.getElementById('nav-subscribers');
            if (navSubscribers) navSubscribers.style.display = 'none';
            const navComments = document.getElementById('nav-comments');
            if (navComments) navComments.style.display = 'none';
            const userStat = document.getElementById('container-stat-users');
            if (userStat) userStat.style.display = 'none';
        }

        updateAllViews();
    }
    checkAuth();

    // View Switching Logic
    const navItems = document.querySelectorAll('.nav-item');
    const adminViews = document.querySelectorAll('.admin-view');
    const viewTitle = document.getElementById('view-title');
    const headerActions = document.getElementById('header-actions');

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');

            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');

            adminViews.forEach(view => view.style.display = 'none');
            document.getElementById(targetView).style.display = 'block';

            const titleText = item.innerText.trim();
            const prefix = isAdmin ? "Admin" : "My";
            viewTitle.innerHTML = `${prefix} <span style="color: var(--primary);">${titleText}</span>`;

            headerActions.style.display = (targetView === 'dashboard-view' || targetView === 'blogs-view' || targetView === 'files-view') ? 'flex' : 'none';

            if (targetView === 'analytics-view') {
                renderAnalytics();
            }
        });
    });

    // Modal Logic
    const blogModal = document.getElementById('blog-modal');
    const openBlogBtn = document.getElementById('open-blog-modal');
    const closeBlogBtn = document.getElementById('close-blog-modal');
    const newBlogForm = document.getElementById('new-blog-form');

    // File Logic
    const openFileBtn = document.getElementById('open-file-modal');
    const fileInput = document.getElementById('file-input');

    // Event listeners are handled below with populateFileSelectors

    openFileBtn.addEventListener('click', () => fileInput.click());

    // Blog Image Upload Logic
    const uploadBlogImageBtn = document.getElementById('upload-blog-image-btn');
    const blogImageFile = document.getElementById('blog-image-file');
    const blogImageUrlInput = document.getElementById('blog-image');

    if (uploadBlogImageBtn) {
        uploadBlogImageBtn.addEventListener('click', () => blogImageFile.click());

        blogImageFile.addEventListener('change', async (e) => {
            if (e.target.files.length > 0) {
                const file = e.target.files[0];
                const reader = new FileReader();

                reader.onload = async (event) => {
                    const base64Data = event.target.result;
                    // Add to File Manager
                    const { error } = await supabase.from('files').insert([
                        {
                            name: file.name,
                            type: file.type,
                            size: (file.size / 1024).toFixed(2) + ' KB',
                            url: base64Data, // Save as base64 so it works without hosting
                            author_id: currentUser.id
                        }
                    ]);

                    if (error) {
                        alert(`Upload failed: ${error.message}`);
                    } else {
                        blogImageUrlInput.value = base64Data;
                        updateAllViews();
                        alert('Image uploaded and set as cover!');
                    }
                };
                reader.readAsDataURL(file);
            }
        });
    }

    fileInput.addEventListener('change', async (e) => {
        if (e.target.files.length > 0) {
            const file = e.target.files[0];
            const reader = new FileReader();

            reader.onload = async (event) => {
                const base64Data = event.target.result;
                const { error } = await supabase.from('files').insert([
                    {
                        name: file.name,
                        type: file.type,
                        size: (file.size / 1024).toFixed(2) + ' KB',
                        url: base64Data,
                        author_id: currentUser.id
                    }
                ]);

                if (error) alert(error.message);
                else {
                    updateAllViews();
                    alert('File uploaded to your workspace!');
                }
            };
            reader.readAsDataURL(file);
        }
    });

    // Initial Renders (called after checkAuth)
    async function updateAllViews() {
        if (!currentUser) return;
        await Promise.all([
            renderAdminBlogs(),
            renderFiles(),
            isAdmin ? renderUsers() : Promise.resolve(),
            updateDashboardStats(),
            isAdmin ? renderAnalytics() : Promise.resolve(),
            isAdmin ? renderSubscribers() : Promise.resolve(),
            isAdmin ? renderComments() : Promise.resolve()
        ]);
    }

    let charts = {}; // Store chart instances to destroy before re-render

    async function renderAnalytics() {
        if (!isAdmin) return;

        const { data: rawEvents, error } = await supabase.from('analytics').select('*');

        if (error) {
            console.error('Analytics Fetch Error:', error);
            if (error.message.includes('relation "public.analytics" does not exist')) {
                const noData = document.getElementById('no-analytics-data');
                if (noData) {
                    noData.innerHTML = `
                        <i class="fa-solid fa-database" style="font-size: 3rem; color: #f87171; margin-bottom: 1rem;"></i>
                        <h3 style="color: #f87171;">Analytics Table Missing</h3>
                        <p style="color: var(--text-muted);">Please run the latest <b>setup.sql</b> in your Supabase SQL Editor to create the analytics table.</p>
                    `;
                    noData.style.display = 'block';
                }
            }
            return;
        }

        const noData = document.getElementById('no-analytics-data');
        const grid = document.getElementById('analytics-grid');

        if (!rawEvents || rawEvents.length === 0) {
            if (noData) noData.style.display = 'block';
            if (grid) grid.style.display = 'none';
            return;
        }

        if (noData) noData.style.display = 'none';
        if (grid) grid.style.display = 'grid';

        // Process Data
        const stats = {
            source: { mail: 0, random: 0 },
            type: { link: 0, direct: 0 },
            ages: { '0-10': 0, '11-20': 0, '21-30': 0, '31-40': 0, '41-50': 0, '51+': 0 },
            gender: { male: 0, female: 0, other: 0 },
            browsers: {},
            devices: {},
            locations: {}
        };

        rawEvents.forEach(ev => {
            if (ev.source) stats.source[ev.source === 'mail' ? 'mail' : 'random']++;
            if (ev.traffic_type) stats.type[ev.traffic_type]++;
            if (ev.age_group) stats.ages[ev.age_group]++;
            if (ev.gender) stats.gender[ev.gender === 'male' ? 'male' : (ev.gender === 'female' ? 'female' : 'other')]++;
            if (ev.browser) stats.browsers[ev.browser] = (stats.browsers[ev.browser] || 0) + 1;
            if (ev.device) stats.devices[ev.device] = (stats.devices[ev.device] || 0) + 1;
            if (ev.location) stats.locations[ev.location] = (stats.locations[ev.location] || 0) + 1;
        });

        // Update technical insights
        const getTop = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
        document.getElementById('top-browser').innerText = getTop(stats.browsers);
        document.getElementById('top-device').innerText = getTop(stats.devices);
        document.getElementById('top-location').innerText = getTop(stats.locations);

        // Chart Config Helper
        const drawChart = (id, type, labels, data, colors) => {
            if (charts[id]) charts[id].destroy();
            const canvas = document.getElementById(id);
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            charts[id] = new Chart(ctx, {
                type: type,
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: colors,
                        borderColor: 'transparent',
                        hoverOffset: 10
                    }]
                },
                options: {
                    responsive: true,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: 'white', font: { size: 10 } } }
                    }
                }
            });
        };

        const premiumColors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

        drawChart('sourceChart', 'pie', ['Mail', 'Random'], [stats.source.mail, stats.source.random], [premiumColors[0], premiumColors[1]]);
        drawChart('typeChart', 'doughnut', ['Link', 'Direct'], [stats.type.link, stats.type.direct], [premiumColors[4], premiumColors[2]]);
        drawChart('ageChart', 'bar', Object.keys(stats.ages), Object.values(stats.ages), premiumColors);
        drawChart('genderChart', 'pie', ['Boys', 'Girls', 'Other'], [stats.gender.male, stats.gender.female, stats.gender.other], [premiumColors[0], premiumColors[5], premiumColors[3]]);
    }

    // Simulate Data Button
    const simulateBtn = document.getElementById('simulate-data-btn');
    if (simulateBtn) {
        simulateBtn.addEventListener('click', async () => {
            const confirmed = confirm("This will generate 20 random visitors to test your charts. Continue?");
            if (!confirmed) return;

            const sources = ['mail', 'random'];
            const types = ['link', 'direct'];
            const ages = ['11-20', '21-30', '31-40', '41-50'];
            const genders = ['male', 'female'];
            const browsers = ['Chrome', 'Firefox', 'Safari'];

            const sampleData = Array.from({ length: 20 }, () => ({
                source: sources[Math.floor(Math.random() * sources.length)],
                traffic_type: types[Math.floor(Math.random() * types.length)],
                age_group: ages[Math.floor(Math.random() * ages.length)],
                gender: genders[Math.floor(Math.random() * genders.length)],
                browser: browsers[Math.floor(Math.random() * browsers.length)],
                device: Math.random() > 0.5 ? 'Mobile' : 'Desktop',
                location: 'Nepal'
            }));

            const { error } = await supabase.from('analytics').insert(sampleData);
            if (error) alert(error.message);
            else {
                alert("Simulated data generated successfully!");
                renderAnalytics();
            }
        });
    }

    async function updateDashboardStats() {
        let blogsQuery = supabase.from('blogs').select('views', { count: 'exact' });
        let filesQuery = supabase.from('files').select('*', { count: 'exact', head: true });

        if (!isAdmin) {
            blogsQuery = blogsQuery.eq('author_id', currentUser.id);
            filesQuery = filesQuery.eq('author_id', currentUser.id);
        }

        const [{ data: blogs }, { count: filesCount }] = await Promise.all([blogsQuery, filesQuery]);

        const totalViews = blogs ? blogs.reduce((sum, b) => sum + (b.views || 0), 0) : 0;
        const totalEarnings = (totalViews / 100).toFixed(2);

        const statBlogs = document.getElementById('stat-blogs');
        if (statBlogs) statBlogs.innerText = blogs ? blogs.length : 0;
        const statFiles = document.getElementById('stat-files');
        if (statFiles) statFiles.innerText = filesCount || 0;
        const statViews = document.getElementById('stat-views');
        if (statViews) statViews.innerText = totalViews || 0;

        const statEarnings = document.getElementById('stat-earnings');
        if (statEarnings) statEarnings.innerText = `Rs. ${totalEarnings}`;

        const walletBalance = document.getElementById('wallet-balance');
        if (walletBalance) walletBalance.innerText = `Rs. ${totalEarnings}`;

        if (isAdmin) {
            const { count: usersCount } = await supabase.from('profiles').select('*', { count: 'exact', head: true });
            const userStat = document.getElementById('stat-users');
            if (userStat) userStat.innerText = usersCount || 0;
        }
    }

    // Withdrawal Logic
    const withdrawBtn = document.getElementById('withdraw-btn');
    if (withdrawBtn) {
        withdrawBtn.addEventListener('click', () => {
            alert('Transactions are on processing.');
        });
    }

    window.resetEarnings = async function (userId) {
        if (confirm('Are you sure you want to reset this user\'s statistics? This will zero out career views AND withdrawals.')) {
            const { error } = await supabase.from('profiles').update({
                total_withdrawn: 0,
                views_total: 0
            }).eq('id', userId);

            if (error) alert(error.message);
            else {
                alert('User statistics reset successfully.');
                updateAllViews();
            }
        }
    };

    window.updateWithdrawn = async function (userId, currentAmount) {
        const newVal = prompt("Enter the new Total Withdrawn amount (Rs.):", currentAmount);
        if (newVal !== null && !isNaN(newVal)) {
            const { error } = await supabase.from('profiles').update({
                total_withdrawn: parseFloat(newVal)
            }).eq('id', userId);

            if (error) alert(error.message);
            else {
                alert('Withdrawn amount updated.');
                updateAllViews();
            }
        }
    };

    // Handle New/Edit Blog
    newBlogForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const title = document.getElementById('blog-title').value;
        const category = document.getElementById('blog-category').value;
        const excerpt = document.getElementById('blog-excerpt').value;
        const content = document.getElementById('blog-content').value;
        const imageUrl = document.getElementById('blog-image').value;
        const fileId = document.getElementById('blog-file-attach').value;
        const editId = newBlogForm.getAttribute('data-edit-id');

        const blogData = {
            title,
            category,
            excerpt,
            content,
            image_url: imageUrl,
            file_id: fileId || null,
            date: new Date().toLocaleDateString(),
            author_id: currentUser.id
        };

        let result;
        if (editId) {
            result = await supabase.from('blogs').update(blogData).eq('id', editId);
        } else {
            result = await supabase.from('blogs').insert([blogData]);
        }

        if (result.error) alert(result.error.message);
        else {
            newBlogForm.reset();
            newBlogForm.removeAttribute('data-edit-id');
            blogModal.querySelector('h2').innerText = 'Create New Blog Post';
            blogModal.style.display = 'none';
            updateAllViews();
        }
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

    openBlogBtn.addEventListener('click', async () => {
        await populateFileSelectors();
        blogModal.style.display = 'flex';
    });

    closeBlogBtn.addEventListener('click', () => {
        newBlogForm.reset();
        newBlogForm.removeAttribute('data-edit-id');
        blogModal.querySelector('h2').innerText = 'Create New Blog Post';
        blogModal.style.display = 'none';
    });

    window.editBlog = async function (id) {
        const { data: blog, error } = await supabase.from('blogs').select('*').eq('id', id).single();
        if (error) return alert(error.message);

        document.getElementById('blog-title').value = blog.title;
        document.getElementById('blog-category').value = blog.category;
        document.getElementById('blog-excerpt').value = blog.excerpt;
        document.getElementById('blog-content').value = blog.content;
        document.getElementById('blog-image').value = blog.image_url || '';

        await populateFileSelectors(blog.file_id);

        newBlogForm.setAttribute('data-edit-id', id);
        blogModal.querySelector('h2').innerText = 'Edit Blog Post';
        blogModal.style.display = 'flex';
    };

    async function renderAdminBlogs() {
        const blogTable = document.getElementById('admin-blog-table');
        let query = supabase.from('blogs').select('*').order('created_at', { ascending: false });

        if (!isAdmin) {
            query = query.eq('author_id', currentUser.id);
        }

        const { data: blogs, error } = await query;
        if (error) return;

        if (!blogs || blogs.length === 0) {
            blogTable.innerHTML = '<tr><td colspan="5" style="padding: 2rem; text-align: center;">No blog posts found.</td></tr>';
            return;
        }

        blogTable.innerHTML = blogs.map(blog => `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                <td style="padding: 1rem; color: white;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        ${blog.image_url ? `<img src="${blog.image_url}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: contain; background: #1e293b;">` : '<div style="width: 40px; height: 40px; background: #334155; border-radius: 4px; display: flex; align-items: center; justify-content: center;"><i class="fa-solid fa-image" style="font-size: 0.8rem;"></i></div>'}
                        ${blog.title}
                    </div>
                </td>
                <td style="padding: 1rem;">${blog.category}</td>
                <td style="padding: 1rem;">${blog.date}</td>
                <td style="padding: 1rem;"><span style="color: #10b981; font-size: 0.8rem;">${blog.views || 0} views</span></td>
                <td style="padding: 1rem;">
                    <div style="display: flex; gap: 10px;">
                        ${isAdmin ? `<button onclick="editBlog(${blog.id})" style="color: var(--primary);"><i class="fa-solid fa-pen-to-square"></i></button>` : ''}
                        <button onclick="deleteBlog(${blog.id})" style="color: #f87171;"><i class="fa-solid fa-trash-can"></i></button>
                    </div>
                </td>
            </tr>
        `).join('');
    }

    async function renderFiles() {
        const fileList = document.getElementById('file-list');
        let query = supabase.from('files').select('*').order('created_at', { ascending: false });

        if (!isAdmin) {
            query = query.eq('author_id', currentUser.id);
        }

        const { data: files, error } = await query;
        if (error) return;

        if (!files || files.length === 0) {
            fileList.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">No files uploaded yet.</p>';
            return;
        }

        fileList.innerHTML = files.map(file => `
            <div style="text-align: center; padding: 1rem; background: rgba(255,255,255,0.02); border: 1px solid var(--border); border-radius: 0.5rem; position: relative;">
                <button onclick="deleteFile(${file.id})" style="position: absolute; top: 5px; right: 5px; color: #f87171; font-size: 0.8rem;"><i class="fa-solid fa-xmark"></i></button>
                <i class="fa-solid ${file.type && file.type.includes('image') ? 'fa-file-image' : 'fa-file-pdf'}" style="font-size: 2rem; color: var(--primary); margin-bottom: 0.5rem;"></i>
                <p style="font-size: 0.8rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${file.name}</p>
                <span style="font-size: 0.7rem; color: var(--text-muted);">${file.size}</span>
            </div>
        `).join('');
    }

    async function renderUsers() {
        if (!isAdmin) return;
        const userTable = document.getElementById('admin-user-table');
        const { data: users, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });

        if (error) return;

        if (!users || users.length === 0) {
            userTable.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center;">No users registered yet.</td></tr>';
            return;
        }

        userTable.innerHTML = users.map(user => {
            const isSuperadmin = user.email === 'ishoracharya977@gmail.com';
            const earnings = ((user.views_total || 0) / 100).toFixed(4);
            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 1rem; color: white;">${user.full_name || 'N/A'}</td>
                    <td style="padding: 1rem;">${user.email}</td>
                    <td style="padding: 1rem;"><span style="color: var(--primary); font-size: 0.8rem; text-transform: uppercase;">${user.role}</span></td>
                    <td style="padding: 1rem; color: #10b981;">Rs. ${earnings}</td>
                    <td style="padding: 1rem; color: #f87171;">Rs. ${(user.total_withdrawn || 0).toFixed(2)}</td>
                    <td style="padding: 1rem;">
                        <div style="display: flex; gap: 10px;">
                            ${!isSuperadmin ? `<button onclick="deleteUser('${user.id}')" title="Delete User" style="color: #f87171;"><i class="fa-solid fa-user-minus"></i></button>` : '<i class="fa-solid fa-shield" title="Protected" style="color: var(--primary); opacity: 0.5;"></i>'}
                            <button onclick="updateWithdrawn('${user.id}', ${user.total_withdrawn || 0})" title="Update Withdrawn" style="color: #60a5fa;"><i class="fa-solid fa-money-bill-transfer"></i></button>
                            ${isAdmin ? `<button onclick="resetEarnings('${user.id}')" title="Reset All" style="color: var(--secondary);"><i class="fa-solid fa-rotate-left"></i></button>` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    // Export functions to window for onclick handlers
    window.deleteUser = async function (id) {
        // Fetch user email to prevent self-deletion or superadmin deletion
        const { data: user } = await supabase.from('profiles').select('email').eq('id', id).single();
        if (user && user.email === 'ishoracharya977@gmail.com') {
            alert("Critical Error: The primary Superadmin account cannot be removed.");
            return;
        }

        if (confirm('Are you sure you want to remove this user?')) {
            const { error } = await supabase.from('profiles').delete().eq('id', id);
            if (error) alert(error.message);
            else updateAllViews();
        }
    };

    window.deleteFile = async function (id) {
        if (confirm('Delete this file?')) {
            const { error } = await supabase.from('files').delete().eq('id', id);
            if (error) alert(error.message);
            else updateAllViews();
        }
    };

    window.deleteBlog = async function (id) {
        if (confirm('Are you sure you want to delete this post?')) {
            const { error } = await supabase.from('blogs').delete().eq('id', id);
            if (error) alert(error.message);
            else updateAllViews();
        }
    };

    // Change Password Logic
    const changePasswordForm = document.getElementById('change-password-form');
    if (changePasswordForm) {
        console.log('Password change form detected');
        changePasswordForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const newPassword = document.getElementById('new-password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            console.log('Attempting password update...');

            if (newPassword !== confirmPassword) {
                alert('Passwords do not match!');
                return;
            }

            if (newPassword.length < 6) {
                alert('Password must be at least 6 characters long.');
                return;
            }

            try {
                const { data, error } = await supabase.auth.updateUser({
                    password: newPassword
                });

                if (error) {
                    console.error('Supabase password update error:', error);
                    alert(`Update failed: ${error.message}`);
                } else {
                    console.log('Password updated successfully:', data);
                    alert('Success! Your password has been updated.');
                    changePasswordForm.reset();
                }
            } catch (err) {
                console.error('Unexpected error during password update:', err);
                alert('An unexpected error occurred. Please try again.');
            }
        });
    }

    // Logout
    document.getElementById('logout-btn').addEventListener('click', async () => {
        await supabase.auth.signOut();
        window.location.href = 'index.html';
    });

    // Subscribers Management
    async function renderSubscribers() {
        if (!isAdmin) return;
        const subscribersTable = document.getElementById('subscribers-table');
        const subscriberCount = document.getElementById('subscriber-count');

        const { data: subscribers, error } = await supabase.from('subscribers').select('*').order('created_at', { ascending: false });

        if (error) {
            console.error('Subscribers fetch error:', error);
            return;
        }

        if (subscriberCount) subscriberCount.innerText = subscribers ? subscribers.length : 0;

        if (!subscribers || subscribers.length === 0) {
            subscribersTable.innerHTML = '<tr><td colspan="4" style="padding: 2rem; text-align: center;">No subscribers yet.</td></tr>';
            return;
        }

        subscribersTable.innerHTML = subscribers.map(sub => {
            const date = new Date(sub.created_at).toLocaleDateString();
            const statusColor = sub.status === 'active' ? '#10b981' : '#f87171';
            const statusIcon = sub.status === 'active' ? 'fa-check-circle' : 'fa-ban';

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 1rem; color: white;">${sub.email}</td>
                    <td style="padding: 1rem;">${date}</td>
                    <td style="padding: 1rem;">
                        <span style="color: ${statusColor}; font-size: 0.8rem; text-transform: uppercase; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fa-solid ${statusIcon}"></i> ${sub.status}
                        </span>
                    </td>
                    <td style="padding: 1rem;">
                        <div style="display: flex; gap: 10px;">
                            <button onclick="toggleSubscriberStatus(${sub.id}, '${sub.status}')" title="${sub.status === 'active' ? 'Unsubscribe' : 'Reactivate'}" style="color: var(--secondary);">
                                <i class="fa-solid ${sub.status === 'active' ? 'fa-user-slash' : 'fa-user-check'}"></i>
                            </button>
                            <button onclick="deleteSubscriber(${sub.id})" title="Delete Subscriber" style="color: #f87171;">
                                <i class="fa-solid fa-trash-can"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.deleteSubscriber = async function (id) {
        if (confirm('Are you sure you want to delete this subscriber?')) {
            const { error } = await supabase.from('subscribers').delete().eq('id', id);
            if (error) alert(error.message);
            else updateAllViews();
        }
    };

    window.toggleSubscriberStatus = async function (id, currentStatus) {
        const newStatus = currentStatus === 'active' ? 'unsubscribed' : 'active';
        const { error } = await supabase.from('subscribers').update({ status: newStatus }).eq('id', id);

        if (error) alert(error.message);
        else {
            updateAllViews();
            alert(`Subscriber ${newStatus === 'active' ? 'reactivated' : 'unsubscribed'} successfully.`);
        }
    };

    // Comments Management
    async function renderComments() {
        if (!isAdmin) {
            console.log('renderComments: User is not admin, skipping');
            return;
        }

        const commentsTable = document.getElementById('comments-table');
        const pendingCount = document.getElementById('pending-count');

        console.log('renderComments: Fetching comments...');

        const { data: comments, error } = await supabase
            .from('blog_comments')
            .select('*, blogs(title)')
            .order('created_at', { ascending: false });

        console.log('renderComments: Fetch result:', { comments, error });

        if (error) {
            console.error('Comments fetch error:', error);
            if (error.message.includes('relation "public.blog_comments" does not exist')) {
                commentsTable.innerHTML = `
                    <tr><td colspan="6" style="padding: 2rem; text-align: center;">
                        <i class="fa-solid fa-database" style="font-size: 3rem; color: #f87171; margin-bottom: 1rem; display: block;"></i>
                        <h3 style="color: #f87171;">Comments Table Missing</h3>
                        <p style="color: var(--text-muted);">Please run the updated <b>setup.sql</b> in your Supabase SQL Editor to create the blog_comments table.</p>
                    </td></tr>
                `;
            } else {
                commentsTable.innerHTML = `<tr><td colspan="6" style="padding: 2rem; text-align: center; color: #f87171;">Error loading comments: ${error.message}</td></tr>`;
            }
            return;
        }

        const pending = comments ? comments.filter(c => c.status === 'pending').length : 0;
        if (pendingCount) pendingCount.innerText = pending;

        console.log('renderComments: Total comments:', comments?.length || 0, 'Pending:', pending);

        if (!comments || comments.length === 0) {
            commentsTable.innerHTML = '<tr><td colspan="6" style="padding: 2rem; text-align: center;">No comments yet.</td></tr>';
            return;
        }

        commentsTable.innerHTML = comments.map(comment => {
            const date = new Date(comment.created_at).toLocaleDateString();
            const statusColor = comment.status === 'approved' ? '#10b981' : (comment.status === 'pending' ? '#f59e0b' : '#f87171');
            const statusIcon = comment.status === 'approved' ? 'fa-check-circle' : (comment.status === 'pending' ? 'fa-clock' : 'fa-ban');
            const truncatedComment = comment.comment_text.length > 50 ? comment.comment_text.substring(0, 50) + '...' : comment.comment_text;
            const blogTitle = comment.blogs?.title || 'Unknown Blog';

            return `
                <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
                    <td style="padding: 1rem; color: white;">
                        <div>
                            <p style="font-weight: 600;">${comment.author_name}</p>
                            <p style="font-size: 0.8rem; color: var(--text-muted);">${comment.author_email}</p>
                        </div>
                    </td>
                    <td style="padding: 1rem; max-width: 200px;">
                        <p title="${comment.comment_text}">${truncatedComment}</p>
                    </td>
                    <td style="padding: 1rem; font-size: 0.85rem;">${blogTitle}</td>
                    <td style="padding: 1rem; font-size: 0.85rem;">${date}</td>
                    <td style="padding: 1rem;">
                        <span style="color: ${statusColor}; font-size: 0.8rem; text-transform: uppercase; display: flex; align-items: center; gap: 0.5rem;">
                            <i class="fa-solid ${statusIcon}"></i> ${comment.status}
                        </span>
                    </td>
                    <td style="padding: 1rem;">
                        <div style="display: flex; gap: 10px;">
                            ${comment.status !== 'approved' ? `<button onclick="approveComment(${comment.id})" title="Approve" style="color: #10b981;"><i class="fa-solid fa-check"></i></button>` : ''}
                            ${comment.status !== 'rejected' ? `<button onclick="rejectComment(${comment.id})" title="Reject" style="color: #f59e0b;"><i class="fa-solid fa-ban"></i></button>` : ''}
                            <button onclick="deleteComment(${comment.id})" title="Delete" style="color: #f87171;"><i class="fa-solid fa-trash-can"></i></button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    window.approveComment = async function (id) {
        const { error } = await supabase.from('blog_comments').update({ status: 'approved' }).eq('id', id);
        if (error) alert(error.message);
        else {
            updateAllViews();
            alert('Comment approved and is now visible on the blog.');
        }
    };

    window.rejectComment = async function (id) {
        const { error } = await supabase.from('blog_comments').update({ status: 'rejected' }).eq('id', id);
        if (error) alert(error.message);
        else {
            updateAllViews();
            alert('Comment rejected and hidden from public view.');
        }
    };

    window.deleteComment = async function (id) {
        if (confirm('Are you sure you want to permanently delete this comment?')) {
            const { error } = await supabase.from('blog_comments').delete().eq('id', id);
            if (error) alert(error.message);
            else updateAllViews();
        }
    };
});
