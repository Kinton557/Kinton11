const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const PUBLIC_KEY = process.env.PAYONIFY_PUBLIC_KEY;
const SECRET_KEY = process.env.PAYONIFY_SECRET_KEY;

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Payonify EcoCash Backend"
  });
});

app.post("/create-payment", async (req, res) => {
  try {
    if (!PUBLIC_KEY || !SECRET_KEY) {
      return res.status(500).json({
        error: "Payonify keys are not configured on the server."
      });
    }

    const { amount, phone } = req.body;

    if (!amount || !phone) {
      return res.status(400).json({
        error: "Amount and phone number are required."
      });
    }

    const amountInCents = Math.round(Number(amount) * 100);

    const auth = Buffer
      .from(`${PUBLIC_KEY}:${SECRET_KEY}`)
      .toString("base64");

    const response = await fetch(
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

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    res.json(data);

  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Payment request failed.",
      message: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
