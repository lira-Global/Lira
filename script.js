// Lira - Main JavaScript

// API Base URL
const API_BASE = window.location.origin;

// Global state
let currentUser = null;
let socket = null;

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    // Check authentication
    checkAuth();
    
    // Initialize socket connection
    initSocket();
    
    // Load page specific functions
    loadPageFunctions();
    
    // Add animation classes
    addAnimations();
});

// Check authentication
async function checkAuth() {
    const token = localStorage.getItem('token');
    const protectedPages = ['/dashboard', '/profile', '/wallet', '/purchase'];
    
    if (protectedPages.includes(window.location.pathname)) {
        if (!token) {
            window.location.href = '/user-login';
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/dashboard`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            
            if (!response.ok) {
                localStorage.removeItem('token');
                window.location.href = '/user-login';
            }
        } catch (error) {
            console.error('Auth check failed:', error);
        }
    }
}

// Initialize Socket.io
function initSocket() {
    if (currentUser) {
        socket = io(API_BASE);
        socket.emit('join', currentUser.userId);
        
        socket.on('newMessage', (message) => {
            showNotification('New message received', 'info');
            if (window.location.pathname === '/user-message') {
                loadMessages();
            }
        });
    }
}

// Show notification
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `alert alert-${type} fade-in`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.remove();
    }, 5000);
}

// Load page specific functions
function loadPageFunctions() {
    const path = window.location.pathname;
    
    if (path === '/') {
        loadHomePage();
    } else if (path === '/register') {
        initRegistration();
    } else if (path === '/user-login') {
        initLogin();
    } else if (path === '/admin-login') {
        initAdminLogin();
    } else if (path === '/dashboard') {
        loadDashboard();
    } else if (path === '/profile') {
        loadProfile();
    } else if (path === '/wallet') {
        loadWallet();
    } else if (path === '/products') {
        loadProducts();
    } else if (path === '/add-fund') {
        initAddFund();
    } else if (path === '/purchase') {
        initPurchase();
    } else if (path === '/user-message') {
        initMessaging();
    } else if (path === '/payout') {
        loadPayout();
    }
}

// Add animations
function addAnimations() {
    const elements = document.querySelectorAll('.glass-card, .stat-card, .product-card');
    elements.forEach((el, index) => {
        el.style.animation = `fadeIn 0.5s ease ${index * 0.1}s forwards`;
        el.style.opacity = '0';
    });
}

// Home Page
function loadHomePage() {
    // Load products
    fetchProducts();
    
    // Load best performers
    fetchBestPerformers();
    
    // Load birthdays/anniversaries
    fetchCelebrations();
}

// Fetch products
async function fetchProducts() {
    try {
        const response = await fetch(`${API_BASE}/api/products`);
        const products = await response.json();
        
        const container = document.getElementById('products-container');
        if (container) {
            container.innerHTML = products.map(product => `
                <div class="product-card">
                    <div class="product-image" style="background-image: url('${API_BASE}/uploads/${product.image}')"></div>
                    <div class="product-details">
                        <h3 class="product-title">${product.name}</h3>
                        <div class="product-price">₹${product.totalAmount}</div>
                        <button class="btn btn-primary" onclick="addToCart('${product._id}')">Add to Cart</button>
                    </div>
                </div>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to fetch products:', error);
    }
}

// Add to cart
function addToCart(productId) {
    if (!currentUser) {
        showNotification('Please login to add items to cart', 'warning');
        setTimeout(() => {
            window.location.href = '/user-login';
        }, 2000);
        return;
    }
    
    let cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const existingItem = cart.find(item => item.productId === productId);
    
    if (existingItem) {
        existingItem.quantity += 1;
    } else {
        cart.push({ productId, quantity: 1 });
    }
    
    localStorage.setItem('cart', JSON.stringify(cart));
    showNotification('Product added to cart', 'success');
    updateCartCount();
}

// Registration
function initRegistration() {
    // Load sponsor ID from URL
    const urlParams = new URLSearchParams(window.location.search);
    const sponsorId = urlParams.get('sponsor');
    if (sponsorId) {
        document.getElementById('sponsorId').value = sponsorId;
    }
    
    // Generate CAPTCHA
    generateCaptcha();
    
    // Handle form submission
    document.getElementById('registerForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            sponsorId: document.getElementById('sponsorId').value,
            username: document.getElementById('username').value,
            mobile: document.getElementById('mobile').value,
            email: document.getElementById('email').value,
            captcha: document.getElementById('captcha').value
        };
        
        // Validate
        if (!validateRegistration(formData)) {
            return;
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Registration successful! Your User ID is: ' + data.userId, 'success');
                setTimeout(() => {
                    window.location.href = '/user-login';
                }, 3000);
            } else {
                showNotification(data.error || 'Registration failed', 'error');
                generateCaptcha();
            }
        } catch (error) {
            showNotification('Registration failed', 'error');
            generateCaptcha();
        }
    });
}

// Generate CAPTCHA
async function generateCaptcha() {
    try {
        const response = await fetch(`${API_BASE}/api/captcha`);
        const data = await response.json();
        document.getElementById('captchaDisplay').textContent = data.captcha;
    } catch (error) {
        console.error('Failed to generate CAPTCHA:', error);
    }
}

// Validate registration
function validateRegistration(data) {
    // Mobile validation (10 digits)
    if (!/^\d{10}$/.test(data.mobile)) {
        showNotification('Please enter a valid 10-digit mobile number', 'error');
        return false;
    }
    
    // Email validation
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) {
        showNotification('Please enter a valid email address', 'error');
        return false;
    }
    
    // Username validation
    if (data.username.length < 3) {
        showNotification('Username must be at least 3 characters', 'error');
        return false;
    }
    
    return true;
}

// Login
function initLogin() {
    document.getElementById('loginForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = {
            userId: document.getElementById('userId').value,
            password: document.getElementById('password').value
        };
        
        try {
            const response = await fetch(`${API_BASE}/api/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });
            
            const data = await response.json();
            
            if (data.success) {
                localStorage.setItem('token', data.token);
                currentUser = data.user;
                showNotification('Login successful!', 'success');
                window.location.href = '/dashboard';
            } else {
                showNotification(data.error || 'Login failed', 'error');
            }
        } catch (error) {
            showNotification('Login failed', 'error');
        }
    });
}

// Admin Login
function initAdminLogin() {
    document.getElementById('adminLoginForm').addEventListener('submit', (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        // Simple admin authentication (in production, use proper auth)
        if (username === 'admin' && password === 'admin@123') {
            localStorage.setItem('admin', 'true');
            window.location.href = '/admin-dashboard';
        } else {
            showNotification('Invalid admin credentials', 'error');
        }
    });
}

// Dashboard
async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE}/api/dashboard`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        // Update user info
        currentUser = data.user;
        
        // Update stats
        document.getElementById('walletBalance').textContent = `₹${data.user.wallet}`;
        document.getElementById('monthWallet').textContent = `₹${data.user.monthWallet}`;
        document.getElementById('todayPurchases').textContent = data.todayPurchases;
        document.getElementById('todayIncome').textContent = `₹${data.todayIncome}`;
        
        // Update best performer
        if (data.bestPerformer) {
            document.getElementById('bestPerformer').innerHTML = `
                <div class="stat-card">
                    <h3>Best Performer Today</h3>
                    <div class="value">${data.bestPerformer.user?.username || 'N/A'}</div>
                    <p>₹${data.bestPerformer.total}</p>
                </div>
            `;
        }
        
        // Update best earner
        if (data.bestEarner) {
            document.getElementById('bestEarner').innerHTML = `
                <div class="stat-card">
                    <h3>Best Earner Today</h3>
                    <div class="value">${data.bestEarner.user?.username || 'N/A'}</div>
                    <p>₹${data.bestEarner.total}</p>
                </div>
            `;
        }
        
        // Show greetings
        showGreetings(data.todayBirthdays, data.todayAnniversaries);
        
        // Check activation status
        checkActivationStatus(data.user);
        
    } catch (error) {
        console.error('Failed to load dashboard:', error);
    }
}

// Show greetings
function showGreetings(birthdays, anniversaries) {
    const container = document.getElementById('greetings');
    if (!container) return;
    
    let html = '';
    
    birthdays.forEach(user => {
        html += `
            <div class="greeting-card">
                <h2>🎂 Happy Birthday!</h2>
                <p>Wishing ${user.username} a fantastic birthday!</p>
            </div>
        `;
    });
    
    anniversaries.forEach(user => {
        html += `
            <div class="greeting-card">
                <h2>💑 Happy Anniversary!</h2>
                <p>Congratulations ${user.username} on your anniversary!</p>
            </div>
        `;
    });
    
    container.innerHTML = html;
}

// Check activation status
function checkActivationStatus(user) {
    const container = document.getElementById('activationStatus');
    if (!container) return;
    
    if (!user.active) {
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Your ID is not activated. Activate now for 30 days at ₹499</span>
                <button class="btn btn-primary" onclick="activateId()">Activate Now</button>
            </div>
        `;
    } else if (user.expiryDate && new Date(user.expiryDate) < new Date()) {
        container.innerHTML = `
            <div class="alert alert-warning">
                <i class="fas fa-exclamation-triangle"></i>
                <span>Your ID has expired. Reactivate now</span>
                <button class="btn btn-primary" onclick="activateId()">Reactivate</button>
            </div>
        `;
    }
}

// Activate ID
async function activateId() {
    try {
        const response = await fetch(`${API_BASE}/api/activate`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            }
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('ID activated successfully for 30 days', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showNotification(data.error || 'Activation failed', 'error');
        }
    } catch (error) {
        showNotification('Activation failed', 'error');
    }
}

// Load Profile
async function loadProfile() {
    try {
        const response = await fetch(`${API_BASE}/api/dashboard`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        document.getElementById('userId').value = data.user.userId;
        document.getElementById('username').value = data.user.username;
        document.getElementById('mobile').value = data.user.mobile;
        document.getElementById('email').value = data.user.email;
        document.getElementById('sponsorId').value = data.user.sponsorId;
        
        if (data.user.birthDate) {
            document.getElementById('birthDate').value = data.user.birthDate.split('T')[0];
        }
        
        if (data.user.anniversaryDate) {
            document.getElementById('anniversaryDate').value = data.user.anniversaryDate.split('T')[0];
        }
        
        // Show tree
        renderTree(data.user);
        
    } catch (error) {
        console.error('Failed to load profile:', error);
    }
}

// Render tree
function renderTree(user) {
    const container = document.getElementById('treeContainer');
    if (!container) return;
    
    // This is a simplified tree rendering
    container.innerHTML = `
        <div class="tree">
            <ul>
                <li>
                    <div class="member-node ${user.active ? 'active' : ''}">
                        <strong>${user.userId}</strong><br>
                        ${user.username}
                    </div>
                    <ul>
                        ${renderLegs(user.leftLegs)}
                        ${renderLegs(user.rightLegs)}
                    </ul>
                </li>
            </ul>
        </div>
    `;
}

function renderLegs(legs) {
    if (!legs || legs.length === 0) return '';
    
    return legs.map(leg => `
        <li>
            <div class="member-node">
                <strong>${leg}</strong>
            </div>
        </li>
    `).join('');
}

// Update profile
async function updateProfile() {
    const formData = {
        username: document.getElementById('username').value,
        birthDate: document.getElementById('birthDate').value,
        anniversaryDate: document.getElementById('anniversaryDate').value
    };
    
    try {
        const response = await fetch(`${API_BASE}/api/update-profile`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Profile updated successfully', 'success');
        } else {
            showNotification(data.error || 'Update failed', 'error');
        }
    } catch (error) {
        showNotification('Update failed', 'error');
    }
}

// Load Wallet
async function loadWallet() {
    try {
        const response = await fetch(`${API_BASE}/api/dashboard`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const data = await response.json();
        
        document.getElementById('mainWallet').textContent = `₹${data.user.wallet}`;
        document.getElementById('monthWallet').textContent = `₹${data.user.monthWallet}`;
        
        // Load fund requests
        loadFundRequests();
        
        // Load transactions
        loadTransactions();
        
    } catch (error) {
        console.error('Failed to load wallet:', error);
    }
}

// Load fund requests
async function loadFundRequests() {
    try {
        const response = await fetch(`${API_BASE}/api/fund-requests`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const requests = await response.json();
        
        const container = document.getElementById('fundRequests');
        if (container) {
            container.innerHTML = requests.map(req => `
                <tr>
                    <td>${req.amount}</td>
                    <td>${req.utr}</td>
                    <td><span class="badge badge-${req.status}">${req.status}</span></td>
                    <td>${new Date(req.createdAt).toLocaleDateString()}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Failed to load fund requests:', error);
    }
}

// Add to month wallet
async function addToMonthWallet() {
    const amount = document.getElementById('monthAmount').value;
    
    if (!amount || amount <= 0) {
        showNotification('Please enter a valid amount', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/add-month-wallet`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount: parseFloat(amount) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Added to month wallet successfully', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showNotification(data.error || 'Failed to add', 'error');
        }
    } catch (error) {
        showNotification('Failed to add to month wallet', 'error');
    }
}

// Add Fund
function initAddFund() {
    // Load bank details
    loadBankDetails();
    
    document.getElementById('fundForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('name', document.getElementById('name').value);
        formData.append('amount', document.getElementById('amount').value);
        formData.append('utr', document.getElementById('utr').value);
        formData.append('description', document.getElementById('description').value);
        formData.append('proof', document.getElementById('proof').files[0]);
        
        try {
            const response = await fetch(`${API_BASE}/api/add-fund`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                showNotification('Fund request submitted successfully', 'success');
                document.getElementById('fundForm').reset();
            } else {
                showNotification(data.error || 'Submission failed', 'error');
            }
        } catch (error) {
            showNotification('Submission failed', 'error');
        }
    });
}

// Load bank details
async function loadBankDetails() {
    try {
        const response = await fetch(`${API_BASE}/api/bank-details`);
        const data = await response.json();
        
        const container = document.getElementById('bankDetails');
        if (container && data) {
            container.innerHTML = `
                <div class="qr-container">
                    <img src="${API_BASE}/uploads/${data.qrCode}" alt="QR Code" class="qr-image">
                </div>
                <div class="bank-details">
                    <div class="bank-detail-item">
                        <span>Bank Name:</span>
                        <strong>${data.bankName}</strong>
                    </div>
                    <div class="bank-detail-item">
                        <span>Account Number:</span>
                        <strong>${data.accountNumber}</strong>
                    </div>
                    <div class="bank-detail-item">
                        <span>IFSC Code:</span>
                        <strong>${data.ifsc}</strong>
                    </div>
                    <div class="bank-detail-item">
                        <span>Account Holder:</span>
                        <strong>${data.accountHolder}</strong>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Failed to load bank details:', error);
    }
}

// Purchase
function initPurchase() {
    loadProducts();
    updateCartCount();
    
    // Load cart items
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    if (cart.length > 0) {
        loadCartItems(cart);
    }
}

// Load cart items
async function loadCartItems(cart) {
    const container = document.getElementById('cartItems');
    if (!container) return;
    
    let total = 0;
    let html = '';
    
    for (const item of cart) {
        try {
            const response = await fetch(`${API_BASE}/api/product/${item.productId}`);
            const product = await response.json();
            
            total += product.totalAmount * item.quantity;
            
            html += `
                <div class="cart-item">
                    <div>${product.name} x ${item.quantity}</div>
                    <div>₹${product.totalAmount * item.quantity}</div>
                </div>
            `;
        } catch (error) {
            console.error('Failed to load product:', error);
        }
    }
    
    container.innerHTML = html;
    document.getElementById('totalAmount').textContent = `₹${total}`;
}

// Checkout
async function checkout() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const type = document.querySelector('input[name="purchaseType"]:checked')?.value || 'regular';
    
    if (cart.length === 0) {
        showNotification('Cart is empty', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/purchase`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ products: cart, type })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Purchase successful!', 'success');
            localStorage.removeItem('cart');
            updateCartCount();
            
            // Redirect to invoice
            window.location.href = `/invoice?id=${data.purchaseId}`;
        } else {
            showNotification(data.error || 'Purchase failed', 'error');
        }
    } catch (error) {
        showNotification('Purchase failed', 'error');
    }
}

// Update cart count
function updateCartCount() {
    const cart = JSON.parse(localStorage.getItem('cart') || '[]');
    const count = cart.reduce((sum, item) => sum + item.quantity, 0);
    
    const badge = document.getElementById('cartCount');
    if (badge) {
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
    }
}

// Messaging
function initMessaging() {
    loadUsers();
    loadMessages();
    
    document.getElementById('messageForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData();
        formData.append('toUserId', document.getElementById('toUserId').value);
        formData.append('message', document.getElementById('messageInput').value);
        
        const fileInput = document.getElementById('fileInput');
        if (fileInput.files[0]) {
            formData.append('file', fileInput.files[0]);
            formData.append('type', fileInput.files[0].type.startsWith('image/') ? 'image' : 'audio');
        } else {
            formData.append('type', 'text');
        }
        
        try {
            const response = await fetch(`${API_BASE}/api/send-message`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('token')}`
                },
                body: formData
            });
            
            const data = await response.json();
            
            if (data.success) {
                document.getElementById('messageInput').value = '';
                fileInput.value = '';
                loadMessages();
            } else {
                showNotification(data.error || 'Failed to send message', 'error');
            }
        } catch (error) {
            showNotification('Failed to send message', 'error');
        }
    });
}

// Load users for messaging
async function loadUsers() {
    try {
        const response = await fetch(`${API_BASE}/api/users`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const users = await response.json();
        
        const select = document.getElementById('toUserId');
        if (select) {
            select.innerHTML = '<option value="">Select User</option>' +
                users.map(u => `<option value="${u.userId}">${u.username} (${u.userId})</option>`).join('');
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

// Load messages
async function loadMessages() {
    const toUserId = document.getElementById('toUserId').value;
    if (!toUserId) return;
    
    try {
        const response = await fetch(`${API_BASE}/api/messages/${toUserId}`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });
        
        const messages = await response.json();
        
        const container = document.getElementById('messageBody');
        if (container) {
            container.innerHTML = messages.map(msg => `
                <div class="message-${msg.fromUserId === currentUser?.userId ? 'sent' : 'received'}">
                    ${msg.type === 'text' ? msg.message : ''}
                    ${msg.type === 'image' ? `<img src="${API_BASE}/uploads/${msg.fileUrl}" style="max-width: 200px">` : ''}
                    ${msg.type === 'audio' ? `<audio controls src="${API_BASE}/uploads/${msg.fileUrl}"></audio>` : ''}
                    <div class="message-time">${new Date(msg.createdAt).toLocaleTimeString()}</div>
                </div>
            `).join('');
            
            container.scrollTop = container.scrollHeight;
        }
    } catch (error) {
        console.error('Failed to load messages:', error);
    }
}

// Request Payout
async function requestPayout() {
    const amount = document.getElementById('payoutAmount').value;
    
    if (!amount || amount <= 0) {
        showNotification('Please enter a valid amount', 'error');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/api/request-payout`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ amount: parseFloat(amount) })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showNotification('Payout requested successfully', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } else {
            showNotification(data.error || 'Request failed', 'error');
        }
    } catch (error) {
        showNotification('Request failed', 'error');
    }
}

// Logout
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('admin');
    currentUser = null;
    window.location.href = '/';
}
