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

    function showError(message) {
        if (!authError || !errorText) return;
        errorText.innerText = message;
        authError.style.display = 'block';
        // Shake animation for attention
        authError.style.animation = 'none';
        authError.offsetHeight; /* trigger reflow */
        authError.style.animation = 'shake 0.4s ease-in-out';
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

    // Toggle between Login and Sign Up
    authSwitchBtn.addEventListener('click', () => {
        isLogin = !isLogin;
        clearError();
        authForm.reset(); // Clear all fields when switching
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
                    console.error('Login error:', error);
                    let msg = error.message;
                    if (msg.includes('Invalid login credentials')) {
                        msg = "Account not found or password incorrect. Please try again.";
                    } else if (msg.includes('Email not confirmed')) {
                        msg = "Please verify your email address before signing in.";
                    }
                    showError(msg);
                } else {
                    window.location.href = 'dashboard.html';
                }
            } catch (err) {
                showError('An unexpected network error occurred. Please check your connection.');
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
                    console.error('Signup error:', error);
                    let msg = error.message;
                    if (msg.includes('already registered') || error.status === 422) {
                        msg = 'This email is already registered. Try logging in instead.';
                    } else if (msg.includes('Password should be')) {
                        msg = 'Password is too weak. Please use at least 6 characters.';
                    }
                    showError(msg);
                } else {
                    alert('Success! Please check your email for a verification link to complete your registration.');
                    authSwitchBtn.click();
                }
            } catch (err) {
                showError('An unexpected error occurred during registration.');
            }
        }

        submitBtn.disabled = false;
        submitBtn.innerText = originalBtnText;
    });
});
