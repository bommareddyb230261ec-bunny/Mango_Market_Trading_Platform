# Mango Market Trading Platform

Mango Market Trading Platform is a web-based agricultural trading system for coordinating mango sales between farmers, brokers, and a host/admin reviewer. The project addresses a practical marketplace problem: farmers need visibility into nearby broker markets and current mango prices, while brokers need a structured way to publish market prices, review sell requests, record weighments, and track payments.

The application is implemented as a Flask backend with SQLAlchemy models, a MySQL database configuration, and a static HTML/CSS/vanilla JavaScript frontend served by the Flask app. Farmers can register, verify email with OTP, browse markets by district, submit sell requests, track accepted orders, view weighment records, and manage encrypted bank/UPI details. Brokers can register with a trade license upload, wait for host approval, maintain market prices and commission rates, accept or reject farmer requests, record actual weighments, and submit UPI payment references with proof files.

The host/admin workflow adds a verification layer for broker onboarding and payment completion. A host password unlocks a dashboard where pending broker licenses can be approved or rejected, and submitted payment proofs can be reviewed before payment records are marked as paid. The system is useful as an interview project because it demonstrates role-based workflows, persistent relational data modeling, file uploads, OTP email integration, encrypted sensitive fields, session-token authentication, and end-to-end transaction tracking from market discovery through payment verification.

## Features

### Authentication & Authorization

- Farmer and broker registration through `/auth/register`.
- Email OTP sending and verification through `/auth/send-otp` and `/auth/verify-otp`.
- Login with phone number or email plus password through `/auth/login`.
- Password reset workflow using OTP through `/auth/forgot-password` and `/auth/reset-password`.
- Password hashing with Werkzeug security helpers.
- Flask session cookie named `mango_session` plus a signed fallback `session_token` returned to the frontend.
- Single active session tracking per user through the `user_sessions` table.
- Role-aware login behavior for `FARMER` and `BROKER`.
- Broker login blocked while license verification is `PENDING` or `REJECTED`.
- Logout invalidates the active server-side session and clears frontend session state.

### Farmer Features

- Farmer registration with name, phone, email, password, location, address, and optional banking/UPI details.
- Email OTP requirement when an email is supplied during registration.
- Dashboard for finding broker markets by district.
- Market listings with broker name, broker phone, market location, mango varieties, price per kg, and commission rate.
- Sell request creation for selected broker, variety, quantity, and preferred date.
- Request history views for all requests and accepted requests.
- Accepted order tracking with generated order IDs, agreed price, commission, and expected delivery date.
- Farmer weighment view showing actual weight, final price, gross amount, commission, net payable, and payment status.
- Farmer payment history including UPI transaction IDs and downloadable/viewable payment proof links.
- Farmer profile page with OTP-gated updates for address, location, bank details, and UPI details.
- Bank and UPI details are encrypted before database storage.

### Broker Features

- Broker registration with market/agency name, location, platform-fee confirmation flag, and required trade license upload.
- Trade license uploads support PDF, JPG, JPEG, and PNG files with a 5 MB limit.
- Broker profile page showing read-only registration, market, location, and platform fee status.
- Broker dashboard with sell requests, market prices, transactions, weighments, and recent activity.
- Market price management for mango varieties, price per kg, and available quantity.
- Commission configuration as a rupee amount per INR 100.
- Sell request acceptance with generated order ID, agreed price, expected delivery date, locked order price, and farmer notification.
- Sell request rejection with a rejection reason and farmer notification.
- Weighment recording with order lookup, farmer name, variety, date, actual tons, quality grade, final price per kg, and remarks.
- Transaction-style broker views that combine saved `transactions` rows and `weighments` rows.
- Payment details lookup for transaction IDs and weighment IDs (`w-<id>` format).
- UPI payment initiation status tracking.
- UPI transaction reference and payment proof upload for host verification.
- Receipt printing from the broker transaction interface.

### Host/Admin Features

- Host access screen protected by a hardcoded host password in `backend/routes/host_routes.py`.
- Pending broker list with license download links.
- Broker approval and rejection endpoints that update `verification_status`.
- Lists for pending, approved, rejected, and all brokers.
- Pending payment list across both transaction-based records and weighment-based records.
- Payment approval changes payment status to `PAID`.
- Payment rejection changes payment status to `REJECTED`.
- Farmer email notification after host payment approval when SMTP is configured and farmer email exists.
- Additional `/api/admin` broker approval routes exist, but the active frontend host dashboard uses `/api/host`.

### Mango/Market Management

- Brokers publish mango varieties with price per kg and available quantity.
- Farmers search markets by district.
- Farmers see all published varieties and prices for each broker market.
- Sell requests capture the current price and current broker commission at request time.
- Accepted requests keep an agreed price even if the broker later updates market prices.

### Transaction, Weighment & Payment Management

- Sell request statuses include `PENDING`, `ACCEPTED`, and `REJECTED`.
- Accepted requests receive generated order IDs in the format `ORD-<timestamp>-<request_id>`.
- Weighments can be linked to accepted sell requests by order ID.
- Commission is calculated as `(gross_amount * commission_rate) / 100`.
- Net payable is calculated as `gross_amount - commission`.
- Payment statuses include `PENDING`, `INITIATED`, `AWAITING_VERIFICATION`, `PAID`, and `REJECTED`.
- Payment proof files are saved under the Flask instance upload directory.
- Uploaded trade licenses and payment proofs are served through `/uploads/<path>`.

### API Features

- REST-style Flask routes grouped by blueprints:
  - `/auth`
  - `/farmer`
  - `/broker`
  - `/market`
  - `/api/host`
  - `/api/admin`
- JSON request/response handling for most API flows.
- Multipart form handling for broker trade license uploads and payment proof uploads.
- `/health` endpoint for frontend backend detection.
- Compatibility mappings for several `/api/farmer/*`, `/api/broker/*`, and `/api/auth/me` routes.
- CORS configured for local development origins and optional `CORS_ORIGINS` environment variable.

### Security Features

- Werkzeug password hashing for stored passwords.
- Signed session fallback tokens using `itsdangerous.URLSafeTimedSerializer`.
- Server-side active session records to invalidate previous sessions when the same user logs in again.
- HTTP-only Flask session cookie configuration.
- Fernet encryption for farmer bank account, IFSC, UPI ID, account holder, bank name, and branch name.
- Secure filename handling for uploaded files.
- File extension and file size validation for trade license uploads.
- Directory traversal checks when serving frontend files and uploaded files.
- Audit logging calls for major events such as sell request creation, weighment recording, payment detail access, and payment submission.

## Technology Stack

| Category              | Technology |
| --------------------- | ---------- |
| Backend               | Python, Flask, Flask-CORS, Flask-SQLAlchemy, SQLAlchemy |
| Frontend              | HTML5, CSS3, vanilla JavaScript, Fetch API, localStorage |
| Database              | MySQL/MariaDB via PyMySQL; SQLAlchemy engine/session helpers; SQLite-compatible test configuration in `create_app(test_config=...)` |
| APIs                  | Flask REST-style JSON endpoints, multipart form uploads, SMTP email service, UPI deep links/QR generation in frontend |
| Authentication        | Flask sessions, signed fallback session tokens with itsdangerous, Werkzeug password hashing, email OTP via SMTP |
| Deployment            | Local Flask development server through `backend/app.py`, `backend/main.py`, or `backend/server.py`; no Docker, CI, or production deployment config is present in the repository |
| Other Libraries/Tools | python-dotenv, cryptography/Fernet, email-validator, pytest dependencies, Font Awesome and Google Fonts loaded by some frontend pages |

## System Architecture

```text
                         Browser
         ------------------------------------------------
         Static HTML pages + CSS + vanilla JavaScript
         Farmer portal | Broker portal | Host dashboard
         ------------------------------------------------
                  | Fetch API, cookies, bearer fallback
                  v
       +--------------------------------------------------+
       |                  Flask Application               |
       | backend/main.py create_app()                     |
       |                                                  |
       |  /auth       Registration, login, OTP, sessions   |
       |  /farmer     Markets, requests, profile, bank     |
       |  /broker     Prices, requests, weighment, payment |
       |  /api/host   Broker and payment verification      |
       |  /api/admin  Additional broker review endpoints   |
       |  /uploads    Uploaded license/proof downloads     |
       +--------------------------------------------------+
                  | SQLAlchemy ORM
                  v
       +--------------------------------------------------+
       |               MySQL / MariaDB Database            |
       | users, user_sessions, places, farmers, brokers    |
       | market_prices, sell_requests, transactions        |
       | weighments, farmer_orders                         |
       +--------------------------------------------------+
                  |
                  +--> instance/uploads/trade_licenses
                  +--> instance/uploads/payment_proofs
                  +--> instance/fernet.key if no encryption env key is set

External services:
  SMTP server   -> OTP, weighment confirmation, payment verification email
  UPI apps/QR   -> Frontend builds UPI payment intent/QR from stored farmer UPI
```

## Major Workflows

### Farmer To Broker Trading Flow

```text
Farmer registers and verifies email
        |
        v
Farmer logs in and selects a district
        |
        v
Frontend calls /farmer/markets
        |
        v
Farmer reviews broker markets, varieties, prices, and commission
        |
        v
Farmer submits sell request through /farmer/sell-request
        |
        v
Broker sees pending request in /broker/dashboard
        |
        +--> Broker rejects request with reason
        |
        +--> Broker accepts request
                |
                v
        Backend generates order_id, stores agreed price,
        stores expected delivery date, and marks request ACCEPTED
```

### Weighment And Payment Flow

```text
Accepted sell request has order_id
        |
        v
Broker records actual weighment through /broker/weighment
        |
        v
Backend stores final weight, final price, quality grade,
commission, and net payable calculation data
        |
        v
Broker opens transaction/payment view
        |
        v
Frontend fetches farmer UPI details from /broker/payment-details/<id>
        |
        v
Broker initiates UPI payment and uploads proof/reference
        |
        v
Payment status becomes AWAITING_VERIFICATION
        |
        v
Host approves or rejects payment in /api/host/payments/*
        |
        v
Approved payment becomes PAID and farmer email is sent if SMTP is configured
```

### Broker Verification Flow

```text
Broker registers with trade license file
        |
        v
Broker row is created with verification_status = PENDING
        |
        v
Host logs into host dashboard
        |
        v
Host downloads/reviews uploaded trade license
        |
        +--> Approve: broker can log in
        |
        +--> Reject: broker login is blocked
```

## Project Structure

```text
Mango_Market_Trading_Platform/
|-- backend/
|   |-- app.py                  # Main runnable Flask entry point
|   |-- main.py                 # Application factory, models, routes, schema helpers
|   |-- server.py               # Alternate Flask server entry point; contains legacy stray code
|   |-- db_config.py            # MySQL URL, engine, session, and config helpers
|   |-- db.py                   # Standalone SQLAlchemy engine/session utilities
|   |-- create_db.py            # Creates the configured MySQL database
|   |-- manage_db.py            # Maintenance helper for order_id uniqueness migration
|   |-- email_service.py        # SMTP email, OTP storage, notification email templates
|   |-- encryption_utils.py     # Fernet encryption/decryption for sensitive fields
|   |-- audit_utils.py          # AuditLog model and logging helper
|   |-- notification_utils.py   # Email/SMS/app notification wrapper; SMS/app are logged placeholders
|   |-- send_test_otp_cli.py    # CLI helper for sending a test OTP email
|   |-- SMTP_README.md          # SMTP setup notes
|   `-- routes/
|       `-- host_routes.py      # Host broker/payment verification routes
|-- frontend/
|   |-- html/                   # Farmer, broker, host, payment, transaction pages
|   |-- js/                     # API client and page-specific behavior
|   `-- css/                    # Shared and page-specific responsive styles
|-- instance/                   # Runtime data such as generated key and uploaded files
|-- requirements.txt
`-- README.md
```

## Database Model Overview

```text
users
  id, name, phone, email, password_hash, role, created_at

user_sessions
  id, user_id, session_id_hash, user_agent, ip_address, created_at, last_seen_at

places
  id, state, district, market_area

farmers
  id, user_id, place_id, encrypted bank/UPI fields, address

brokers
  id, user_id, place_id, market_name, platform_fee_paid,
  market_commission, registration_date, trade_license,
  verification_status, rejection_reason

market_prices
  id, broker_id, mango_variety, price_per_kg, available_quantity, updated_at

sell_requests
  id, farmer_id, broker_id, quantity_tons, variety, preferred_date,
  order_id, expected_delivery_date, agreed_price, price_at_request,
  order_commission, price_locked, status, rejection_reason, created_at

transactions
  id, request_id, market_price_at_sale, actual_weight, total_cost,
  commission, net_payable, payment_status, upi_transaction_id,
  payment_proof, transaction_date

weighments
  id, broker_id, sell_request_id, farmer_id, farmer_name, order_id,
  mango_variety, weighment_date, actual_weight_tons, quality_grade,
  final_price_per_kg, remarks, payment_status, upi_transaction_id,
  payment_proof, created_at

farmer_orders
  id, farmer_id, farmer_name, order_id, created_at
```

## API Reference

### Authentication

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| GET | `/auth/check-email?email=...` | Check email availability |
| GET | `/auth/check-phone?phone=...` | Check phone availability |
| POST | `/auth/register` | Register farmer or broker |
| POST | `/auth/send-otp` | Send email OTP |
| POST | `/auth/verify-otp` | Verify OTP and mark email verified in session |
| POST | `/auth/test-otp-email` | Send a test OTP email |
| POST | `/auth/login` | Log in as farmer or broker |
| POST | `/auth/logout` | Invalidate current session |
| GET | `/auth/me` | Return current logged-in user |
| POST | `/auth/forgot-password` | Send password reset OTP |
| POST | `/auth/reset-password` | Reset password after OTP verification |

### Farmer

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| GET | `/farmer/locations` | List districts/market areas that have brokers |
| GET | `/farmer/markets?district=...&sort=...` | List broker markets and prices by district |
| GET | `/farmer/varieties?district=...` | Aggregate available varieties by district |
| POST | `/farmer/sell-request` | Create a sell request |
| GET | `/farmer/dashboard` | Farmer request dashboard data |
| GET | `/farmer/requests` or `/farmer/my-requests` | Farmer request history |
| GET | `/farmer/accepted` or `/farmer/accepted-requests` | Accepted farmer requests |
| GET | `/farmer/weighments` | Farmer weighment records |
| GET | `/farmer/payments` | Farmer payment history |
| GET | `/farmer/bank` | Get decrypted/masked bank details |
| POST | `/farmer/update-bank` | Update bank/UPI details |
| GET | `/farmer/profile` | Get farmer profile |
| POST | `/farmer/send-otp` | Send profile-update OTP |
| POST | `/farmer/verify-otp` | Verify profile-update OTP |
| PUT | `/farmer/profile/update` | Update farmer profile after OTP |

### Broker

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| POST | `/broker/upload-license` | Upload or replace trade license |
| GET | `/broker/dashboard` | Broker dashboard, requests, prices, transactions, weighments |
| GET | `/broker/profile` | Broker profile |
| POST | `/broker/commission` | Update market commission |
| POST | `/broker/update-prices` | Create/update/delete market prices |
| GET | `/broker/fruits` | List broker market prices |
| DELETE | `/broker/fruits/<fruit_id>` | Delete a market price row |
| POST | `/broker/request/<request_id>/status` | Accept or reject a sell request |
| PUT | `/sell-request/<request_id>/accept` | Explicit accept endpoint used by dashboard |
| POST | `/broker/weighment` | Record a weighment |
| POST | `/broker/process-payment` | Directly mark a transaction/weighment paid |
| GET | `/broker/payment-details/<transaction_id>` | Fetch farmer UPI/payment details |
| POST | `/broker/mark-payment-initiated` | Mark payment as initiated |
| POST | `/broker/submit-upi-transaction` | Submit UPI reference and proof for host verification |
| GET | `/broker/farmer/<farmer_id>` | Fetch farmer payment details for broker |
| GET | `/broker/debug/order-lookup` | Debug-only order lookup when enabled |

### Host/Admin And Public

| Method | Endpoint | Purpose |
| ------ | -------- | ------- |
| POST | `/api/host/verify` | Verify host password |
| POST | `/api/host/verify-password` | Alternate host password endpoint |
| GET | `/api/host/brokers/pending` | List pending brokers |
| POST | `/api/host/brokers/<broker_id>/approve` | Approve broker |
| POST | `/api/host/brokers/<broker_id>/reject` | Reject broker |
| GET | `/api/host/brokers/verified` | List approved brokers |
| GET | `/api/host/brokers/rejected` | List rejected brokers |
| GET | `/api/host/brokers/all` | List all brokers |
| GET | `/api/host/payments/pending` | List submitted payments awaiting verification |
| GET | `/api/host/payments/all` | List all payment records |
| POST | `/api/host/payments/<transaction_id>/approve` | Approve payment |
| POST | `/api/host/payments/<transaction_id>/reject` | Reject payment |
| GET | `/farmers/<farmer_id>` | Public farmer details endpoint |
| GET | `/uploads/<path>` | Download uploaded license/proof files |
| GET | `/market/farmer/markets` | Compatibility route for farmer market listing |
| GET | `/health` | Health check |

## Setup And Running Locally

### Prerequisites

- Python 3.8 or newer.
- MySQL or MariaDB running locally or remotely.
- SMTP credentials if OTP/email features need to work.

### 1. Create And Activate A Virtual Environment

```bash
python -m venv .venv

# Windows PowerShell
.\.venv\Scripts\Activate.ps1

# Windows Command Prompt
.\.venv\Scripts\activate.bat
```

### 2. Install Dependencies

```bash
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a `.env` file in the project root or set these variables in your shell:

```env
SECRET_KEY=replace-with-a-long-random-secret

DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=mango_market_db
DB_DRIVER=pymysql

SMTP_SERVER=smtp.gmail.com
SMTP_PORT=465
SMTP_EMAIL=your_email@example.com
SMTP_PASSWORD=your_app_password

MANGO_MARKET_ENCRYPTION_KEY=
CORS_ORIGINS=http://127.0.0.1:5000,http://localhost:5000
```

Notes:

- If `MANGO_MARKET_ENCRYPTION_KEY` is not set, `backend/encryption_utils.py` creates or reads a local key at `instance/fernet.key`.
- SMTP variables are required for OTP email, weighment email, and payment verification email.
- `create_db.py` defaults `DB_NAME` to `mango_market`, while `db_config.py` defaults to `mango_market_db`. Set `DB_NAME` explicitly to avoid confusion.

### 4. Create The Database

```bash
python backend/create_db.py
```

The Flask app also calls `db.create_all()` during startup and runs lightweight schema-update helpers for development.

### 5. Start The Application

```bash
python backend/app.py
```

The server runs on:

```text
http://127.0.0.1:5000
```

Useful pages:

- Home: `http://127.0.0.1:5000/`
- Farmer login: `http://127.0.0.1:5000/farmer_login.html`
- Broker login: `http://127.0.0.1:5000/broker_login.html`
- Host access: `http://127.0.0.1:5000/host_access.html`

## Configuration Notes

| Variable | Purpose | Default in code |
| -------- | ------- | --------------- |
| `SECRET_KEY` | Flask sessions and signed tokens | `mango_market_secure_key_2026` |
| `DB_HOST` | Database host | `localhost` |
| `DB_PORT` | Database port | `3306` |
| `DB_USER` | Database user | `root` |
| `DB_PASSWORD` | Database password | empty |
| `DB_NAME` | Database name | `mango_market_db` in `db_config.py` |
| `DB_DRIVER` | SQLAlchemy MySQL driver | `pymysql` |
| `SMTP_SERVER` | SMTP host | none |
| `SMTP_PORT` | SMTP SSL port | none |
| `SMTP_EMAIL` | Sender account | none |
| `SMTP_PASSWORD` | Sender password/app password | none |
| `MANGO_MARKET_ENCRYPTION_KEY` | Stable Fernet key for encrypted fields | generated local key file |
| `CORS_ORIGINS` | Comma-separated allowed frontend origins | local development origins |
| `DEBUG_ORDER_LOOKUP` | Enables broker order debug endpoint when `1` | disabled |

## Testing And Verification

The repository includes pytest-related dependencies in `requirements.txt`, but the current working tree does not contain active test files. The deleted paths shown by Git are:

```text
tests/e2e_tests.py
tests/test_single_session.py
```

Manual verification can be done with:

```bash
python backend/app.py
```

Then open `/health`, register a farmer, register a broker with a license file, approve the broker through the host dashboard, add broker prices, submit a farmer sell request, accept it as the broker, record a weighment, and submit/approve a payment proof.

