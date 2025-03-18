const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const nodemailer = require("nodemailer");
const axios = require("axios"); // Ensure axios is required
const cron = require("node-cron");
const bodyParser = require("body-parser");
require("dotenv").config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

const PORT = process.env.PORT || 5000;

// Database Connection
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

// Medicine Schema
const medicineSchema = new mongoose.Schema({
  name: String,
  quantity: Number,
  threshold: Number,
  history: [
    {
      amountTaken: { type: Number, default: 0 },
      amountRestocked: { type: Number, default: 0 },
      date: { type: Date, default: Date.now },
    },
  ],
});

const Medicine = mongoose.model("Medicine", medicineSchema);

// 🚀 Routes
app.get("/api/medicines", async (req, res) => {
  const medicines = await Medicine.find();
  res.json(medicines);
});

app.post("/api/medicines", async (req, res) => {
  const { name, quantity, threshold } = req.body;
  const newMedicine = new Medicine({ name, quantity, threshold });
  await newMedicine.save();
  res.json(newMedicine);
});

app.put("/api/medicines/:id", async (req, res) => {
  const { amountTaken, amountRestocked } = req.body;
  const medicine = await Medicine.findById(req.params.id);

  if (!medicine) {
    return res.status(404).json({ error: "Medicine not found" });
  }

  if (amountTaken) {
    medicine.quantity -= parseInt(amountTaken);
    medicine.history.push({ amountTaken: parseInt(amountTaken), amountRestocked: 0, date: new Date() });
  }

  if (amountRestocked) {
    medicine.quantity += parseInt(amountRestocked);
    medicine.history.push({ amountTaken: 0, amountRestocked: parseInt(amountRestocked), date: new Date() });
  }

  await medicine.save();

  if (medicine.quantity < medicine.threshold) {
    await sendAlert(medicine);
  }

  res.json(medicine);
});

app.delete("/api/medicines/:id", async (req, res) => {
  await Medicine.findByIdAndDelete(req.params.id);
  res.json({ message: "Medicine deleted" });
});

const sendAlert = async (medicine) => {
  const { name, quantity } = medicine;

  try {
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: process.env.ALERT_EMAIL,
      subject: `Low Stock Alert: ${name}`,
      text: `The stock for ${name} is low. Only ${quantity} left.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`📧 Email sent for ${name}`);
  } catch (error) {
    console.error(`❌ Email failed for ${name}:`, error);
  }

  try {
    const message = `🚨 Low Stock Alert: ${name} - Only ${quantity} left!`;
    const whatsappUrl = `https://api.callmebot.com/whatsapp.php?phone=${process.env.ALERT_PHONE}&text=${encodeURIComponent(
      message
    )}&apikey=${process.env.CALLMEBOT_API_KEY}`;

    const response = await axios.get(whatsappUrl);
    console.log(`📱 WhatsApp Alert sent: ${response.data}`);
  } catch (error) {
    console.error(`❌ WhatsApp Alert failed:`, error);
  }
};

module.exports = app;
