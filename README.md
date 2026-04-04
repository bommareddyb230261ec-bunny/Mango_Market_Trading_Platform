# Mango Market Platform

A comprehensive digital marketplace platform connecting **Farmers**, **Brokers**, and **Host Administrators** for seamless agricultural trading and transaction management.

## 📋 Project Overview

The Mango Market Platform is a full-stack web application designed to facilitate agricultural commerce by providing:

- **Farmer Portal**: Sell mango products, manage profiles, track transactions
- **Broker Portal**: Access trade opportunities, manage licenses, process transactions
- **Admin Dashboard**: Verify broker credentials, manage platform, monitor transactions
- **Secure Authentication**: Role-based access control (Farmer, Broker, Host)
- **Email Notifications**: SMTP-based alerts and OTP verification
- **Payment Processing**: Integrated payment workflow
- **Trade License Verification**: Host verification system for broker credentials

## 🏗️ Tech Stack

### Backend
- **Framework**: Flask 2.3+
- **Database**: MySQL (with SQLAlchemy ORM)
- **API**: RESTful endpoints with CORS support
- **Authentication**: Password hashing with Werkzeug
- **Email**: SMTP configuration for notifications
- **Security**: Encryption utilities for sensitive data
- **Async Support**: FastAPI + Uvicorn + Motor (MongoDB support)

### Frontend
- **Markup**: HTML5
- **Styling**: Custom CSS (responsive design)
- **Interactivity**: Vanilla JavaScript with API integration
- **Pages**: Role-based dashboards, authentication, transactions, payment processing

### Dependencies
```
Flask, Flask-CORS, Flask-SQLAlchemy
SQLAlchemy 2.0+
PyMySQL (MySQL driver)
FastAPI, Uvicorn, Pydantic
Python-dotenv (environment management)
Cryptography (data encryption)
Email-validator
Pytest (testing framework)
```

## 📁 Project Structure

```
mango-market-platform_learning/
├── backend/
│   ├── app.py                    # Flask application setup
│   ├── main.py                   # Consolidated Flask app with routes
│   ├── db.py                     # Database initialization
│   ├── db_config.py              # Database configuration
│   ├── create_db.py              # Database schema creation
│   ├── manage_db.py              # Database management utilities
│   ├── server.py                 # Server entry point
│   ├── email_service.py          # Email/SMTP service
│   ├── encryption_utils.py       # Data encryption utilities
│   ├── audit_utils.py            # Audit logging
│   ├── notification_utils.py     # Notification system
│   ├── send_test_otp_cli.py      # CLI for testing OTP
│   ├── routes/
│   │   ├── __init__.py
│   │   └── host_routes.py        # Host verification routes
│   ├── instance/uploads/         # File upload directory
│   └── .env                       # Environment variables
├── frontend/
│   ├── html/
│   │   ├── home.html
│   │   ├── farmer_login.html
│   │   ├── farmer_dashboard.html
│   │   ├── farmer_profile.html
│   │   ├── broker_login.html
│   │   ├── broker_dashboard.html
│   │   ├── broker_profile.html
│   │   ├── host_access.html
│   │   ├── host_dashboard.html
│   │   ├── new_farmer_register.html
│   │   ├── new_broker_register.html
│   │   ├── payments.html
│   │   ├── transactions.html
│   │   ├── sell_request.html
│   │   ├── weighment.html
│   │   └── accepted.html
│   ├── css/                      # Styling for each page/component
│   ├── js/
│   │   ├── api.js               # API communication layer
│   │   ├── auth.js              # Authentication logic
│   │   ├── payment_processor.js # Payment handling
│   │   └── [page-specific JS files]
│   └── assets/images/           # Image resources
├── tests/
│   └── e2e_tests.py             # End-to-end testing
├── requirements.txt              # Python dependencies
├── .env                          # Environment configuration
└── README.md                     # This file
```

## 🚀 Getting Started

### Prerequisites
- Python 3.8+
- MySQL Server (5.7+)
- Git
- pip/venv for dependency management

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd mango-market-platform_learning
   ```

2. **Create and activate virtual environment**
   ```bash
   # Windows
   python -m venv venv
   venv\Scripts\activate
   
   # Linux/macOS
   python3 -m venv venv
   source venv/bin/activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure environment variables**
   - Copy `.env` file to backend directory (already configured with defaults)
   - Update database credentials if needed:
     ```env
     DB_HOST=localhost
     DB_PORT=3306
     DB_USER=root
     DB_PASSWORD=<your_password>
     DB_NAME=mango_market_db
     ```
   - Configure SMTP for email:
     ```env
     SMTP_SERVER=smtp.gmail.com
     SMTP_PORT=465
     SMTP_EMAIL=<your_email>
     SMTP_PASSWORD=<your_app_password>
     ```

5. **Create database and tables**
   ```bash
   cd backend
   python create_db.py
   ```

6. **Run the backend server**
   ```bash
   # Using Flask
   python main.py
   
   # Or using the server script
   python server.py
   ```
   
   The backend will be available at `http://localhost:5000` (or configured port)

7. **Open frontend in browser**
   - Navigate to `frontend/html/home.html` or serve via a local web server
   - Frontend communicates with backend API at configured endpoint

### Testing
```bash
# Run end-to-end tests
python -m pytest tests/e2e_tests.py -v

# Run specific tests
python -m pytest tests/e2e_tests.py::test_name -v
```

## 🔑 Key Features

### User Roles

#### 👨‍🌾 Farmer
- User registration and login
- Profile management
- Create and manage sell requests
- View transaction history
- Track payments
- Participate in weighment process

#### 💼 Broker
- User registration and login (with trade license verification)
- Dashboard for available trade opportunities
- License verification process
- Profile management
- Transaction management
- Payment processing

#### 🏛️ Host/Admin
- Access to admin dashboard
- Verify broker trade licenses
- Monitor all transactions
- Platform management
- System oversight

### Core Functionality
- **Authentication**: Secure login with role-based access
- **Email Notifications**: Automated OTP and transaction alerts
- **Trade License Management**: Upload and verify broker credentials
- **Payment Integration**: Process payments and track status
- **Transaction History**: Complete audit trail of all transactions
- **Weighment System**: Track produce weight and quality
- **File Upload**: Secure file handling for documents

## 🔐 Security Features

- Password hashing with Werkzeug
- CORS protection
- Environment-based configuration (no secrets in code)
- Encryption utilities for sensitive data
- Audit logging for compliance
- Session management with secure cookies
- Input validation and SQL injection prevention

## 📧 Email Configuration

The platform uses SMTP for notifications. Configure in `.env`:

```env
SMTP_SERVER=smtp.gmail.com
SMTP_PORT=465
SMTP_EMAIL=your_email@gmail.com
SMTP_PASSWORD=your_app_specific_password
```

For Gmail users:
1. Enable 2-factor authentication
2. Generate an app-specific password
3. Use the app password in `SMTP_PASSWORD`

## 🗄️ Database Schema

Key tables (created automatically):
- `users` - User accounts (farmers, brokers, admin)
- `farmers` - Farmer-specific data
- `brokers` - Broker-specific data with license info
- `transactions` - Transaction records
- `trade_licenses` - Broker license documents
- `payments` - Payment records
- `notifications` - Notification history
- `places` - Location/market data

## 📝 API Endpoints

### Authentication
- `POST /login` - User login
- `POST /register` - User registration
- `POST /logout` - User logout

### Farmer Routes
- `GET /farmer/dashboard` - Farmer dashboard data
- `POST /farmer/sell-request` - Create sell request
- `GET /farmer/transactions` - View transactions

### Broker Routes
- `GET /broker/dashboard` - Broker dashboard
- `GET /broker/opportunities` - Available trades
- `POST /broker/verify-license` - License verification

### Host Routes
- `GET /admin/dashboard` - Admin dashboard
- `POST /admin/verify-broker/:id` - Verify broker

## 🧪 Testing

Run end-to-end tests to verify functionality:
```bash
cd backend
python -m pytest ../tests/e2e_tests.py -v --cov
```

## 📝 Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | localhost |
| `DB_PORT` | MySQL port | 3306 |
| `DB_USER` | Database user | root |
| `DB_PASSWORD` | Database password | your_password |
| `DB_NAME` | Database name | mango_market_db |
| `SMTP_SERVER` | Email server | smtp.gmail.com |
| `SMTP_PORT` | Email port | 465 |
| `SMTP_EMAIL` | Sender email | your_email@gmail.com |
| `SECRET_KEY` | Flask secret | mango_market_secure_key_2026 |
| `ENVIRONMENT` | App environment | development |

## 🛠️ Development

### File Upload
- Trade licenses uploaded to `backend/instance/uploads/trade_licenses/`
- Implement secure file validation before storage

### Database Management
```bash
# Create fresh database
python backend/create_db.py

# Run migrations (if using alembic)
alembic upgrade head
```

### Running Database CLI
```bash
python backend/manage_db.py
```

## 🚨 Known Issues & Todos

- Host password currently stored as plaintext (production fix: hash and salt)
- Implement proper session timeout
- Add rate limiting for API endpoints
- Add comprehensive error handling
- Production-ready deployment configuration
- HTTPS/SSL certificate setup
- Database backup automation

## 📚 Additional Documentation

- See `backend/SMTP_README.md` for detailed SMTP configuration
- Check route files in `backend/routes/` for API documentation
- Review `backend/encryption_utils.py` for security utilities

## 🤝 Contributing

1. Create a feature branch (`git checkout -b feature/AmazingFeature`)
2. Commit changes (`git commit -m 'Add AmazingFeature'`)
3. Push to branch (`git push origin feature/AmazingFeature`)
4. Open a pull request

## 📄 License

This project is part of a learning initiative. Use with appropriate licensing.

## 👨‍💼 Authors

- Mango Market Platform Development Team

## 📧 Support

For issues or questions, please create an issue in the repository or contact the development team.

---

**Last Updated**: April 2026
**Version**: 1.0.0 (Learning Edition)
