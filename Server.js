// server.js — Full-stack Single File SMGPUB

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const path = require("path");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const Stripe = require("stripe");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/uploads", express.static("uploads"));

// --- ENV ---
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;

// --- MONGO ---
const client = new MongoClient(MONGO_URI, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true },
});
let db;
async function connectDB() {
  if (db) return db;
  await client.connect();
  db = client.db("smgpub");
  await db.command({ ping: 1 });
  console.log("✅ MongoDB Connected");
  return db;
}

// --- MIDDLEWARES ---
const authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

const storage = multer.diskStorage({
  destination: "uploads/",
  filename: (_, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// --- STRIPE ---
const stripe = Stripe(STRIPE_SECRET_KEY);

// --- FRONTEND HTML ---
const frontendHTML = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>SMGPUB℠ | Music Publishing & Licensing</title>
<style>
body { font-family: Arial, sans-serif; background:#0b0b12; color:#fff; margin:0; padding:0; }
header { background:#161625; padding:20px; display:flex; justify-content:space-between; align-items:center; }
header a { color:#fff; margin-left:20px; text-decoration:none; }
section { padding:50px; max-width:900px; margin:auto; }
.btn { padding:10px 20px; background:#37d0ff; border:none; cursor:pointer; color:#000; font-weight:bold; margin-top:10px; }
</style>
</head>
<body>
<header>
<div>SMGPUB℠</div>
<nav>
<a href="#home">Home</a>
<a href="#beats">Beats</a>
<a href="#membership">Membership</a>
<a href="#login">Login</a>
</nav>
</header>

<section id="home">
<h1>Welcome to SMGPUB℠</h1>
<p>Global music publishing, beat licensing, and creator tools.</p>
</section>

<section id="beats">
<h2>Beats</h2>
<div id="beatList"></div>
</section>

<section id="membership">
<h2>Membership</h2>
<button class="btn" onclick="subscribe()">Subscribe</button>
</section>

<section id="login">
<h2>Login</h2>
<input id="email" placeholder="Email"><br>
<input id="password" placeholder="Password" type="password"><br>
<button class="btn" onclick="login()">Login</button>
</section>

<script>
const API = "";

async function fetchBeats() {
  const res = await fetch("/api/beats");
  const beats = await res.json();
  const container = document.getElementById("beatList");
  container.innerHTML = beats.map(b => '<div>'+b.title+' - $'+b.price+'</div>').join("");
}
fetchBeats();

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;
  const res = await fetch("/api/auth/login", {
    method:"POST", headers:{ "Content-Type":"application/json" },
    body:JSON.stringify({ email, password })
  });
  const data = await res.json();
  localStorage.setItem("token", data.token);
  alert("Logged in");
}

async function subscribe() {
  const res = await fetch("/api/stripe/subscribe", { method:"POST" });
  const data = await res.json();
  window.location.href = data.url;
}
</script>
</body>
</html>
`;

// --- ROUTES ---
// Serve frontend
app.get("/", (_, res) => res.send(frontendHTML));

// AUTH
app.post("/api/auth/register", async (req, res) => {
  const { email, password } = req.body;
  const users = (await connectDB()).collection("users");
  if (await users.findOne({ email })) return res.status(400).json({ message: "User exists" });
  const hash = await bcrypt.hash(password, 10);
  const result = await users.insertOne({ email, password: hash, membership:"starter", createdAt:new Date() });
  const token = jwt.sign({ id: result.insertedId }, JWT_SECRET);
  res.json({ token });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body;
  const users = (await connectDB()).collection("users");
  const user = await users.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) return res.status(400).json({ message:"Invalid login" });
  const token = jwt.sign({ id: user._id }, JWT_SECRET);
  res.json({ token });
});

// BEATS
app.get("/api/beats", async (_, res) => {
  const beats = (await connectDB()).collection("beats");
  res.json(await beats.find().toArray());
});

app.post("/api/beats", authMiddleware, upload.single("file"), async (req, res) => {
  const beats = (await connectDB()).collection("beats");
  const beat = { title:req.body.title, price:req.body.price, file:req.file.filename, createdAt:new Date() };
  await beats.insertOne(beat);
  res.json(beat);
});

// UPLOAD
app.post("/api/upload", upload.single("file"), (_, res) => {
  res.json({ file: _.file.filename });
});

// STRIPE
app.post("/api/stripe/subscribe", async (_, res) => {
  const session = await stripe.checkout.sessions.create({
    mode:"subscription",
    line_items:[{ price: STRIPE_PRICE_ID, quantity:1 }],
    success_url:"https://smgpub.com/dashboard",
    cancel_url:"https://smgpub.com"
  });
  res.json({ url: session.url });
});

// ANALYTICS
app.get("/api/analytics/revenue", authMiddleware, async (_, res) => {
  const transactions = (await connectDB()).collection("transactions");
  const total = await transactions.aggregate([{ $group:{_id:null,sum:{$sum:"$amount"}}}]).toArray();
  res.json({ revenue: total[0]?.sum || 0 });
});

// --- START SERVER ---
connectDB().then(() => {
  app.listen(PORT, () => console.log("🚀 SMGPUB Fullstack Running on port " + PORT));
});
