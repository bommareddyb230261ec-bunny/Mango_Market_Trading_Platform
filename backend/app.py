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
    app.run(
        debug=True,
        host='0.0.0.0',
        port=5000,
        use_reloader=True,
        threaded=True,
    )