import pytest

from backend.main import Farmer, Place, User, create_app, db, hash_password


@pytest.fixture()
def app():
    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
        'SECRET_KEY': 'test-secret-key',
        'WTF_CSRF_ENABLED': False,
    })

    with app.app_context():
        place = Place(state='TestState', district='TestDistrict', market_area='TestMarket')
        db.session.add(place)
        db.session.flush()

        user = User(
            name='Single Session Farmer',
            phone='9000000001',
            email='single@example.com',
            password_hash=hash_password('TestPass123!'),
            role='FARMER',
        )
        db.session.add(user)
        db.session.flush()

        db.session.add(Farmer(user_id=int(user.id), place_id=int(place.id)))
        db.session.commit()

    yield app


def test_new_login_invalidates_previous_cookie_and_token(app):
    first_client = app.test_client()
    second_client = app.test_client()

    first_login = first_client.post('/auth/login', json={
        'identifier': '9000000001',
        'password': 'TestPass123!',
    })
    assert first_login.status_code == 200
    first_token = first_login.get_json()['session_token']

    assert first_client.get('/auth/me').status_code == 200
    assert first_client.get('/auth/me', headers={'Authorization': f'Bearer {first_token}'}).status_code == 200

    second_login = second_client.post('/auth/login', json={
        'identifier': '9000000001',
        'password': 'TestPass123!',
    })
    assert second_login.status_code == 200
    second_token = second_login.get_json()['session_token']
    assert second_token != first_token

    assert first_client.get('/auth/me').status_code == 401
    assert first_client.get('/auth/me', headers={'Authorization': f'Bearer {first_token}'}).status_code == 401
    assert second_client.get('/auth/me', headers={'Authorization': f'Bearer {second_token}'}).status_code == 200
