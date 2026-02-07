// server.js
const express = require('express');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Stripe = require('stripe');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'supersecret';
const STRIPE_SECRET = process.env.STRIPE_SECRET || 'sk_test_yourkey';
const stripe = new Stripe(STRIPE_SECRET);

// MongoDB connection
const uri = process.env.MONGO_URI || "mongodb+srv://raysmpubl_db_user:RayBigg$183557@cluster0.z1jcvf2.mongodb.net/?appName=Cluster0";
const client = new MongoClient(uri, { serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true } });

let db;
async function connectDB() {
    await client.connect();
    db = client.db("smgpub");
    console.log("MongoDB connected");
}
connectDB().catch(console.error);

// Multer setup
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, './uploads/'),
    filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// --- AUTH ---
app.post('/api/auth/register', async (req, res) => {
    const { email, password } = req.body;
    const users = db.collection('users');
    const exist = await users.findOne({ email });
    if (exist) return res.status(400).json({ msg: "Email exists" });
    const hash = await bcrypt.hash(password, 10);
    const user = { email, password: hash, membership: null, createdAt: new Date() };
    const result = await users.insertOne(user);
    const token = jwt.sign({ id: result.insertedId }, JWT_SECRET);
    res.json({ token });
});

app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    const users = db.collection('users');
    const user = await users.findOne({ email });
    if (!user) return res.status(400).json({ msg: "User not found" });
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ msg: "Invalid password" });
    const token = jwt.sign({ id: user._id }, JWT_SECRET);
    res.json({ token });
});

// Middleware JWT
function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ msg: "Unauthorized" });
    try { req.user = jwt.verify(token, JWT_SECRET); next(); }
    catch { return res.status(401).json({ msg: "Invalid token" }); }
}

// --- BEATS CRUD ---
app.get('/api/beats', async (req, res) => {
    const beats = await db.collection('beats').find().toArray();
    res.json(beats);
});

app.post('/api/beats', authMiddleware, upload.single('file'), async (req, res) => {
    const { title, genre, bpm, key, price } = req.body;
    const beat = {
        title, genre, bpm, key, price,
        file: req.file.filename,
        createdAt: new Date(),
        owner: req.user.id
    };
    const result = await db.collection('beats').insertOne(beat);
    res.json(result);
});

// --- UPLOADS ---
app.post('/api/upload', authMiddleware, upload.single('file'), async (req, res) => {
    res.json({ file: req.file.filename });
});

// --- STRIPE SUBSCRIPTION ---
app.post('/api/stripe/subscribe', authMiddleware, async (req, res) => {
    const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${process.env.CLIENT_URL}/dashboard?success=true`,
        cancel_url: `${process.env.CLIENT_URL}/dashboard?canceled=true`,
        customer_email: req.body.email
    });
    res.json({ url: session.url });
});

// --- ANALYTICS ---
app.get('/api/analytics/revenue', authMiddleware, async (req, res) => {
    const txs = await db.collection('transactions').find({ userId: new ObjectId(req.user.id) }).toArray();
    const revenue = txs.reduce((sum, t) => sum + t.amount, 0);
    res.json({ revenue, transactions: txs });
});

// --- START SERVER ---
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`SMGPUB server running on port ${PORT}`));