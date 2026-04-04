# SMTP / OTP Configuration (Mango Market Platform)

🔧 Quick guide to configure SMTP for sending OTP emails in production.

## Environment variables (required)
- SMTP_SERVER - e.g. `smtp.gmail.com`
- SMTP_PORT - `465` for Gmail SMTP_SSL
- SMTP_EMAIL - your SMTP user (email address)
- SMTP_PASSWORD - SMTP password or app-specific password (keep secret)

> Set these values using your system environment or CI secrets. Do NOT commit secrets to the repo.

## Gmail notes
- For Gmail, create an "App password" in Google account security settings and use it as `SMTP_PASSWORD`.
- Ensure `SMTP_SERVER=smtp.gmail.com` and `SMTP_PORT=465` for full SSL.

## Testing
- Use `python send_test_otp_cli.py recipient@example.com` to send a single OTP for testing.
- Ensure env vars are set (load from `.env` in development) before running the script.

## Security
- `email_service` validates all required env vars at runtime and logs missing variable names (never logs secrets).
- In production, prefer storing secrets in a secret manager and injecting them at runtime.
