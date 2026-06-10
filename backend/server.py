"""
Mango Market Platform - Flask Server Entry Point
Uses the modular Flask application factory architecture
"""

import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

try:
    from backend.app import create_app
except ImportError:
    from app import create_app

# Create Flask application
app = create_app()

if __name__ == '__main__':
    # Run development server on port 5000
    app.run(
        debug=True,
        host='127.0.0.1',
        port=5000,
        use_reloader=False,
        threaded=False
    )
    phone: str
    email: EmailStr
    password: str
    role: str
    state: str
    district: str
    market_area: str
    bank_account: str
    ifsc: str
    upi_id: str | None = None


# 4. Email/OTP logic is now in email_service.py
import logging

# 5. Routes
api = APIRouter(prefix="/api/auth")


@api.post("/send-otp")
async def send_otp(request: Request, data: OTPRequest) -> Dict[str, object]:
    try:
        success = send_otp_email(data.email)
    except ValueError as ve:
        logging.error(str(ve))
        return {"success": False, "message": str(ve)}
    except Exception as e:
        logging.error(f"Unexpected error sending OTP: {e}")
        return {"success": False, "message": "Failed to send OTP email. Please try again later."}
    if success:
        return {"success": True, "message": "OTP sent"}
    else:
        return {"success": False, "message": "Failed to send OTP email. Please check your SMTP configuration."}

@api.post("/verify-otp")
async def verify_otp_route(request: Request, data: VerifyRequest) -> Dict[str, object]:
    if verify_otp_check(data.email, data.otp):
        request.session[f"verified_{data.email}"] = True
        return {"success": True, "message": "Verified"}
    return {"success": False, "message": "Invalid or expired OTP"}

@api.post("/register")
async def register(request: Request, data: RegisterRequest) -> Dict[str, object]:
    # Security Check: Ensure email was verified in this session
    if not request.session.get(f"verified_{data.email}"):
        return {"success": False, "message": "Email not verified"}

    users_collection = db["users"]
    existing = await users_collection.find_one({"email": data.email})
    if existing:
        return {"success": False, "message": "User already exists"}

    user_data = data.model_dump()
    user_data["user_id"] = str(uuid.uuid4())
    import datetime as dt
    user_data["created_at"] = dt.datetime.now(dt.timezone.utc)
    
    await users_collection.insert_one(user_data)
    
    return {"success": True, "message": "Created"}

@api.post("/test-otp-email")
async def test_otp_email(data: OTPRequest) -> Dict[str, object]:
    return send_test_otp_email(data.email)

app.include_router(api)
