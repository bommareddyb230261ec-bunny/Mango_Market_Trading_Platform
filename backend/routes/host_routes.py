"""
Host Verification Routes
Routes for host/platform owner to verify broker trade licenses
"""

from flask import Blueprint, request, jsonify

try:
    # Try importing from backend context
    from backend.main import db, Broker, User, Place, Transaction, Weighment, Farmer, SellRequest
except (ImportError, ModuleNotFoundError):
    # Fallback for direct module import
    try:
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from main import db, Broker, User, Place, Transaction, Weighment, Farmer, SellRequest
    except (ImportError, ModuleNotFoundError):
        # Last resort - import what we can
        from main import db


# =====================================================
# BLUEPRINTS - HOST VERIFICATION ROUTES
# =====================================================

host_bp = Blueprint('host', __name__)

# Note: Host password is stored as plaintext for simplicity
# In production, this should be hashed and stored securely
HOST_PASSWORD = "Charan.56"


@host_bp.route('/verify-password', methods=['POST'])
def verify_host_password():
    """
    Verify host password for access to verification panel
    
    Request body:
    {
        "password": "Charan.56"
    }
    
    Response:
    {
        "success": true/false,
        "message": "...",
        "access_granted": true/false
    }
    """
    try:
        data = request.get_json() or {}
        password = (data.get('password') or '').strip()
        
        if not password:
            return jsonify({
                'success': False,
                'message': 'Password is required',
                'access_granted': False
            }), 400
        
        # Verify password
        if password == HOST_PASSWORD:
            return jsonify({
                'success': True,
                'message': 'Access granted',
                'access_granted': True
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Access Denied: Invalid Host Password',
                'access_granted': False
            }), 401
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error: {str(e)}',
            'access_granted': False
        }), 500


@host_bp.route('/verify', methods=['POST'])
def verify_host():
    """
    Verify host password for access to verification panel
    Simplified endpoint for direct password verification
    
    Request body:
    {
        "password": "Charan.56"
    }
    
    Response:
    {
        "success": true/false,
        "message": "...",
    }
    """
    try:
        data = request.get_json() or {}
        password = data.get('password', '')
        
        # Verify password
        if password == HOST_PASSWORD:
            return jsonify({
                'success': True,
                'message': 'Access granted'
            }), 200
        else:
            return jsonify({
                'success': False,
                'message': 'Invalid host password'
            }), 401
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error: {str(e)}'
        }), 500


@host_bp.route('/brokers/pending', methods=['GET'])
def get_pending_brokers():
    """
    Get all pending broker registrations for verification
    
    Returns list of brokers where verification_status = "PENDING"
    
    Response:
    [
        {
            "id": 12,
            "broker_name": "Suraj",
            "market_name": "Suraj Market & Co",
            "phone": "9876543210",
            "email": "suraj@email.com",
            "location": "Vijayawada, Krishna, Andhra Pradesh",
            "trade_license": "/uploads/trade_licenses/license12.pdf",
            "verification_status": "PENDING",
            "registration_date": "2026-01-15T10:30:00"
        }
    ]
    """
    try:
        # Query all brokers with PENDING verification status
        pending_brokers = Broker.query.filter_by(
            verification_status="PENDING"
        ).all()
        
        brokers_data = []
        for broker in pending_brokers:
            user = User.query.get(broker.user_id)
            place = Place.query.get(broker.place_id)
            
            if user and place:
                location = f"{place.market_area}, {place.district}, {place.state}"
                
                brokers_data.append({
                    'id': broker.id,
                    'broker_name': user.name,
                    'market_name': broker.market_name,
                    'phone': user.phone,
                    'email': user.email or 'N/A',
                    'location': location,
                    'trade_license': broker.trade_license,
                    'verification_status': broker.verification_status,
                    'registration_date': broker.registration_date.isoformat() if broker.registration_date else None
                })
        
        return jsonify(brokers_data), 200
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to fetch pending brokers: {str(e)}'
        }), 500


@host_bp.route('/payments/pending', methods=['GET'])
def get_pending_payments():
    """
    Get all payments submitted by brokers that are awaiting host verification.
    """
    try:
        pending_statuses = ["INITIATED", "AWAITING_VERIFICATION", "SUBMITTED"]
        payments = []

        transactions = Transaction.query.filter(Transaction.payment_status.in_(pending_statuses)).all()
        for txn in transactions:
            sell_request = txn.sell_request
            farmer = None
            user = None
            if sell_request:
                farmer = Farmer.query.get(sell_request.farmer_id)
                if farmer:
                    user = User.query.get(farmer.user_id)

            payments.append({
                'transaction_id': str(txn.id),
                'type': 'transaction',
                'order_id': sell_request.order_id if sell_request else 'N/A',
                'farmer_name': user.name if user else (farmer.name if hasattr(farmer, 'name') else 'Farmer'),
                'phone': user.phone if user else '-',
                'amount': float(txn.net_payable or 0),
                'payment_status': txn.payment_status,
                'upi_transaction_id': txn.upi_transaction_id or '-',
                'payment_proof': txn.payment_proof,
                'payment_proof_url': f"/{txn.payment_proof}" if txn.payment_proof else None,
                'farmer_price': float(txn.market_price_at_sale or 0)
            })

        weighments = Weighment.query.filter(Weighment.payment_status.in_(pending_statuses)).all()
        for weighment in weighments:
            farmer = None
            user = None
            if weighment.farmer_id:
                farmer = Farmer.query.get(weighment.farmer_id)
                if farmer:
                    user = User.query.get(farmer.user_id)

            amount = (weighment.actual_weight_tons or 0) * 1000 * (weighment.final_price_per_kg or 0)
            payments.append({
                'transaction_id': f'w-{weighment.id}',
                'type': 'weighment',
                'order_id': weighment.order_id or 'N/A',
                'farmer_name': user.name if user else (weighment.farmer_name or 'Farmer'),
                'phone': user.phone if user else '-',
                'amount': float(amount),
                'payment_status': weighment.payment_status,
                'upi_transaction_id': weighment.upi_transaction_id or '-',
                'payment_proof': weighment.payment_proof,
                'payment_proof_url': f"/{weighment.payment_proof}" if weighment.payment_proof else None,
                'farmer_price': float(weighment.final_price_per_kg or 0)
            })

        return jsonify(payments), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to fetch pending payments: {str(e)}'
        }), 500


@host_bp.route('/payments/<path:transaction_id>/approve', methods=['POST'])
def approve_payment(transaction_id: str):
    """
    Approve a broker-submitted payment and mark it as PAID.
    """
    try:
        if not transaction_id or transaction_id.strip() == '':
            return jsonify({'success': False, 'message': 'transaction_id is required'}), 400

        transaction_id = transaction_id.strip()
        is_weighment = False
        if transaction_id.startswith('w-'):
            is_weighment = True
            transaction_id = transaction_id[2:]

        if is_weighment:
            try:
                record_id = int(transaction_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'Invalid transaction_id format'}), 400

            weighment = Weighment.query.get(record_id)
            if not weighment:
                return jsonify({'success': False, 'message': 'Weighment not found'}), 404

            weighment.payment_status = 'PAID'
            db.session.commit()

            return jsonify({'success': True, 'message': 'Weighment payment approved', 'transaction_id': f'w-{record_id}'}), 200

        try:
            record_id = int(transaction_id)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Invalid transaction_id format'}), 400

        transaction = Transaction.query.get(record_id)
        if not transaction:
            return jsonify({'success': False, 'message': 'Transaction not found'}), 404

        transaction.payment_status = 'PAID'
        db.session.commit()

        return jsonify({'success': True, 'message': 'Transaction payment approved', 'transaction_id': record_id}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error approving payment: {str(e)}'}), 500


@host_bp.route('/payments/<path:transaction_id>/reject', methods=['POST'])
def reject_payment(transaction_id: str):
    """
    Reject a broker-submitted payment and mark the payment record as REJECTED.
    """
    try:
        if not transaction_id or transaction_id.strip() == '':
            return jsonify({'success': False, 'message': 'transaction_id is required'}), 400

        transaction_id = transaction_id.strip()
        is_weighment = False
        if transaction_id.startswith('w-'):
            is_weighment = True
            transaction_id = transaction_id[2:]

        reason = (request.get_json() or {}).get('reason', '').strip()

        if is_weighment:
            try:
                record_id = int(transaction_id)
            except (ValueError, TypeError):
                return jsonify({'success': False, 'message': 'Invalid transaction_id format'}), 400

            weighment = Weighment.query.get(record_id)
            if not weighment:
                return jsonify({'success': False, 'message': 'Weighment not found'}), 404

            weighment.payment_status = 'REJECTED'
            db.session.commit()

            return jsonify({'success': True, 'message': 'Weighment payment rejected', 'transaction_id': f'w-{record_id}', 'reason': reason}), 200

        try:
            record_id = int(transaction_id)
        except (ValueError, TypeError):
            return jsonify({'success': False, 'message': 'Invalid transaction_id format'}), 400

        transaction = Transaction.query.get(record_id)
        if not transaction:
            return jsonify({'success': False, 'message': 'Transaction not found'}), 404

        transaction.payment_status = 'REJECTED'
        db.session.commit()

        return jsonify({'success': True, 'message': 'Transaction payment rejected', 'transaction_id': record_id, 'reason': reason}), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({'success': False, 'message': f'Error rejecting payment: {str(e)}'}), 500


@host_bp.route('/brokers/<int:broker_id>/approve', methods=['POST'])
def approve_broker(broker_id: int):
    """
    Approve a broker's trade license verification
    
    URL: /api/host/brokers/{id}/approve
    Method: POST
    
    Response:
    {
        "success": true,
        "message": "Broker approved successfully"
    }
    """
    try:
        broker = Broker.query.get(broker_id)
        
        if not broker:
            return jsonify({
                'success': False,
                'message': f'Broker with ID {broker_id} not found'
            }), 404
        
        # Update verification status to APPROVED
        broker.verification_status = "APPROVED"
        broker.rejection_reason = None
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Broker approved successfully',
            'broker_id': broker.id,
            'verification_status': broker.verification_status
        }), 200
    
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error approving broker: {str(e)}'
        }), 500


@host_bp.route('/brokers/<int:broker_id>/reject', methods=['POST'])
def reject_broker(broker_id: int):
    """
    Reject a broker's trade license verification
    
    URL: /api/host/brokers/{id}/reject
    Method: POST
    
    Request body (optional):
    {
        "reason": "License document is invalid or incomplete"
    }
    
    Response:
    {
        "success": true,
        "message": "Broker rejected"
    }
    """
    try:
        broker = Broker.query.get(broker_id)
        
        if not broker:
            return jsonify({
                'success': False,
                'message': f'Broker with ID {broker_id} not found'
            }), 404
        
        # Get rejection reason if provided
        data = request.get_json() or {}
        reason = (data.get('reason') or '').strip()
        
        # Update verification status to REJECTED
        broker.verification_status = "REJECTED"
        if reason:
            broker.rejection_reason = reason
        
        db.session.commit()
        
        return jsonify({
            'success': True,
            'message': 'Broker rejected',
            'broker_id': broker.id,
            'verification_status': broker.verification_status,
            'rejection_reason': broker.rejection_reason
        }), 200
    
    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error rejecting broker: {str(e)}'
        }), 500


@host_bp.route('/brokers/verified', methods=['GET'])
def get_verified_brokers():
    """
    Get all approved brokers
    
    Returns list of brokers where verification_status = "APPROVED"
    """
    try:
        approved_brokers = Broker.query.filter_by(
            verification_status="APPROVED"
        ).all()
        
        brokers_data = []
        for broker in approved_brokers:
            user = User.query.get(broker.user_id)
            place = Place.query.get(broker.place_id)
            
            if user and place:
                location = f"{place.market_area}, {place.district}, {place.state}"
                
                brokers_data.append({
                    'id': broker.id,
                    'broker_name': user.name,
                    'market_name': broker.market_name,
                    'phone': user.phone,
                    'email': user.email or 'N/A',
                    'location': location,
                    'verification_status': broker.verification_status,
                    'approval_date': broker.registration_date.isoformat() if broker.registration_date else None
                })
        
        return jsonify(brokers_data), 200
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to fetch verified brokers: {str(e)}'
        }), 500


@host_bp.route('/brokers/rejected', methods=['GET'])
def get_rejected_brokers():
    """
    Get all rejected brokers
    
    Returns list of brokers where verification_status = "REJECTED"
    """
    try:
        rejected_brokers = Broker.query.filter_by(
            verification_status="REJECTED"
        ).all()
        
        brokers_data = []
        for broker in rejected_brokers:
            user = User.query.get(broker.user_id)
            place = Place.query.get(broker.place_id)
            
            if user and place:
                location = f"{place.market_area}, {place.district}, {place.state}"
                
                brokers_data.append({
                    'id': broker.id,
                    'broker_name': user.name,
                    'market_name': broker.market_name,
                    'phone': user.phone,
                    'email': user.email or 'N/A',
                    'location': location,
                    'verification_status': broker.verification_status,
                    'rejection_reason': broker.rejection_reason or 'No reason provided'
                })
        
        return jsonify(brokers_data), 200
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to fetch rejected brokers: {str(e)}'
        }), 500


@host_bp.route('/brokers/all', methods=['GET'])
def get_all_brokers():
    """
    Get all brokers for statistics display
    
    Returns list of all brokers with their verification status
    
    Response:
    [
        {
            "id": 12,
            "broker_name": "Suraj",
            "market_name": "Suraj Market & Co",
            "phone": "9876543210",
            "email": "suraj@email.com",
            "location": "Vijayawada, Krishna, Andhra Pradesh",
            "trade_license": "/uploads/trade_licenses/license12.pdf",
            "verification_status": "PENDING",
            "created_at": "2026-01-15T10:30:00",
            "updated_at": "2026-01-15T10:30:00"
        }
    ]
    """
    try:
        # Query all brokers
        all_brokers = Broker.query.all()
        
        brokers_data = []
        for broker in all_brokers:
            user = User.query.get(broker.user_id)
            place = Place.query.get(broker.place_id)
            
            if user and place:
                location = f"{place.market_area}, {place.district}, {place.state}"
                
                brokers_data.append({
                    'id': broker.id,
                    'broker_name': user.name,
                    'market_name': broker.market_name,
                    'phone': user.phone,
                    'email': user.email or 'N/A',
                    'location': location,
                    'trade_license': broker.trade_license,
                    'verification_status': broker.verification_status,
                    'created_at': broker.registration_date.isoformat() if broker.registration_date else None,
                    'updated_at': broker.last_updated.isoformat() if hasattr(broker, 'last_updated') and broker.last_updated else None
                })
        
        return jsonify(brokers_data), 200
    
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to fetch all brokers: {str(e)}'
        }), 500


@host_bp.route('/payments/all', methods=['GET'])
def get_all_payments():
    """
    Get all payments for statistics display
    
    Returns list of all transactions and weighments with their payment status
    
    Response:
    [
        {
            "transaction_id": "123",
            "order_id": "ORD-001",
            "farmer_name": "John Doe",
            "amount": 5000.00,
            "upi_transaction_id": "UPI123456",
            "payment_status": "APPROVED",
            "payment_proof_url": "/uploads/payment_proofs/proof123.pdf",
            "created_at": "2026-01-15T10:30:00",
            "updated_at": "2026-01-15T10:30:00"
        }
    ]
    """
    try:
        payments = []

        # Get all transactions
        transactions = Transaction.query.all()
        for txn in transactions:
            sell_request = txn.sell_request
            farmer = None
            user = None
            if sell_request:
                farmer = Farmer.query.get(sell_request.farmer_id)
                if farmer:
                    user = User.query.get(farmer.user_id)

            payments.append({
                'transaction_id': str(txn.id),
                'type': 'transaction',
                'order_id': sell_request.order_id if sell_request else 'N/A',
                'farmer_name': user.name if user else (farmer.name if hasattr(farmer, 'name') else 'Farmer'),
                'phone': user.phone if user else '-',
                'amount': float(txn.net_payable or 0),
                'payment_status': txn.payment_status,
                'upi_transaction_id': txn.upi_transaction_id or '-',
                'payment_proof_url': f"/{txn.payment_proof}" if txn.payment_proof else None,
                'created_at': txn.created_at.isoformat() if txn.created_at else None,
                'updated_at': txn.updated_at.isoformat() if txn.updated_at else None
            })

        # Get all weighments
        weighments = Weighment.query.all()
        for weighment in weighments:
            farmer = None
            user = None
            if weighment.farmer_id:
                farmer = Farmer.query.get(weighment.farmer_id)
                if farmer:
                    user = User.query.get(farmer.user_id)

            amount = (weighment.actual_weight_tons or 0) * 1000 * (weighment.final_price_per_kg or 0)
            payments.append({
                'transaction_id': f'w-{weighment.id}',
                'type': 'weighment',
                'order_id': weighment.order_id or 'N/A',
                'farmer_name': user.name if user else (weighment.farmer_name or 'Farmer'),
                'phone': user.phone if user else '-',
                'amount': float(amount),
                'payment_status': weighment.payment_status,
                'upi_transaction_id': weighment.upi_transaction_id or '-',
                'payment_proof_url': f"/{weighment.payment_proof}" if weighment.payment_proof else None,
                'created_at': weighment.created_at.isoformat() if weighment.created_at else None,
                'updated_at': weighment.updated_at.isoformat() if weighment.updated_at else None
            })

        return jsonify(payments), 200
    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Failed to fetch all payments: {str(e)}'
        }), 500
