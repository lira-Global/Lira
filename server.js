const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const helmet = require('helmet');
const compression = require('compression');
const http = require('http');
const socketIO = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

// Middleware
app.use(helmet({
    contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(__dirname));

// Session configuration
app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
        mongoUrl: process.env.MONGODB_URI,
        collectionName: 'sessions'
    }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production'
    }
}));

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log('MongoDB connected successfully');
}).catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
});

// File upload configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ==================== SCHEMAS ====================

const UserSchema = new mongoose.Schema({
    sponsorId: { type: String, required: true },
    userId: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    username: { type: String, required: true },
    mobile: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    position: { type: Number, required: true },
    leg: { type: Number, default: 1 },
    leftLegs: [String],
    rightLegs: [String],
    level: { type: Number, default: 1 },
    active: { type: Boolean, default: false },
    activatedDate: { type: Date },
    expiryDate: { type: Date },
    wallet: { type: Number, default: 0 },
    monthWallet: { type: Number, default: 0 },
    monthWalletHistory: [{
        month: Number,
        year: Number,
        amount: Number,
        date: Date
    }],
    franchise: { type: Boolean, default: false },
    franchisePinCode: { type: String },
    franchiseDate: { type: Date },
    birthDate: { type: Date },
    anniversaryDate: { type: Date },
    role: { type: String, enum: ['user', 'franchise', 'delivery', 'admin'], default: 'user' },
    createdAt: { type: Date, default: Date.now }
});

const CategorySchema = new mongoose.Schema({
    name: { type: String, required: true, unique: true },
    type: { type: String, enum: ['gram', 'piece', 'electronics'], required: true },
    perGramRate: { type: Number, default: 0 },
    perPieceRate: { type: Number, default: 0 },
    expense: { type: Number, required: true },
    makingPacking: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true },
    franchiseCharge: { type: Number, required: true },
    franchisePool: { type: Number, required: true },
    generalPool: { type: Number, required: true },
    gst: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now }
});

const ProductSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    gram: { type: Number },
    size: { type: String },
    purchaseRate: { type: Number, required: true },
    expense: { type: Number, required: true },
    makingPacking: { type: Number, required: true },
    deliveryCharge: { type: Number, required: true },
    franchiseCharge: { type: Number, required: true },
    franchisePool: { type: Number, required: true },
    generalPool: { type: Number, required: true },
    gst: { type: Number, required: true },
    totalAmount: { type: Number, required: true },
    stock: { type: Number, default: 0 },
    image: { type: String },
    createdAt: { type: Date, default: Date.now }
});

const FundRequestSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    utr: { type: String, required: true },
    proof: { type: String },
    description: { type: String },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const PurchaseSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    orderId: { type: String, unique: true },
    products: [{
        productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product' },
        name: String,
        quantity: Number,
        price: Number
    }],
    totalAmount: { type: Number, required: true },
    franchiseId: { type: String },
    type: { type: String, enum: ['regular', 'franchise', 'monthWallet'], default: 'regular' },
    deliveryStatus: { 
        type: String, 
        enum: ['pending', 'processing', 'out_for_delivery', 'delivered', 'failed', 'cancelled'], 
        default: 'pending' 
    },
    deliveryCharge: { type: Number },
    deliveryAddress: {
        street: String,
        city: String,
        state: String,
        pincode: String,
        landmark: String
    },
    // Delivery Code System (NO SMS/OTP)
    deliveryCode: { type: String },
    codeGeneratedAt: { type: Date },
    codeExpiry: { type: Date },
    deliveredAt: { type: Date },
    deliveredBy: { type: String }, // franchise/delivery person ID
    deliveryNotes: { type: String },
    deliveryPhoto: { type: String }, // Optional proof photo
    createdAt: { type: Date, default: Date.now }
});

// Generate unique order ID before saving
PurchaseSchema.pre('save', async function(next) {
    if (!this.orderId) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const count = await Purchase.countDocuments();
        this.orderId = `LI-${year}${month}-${(count + 1).toString().padStart(4, '0')}`;
    }
    next();
});

const IncomeSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    fromUserId: { type: String },
    level: { type: Number },
    amount: { type: Number, required: true },
    type: { type: String, enum: ['purchase', 'repurchase', 'franchise', 'delivery', 'pool', 'welcome'] },
    purchaseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase' },
    createdAt: { type: Date, default: Date.now }
});

const PoolSchema = new mongoose.Schema({
    type: { type: String, enum: ['franchise', 'general'], required: true },
    members: [{
        userId: String,
        totalPurchase: Number,
        joinDate: Date,
        exitDate: Date
    }],
    totalFund: { type: Number, default: 0 },
    distributionType: { type: String, enum: ['percentage', 'equal'], default: 'percentage' },
    fixedAmount: { type: Number, default: 0 },
    createdAt: { type: Date, default: Date.now }
});

const PayoutSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    amount: { type: Number, required: true },
    adminCharge: { type: Number },
    gst: { type: Number },
    netAmount: { type: Number },
    status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
    fromUserId: { type: String, required: true },
    toUserId: { type: String, required: true },
    message: { type: String },
    type: { type: String, enum: ['text', 'image', 'audio'] },
    fileUrl: { type: String },
    read: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});

const SettingsSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: mongoose.Schema.Types.Mixed,
    updatedAt: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', UserSchema);
const Category = mongoose.model('Category', CategorySchema);
const Product = mongoose.model('Product', ProductSchema);
const FundRequest = mongoose.model('FundRequest', FundRequestSchema);
const Purchase = mongoose.model('Purchase', PurchaseSchema);
const Income = mongoose.model('Income', IncomeSchema);
const Pool = mongoose.model('Pool', PoolSchema);
const Payout = mongoose.model('Payout', PayoutSchema);
const Message = mongoose.model('Message', MessageSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// ==================== MIDDLEWARE ====================

const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(' ')[1];
        if (!token) {
            return res.status(401).json({ error: 'No token provided' });
        }
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.userId;
        next();
    } catch (error) {
        res.status(401).json({ error: 'Invalid token' });
    }
};

const adminMiddleware = async (req, res, next) => {
    try {
        if (req.session.userId !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
        next();
    } catch (error) {
        res.status(403).json({ error: 'Admin access required' });
    }
};

const franchiseMiddleware = async (req, res, next) => {
    try {
        const user = await User.findOne({ userId: req.userId });
        if (!user || !user.franchise) {
            return res.status(403).json({ error: 'Franchise access required' });
        }
        next();
    } catch (error) {
        res.status(403).json({ error: 'Franchise access required' });
    }
};

// ==================== DELIVERY CODE FUNCTIONS ====================

// Generate random 6-digit delivery code
function generateDeliveryCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

// ==================== API ROUTES ====================

// Generate CAPTCHA
app.get('/api/captcha', (req, res) => {
    const captcha = Math.random().toString(36).substring(2, 8).toUpperCase();
    req.session.captcha = captcha;
    res.json({ captcha });
});

// Registration
app.post('/api/register', async (req, res) => {
    try {
        const { sponsorId, username, mobile, email, captcha } = req.body;

        // Verify CAPTCHA
        if (captcha !== req.session.captcha) {
            return res.status(400).json({ error: 'Invalid CAPTCHA' });
        }

        // Check if user already exists
        const existingUser = await User.findOne({
            $or: [{ mobile }, { email }]
        });
        if (existingUser) {
            return res.status(400).json({ error: 'Mobile or email already registered' });
        }

        // Find sponsor
        const sponsor = await User.findOne({ userId: sponsorId });
        if (!sponsor) {
            return res.status(400).json({ error: 'Invalid Sponsor ID' });
        }

        // Auto placement in tree
        let position = 1;
        let leg = 1;
        const allUsers = await User.find().sort({ position: 1 });
        
        if (allUsers.length > 0) {
            position = allUsers.length + 1;
            
            // Find leg to place (left to right, top to bottom)
            const legCounts = [0, 0, 0, 0, 0];
            allUsers.forEach(u => {
                legCounts[u.leg - 1]++;
            });
            
            const minLeg = Math.min(...legCounts);
            leg = legCounts.indexOf(minLeg) + 1;
        }

        // Create user
        const hashedPassword = await bcrypt.hash(mobile, 10);
        const user = new User({
            sponsorId,
            userId: mobile,
            password: hashedPassword,
            username,
            mobile,
            email,
            position,
            leg,
            role: 'user'
        });

        await user.save();

        // Update sponsor's legs
        if (leg === 1) sponsor.leftLegs.push(mobile);
        else if (leg === 2) sponsor.rightLegs.push(mobile);
        await sponsor.save();

        res.json({ success: true, message: 'Registration successful', userId: mobile });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Login
app.post('/api/login', async (req, res) => {
    try {
        const { userId, password } = req.body;

        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Invalid credentials' });
        }

        const token = jwt.sign(
            { userId: user.userId, mobile: user.mobile, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        req.session.userId = user.userId;

        res.json({
            success: true,
            token,
            user: {
                userId: user.userId,
                username: user.username,
                mobile: user.mobile,
                email: user.email,
                active: user.active,
                wallet: user.wallet,
                franchise: user.franchise,
                role: user.role
            }
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Forgot ID/Password
app.post('/api/forgot', async (req, res) => {
    try {
        const { mobile, email } = req.body;

        const user = await User.findOne({ $or: [{ mobile }, { email }] });
        if (!user) {
            return res.status(400).json({ error: 'User not found' });
        }

        res.json({
            success: true,
            userId: user.userId,
            password: 'Your password is your mobile number'
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add Fund Request
app.post('/api/add-fund', authMiddleware, upload.single('proof'), async (req, res) => {
    try {
        const { name, amount, utr, description } = req.body;

        const fundRequest = new FundRequest({
            userId: req.userId,
            name,
            amount: parseFloat(amount),
            utr,
            proof: req.file?.filename,
            description
        });

        await fundRequest.save();

        res.json({ success: true, message: 'Fund request submitted successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Activate ID
app.post('/api/activate', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.userId });
        
        if (user.wallet < 499) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        user.wallet -= 499;
        user.active = true;
        user.activatedDate = new Date();
        user.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        
        await user.save();

        res.json({ success: true, message: 'ID activated successfully for 30 days' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Add to Month Wallet
app.post('/api/add-month-wallet', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await User.findOne({ userId: req.userId });

        if (user.wallet < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        const date = new Date();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        user.wallet -= amount;
        user.monthWallet += amount;
        user.monthWalletHistory.push({
            month,
            year,
            amount: parseFloat(amount),
            date
        });

        await user.save();

        // Notify admin after 12 months
        if (user.monthWalletHistory.length === 12) {
            // Send notification to admin
        }

        res.json({ success: true, message: 'Added to month wallet successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Purchase Product
app.post('/api/purchase', authMiddleware, async (req, res) => {
    try {
        const { products, type, address } = req.body;
        const user = await User.findOne({ userId: req.userId });

        let totalAmount = 0;
        let totalDeliveryCharge = 0;
        const productDetails = [];

        for (const item of products) {
            const product = await Product.findById(item.productId);
            totalAmount += product.totalAmount * item.quantity;
            totalDeliveryCharge += product.deliveryCharge * item.quantity;
            productDetails.push({
                productId: product._id,
                name: product.name,
                quantity: item.quantity,
                price: product.totalAmount
            });
        }

        // Check wallet balance
        if (type === 'monthWallet') {
            if (user.monthWallet < totalAmount) {
                return res.status(400).json({ error: 'Insufficient month wallet balance' });
            }
            user.monthWallet -= totalAmount;
        } else {
            if (user.wallet < totalAmount) {
                return res.status(400).json({ error: 'Insufficient wallet balance' });
            }
            user.wallet -= totalAmount;
        }

        // Auto activate if not active
        if (!user.active) {
            user.active = true;
            user.activatedDate = new Date();
            user.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        } else {
            // Extend activation
            user.expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        }

        // Find franchise
        let franchiseId = null;
        if (!user.franchise && user.active) {
            const franchise = await User.findOne({ 
                franchise: true, 
                franchisePinCode: address?.pincode || { $exists: true }
            });
            
            if (franchise) {
                franchiseId = franchise.userId;
            } else {
                const defaultFranchise = await User.findOne({ 
                    franchise: true, 
                    userId: 'DEFAULT_FRANCHISE' 
                });
                if (defaultFranchise) {
                    franchiseId = defaultFranchise.userId;
                }
            }
        }

        // Create purchase
        const purchase = new Purchase({
            userId: user.userId,
            products: productDetails,
            totalAmount,
            deliveryCharge: totalDeliveryCharge,
            franchiseId,
            type,
            deliveryStatus: 'pending',
            deliveryAddress: address
        });

        await purchase.save();
        await user.save();

        // Distribute income (10 levels)
        await distributeIncome(user, purchase, products);

        res.json({ 
            success: true, 
            message: 'Purchase successful',
            orderId: purchase.orderId,
            purchaseId: purchase._id
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// ==================== DELIVERY CODE API ROUTES ====================

// Get active deliveries for user (shows delivery code)
app.get('/api/user/active-deliveries', authMiddleware, async (req, res) => {
    try {
        const deliveries = await Purchase.find({
            userId: req.userId,
            deliveryStatus: { $in: ['processing', 'out_for_delivery'] }
        }).sort({ createdAt: -1 });

        res.json(deliveries);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get delivery code for specific order (USER SIDE)
app.get('/api/delivery/code/:orderId', authMiddleware, async (req, res) => {
    try {
        const order = await Purchase.findById(req.params.orderId);
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Verify this order belongs to logged-in user
        if (order.userId !== req.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Check if order is out for delivery
        if (order.deliveryStatus !== 'out_for_delivery') {
            return res.status(400).json({ 
                error: 'Delivery code not available yet',
                status: order.deliveryStatus
            });
        }

        // Generate new code if not exists or expired
        if (!order.deliveryCode || new Date() > order.codeExpiry) {
            order.deliveryCode = generateDeliveryCode();
            order.codeGeneratedAt = new Date();
            order.codeExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000); // 4 hours valid
            await order.save();
        }

        res.json({
            success: true,
            orderId: order.orderId,
            deliveryCode: order.deliveryCode,
            validUntil: order.codeExpiry,
            message: 'Share this code ONLY with delivery person'
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Refresh delivery code (USER SIDE - generate new code)
app.post('/api/delivery/refresh-code/:orderId', authMiddleware, async (req, res) => {
    try {
        const order = await Purchase.findById(req.params.orderId);
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Verify ownership
        if (order.userId !== req.userId) {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        // Generate new code
        order.deliveryCode = generateDeliveryCode();
        order.codeGeneratedAt = new Date();
        order.codeExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000);
        await order.save();

        res.json({
            success: true,
            deliveryCode: order.deliveryCode,
            validUntil: order.codeExpiry
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get pending deliveries for franchise/delivery boy (FRANCHISE SIDE)
app.get('/api/franchise/pending-deliveries', authMiddleware, franchiseMiddleware, async (req, res) => {
    try {
        const deliveries = await Purchase.find({
            franchiseId: req.userId,
            deliveryStatus: { $in: ['pending', 'processing', 'out_for_delivery'] }
        }).sort({ createdAt: 1 });

        res.json(deliveries);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update delivery status (FRANCHISE SIDE)
app.post('/api/delivery/update-status/:orderId', authMiddleware, franchiseMiddleware, async (req, res) => {
    try {
        const { status, notes } = req.body;
        const order = await Purchase.findById(req.params.orderId);

        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Verify franchise assigned to this order
        if (order.franchiseId !== req.userId) {
            return res.status(403).json({ error: 'Not authorized for this order' });
        }

        // Update status
        order.deliveryStatus = status;
        if (notes) order.deliveryNotes = notes;

        // If marking as out for delivery, generate delivery code
        if (status === 'out_for_delivery' && !order.deliveryCode) {
            order.deliveryCode = generateDeliveryCode();
            order.codeGeneratedAt = new Date();
            order.codeExpiry = new Date(Date.now() + 4 * 60 * 60 * 1000);
        }

        await order.save();

        res.json({ 
            success: true, 
            message: `Delivery status updated to ${status}`,
            deliveryCode: order.deliveryCode // Send code if generated
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Verify delivery code and complete delivery (FRANCHISE SIDE)
app.post('/api/delivery/verify-code', authMiddleware, franchiseMiddleware, async (req, res) => {
    try {
        const { orderId, enteredCode, photoProof } = req.body;
        
        const order = await Purchase.findById(orderId);
        
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }

        // Verify franchise assigned to this order
        if (order.franchiseId !== req.userId) {
            return res.status(403).json({ error: 'Not authorized for this order' });
        }

        // Check if order is out for delivery
        if (order.deliveryStatus !== 'out_for_delivery') {
            return res.status(400).json({ 
                success: false,
                error: 'Order is not out for delivery',
                currentStatus: order.deliveryStatus
            });
        }

        // Check if code expired
        if (new Date() > order.codeExpiry) {
            return res.status(400).json({ 
                success: false,
                error: 'Code expired. Ask customer to refresh code.'
            });
        }

        // Verify code
        if (order.deliveryCode === enteredCode) {
            // Code matched - mark as delivered
            order.deliveryStatus = 'delivered';
            order.deliveredAt = new Date();
            order.deliveredBy = req.userId;
            if (photoProof) order.deliveryPhoto = photoProof;
            
            await order.save();
            
            // Credit delivery charge to franchise
            const franchise = await User.findOne({ userId: order.franchiseId });
            if (franchise) {
                franchise.wallet += order.deliveryCharge || 0;
                await franchise.save();
                
                // Record income
                const income = new Income({
                    userId: franchise.userId,
                    fromUserId: order.userId,
                    amount: order.deliveryCharge,
                    type: 'delivery',
                    purchaseId: order._id
                });
                await income.save();
            }
            
            res.json({ 
                success: true, 
                message: '✅ Delivery successful! Code verified.'
            });
        } else {
            // Wrong code
            res.status(400).json({ 
                success: false, 
                error: '❌ Invalid code. Please ask customer for correct code.'
            });
        }
        
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get delivery history (FRANCHISE SIDE)
app.get('/api/franchise/delivery-history', authMiddleware, franchiseMiddleware, async (req, res) => {
    try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const deliveries = await Purchase.find({
            franchiseId: req.userId,
            deliveryStatus: 'delivered'
        })
        .sort({ deliveredAt: -1 })
        .skip(skip)
        .limit(parseInt(limit));

        const total = await Purchase.countDocuments({
            franchiseId: req.userId,
            deliveryStatus: 'delivered'
        });

        res.json({
            deliveries,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Distribute Income Function
async function distributeIncome(user, purchase, products) {
    try {
        const settings = await Settings.findOne({ key: 'incomeSettings' });
        const levels = settings?.value?.levels || 10;
        
        let currentUser = user;
        let totalMakingPacking = 0;
        
        // Calculate total making + packing
        for (const item of products) {
            const product = await Product.findById(item.productId);
            totalMakingPacking += product.makingPacking * item.quantity;
        }

        // Distribute to upline
        for (let level = 1; level <= levels; level++) {
            // Find sponsor/upline
            const upline = await User.findOne({ userId: currentUser.sponsorId });
            
            if (!upline) break;

            // Skip if inactive
            if (!upline.active || (upline.expiryDate && upline.expiryDate < new Date())) {
                currentUser = upline;
                continue;
            }

            // Check level unlock condition (levels 6-10 require 11-15 active directs)
            if (level >= 6) {
                const activeDirects = await User.countDocuments({
                    sponsorId: upline.userId,
                    active: true,
                    expiryDate: { $gt: new Date() }
                });
                
                const requiredDirects = level + 5; // 11 for level 6, 12 for level 7, etc.
                if (activeDirects < requiredDirects) {
                    currentUser = upline;
                    continue;
                }
            }

            // Calculate income percentage (admin configurable)
            const percentage = settings?.value?.[`level${level}`] || 5;
            const incomeAmount = (totalMakingPacking * percentage) / 100;

            // Create income record
            const income = new Income({
                userId: upline.userId,
                fromUserId: user.userId,
                level,
                amount: incomeAmount,
                type: purchase.type === 'regular' ? 'purchase' : 'repurchase',
                purchaseId: purchase._id
            });

            await income.save();

            // Credit to wallet
            upline.wallet += incomeAmount;
            await upline.save();

            currentUser = upline;
        }

        // Franchise commission
        if (purchase.franchiseId) {
            const franchise = await User.findOne({ userId: purchase.franchiseId });
            if (franchise) {
                let franchiseCommission = 0;
                
                for (const item of products) {
                    const product = await Product.findById(item.productId);
                    franchiseCommission += product.franchiseCharge * item.quantity;
                }

                const income = new Income({
                    userId: franchise.userId,
                    fromUserId: user.userId,
                    amount: franchiseCommission,
                    type: 'franchise',
                    purchaseId: purchase._id
                });

                await income.save();
                franchise.wallet += franchiseCommission;
                await franchise.save();

                // Update pool
                await updatePool('franchise', franchise.userId, purchase.totalAmount);
            }
        }

        // Update general pool
        await updatePool('general', user.userId, purchase.totalAmount);

    } catch (error) {
        console.error('Income distribution error:', error);
    }
}

// Update Pool Function
async function updatePool(type, userId, amount) {
    try {
        let pool = await Pool.findOne({ type });
        
        if (!pool) {
            pool = new Pool({ type, members: [] });
        }

        // Add to pool fund
        pool.totalFund += amount * 0.01; // 1% goes to pool (admin configurable)

        // Check if user already in pool
        const existingMember = pool.members.find(m => m.userId === userId);
        
        if (existingMember) {
            existingMember.totalPurchase += amount;
        } else {
            pool.members.push({
                userId,
                totalPurchase: amount,
                joinDate: new Date()
            });
        }

        // Distribute pool income
        await distributePoolIncome(pool);

        await pool.save();
    } catch (error) {
        console.error('Pool update error:', error);
    }
}

// Distribute Pool Income
async function distributePoolIncome(pool) {
    try {
        if (pool.members.length < 100) return;

        const settings = await Settings.findOne({ key: 'poolSettings' });
        const distributionType = settings?.value?.distributionType || 'percentage';
        const fixedAmount = settings?.value?.fixedAmount || 100;

        if (distributionType === 'percentage') {
            // Distribute based on purchase amount
            const totalPurchase = pool.members.reduce((sum, m) => sum + m.totalPurchase, 0);
            
            for (const member of pool.members) {
                const percentage = (member.totalPurchase / totalPurchase) * 100;
                const income = (pool.totalFund * percentage) / 100;
                
                const user = await User.findOne({ userId: member.userId });
                if (user) {
                    const incomeRecord = new Income({
                        userId: member.userId,
                        amount: income,
                        type: 'pool'
                    });
                    await incomeRecord.save();
                    
                    user.wallet += income;
                    await user.save();
                }
            }
        } else {
            // Equal distribution
            const perMember = fixedAmount;
            
            for (const member of pool.members) {
                const user = await User.findOne({ userId: member.userId });
                if (user && pool.totalFund >= perMember) {
                    const incomeRecord = new Income({
                        userId: member.userId,
                        amount: perMember,
                        type: 'pool'
                    });
                    await incomeRecord.save();
                    
                    user.wallet += perMember;
                    await user.save();
                    
                    pool.totalFund -= perMember;
                    
                    // Remove member if reached fixed amount
                    if (member.totalPurchase >= perMember * 100) {
                        member.exitDate = new Date();
                        pool.members = pool.members.filter(m => m.userId !== member.userId);
                    }
                }
            }
        }
    } catch (error) {
        console.error('Pool distribution error:', error);
    }
}

// Admin - Add Category
app.post('/api/admin/category', adminMiddleware, async (req, res) => {
    try {
        const category = new Category(req.body);
        await category.save();
        res.json({ success: true, category });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin - Add Product
app.post('/api/admin/product', adminMiddleware, upload.single('image'), async (req, res) => {
    try {
        const category = await Category.findOne({ name: req.body.category });
        
        if (!category) {
            return res.status(400).json({ error: 'Category not found' });
        }

        let purchaseRate, expense, makingPacking, deliveryCharge, franchiseCharge, franchisePool, generalPool, gst;

        if (category.type === 'gram' && req.body.gram) {
            purchaseRate = category.perGramRate * parseFloat(req.body.gram);
            expense = category.expense * parseFloat(req.body.gram);
            makingPacking = category.makingPacking * parseFloat(req.body.gram);
            deliveryCharge = category.deliveryCharge * parseFloat(req.body.gram);
            franchiseCharge = category.franchiseCharge * parseFloat(req.body.gram);
            franchisePool = category.franchisePool * parseFloat(req.body.gram);
            generalPool = category.generalPool * parseFloat(req.body.gram);
        } else {
            purchaseRate = category.perPieceRate;
            expense = category.expense;
            makingPacking = category.makingPacking;
            deliveryCharge = category.deliveryCharge;
            franchiseCharge = category.franchiseCharge;
            franchisePool = category.franchisePool;
            generalPool = category.generalPool;
        }

        const gst = category.gst;
        const subtotal = purchaseRate + expense + makingPacking + deliveryCharge + franchiseCharge + franchisePool + generalPool;
        const gstAmount = (subtotal * gst) / 100;
        const totalAmount = subtotal + gstAmount;

        const product = new Product({
            name: req.body.name,
            category: req.body.category,
            gram: req.body.gram,
            size: req.body.size,
            purchaseRate,
            expense,
            makingPacking,
            deliveryCharge,
            franchiseCharge,
            franchisePool,
            generalPool,
            gst,
            totalAmount,
            image: req.file?.filename
        });

        await product.save();
        res.json({ success: true, product });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin - Approve/Reject Fund Request
app.post('/api/admin/fund-request/:id/:action', adminMiddleware, async (req, res) => {
    try {
        const { id, action } = req.params;
        
        const fundRequest = await FundRequest.findById(id);
        if (!fundRequest) {
            return res.status(404).json({ error: 'Fund request not found' });
        }

        fundRequest.status = action === 'approve' ? 'approved' : 'rejected';
        await fundRequest.save();

        if (action === 'approve') {
            const user = await User.findOne({ userId: fundRequest.userId });
            if (user) {
                user.wallet += fundRequest.amount;
                await user.save();
            }
        }

        res.json({ success: true, message: `Fund request ${action}d successfully` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin - Add/Deduct Wallet
app.post('/api/admin/wallet/:userId/:action', adminMiddleware, async (req, res) => {
    try {
        const { userId, action } = req.params;
        const { amount } = req.body;

        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        if (action === 'add') {
            user.wallet += parseFloat(amount);
        } else {
            user.wallet -= parseFloat(amount);
        }

        await user.save();
        res.json({ success: true, message: `Wallet ${action}ed successfully` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin - Approve/Reject Payout
app.post('/api/admin/payout/:id/:action', adminMiddleware, async (req, res) => {
    try {
        const { id, action } = req.params;
        
        const payout = await Payout.findById(id);
        if (!payout) {
            return res.status(404).json({ error: 'Payout not found' });
        }

        // Check if previous payout pending
        const previousPayout = await Payout.findOne({
            userId: payout.userId,
            status: 'pending',
            _id: { $ne: id }
        });

        if (previousPayout) {
            return res.status(400).json({ error: 'Previous payout pending' });
        }

        payout.status = action === 'approve' ? 'approved' : 'rejected';
        await payout.save();

        if (action === 'reject') {
            const user = await User.findOne({ userId: payout.userId });
            if (user) {
                user.wallet += payout.netAmount;
                await user.save();
            }
        }

        res.json({ success: true, message: `Payout ${action}d successfully` });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin - Update Settings
app.post('/api/admin/settings', adminMiddleware, async (req, res) => {
    try {
        const { key, value } = req.body;
        
        let setting = await Settings.findOne({ key });
        if (setting) {
            setting.value = value;
            setting.updatedAt = new Date();
        } else {
            setting = new Settings({ key, value });
        }

        await setting.save();
        res.json({ success: true, message: 'Settings updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// User - Request Payout
app.post('/api/request-payout', authMiddleware, async (req, res) => {
    try {
        const { amount } = req.body;
        const user = await User.findOne({ userId: req.userId });

        const settings = await Settings.findOne({ key: 'payoutSettings' });
        const minPayout = settings?.value?.minPayout || 100;
        const maxPayout = settings?.value?.maxPayout || 10000;
        const adminCharge = settings?.value?.adminCharge || 5;
        const gst = settings?.value?.gst || 18;

        if (amount < minPayout || amount > maxPayout) {
            return res.status(400).json({ error: `Amount must be between ${minPayout} and ${maxPayout}` });
        }

        if (user.wallet < amount) {
            return res.status(400).json({ error: 'Insufficient balance' });
        }

        // Check if previous payout pending
        const previousPayout = await Payout.findOne({
            userId: user.userId,
            status: 'pending'
        });

        if (previousPayout) {
            return res.status(400).json({ error: 'Previous payout pending' });
        }

        const adminChargeAmount = (amount * adminCharge) / 100;
        const gstAmount = (amount * gst) / 100;
        const netAmount = amount - adminChargeAmount - gstAmount;

        user.wallet -= amount;

        const payout = new Payout({
            userId: user.userId,
            amount,
            adminCharge: adminChargeAmount,
            gst: gstAmount,
            netAmount
        });

        await payout.save();
        await user.save();

        res.json({ success: true, message: 'Payout requested successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Send Message
app.post('/api/send-message', authMiddleware, upload.single('file'), async (req, res) => {
    try {
        const { toUserId, message, type } = req.body;

        const messageData = {
            fromUserId: req.userId,
            toUserId,
            message,
            type: type || 'text'
        };

        if (req.file) {
            messageData.fileUrl = req.file.filename;
        }

        const newMessage = new Message(messageData);
        await newMessage.save();

        // Emit to receiver if online
        io.to(toUserId).emit('newMessage', newMessage);

        res.json({ success: true, message: 'Message sent successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Messages
app.get('/api/messages/:userId', authMiddleware, async (req, res) => {
    try {
        const messages = await Message.find({
            $or: [
                { fromUserId: req.userId, toUserId: req.params.userId },
                { fromUserId: req.params.userId, toUserId: req.userId }
            ]
        }).sort({ createdAt: -1 });

        res.json(messages);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update Profile
app.post('/api/update-profile', authMiddleware, async (req, res) => {
    try {
        const { username, birthDate, anniversaryDate } = req.body;

        const user = await User.findOne({ userId: req.userId });
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        user.username = username || user.username;
        user.birthDate = birthDate || user.birthDate;
        user.anniversaryDate = anniversaryDate || user.anniversaryDate;

        await user.save();

        res.json({ success: true, message: 'Profile updated successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get Dashboard Data
app.get('/api/dashboard', authMiddleware, async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.userId });
        
        // Get today's purchases
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        const todayPurchases = await Purchase.find({
            userId: req.userId,
            createdAt: { $gte: today }
        });

        // Get today's income
        const todayIncome = await Income.find({
            userId: req.userId,
            createdAt: { $gte: today }
        });

        // Get active deliveries (for delivery code display)
        const activeDeliveries = await Purchase.find({
            userId: req.userId,
            deliveryStatus: 'out_for_delivery'
        });

        // Get best performer of the day
        const bestPerformer = await Purchase.aggregate([
            { $match: { createdAt: { $gte: today } } },
            { $group: { _id: "$userId", total: { $sum: "$totalAmount" } } },
            { $sort: { total: -1 } },
            { $limit: 1 },
            { $lookup: { from: "users", localField: "_id", foreignField: "userId", as: "user" } }
        ]);

        // Get best earner of the day
        const bestEarner = await Income.aggregate([
            { $match: { createdAt: { $gte: today } } },
            { $group: { _id: "$userId", total: { $sum: "$amount" } } },
            { $sort: { total: -1 } },
            { $limit: 1 },
            { $lookup: { from: "users", localField: "_id", foreignField: "userId", as: "user" } }
        ]);

        // Get birthdays and anniversaries today
        const todayBirthdays = await User.find({
            $expr: {
                $and: [
                    { $eq: [{ $dayOfMonth: "$birthDate" }, today.getDate()] },
                    { $eq: [{ $month: "$birthDate" }, today.getMonth() + 1] }
                ]
            }
        });

        const todayAnniversaries = await User.find({
            $expr: {
                $and: [
                    { $eq: [{ $dayOfMonth: "$anniversaryDate" }, today.getDate()] },
                    { $eq: [{ $month: "$anniversaryDate" }, today.getMonth() + 1] }
                ]
            }
        });

        res.json({
            user,
            todayPurchases: todayPurchases.length,
            todayIncome: todayIncome.reduce((sum, i) => sum + i.amount, 0),
            bestPerformer: bestPerformer[0] || null,
            bestEarner: bestEarner[0] || null,
            todayBirthdays,
            todayAnniversaries,
            activeDeliveries: activeDeliveries.length
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Socket.io for real-time messaging
io.on('connection', (socket) => {
    socket.on('join', (userId) => {
        socket.join(userId);
    });

    socket.on('sendMessage', (data) => {
        io.to(data.toUserId).emit('newMessage', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// ==================== HTML ROUTES ====================

// Serve HTML files
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/admin-login', (req, res) => res.sendFile(path.join(__dirname, 'admin-login.html')));
app.get('/admin-dashboard', (req, res) => res.sendFile(path.join(__dirname, 'admin-dashboard.html')));
app.get('/user-login', (req, res) => res.sendFile(path.join(__dirname, 'user-login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'register.html')));
app.get('/forgot-id-password', (req, res) => res.sendFile(path.join(__dirname, 'Forgot-id-password.html')));
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'dashboard.html')));
app.get('/profile', (req, res) => res.sendFile(path.join(__dirname, 'profile.html')));
app.get('/wallet', (req, res) => res.sendFile(path.join(__dirname, 'wallet.html')));
app.get('/products', (req, res) => res.sendFile(path.join(__dirname, 'products.html')));
app.get('/franchise', (req, res) => res.sendFile(path.join(__dirname, 'franchise.html')));
app.get('/pool', (req, res) => res.sendFile(path.join(__dirname, 'pool.html')));
app.get('/payout', (req, res) => res.sendFile(path.join(__dirname, 'payout.html')));
app.get('/add-fund', (req, res) => res.sendFile(path.join(__dirname, 'add-fund.html')));
app.get('/activate-id', (req, res) => res.sendFile(path.join(__dirname, 'activate-id.html')));
app.get('/purchase', (req, res) => res.sendFile(path.join(__dirname, 'purchase.html')));
app.get('/delivery', (req, res) => res.sendFile(path.join(__dirname, 'delivery.html')));
app.get('/income', (req, res) => res.sendFile(path.join(__dirname, 'income.html')));
app.get('/notifications', (req, res) => res.sendFile(path.join(__dirname, 'notifications.html')));
app.get('/user-message', (req, res) => res.sendFile(path.join(__dirname, 'user-message.html')));
app.get('/admin-message', (req, res) => res.sendFile(path.join(__dirname, 'admin-message.html')));
app.get('/invoice', (req, res) => res.sendFile(path.join(__dirname, 'invoice.html')));

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Create uploads directory if not exists
const fs = require('fs');
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
}

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Lira server running on port ${PORT}`);
});
