import os
import sys
import time
import random

API_BASE = os.environ.get('API_BASE', 'http://127.0.0.1:5000')

def ensure_requests():
    try:
        import requests
        return requests
    except Exception:
        import subprocess
        subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'requests'])
        import requests
        return requests


requests = ensure_requests()


def wait_for_server(timeout=10):
    deadline = time.time() + timeout
    url = API_BASE + '/'
    while time.time() < deadline:
        try:
            r = requests.get(API_BASE + '/auth/check-email', params={'email': 'test@example.com'}, timeout=2)
            return True
        except Exception:
            time.sleep(0.5)
    return False


def random_phone():
    return ''.join(str(random.randint(0,9)) for _ in range(10))


def test_farmer_register_and_login():
    phone = random_phone()
    payload = {
        'full_name': 'E2E Test Farmer',
        'phone': phone,
        'password': 'TestPass123!',
        'state': 'TestState',
        'district': 'TestDistrict',
        'market_area': 'TestMarket',
        'role': 'FARMER'
    }

    print('Registering farmer with phone:', phone)
    r = requests.post(API_BASE + '/auth/register', json=payload, timeout=10)
    print('Status code:', r.status_code, 'Body:', r.text)
    if r.status_code not in (200,201):
        print('FAILED: Farmer registration did not succeed')
        return False
    data = r.json()
    if not data.get('user_id'):
        print('FAILED: No user_id in register response')
        return False

    # Try duplicate registration - should fail (409) or at least not create duplicate
    r2 = requests.post(API_BASE + '/auth/register', json=payload, timeout=10)
    print('Duplicate register status:', r2.status_code)

    # Login
    login = requests.post(API_BASE + '/auth/login', json={'identifier': phone, 'password': payload['password']}, timeout=10)
    print('Login status:', login.status_code, 'Body:', login.text)
    if login.status_code != 200:
        print('FAILED: Login failed')
        return False
    session = login.json()
    token = session.get('session_token') or session.get('token')

    # Get current user
    headers = {}
    if token:
        headers['X-Session-Token'] = token
    me = requests.get(API_BASE + '/auth/me', headers=headers, timeout=10)
    print('/auth/me status:', me.status_code, 'Body:', me.text)
    if me.status_code != 200:
        print('FAILED: /auth/me failed')
        return False

    print('E2E farmer register/login test PASSED')
    return True


if __name__ == '__main__':
    print('API_BASE =', API_BASE)
    ok = wait_for_server(15)
    if not ok:
        print('Server did not respond in time')
        sys.exit(2)

    success = test_farmer_register_and_login()
    sys.exit(0 if success else 1)
