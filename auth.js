/**
 * NexGen Authentication System (Supabase)
 */

document.addEventListener('DOMContentLoaded', () => {
    const authForm = document.getElementById('auth-form');
    const authTitle = document.getElementById('auth-title');
    const authSwitchBtn = document.getElementById('auth-switch-btn');
    const authSwitchText = document.getElementById('auth-switch-text');
    const nameField = document.getElementById('name-field');
    const submitBtn = authForm.querySelector('button[type="submit"]');
    const authError = document.getElementById('auth-error');
    const errorText = document.getElementById('error-text');

    let isLogin = true;

    function showError(message, isSuccess = false) {
        if (!authError || !errorText) return;
        errorText.innerText = message;
        authError.style.display = 'block';
        authError.style.background = isSuccess ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';
        authError.style.borderColor = isSuccess ? '#10b981' : '#ef4444';
        errorText.style.color = isSuccess ? '#34d399' : '#f87171';
        if (!isSuccess) {
            authError.style.animation = 'none';
            authError.offsetHeight;
            authError.style.animation = 'shake 0.4s ease-in-out';
        }
    }

    function clearError() {
        if (authError) authError.style.display = 'none';
    }

    // Toggle Password Visibility
    const togglePasswordBtn = document.getElementById('toggle-password');
    const passwordInput = document.getElementById('password');

    if (togglePasswordBtn && passwordInput) {
        togglePasswordBtn.addEventListener('click', () => {
            const isPassword = passwordInput.getAttribute('type') === 'password';
            passwordInput.setAttribute('type', isPassword ? 'text' : 'password');
            togglePasswordBtn.innerHTML = isPassword ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
        });
    }

    // Forgot Password
    const forgotPasswordBtn = document.getElementById('forgot-password-btn');
    if (forgotPasswordBtn) {
        forgotPasswordBtn.addEventListener('click', async () => {
            const email = document.getElementById('email').value.trim();
            if (!email) {
                showError('Please enter your email address first, then click Forgot Password.');
                return;
            }
            forgotPasswordBtn.disabled = true;
            forgotPasswordBtn.innerText = 'Sending...';
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/auth.html'
            });
            forgotPasswordBtn.disabled = false;
            forgotPasswordBtn.innerText = 'Forgot Password?';
            if (error) {
                showError(error.message);
            } else {
                showError('Password reset link sent! Check your email.', true);
            }
        });
    }

    // Toggle between Login and Sign Up
    authSwitchBtn.addEventListener('click', () => {
        isLogin = !isLogin;
        clearError();
        authForm.reset();
        authTitle.innerText = isLogin ? 'Sign in to your account' : 'Create a new account';
        submitBtn.innerText = isLogin ? 'Sign In' : 'Sign Up';
        authSwitchText.innerText = isLogin ? "Don't have an account?" : "Already have an account?";
        authSwitchBtn.innerText = isLogin ? 'Create Account' : 'Sign In';
        nameField.style.display = isLogin ? 'none' : 'block';
    });

    authForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        clearError();

        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const name = document.getElementById('name')?.value.trim();

        submitBtn.disabled = true;
        const originalBtnText = isLogin ? 'Sign In' : 'Sign Up';
        submitBtn.innerText = isLogin ? 'Signing In...' : 'Signing Up...';

        if (isLogin) {
            try {
                const { data, error } = await supabase.auth.signInWithPassword({ email, password });

                if (error) {
                    let msg = error.message;
                    if (msg.includes('Invalid login credentials')) {
                        msg = "Account not found or password incorrect. Please try again.";
                    } else if (msg.includes('Email not confirmed')) {
                        msg = "Please verify your email address before signing in.";
                    }
                    showError(msg);
                } else {
                    // ✅ Check for suspension
                    const { data: profile } = await supabase
                        .from('profiles')
                        .select('suspended_until, suspension_reason, role')
                        .eq('id', data.user.id)
                        .single();

                    if (profile && profile.suspended_until) {
                        const suspUntil = new Date(profile.suspended_until);
                        const now = new Date();

                        if (suspUntil > now && profile.role !== 'superadmin') {
                            // User is still suspended — sign them out immediately
                            await supabase.auth.signOut();
                            const formattedDate = suspUntil.toLocaleDateString('en-US', {
                                year: 'numeric', month: 'long', day: 'numeric'
                            });
                            showError(
                                `⚠️ Your account is suspended until ${formattedDate}. ` +
                                (profile.suspension_reason ? `Reason: "${profile.suspension_reason}".` : '') +
                                ' Please contact support for assistance.'
                            );
                            submitBtn.disabled = false;
                            submitBtn.innerText = originalBtnText;
                            return;
                        }
                    }

                    window.location.href = 'dashboard.html';
                }
            } catch (err) {
                console.error("Login Exception:", err);
                showError('Login failed: ' + (err.message || 'Network error'));
            }
        } else {
            try {
                if (!name && !isLogin) {
                    showError("Please enter your full name.");
                    submitBtn.disabled = false;
                    submitBtn.innerText = originalBtnText;
                    return;
                }

                const { data, error } = await supabase.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: name } }
                });

                if (error) {
                    let msg = error.message;
                    if (msg.includes('already registered') || error.status === 422) {
                        msg = 'This email is already registered. Try logging in instead.';
                    } else if (msg.includes('Password should be')) {
                        msg = 'Password is too weak. Please use at least 6 characters.';
                    }
                    showError(msg);
                } else {
                    showError('Success! Check your email for a verification link to complete registration.', true);
                    setTimeout(() => authSwitchBtn.click(), 2000);
                }
            } catch (err) {
                console.error("Signup Exception:", err);
                showError('Registration failed: ' + (err.message || 'Unexpected error'));
            }
        }

        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
    });
});
