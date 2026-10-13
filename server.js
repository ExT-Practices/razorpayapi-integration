require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Razorpay = require('razorpay');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Helper to check and instantiate Razorpay instance
function getRazorpayInstance() {
  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  const isValidKey = key_id && !key_id.includes('YOUR_KEY_ID');
  const isValidSecret = key_secret && !key_secret.includes('YOUR_KEY_SECRET');

  if (isValidKey && isValidSecret) {
    return new Razorpay({ key_id, key_secret });
  }
  return null;
}

// -----------------------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------------------

// 1. Get Razorpay Public Config & Key Status
app.get('/api/config', (req, res) => {
  const keyId = process.env.RAZORPAY_KEY_ID || '';
  const keySecret = process.env.RAZORPAY_KEY_SECRET || '';

  const isConfigured = Boolean(
    keyId &&
    keySecret &&
    !keyId.includes('YOUR_KEY_ID') &&
    !keySecret.includes('YOUR_KEY_SECRET')
  );

  res.json({
    success: true,
    keyId: isConfigured ? keyId : '',
    isConfigured,
    mode: keyId.startsWith('rzp_live_') ? 'live' : 'test'
  });
});

// 2. Create Order via Official Razorpay Orders API
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, notes } = req.body;

    const rzp = getRazorpayInstance();
    if (!rzp) {
      return res.status(400).json({
        success: false,
        error: 'MISSING_KEYS',
        message: 'Razorpay API credentials not configured in .env! Please set your RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.'
      });
    }

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Amount must be greater than 0'
      });
    }

    // Razorpay accepts amount in smallest currency unit: paise for INR (1 INR = 100 paise)
    const amountInSubunits = Math.round(numAmount * 100);

    const orderOptions = {
      amount: amountInSubunits,
      currency: (currency || 'INR').toUpperCase(),
      receipt: receipt || `rcpt_${Date.now()}`,
      notes: notes || {
        store: 'Verdant Organic Groceries',
        platform: 'Web Checkout'
      }
    };

    console.log(`[Razorpay] Creating order for amount: ${orderOptions.amount} ${orderOptions.currency}`);
    const order = await rzp.orders.create(orderOptions);
    console.log(`[Razorpay] Order created successfully: ${order.id}`);

    return res.json({
      success: true,
      order,
      keyId: process.env.RAZORPAY_KEY_ID
    });
  } catch (error) {
    console.error('[Razorpay] Order creation error:', error);
    const errorMessage = error?.error?.description || error?.message || 'Failed to create Razorpay Order';
    return res.status(500).json({
      success: false,
      message: errorMessage,
      details: error
    });
  }
});

// 3. Verify Razorpay Payment Signature
app.post('/api/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Missing required Razorpay payment signature parameters.'
      });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET;
    if (!secret || secret.includes('YOUR_KEY_SECRET')) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay Key Secret is not configured on the server.'
      });
    }

    // Official Razorpay HMAC SHA-256 verification:
    // HMAC-SHA256(order_id + "|" + payment_id, secret)
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(`${razorpay_order_id}|${razorpay_payment_id}`);
    const expectedSignature = hmac.digest('hex');

    const isValid = expectedSignature === razorpay_signature;

    if (isValid) {
      console.log(`[Razorpay] Verified payment signature: Payment ${razorpay_payment_id} for Order ${razorpay_order_id}`);
      return res.json({
        success: true,
        message: 'Payment verified successfully and authentic!',
        orderId: razorpay_order_id,
        paymentId: razorpay_payment_id
      });
    } else {
      console.warn(`[Razorpay] Signature mismatch for Order ${razorpay_order_id}!`);
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature. Verification failed.'
      });
    }
  } catch (error) {
    console.error('[Razorpay] Payment verification error:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Error occurred during payment verification.'
    });
  }
});

// 4. Quick Key Configuration via UI (Optional convenience for testing)
app.post('/api/save-keys', (req, res) => {
  try {
    const { keyId, keySecret } = req.body;
    if (!keyId || !keySecret) {
      return res.status(400).json({
        success: false,
        message: 'Both Key ID and Key Secret are required.'
      });
    }

    const cleanId = keyId.trim();
    const cleanSecret = keySecret.trim();

    process.env.RAZORPAY_KEY_ID = cleanId;
    process.env.RAZORPAY_KEY_SECRET = cleanSecret;

    const envPath = path.join(__dirname, '.env');
    const content = `# Razorpay API Credentials\nRAZORPAY_KEY_ID=${cleanId}\nRAZORPAY_KEY_SECRET=${cleanSecret}\nPORT=${process.env.PORT || 3000}\n`;
    fs.writeFileSync(envPath, content, 'utf8');

    console.log(`[Razorpay] Updated credentials via API.`);
    return res.json({
      success: true,
      message: 'Razorpay keys saved successfully to .env!'
    });
  } catch (error) {
    console.error('Error saving keys:', error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname)));

// Fallback to index.html for SPA/client routes
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// Start Express Server
app.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`Verdant Organics Server running at: http://localhost:${PORT}`);
  console.log(`Razorpay API Endpoints:`);
  console.log(`   - GET  /api/config`);
  console.log(`   - POST /api/create-order`);
  console.log(`   - POST /api/verify-payment`);
  console.log(`   - POST /api/save-keys`);
  console.log(`=======================================================`);
});
