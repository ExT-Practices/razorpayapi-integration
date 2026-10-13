# 🌿 Verdant Organics - Farm Fresh Grocery with Official Razorpay API

A modern, farm-to-table organic grocery web application featuring **30 unique, fresh fruits and farm vegetables** with nutritional profiles, real-time basket calculations, coupon discounts, currency switching (₹ INR & $ USD), dark/light theme, and **Full-Stack Official Razorpay Payment Gateway Integration**.

---

## 💳 Razorpay Payment Gateway Integration

This application now features an end-to-end integration with the **Official Razorpay API**:

1. **Backend Order Creation (`POST /api/create-order`)**:
   - Generates an authentic Razorpay Order ID (`order_...`) via the official Razorpay Node.js SDK.
   - Calculates the exact order amount in paise (1 INR = 100 paise).
   - Attaches customer receipt and delivery notes.

2. **Official Razorpay Checkout Modal (`checkout.razorpay.com/v1/checkout.js`)**:
   - Launches the real Razorpay payment modal with live UPI QR code, UPI Apps (Google Pay, PhonePe, Paytm, CRED), Credit/Debit Cards, NetBanking, and Wallets.
   - Auto-prefills customer name, email, and phone number.

3. **HMAC SHA-256 Payment Signature Verification (`POST /api/verify-payment`)**:
   - On payment success, the frontend submits `razorpay_order_id`, `razorpay_payment_id`, and `razorpay_signature`.
   - The server validates the cryptographic signature using HMAC-SHA256 and your `RAZORPAY_KEY_SECRET` to prevent tampering.
   - Only verified orders receive confirmed status, clear the cart, and trigger celebration confetti!

4. **In-App API Key Manager & Status Badge**:
   - Status pill in the header indicates live connection status: `🟢 Razorpay Active (TEST MODE)` vs `⚠️ Razorpay Setup`.
   - Update credentials in `.env` directly or via the in-app **API Settings** tab.

---

## ⚙️ How to Configure Your Razorpay Test Keys

### 1. Get Free Test Keys from Razorpay:
1. Log in or sign up at [dashboard.razorpay.com](https://dashboard.razorpay.com/).
2. Toggle to **Test Mode** at the top bar.
3. Navigate to **Settings** &rarr; **API Keys** (Direct URL: [https://dashboard.razorpay.com/app/keys](https://dashboard.razorpay.com/app/keys)).
4. Click **Generate Test Key** and copy your **Key ID** (`rzp_test_...`) and **Key Secret**.

### 2. Add Keys to `.env`:
Open the `.env` file in the project root:

```env
# Razorpay Test API Keys
RAZORPAY_KEY_ID=rzp_test_YOUR_KEY_ID_HERE
RAZORPAY_KEY_SECRET=YOUR_KEY_SECRET_HERE

# Server Port
PORT=3000
```

*(Alternatively, you can click the **Razorpay API** button in the app header and paste your keys in the **API Settings** tab!)*

---

## 🚀 How to Run Locally

```bash
# 1. Install dependencies
npm install

# 2. Start the local server
npm start
```

Open your browser at:
```
http://localhost:3000
```

---

## 🧪 Testing Payments

When in **Test Mode**, you can use Razorpay's official test credentials:
- **UPI**: Enter any virtual UPI ID like `test@okhdfcbank` or scan the test QR code.
- **Card**: Use test card numbers provided in [Razorpay Documentation](https://razorpay.com/docs/payments/payments/test-card-details/):
  - Card Number: `4111 1111 1111 1111`
  - Expiry: Any future date (e.g. `12/28`)
  - CVV: `123`
  - OTP: `1234` or click "Success" in the bank emulator.

---

## 📁 Project Structure

```
razarpayapi/
├── .env                     # Private Razorpay API keys (never commit)
├── .env.example             # Template with step-by-step instructions
├── .gitignore               # Excludes node_modules and .env
├── package.json             # Express, Razorpay SDK, Dotenv, Cors
├── server.js                # Express backend: order creation & signature verification
├── index.html               # Semantic HTML5 with official Razorpay Checkout SDK
├── css/
│   └── styles.css           # Bespoke organic design system + Razorpay UI styling
├── js/
│   ├── products.js          # Catalog of 30 fruits & vegetables + nutrition
│   └── app.js               # Cart state, checkout controller, and signature verification
└── assets/
    └── images/
        └── hero-banner.jpg  # Generated high-resolution hero banner
```
