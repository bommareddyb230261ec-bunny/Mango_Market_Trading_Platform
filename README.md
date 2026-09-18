# 🥭 Mango Market Trading Platform

A full-stack agriculture trading platform that connects mango farmers with Mango Traders through a transparent, verified marketplace — with host-level oversight for trader onboarding and payment approvals.

![Python](https://img.shields.io/badge/Python-3.8%2B-blue)
![Flask](https://img.shields.io/badge/Flask-Backend-black)
![MySQL](https://img.shields.io/badge/MySQL-Database-orange)
![License](https://img.shields.io/badge/License-MIT-green)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)

---

## 📖 Table of Contents

- [Overview](#-overview)
- [Business Problem](#-business-problem)
- [Core Roles](#-core-roles)
- [Tech Stack](#-tech-stack)
- [Architecture](#-architecture)
- [Database Schema](#-database-schema)
- [Key Features](#-key-features)
- [API Reference](#-api-reference)
- [User Journeys](#-user-journeys)
- [Project Structure](#-project-structure)
- [Getting Started](#-getting-started)
- [Environment Variables](#-environment-variables)
- [Running the App](#-running-the-app)
- [Skills Demonstrated](#-skills-demonstrated)
- [License](#-license)

---

## 🌍 Overview

**Mango Market Trading Platform** is a full-stack web application that digitizes the mango trading workflow between three key stakeholders: **Farmers**, **Mango Traders**, and a **Host/Admin** reviewer. It replicates a real-world agricultural marketplace — enabling price discovery, sell-request negotiation, weighment recording, and payment verification, all within a secure, role-based system.

Built with **Python (Flask)** on the backend, **MySQL** for persistence, and a **vanilla HTML/CSS/JavaScript** frontend, the project demonstrates end-to-end product thinking: from schema design to secure API development to real-world workflow orchestration.

---

## 🎯 Business Problem

Farmers often struggle to discover which of the many markets in their area offers the best price for a particular mango variety. Calling around 200 markets to compare rates is slow, unreliable, and makes it harder to choose a profitable buyer. Farmers also risk cutting and transporting their fruits to a market before knowing whether that market actually wants the produce. If the trader does not accept the sale, the farmer may be left with harvested fruit, wasted transport costs, and no confirmed buyer. After selling, farmers can also lose track of which markets have completed payment. Mango Traders face the corresponding challenge of confirming whether each farmer has been paid.

The platform addresses these problems by centralizing variety-wise market prices, introducing a trader-approved sell-request workflow, and providing transaction management for both sides of the sale. Farmers can filter markets and compare prices, then send a sell request at an acceptable price before cutting the fruits or travelling to the market. The trader reviews and accepts the request first; only after acceptance does the farmer proceed with harvesting and delivery. Farmers and Mango Traders can then track payment status and confirm which payments are completed or still pending. A trusted host layer validates traders and payment submissions before funds are finalized.

This platform addresses that gap by providing:

- A **searchable marketplace** where farmers discover verified Mango Traders by district
- **Price transparency** through trader-published, variety-wise market rates
- A **sell-request approval flow** that confirms trader demand before the farmer harvests and transports the fruits
- A **structured fulfillment and transaction flow** from accepted sell request to payment completion
- A **host-verified trust layer** for trader onboarding and payment approval

---

## 👥 Core Roles

### 🌾 Farmer

- Registers and verifies identity via email OTP
- Filters and compares variety-wise prices across available markets
- Selects a mango variety and submits a sell request
- Tracks request status, weighment, and which market payments are completed or pending
- Stores bank/UPI details securely (encrypted at rest)

### 🧺 Mango Trader (Buyer)

- The buyer in the marketplace — purchases mangoes directly from farmers
- Registers with market details and uploads a trade license
- Awaits host verification before going live
- Publishes market prices and commission rates
- Accepts or rejects incoming farmer sell requests
- Records actual weighment and final sale amount
- Submits payment proof and UPI transaction references
- Tracks payment status for each farmer to confirm completed and pending payments

### 🛡️ Host / Admin

- Verifies new Mango Trader registrations and licenses
- Approves or rejects trader onboarding
- Reviews and confirms pending payment submissions
- Triggers farmer notifications on payment approval

---

## 🛠️ Tech Stack

| Layer           | Technology                                                   |
| --------------- | ------------------------------------------------------------ |
| Backend         | Python, Flask                                                |
| Database        | MySQL via SQLAlchemy                                         |
| Frontend        | HTML5, CSS3, JavaScript                                      |
| Auth & Security | Werkzeug password hashing, Flask sessions, Fernet encryption |
| Email           | SMTP-based OTP & notification service                        |
| File Handling   | Trade license & payment proof uploads                        |

---

## 🏗️ Architecture

### Backend

| File                                                                          | Responsibility                |
| ----------------------------------------------------------------------------- | ----------------------------- |
| [`backend/main.py`](backend/main.py)                                          | Flask application factory     |
| [`backend/app.py`](backend/app.py) / [`backend/server.py`](backend/server.py) | Application entry points      |
| [`backend/db_config.py`](backend/db_config.py)                                | Database configuration        |
| [`backend/email_service.py`](backend/email_service.py)                        | OTP & notification emails     |
| [`backend/encryption_utils.py`](backend/encryption_utils.py)                  | Fernet-based field encryption |
| [`backend/audit_utils.py`](backend/audit_utils.py)                            | Audit logging                 |
| [`backend/notification_utils.py`](backend/notification_utils.py)              | In-app / email notifications  |

### Frontend

- **Pages:** [`frontend/html`](frontend/html)
- **Logic:** [`frontend/js`](frontend/js)
- **Styles:** [`frontend/css`](frontend/css)

---

## 🗄️ Database Schema

Built with SQLAlchemy ORM models on MySQL. Core entities:

| Table           | Purpose                                                         |
| --------------- | --------------------------------------------------------------- |
| `users`         | Base authentication records                                     |
| `user_sessions` | Single active session enforcement                               |
| `places`        | District / location reference data                              |
| `farmers`       | Farmer profile & encrypted payout details                       |
| `mango_traders` | Mango Trader profile — buyers who purchase mangoes from farmers |
| `market_prices` | Variety-wise pricing & commission data                          |
| `sell_requests` | Farmer-initiated sale requests                                  |
| `weighments`    | Recorded crop weight & final pricing                            |
| `transactions`  | Payment records & status tracking                               |
| `farmer_orders` | Order lifecycle tied to accepted requests                       |

---

## ✨ Key Features

### 🔐 Authentication & Security

- Role-based login for Farmers and Mango Traders
- OTP-based email verification and password reset
- Custom Flask session cookie with single active session enforcement
- Werkzeug password hashing
- Fernet-encrypted bank/UPI data
- Server-side validation for uploaded licenses and payment proofs

### 🛒 Marketplace & Trading Flow

- District-based market discovery
- Filterable, variety-wise price comparison across markets
- Sell request submission with quantity and preferred date
- Accept/reject logic with reasons and locked pricing
- Auto-generated order IDs on acceptance

### ⚖️ Weighment & Payment Workflow

- Actual crop weight and final price-per-kg recording
- Automatic commission and net-payable calculation
- Multi-stage payment status: `pending → initiated → awaiting verification → paid`
- Proof-of-payment and UPI reference uploads for host review
- Shared transaction status visibility for farmers and Mango Traders

### ✅ Host Verification Layer

- Pre-activation review of Mango Trader registrations
- Approve/reject workflow for pending payments
- Automated farmer notifications on payment approval

---

## 📡 API Reference

Routes are organized into Flask blueprints by responsibility.

| Blueprint    | Prefix           | Purpose                                           |
| ------------ | ---------------- | ------------------------------------------------- |
| Auth         | `/auth`          | Registration, login, OTP, sessions                |
| Farmer       | `/farmer`        | Dashboard, markets, sell requests, profile        |
| Mango Trader | `/mango-trader`  | Dashboard, prices, requests, weighments, payments |
| Market       | `/market`        | Public marketplace access                         |
| Host         | `/api/host`      | Trader verification, payment review               |
| Admin        | `/api/admin`     | Admin-level trader management                     |
| Analytics    | `/api/analytics` | Business reporting endpoints                      |

**Notable Endpoints**

```http
POST   /auth/register
POST   /auth/login
GET    /farmer/markets
POST   /farmer/sell-request
GET    /mango-trader/dashboard
POST   /mango-trader/update-prices
POST   /mango-trader/request/<request_id>/status
POST   /mango-trader/weighment
POST   /api/host/verify-password
POST   /api/host/payments/<transaction_id>/approve
GET    /health
```

---

## 🔄 User Journeys

### Farmer Flow

1. Register and verify email via OTP
2. Log in and search markets by district
3. View Mango Trader prices and available varieties
4. Submit a sell request
5. Await trader acceptance or rejection
6. Track order status and payment progress

### Mango Trader Flow

1. Register and upload trade license
2. Await host approval
3. Publish market prices and commission rates
4. Review incoming sell requests
5. Record actual weighment and final price
6. Submit payment proof and UPI transaction details

### Host Flow

1. Log in with host credentials
2. Review pending Mango Trader applications
3. Approve or reject registrations
4. Review payment submissions and mark them paid or rejected

---

## 📁 Project Structure

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
└── .env.example
```

---

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- MySQL or MariaDB
- SMTP credentials (for OTP and email notifications)

### Installation

```bash
# Create and activate a virtual environment
python -m venv .venv
.\.venv\Scripts\Activate.ps1      # Windows PowerShell
# source .venv/bin/activate       # macOS/Linux

# Install dependencies
pip install -r requirements.txt
```

---

## ⚙️ Environment Variables

Create a `.env` file in the project root:

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

> ⚠️ **Never commit your `.env` file.** Add it to `.gitignore` and share only `.env.example` with placeholder values.

---

## ▶️ Running the App

```bash
python backend/app.py
```

Then visit:

| Page               | URL                                           |
| ------------------ | --------------------------------------------- |
| Landing Page       | http://127.0.0.1:5000/                        |
| Farmer Login       | http://127.0.0.1:5000/farmer_login.html       |
| Mango Trader Login | http://127.0.0.1:5000/mango_trader_login.html |
| Host Access        | http://127.0.0.1:5000/host_access.html        |

---

## 💡 Skills Demonstrated

This project reflects end-to-end product and engineering capability, including:

- Business requirement modeling and workflow design
- Relational database schema design (SQLAlchemy / MySQL)
- Role-based authorization and session management
- REST API development with Flask blueprints
- Secure handling of file uploads and sensitive data (encryption at rest)
- Multi-stage payment and verification logic
- Frontend–backend integration
- Real-world, multi-role marketplace orchestration

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

<p align="center">Built with care for a real-world agricultural marketplace 🥭</p>
