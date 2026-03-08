// ==================== API Functions ====================
const API = {
    async request(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        try {
            const response = await fetch(endpoint, { ...defaultOptions, ...options });
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Something went wrong');
            }
            
            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },
    
    async post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },
    
    async get(endpoint) {
        return this.request(endpoint);
    },
    
    async upload(endpoint, formData) {
        const response = await fetch(endpoint, {
            method: 'POST',
            body: formData
        });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Upload failed');
        }
        
        return data;
    }
};

// ==================== UI Functions ====================
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.textContent = message;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
    alertDiv.style.padding = '1rem 2rem';
    alertDiv.style.borderRadius = '10px';
    alertDiv.style.backgroundColor = type === 'success' ? '#d4edda' : '#f8d7da';
    alertDiv.style.color = type === 'success' ? '#155724' : '#721c24';
    alertDiv.style.border = type === 'success' ? '1px solid #c3e6cb' : '1px solid #f5c6cb';
    alertDiv.style.boxShadow = '0 5px 15px rgba(0,0,0,0.2)';
    alertDiv.style.fontWeight = '500';
    alertDiv.style.animation = 'slideIn 0.3s';
    
    document.body.appendChild(alertDiv);
    
    setTimeout(() => {
        alertDiv.style.animation = 'slideOut 0.3s';
        setTimeout(() => alertDiv.remove(), 300);
    }, 3000);
}

function showLoading(show = true) {
    let loader = document.getElementById('global-loader');
    
    if (show) {
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.innerHTML = '<div class="spinner"></div>';
            loader.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(255,255,255,0.9);
                display: flex;
                justify-content: center;
                align-items: center;
                z-index: 10000;
            `;
            
            if (!document.getElementById('spinner-style')) {
                const spinnerStyle = document.createElement('style');
                spinnerStyle.id = 'spinner-style';
                spinnerStyle.textContent = `
                    .spinner {
                        width: 50px;
                        height: 50px;
                        border: 5px solid #f3f3f3;
                        border-top: 5px solid #667eea;
                        border-radius: 50%;
                        animation: spin 1s linear infinite;
                    }
                    @keyframes spin {
                        0% { transform: rotate(0deg); }
                        100% { transform: rotate(360deg); }
                    }
                    @keyframes slideIn {
                        from { transform: translateX(100%); opacity: 0; }
                        to { transform: translateX(0); opacity: 1; }
                    }
                    @keyframes slideOut {
                        from { transform: translateX(0); opacity: 1; }
                        to { transform: translateX(100%); opacity: 0; }
                    }
                `;
                document.head.appendChild(spinnerStyle);
            }
            document.body.appendChild(loader);
        }
    } else if (loader) {
        loader.remove();
    }
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2
    }).format(amount);
}

function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// ==================== Auth Functions ====================
async function checkAuth() {
    try {
        const user = await API.get('/api/user');
        return user;
    } catch (error) {
        return null;
    }
}

async function logout() {
    try {
        await API.post('/api/logout', {});
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
        showAlert('Logged out successfully');
        setTimeout(() => {
            window.location.href = '/index.html';
        }, 1000);
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// ==================== Page Initializations ====================
document.addEventListener('DOMContentLoaded', async () => {
    const page = window.location.pathname.split('/').pop();
    
    switch(page) {
        case 'login.html':
            initLogin();
            break;
        case 'register.html':
            initRegister();
            break;
        case 'dashboard.html':
            initDashboard();
            break;
        case 'admin.html':
            initAdmin();
            break;
        case 'products.html':
            initProducts();
            break;
        case 'add-fund.html':
            initAddFund();
            break;
        case 'wallet.html':
            initWallet();
            break;
        case 'profile.html':
            initProfile();
            break;
        case 'activate-id.html':
            initActivate();
            break;
    }
});

// ==================== Login Page ====================
function initLogin() {
    const form = document.getElementById('loginForm');
    if (!form) return;
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        try {
            showLoading(true);
            const result = await API.post('/api/login', data);
            showAlert('Login successful!');
            
            if (result.isAdmin) {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/dashboard.html';
            }
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            showLoading(false);
        }
    });
}

// ==================== Register Page ====================
function initRegister() {
    const form = document.getElementById('registerForm');
    const otpBtn = document.getElementById('sendOtp');
    const verifyBtn = document.getElementById('verifyOtp');
    
    if (!form) return;
    
    let isEmailVerified = false;
    
    if (otpBtn) {
        otpBtn.addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            if (!email) {
                showAlert('Please enter email', 'error');
                return;
            }
            
            try {
                showLoading(true);
                await API.post('/api/send-otp', { email });
                showAlert('OTP sent to your email');
                otpBtn.disabled = true;
                otpBtn.textContent = 'OTP Sent';
                otpBtn.style.opacity = '0.5';
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
    }
    
    if (verifyBtn) {
        verifyBtn.addEventListener('click', async () => {
            const email = document.getElementById('email').value;
            const otp = document.getElementById('otp').value;
            
            if (!otp) {
                showAlert('Please enter OTP', 'error');
                return;
            }
            
            try {
                showLoading(true);
                await API.post('/api/verify-otp', { email, otp });
                isEmailVerified = true;
                showAlert('Email verified successfully');
                verifyBtn.disabled = true;
                verifyBtn.textContent = 'Verified ✓';
                verifyBtn.style.background = '#28a745';
                verifyBtn.style.opacity = '0.5';
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        if (!isEmailVerified) {
            showAlert('Please verify your email first', 'error');
            return;
        }
        
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        
        try {
            showLoading(true);
            const result = await API.post('/api/register', data);
            showAlert('Registration successful! Your User ID is your mobile number');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 3000);
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            showLoading(false);
        }
    });
}

// ==================== Dashboard Page ====================
async function initDashboard() {
    try {
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        if (user.userId === 'admin') {
            window.location.href = '/admin.html';
            return;
        }
        
        document.getElementById('username').textContent = user.username;
        
        const data = await API.get('/api/dashboard');
        
        document.getElementById('wallet-balance').textContent = formatCurrency(data.wallet);
        document.getElementById('month-wallet').textContent = formatCurrency(data.monthWallet);
        document.getElementById('total-purchase').textContent = formatCurrency(data.totalPurchase);
        document.getElementById('total-income').textContent = formatCurrency(data.totalIncome);
        document.getElementById('direct-count').textContent = data.directCount;
        document.getElementById('today-purchase').textContent = formatCurrency(data.todayPurchase);
        document.getElementById('today-income').textContent = formatCurrency(data.todayIncome);
        document.getElementById('best-performer').innerHTML = `${data.bestPerformer}<br><small>${formatCurrency(data.bestPerformerAmount)}</small>`;
        document.getElementById('best-earner').innerHTML = `${data.bestEarner}<br><small>${formatCurrency(data.bestEarnerAmount)}</small>`;
        
        const activationDiv = document.getElementById('activation-status');
        if (data.active) {
            activationDiv.innerHTML = `<span style="background:#d4edda; color:#155724; padding:0.5rem 1rem; border-radius:50px;">Active until ${formatDate(data.activeUntil)}</span>`;
        } else {
            activationDiv.innerHTML = `<button onclick="location.href='/activate-id.html'" style="background:#667eea; color:white; border:none; padding:0.5rem 1rem; border-radius:50px; cursor:pointer;">Activate Now (₹499)</button>`;
        }
        
        const navLinks = document.getElementById('navLinks');
        if (navLinks) {
            navLinks.innerHTML = `
                <a href="/index.html">Home</a>
                <a href="/dashboard.html">Dashboard</a>
                <a href="/products.html">Products</a>
                <a href="/wallet.html">Wallet</a>
                <a href="/profile.html">Profile</a>
                <button onclick="logout()" style="padding:0.5rem 1.5rem; border:none; border-radius:50px; background:#ff4757; color:white; cursor:pointer;">Logout</button>
                <span style="color:#667eea; font-weight:600;">₹${user.wallet}</span>
            `;
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// ==================== Admin Page ====================
async function initAdmin() {
    try {
        const user = await checkAuth();
        if (!user || user.userId !== 'admin') {
            window.location.href = '/login.html';
            return;
        }
        
        const navLinks = document.getElementById('navLinks');
        if (navLinks) {
            navLinks.innerHTML = `
                <a href="/index.html">Home</a>
                <a href="/admin.html">Admin</a>
                <button onclick="logout()" style="padding:0.5rem 1.5rem; border:none; border-radius:50px; background:#ff4757; color:white; cursor:pointer;">Logout</button>
            `;
        }
        
        loadFundRequests();
        loadCategories();
        loadUsers();
        
    } catch (error) {
        window.location.href = '/login.html';
    }
}

// Admin Functions
async function loadFundRequests() {
    const tbody = document.getElementById('fund-requests');
    if (!tbody) return;
    
    try {
        const requests = await API.get('/api/admin/fund-requests');
        if (requests.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;">No pending requests</td></tr>';
        } else {
            tbody.innerHTML = requests.map(req => `
                <tr>
                    <td>${req.userId}</td>
                    <td>${req.name}</td>
                    <td>₹${req.amount}</td>
                    <td>${req.utr}</td>
                    <td>${formatDate(req.createdAt)}</td>
                    <td><button onclick="viewScreenshot('${req.screenshot}')">View</button></td>
                    <td>
                        <button onclick="approveFund('${req._id}')" style="background:#28a745; color:white; border:none; padding:0.3rem 1rem; border-radius:5px; margin:2px;">Approve</button>
                        <button onclick="rejectFund('${req._id}')" style="background:#dc3545; color:white; border:none; padding:0.3rem 1rem; border-radius:5px; margin:2px;">Reject</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; color:red;">Failed to load</td></tr>';
    }
}

async function approveFund(id) {
    try {
        showLoading(true);
        await API.post(`/api/admin/approve-fund/${id}`, {});
        showAlert('Fund approved');
        loadFundRequests();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function rejectFund(id) {
    try {
        showLoading(true);
        await API.post(`/api/admin/reject-fund/${id}`, {});
        showAlert('Fund rejected');
        loadFundRequests();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

async function loadCategories() {
    const select = document.getElementById('category-select');
    if (!select) return;
    
    try {
        const response = await fetch('/api/categories');
        const categories = await response.json();
        select.innerHTML = '<option value="">Select Category</option>' + 
            categories.map(c => `<option value="${c._id}">${c.name}</option>`).join('');
    } catch (error) {
        console.error('Failed to load categories:', error);
    }
}

async function loadUsers() {
    const tbody = document.getElementById('users-list');
    if (!tbody) return;
    
    try {
        const users = await API.get('/api/admin/users');
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.userId}</td>
                <td>${user.username}</td>
                <td>₹${user.wallet}</td>
                <td>${user.active ? '✅' : '❌'}</td>
                <td>
                    <button onclick="addUserFund('${user.userId}')" style="background:#28a745; color:white; border:none; padding:0.3rem 0.5rem;">Add</button>
                    <button onclick="deductUserFund('${user.userId}')" style="background:#dc3545; color:white; border:none; padding:0.3rem 0.5rem;">Deduct</button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Failed to load</td></tr>';
    }
}

async function addUserFund(userId) {
    const amount = prompt('Enter amount to add:');
    if (!amount) return;
    
    try {
        await API.post(`/api/admin/add-fund/${userId}`, { amount: parseFloat(amount) });
        showAlert('Fund added');
        loadUsers();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

async function deductUserFund(userId) {
    const amount = prompt('Enter amount to deduct:');
    if (!amount) return;
    
    try {
        await API.post(`/api/admin/deduct-fund/${userId}`, { amount: parseFloat(amount) });
        showAlert('Fund deducted');
        loadUsers();
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Category Form
document.getElementById('addCategoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = Object.fromEntries(formData.entries());
    
    try {
        showLoading(true);
        await API.post('/api/admin/add-category', data);
        showAlert('Category added');
        e.target.reset();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
});

// Product Form
document.getElementById('addProductForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    
    try {
        showLoading(true);
        await API.upload('/api/admin/add-product', formData);
        showAlert('Product added');
        e.target.reset();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
});

// ==================== Products Page ====================
async function initProducts() {
    const container = document.getElementById('products-container');
    if (!container) return;
    
    try {
        const user = await checkAuth();
        const products = await API.get('/api/products');
        
        container.innerHTML = products.map(product => `
            <div style="background:white; border-radius:15px; overflow:hidden; box-shadow:0 5px 20px rgba(0,0,0,0.1);">
                <div style="height:200px; background:linear-gradient(135deg, #667eea, #764ba2); display:flex; align-items:center; justify-content:center; color:white; font-size:3rem;">
                    🛍️
                </div>
                <div style="padding:1.5rem;">
                    <h3 style="margin-bottom:0.5rem;">${product.name}</h3>
                    <div style="font-size:1.3rem; color:#667eea; margin-bottom:1rem;">₹${product.totalPayable}</div>
                    <button onclick="buyProduct('${product._id}')" style="width:100%; padding:0.8rem; background:linear-gradient(135deg, #667eea, #764ba2); color:white; border:none; border-radius:10px; cursor:pointer;">
                        ${user ? 'Buy Now' : 'Login to Buy'}
                    </button>
                </div>
            </div>
        `).join('');
    } catch (error) {
        container.innerHTML = '<div style="color:white; text-align:center;">Failed to load products</div>';
    }
}

async function buyProduct(productId) {
    const user = await checkAuth();
    if (!user) {
        window.location.href = '/login.html';
        return;
    }
    
    const quantity = prompt('Enter quantity:', '1');
    if (!quantity) return;
    
    try {
        showLoading(true);
        await API.post('/api/purchase', {
            products: [{ productId, quantity: parseInt(quantity) }],
            type: 'regular'
        });
        showAlert('Purchase successful!');
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// ==================== Add Fund Page ====================
async function initAddFund() {
    const form = document.getElementById('addFundForm');
    if (!form) return;
    
    try {
        const details = await API.get('/api/company-details');
        const detailsDiv = document.getElementById('company-details');
        if (detailsDiv) {
            detailsDiv.innerHTML = `
                <div style="background:linear-gradient(135deg, #667eea, #764ba2); color:white; padding:2rem; border-radius:20px; margin-bottom:2rem;">
                    <h3 style="margin-bottom:1rem;">Bank Details</h3>
                    <p><strong>Bank:</strong> ${details.bankName}</p>
                    <p><strong>Account:</strong> ${details.accountNumber}</p>
                    <p><strong>IFSC:</strong> ${details.ifscCode}</p>
                    <p><strong>Holder:</strong> ${details.accountHolder}</p>
                    <p><strong>UPI:</strong> ${details.upiId}</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load company details');
    }
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(form);
        
        try {
            showLoading(true);
            await API.upload('/api/add-fund', formData);
            showAlert('Fund request submitted');
            form.reset();
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            showLoading(false);
        }
    });
}

// ==================== Wallet Page ====================
async function initWallet() {
    try {
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        document.getElementById('main-wallet').textContent = formatCurrency(user.wallet);
        document.getElementById('month-wallet').textContent = formatCurrency(user.monthWallet);
        
        const history = user.monthWalletHistory || [];
        const tbody = document.getElementById('month-history');
        if (history.length > 0) {
            tbody.innerHTML = history.map(h => `
                <tr>
                    <td>${h.month}</td>
                    <td>${h.year}</td>
                    <td>${formatCurrency(h.amount)}</td>
                    <td>${formatDate(h.addedAt)}</td>
                </tr>
            `).join('');
        }
        
        document.getElementById('addMonthWalletForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const amount = document.getElementById('monthAmount').value;
            
            try {
                showLoading(true);
                await API.post('/api/add-month-wallet', { amount: parseFloat(amount) });
                showAlert('Added to month wallet');
                setTimeout(() => window.location.reload(), 1500);
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
        
    } catch (error) {
        window.location.href = '/login.html';
    }
}

// ==================== Profile Page ====================
async function initProfile() {
    try {
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        document.getElementById('userId').value = user.userId;
        document.getElementById('username').value = user.username;
        document.getElementById('mobile').value = user.mobile;
        document.getElementById('email').value = user.email;
        document.getElementById('sponsorId').value = user.sponsorId;
        
        document.getElementById('profileForm')?.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            try {
                showLoading(true);
                await API.post('/api/update-profile', data);
                showAlert('Profile updated');
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
        
    } catch (error) {
        window.location.href = '/login.html';
    }
}

// ==================== Activate ID Page ====================
async function initActivate() {
    const btn = document.getElementById('activateBtn');
    if (!btn) return;
    
    btn.addEventListener('click', async () => {
        if (!confirm('Activate ID for 30 days? Cost: ₹499')) return;
        
        try {
            showLoading(true);
            await API.post('/api/activate', {});
            showAlert('ID activated successfully');
            setTimeout(() => window.location.href = '/dashboard.html', 2000);
        } catch (error) {
            showAlert(error.message, 'error');
        } finally {
            showLoading(false);
        }
    });
}

// Tab switching function for admin
function showAdminTab(tabName) {
    document.querySelectorAll('.admin-section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
    
    document.getElementById(tabName + '-section')?.classList.add('active');
    event.target.classList.add('active');
}

// View screenshot
function viewScreenshot(path) {
    if (path) {
        window.open(path, '_blank');
    } else {
        showAlert('No screenshot available', 'error');
    }
}
