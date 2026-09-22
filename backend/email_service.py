"""
Email and OTP Service for Mango Market Platform
Production-ready, secure, and reusable email/OTP logic.
"""
import json
import logging
import os
import secrets
import smtplib
import socket
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from threading import Lock
from typing import Any, Dict
from urllib import error as urllib_error
from urllib import request as urllib_request

# Do NOT load dotenv at import time here. Call load_dotenv() at application startup.

# OTP in-memory store (thread-safe for demo; use Redis/DB for prod)
_otp_store: Dict[str, Dict[str, Any]] = {}
_otp_lock = Lock()


def _mask_email(email: str) -> str:
    if not email or '@' not in email:
        return "[redacted]"
    local, domain = email.split('@', 1)
    return f"{local[:2]}***@{domain}"


def _get_email_provider() -> str:
    provider = (os.getenv("EMAIL_PROVIDER") or "api").strip().lower()
    if provider not in {"smtp", "api"}:
        raise ValueError("Unsupported email provider configured")
    return provider


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
        logging.error("Missing SMTP config: %s", ', '.join(missing))
        raise ValueError(f"Missing SMTP config: {', '.join(missing)}")
    return str(smtp_server), int(smtp_port), str(smtp_email), str(smtp_password)


def _get_api_config() -> tuple[str, str]:
    api_key = (os.getenv("EMAIL_API_KEY") or "").strip()
    sender_email = (os.getenv("EMAIL_FROM") or "").strip()
    missing = [name for name, value in {
        'EMAIL_API_KEY': api_key,
        'EMAIL_FROM': sender_email,
    }.items() if not value]
    if missing:
        logging.error("Production email API configuration is missing")
        raise ValueError("Production email API configuration is missing")
    return api_key, sender_email


def _send_email_via_api(to_email: str, subject: str, body: str) -> bool:
    try:
        api_key, sender_email = _get_api_config()
    except ValueError:
        raise

    url = "https://api.resend.com/emails"
    payload = {
        "from": sender_email,
        "to": [to_email],
        "subject": subject,
        "html": body,
    }
    data = json.dumps(payload).encode("utf-8")
    req = urllib_request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "MangoMarket-Backend/1.0",
        },
        method="POST",
    )

    try:
        with urllib_request.urlopen(req, timeout=15) as response:
            status = getattr(response, "status", response.getcode())
            if 200 <= status < 300:
                logging.info("Email API sent successfully to %s", _mask_email(to_email))
                return True
            response_text = response.read().decode("utf-8", "replace")
            safe_details = response_text[:500].replace(api_key, "[redacted]")
            logging.error("Email API rejected send to %s with status %s: %s", _mask_email(to_email), status, safe_details)
            return False
    except urllib_error.HTTPError as exc:
        details = exc.read().decode("utf-8", "replace")[:500]
        safe_details = details.replace(api_key, "[redacted]")
        logging.error("Email API HTTP error for %s: %s %s", _mask_email(to_email), exc.code, safe_details)
        return False
    except urllib_error.URLError as exc:
        logging.error("Email API network error for %s: %s", _mask_email(to_email), exc.reason)
        return False
    except Exception as exc:  # pragma: no cover - broad fallback for runtime issues
        logging.exception("Unexpected email API failure for %s", _mask_email(to_email))
        return False


def _send_email_via_smtp(to_email: str, subject: str, body: str) -> bool:
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
                logging.error("SMTP authentication failed for %s: %s", _mask_email(smtp_email), e)
                return False
            server.send_message(msg)
        logging.info("SMTP email sent to %s", _mask_email(to_email))
        return True
    except (smtplib.SMTPAuthenticationError, smtplib.SMTPException) as e:
        logging.error("SMTP error sending to %s: %s", _mask_email(to_email), e)
        return False
    except socket.timeout:
        logging.error("SMTP connection timed out sending to %s", _mask_email(to_email))
        return False
    except Exception as e:
        logging.exception("Unknown error sending email to %s", _mask_email(to_email))
        return False


# --- EMAIL SENDING ---
def send_email(to_email: str, subject: str, body: str) -> bool:
    provider = _get_email_provider()
    try:
        if provider == "api":
            return _send_email_via_api(to_email, subject, body)
        if provider == "smtp":
            return _send_email_via_smtp(to_email, subject, body)
        logging.error("Unsupported email provider configured: %s", provider)
        return False
    except ValueError as exc:
        logging.error("%s", exc)
        raise

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


def send_payment_verified_email(
    farmer_email: str,
    farmer_name: str,
    market_name: str,
    order_id: str,
    mango_variety: str,
    total_amount: float,
    commission_rate: float,
    commission_amount: float,
    credited_amount: float,
    upi_transaction_id: str,
    upi_id: str,
    payment_date: str,
    verified_date: str
) -> bool:
    """Send payment confirmation email after host verifies broker payment."""
    subject = "Payment Verified - Amount Credited"

    body = f"""
    <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 640px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #2e7d32;">Payment debited Successfully</h2>

                <p>Dear <strong>{farmer_name}</strong>,</p>

                <p>Your payment from <strong>{market_name}</strong> has been verified by the host and marked as successfully paid.</p>

                <div style="background: #f5f5f5; padding: 16px; border-left: 4px solid #2e7d32; margin: 20px 0;">
                    <p style="margin-top: 0;"><strong>Payment Calculation</strong></p>
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0;">Order ID:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{order_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Mango Variety:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{mango_variety}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Total Amount:</td>
                            <td style="padding: 8px 0; font-weight: bold;">&#8377;{total_amount:,.2f}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Commission ({commission_rate:.2f} per &#8377;100):</td>
                            <td style="padding: 8px 0; font-weight: bold; color: #c62828;">- &#8377;{commission_amount:,.2f}</td>
                        </tr>
                        <tr style="border-top: 2px solid #2e7d32; font-size: 1.1em;">
                            <td style="padding: 12px 0; font-weight: bold;">Total Amount Credited:</td>
                            <td style="padding: 12px 0; font-weight: bold; color: #2e7d32;">&#8377;{credited_amount:,.2f}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">UPI ID:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{upi_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">UPI Transaction ID:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{upi_transaction_id}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Payment Date:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{payment_date}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;">Verified Date:</td>
                            <td style="padding: 8px 0; font-weight: bold;">{verified_date}</td>
                        </tr>
                    </table>
                </div>

                <p>Please check your bank account or UPI app balance to confirm the credited amount.</p>

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
