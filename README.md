# Mango Market Trading Platform

## Project Summary

This project is a full-stack agriculture trading platform designed for a real-world marketplace workflow between farmers, brokers, and a host/admin reviewer. The system connects mango farmers who want to sell produce with brokers who publish market prices and manage transactions, while the host verifies broker onboarding and payment approvals.

The application is built using Python and Flask for the backend, MySQL for persistence, and a static HTML/CSS/JavaScript frontend. It combines several practical features such as role-based authentication, OTP email verification, encrypted financial data, file uploads, sale request tracking, weighment management, and host-level payment review.

---

## Business Problem

Farmers often struggle to discover trustworthy brokers, negotiate prices, and track the lifecycle of a crop sale. Brokers need a way to manage market pricing, review incoming sales requests, record actual weighment, and handle payment verification. There also needs to be a trusted verification layer for brokers and payments before funds are finalized.

This platform solves that by creating a marketplace where:

- Farmers can search broker markets and submit sell requests
- Brokers can manage prices, accept or reject requests, and record weighments
- Hosts can approve broker registrations and verify payment proofs
- The system stores transaction details, commission logic, and payment status over time

---

## Core Roles

### 1. Farmer

- Registers with personal details and verifies email using OTP
- Views available broker markets by district
- Selects a mango variety and submits a sell request
- Tracks accepted requests, payment status, and weighment data
- Stores encrypted bank and UPI details securely

### 2. Broker

- Registers with market information and trade license upload
- Waits for host verification before being allowed to operate
- Publishes mango market prices and commission details
- Accepts or rejects farmer sell requests
- Records weighment and final sale amount
- Submits payment details and proof for verification

### 3. Host/Admin

- Verifies new broker registrations
- Approves or rejects trade licenses
- Reviews pending payment submissions
- Confirms accepted payments and notifies farmers

---

## Technical Architecture

### Backend

- Flask application factory in [backend/main.py](backend/main.py)
- App entry points in [backend/app.py](backend/app.py) and [backend/server.py](backend/server.py)
- Database configuration in [backend/db_config.py](backend/db_config.py)
- Email, encryption, and logging utilities in:
  - [backend/email_service.py](backend/email_service.py)
  - [backend/encryption_utils.py](backend/encryption_utils.py)
  - [backend/audit_utils.py](backend/audit_utils.py)
  - [backend/notification_utils.py](backend/notification_utils.py)

### Frontend

- HTML pages under [frontend/html](frontend/html)
- JavaScript logic under [frontend/js](frontend/js)
- Styling under [frontend/css](frontend/css)

### Database

The application uses SQLAlchemy models for user and marketplace data, with MySQL as the main relational database. Key entities include:

- users
- user_sessions
- places
- farmers
- brokers
- market_prices
- sell_requests
- weighments
- transactions
- farmer_orders

---

## Important Features Implemented

### Authentication and Security

- Role-based login for farmers and brokers
- OTP-based email verification and password reset flow
- Flask session management with a custom session cookie
- Password hashing using Werkzeug
- Single active session enforcement per user
- Encrypted bank/UPI data using Fernet
- File validation for uploaded trade licenses and payment proofs

### Marketplace and Trading Flow

- Farmers browse broker markets by district
- Brokers publish variety-wise mango prices and stock
- Farmers submit sell requests with product quantity and preferred date
- Brokers accept or reject requests with reasons and pricing logic
- Accepted orders generate order IDs and keep locked pricing

### Weighment and Payment Workflow

- Brokers record actual crop weight and final price per kg
- Commission and net payable are calculated automatically
- Payment status moves through stages such as pending, initiated, awaiting verification, and paid
- Proof uploads and UPI transaction references are submitted for host review

### Host Verification Layer

- Broker registration is reviewed before activation
- Pending payment records are approved or rejected by the host
- Email notifications are sent to farmers when payment is approved

---

## Main API Structure

The app registers Flask blueprints for separated responsibilities:

- /auth — registration, login, OTP, sessions
- /farmer — farmer dashboard, market listing, sell requests, profile
- /broker — brokers, prices, requests, weighments, payment submission
- /market — marketplace access routes
- /api/host — host verification and payment review
- /api/admin — admin-style broker management routes
- /api/analytics — analytics and business reporting endpoints

Important routes include:

- POST /auth/register
- POST /auth/login
- GET /farmer/markets
- POST /farmer/sell-request
- GET /broker/dashboard
- POST /broker/update-prices
- POST /broker/request/<request_id>/status
- POST /broker/weighment
- POST /api/host/verify-password
- POST /api/host/payments/<transaction_id>/approve
- GET /health

---

## Example User Journey

### Farmer Flow

1. Farmer registers and verifies email OTP
2. Farmer logs in and searches markets by district
3. Farmer views broker prices and mango varieties
4. Farmer submits a sell request
5. Broker accepts or rejects the request
6. If accepted, farmer tracks order status and payment process

### Broker Flow

1. Broker registers and uploads trade license
2. Broker waits for host approval
3. Broker updates market prices and commission
4. Broker reviews received sell requests
5. Broker records actual weighment and final price
6. Broker submits proof and UPI transaction details

### Host Flow

1. Host logs in using host password
2. Reviews pending broker applications
3. Approves or rejects registrations
4. Reviews payment submissions and marks them paid or rejected

---

## Project Structure

```text
Mango_Market_Trading_Platform/
├── backend/
│   ├── app.py
│   ├── main.py
│   ├── server.py
│   ├── db_config.py
│   ├── db.py
│   ├── create_db.py
│   ├── manage_db.py
│   ├── email_service.py
│   ├── encryption_utils.py
│   ├── audit_utils.py
│   ├── notification_utils.py
│   └── routes/
│       ├── host_routes.py
│       └── analytics_routes.py
├── frontend/
│   ├── html/
│   ├── js/
│   ├── css/
│   └── assets/
├── instance/
├── requirements.txt
├── README.md
└── .env.example (if present in your local setup)
```

---

## Setup Instructions

### Prerequisites

- Python 3.8+
- MySQL or MariaDB
- SMTP credentials for OTP and email notifications

### Install dependencies

```bash
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### Environment variables

Create a `.env` file with values like:

```env
SECRET_KEY=your_secret_key
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=mango_market_db
DB_DRIVER=pymysql
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=465
SMTP_EMAIL=your_email@example.com
SMTP_PASSWORD=your_app_password
MANGO_MARKET_ENCRYPTION_KEY=
CORS_ORIGINS=http://127.0.0.1:5000,http://localhost:5000
```

### Run the app

```bash
python backend/app.py
```

Then open:

- http://127.0.0.1:5000/
- http://127.0.0.1:5000/farmer_login.html
- http://127.0.0.1:5000/broker_login.html
- http://127.0.0.1:5000/host_access.html

---


This project shows that I can work across the full product lifecycle:

- Business requirement modeling
- Database schema design
- Role-based authorization
- REST API development
- Secure handling of upload and sensitive data
- Payment and verification logic
- Frontend integration with backend APIs
- Real-world workflow orchestration

It is especially strong for discussing:

- designing practical marketplace systems
- building secure web applications
- handling multi-role workflows
- integrating email OTP and encrypted storage
- managing sales, payment, and verification operations in one platform

---
