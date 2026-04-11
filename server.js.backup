const express = require("express");
const cors = require("cors");
const http = require("http");
const mongoose = require("mongoose");
const { Server } = require("socket.io");

const app = express();

/* ================= MIDDLEWARE ================= */
app.use(cors());
app.use(express.json());

/* ================= MONGO STABLE FIX ================= */
const MONGO_URI =
"mongodb+srv://Kingsley_Kekeli:dbPassword%24@cluster0.qgbdn7x.mongodb.net/foodapp?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI, {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  family: 4
})
.then(() => console.log("🚀 MongoDB Connected Stable"))
.catch(err => console.log("❌ MongoDB Error:", err.message));

mongoose.connection.on("disconnected", () => {
  console.log("⚠️ MongoDB disconnected...");
});

mongoose.connection.on("reconnected", () => {
  console.log("✅ MongoDB reconnected");
});

mongoose.connection.on("error", (err) => {
  console.log("❌ MongoDB runtime error:", err.message);
});

/* ================= SCHEMAS ================= */
const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  role: { type: String, default: "user" },
  createdAt: { type: Date, default: Date.now }
});

const foodSchema = new mongoose.Schema({
  name: String,
  price: Number
});

const orderSchema = new mongoose.Schema({
  customerName: String,
  location: String,
  paymentMethod: String,
  items: Array,
  total: Number
});

const User = mongoose.model("User", userSchema);
const Food = mongoose.model("Food", foodSchema);
const Order = mongoose.model("Order", orderSchema);

/* ================= SERVER + SOCKET ================= */
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*" }
});

io.on("connection", () => {
  console.log("⚡ Client connected");
});

/* ================= SEED DATA ================= */
async function seed() {
  try {
    const foodCount = await Food.countDocuments();

    if (foodCount === 0) {
      await Food.insertMany([
        { name: "Burger", price: 25 },
        { name: "Pizza", price: 40 },
        { name: "Rice Bowl", price: 20 }
      ]);
    }

    const admin = await User.findOne({ email: "admin@app.com" });

    if (!admin) {
      await User.create({
        email: "admin@app.com",
        password: "1234",
        role: "admin"
      });
    }

    console.log("🌱 Seed complete");
  } catch (err) {
    console.log("Seed error:", err.message);
  }
}
seed();

/* ================= AUTH ================= */
app.post("/api/signup", async (req, res) => {
  try {
    const { email, password } = req.body;

    const exists = await User.findOne({ email });
    if (exists) return res.status(400).json({ message: "User exists" });

    const user = await User.create({ email, password });

    res.json(user);
  } catch (err) {
    console.log(err.message);
    res.status(500).json({ message: "Signup error" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email, password });

    if (!user) {
      return res.status(401).json({ message: "Invalid login" });
    }

    res.json({
      email: user.email,
      role: user.role
    });

  } catch (err) {
    console.log(err.message);
    res.status(500).json({ message: "Login error" });
  }
});

app.post("/api/change-password", async (req, res) => {
  try {
    const { email, oldPassword, newPassword } = req.body;

    const user = await User.findOne({ email, password: oldPassword });

    if (!user) {
      return res.status(400).json({ message: "Old password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    res.json({ message: "Password updated successfully" });

  } catch (err) {
    res.status(500).json({ message: "Error changing password" });
  }
});

/* ================= USERS ================= */
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}, "-password");
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Users error" });
  }
});

/* ================= FOODS ================= */
app.get("/api/foods", async (req, res) => {
  try {
    const foods = await Food.find();
    res.json(foods);
  } catch (err) {
    res.status(500).json({ message: "Foods error" });
  }
});

/* ================= ORDERS ================= */
app.get("/api/users", async (req, res) => {
  try {
    const users = await User.find({}, "-password"); // removes password field safely

    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Users error" });
  }
});

app.put("/api/order/:id", async (req, res) => {
  try {
    const { status } = req.body;

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true }
    );

    res.json(order);
  } catch (err) {
    res.status(500).json({ message: "Update failed" });
  }
});

/* ================= START SERVER ================= */
const PORT = process.env.PORT || 3000;

server.listen(PORT, "0.0.0.0", () => {
  console.log("🚀 Server running on port " + PORT);
});
