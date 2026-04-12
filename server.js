const express = require("express");
const cors = require("cors");
const http = require("http");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const axios = require("axios");
const { Server } = require("socket.io");

const JWT_SECRET = process.env.JWT_SECRET || "chopspot_super_secret_jwt_key_2024_kingsley";
const MONGO_URI  = process.env.MONGO_URI  || "mongodb+srv://Kingsley_Kekeli:dbPassword%24@cluster0.qgbdn7x.mongodb.net/foodapp?retryWrites=true&w=majority";
const EMAIL_USER = process.env.EMAIL_USER || "";
const EMAIL_PASS = process.env.EMAIL_PASS || "";
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET || "sk_test_f8c72938263bab20bc65e734d2c24fbd3ab74324";const ADMIN_EMAIL     = process.env.ADMIN_EMAIL     || "admin@foodapp.com";
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || "Admin1234!";
const FRONTEND_URL    = process.env.FRONTEND_URL    || "https://kingsleyahiagbenyo45-beep.github.io/food-app-frontend";

const app = express();
app.use(cors());
app.use(express.json());

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  family: 4
})
.then(() => console.log("🚀 MongoDB Connected"))
.catch(err => console.log("❌ MongoDB Error:", err.message));

mongoose.connection.on("disconnected", () => console.log("⚠️ MongoDB disconnected..."));
mongoose.connection.on("reconnected",  () => console.log("✅ MongoDB reconnected"));
mongoose.connection.on("error", (err)  => console.log("❌ MongoDB error:", err.message));

const userSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true, trim: true },
  password:  { type: String, required: true },
  role:      { type: String, default: "user", enum: ["user", "admin"] },
  createdAt: { type: Date, default: Date.now }
});

const foodSchema = new mongoose.Schema({
  name:        { type: String, required: true },
  price:       { type: Number, required: true },
  category:    { type: String, default: "General" },
  description: { type: String, default: "" },
  image:       { type: String, default: "" },
  inStock:     { type: Boolean, default: true },
  quantity:    { type: Number, default: 100 }
});

const orderSchema = new mongoose.Schema({
  customerName:  { type: String, required: true },
  customerEmail: { type: String, default: "" },
  location:      { type: String, required: true },
  paymentMethod: { type: String, default: "Cash" },
  paymentStatus: { type: String, default: "pending", enum: ["pending", "paid", "failed"] },
  paystackRef:   { type: String, default: "" },
  items:         { type: Array, default: [] },
  total:         { type: Number, required: true },
  status:        { type: String, default: "pending", enum: ["pending", "processing", "ready", "delivered", "cancelled"] },
  createdAt:     { type: Date, default: Date.now }
});

const User  = mongoose.model("User",  userSchema);
const Food  = mongoose.model("Food",  foodSchema);
const Order = mongoose.model("Order", orderSchema);

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function adminMiddleware(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
}

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

async function sendOrderEmail(to, order) {
  try {
    if (!EMAIL_USER || !EMAIL_PASS) return;
    const itemsList = order.items.map(i => `• ${i.name} — ₵${i.price}`).join("\n");
    await transporter.sendMail({
      from: `"🍔 ChopSpot" <${EMAIL_USER}>`,
      to,
      subject: `Order Confirmed — ₵${order.total}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:30px;border:1px solid #eee;border-radius:12px;">
          <h2 style="color:#e85d04;">🍔 Order Confirmed!</h2>
          <p>Hi <b>${order.customerName}</b>, your order has been received.</p>
          <hr/>
          <h3>Order Summary</h3>
          <pre style="background:#f9f9f9;padding:12px;border-radius:8px;">${itemsList}</pre>
          <p><b>Total:</b> ₵${order.total}</p>
          <p><b>Delivery to:</b> ${order.location}</p>
          <p><b>Payment:</b> ${order.paymentMethod}</p>
          <hr/>
          <p style="color:#888;font-size:12px;">Thank you for ordering with us!</p>
        </div>
      `
    });
  } catch (err) {
    console.log("Email error:", err.message);
  }
}

async function sendStatusEmail(to, order) {
  try {
    if (!EMAIL_USER || !EMAIL_PASS) return;
    const statusColors = { processing: "#f48c06", ready: "#2d6cdf", delivered: "#2dc653", cancelled: "#e63946" };
    const color = statusColors[order.status] || "#888";
    await transporter.sendMail({
      from: `"🍔 ChopSpot" <${EMAIL_USER}>`,
      to,
      subject: `Order Update — ${order.status.toUpperCase()}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:30px;border:1px solid #eee;border-radius:12px;">
          <h2 style="color:${color};">Order Status Update</h2>
          <p>Hi <b>${order.customerName}</b>, your order status has changed.</p>
          <div style="background:${color};color:white;padding:16px;border-radius:10px;text-align:center;font-size:20px;font-weight:bold;">
            ${order.status.toUpperCase()}
          </div>
        </div>
      `
    });
  } catch (err) {
    console.log("Status email error:", err.message);
  }
}

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

io.on("connection", (socket) => {
  console.log("⚡ Client connected:", socket.id);
  socket.on("disconnect", () => console.log("🔌 Client disconnected:", socket.id));
});

async function seed() {
  try {
    const foodCount = await Food.countDocuments();
    if (foodCount === 0) {
      await Food.insertMany([
        { name: "Jollof Rice",     price: 25, category: "Rice",       description: "Smoky West African jollof rice",    inStock: true, quantity: 50 },
        { name: "Fufu & Soup",     price: 30, category: "Traditional", description: "Pounded fufu with light soup",      inStock: true, quantity: 30 },
        { name: "Fried Rice",      price: 22, category: "Rice",       description: "Seasoned fried rice with veggies",  inStock: true, quantity: 40 },
        { name: "Grilled Chicken", price: 45, category: "Protein",    description: "Juicy grilled chicken quarters",    inStock: true, quantity: 20 },
        { name: "Waakye",          price: 18, category: "Traditional", description: "Rice and beans with shito",         inStock: true, quantity: 60 },
        { name: "Burger",          price: 35, category: "Fast Food",  description: "Beef burger with chips",            inStock: true, quantity: 25 }
      ]);
      console.log("🌱 Foods seeded");
    }
    const adminExists = await User.findOne({ email: ADMIN_EMAIL });
    if (!adminExists) {
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 12);
      await User.create({ email: ADMIN_EMAIL, password: hashed, role: "admin" });
      console.log("🌱 Admin seeded");
    }
  } catch (err) {
    console.log("Seed error:", err.message);
  }
}
seed();

app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    if (password.length < 6)  return res.status(400).json({ message: "Password must be at least 6 characters" });
    const exists = await User.findOne({ email: email.toLowerCase() });
    if (exists) return res.status(400).json({ message: "Email already registered" });
    const hashed = await bcrypt.hash(password, 12);
    const user   = await User.create({ email: email.toLowerCase(), password: hashed });
    const token  = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.status(201).json({ token, email: user.email, role: user.role });
  } catch (err) {
    console.log("Signup error:", err.message);
    res.status(500).json({ message: "Signup error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Email and password required" });
    const user  = await User.findOne({ email: email.toLowerCase() });
    if (!user)  return res.status(401).json({ message: "Invalid email or password" });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(401).json({ message: "Invalid email or password" });
    const token = jwt.sign({ id: user._id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, email: user.email, role: user.role });
  } catch (err) {
    console.log("Login error:", err.message);
    res.status(500).json({ message: "Login error" });
  }
});

app.post("/api/change-password", authMiddleware, async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    if (!oldPassword || !newPassword) return res.status(400).json({ message: "All fields required" });
    if (newPassword.length < 6)       return res.status(400).json({ message: "New password too short" });
    const user  = await User.findById(req.user.id);
    const valid = await bcrypt.compare(oldPassword, user.password);
    if (!valid) return res.status(400).json({ message: "Old password incorrect" });
    user.password = await bcrypt.hash(newPassword, 12);
    await user.save();
    res.json({ message: "Password updated successfully" });
  } catch (err) {
    res.status(500).json({ message: "Error changing password" });
  }
});

app.post("/api/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) return res.status(404).json({ message: "Email not found" });
    const tempPass = Math.random().toString(36).slice(-8);
    user.password  = await bcrypt.hash(tempPass, 12);
    await user.save();
    if (EMAIL_USER && EMAIL_PASS) {
      await transporter.sendMail({
        from: `"🍔 ChopSpot" <${EMAIL_USER}>`,
        to: email,
        subject: "Password Reset",
        html: `
          <div style="font-family:Arial,sans-serif;max-width:500px;margin:auto;padding:30px;border:1px solid #eee;border-radius:12px;">
            <h2>Password Reset</h2>
            <p>Your temporary password is:</p>
            <div style="font-size:24px;font-weight:bold;background:#f4f6f9;padding:16px;border-radius:8px;letter-spacing:4px;text-align:center;">${tempPass}</div>
            <p style="margin-top:16px;color:#888;">Please login and change your password immediately.</p>
          </div>
        `
      });
    }
    res.json({ message: "Temporary password sent to your email" });
  } catch (err) {
    res.status(500).json({ message: "Error sending reset email" });
  }
});

app.get("/api/users", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const users = await User.find({}, "-password").sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error fetching users" });
  }
});

app.delete("/api/users/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: "User deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting user" });
  }
});

app.get("/api/foods", async (req, res) => {
  try {
    const foods = await Food.find().sort({ category: 1, name: 1 });
    res.json(foods);
  } catch (err) {
    res.status(500).json({ message: "Error fetching foods" });
  }
});

app.post("/api/foods", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { name, price, category, description, image, quantity } = req.body;
    if (!name || !price) return res.status(400).json({ message: "Name and price required" });
    const food = await Food.create({ name, price, category, description, image, quantity: quantity || 100 });
    res.status(201).json(food);
  } catch (err) {
    res.status(500).json({ message: "Error creating food" });
  }
});

app.put("/api/foods/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const food = await Food.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(food);
  } catch (err) {
    res.status(500).json({ message: "Error updating food" });
  }
});

app.delete("/api/foods/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Food.findByIdAndDelete(req.params.id);
    res.json({ message: "Food deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting food" });
  }
});

app.get("/api/orders", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    res.status(500).json({ message: "Error fetching orders" });
  }
});

app.post("/api/order", authMiddleware, async (req, res) => {
  try {
    const { customerName, customerEmail, location, paymentMethod, items, total } = req.body;
    if (!customerName || !location || !items?.length || !total) {
      return res.status(400).json({ message: "Missing order details" });
    }
    const order = await Order.create({
      customerName,
      customerEmail: customerEmail || req.user.email,
      location,
      paymentMethod: paymentMethod || "Cash",
      items,
      total,
      status: "pending",
      paymentStatus: "pending"
    });
    io.emit("newOrder", order);
    if (order.customerEmail) sendOrderEmail(order.customerEmail, order);
    res.status(201).json(order);
  } catch (err) {
    console.log("Order error:", err.message);
    res.status(500).json({ message: "Error placing order" });
  }
});

app.put("/api/order/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { status }, { new: true });
    io.emit("orderUpdated", order);
    if (order.customerEmail) sendStatusEmail(order.customerEmail, order);
    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

app.delete("/api/order/:id", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: "Order deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting order" });
  }
});

app.get("/api/analytics", authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const totalOrders = await Order.countDocuments();
    const totalUsers  = await User.countDocuments({ role: "user" });
    const totalFoods  = await Food.countDocuments();
    const revenueResult = await Order.aggregate([
      { $match: { status: { $ne: "cancelled" } } },
      { $group: { _id: null, total: { $sum: "$total" } } }
    ]);
    const totalRevenue = revenueResult[0]?.total || 0;
    const last7Days = await Order.aggregate([
      { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, status: { $ne: "cancelled" } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } }, revenue: { $sum: "$total" }, orders: { $sum: 1 } } },
      { $sort: { _id: 1 } }
    ]);
    const statusBreakdown = await Order.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } }
    ]);
    const topItems = await Order.aggregate([
      { $unwind: "$items" },
      { $group: { _id: "$items.name", count: { $sum: 1 }, revenue: { $sum: "$items.price" } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    res.json({ totalOrders, totalUsers, totalFoods, totalRevenue, last7Days, statusBreakdown, topItems });
  } catch (err) {
    res.status(500).json({ message: "Analytics error" });
  }
});

app.post("/api/paystack/initialize", authMiddleware, async (req, res) => {
  try {
    const { email, amount, orderId } = req.body;
    const response = await axios.post(
      "https://api.paystack.co/transaction/initialize",
      {
        email,
        amount: Math.round(amount * 100),
        currency: "GHS",
        reference: `FOOD-${orderId}-${Date.now()}`,
        callback_url: `${FRONTEND_URL}/payment-success.html`,
        metadata: { orderId }
      },
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}`, "Content-Type": "application/json" } }
    );
    res.json(response.data.data);
  } catch (err) {
    console.log("Paystack error:", err.response?.data || err.message);
    res.status(500).json({ message: "Payment initialization failed" });
  }
});

app.get("/api/paystack/verify/:reference", authMiddleware, async (req, res) => {
  try {
    const response = await axios.get(
      `https://api.paystack.co/transaction/verify/${req.params.reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );
    const data = response.data.data;
    if (data.status === "success") {
      const orderId = data.metadata?.orderId;
      if (orderId) await Order.findByIdAndUpdate(orderId, { paymentStatus: "paid", paystackRef: req.params.reference });
      res.json({ verified: true, data });
    } else {
      res.json({ verified: false });
    }
  } catch (err) {
    res.status(500).json({ message: "Verification failed" });
  }
});

app.get("/", (req, res) => res.json({ status: "🚀 ChopSpot API running", version: "2.0.0" }));

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`🚀 Server running on port ${PORT}`));
