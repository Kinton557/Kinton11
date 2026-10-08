const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 10000;

const PUBLIC_KEY = process.env.PAYONIFY_PUBLIC_KEY;
const SECRET_KEY = process.env.PAYONIFY_SECRET_KEY;

// Store processed webhook event IDs.
// Note: this resets if the Render service restarts.
const processedEvents = new Set();


// ========================================
// HEALTH CHECK
// ========================================

app.get("/", (req, res) => {
  res.json({
    status: "online",
    service: "Payonify EcoCash Backend"
  });
});


// ========================================
// CREATE PAYMENT
// ========================================

app.post("/create-payment", async (req, res) => {
  try {

    // Check Payonify credentials
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

    if (
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return res.status(400).json({
        error: "Invalid payment amount."
      });
    }

    // Convert USD to cents
    const amountInCents =
      Math.round(numericAmount * 100);

    if (amountInCents < 100) {
      return res.status(400).json({
        error: "Minimum payment amount is $1.00."
      });
    }

    // Basic authentication
    const auth = Buffer
      .from(`${PUBLIC_KEY}:${SECRET_KEY}`)
      .toString("base64");


    // Send payment request to Payonify
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

          description:
            "EcoCash Website Payment",

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


    // Read response safely
    const responseText =
      await payonifyResponse.text();

    let data;

    try {

      data =
        JSON.parse(responseText);

    } catch {

      console.error(
        "Payonify returned non-JSON:",
        responseText.substring(0, 500)
      );

      return res.status(502).json({
        error:
          "Payonify returned an unexpected response.",

        payonify_status:
          payonifyResponse.status,

        response:
          responseText.substring(0, 500)
      });
    }


    // Payonify API error
    if (!payonifyResponse.ok) {

      console.error(
        "Payonify API error:",
        data
      );

      return res.status(
        payonifyResponse.status
      ).json({

        error:
          data.error ||
          data.message ||
          "Payonify payment request failed.",

        details: data
      });
    }


    // Payment created
    console.log(
      "Payonify payment created:",
      data
    );

    return res.json(data);

  } catch (error) {

    console.error(
      "Payment server error:",
      error
    );

    return res.status(500).json({

      error:
        "Payment request failed.",

      message:
        error.message
    });
  }
});


// ========================================
// PAYONIFY WEBHOOK
// ========================================

app.post("/webhook/payonify", async (req, res) => {

  try {

    const event = req.body;


    // Make sure an event ID exists
    if (!event || !event.id) {

      return res.status(400).json({
        error: "Invalid webhook event."
      });
    }


    console.log(
      "Payonify webhook received:",
      event.type,
      event.id
    );


    // Prevent duplicate processing
    if (processedEvents.has(event.id)) {

      console.log(
        "Webhook already processed:",
        event.id
      );

      return res.status(200).json({
        received: true,
        duplicate: true
      });
    }


    // ====================================
    // CHARGE SUCCEEDED
    // ====================================

    if (
      event.type ===
      "charge.succeeded"
    ) {

      const charge =
        event.data?.object;

      console.log(
        "PAYMENT SUCCESSFUL"
      );

      console.log(
        "Charge ID:",
        charge?.id
      );

      console.log(
        "Amount:",
        charge?.amount
      );

      console.log(
        "Paid:",
        charge?.paid
      );

      console.log(
        "EcoCash Reference:",
        charge
          ?.payment_method_details
          ?.mobile_money
          ?.reference
      );


      // This is where you can later:
      // - mark an order as paid
      // - update a database
      // - send a receipt
      // - notify the customer
    }


    // ====================================
    // CHARGE FAILED
    // ====================================

    else if (
      event.type ===
      "charge.failed"
    ) {

      const charge =
        event.data?.object;

      console.log(
        "PAYMENT FAILED"
      );

      console.log(
        "Charge ID:",
        charge?.id
      );

      console.log(
        "Failure:",
        charge?.failure_reason ||
        charge?.failure_code
      );
    }


    // ====================================
    // PAYOUT SUCCEEDED
    // ====================================

    else if (
      event.type ===
      "payout.succeeded"
    ) {

      const payout =
        event.data?.object;

      console.log(
        "PAYOUT SUCCESSFUL"
      );

      console.log(
        "Payout ID:",
        payout?.id
      );

      console.log(
        "Amount:",
        payout?.amount
      );

      console.log(
        "EcoCash Reference:",
        payout
          ?.destination_details
          ?.mobile_money
          ?.reference
      );
    }


    // ====================================
    // PAYOUT FAILED
    // ====================================

    else if (
      event.type ===
      "payout.failed"
    ) {

      const payout =
        event.data?.object;

      console.log(
        "PAYOUT FAILED"
      );

      console.log(
        "Payout ID:",
        payout?.id
      );

      console.log(
        "Failure:",
        payout?.failure_message ||
        payout?.failure_code
      );
    }


    // ====================================
    // OTHER EVENTS
    // ====================================

    else {

      console.log(
        "Unhandled Payonify event:",
        event.type
      );
    }


    // Mark event as processed
    processedEvents.add(event.id);


    // Tell Payonify we received it
    return res.status(200).json({

      received: true,

      event_id:
        event.id,

      event_type:
        event.type
    });


  } catch (error) {

    console.error(
      "Webhook error:",
      error
    );

    return res.status(500).json({

      error:
        "Webhook processing failed.",

      message:
        error.message
    });
  }
});


// ========================================
// UNKNOWN ROUTES
// ========================================

app.use((req, res) => {

  res.status(404).json({

    error:
      "Endpoint not found.",

    path:
      req.path
  });
});


// ========================================
// START SERVER
// ========================================

app.listen(PORT, () => {

  console.log(
    `Server running on port ${PORT}`
  );

});
