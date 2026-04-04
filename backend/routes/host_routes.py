"""
Host Verification Routes
Routes for host/platform owner to verify broker trade licenses
"""

from flask import Blueprint, request, jsonify

try:
    # Try importing from backend context
    from backend.main import db, Broker, User, Place
except (ImportError, ModuleNotFoundError):
    # Fallback for direct module import
    try:
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from main import db, Broker, User, Place
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
