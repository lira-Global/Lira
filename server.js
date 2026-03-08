// Lira - Main Server File
const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const sharp = require('sharp');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const app = express();

// Security Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(express.static(path.join(__dirname)));

// Rate Limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use('/api/', limiter);

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('✅ MongoDB Connected Successfully');
    initializeAdmin();
}).catch(err => {
    console.error('❌ MongoDB Connection Error:', err);
    process.exit(1);
});

// Session Configuration
app.use(session({
    secret: process.env.JWT_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// Email Transporter (Brevo)
const transporter = nodemailer.createTransport({
    host: 'smtp-relay.brevo.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_FROM,
        pass: process.env.BREVO_API_KEY
    }
});

// ============= SCHEMAS =============
// User Schema
const userSchema = new mongoose.Schema({
    userId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    sponsorId: { type: String, required: true },
    name: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    pincode: { type: String, required: true },
    position: { type: String, enum: ['L1', 'L2', 'L3', 'L4', 'L5'], required: true },
    parentId: { type: String },
    level: { type: Number, default: 1 },
    treePath: { type: String },
    isActive: { type: Boolean, default: false },
    activeUntil: { type: Date },
    isFranchise: { type: Boolean, default: false },
    franchisePincode: { type: String },
    wallet: { type: Number, default: 0 },
    wallet12Month: { type: Number, default: 0 },
    monthlyAdditions: [{
        month: Number,
        year: Number,
        amount: Number,
        date: Date
    }],
    birthDate: { type: Date },
    anniversaryDate: { type: Date },
    createdAt: { type: Date, default: Date.now },
    lastLogin: { type: Date },
    status: { type: String, enum: ['active', 'inactive', 'blocked'], default: 'active' }
});

// Category Schema
const categorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['jewelry', 'clothing', 'electronics'], required: true },
    perGramRate: { type: Number, default: 0 },
    perPieceRate: { type: Number, default: 0 },
    expense: { type: Number, required: true },
    makingPacking: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true },
    franchiseCharge: { type: Number, required: true },
    franchisePool: { type: Number, required: true },
    generalPool: { type: Number, required: true },
    gstPercent: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

// Product Schema
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    categoryName: String,
    type: String,
    gram: Number,
    size: String,
    purchaseRate: Number,
    expense: Number,
    makingPacking: Number,
    deliveryCharge: Number,
    franchiseCharge: Number,
    franchisePool: Number,
    generalPool: Number,
    gstPercent: Number,
    gstAmount: Number,
    payableAmount: Number,
    stock: { type: Number, default: 0 },
    images: [String],
    description: String,
    status: { type: String, enum: ['active', 'inactive'], default: 'active' },
    createdAt: { type: Date, default: Date.now }
});

// Order Schema
const orderSchema = new mongoose.Schema({
    orderId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    userName: String,
    userMobile: String,
    userPincode: String,
    franchiseId: String,
    franchiseName: String,
    items: [{
        productId: mongoose.Schema.Types.ObjectId,
        productName: String,
        category: String,
        quantity: Number,
        price: Number,
        makingPacking: Number,
        deliveryCharge: Number,
        franchiseCharge: Number
    }],
    totalAmount: Number,
    makingPackingTotal: Number,
    deliveryTotal: Number,
    franchiseChargeTotal: Number,
    gstAmount: Number,
    payableAmount: Number,
    paymentMethod: { type: String, enum: ['wallet', 'bank', '12month'] },
    paymentProof: String,
    utrNumber: String,
    bankDetails: String,
    orderType: { type: String, enum: ['regular', 'franchise', 'repurchase'] },
    status: { 
        type: String, 
        enum: ['pending', 'approved', 'rejected', 'processing', 'shipped', 'delivered', 'cancelled'],
        default: 'pending'
    },
    deliveryStatus: { type: String, enum: ['pending', 'assigned', 'picked', 'delivered'], default: 'pending' },
    assignedFranchise: String,
    deliveryDate: Date,
    createdAt: { type: Date, default: Date.now },
    approvedAt: Date,
    deliveredAt: Date
});

// Transaction Schema
const transactionSchema = new mongoose.Schema({
    transactionId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    type: { 
        type: String, 
        enum: ['add_fund', 'deduct', 'purchase', 'income', 'payout', 'activation', '12month_add', '12month_use']
    },
    amount: Number,
    balance: Number,
    description: String,
    referenceId: String,
    status: { type: String, enum: ['pending', 'completed', 'failed', 'rejected'], default: 'completed' },
    createdAt: { type: Date, default: Date.now }
});

// Income Schema
const incomeSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fromUserId: String,
    orderId: String,
    level: Number,
    amount: Number,
    type: { type: String, enum: ['level', 'franchise', 'pool'] },
    status: { type: String, enum: ['pending', 'credited', 'skipped'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    creditedAt: Date
});

// Payout Schema
const payoutSchema = new mongoose.Schema({
    payoutId: { type: String, required: true, unique: true },
    userId: { type: String, required: true },
    amount: Number,
    tdsPercent: Number,
    adminChargePercent: Number,
    tdsAmount: Number,
    adminChargeAmount: Number,
    netAmount: Number,
    bankDetails: Object,
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending' },
    approvedBy: String,
    approvedAt: Date,
    paidAt: Date,
    createdAt: { type: Date, default: Date.now }
});

// Pool Schema
const poolSchema = new mongoose.Schema({
    type: { type: String, enum: ['franchise', 'general'], required: true },
    members: [{
        userId: String,
        name: String,
        joinDate: Date,
        totalPurchase: Number,
        poolShare: Number,
        status: { type: String, enum: ['active', 'exited'], default: 'active' },
        exitDate: Date
    }],
    totalFund: { type: Number, default: 0 },
    distributionType: { type: String, enum: ['percentage', 'equal'], default: 'percentage' },
    maxMembers: { type: Number, default: 100 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Settings Schema
const settingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Category = mongoose.model('Category', categorySchema);
const Product = mongoose.model('Product', productSchema);
const Order = mongoose.model('Order', orderSchema);
const Transaction = mongoose.model('Transaction', transactionSchema);
const Income = mongoose.model('Income', incomeSchema);
const Payout = mongoose.model('Payout', payoutSchema);
const Pool = mongoose.model('Pool', poolSchema);
const Settings = mongoose.model('Settings', settingsSchema);

// Initialize Admin
async function initializeAdmin() {
    try {
        const adminExists = await User.findOne({ userId: 'ADMIN001' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('ADMIN001', 10);
            const admin = new User({
                userId: 'ADMIN001',
                password: hashedPassword,
                sponsorId: 'SYSTEM',
                name: 'Administrator',
                mobile: process.env.ADMIN_PHONE,
                email: process.env.ADMIN_EMAIL,
                pincode: '110001',
                position: 'L1',
                isActive: true,
                isFranchise: true,
                wallet: 1000000
            });
            await admin.save();
            console.log('✅ Admin Created Successfully');
        }
    } catch (error) {
        console.error('Admin Creation Error:', error);
    }
}

// ============= MIDDLEWARE =============
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1] || req.session.token;
        if (!token) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ success: false, message: 'Invalid token' });
    }
};

const adminMiddleware = async (req, res, next) => {
    try {
        const user = await User.findOne({ userId: req.userId });
        if (!user || user.userId !== 'ADMIN001') {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        next();
    } catch (error) {
        res.status(403).json({ success: false, message: 'Access denied' });
    }
};

// ============= EMAIL FUNCTIONS =============
async function sendEmail(to, subject, html) {
    try {
        const mailOptions = {
            from: `"${process.env.EMAIL_NAME}" <${process.env.EMAIL_FROM}>`,
            to: to,
            subject: subject,
            html: html
        };
        await transporter.sendMail(mailOptions);
        return true;
    } catch (error) {
        console.error('Email Error:', error);
        return false;
    }
}

// Email Templates
function getWelcomeEmail(name) {
    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: 'Arial', sans-serif; background: #f5f5f5; margin: 0; padding: 20px; }
                .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 15px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.1); }
                .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; }
                .header h1 { color: white; margin: 0; font-size: 36px; }
                .header p { color: rgba(255,255,255,0.9); font-size: 18px; margin-top: 10px; }
                .content { padding: 40px; }
                .button { display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 12px 30px; text-decoration: none; border-radius: 25px; font-weight: bold; }
                .footer { background: #f8f9fa; padding: 20px; text-align: center; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h1>✨ Lira</h1>
                    <p>Welcome to the Family!</p>
                </div>
                <div class="content">
                    <h2>Welcome ${name}!</h2>
                    <p>Thank you for joining Lira. We're excited to have you on board!</p>
                    <p>Your journey to financial freedom starts now.</p>
                    <a href="#" class="button">Get Started</a>
                </div>
                <div class="footer">
                    <p>&copy; 2026 Lira. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
    `;
}

// ============= API ROUTES =============

// 1. Registration with OTP
const otpStore = new Map();

app.post('/api/send-otp', async (req, res) => {
    try {
        const { email, mobile } = req.body;
        
        // Check existing user
        const existingUser = await User.findOne({ $or: [{ email }, { mobile }] });
        if (existingUser) {
            return res.status(400).json({ 
                success: false, 
                message: existingUser.email === email ? 'Email already registered' : 'Mobile already registered'
            });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        otpStore.set(email, { otp, expires: Date.now() + 300000 });
        
        const html = `
            <div style="font-family: Arial; padding: 20px;">
                <h2>Email Verification</h2>
                <p>Your OTP is: <strong style="font-size: 24px; color: #667eea;">${otp}</strong></p>
                <p>Valid for 5 minutes</p>
            </div>
        `;
        
        await sendEmail(email, 'Lira - Email Verification', html);
        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/verify-otp', (req, res) => {
    try {
        const { email, otp } = req.body;
        const stored = otpStore.get(email);
        
        if (!stored || stored.otp !== otp || stored.expires < Date.now()) {
            return res.status(400).json({ success: false, message: 'Invalid or expired OTP' });
        }
        
        otpStore.delete(email);
        res.json({ success: true, message: 'OTP verified' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

app.post('/api/register', async (req, res) => {
    try {
        const { sponsorId, name, mobile, email, pincode } = req.body;
        
        // Check duplicates
        const existing = await User.findOne({ $or: [{ email }, { mobile }] });
        if (existing) {
            return res.status(400).json({ 
                success: false, 
                message: 'Email or Mobile already registered' 
            });
        }
        
        // Find position in tree (left to right, top to bottom)
        const sponsor = await User.findOne({ userId: sponsorId });
        if (!sponsor) {
            return res.status(400).json({ success: false, message: 'Invalid Sponsor ID' });
        }
        
        // Auto-positioning logic
        let position = 'L1';
        let parentId = sponsorId;
        
        const children = await User.find({ parentId: sponsorId }).sort({ position: 1 });
        if (children.length === 0) {
            position = 'L1';
        } else if (children.length === 1) {
            position = 'L2';
        } else if (children.length === 2) {
            position = 'L3';
        } else if (children.length === 3) {
            position = 'L4';
        } else if (children.length === 4) {
            position = 'L5';
        } else {
            // Find next available
            const allUsers = await User.find({}).sort({ createdAt: 1 });
            for (const user of allUsers) {
                const userChildren = await User.find({ parentId: user.userId });
                if (userChildren.length < 5) {
                    parentId = user.userId;
                    position = `L${userChildren.length + 1}`;
                    break;
                }
            }
        }
        
        const hashedPassword = await bcrypt.hash(mobile, 10);
        const newUser = new User({
            userId: mobile,
            password: hashedPassword,
            sponsorId,
            name,
            mobile,
            email,
            pincode,
            position,
            parentId,
            treePath: sponsor.treePath ? `${sponsor.treePath}/${mobile}` : mobile
        });
        
        await newUser.save();
        
        // Send welcome email
        await sendEmail(email, 'Welcome to Lira!', getWelcomeEmail(name));
        
        res.json({ 
            success: true, 
            message: 'Registration successful',
            userId: mobile,
            password: mobile
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 2. Login
app.post('/api/login', async (req, res) => {
    try {
        const { userId, password } = req.body;
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(400).json({ success: false, message: 'Invalid credentials' });
        }
        
        const token = jwt.sign(
            { userId: user.userId, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRE }
        );
        
        req.session.token = token;
        req.session.userId = user.userId;
        
        user.lastLogin = new Date();
        await user.save();
        
        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                name: user.name,
                mobile: user.mobile,
                email: user.email,
                wallet: user.wallet,
                wallet12Month: user.wallet12Month,
                isActive: user.isActive,
                isFranchise: user.isFranchise
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 3. Add Fund
app.post('/api/add-fund', authMiddleware, async (req, res) => {
    try {
        const { amount, utrNumber, description, paymentProof } = req.body;
        
        const user = await User.findOne({ userId: req.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Get bank details from settings
        const bankDetails = await Settings.findOne({ key: 'bank_details' });
        
        const order = new Order({
            orderId: `ADD${Date.now()}`,
            userId: user.userId,
            userName: user.name,
            userMobile: user.mobile,
            totalAmount: amount,
            payableAmount: amount,
            paymentMethod: 'bank',
            utrNumber,
            description,
            paymentProof,
            bankDetails: bankDetails?.value || {},
            status: 'pending'
        });
        
        await order.save();
        
        res.json({ 
            success: true, 
            message: 'Fund request submitted for approval',
            orderId: order.orderId
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 4. Add to 12 Month Wallet
app.post('/api/add-to-12month', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        
        const user = await User.findOne({ userId: req.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (user.wallet < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        const now = new Date();
        user.wallet -= amount;
        user.monthlyAdditions.push({
            month: now.getMonth() + 1,
            year: now.getFullYear(),
            amount,
            date: now
        });
        
        await user.save();
        
        const transaction = new Transaction({
            transactionId: `TXN${Date.now()}`,
            userId: user.userId,
            type: '12month_add',
            amount,
            balance: user.wallet,
            description: `Added ₹${amount} to 12 Month Wallet`
        });
        await transaction.save();
        
        res.json({ 
            success: true, 
            message: 'Amount added to 12 Month Wallet',
            wallet: user.wallet,
            wallet12Month: user.wallet12Month
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 5. Activate ID
app.post('/api/activate-id', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        if (user.wallet < 499) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        user.wallet -= 499;
        user.isActive = true;
        user.activeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        await user.save();
        
        const transaction = new Transaction({
            transactionId: `ACT${Date.now()}`,
            userId: user.userId,
            type: 'activation',
            amount: 499,
            balance: user.wallet,
            description: 'ID Activated for 30 days'
        });
        await transaction.save();
        
        res.json({ 
            success: true, 
            message: 'ID activated successfully for 30 days',
            wallet: user.wallet,
            activeUntil: user.activeUntil
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 6. Buy Product
app.post('/api/buy-product', authMiddleware, async (req, res) => {
    try {
        const { productId, quantity, orderType, paymentMethod, utrNumber, paymentProof } = req.body;
        
        const user = await User.findOne({ userId: req.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const product = await Product.findById(productId);
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found' });
        }
        
        const totalAmount = product.purchaseRate * quantity;
        const makingPackingTotal = product.makingPacking * quantity;
        const deliveryTotal = product.deliveryCharge * quantity;
        const franchiseChargeTotal = product.franchiseCharge * quantity;
        const gstAmount = totalAmount * (product.gstPercent / 100);
        const payableAmount = totalAmount + gstAmount;
        
        // Check if user is active, if not, activate
        if (!user.isActive || user.activeUntil < new Date()) {
            user.isActive = true;
            user.activeUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }
        
        // Find franchise for pincode
        let franchise = await User.findOne({ 
            isFranchise: true, 
            franchisePincode: user.pincode 
        });
        
        if (!franchise) {
            franchise = await User.findOne({ 
                isFranchise: true, 
                franchisePincode: 'default' 
            });
        }
        
        const order = new Order({
            orderId: `ORD${Date.now()}`,
            userId: user.userId,
            userName: user.name,
            userMobile: user.mobile,
            userPincode: user.pincode,
            franchiseId: franchise?.userId,
            franchiseName: franchise?.name,
            items: [{
                productId: product._id,
                productName: product.name,
                category: product.categoryName,
                quantity,
                price: product.purchaseRate,
                makingPacking: product.makingPacking,
                deliveryCharge: product.deliveryCharge,
                franchiseCharge: product.franchiseCharge
            }],
            totalAmount,
            makingPackingTotal,
            deliveryTotal,
            franchiseChargeTotal,
            gstAmount,
            payableAmount,
            paymentMethod,
            utrNumber,
            paymentProof,
            orderType,
            status: paymentMethod === 'wallet' ? 'approved' : 'pending',
            assignedFranchise: franchise?.userId
        });
        
        await order.save();
        
        // If wallet payment, process immediately
        if (paymentMethod === 'wallet') {
            if (user.wallet < payableAmount) {
                return res.status(400).json({ success: false, message: 'Insufficient wallet balance' });
            }
            
            user.wallet -= payableAmount;
            await user.save();
            
            // Distribute income
            await distributeIncome(order, user, product);
        }
        
        res.json({ 
            success: true, 
            message: 'Order placed successfully',
            orderId: order.orderId,
            status: order.status
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// Income Distribution Function
async function distributeIncome(order, user, product) {
    try {
        const makingPackingTotal = order.makingPackingTotal;
        
        // Get uplines
        let currentUserId = user.sponsorId;
        let level = 1;
        
        while (currentUserId && level <= 10) {
            const upline = await User.findOne({ userId: currentUserId });
            
            if (upline && upline.isActive) {
                // Calculate level income (percentage based on admin settings)
                const levelPercent = await Settings.findOne({ key: `level_${level}_percent` });
                const percent = levelPercent?.value || 5; // Default 5%
                
                const incomeAmount = (makingPackingTotal * percent) / 100;
                
                const income = new Income({
                    userId: upline.userId,
                    fromUserId: user.userId,
                    orderId: order.orderId,
                    level,
                    amount: incomeAmount,
                    type: 'level',
                    status: 'credited'
                });
                await income.save();
                
                upline.wallet += incomeAmount;
                await upline.save();
                
                // Send email notification
                await sendEmail(upline.email, 'Income Received!', `
                    <div style="font-family: Arial; padding: 20px;">
                        <h2>Congratulations ${upline.name}! 🎉</h2>
                        <p>You received ₹${incomeAmount} as Level ${level} income from ${user.name}</p>
                        <p>Order ID: ${order.orderId}</p>
                    </div>
                `);
            }
            
            const nextUpline = await User.findOne({ userId: currentUserId });
            currentUserId = nextUpline?.sponsorId;
            level++;
        }
        
        // Franchise commission
        if (order.franchiseId) {
            const franchise = await User.findOne({ userId: order.franchiseId });
            if (franchise) {
                const franchiseIncome = new Income({
                    userId: franchise.userId,
                    fromUserId: user.userId,
                    orderId: order.orderId,
                    amount: order.franchiseChargeTotal,
                    type: 'franchise',
                    status: 'credited'
                });
                await franchiseIncome.save();
                
                franchise.wallet += order.franchiseChargeTotal;
                await franchise.save();
            }
        }
        
    } catch (error) {
        console.error('Income Distribution Error:', error);
    }
}

// 7. Admin - Approve Fund
app.post('/api/admin/approve-fund/:orderId', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const order = await Order.findOne({ orderId: req.params.orderId });
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        
        order.status = 'approved';
        order.approvedAt = new Date();
        await order.save();
        
        const user = await User.findOne({ userId: order.userId });
        if (user) {
            user.wallet += order.totalAmount;
            await user.save();
            
            const transaction = new Transaction({
                transactionId: `FUND${Date.now()}`,
                userId: user.userId,
                type: 'add_fund',
                amount: order.totalAmount,
                balance: user.wallet,
                description: 'Fund added via admin approval'
            });
            await transaction.save();
            
            // Send email
            await sendEmail(user.email, 'Fund Added Successfully!', `
                <div style="font-family: Arial; padding: 20px;">
                    <h2>Fund Added! 💰</h2>
                    <p>Dear ${user.name},</p>
                    <p>₹${order.totalAmount} has been added to your wallet.</p>
                    <p>Current Balance: ₹${user.wallet}</p>
                </div>
            `);
        }
        
        res.json({ success: true, message: 'Fund approved and credited' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 8. Admin - Add Category
app.post('/api/admin/category', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const category = new Category(req.body);
        await category.save();
        
        res.json({ success: true, message: 'Category added', category });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 9. Admin - Add Product
app.post('/api/admin/product', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const category = await Category.findById(req.body.categoryId);
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found' });
        }
        
        let purchaseRate = 0;
        if (category.type === 'jewelry') {
            purchaseRate = category.perGramRate * req.body.gram;
        } else {
            purchaseRate = category.perPieceRate;
        }
        
        const gstAmount = purchaseRate * (category.gstPercent / 100);
        const payableAmount = purchaseRate + gstAmount;
        
        const productData = {
            ...req.body,
            categoryName: category.name,
            type: category.type,
            purchaseRate,
            expense: category.expense,
            makingPacking: category.makingPacking,
            deliveryCharge: category.deliveryCharge,
            franchiseCharge: category.franchiseCharge,
            franchisePool: category.franchisePool,
            generalPool: category.generalPool,
            gstPercent: category.gstPercent,
            gstAmount,
            payableAmount
        };
        
        const product = new Product(productData);
        await product.save();
        
        // Notify all users about new product
        const users = await User.find({}, 'email');
        for (const user of users) {
            await sendEmail(user.email, 'New Product Arrived! 🎉', `
                <div style="font-family: Arial; padding: 20px;">
                    <h2>New Product: ${product.name}</h2>
                    <p>Check out our latest product!</p>
                    <p>Price: ₹${product.payableAmount}</p>
                    <a href="#" style="background: #667eea; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">View Product</a>
                </div>
            `);
        }
        
        res.json({ success: true, message: 'Product added', product });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 10. Admin - Settings
app.post('/api/admin/settings', authMiddleware, adminMiddleware, async (req, res) => {
    try {
        const { key, value } = req.body;
        
        await Settings.findOneAndUpdate(
            { key },
            { value, updatedAt: new Date() },
            { upsert: true }
        );
        
        res.json({ success: true, message: 'Settings updated' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 11. Payout Request
app.post('/api/payout-request', authMiddleware, async (req, res) => {
    try {
        const { amount, bankDetails } = req.body;
        
        const user = await User.findOne({ userId: req.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        // Check if already pending payout
        const pendingPayout = await Payout.findOne({ 
            userId: user.userId, 
            status: 'pending' 
        });
        
        if (pendingPayout) {
            return res.status(400).json({ 
                success: false, 
                message: 'You have a pending payout request' 
            });
        }
        
        const settings = await Settings.findOne({ key: 'payout_settings' });
        const minPayout = settings?.value?.minPayout || 100;
        const maxPayout = settings?.value?.maxPayout || 50000;
        const tdsPercent = settings?.value?.tdsPercent || 10;
        const adminChargePercent = settings?.value?.adminChargePercent || 5;
        
        if (amount < minPayout || amount > maxPayout) {
            return res.status(400).json({ 
                success: false, 
                message: `Amount must be between ₹${minPayout} and ₹${maxPayout}` 
            });
        }
        
        if (user.wallet < amount) {
            return res.status(400).json({ success: false, message: 'Insufficient balance' });
        }
        
        const tdsAmount = (amount * tdsPercent) / 100;
        const adminChargeAmount = (amount * adminChargePercent) / 100;
        const netAmount = amount - tdsAmount - adminChargeAmount;
        
        const payout = new Payout({
            payoutId: `POUT${Date.now()}`,
            userId: user.userId,
            amount,
            tdsPercent,
            adminChargePercent,
            tdsAmount,
            adminChargeAmount,
            netAmount,
            bankDetails
        });
        
        await payout.save();
        
        res.json({ 
            success: true, 
            message: 'Payout request submitted',
            payoutId: payout.payoutId,
            netAmount
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 12. Birthday/Anniversary Greetings
app.get('/api/today-celebrations', async (req, res) => {
    try {
        const today = new Date();
        const todayMonth = today.getMonth() + 1;
        const todayDate = today.getDate();
        
        const birthdays = await User.find({
            birthDate: {
                $expr: {
                    $and: [
                        { $eq: [{ $month: "$birthDate" }, todayMonth] },
                        { $eq: [{ $dayOfMonth: "$birthDate" }, todayDate] }
                    ]
                }
            }
        }, 'name userId');
        
        const anniversaries = await User.find({
            anniversaryDate: {
                $expr: {
                    $and: [
                        { $eq: [{ $month: "$anniversaryDate" }, todayMonth] },
                        { $eq: [{ $dayOfMonth: "$anniversaryDate" }, todayDate] }
                    ]
                }
            }
        }, 'name userId');
        
        res.json({
            success: true,
            birthdays,
            anniversaries
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 13. Dashboard Stats
app.get('/api/dashboard-stats', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.userId });
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }
        
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const [totalOrders, pendingPayout, todayEarnings, team] = await Promise.all([
            Order.countDocuments({ userId: user.userId }),
            Payout.findOne({ userId: user.userId, status: 'pending' }),
            Income.aggregate([
                { $match: { userId: user.userId, createdAt: { $gte: today } } },
                { $group: { _id: null, total: { $sum: '$amount' } } }
            ]),
            User.countDocuments({ sponsorId: user.userId })
        ]);
        
        res.json({
            success: true,
            stats: {
                wallet: user.wallet,
                wallet12Month: user.wallet12Month,
                totalOrders: totalOrders || 0,
                teamSize: team || 0,
                todayEarnings: todayEarnings[0]?.total || 0,
                pendingPayout: !!pendingPayout,
                isActive: user.isActive,
                activeUntil: user.activeUntil,
                isFranchise: user.isFranchise
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// 14. Best Performers
app.get('/api/best-performers', async (req, res) => {
    try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const topBuyers = await Order.aggregate([
            { $match: { createdAt: { $gte: today }, status: 'approved' } },
            { $group: { _id: '$userId', total: { $sum: '$totalAmount' }, name: { $first: '$userName' } } },
            { $sort: { total: -1 } },
            { $limit: 5 }
        ]);
        
        const topEarners = await Income.aggregate([
            { $match: { createdAt: { $gte: today } } },
            { $group: { _id: '$userId', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 5 },
            { $lookup: { from: 'users', localField: '_id', foreignField: 'userId', as: 'user' } }
        ]);
        
        res.json({
            success: true,
            topBuyers,
            topEarners: topEarners.map(e => ({
                userId: e._id,
                name: e.user[0]?.name,
                amount: e.total
            }))
        });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
});

// ============= SERVE HTML FILES =============
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'admin.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/products', (req, res) => res.sendFile(path.join(__dirname, 'products.html')));
app.get('/cart', (req, res) => res.sendFile(path.join(__dirname, 'cart.html')));
app.get('/checkout', (req, res) => res.sendFile(path.join(__dirname, 'checkout.html')));
app.get('/wallet', (req, res) => res.sendFile(path.join(__dirname, 'wallet.html')));
app.get('/franchise', (req, res) => res.sendFile(path.join(__dirname, 'franchise.html')));
app.get('/pool', (req, res) => res.sendFile(path.join(__dirname, 'pool.html')));

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`✅ Server running on http://localhost:${PORT}`);
    console.log(`📧 Brevo Email Configured`);
    console.log(`💾 MongoDB Connected`);
    console.log(`🚀 Lira Platform Ready`);
});
