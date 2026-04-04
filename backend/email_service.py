"""
Email and OTP Service for Mango Market Platform
Production-ready, secure, and reusable email/OTP logic.
"""
import os
import logging
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Dict, Any
from threading import Lock
from datetime import datetime, timedelta, timezone
import secrets
import socket

# Do NOT load dotenv at import time here. Call load_dotenv() at application startup.

# OTP in-memory store (thread-safe for demo; use Redis/DB for prod)
_otp_store: Dict[str, Dict[str, Any]] = {}
_otp_lock = Lock()

# --- ENVIRONMENT VALIDATION ---
def _get_smtp_config():
    smtp_server = os.getenv("SMTP_SERVER")
    smtp_port = os.getenv("SMTP_PORT")
    smtp_email = os.getenv("SMTP_EMAIL")
    smtp_password = os.getenv("SMTP_PASSWORD")
    missing = [k for k, v in {
        'SMTP_SERVER': smtp_server,
        'SMTP_PORT': smtp_port,
        'SMTP_EMAIL': smtp_email,
        'SMTP_PASSWORD': smtp_password
    }.items() if not v]
    if missing:
        logging.error(f"Missing SMTP config: {', '.join(missing)}")
        raise ValueError(f"Missing SMTP config: {', '.join(missing)}")
    # Type asserts to satisfy type checkers
    assert smtp_server is not None
    assert smtp_port is not None
    assert smtp_email is not None
    assert smtp_password is not None
    return str(smtp_server), int(smtp_port), str(smtp_email), str(smtp_password)

# --- EMAIL SENDING ---
def send_email(to_email: str, subject: str, body: str) -> bool:
    smtp_server, smtp_port, smtp_email, smtp_password = _get_smtp_config()
    try:
        msg = MIMEMultipart()
        msg['From'] = smtp_email
        msg['To'] = to_email
        msg['Subject'] = subject
        msg.attach(MIMEText(body, 'html'))
        with smtplib.SMTP_SSL(smtp_server, smtp_port, timeout=10) as server:
            try:
                server.login(smtp_email, smtp_password)
            except smtplib.SMTPAuthenticationError as e:
                logging.error(f"SMTP authentication failed for {smtp_email}: {e}")
                return False
            server.send_message(msg)
        logging.info(f"Email sent to {to_email}")
        return True
    except (smtplib.SMTPAuthenticationError, smtplib.SMTPException) as e:
        logging.error(f"SMTP error sending to {to_email}: {e}")
        return False
    except socket.timeout:
        logging.error(f"SMTP connection timed out sending to {to_email}")
        return False
    except Exception as e:
        logging.error(f"Unknown error sending email to {to_email}: {e}")
        return False

# --- OTP GENERATION, STORAGE, SENDING ---
def generate_otp(email: str) -> str:
    # Use secrets for cryptographically secure random generation
    otp = f"{secrets.randbelow(900000) + 100000:06d}"
    expiry = datetime.now(timezone.utc) + timedelta(minutes=5)
    with _otp_lock:
        _otp_store[email] = {'otp': otp, 'expires': expiry}
    return otp

def send_otp_email(email: str) -> bool:
    otp = generate_otp(email)
    subject = "Your Mango Market OTP"
    body = f"<h2>Your OTP is: <span style='color:green'>{otp}</span></h2><p>This OTP is valid for 5 minutes.</p>"
    return send_email(email, subject, body)

def verify_otp_check(email: str, otp: str) -> bool:
    """Verify OTP without deleting it (for step 2 verification)."""
    with _otp_lock:
        entry = _otp_store.get(email)
        if not entry:
            return False
        if entry['otp'] != otp:
            return False
        if datetime.now(timezone.utc) > entry['expires']:
            del _otp_store[email]
            return False
        return True

def verify_otp(email: str, otp: str) -> bool:
    """Verify OTP and delete it (for step 3 password reset)."""
    with _otp_lock:
        entry = _otp_store.get(email)
        if not entry:
            return False
        if entry['otp'] != otp:
            return False
        if datetime.now(timezone.utc) > entry['expires']:
            del _otp_store[email]
            return False
        del _otp_store[email]
        return True

# --- TEST/VERIFICATION ENDPOINT LOGIC ---
from typing import Dict

def send_test_otp_email(email: str) -> Dict[str, object]:
    success = send_otp_email(email)
    if success:
        return {"success": True, "message": f"OTP email sent to {email}"}
    else:
        return {"success": False, "message": f"Failed to send OTP email to {email}"}


def send_weighment_confirmation_email(
    farmer_email: str,
    farmer_name: str,
    broker_name: str,
    market_name: str,
    final_weight_tons: float,
    final_price_per_kg: float,
    mango_variety: str,
    weighment_date: str
) -> bool:
    """Send weighment confirmation email to farmer after weighment is recorded.
    
    Args:
        farmer_email: Farmer's email address
        farmer_name: Farmer's full name
        broker_name: Broker/market name
        market_name: Market area/location
        final_weight_tons: Final weight in tons
        final_price_per_kg: Final price per kg
        mango_variety: Mango variety
        weighment_date: Formatted date string (DD-MMM-YYYY)
    
    Returns:
        True if email sent successfully, False otherwise
    """
    subject = f"Weighment Confirmation - Order Processed"
    
    total_amount = final_weight_tons * 1000 * final_price_per_kg
    
    body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #e65100;">🥭 Weighment Confirmation</h2>
                
                <p>Dear <strong>{farmer_name}</strong>,</p>
                
                <p>Your mango weighment has been successfully recorded at <strong>{broker_name}</strong>, {market_name}.</p>
                
                <div style="background: #f5f5f5; padding: 15px; border-left: 4px solid #e65100; margin: 20px 0;">
                    <p><strong>Weighment Details:</strong></p>
                    <table style="width: 100%; margin-top: 10px;">
                        <tr>
                            <td style="padding: 8px 0;">Weighment Date:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{weighment_date}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Mango Variety:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{mango_variety}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Final Weight:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{final_weight_tons:.2f} Tons ({final_weight_tons * 1000:.0f} kg)</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Price per kg:</td>
                            <td style="padding: 8px 0; font-weight: bold;">₹{final_price_per_kg:.2f}</td>
                        </tr>
                        <tr style="border-top: 2px solid #e65100; font-size: 1.1em;">
                            <td style="padding: 12px 0; font-weight: bold;">Total Amount:</td>
                            <td style="padding: 12px 0; font-weight: bold; color: #2e7d32;">₹{total_amount:,.2f}</td>
                        </tr>
                    </table>
                </div>
                
                <p>Your payment will be processed shortly. You can track your transaction status in your farmer dashboard.</p>
                
                <p style="margin-top: 30px; color: #666; font-size: 0.9em;">
                    Thank you for choosing Mango Market Platform!<br>
                    Best regards,<br>
                    <strong>Mango Market Team</strong>
                </p>
            </div>
        </body>
    </html>
    """
    
    return send_email(farmer_email, subject, body)
