"""send_test_otp_cli.py
Utility to send one test OTP email from the command line.
Usage: python send_test_otp_cli.py recipient@example.com

This script loads environment variables (via python-dotenv) and calls
`send_test_otp_email` from `email_service`. It prints a friendly message and
returns a non-zero exit code on failure. It does NOT print SMTP_PASSWORD.
"""
import sys
import logging
from dotenv import load_dotenv

load_dotenv()

if __name__ == '__main__':
    if len(sys.argv) != 2:
        print("Usage: python send_test_otp_cli.py recipient@example.com")
        sys.exit(2)
    recipient = sys.argv[1]
    from email_service import send_test_otp_email

    logging.basicConfig(level=logging.INFO)
    res = send_test_otp_email(recipient)
    if res.get('success'):
        print(res.get('message'))
        sys.exit(0)
    else:
        logging.error(res.get('message'))
        sys.exit(1)
