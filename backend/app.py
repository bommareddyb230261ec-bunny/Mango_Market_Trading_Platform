"""
Mango Market Platform - Entry Point
Imports create_app from consolidated main.py
Handles all three systems: Farmer, Broker, and Host
"""
import sys
import os
from dotenv import load_dotenv

load_dotenv()

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from main import create_app

if __name__ == '__main__':
    print("\nStarting Mango Market Platform...")
    print("   Creating Flask app with all systems (Farmer, Broker, Host)...\n")
    
    app = create_app()
    
    print("\nStarting server on http://127.0.0.1:5000")
    print("   Press CTRL+C to stop\n")
    
    app.run(
        debug=True,
        host='0.0.0.0',
        port=5000,
        use_reloader=True,
        threaded=True,
    )