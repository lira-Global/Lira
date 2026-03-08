const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const MongoDBStore = require('connect-mongodb-session')(session);
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const moment = require('moment');
const fileUpload = require('express-fileupload');
const axios = require('axios'); // ✅ ADDED for Brevo API
require('dotenv').config();

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(fileUpload({
    limits: { fileSize: 50 * 1024 * 1024 },
    createParentPath: true
}));
app.use(express.static(path.join(__dirname)));

// Session Store
let store;
try {
    store = new MongoDBStore({
        uri: process.env.MONGODB_URI,
        collection: 'sessions'
    });
} catch (err) {
    console.error('❌ Session store error:', err);
}

app.use(session({
    secret: process.env.SESSION_SECRET || 'fallback_secret_key',
    resave: false,
    saveUninitialized: false,
    store: store,
    cookie: { maxAge: 1000 * 60 * 60 * 24 }
}));

// ==================== DEBUGGING ====================
console.log('🔍========== DEBUG INFORMATION ==========');
console.log('📦 Node Version:', process.version);
console.log('📂 Current Directory:', __dirname);
console.log('🔧 Environment Variables:');
console.log('  - PORT:', process.env.PORT);
console.log('  - MONGODB_URI:', process.env.MONGODB_URI ? process.env.MONGODB_URI.substring(0, 50) + '...' : '❌ NOT SET');
console.log('  - JWT_SECRET:', process.env.JWT_SECRET ? '✅ SET' : '❌ NOT SET');
console.log('  - SESSION_SECRET:', process.env.SESSION_SECRET ? '✅ SET' : '❌ NOT SET');
console.log('  - BREVO_API_KEY:', process.env.BREVO_API_KEY ? '✅ SET' : '❌ NOT SET');
console.log('  - EMAIL_USER:', process.env.EMAIL_USER || '❌ NOT SET');
console.log('  - EMAIL_FROM:', process.env.EMAIL_FROM || '❌ NOT SET');
console.log('=========================================');

// ==================== MongoDB Connection with Retry ====================
const connectWithRetry = async () => {
    console.log('🔄 Attempting to connect to MongoDB...');
    
    if (!process.env.MONGODB_URI) {
        console.error('❌ MONGODB_URI environment variable is not set!');
        return;
    }

    const maxRetries = 5;
    let retries = 0;

    const connect = async () => {
        try {
            await mongoose.connect(process.env.MONGODB_URI, {
                useNewUrlParser: true,
                useUnifiedTopology: true,
                serverSelectionTimeoutMS: 10000,
                socketTimeoutMS: 45000,
            });
            
            console.log('✅✅✅ MongoDB Connected Successfully! ✅✅✅');
            console.log('📊 Database:', mongoose.connection.name);
            console.log('📊 Host:', mongoose.connection.host);
            console.log('📊 Port:', mongoose.connection.port);
            
            initializeDatabase();
            
        } catch (err) {
            console.error('❌❌❌ MongoDB Connection Error ❌❌❌');
            console.error('Error Name:', err.name);
            console.error('Error Message:', err.message);
            console.error('Error Code:', err.code);
            
            if (err.name === 'MongoNetworkError') {
                console.error('🌐 Network Error - Check MongoDB Atlas Network Access');
                console.error('   ➡️ Go to MongoDB Atlas -> Network Access -> Add IP 0.0.0.0/0');
            } else if (err.name === 'MongooseServerSelectionError') {
                console.error('🖥️ Server Selection Error - Check if cluster is running');
            } else if (err.name === 'MongoAuthenticationError') {
                console.error('🔑 Authentication Error - Check username/password');
            }
            
            if (retries < maxRetries) {
                retries++;
                const delay = Math.pow(2, retries) * 1000;
                console.log(`🔄 Retrying connection in ${delay/1000} seconds... (Attempt ${retries}/${maxRetries})`);
                setTimeout(connect, delay);
            } else {
                console.error('❌ Max retries reached. Exiting...');
            }
        }
    };

    await connect();
};

// Start connection
connectWithRetry();

// ==================== BREVO EMAIL API FUNCTION ====================
// ✅ NEW: Brevo API email sender (replaces SMTP)
const sendEmailViaBrevo = async (to, subject, htmlContent) => {
    try {
        const response = await axios.post('https://api.brevo.com/v3/smtp/email', {
            sender: {
                name: 'Lira',
                email: process.env.EMAIL_USER || 'global.business.lira@gmail.com'
            },
            to: [{
                email: to,
                name: to.split('@')[0]
            }],
            subject: subject,
            htmlContent: htmlContent
        }, {
            headers: {
                'api-key': process.env.BREVO_API_KEY,
                'Content-Type': 'application/json'
            }
        });
        
        console.log(`✅ Email sent successfully to ${to}`);
        return true;
    } catch (error) {
        console.error('❌ Brevo API Error:', error.response?.data || error.message);
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', JSON.stringify(error.response.data, null, 2));
        }
        return false;
    }
};

// ==================== SCHEMAS ====================

// Category Schema
const CategorySchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: { type: String, enum: ['gram', 'piece'], required: true },
    purchaseRate: { type: Number, default: 0 },
    expense: { type: Number, default: 0 },
    makingPacking: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    franchiseCharge: { type: Number, default: 0 },
    franchisePool: { type: Number, default: 0 },
    generalPool: { type: Number, default: 0 },
    gst: { type: Number, default: 18 },
    createdAt: { type: Date, default: Date.now }
});

// Product Schema
const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    gram: { type: Number, default: 0 },
    size: { type: String, default: '' },
    purchaseRate: { type: Number, default: 0 },
    expense: { type: Number, default: 0 },
    makingPacking: { type: Number, default: 0 },
    deliveryCharge: { type: Number, default: 0 },
    franchiseCharge: { type: Number, default: 0 },
    franchisePool: { type: Number, default: 0 },
    generalPool: { type: Number, default: 0 },
    gst: { type: Number, default: 18 },
    totalPayable: { type: Number, default: 0 },
    stock: { type: Number, default: 1000 },
    image: { type: String, default: '/default-product.jpg' },
    description: { type: String },
    createdAt: { type: Date, default: Date.now }
});

// User Schema
const UserSchema = new mongoose.Schema({
    sponsorId: { type: String, required: true },
    userId: { type: String, required: true, unique: true },
    username: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    position: { type: Number },
    parentId: { type: String },
    level: { type: Number, default: 1 },
    active: { type: Boolean, default: false },
    activeUntil: { type: Date },
    isFranchise: { type: Boolean, default: false },
    franchisePincode: { type: String },
    wallet: { type: Number, default: 0 },
    monthWallet: { type: Number, default: 0 },
    monthWalletHistory: [{
        month: Number,
        year: Number,
        amount: Number,
        addedAt: { type: Date, default: Date.now }
    }],
    totalPurchase: { type: Number, default: 0 },
    totalIncome: { type: Number, default: 0 },
    directCount: { type: Number, default: 0 },
    birthdate: { type: Date },
    anniversary: { type: Date },
    createdAt: { type: Date, default: Date.now }
});

// Fund Request Schema
const FundRequestSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    utr: { type: String, required: true },
    description: { type: String },
    screenshot: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    approvedAt: { type: Date }
});

// Purchase Schema
const PurchaseSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: Number,
        price: Number,
        makingPacking: Number,
        franchiseCharge: Number,
        deliveryCharge: Number,
        franchisePool: Number,
        generalPool: Number
    }],
    totalAmount: { type: Number, required: true },
    type: { type: String, enum: ['regular', 'franchise', 'monthWallet'], default: 'regular' },
    franchisePincode: { type: String },
    assignedFranchise: { type: String },
    deliveryStatus: { type: String, enum: ['pending', 'assigned', 'delivered'], default: 'pending' },
    deliveryCharge: { type: Number, default: 0 },
    invoiceNumber: { type: String, unique: true },
    createdAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date }
});

// Income Schema
const IncomeSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fromUserId: { type: String },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    level: { type: Number },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['level', 'franchise', 'pool', 'welcome'] },
    status: { type: String, enum: ['pending', 'credited', 'lapsed'], default: 'credited' },
    createdAt: { type: Date, default: Date.now }
});

// Pool Schema
const PoolSchema = new mongoose.Schema({
    type: { type: String, enum: ['franchise', 'general'], required: true },
    members: [{
        userId: String,
        username: String,
        joinedAt: Date,
        purchaseAmount: Number,
        status: { type: String, enum: ['active', 'exited'], default: 'active' },
        exitedAt: Date
    }],
    totalFund: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

// Payout Schema
const PayoutSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    adminCharge: { type: Number, default: 5 },
    gst: { type: Number, default: 18 },
    netAmount: { type: Number },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now },
    processedAt: { type: Date }
});

// Settings Schema
const SettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed
});

// OTP Schema
const OTPSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: { type: String, required: true },
    expiresAt: { type: Date, default: Date.now, index: { expires: '10m' } }
});

// Company Details Schema
const CompanyDetailsSchema = new mongoose.Schema({
    bankName: { type: String, default: 'HDFC Bank' },
    accountNumber: { type: String, default: '50100501234567' },
    ifscCode: { type: String, default: 'HDFC0001234' },
    accountHolder: { type: String, default: 'Lira Business Solutions' },
    upiId: { type: String, default: 'lira@hdfcbank' },
    qrCode: { type: String },
    updatedAt: { type: Date, default: Date.now }
});

// Franchise Settings Schema
const FranchiseSettingsSchema = new mongoose.Schema({
    maxFranchisePerPincode: { type: Number, default: 1 },
    defaultFranchise: { type: String },
    welcomeBonus: { type: Number, default: 10 },
    poolDistributionType: { type: String, enum: ['percentage', 'equal'], default: 'equal' },
    poolExitAmount: { type: Number, default: 10000 },
    levelDistribution: { type: Number, default: 10 },
    createdAt: { type: Date, default: Date.now }
});

// Models
const Category = mongoose.model('Category', CategorySchema);
const Product = mongoose.model('Product', ProductSchema);
const User = mongoose.model('User', UserSchema);
const FundRequest = mongoose.model('FundRequest', FundRequestSchema);
const Purchase = mongoose.model('Purchase', PurchaseSchema);
const Income = mongoose.model('Income', IncomeSchema);
const Pool = mongoose.model('Pool', PoolSchema);
const Payout = mongoose.model('Payout', PayoutSchema);
const Settings = mongoose.model('Settings', SettingsSchema);
const OTP = mongoose.model('OTP', OTPSchema);
const CompanyDetails = mongoose.model('CompanyDetails', CompanyDetailsSchema);
const FranchiseSettings = mongoose.model('FranchiseSettings', FranchiseSettingsSchema);

// ==================== INITIALIZE DATABASE ====================

async function initializeDatabase() {
    try {
        console.log('📦 Initializing database with default data...');
        
        // Check if already initialized
        const settings = await Settings.findOne({ key: 'initialized' });
        if (settings) {
            console.log('✅ Database already initialized');
            return;
        }
        
        // Create default company details
        const companyExists = await CompanyDetails.findOne();
        if (!companyExists) {
            await CompanyDetails.create({});
            console.log('✅ Default company details created');
        }

        // Create default franchise settings
        const franchiseSettingsExists = await FranchiseSettings.findOne();
        if (!franchiseSettingsExists) {
            await FranchiseSettings.create({});
            console.log('✅ Default franchise settings created');
        }

        // Create default categories
        const categories = [
            { name: 'Gold', type: 'gram', purchaseRate: 5000, makingPacking: 500, expense: 100, deliveryCharge: 50, franchiseCharge: 100, franchisePool: 50, generalPool: 25 },
            { name: 'Silver', type: 'gram', purchaseRate: 60, makingPacking: 20, expense: 10, deliveryCharge: 30, franchiseCharge: 15, franchisePool: 10, generalPool: 5 },
            { name: 'Diamond', type: 'gram', purchaseRate: 30000, makingPacking: 2000, expense: 500, deliveryCharge: 200, franchiseCharge: 500, franchisePool: 200, generalPool: 100 },
            { name: 'Platinum', type: 'gram', purchaseRate: 25000, makingPacking: 1500, expense: 400, deliveryCharge: 150, franchiseCharge: 400, franchisePool: 150, generalPool: 75 },
            { name: "Men's Wear", type: 'piece', purchaseRate: 1000, makingPacking: 200, expense: 50, deliveryCharge: 40, franchiseCharge: 50, franchisePool: 30, generalPool: 15 },
            { name: "Women's Wear", type: 'piece', purchaseRate: 1500, makingPacking: 300, expense: 75, deliveryCharge: 40, franchiseCharge: 75, franchisePool: 40, generalPool: 20 },
            { name: "Kid's Wear", type: 'piece', purchaseRate: 500, makingPacking: 100, expense: 25, deliveryCharge: 40, franchiseCharge: 25, franchisePool: 20, generalPool: 10 },
            { name: 'Electronics', type: 'piece', purchaseRate: 10000, makingPacking: 500, expense: 200, deliveryCharge: 100, franchiseCharge: 200, franchisePool: 100, generalPool: 50 }
        ];

        for (let cat of categories) {
            const exists = await Category.findOne({ name: cat.name });
            if (!exists) {
                await Category.create(cat);
                console.log(`  ✅ Category created: ${cat.name}`);
            }
        }
        console.log('✅ Default categories created');

        // Create admin user
        const adminExists = await User.findOne({ userId: 'admin' });
        if (!adminExists) {
            const hashedPassword = await bcrypt.hash('admin123', 10);
            await User.create({
                sponsorId: 'admin',
                userId: 'admin',
                username: 'Administrator',
                mobile: '9999999999',
                email: 'admin@lira.com',
                password: hashedPassword,
                active: true,
                wallet: 100000
            });
            console.log('✅ Admin user created');
        }

        // Mark as initialized
        await Settings.create({ key: 'initialized', value: true });
        console.log('✅ Database initialization complete!');
        
    } catch (error) {
        console.error('❌ Database initialization error:', error);
    }
}

// ==================== MIDDLEWARE ====================

const authMiddleware = async (req, res, next) => {
    if (!req.session.userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const user = await User.findOne({ userId: req.session.userId });
    if (!user) {
        return res.status(401).json({ error: 'User not found' });
    }
    req.user = user;
    next();
};

const adminMiddleware = async (req, res, next) => {
    if (req.session.userId !== 'admin') {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
};

// ==================== EMAIL FUNCTION ====================
// ✅ NEW: Using Brevo API instead of SMTP
const sendEmail = async (to, subject, templateFile, replacements) => {
    try {
        const templatePath = path.join(__dirname, templateFile);
        if (!fs.existsSync(templatePath)) {
            console.log(`⚠️ Email template ${templateFile} not found`);
            return false;
        }
        
        let template = fs.readFileSync(templatePath, 'utf8');
        
        for (let key in replacements) {
            template = template.replace(new RegExp(`{{${key}}}`, 'g'), replacements[key]);
        }
        
        // ✅ Use Brevo API instead of SMTP
        return await sendEmailViaBrevo(to, subject, template);
        
    } catch (error) {
        console.error('❌ Email sending failed:', error);
        return false;
    }
};

// ==================== TREE FUNCTIONS ====================

const findPositionInTree = async (sponsorId) => {
    const sponsor = await User.findOne({ userId: sponsorId });
    if (!sponsor) return null;
    
    for (let i = 1; i <= 5; i++) {
        const existing = await User.findOne({ parentId: sponsorId, position: i });
        if (!existing) {
            return { parentId: sponsorId, position: i, level: sponsor.level + 1 };
        }
    }
    
    const children = await User.find({ parentId: sponsorId }).sort({ position: 1 });
    for (let child of children) {
        const result = await findPositionInTree(child.userId);
        if (result) return result;
    }
    
    return null;
};

// ==================== INCOME DISTRIBUTION ====================

const distributeIncome = async (purchase) => {
    const user = await User.findOne({ userId: purchase.userId });
    if (!user) return;
    
    if (!user.active) {
        user.active = true;
        user.activeUntil = moment().add(30, 'days').toDate();
        await user.save();
    }
    
    const settings = await FranchiseSettings.findOne() || { levelDistribution: 10 };
    const maxLevel = settings.levelDistribution;
    
    let currentUser = user;
    let level = 1;
    
    while (currentUser && level <= maxLevel) {
        const parent = await User.findOne({ userId: currentUser.parentId });
        if (!parent) break;
        
        if (parent.active) {
            if (level <= 5 || parent.directCount >= 11) {
                const incomeAmount = purchase.products.reduce((sum, p) => sum + (p.makingPacking * 0.1 * p.quantity), 0);
                
                const income = new Income({
                    userId: parent.userId,
                    fromUserId: user.userId,
                    purchaseId: purchase._id,
                    level: level,
                    amount: incomeAmount,
                    type: 'level'
                });
                await income.save();
                
                parent.wallet += incomeAmount;
                parent.totalIncome += incomeAmount;
                await parent.save();
                
                await sendEmail(
                    parent.email,
                    '🎉 Income Credited - Lira',
                    'income-received-email.html',
                    {
                        name: parent.username,
                        amount: incomeAmount.toFixed(2),
                        from: user.username,
                        level: level,
                        date: moment().format('DD-MM-YYYY'),
                        time: moment().format('hh:mm A')
                    }
                );
            }
        } else {
            const income = new Income({
                userId: parent.userId,
                fromUserId: user.userId,
                purchaseId: purchase._id,
                level: level,
                amount: 0,
                type: 'level',
                status: 'lapsed'
            });
            await income.save();
            
            await sendEmail(
                parent.email,
                '⚠️ Income Lapsed - Lira',
                'income-lapse-email.html',
                {
                    name: parent.username,
                    level: level,
                    date: moment().format('DD-MM-YYYY')
                }
            );
        }
        
        currentUser = parent;
        level++;
    }
};

// ==================== POOL MANAGEMENT ====================

const managePools = async (purchase, user) => {
    try {
        if (user.isFranchise) {
            let franchisePool = await Pool.findOne({ type: 'franchise' });
            if (!franchisePool) {
                franchisePool = new Pool({ type: 'franchise', members: [] });
            }
            
            const franchiseSettings = await FranchiseSettings.findOne() || { 
                poolDistributionType: 'equal', 
                poolExitAmount: 10000 
            };
            
            const existingMember = franchisePool.members.find(m => m.userId === user.userId && m.status === 'active');
            
            const franchiseCharges = purchase.products.reduce((sum, p) => sum + (p.franchisePool * p.quantity), 0);
            franchisePool.totalFund += franchiseCharges;
            
            if (!existingMember) {
                franchisePool.members.push({
                    userId: user.userId,
                    username: user.username,
                    joinedAt: new Date(),
                    purchaseAmount: purchase.totalAmount
                });
            } else {
                existingMember.purchaseAmount += purchase.totalAmount;
                
                if (existingMember.purchaseAmount >= franchiseSettings.poolExitAmount) {
                    existingMember.status = 'exited';
                    existingMember.exitedAt = new Date();
                }
            }
            
            await franchisePool.save();
        }
        
        // General Pool
        let generalPool = await Pool.findOne({ type: 'general' });
        if (!generalPool) {
            generalPool = new Pool({ type: 'general', members: [] });
        }
        
        const generalCharges = purchase.products.reduce((sum, p) => sum + (p.generalPool * p.quantity), 0);
        generalPool.totalFund += generalCharges;
        
        const existingGeneral = generalPool.members.find(m => m.userId === user.userId && m.status === 'active');
        
        if (!existingGeneral && generalPool.members.length < 100) {
            generalPool.members.push({
                userId: user.userId,
                username: user.username,
                joinedAt: new Date(),
                purchaseAmount: purchase.totalAmount
            });
        } else if (existingGeneral) {
            existingGeneral.purchaseAmount += purchase.totalAmount;
        }
        
        await generalPool.save();
    } catch (error) {
        console.error('Pool management error:', error);
    }
};

// ==================== API ROUTES ====================

// Health Check Route
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        time: new Date().toISOString(),
        mongodb: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected'
    });
});

// Generate Invoice Number
function generateInvoiceNumber() {
    return 'INV-' + Date.now() + '-' + Math.floor(1000 + Math.random() * 9000);
}

// Send OTP
app.post('/api/send-otp', async (req, res) => {
    try {
        const { email } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        
        await OTP.deleteMany({ email });
        await OTP.create({ email, otp });
        
        const emailSent = await sendEmail(
            email,
            '🔐 Email Verification - Lira',
            'welcome-email.html',
            {
                name: 'User',
                otp: otp,
                year: new Date().getFullYear()
            }
        );
        
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send OTP email' });
        }
        
        res.json({ success: true, message: 'OTP sent successfully' });
    } catch (error) {
        console.error('❌ Send OTP error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Verify OTP
app.post('/api/verify-otp', async (req, res) => {
    try {
        const { email, otp } = req.body;
        
        const otpRecord = await OTP.findOne({ email, otp });
        if (!otpRecord) {
            return res.status(400).json({ error: 'Invalid OTP' });
        }
        
        await OTP.deleteMany({ email });
        
        res.json({ success: true, message: 'OTP verified successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Register
app.post('/api/register', async (req, res) => {
    try {
        const { sponsorId, username, mobile, email } = req.body;
        
        const existingMobile = await User.findOne({ mobile });
        if (existingMobile) {
            return res.status(400).json({ error: 'Mobile number already registered' });
        }
        
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ error: 'Email already registered' });
        }
        
        const sponsor = await User.findOne({ userId: sponsorId });
        if (!sponsor) {
            return res.status(400).json({ error: 'Invalid Sponsor ID' });
        }
        
        const position = await findPositionInTree(sponsorId);
        if (!position) {
            return res.status(400).json({ error: 'Tree is full' });
        }
        
        const hashedPassword = await bcrypt.hash(mobile, 10);
        
        const user = new User({
            sponsorId,
            userId: mobile,
            username,
            mobile,
            email,
            password: hashedPassword,
            parentId: position.parentId,
            position: position.position,
            level: position.level
        });
        
        await user.save();
        
        await User.updateOne(
            { userId: sponsorId },
            { $inc: { directCount: 1 } }
        );
        
        await sendEmail(
            email,
            '🎉 Welcome to Lira Family!',
            'welcome-email.html',
            {
                name: username,
                userId: mobile,
                password: mobile,
                date: moment().format('DD-MM-YYYY'),
                year: new Date().getFullYear()
            }
        );
        
        res.json({ 
            success: true, 
            message: 'Registration successful',
            userId: mobile,
            password: mobile
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { userId, password } = req.body;
        
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(400).json({ error: 'Invalid User ID' });
        }
        
        const isValid = await bcrypt.compare(password, user.password);
        if (!isValid) {
            return res.status(400).json({ error: 'Invalid password' });
        }
        
        req.session.userId = user.userId;
        
        res.json({ 
            success: true, 
            message: 'Login successful',
            isAdmin: user.userId === 'admin'
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// Get Current User
app.get('/api/user', authMiddleware, async (req, res) => {
    res.json(req.user);
});

// Add Fund Request
app.post('/api/add-fund', authMiddleware, async (req, res) => {
    try {
        const { name, amount, utr, description } = req.body;
        let screenshot = '';
        
        if (req.files && req.files.screenshot) {
            const file = req.files.screenshot;
            const fileName = 'fund-' + Date.now() + '-' + file.name;
            const uploadPath = path.join(__dirname, fileName);
            await file.mv(uploadPath);
            screenshot = '/' + fileName;
        }
        
        const fundRequest = new FundRequest({
            userId: req.user.userId,
            name,
            amount,
            utr,
            description,
            screenshot
        });
        
        await fundRequest.save();
        
        await sendEmail(
            req.user.email,
            '💰 Fund Request Submitted - Lira',
            'fund-added-email.html',
            {
                name: req.user.username,
                amount: amount,
                utr: utr,
                date: moment().format('DD-MM-YYYY')
            }
        );
        
        res.json({ success: true, message: 'Fund request submitted' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Products
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find().populate('category');
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Purchase Product
app.post('/api/purchase', authMiddleware, async (req, res) => {
    try {
        const { products, type } = req.body;
        
        let totalAmount = 0;
        const purchaseProducts = [];
        
        for (let item of products) {
            const product = await Product.findById(item.productId);
            if (!product) continue;
            
            const price = product.totalPayable * item.quantity;
            totalAmount += price;
            
            purchaseProducts.push({
                productId: product._id,
                name: product.name,
                quantity: item.quantity,
                price: product.totalPayable,
                makingPacking: product.makingPacking,
                franchiseCharge: product.franchiseCharge,
                deliveryCharge: product.deliveryCharge,
                franchisePool: product.franchisePool,
                generalPool: product.generalPool
            });
        }
        
        let franchisePincode = '';
        let assignedFranchise = '';
        
        if (type !== 'monthWallet') {
            if (req.user.franchisePincode) {
                franchisePincode = req.user.franchisePincode;
                assignedFranchise = req.user.userId;
            } else {
                const franchise = await User.findOne({ 
                    isFranchise: true, 
                    franchisePincode: req.user.franchisePincode || 'default' 
                });
                
                if (franchise) {
                    assignedFranchise = franchise.userId;
                } else {
                    const defaultFranchise = await User.findOne({ isFranchise: true, franchisePincode: 'default' });
                    if (defaultFranchise) {
                        assignedFranchise = defaultFranchise.userId;
                    }
                }
            }
        }
        
        const purchase = new Purchase({
            userId: req.user.userId,
            products: purchaseProducts,
            totalAmount,
            type,
            franchisePincode,
            assignedFranchise,
            invoiceNumber: generateInvoiceNumber()
        });
        
        await purchase.save();
        
        if (type === 'monthWallet') {
            req.user.monthWallet -= totalAmount;
        } else {
            req.user.wallet -= totalAmount;
        }
        
        req.user.totalPurchase += totalAmount;
        await req.user.save();
        
        await distributeIncome(purchase);
        await managePools(purchase, req.user);
        
        if (assignedFranchise) {
            const franchise = await User.findOne({ userId: assignedFranchise });
            if (franchise) {
                const deliveryCharge = purchaseProducts.reduce((sum, p) => sum + (p.deliveryCharge * p.quantity), 0);
                franchise.wallet += deliveryCharge;
                await franchise.save();
                
                purchase.deliveryCharge = deliveryCharge;
                purchase.deliveryStatus = 'assigned';
                await purchase.save();
            }
        }
        
        await sendEmail(
            req.user.email,
            '🧾 Purchase Invoice - Lira',
            'invoice-email.html',
            {
                name: req.user.username,
                invoiceNo: purchase.invoiceNumber,
                date: moment().format('DD-MM-YYYY'),
                items: purchaseProducts.map(p => `${p.name} x${p.quantity} - ₹${p.price * p.quantity}`).join('<br>'),
                total: totalAmount,
                year: new Date().getFullYear()
            }
        );
        
        res.json({ 
            success: true, 
            message: 'Purchase successful',
            purchase 
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Activate ID
app.post('/api/activate', authMiddleware, async (req, res) => {
    try {
        if (req.user.wallet < 499) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        req.user.wallet -= 499;
        req.user.active = true;
        req.user.activeUntil = moment().add(30, 'days').toDate();
        await req.user.save();
        
        res.json({ success: true, message: 'ID activated for 30 days' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add to Month Wallet
app.post('/api/add-month-wallet', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (req.user.wallet < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }
        
        const now = moment();
        const month = now.month() + 1;
        const year = now.year();
        
        req.user.wallet -= amount;
        req.user.monthWallet += amount;
        
        req.user.monthWalletHistory.push({
            month,
            year,
            amount
        });
        
        await req.user.save();
        
        if (month === 12) {
            await sendEmail(
                'admin@lira.com',
                '📅 12th Month Fund Added',
                'fund-added-email.html',
                {
                    name: 'Admin',
                    amount: amount,
                    user: req.user.username,
                    date: moment().format('DD-MM-YYYY')
                }
            );
        }
        
        res.json({ success: true, message: 'Added to month wallet' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Profile
app.post('/api/update-profile', authMiddleware, async (req, res) => {
    try {
        const { birthdate, anniversary } = req.body;
        
        if (birthdate) req.user.birthdate = new Date(birthdate);
        if (anniversary) req.user.anniversary = new Date(anniversary);
        
        await req.user.save();
        
        res.json({ success: true, message: 'Profile updated' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Dashboard Data
app.get('/api/dashboard', authMiddleware, async (req, res) => {
    try {
        const today = moment().startOf('day');
        
        const todayPurchases = await Purchase.find({
            userId: req.user.userId,
            createdAt: { $gte: today.toDate() }
        });
        
        const todayIncome = await Income.find({
            userId: req.user.userId,
            createdAt: { $gte: today.toDate() }
        });
        
        const todayTotalPurchase = todayPurchases.reduce((sum, p) => sum + p.totalAmount, 0);
        const todayTotalIncome = todayIncome.reduce((sum, i) => sum + i.amount, 0);
        
        const bestPerformer = await Purchase.aggregate([
            { $match: { createdAt: { $gte: today.toDate() } } },
            { $group: { _id: '$userId', total: { $sum: '$totalAmount' } } },
            { $sort: { total: -1 } },
            { $limit: 1 }
        ]);
        
        const bestEarner = await Income.aggregate([
            { $match: { createdAt: { $gte: today.toDate() } } },
            { $group: { _id: '$userId', total: { $sum: '$amount' } } },
            { $sort: { total: -1 } },
            { $limit: 1 }
        ]);
        
        let bestPerformerName = 'N/A';
        let bestEarnerName = 'N/A';
        
        if (bestPerformer.length > 0) {
            const user = await User.findOne({ userId: bestPerformer[0]._id });
            bestPerformerName = user ? user.username : 'N/A';
        }
        
        if (bestEarner.length > 0) {
            const user = await User.findOne({ userId: bestEarner[0]._id });
            bestEarnerName = user ? user.username : 'N/A';
        }
        
        res.json({
            wallet: req.user.wallet,
            monthWallet: req.user.monthWallet,
            active: req.user.active,
            activeUntil: req.user.activeUntil,
            isFranchise: req.user.isFranchise,
            totalPurchase: req.user.totalPurchase,
            totalIncome: req.user.totalIncome,
            directCount: req.user.directCount,
            todayPurchase: todayTotalPurchase,
            todayIncome: todayTotalIncome,
            bestPerformer: bestPerformerName,
            bestEarner: bestEarnerName,
            bestPerformerAmount: bestPerformer.length > 0 ? bestPerformer[0].total : 0,
            bestEarnerAmount: bestEarner.length > 0 ? bestEarner[0].total : 0
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Company Details
app.get('/api/company-details', async (req, res) => {
    try {
        const details = await CompanyDetails.findOne();
        res.json(details || {});
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Check Birthday/Anniversary
setInterval(async () => {
    try {
        const today = moment().format('MM-DD');
        
        const birthdayUsers = await User.find({
            $expr: {
                $eq: [{ $dateToString: { format: '%m-%d', date: '$birthdate' } }, today]
            }
        });
        
        for (let user of birthdayUsers) {
            await sendEmail(
                user.email,
                '🎂 Happy Birthday - Lira',
                'birthday-email.html',
                {
                    name: user.username,
                    year: new Date().getFullYear()
                }
            );
        }
        
        const anniversaryUsers = await User.find({
            $expr: {
                $eq: [{ $dateToString: { format: '%m-%d', date: '$anniversary' } }, today]
            }
        });
        
        for (let user of anniversaryUsers) {
            await sendEmail(
                user.email,
                '💝 Happy Anniversary - Lira',
                'anniversary-email.html',
                {
                    name: user.username,
                    year: new Date().getFullYear()
                }
            );
        }
    } catch (error) {
        console.error('Birthday/Anniversary check error:', error);
    }
}, 60 * 60 * 1000);

// ==================== ADMIN ROUTES ====================

// Add Category
app.post('/api/admin/add-category', adminMiddleware, async (req, res) => {
    try {
        const category = new Category(req.body);
        await category.save();
        res.json({ success: true, category });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Add Product
app.post('/api/admin/add-product', adminMiddleware, async (req, res) => {
    try {
        const category = await Category.findById(req.body.category);
        if (!category) {
            return res.status(400).json({ error: 'Category not found' });
        }
        
        let totalPayable = 0;
        const productData = { ...req.body };
        
        if (category.type === 'gram' && req.body.gram) {
            productData.purchaseRate = category.purchaseRate * req.body.gram;
            productData.expense = category.expense * req.body.gram;
            productData.makingPacking = category.makingPacking * req.body.gram;
            productData.deliveryCharge = category.deliveryCharge * req.body.gram;
            productData.franchiseCharge = category.franchiseCharge * req.body.gram;
            productData.franchisePool = category.franchisePool * req.body.gram;
            productData.generalPool = category.generalPool * req.body.gram;
        } else {
            productData.purchaseRate = category.purchaseRate;
            productData.expense = category.expense;
            productData.makingPacking = category.makingPacking;
            productData.deliveryCharge = category.deliveryCharge;
            productData.franchiseCharge = category.franchiseCharge;
            productData.franchisePool = category.franchisePool;
            productData.generalPool = category.generalPool;
        }
        
        productData.gst = category.gst;
        
        const subtotal = productData.purchaseRate + productData.expense + 
                        productData.makingPacking + productData.deliveryCharge + 
                        productData.franchiseCharge + productData.franchisePool + 
                        productData.generalPool;
        
        const gstAmount = (subtotal * productData.gst) / 100;
        productData.totalPayable = subtotal + gstAmount;
        
        if (req.files && req.files.image) {
            const file = req.files.image;
            const fileName = 'product-' + Date.now() + '-' + file.name;
            const uploadPath = path.join(__dirname, fileName);
            await file.mv(uploadPath);
            productData.image = '/' + fileName;
        }
        
        const product = new Product(productData);
        await product.save();
        
        const users = await User.find({}, 'email username');
        for (let user of users) {
            await sendEmail(
                user.email,
                '🆕 New Product Added - Lira',
                'new-product-email.html',
                {
                    name: user.username,
                    productName: product.name,
                    price: product.totalPayable,
                    year: new Date().getFullYear()
                }
            );
        }
        
        res.json({ success: true, product });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Pending Fund Requests
app.get('/api/admin/fund-requests', adminMiddleware, async (req, res) => {
    try {
        const requests = await FundRequest.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.json(requests);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve Fund Request
app.post('/api/admin/approve-fund/:id', adminMiddleware, async (req, res) => {
    try {
        const request = await FundRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        request.status = 'approved';
        request.approvedAt = new Date();
        await request.save();
        
        const user = await User.findOne({ userId: request.userId });
        if (user) {
            user.wallet += request.amount;
            await user.save();
            
            await sendEmail(
                user.email,
                '✅ Fund Approved - Lira',
                'fund-added-email.html',
                {
                    name: user.username,
                    amount: request.amount,
                    date: moment().format('DD-MM-YYYY')
                }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject Fund Request
app.post('/api/admin/reject-fund/:id', adminMiddleware, async (req, res) => {
    try {
        const request = await FundRequest.findById(req.params.id);
        if (!request) {
            return res.status(404).json({ error: 'Request not found' });
        }
        
        request.status = 'rejected';
        await request.save();
        
        const user = await User.findOne({ userId: request.userId });
        if (user) {
            await sendEmail(
                user.email,
                '❌ Fund Request Rejected - Lira',
                'fund-added-email.html',
                {
                    name: user.username,
                    amount: request.amount,
                    date: moment().format('DD-MM-YYYY')
                }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Company Details
app.post('/api/admin/update-company', adminMiddleware, async (req, res) => {
    try {
        let company = await CompanyDetails.findOne();
        if (!company) {
            company = new CompanyDetails();
        }
        
        Object.assign(company, req.body);
        
        if (req.files && req.files.qrCode) {
            const file = req.files.qrCode;
            const fileName = 'qr-' + Date.now() + '-' + file.name;
            const uploadPath = path.join(__dirname, fileName);
            await file.mv(uploadPath);
            company.qrCode = '/' + fileName;
        }
        
        company.updatedAt = new Date();
        await company.save();
        
        res.json({ success: true, company });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Update Franchise Settings
app.post('/api/admin/update-franchise-settings', adminMiddleware, async (req, res) => {
    try {
        let settings = await FranchiseSettings.findOne();
        if (!settings) {
            settings = new FranchiseSettings();
        }
        
        Object.assign(settings, req.body);
        await settings.save();
        
        res.json({ success: true, settings });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get Pending Payouts
app.get('/api/admin/payouts', adminMiddleware, async (req, res) => {
    try {
        const payouts = await Payout.find({ status: 'pending' }).sort({ createdAt: -1 });
        res.json(payouts);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Approve Payout
app.post('/api/admin/approve-payout/:id', adminMiddleware, async (req, res) => {
    try {
        const payout = await Payout.findById(req.params.id);
        if (!payout) {
            return res.status(404).json({ error: 'Payout not found' });
        }
        
        payout.status = 'approved';
        payout.processedAt = new Date();
        await payout.save();
        
        const user = await User.findOne({ userId: payout.userId });
        if (user) {
            await sendEmail(
                user.email,
                '💰 Payout Approved - Lira',
                'payout-email.html',
                {
                    name: user.username,
                    amount: payout.netAmount,
                    date: moment().format('DD-MM-YYYY')
                }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Reject Payout
app.post('/api/admin/reject-payout/:id', adminMiddleware, async (req, res) => {
    try {
        const payout = await Payout.findById(req.params.id);
        if (!payout) {
            return res.status(404).json({ error: 'Payout not found' });
        }
        
        payout.status = 'rejected';
        await payout.save();
        
        const user = await User.findOne({ userId: payout.userId });
        if (user) {
            user.wallet += payout.amount;
            await user.save();
            
            await sendEmail(
                user.email,
                '❌ Payout Rejected - Lira',
                'payout-email.html',
                {
                    name: user.username,
                    amount: payout.amount,
                    date: moment().format('DD-MM-YYYY')
                }
            );
        }
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Get All Users
app.get('/api/admin/users', adminMiddleware, async (req, res) => {
    try {
        const users = await User.find().sort({ createdAt: -1 });
        res.json(users);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Add Fund
app.post('/api/admin/add-fund/:userId', adminMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await User.findOne({ userId: req.params.userId });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.wallet += parseFloat(amount);
        await user.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Admin Deduct Fund
app.post('/api/admin/deduct-fund/:userId', adminMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await User.findOne({ userId: req.params.userId });
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.wallet -= parseFloat(amount);
        await user.save();
        
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ==================== START SERVER ====================

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🌎 Health check: http://localhost:${PORT}/health`);
});
