// API Functions
const API = {
    async request(endpoint, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };
        
        const response = await fetch(endpoint, { ...defaultOptions, ...options });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Something went wrong');
        }
        
        return data;
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

// UI Functions
function showAlert(message, type = 'success') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type}`;
    alertDiv.textContent = message;
    alertDiv.style.position = 'fixed';
    alertDiv.style.top = '20px';
    alertDiv.style.right = '20px';
    alertDiv.style.zIndex = '9999';
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
            document.body.appendChild(loader);
        }
    } else if (loader) {
        loader.remove();
    }
}

// Modal Functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
    }
}

// Format Currency
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 2
    }).format(amount);
}

// Format Date
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-IN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
}

// Check Login Status
async function checkAuth() {
    try {
        const user = await API.get('/api/user');
        return user;
    } catch (error) {
        return null;
    }
}

// Logout
async function logout() {
    try {
        await API.post('/api/logout', {});
        localStorage.removeItem('user');
        sessionStorage.removeItem('user');
        window.location.href = '/index.html';
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', async () => {
    // Update navbar based on login status
    const user = await checkAuth();
    updateNavbar(user);
    
    // Initialize page-specific functions
    const page = window.location.pathname.split('/').pop();
    switch(page) {
        case 'index.html':
            initHomePage();
            break;
        case 'dashboard.html':
            initDashboard();
            break;
        case 'register.html':
            initRegister();
            break;
        case 'login.html':
            initLogin();
            break;
        case 'products.html':
            initProducts();
            break;
        case 'add-fund.html':
            initAddFund();
            break;
        case 'admin.html':
            initAdmin();
            break;
    }
});

// Update Navbar
function updateNavbar(user) {
    const navLinks = document.querySelector('.nav-links');
    if (!navLinks) return;
    
    if (user) {
        navLinks.innerHTML = `
            <a href="/index.html">Home</a>
            <a href="/dashboard.html">Dashboard</a>
            <a href="/products.html">Products</a>
            <a href="/wallet.html">Wallet</a>
            ${user.isFranchise ? '<a href="/franchise.html">Franchise</a>' : ''}
            <a href="/profile.html">Profile</a>
            <button class="btn-logout" onclick="logout()">Logout</button>
            <span style="color:#667eea; font-weight:600;">₹${user.wallet.toFixed(2)}</span>
        `;
    } else {
        navLinks.innerHTML = `
            <a href="/index.html">Home</a>
            <a href="/products.html">Products</a>
            <a href="/login.html" class="btn-login">Login</a>
            <a href="/register.html" class="btn-register">Register</a>
        `;
    }
}

// Home Page
async function initHomePage() {
    try {
        // Load products
        const products = await API.get('/api/products');
        const productsGrid = document.getElementById('featured-products');
        
        if (productsGrid) {
            productsGrid.innerHTML = products.slice(0, 4).map(product => `
                <div class="product-card">
                    <img src="${product.image || '/default-product.jpg'}" alt="${product.name}" class="product-image">
                    <div class="product-details">
                        <h3 class="product-name">${product.name}</h3>
                        <div class="product-price">${formatCurrency(product.totalPayable)}</div>
                        <div class="product-category">${product.category?.name || 'General'}</div>
                        <button class="btn btn-primary btn-block" onclick="location.href='/login.html'">Buy Now</button>
                    </div>
                </div>
            `).join('');
        }
        
        // Load stats
        const stats = document.querySelector('.stats-grid');
        if (stats) {
            stats.innerHTML = `
                <div class="stat-card">
                    <div class="stat-icon">👥</div>
                    <div class="stat-value">10,000+</div>
                    <div class="stat-label">Happy Customers</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">📦</div>
                    <div class="stat-value">5,000+</div>
                    <div class="stat-label">Products</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">🏆</div>
                    <div class="stat-value">100+</div>
                    <div class="stat-label">Franchise</div>
                </div>
                <div class="stat-card">
                    <div class="stat-icon">⭐</div>
                    <div class="stat-value">4.8</div>
                    <div class="stat-label">Rating</div>
                </div>
            `;
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Register Page
function initRegister() {
    const form = document.getElementById('registerForm');
    const otpBtn = document.getElementById('sendOtp');
    const verifyBtn = document.getElementById('verifyOtp');
    
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
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
    }
    
    if (form) {
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
                showAlert('Registration successful! Your User ID is your mobile number and password is also your mobile number');
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
}

// Login Page
function initLogin() {
    const form = document.getElementById('loginForm');
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            
            try {
                showLoading(true);
                const result = await API.post('/api/login', data);
                showAlert('Login successful');
                
                if (data.userId === 'admin') {
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
}

// Dashboard
async function initDashboard() {
    try {
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        // Load dashboard data
        const data = await API.get('/api/dashboard');
        
        // Update stats
        document.getElementById('wallet-balance').textContent = formatCurrency(data.wallet);
        document.getElementById('month-wallet').textContent = formatCurrency(data.monthWallet);
        document.getElementById('total-purchase').textContent = formatCurrency(data.totalPurchase);
        document.getElementById('total-income').textContent = formatCurrency(data.totalIncome);
        document.getElementById('direct-count').textContent = data.directCount;
        document.getElementById('today-purchase').textContent = formatCurrency(data.todayPurchase);
        document.getElementById('today-income').textContent = formatCurrency(data.todayIncome);
        
        // Best performer/earner
        document.getElementById('best-performer').innerHTML = `
            <div>${data.bestPerformer}</div>
            <small>${formatCurrency(data.bestPerformerAmount)}</small>
        `;
        document.getElementById('best-earner').innerHTML = `
            <div>${data.bestEarner}</div>
            <small>${formatCurrency(data.bestEarnerAmount)}</small>
        `;
        
        // Activation status
        const activationDiv = document.getElementById('activation-status');
        if (activationDiv) {
            if (data.active) {
                activationDiv.innerHTML = `
                    <div class="badge badge-success">Active until ${formatDate(data.activeUntil)}</div>
                `;
            } else {
                activationDiv.innerHTML = `
                    <button class="btn btn-primary" onclick="location.href='/activate-id.html'">
                        Click here to activate (₹499/30 days)
                    </button>
                `;
            }
        }
        
        // Tree view
        // You can implement tree visualization here
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Products Page
async function initProducts() {
    try {
        const user = await checkAuth();
        const products = await API.get('/api/products');
        const container = document.getElementById('products-container');
        
        if (container) {
            container.innerHTML = products.map(product => `
                <div class="product-card">
                    <img src="${product.image || '/default-product.jpg'}" alt="${product.name}" class="product-image">
                    <div class="product-details">
                        <h3 class="product-name">${product.name}</h3>
                        <div class="product-price">${formatCurrency(product.totalPayable)}</div>
                        <div class="product-category">${product.category?.name || 'General'}</div>
                        <button class="btn btn-primary btn-block" onclick="buyProduct('${product._id}')">
                            ${user ? 'Buy Now' : 'Login to Buy'}
                        </button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Buy Product
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
        const result = await API.post('/api/purchase', {
            products: [{ productId, quantity: parseInt(quantity) }],
            type: 'regular'
        });
        showAlert('Purchase successful! Check your email for invoice.');
        setTimeout(() => window.location.reload(), 2000);
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Add Fund Page
function initAddFund() {
    const form = document.getElementById('addFundForm');
    
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(form);
            
            try {
                showLoading(true);
                const result = await API.upload('/api/add-fund', formData);
                showAlert('Fund request submitted successfully');
                form.reset();
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
    }
    
    // Load company details
    loadCompanyDetails();
}

async function loadCompanyDetails() {
    try {
        const details = await API.get('/api/company-details');
        
        const detailsDiv = document.getElementById('company-details');
        if (detailsDiv) {
            detailsDiv.innerHTML = `
                <div class="wallet-card">
                    <h3>Bank Details</h3>
                    <p><strong>Bank:</strong> ${details.bankName}</p>
                    <p><strong>Account:</strong> ${details.accountNumber}</p>
                    <p><strong>IFSC:</strong> ${details.ifscCode}</p>
                    <p><strong>Holder:</strong> ${details.accountHolder}</p>
                    <p><strong>UPI ID:</strong> ${details.upiId}</p>
                    ${details.qrCode ? `<img src="${details.qrCode}" alt="QR Code" style="max-width:200px; margin-top:1rem;">` : ''}
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load company details:', error);
    }
}

// Admin Page
function initAdmin() {
    checkAuth().then(user => {
        if (!user || user.userId !== 'admin') {
            window.location.href = '/index.html';
            return;
        }
    });
    
    // Load pending fund requests
    loadFundRequests();
    
    // Category form
    const categoryForm = document.getElementById('addCategoryForm');
    if (categoryForm) {
        categoryForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(categoryForm);
            const data = Object.fromEntries(formData.entries());
            
            try {
                showLoading(true);
                await API.post('/api/admin/add-category', data);
                showAlert('Category added successfully');
                categoryForm.reset();
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
    }
    
    // Product form
    const productForm = document.getElementById('addProductForm');
    if (productForm) {
        productForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(productForm);
            
            try {
                showLoading(true);
                await API.upload('/api/admin/add-product', formData);
                showAlert('Product added successfully');
                productForm.reset();
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
    }
    
    // Company details form
    const companyForm = document.getElementById('updateCompanyForm');
    if (companyForm) {
        companyForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(companyForm);
            
            try {
                showLoading(true);
                await API.upload('/api/admin/update-company', formData);
                showAlert('Company details updated');
            } catch (error) {
                showAlert(error.message, 'error');
            } finally {
                showLoading(false);
            }
        });
    }
}

async function loadFundRequests() {
    try {
        const requests = await API.get('/api/admin/fund-requests');
        const tbody = document.getElementById('fund-requests');
        
        if (tbody) {
            tbody.innerHTML = requests.map(req => `
                <tr>
                    <td>${req.userId}</td>
                    <td>${req.name}</td>
                    <td>${formatCurrency(req.amount)}</td>
                    <td>${req.utr}</td>
                    <td>${formatDate(req.createdAt)}</td>
                    <td>
                        <button class="btn btn-success btn-sm" onclick="approveFund('${req._id}')">Approve</button>
                        <button class="btn btn-danger btn-sm" onclick="rejectFund('${req._id}')">Reject</button>
                    </td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load fund requests:', error);
    }
}

async function approveFund(id) {
    try {
        showLoading(true);
        await API.post(`/api/admin/approve-fund/${id}`, {});
        showAlert('Fund request approved');
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
        showAlert('Fund request rejected');
        loadFundRequests();
    } catch (error) {
        showAlert(error.message, 'error');
    } finally {
        showLoading(false);
    }
}

// Profile Page
async function initProfile() {
    try {
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        const form = document.getElementById('profileForm');
        if (form) {
            document.getElementById('birthdate').value = user.birthdate ? formatDate(user.birthdate) : '';
            document.getElementById('anniversary').value = user.anniversary ? formatDate(user.anniversary) : '';
            
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                
                try {
                    showLoading(true);
                    await API.post('/api/update-profile', data);
                    showAlert('Profile updated successfully');
                } catch (error) {
                    showAlert(error.message, 'error');
                } finally {
                    showLoading(false);
                }
            });
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Month Wallet
async function initMonthWallet() {
    try {
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        const form = document.getElementById('addMonthWalletForm');
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const amount = document.getElementById('monthAmount').value;
                
                try {
                    showLoading(true);
                    await API.post('/api/add-month-wallet', { amount: parseFloat(amount) });
                    showAlert('Added to month wallet successfully');
                    form.reset();
                    setTimeout(() => window.location.reload(), 2000);
                } catch (error) {
                    showAlert(error.message, 'error');
                } finally {
                    showLoading(false);
                }
            });
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}

// Activate ID
async function initActivate() {
    try {
        const user = await checkAuth();
        if (!user) {
            window.location.href = '/login.html';
            return;
        }
        
        const btn = document.getElementById('activateBtn');
        if (btn) {
            btn.addEventListener('click', async () => {
                if (!confirm('Activate ID for 30 days? Cost: ₹499')) return;
                
                try {
                    showLoading(true);
                    await API.post('/api/activate', {});
                    showAlert('ID activated successfully for 30 days');
                    setTimeout(() => window.location.href = '/dashboard.html', 2000);
                } catch (error) {
                    showAlert(error.message, 'error');
                } finally {
                    showLoading(false);
                }
            });
        }
    } catch (error) {
        showAlert(error.message, 'error');
    }
}
