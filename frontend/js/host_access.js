const API_BASE = 'http://127.0.0.1:5000';

// Setup event listeners
document.addEventListener('DOMContentLoaded', function() {
    const passwordInput = document.getElementById('hostPassword');
    if (passwordInput) {
        // Allow Enter key to submit
        passwordInput.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                verifyHostAccess();
            }
        });
    }
});

async function verifyHostAccess() {
    const password = document.getElementById('hostPassword').value;
    const errorMsg = document.getElementById('errorMessage');
    
    if (!password) {
        if (errorMsg) {
            errorMsg.textContent = 'Please enter the host password';
            errorMsg.style.display = 'block';
        }
        return;
    }
    
    try {
        console.log('[Host Access] Verifying password...');
        
        const response = await fetch(`${API_BASE}/api/host/verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password: password }),
            credentials: 'include'
        });
        
        console.log('[Host Access] API Response Status:', response.status);
        
        const data = await response.json();
        console.log('[Host Access] API Response Data:', data);
        
        if (data.success === true) {
            console.log('[Host Access] Password verified successfully');
            
            // Clear any error messages
            if (errorMsg) {
                errorMsg.style.display = 'none';
                errorMsg.textContent = '';
            }
            
            // Store verification in localStorage (required by host_dashboard.html)
            localStorage.setItem('host_password_verified', 'true');
            console.log('[Host Access] Session stored in localStorage');
            
            // Redirect to host_dashboard.html
            window.location.href = 'host_dashboard.html';
        } else {
            console.log('[Host Access] Password verification failed');
            
            if (errorMsg) {
                errorMsg.textContent = data.message || 'Invalid host password';
                errorMsg.style.display = 'block';
            }
            
            // Clear the password input
            document.getElementById('hostPassword').value = '';
            document.getElementById('hostPassword').focus();
        }
    } catch (error) {
        console.error('[Host Access] Error verifying password:', error);
        if (errorMsg) {
            errorMsg.textContent = `Error: ${error.message}. Please check if backend is running on http://127.0.0.1:5000`;
            errorMsg.style.display = 'block';
        }
    }
}
