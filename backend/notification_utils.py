"""
Notification utility for Mango Market Platform.
Supports email, SMS, and app notifications (mocked for now).
Replace with real integrations as needed.
"""
import logging

def send_notification(user, subject, message, channels=None):
    """
    Send notification to user via specified channels.
    channels: list of 'email', 'sms', 'app'. If None, send all.
    """
    if channels is None:
        channels = ['email', 'sms', 'app']
    for channel in channels:
        if channel == 'email':
            try:
                from email_service import send_email
                email = getattr(user, 'email', None)
                if email:
                    success = send_email(email, subject, message)
                    if not success:
                        logging.error(f"Failed to send email notification to %s", email)
                else:
                    logging.warning("User has no email for notification: %s", user)
            except ValueError as ve:
                logging.error("Email config error: %s", ve)
            except Exception as e:
                logging.exception("Unexpected error sending email notification: %s", e)
        elif channel == 'sms':
            # TODO: Integrate with real SMS gateway
            logging.info(f"[SMS] To: {getattr(user, 'phone', None)} | Message: {message}")
        elif channel == 'app':
            # TODO: Integrate with app push notification
            logging.info(f"[APP] To: {getattr(user, 'id', None)} | Message: {message}")
        else:
            logging.warning(f"Unknown notification channel: {channel}")
