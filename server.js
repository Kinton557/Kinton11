const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const PUBLIC_KEY = process.env.PAYONIFY_PUBLIC_KEY;
const SECRET_KEY = process.env.PAYONIFY_SECRET_KEY;

// Health check
app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Payonify EcoCash Backend"
  });
});

// Create EcoCash payment
app.post("/create-payment", async (req, res) => {
  try {
    // Check Payonify keys
    if (!PUBLIC_KEY || !SECRET_KEY) {
      return res.status(500).json({
        error: "Payonify keys are not configured on the server."
      });
    }

    const { amount, phone } = req.body;

    // Validate input
    if (!amount || !phone) {
      return res.status(400).json({
        error: "Amount and phone number are required."
      });
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        error: "Invalid payment amount."
      });
    }

    // Payonify expects the smallest currency unit.
    const amountInCents = Math.round(numericAmount * 100);

    if (amountInCents < 100) {
      return res.status(400).json({
        error: "Minimum payment amount is $1.00."
      });
    }

    // Basic authentication
    const auth = Buffer
      .from(`${PUBLIC_KEY}:${SECRET_KEY}`)
      .toString("base64");

    // Send request to Payonify
    const payonifyResponse = await fetch(
      "https://api.payonify.com/v1/charges",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json",
          "Authorization": `Basic ${auth}`
        },

        body: JSON.stringify({
          amount: amountInCents,
          currency: "usd",
          source: "web",
          description: "EcoCash Website Payment",

          payment_method: {
            mobile_money: {
              ecocash: {
                mobile_number: phone
              }
            }
          },

          confirm: true
        })
      }
    );

    // Read as text first so HTML responses don't crash JSON parsing
    const responseText = await payonifyResponse.text();

    let data;

    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error(
        "Payonify returned non-JSON:",
        responseText.substring(0, 500)
      );

      return res.status(502).json({
        error: "Payonify returned an unexpected response.",
        payonify_status: payonifyResponse.status,
        response: responseText.substring(0, 500)
      });
    }

    // Payonify returned an API error
    if (!payonifyResponse.ok) {
      console.error("Payonify API error:", data);

      return res.status(payonifyResponse.status).json({
        error:
          data.error ||
          data.message ||
          "Payonify payment request failed.",
        details: data
      });
    }

    // Successful charge creation
    console.log("Payonify payment created:", data);

    return res.json(data);

  } catch (error) {
    console.error("Server error:", error);

    return res.status(500).json({
      error: "Payment request failed.",
      message: error.message
    });
  }
});

// Handle unknown routes with JSON instead of HTML
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found.",
    path: req.path
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
