"""
Analytics Routes for Business Intelligence Dashboard

Provides comprehensive analytics endpoints for:
- Executive KPI metrics
- Time-series trends
- Trading funnel analysis
- Market performance
- Mango variety performance
- Payment analytics
- Rule-based insights

All endpoints require host authentication (consistent with host_routes.py).
Uses Weighment as canonical source for financial/payment metrics.
"""

from datetime import datetime, timedelta
from decimal import Decimal
from flask import Blueprint, request, jsonify
from sqlalchemy import func, and_, or_, distinct, case, desc
from sqlalchemy.sql import text

try:
    from backend.main import db, Broker, User, Place, Farmer, SellRequest, Weighment, Transaction, MarketPrice
except (ImportError, ModuleNotFoundError):
    try:
        import sys
        import os
        sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
        from main import db, Broker, User, Place, Farmer, SellRequest, Weighment, Transaction, MarketPrice
    except (ImportError, ModuleNotFoundError):
        from main import db

analytics_bp = Blueprint('analytics', __name__)

# =====================================================
# HELPER FUNCTIONS
# =====================================================

def parse_date(date_str, default=None):
    """Parse date string YYYY-MM-DD. Return date object or default."""
    if not date_str:
        return default
    try:
        return datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return default


def safe_decimal_to_float(value):
    """Safely convert Decimal to float for JSON serialization."""
    if value is None:
        return 0.0
    if isinstance(value, Decimal):
        return float(value)
    return float(value) if value else 0.0


def calculate_trading_value(actual_weight_tons, final_price_per_kg):
    """
    Calculate trading value safely.
    Formula: actual_weight_tons × 1000 × final_price_per_kg
    Returns float for JSON serialization.
    """
    weight = safe_decimal_to_float(actual_weight_tons) or 0.0
    price = safe_decimal_to_float(final_price_per_kg) or 0.0
    return weight * 1000 * price


def build_date_filter(start_date, end_date, date_field):
    """
    Build SQLAlchemy filter for date range.
    Returns filter clause or None.
    """
    filters = []
    if start_date:
        filters.append(date_field >= start_date)
    if end_date:
        filters.append(date_field <= end_date)
    
    if not filters:
        return None
    return and_(*filters) if len(filters) > 1 else filters[0]


def build_market_filter(market_name, broker_join_table):
    """
    Build SQLAlchemy filter for market.
    broker_join_table should be joined to query.
    Returns filter clause or None.
    """
    if not market_name or market_name.lower() == 'all':
        return None
    return broker_join_table.market_name == market_name


def build_variety_filter(variety, variety_field):
    """
    Build SQLAlchemy filter for mango variety.
    Returns filter clause or None.
    """
    if not variety or variety.lower() == 'all':
        return None
    return variety_field == variety


# =====================================================
# ENDPOINT 1: GET /api/analytics/overview
# =====================================================

@analytics_bp.route('/overview', methods=['GET'])
def get_analytics_overview():
    """
    Executive summary KPI metrics.
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional)
    
    Returns all KPI metrics.
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market = request.args.get('market', '').strip() or None

        # Build filters
        sr_date_filter = build_date_filter(start_date, end_date, SellRequest.created_at)
        w_date_filter = build_date_filter(start_date, end_date, Weighment.created_at)

        # ===== BROKER METRICS =====
        total_brokers = db.session.query(func.count(Broker.id)).scalar() or 0
        
        approved_brokers = db.session.query(func.count(Broker.id)).filter(
            Broker.verification_status == 'APPROVED'
        ).scalar() or 0
        
        pending_brokers = db.session.query(func.count(Broker.id)).filter(
            Broker.verification_status == 'PENDING'
        ).scalar() or 0
        
        rejected_brokers = db.session.query(func.count(Broker.id)).filter(
            Broker.verification_status == 'REJECTED'
        ).scalar() or 0

        approval_rate = 0.0
        if total_brokers > 0:
            approval_rate = (approved_brokers / total_brokers) * 100

        # ===== SELL REQUEST METRICS =====
        sr_query = db.session.query(SellRequest)
        if sr_date_filter is not None:
            sr_query = sr_query.filter(sr_date_filter)
        if market:
            sr_query = sr_query.join(Broker, SellRequest.broker_id == Broker.id).filter(
                Broker.market_name == market
            )

        total_sell_requests = sr_query.count()
        
        accepted_sell_requests = sr_query.filter(
            SellRequest.status == 'ACCEPTED'
        ).count()
        
        rejected_sell_requests = sr_query.filter(
            SellRequest.status == 'REJECTED'
        ).count()

        # Request acceptance rate (denominator: requests with final decision)
        requests_with_decision = accepted_sell_requests + rejected_sell_requests
        request_acceptance_rate = 0.0
        if requests_with_decision > 0:
            request_acceptance_rate = (accepted_sell_requests / requests_with_decision) * 100

        # ===== TRADING METRICS (Weighment-based) =====
        w_query = db.session.query(Weighment)
        if w_date_filter is not None:
            w_query = w_query.filter(w_date_filter)
        if market:
            w_query = w_query.join(Broker, Weighment.broker_id == Broker.id).filter(
                Broker.market_name == market
            )

        # Total trading quantity
        total_trading_quantity = db.session.query(
            func.coalesce(func.sum(Weighment.actual_weight_tons), 0)
        ).select_from(Weighment)
        if w_date_filter is not None:
            total_trading_quantity = total_trading_quantity.filter(w_date_filter)
        if market:
            total_trading_quantity = total_trading_quantity.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market)
        total_trading_quantity = safe_decimal_to_float(total_trading_quantity.scalar())

        # Total trading value (using Weighment as canonical source)
        total_trading_value_result = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        ).select_from(Weighment)
        if w_date_filter is not None:
            total_trading_value_result = total_trading_value_result.filter(w_date_filter)
        if market:
            total_trading_value_result = total_trading_value_result.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market)
        total_trading_value = safe_decimal_to_float(total_trading_value_result.scalar())

        # ===== PAYMENT METRICS (Weighment-based) =====
        # Count distinct SellRequest IDs with at least one PAID weighment
        paid_weighments = db.session.query(
            func.count(distinct(Weighment.sell_request_id))
        ).filter(
            Weighment.payment_status == 'PAID',
            Weighment.sell_request_id.isnot(None)
        )
        if market:
            paid_weighments = paid_weighments.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market)
        paid_count = paid_weighments.scalar() or 0

        # Count distinct SellRequest IDs with payment activity
        with_payment_activity = db.session.query(
            func.count(distinct(Weighment.sell_request_id))
        ).filter(
            Weighment.sell_request_id.isnot(None)
        )
        if market:
            with_payment_activity = with_payment_activity.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market)
        payment_activity_count = with_payment_activity.scalar() or 0

        payment_completion_rate = 0.0
        if payment_activity_count > 0:
            payment_completion_rate = (paid_count / payment_activity_count) * 100

        # Pending payment value (PENDING, INITIATED, AWAITING_VERIFICATION)
        pending_payment_value = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        ).filter(
            Weighment.payment_status.in_(['PENDING', 'INITIATED', 'AWAITING_VERIFICATION'])
        )
        if market:
            pending_payment_value = pending_payment_value.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market)
        pending_payment_value = safe_decimal_to_float(pending_payment_value.scalar())

        # Completed payment value (PAID)
        completed_payment_value = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        ).filter(
            Weighment.payment_status == 'PAID'
        )
        if market:
            completed_payment_value = completed_payment_value.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market)
        completed_payment_value = safe_decimal_to_float(completed_payment_value.scalar())

        # Total farmers (count distinct from Farmer table)
        total_farmers = db.session.query(func.count(Farmer.id)).scalar() or 0

        return jsonify({
            'success': True,
            'data': {
                'total_farmers': total_farmers,
                'total_brokers': total_brokers,
                'approved_brokers': approved_brokers,
                'pending_brokers': pending_brokers,
                'rejected_brokers': rejected_brokers,
                'approval_rate': round(approval_rate, 2),
                'total_sell_requests': total_sell_requests,
                'accepted_sell_requests': accepted_sell_requests,
                'rejected_sell_requests': rejected_sell_requests,
                'request_acceptance_rate': round(request_acceptance_rate, 2),
                'total_trading_quantity': round(total_trading_quantity, 2),
                'total_trading_value': round(total_trading_value, 2),
                'payment_completion_rate': round(payment_completion_rate, 2),
                'pending_payment_value': round(pending_payment_value, 2),
                'completed_payment_value': round(completed_payment_value, 2)
            },
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch overview analytics: {str(e)}'
        }), 500


# =====================================================
# ENDPOINT 2: GET /api/analytics/trends
# =====================================================

@analytics_bp.route('/trends', methods=['GET'])
def get_analytics_trends():
    """
    Time-series trend data.
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional)
    
    Returns:
    - sell_requests_over_time
    - trading_value_over_time
    - trading_quantity_over_time
    - payment_activity_over_time
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market = request.args.get('market', '').strip() or None

        # ===== SELL REQUESTS OVER TIME =====
        sr_query = db.session.query(
            func.date(SellRequest.created_at).label('date'),
            func.count(SellRequest.id).label('count')
        )
        
        if start_date:
            sr_query = sr_query.filter(func.date(SellRequest.created_at) >= start_date)
        if end_date:
            sr_query = sr_query.filter(func.date(SellRequest.created_at) <= end_date)
        if market:
            sr_query = sr_query.join(Broker, SellRequest.broker_id == Broker.id).filter(
                Broker.market_name == market
            )
        
        sr_query = sr_query.group_by(func.date(SellRequest.created_at)).order_by(
            func.date(SellRequest.created_at)
        )
        
        sell_requests_over_time = [
            {
                'date': row[0].isoformat() if row[0] else None,
                'count': row[1] or 0
            }
            for row in sr_query.all()
        ]

        # ===== TRADING VALUE OVER TIME (Weighment-based) =====
        tv_query = db.session.query(
            func.date(Weighment.created_at).label('date'),
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0).label('value')
        )
        
        if start_date:
            tv_query = tv_query.filter(func.date(Weighment.created_at) >= start_date)
        if end_date:
            tv_query = tv_query.filter(func.date(Weighment.created_at) <= end_date)
        if market:
            tv_query = tv_query.join(Broker, Weighment.broker_id == Broker.id).filter(
                Broker.market_name == market
            )
        
        tv_query = tv_query.group_by(func.date(Weighment.created_at)).order_by(
            func.date(Weighment.created_at)
        )
        
        trading_value_over_time = [
            {
                'date': row[0].isoformat() if row[0] else None,
                'value': round(safe_decimal_to_float(row[1]), 2)
            }
            for row in tv_query.all()
        ]

        # ===== TRADING QUANTITY OVER TIME =====
        tq_query = db.session.query(
            func.date(Weighment.created_at).label('date'),
            func.coalesce(func.sum(Weighment.actual_weight_tons), 0).label('quantity')
        )
        
        if start_date:
            tq_query = tq_query.filter(func.date(Weighment.created_at) >= start_date)
        if end_date:
            tq_query = tq_query.filter(func.date(Weighment.created_at) <= end_date)
        if market:
            tq_query = tq_query.join(Broker, Weighment.broker_id == Broker.id).filter(
                Broker.market_name == market
            )
        
        tq_query = tq_query.group_by(func.date(Weighment.created_at)).order_by(
            func.date(Weighment.created_at)
        )
        
        trading_quantity_over_time = [
            {
                'date': row[0].isoformat() if row[0] else None,
                'quantity': round(safe_decimal_to_float(row[1]), 2)
            }
            for row in tq_query.all()
        ]

        # ===== PAYMENT ACTIVITY OVER TIME =====
        pa_query = db.session.query(
            func.date(Weighment.created_at).label('date'),
            func.count(case((Weighment.payment_status == 'PAID', 1))).label('paid'),
            func.count(case((Weighment.payment_status == 'INITIATED', 1))).label('initiated'),
            func.count(case((Weighment.payment_status == 'AWAITING_VERIFICATION', 1))).label('awaiting_verification'),
            func.count(case((Weighment.payment_status == 'REJECTED', 1))).label('rejected'),
            func.count(case((Weighment.payment_status == 'PENDING', 1))).label('pending')
        )
        
        if start_date:
            pa_query = pa_query.filter(func.date(Weighment.created_at) >= start_date)
        if end_date:
            pa_query = pa_query.filter(func.date(Weighment.created_at) <= end_date)
        if market:
            pa_query = pa_query.join(Broker, Weighment.broker_id == Broker.id).filter(
                Broker.market_name == market
            )
        
        pa_query = pa_query.group_by(func.date(Weighment.created_at)).order_by(
            func.date(Weighment.created_at)
        )
        
        payment_activity_over_time = [
            {
                'date': row[0].isoformat() if row[0] else None,
                'paid': row[1] or 0,
                'initiated': row[2] or 0,
                'awaiting_verification': row[3] or 0,
                'rejected': row[4] or 0,
                'pending': row[5] or 0
            }
            for row in pa_query.all()
        ]

        return jsonify({
            'success': True,
            'data': {
                'sell_requests_over_time': sell_requests_over_time,
                'trading_value_over_time': trading_value_over_time,
                'trading_quantity_over_time': trading_quantity_over_time,
                'payment_activity_over_time': payment_activity_over_time
            },
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch trends analytics: {str(e)}'
        }), 500


# =====================================================
# ENDPOINT 3: GET /api/analytics/funnel
# =====================================================

@analytics_bp.route('/funnel', methods=['GET'])
def get_analytics_funnel():
    """
    Trading funnel analysis with proper cohort tracking.
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional)
    
    Returns funnel stages with conversion rates.
    
    IMPORTANT: Funnel cohort = SellRequests created in selected date range.
    Later stages are filtered to include only those same request IDs.
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market = request.args.get('market', '').strip() or None

        # ===== GET COHORT: SellRequest IDs created in date range =====
        cohort_query = db.session.query(SellRequest.id)
        
        if start_date:
            cohort_query = cohort_query.filter(func.date(SellRequest.created_at) >= start_date)
        if end_date:
            cohort_query = cohort_query.filter(func.date(SellRequest.created_at) <= end_date)
        if market:
            cohort_query = cohort_query.join(
                Broker, SellRequest.broker_id == Broker.id
            ).filter(Broker.market_name == market)
        
        cohort_ids = set([row[0] for row in cohort_query.all()])
        
        if not cohort_ids:
            # Empty cohort - return zero funnel
            return jsonify({
                'success': True,
                'data': [
                    {'stage': 'Sell Requests', 'count': 0, 'conversion_rate': 100.0, 'drop_off_count': 0, 'drop_off_rate': 0.0},
                    {'stage': 'Accepted Requests', 'count': 0, 'conversion_rate': 0.0, 'drop_off_count': 0, 'drop_off_rate': 100.0},
                    {'stage': 'Weighments Recorded', 'count': 0, 'conversion_rate': 0.0, 'drop_off_count': 0, 'drop_off_rate': 100.0},
                    {'stage': 'Payments Initiated', 'count': 0, 'conversion_rate': 0.0, 'drop_off_count': 0, 'drop_off_rate': 100.0},
                    {'stage': 'Payments Completed', 'count': 0, 'conversion_rate': 0.0, 'drop_off_count': 0, 'drop_off_rate': 100.0}
                ],
                'filters': {
                    'start_date': start_date.isoformat() if start_date else None,
                    'end_date': end_date.isoformat() if end_date else None,
                    'market': market
                }
            }), 200

        # ===== STAGE 1: Sell Requests (cohort count) =====
        stage1_count = len(cohort_ids)

        # ===== STAGE 2: Accepted Requests (from cohort with ACCEPTED status) =====
        stage2_count = db.session.query(func.count(SellRequest.id)).filter(
            SellRequest.id.in_(cohort_ids),
            SellRequest.status == 'ACCEPTED'
        ).scalar() or 0

        # ===== STAGE 3: Weighments Recorded (distinct sell_request_id from cohort) =====
        stage3_ids = set([
            row[0] for row in db.session.query(distinct(Weighment.sell_request_id)).filter(
                Weighment.sell_request_id.in_(cohort_ids)
            ).all()
        ])
        stage3_count = len(stage3_ids)

        # ===== STAGE 4: Payments Initiated (distinct sell_request_id with payment activity) =====
        stage4_ids = set([
            row[0] for row in db.session.query(distinct(Weighment.sell_request_id)).filter(
                Weighment.sell_request_id.in_(cohort_ids),
                Weighment.payment_status.in_(['INITIATED', 'AWAITING_VERIFICATION', 'PAID'])
            ).all()
        ])
        stage4_count = len(stage4_ids)

        # ===== STAGE 5: Payments Completed (distinct sell_request_id with PAID status) =====
        stage5_ids = set([
            row[0] for row in db.session.query(distinct(Weighment.sell_request_id)).filter(
                Weighment.sell_request_id.in_(cohort_ids),
                Weighment.payment_status == 'PAID'
            ).all()
        ])
        stage5_count = len(stage5_ids)

        # ===== CALCULATE CONVERSIONS =====
        def calc_conversion(current, previous):
            if previous == 0:
                return 100.0 if current > 0 else 0.0
            return (current / previous) * 100

        def calc_dropoff(current, previous):
            return previous - current

        def calc_dropoff_rate(dropoff, previous):
            if previous == 0:
                return 0.0
            return (dropoff / previous) * 100

        stages = [
            {
                'stage': 'Sell Requests',
                'count': stage1_count,
                'conversion_rate': 100.0,
                'drop_off_count': 0,
                'drop_off_rate': 0.0
            },
            {
                'stage': 'Accepted Requests',
                'count': stage2_count,
                'conversion_rate': round(calc_conversion(stage2_count, stage1_count), 2),
                'drop_off_count': calc_dropoff(stage2_count, stage1_count),
                'drop_off_rate': round(calc_dropoff_rate(calc_dropoff(stage2_count, stage1_count), stage1_count), 2)
            },
            {
                'stage': 'Weighments Recorded',
                'count': stage3_count,
                'conversion_rate': round(calc_conversion(stage3_count, stage2_count), 2),
                'drop_off_count': calc_dropoff(stage3_count, stage2_count),
                'drop_off_rate': round(calc_dropoff_rate(calc_dropoff(stage3_count, stage2_count), stage2_count), 2)
            },
            {
                'stage': 'Payments Initiated',
                'count': stage4_count,
                'conversion_rate': round(calc_conversion(stage4_count, stage3_count), 2),
                'drop_off_count': calc_dropoff(stage4_count, stage3_count),
                'drop_off_rate': round(calc_dropoff_rate(calc_dropoff(stage4_count, stage3_count), stage3_count), 2)
            },
            {
                'stage': 'Payments Completed',
                'count': stage5_count,
                'conversion_rate': round(calc_conversion(stage5_count, stage4_count), 2),
                'drop_off_count': calc_dropoff(stage5_count, stage4_count),
                'drop_off_rate': round(calc_dropoff_rate(calc_dropoff(stage5_count, stage4_count), stage4_count), 2)
            }
        ]

        return jsonify({
            'success': True,
            'data': stages,
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch funnel analytics: {str(e)}'
        }), 500


# =====================================================
# ENDPOINT 4: GET /api/analytics/markets
# =====================================================

@analytics_bp.route('/markets', methods=['GET'])
def get_analytics_markets():
    """
    Market performance analytics.
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional, filter to specific market)
    
    Returns market performance table with requests, acceptance rate, trading metrics.
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market_filter = request.args.get('market', '').strip() or None

        # Get all markets
        market_names = db.session.query(distinct(Broker.market_name)).filter(
            Broker.market_name.isnot(None)
        ).order_by(Broker.market_name).all()
        market_names = [m[0] for m in market_names if m[0]]

        if market_filter and market_filter.lower() != 'all':
            market_names = [market_filter] if market_filter in market_names else market_names

        markets_data = []

        for market_name in market_names:
            # Count total requests
            total_requests_query = db.session.query(func.count(distinct(SellRequest.id))).join(
                Broker, SellRequest.broker_id == Broker.id
            ).filter(Broker.market_name == market_name)
            
            if start_date:
                total_requests_query = total_requests_query.filter(
                    func.date(SellRequest.created_at) >= start_date
                )
            if end_date:
                total_requests_query = total_requests_query.filter(
                    func.date(SellRequest.created_at) <= end_date
                )
            
            total_requests = total_requests_query.scalar() or 0

            # Count accepted requests
            accepted_query = db.session.query(func.count(distinct(SellRequest.id))).join(
                Broker, SellRequest.broker_id == Broker.id
            ).filter(
                Broker.market_name == market_name,
                SellRequest.status == 'ACCEPTED'
            )
            
            if start_date:
                accepted_query = accepted_query.filter(
                    func.date(SellRequest.created_at) >= start_date
                )
            if end_date:
                accepted_query = accepted_query.filter(
                    func.date(SellRequest.created_at) <= end_date
                )
            
            accepted_requests = accepted_query.scalar() or 0

            # Count rejected requests
            rejected_query = db.session.query(func.count(distinct(SellRequest.id))).join(
                Broker, SellRequest.broker_id == Broker.id
            ).filter(
                Broker.market_name == market_name,
                SellRequest.status == 'REJECTED'
            )
            
            if start_date:
                rejected_query = rejected_query.filter(
                    func.date(SellRequest.created_at) >= start_date
                )
            if end_date:
                rejected_query = rejected_query.filter(
                    func.date(SellRequest.created_at) <= end_date
                )
            
            rejected_requests = rejected_query.scalar() or 0

            # Count pending requests
            pending_query = db.session.query(func.count(distinct(SellRequest.id))).join(
                Broker, SellRequest.broker_id == Broker.id
            ).filter(
                Broker.market_name == market_name,
                SellRequest.status == 'PENDING'
            )
            
            if start_date:
                pending_query = pending_query.filter(
                    func.date(SellRequest.created_at) >= start_date
                )
            if end_date:
                pending_query = pending_query.filter(
                    func.date(SellRequest.created_at) <= end_date
                )
            
            pending_requests = pending_query.scalar() or 0

            # Acceptance rate
            acceptance_rate = 0.0
            if (accepted_requests + rejected_requests) > 0:
                acceptance_rate = (accepted_requests / (accepted_requests + rejected_requests)) * 100

            # Trading quantity
            trading_quantity_query = db.session.query(
                func.coalesce(func.sum(Weighment.actual_weight_tons), 0)
            ).join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_name)
            
            if start_date:
                trading_quantity_query = trading_quantity_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
            if end_date:
                trading_quantity_query = trading_quantity_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
            
            trading_quantity = safe_decimal_to_float(trading_quantity_query.scalar())

            # Trading value
            trading_value_query = db.session.query(
                func.coalesce(func.sum(
                    Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
                ), 0)
            ).join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_name)
            
            if start_date:
                trading_value_query = trading_value_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
            if end_date:
                trading_value_query = trading_value_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
            
            trading_value = safe_decimal_to_float(trading_value_query.scalar())

            # Average final price
            avg_price_query = db.session.query(
                func.coalesce(func.avg(Weighment.final_price_per_kg), 0)
            ).join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_name)
            
            if start_date:
                avg_price_query = avg_price_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
            if end_date:
                avg_price_query = avg_price_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
            
            average_final_price = safe_decimal_to_float(avg_price_query.scalar())

            markets_data.append({
                'market_name': market_name,
                'total_requests': total_requests,
                'accepted_requests': accepted_requests,
                'rejected_requests': rejected_requests,
                'pending_requests': pending_requests,
                'acceptance_rate': round(acceptance_rate, 2),
                'trading_quantity': round(trading_quantity, 2),
                'trading_value': round(trading_value, 2),
                'average_final_price': round(average_final_price, 2)
            })

        return jsonify({
            'success': True,
            'data': markets_data,
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market_filter
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch market analytics: {str(e)}'
        }), 500


# =====================================================
# ENDPOINT 5: GET /api/analytics/varieties
# =====================================================

@analytics_bp.route('/varieties', methods=['GET'])
def get_analytics_varieties():
    """
    Mango variety performance analytics.
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional)
    - variety (optional)
    
    Returns variety performance using:
    - SellRequest.variety for request metrics
    - Weighment.mango_variety for actual trading metrics
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market_filter = request.args.get('market', '').strip() or None
        variety_filter = request.args.get('variety', '').strip() or None

        # Get unique varieties from SellRequest
        variety_names = db.session.query(distinct(SellRequest.variety)).filter(
            SellRequest.variety.isnot(None),
            SellRequest.variety != ''
        ).order_by(SellRequest.variety).all()
        variety_names = [v[0] for v in variety_names if v[0]]

        if variety_filter and variety_filter.lower() != 'all':
            variety_names = [variety_filter] if variety_filter in variety_names else variety_names

        varieties_data = []

        for variety in variety_names:
            # Total requests (SellRequest.variety)
            total_requests_query = db.session.query(func.count(distinct(SellRequest.id))).filter(
                SellRequest.variety == variety
            )
            
            if start_date:
                total_requests_query = total_requests_query.filter(
                    func.date(SellRequest.created_at) >= start_date
                )
            if end_date:
                total_requests_query = total_requests_query.filter(
                    func.date(SellRequest.created_at) <= end_date
                )
            if market_filter:
                total_requests_query = total_requests_query.join(
                    Broker, SellRequest.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
            
            total_requests = total_requests_query.scalar() or 0

            # Accepted requests
            accepted_query = db.session.query(func.count(distinct(SellRequest.id))).filter(
                SellRequest.variety == variety,
                SellRequest.status == 'ACCEPTED'
            )
            
            if start_date:
                accepted_query = accepted_query.filter(
                    func.date(SellRequest.created_at) >= start_date
                )
            if end_date:
                accepted_query = accepted_query.filter(
                    func.date(SellRequest.created_at) <= end_date
                )
            if market_filter:
                accepted_query = accepted_query.join(
                    Broker, SellRequest.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
            
            accepted_requests = accepted_query.scalar() or 0

            # Trading quantity (Weighment.mango_variety)
            trading_quantity_query = db.session.query(
                func.coalesce(func.sum(Weighment.actual_weight_tons), 0)
            ).filter(
                Weighment.mango_variety == variety
            )
            
            if start_date:
                trading_quantity_query = trading_quantity_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
            if end_date:
                trading_quantity_query = trading_quantity_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
            if market_filter:
                trading_quantity_query = trading_quantity_query.join(
                    Broker, Weighment.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
            
            trading_quantity = safe_decimal_to_float(trading_quantity_query.scalar())

            # Trading value (Weighment.mango_variety)
            trading_value_query = db.session.query(
                func.coalesce(func.sum(
                    Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
                ), 0)
            ).filter(
                Weighment.mango_variety == variety
            )
            
            if start_date:
                trading_value_query = trading_value_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
            if end_date:
                trading_value_query = trading_value_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
            if market_filter:
                trading_value_query = trading_value_query.join(
                    Broker, Weighment.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
            
            trading_value = safe_decimal_to_float(trading_value_query.scalar())

            # Average final price
            avg_price_query = db.session.query(
                func.coalesce(func.avg(Weighment.final_price_per_kg), 0)
            ).filter(
                Weighment.mango_variety == variety
            )
            
            if start_date:
                avg_price_query = avg_price_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
            if end_date:
                avg_price_query = avg_price_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
            if market_filter:
                avg_price_query = avg_price_query.join(
                    Broker, Weighment.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
            
            average_final_price = safe_decimal_to_float(avg_price_query.scalar())

            varieties_data.append({
                'variety': variety,
                'total_requests': total_requests,
                'accepted_requests': accepted_requests,
                'trading_quantity': round(trading_quantity, 2),
                'trading_value': round(trading_value, 2),
                'average_final_price': round(average_final_price, 2)
            })

        return jsonify({
            'success': True,
            'data': varieties_data,
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market_filter,
                'variety': variety_filter
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch variety analytics: {str(e)}'
        }), 500


# =====================================================
# ENDPOINT 6: GET /api/analytics/payments
# =====================================================

@analytics_bp.route('/payments', methods=['GET'])
def get_analytics_payments():
    """
    Payment analytics (Weighment-based).
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional)
    
    Returns:
    - status_distribution
    - payment_totals
    - priority_payments (top pending/initiated by value)
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market_filter = request.args.get('market', '').strip() or None

        # ===== STATUS DISTRIBUTION =====
        statuses = ['PENDING', 'INITIATED', 'AWAITING_VERIFICATION', 'PAID', 'REJECTED']
        status_distribution = []

        for status in statuses:
            # Record count
            record_count_query = db.session.query(func.count(Weighment.id)).filter(
                Weighment.payment_status == status
            )
            
            # Unique request count
            unique_request_query = db.session.query(func.count(distinct(Weighment.sell_request_id))).filter(
                Weighment.payment_status == status,
                Weighment.sell_request_id.isnot(None)
            )
            
            # Total value
            total_value_query = db.session.query(
                func.coalesce(func.sum(
                    Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
                ), 0)
            ).filter(
                Weighment.payment_status == status
            )
            
            if start_date:
                record_count_query = record_count_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
                unique_request_query = unique_request_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
                total_value_query = total_value_query.filter(
                    func.date(Weighment.created_at) >= start_date
                )
            
            if end_date:
                record_count_query = record_count_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
                unique_request_query = unique_request_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
                total_value_query = total_value_query.filter(
                    func.date(Weighment.created_at) <= end_date
                )
            
            if market_filter:
                record_count_query = record_count_query.join(
                    Broker, Weighment.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
                unique_request_query = unique_request_query.join(
                    Broker, Weighment.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
                total_value_query = total_value_query.join(
                    Broker, Weighment.broker_id == Broker.id
                ).filter(Broker.market_name == market_filter)
            
            record_count = record_count_query.scalar() or 0
            unique_request_count = unique_request_query.scalar() or 0
            total_value = safe_decimal_to_float(total_value_query.scalar())

            status_distribution.append({
                'status': status,
                'record_count': record_count,
                'unique_request_count': unique_request_count,
                'total_value': round(total_value, 2)
            })

        # ===== PAYMENT TOTALS =====
        total_payment_query = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        )
        
        pending_payment_query = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        ).filter(
            Weighment.payment_status.in_(['PENDING', 'INITIATED', 'AWAITING_VERIFICATION'])
        )
        
        paid_query = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        ).filter(
            Weighment.payment_status == 'PAID'
        )
        
        rejected_query = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        ).filter(
            Weighment.payment_status == 'REJECTED'
        )
        
        if start_date:
            total_payment_query = total_payment_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
            pending_payment_query = pending_payment_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
            paid_query = paid_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
            rejected_query = rejected_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        
        if end_date:
            total_payment_query = total_payment_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
            pending_payment_query = pending_payment_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
            paid_query = paid_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
            rejected_query = rejected_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        
        if market_filter:
            total_payment_query = total_payment_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
            pending_payment_query = pending_payment_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
            paid_query = paid_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
            rejected_query = rejected_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
        
        total_payment_value = safe_decimal_to_float(total_payment_query.scalar())
        pending_payment_value = safe_decimal_to_float(pending_payment_query.scalar())
        paid_value = safe_decimal_to_float(paid_query.scalar())
        rejected_value = safe_decimal_to_float(rejected_query.scalar())

        payment_totals = {
            'total_payment_value': round(total_payment_value, 2),
            'pending_payment_value': round(pending_payment_value, 2),
            'paid_value': round(paid_value, 2),
            'rejected_value': round(rejected_value, 2)
        }

        # ===== PRIORITY PAYMENTS (top pending/initiated by value) =====
        priority_query = db.session.query(
            Weighment.id,
            Weighment.sell_request_id,
            Weighment.order_id,
            Weighment.farmer_name,
            Weighment.payment_status,
            Weighment.actual_weight_tons,
            Weighment.final_price_per_kg,
            Weighment.created_at,
            Broker.market_name
        ).join(
            Broker, Weighment.broker_id == Broker.id
        ).filter(
            Weighment.payment_status.in_(['PENDING', 'INITIATED', 'AWAITING_VERIFICATION'])
        )
        
        if start_date:
            priority_query = priority_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        if end_date:
            priority_query = priority_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        if market_filter:
            priority_query = priority_query.filter(
                Broker.market_name == market_filter
            )
        
        priority_query = priority_query.order_by(
            Weighment.created_at.asc()  # Oldest first
        ).limit(10)

        priority_payments = []
        for row in priority_query.all():
            weighment_id, sell_request_id, order_id, farmer_name, payment_status, weight, price, created_at, market = row
            calculated_value = calculate_trading_value(weight, price)
            
            priority_payments.append({
                'weighment_id': weighment_id,
                'sell_request_id': sell_request_id,
                'order_id': order_id or 'N/A',
                'farmer_name': farmer_name or 'Unknown',
                'market': market or 'Unknown',
                'payment_status': payment_status,
                'actual_weight_tons': round(safe_decimal_to_float(weight), 2),
                'final_price_per_kg': round(safe_decimal_to_float(price), 2),
                'calculated_value': round(calculated_value, 2),
                'created_at': created_at.isoformat() if created_at else None
            })

        return jsonify({
            'success': True,
            'data': {
                'status_distribution': status_distribution,
                'payment_totals': payment_totals,
                'priority_payments': priority_payments
            },
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market_filter
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch payment analytics: {str(e)}'
        }), 500


# =====================================================
# ENDPOINT 7: GET /api/analytics/insights
# =====================================================

@analytics_bp.route('/insights', methods=['GET'])
def get_analytics_insights():
    """
    Rule-based actionable insights.
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional)
    
    Returns list of insights with severity levels.
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market_filter = request.args.get('market', '').strip() or None

        insights = []

        # ===== INSIGHT 1: Pending Payment Value =====
        pending_payment_query = db.session.query(
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0)
        ).filter(
            Weighment.payment_status.in_(['PENDING', 'INITIATED', 'AWAITING_VERIFICATION'])
        )
        
        if start_date:
            pending_payment_query = pending_payment_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        if end_date:
            pending_payment_query = pending_payment_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        if market_filter:
            pending_payment_query = pending_payment_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
        
        pending_value = safe_decimal_to_float(pending_payment_query.scalar())

        if pending_value > 0:
            insights.append({
                'severity': 'HIGH',
                'title': f'₹{pending_value:,.2f} in payments awaiting verification',
                'message': 'A significant payment amount is currently pending host verification.',
                'metric': {
                    'value': pending_value,
                    'label': 'Pending Amount (₹)'
                }
            })

        # ===== INSIGHT 2: Lowest Market Acceptance Rate =====
        market_acceptance_query = db.session.query(
            Broker.market_name,
            func.count(case((SellRequest.status == 'ACCEPTED', 1))).label('accepted'),
            func.count(case((SellRequest.status == 'REJECTED', 1))).label('rejected')
        ).join(
            Broker, SellRequest.broker_id == Broker.id
        ).group_by(Broker.market_name)
        
        if start_date:
            market_acceptance_query = market_acceptance_query.filter(
                func.date(SellRequest.created_at) >= start_date
            )
        if end_date:
            market_acceptance_query = market_acceptance_query.filter(
                func.date(SellRequest.created_at) <= end_date
            )
        
        lowest_acceptance_rate = None
        lowest_market_name = None
        
        for row in market_acceptance_query.all():
            market_name, accepted, rejected = row
            total = accepted + rejected
            if total > 5:  # Only consider markets with sufficient data
                rate = (accepted / total) * 100 if total > 0 else 0
                if lowest_acceptance_rate is None or rate < lowest_acceptance_rate:
                    lowest_acceptance_rate = rate
                    lowest_market_name = market_name
        
        if lowest_acceptance_rate is not None and lowest_acceptance_rate < 75:
            insights.append({
                'severity': 'MEDIUM',
                'title': f'Market "{lowest_market_name}" has low acceptance rate',
                'message': f'Current acceptance rate is {lowest_acceptance_rate:.1f}%, below the 75% target.',
                'metric': {
                    'value': lowest_acceptance_rate,
                    'label': f'Acceptance Rate - {lowest_market_name} (%)'
                }
            })

        # ===== INSIGHT 3: Largest Funnel Drop-off =====
        # Get cohort of requests in date range
        cohort_query = db.session.query(SellRequest.id)
        
        if start_date:
            cohort_query = cohort_query.filter(func.date(SellRequest.created_at) >= start_date)
        if end_date:
            cohort_query = cohort_query.filter(func.date(SellRequest.created_at) <= end_date)
        if market_filter:
            cohort_query = cohort_query.join(
                Broker, SellRequest.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
        
        cohort_ids = set([row[0] for row in cohort_query.all()])
        
        if cohort_ids:
            stage1 = len(cohort_ids)
            stage2 = db.session.query(func.count(SellRequest.id)).filter(
                SellRequest.id.in_(cohort_ids),
                SellRequest.status == 'ACCEPTED'
            ).scalar() or 0
            
            stage3_ids = set([
                row[0] for row in db.session.query(distinct(Weighment.sell_request_id)).filter(
                    Weighment.sell_request_id.in_(cohort_ids)
                ).all()
            ])
            stage3 = len(stage3_ids)
            
            # Find largest drop-off
            drops = [
                (stage1, stage2, 'Requests Submitted → Accepted'),
                (stage2, stage3, 'Accepted → Weighments Recorded')
            ]
            
            largest_drop = None
            largest_drop_info = None
            
            for prev_count, curr_count, stage_name in drops:
                if prev_count > 0:
                    drop_rate = ((prev_count - curr_count) / prev_count) * 100
                    if drop_rate > 20 and (largest_drop is None or drop_rate > largest_drop):
                        largest_drop = drop_rate
                        largest_drop_info = (stage_name, prev_count - curr_count, drop_rate)
            
            if largest_drop_info:
                stage_name, drop_count, drop_rate = largest_drop_info
                insights.append({
                    'severity': 'MEDIUM',
                    'title': f'Largest funnel drop-off: {stage_name}',
                    'message': f'{drop_count} request(s) did not progress to the next stage ({drop_rate:.1f}%).',
                    'metric': {
                        'value': drop_rate,
                        'label': 'Drop-off Rate (%)'
                    }
                })

        # ===== INSIGHT 4: Highest Trading Value Market =====
        market_trading_query = db.session.query(
            Broker.market_name,
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0).label('total_value')
        ).join(
            Broker, Weighment.broker_id == Broker.id
        ).group_by(Broker.market_name)
        
        if start_date:
            market_trading_query = market_trading_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        if end_date:
            market_trading_query = market_trading_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        
        top_market = market_trading_query.order_by(text('total_value DESC')).first()
        
        if top_market and top_market[1] > 0:
            market_name, trading_value = top_market
            trading_value = safe_decimal_to_float(trading_value)
            insights.append({
                'severity': 'POSITIVE',
                'title': f'Market "{market_name}" generated highest trading value',
                'message': f'This market has strong trading activity with total value of ₹{trading_value:,.2f}.',
                'metric': {
                    'value': trading_value,
                    'label': f'Trading Value - {market_name} (₹)'
                }
            })

        # ===== INSIGHT 5: Highest Trading Quantity Variety =====
        variety_quantity_query = db.session.query(
            Weighment.mango_variety,
            func.coalesce(func.sum(Weighment.actual_weight_tons), 0).label('total_quantity')
        ).filter(
            Weighment.mango_variety.isnot(None),
            Weighment.mango_variety != ''
        ).group_by(Weighment.mango_variety)
        
        if start_date:
            variety_quantity_query = variety_quantity_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        if end_date:
            variety_quantity_query = variety_quantity_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        if market_filter:
            variety_quantity_query = variety_quantity_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
        
        top_variety = variety_quantity_query.order_by(text('total_quantity DESC')).first()
        
        if top_variety and top_variety[1] > 0:
            variety_name, quantity = top_variety
            quantity = safe_decimal_to_float(quantity)
            insights.append({
                'severity': 'POSITIVE',
                'title': f'Variety "{variety_name}" recorded highest trading quantity',
                'message': f'This variety has the highest trading volume with {quantity:.2f} tons.',
                'metric': {
                    'value': quantity,
                    'label': f'Trading Quantity - {variety_name} (tons)'
                }
            })

        # ===== DEFAULT: No Major Alerts =====
        if not insights:
            insights.append({
                'severity': 'LOW',
                'title': 'No major alerts',
                'message': 'No critical operational issues were detected in the current filter range.',
                'metric': {
                    'value': 0,
                    'label': 'Status'
                }
            })

        return jsonify({
            'success': True,
            'data': insights,
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market_filter
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch insights: {str(e)}'
        }), 500


# =====================================================
# ENDPOINT 8: GET /api/analytics/supply-origin
# =====================================================

@analytics_bp.route('/supply-origin', methods=['GET'])
def get_analytics_supply_origin():
    """
    Mango supply origin and variety analysis.
    
    Query parameters:
    - start_date (YYYY-MM-DD, optional)
    - end_date (YYYY-MM-DD, optional)
    - market (optional)
    
    Analyzes:
    1. Source locations (farmer origin locations)
    2. Top mango varieties
    3. Location × Variety supply combinations
    
    Data relationships:
    - Weighment → SellRequest → Farmer → Place (for source location)
    - Weighment.mango_variety (for variety data)
    - Weighment.actual_weight_tons × 1000 × Weighment.final_price_per_kg (for trading value)
    
    Returns all three analyses plus summary insights.
    """
    try:
        start_date = parse_date(request.args.get('start_date'))
        end_date = parse_date(request.args.get('end_date'))
        market_filter = request.args.get('market', '').strip() or None

        # ===== ANALYSIS 1: SOURCE LOCATIONS =====
        # Trace: Weighment → SellRequest → Farmer → Place.market_area
        # Group by source location and aggregate mango quantities
        
        source_locations_query = db.session.query(
            func.coalesce(Place.market_area, 'Unspecified').label('source_location'),
            func.coalesce(func.sum(Weighment.actual_weight_tons), 0).label('total_quantity_tons'),
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0).label('total_trading_value'),
            func.count(distinct(Weighment.sell_request_id)).label('total_sell_requests'),
            func.count(distinct(Farmer.id)).label('total_farmers')
        ).select_from(Weighment).outerjoin(
            SellRequest, Weighment.sell_request_id == SellRequest.id
        ).outerjoin(
            Farmer, SellRequest.farmer_id == Farmer.id
        ).outerjoin(
            Place, Farmer.place_id == Place.id
        )
        
        if start_date:
            source_locations_query = source_locations_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        if end_date:
            source_locations_query = source_locations_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        if market_filter:
            source_locations_query = source_locations_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
        
        source_locations_query = source_locations_query.group_by(
            func.coalesce(Place.market_area, 'Unspecified')
        ).order_by(desc('total_quantity_tons'))
        
        # Calculate total quantity for percentage
        total_supply_quantity = 0.0
        for row in source_locations_query.all():
            total_supply_quantity += safe_decimal_to_float(row[1])
        
        source_locations_data = []
        for row in source_locations_query.all():
            location = row[0]
            qty = safe_decimal_to_float(row[1])
            value = safe_decimal_to_float(row[2])
            reqs = row[3] or 0
            farmers = row[4] or 0
            
            pct = 0.0
            if total_supply_quantity > 0:
                pct = (qty / total_supply_quantity) * 100
            
            source_locations_data.append({
                'source_location': location,
                'total_quantity_tons': round(qty, 2),
                'total_trading_value': round(value, 2),
                'total_sell_requests': reqs,
                'total_farmers': farmers,
                'percentage_of_total_quantity': round(pct, 2)
            })

        # ===== ANALYSIS 2: TOP MANGO VARIETIES =====
        # Use Weighment.mango_variety as canonical source
        
        varieties_query = db.session.query(
            func.coalesce(Weighment.mango_variety, 'Unspecified').label('mango_variety'),
            func.coalesce(func.sum(Weighment.actual_weight_tons), 0).label('total_quantity_tons'),
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0).label('total_trading_value'),
            func.count(distinct(Weighment.sell_request_id)).label('total_sell_requests'),
            func.coalesce(func.avg(Weighment.final_price_per_kg), 0).label('average_final_price')
        ).select_from(Weighment)
        
        if start_date:
            varieties_query = varieties_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        if end_date:
            varieties_query = varieties_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        if market_filter:
            varieties_query = varieties_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
        
        varieties_query = varieties_query.group_by(
            func.coalesce(Weighment.mango_variety, 'Unspecified')
        ).order_by(desc('total_quantity_tons'))
        
        varieties_data = []
        total_variety_quantity = 0.0
        
        for row in varieties_query.all():
            total_variety_quantity += safe_decimal_to_float(row[1])
        
        for row in varieties_query.all():
            variety = row[0]
            qty = safe_decimal_to_float(row[1])
            value = safe_decimal_to_float(row[2])
            reqs = row[3] or 0
            avg_price = safe_decimal_to_float(row[4])
            
            pct = 0.0
            if total_variety_quantity > 0:
                pct = (qty / total_variety_quantity) * 100
            
            varieties_data.append({
                'mango_variety': variety,
                'total_quantity_tons': round(qty, 2),
                'total_trading_value': round(value, 2),
                'total_sell_requests': reqs,
                'average_final_price': round(avg_price, 2),
                'percentage_of_total_quantity': round(pct, 2)
            })

        # ===== ANALYSIS 3: LOCATION × VARIETY COMBINATIONS =====
        # Cross-tabulation of source locations × mango varieties
        
        combinations_query = db.session.query(
            func.coalesce(Place.market_area, 'Unspecified').label('source_location'),
            func.coalesce(Weighment.mango_variety, 'Unspecified').label('mango_variety'),
            func.coalesce(func.sum(Weighment.actual_weight_tons), 0).label('total_quantity_tons'),
            func.coalesce(func.sum(
                Weighment.actual_weight_tons * 1000 * Weighment.final_price_per_kg
            ), 0).label('total_trading_value'),
            func.count(distinct(Weighment.sell_request_id)).label('sell_request_count')
        ).select_from(Weighment).outerjoin(
            SellRequest, Weighment.sell_request_id == SellRequest.id
        ).outerjoin(
            Farmer, SellRequest.farmer_id == Farmer.id
        ).outerjoin(
            Place, Farmer.place_id == Place.id
        )
        
        if start_date:
            combinations_query = combinations_query.filter(
                func.date(Weighment.created_at) >= start_date
            )
        if end_date:
            combinations_query = combinations_query.filter(
                func.date(Weighment.created_at) <= end_date
            )
        if market_filter:
            combinations_query = combinations_query.join(
                Broker, Weighment.broker_id == Broker.id
            ).filter(Broker.market_name == market_filter)
        
        combinations_query = combinations_query.group_by(
            func.coalesce(Place.market_area, 'Unspecified'),
            func.coalesce(Weighment.mango_variety, 'Unspecified')
        ).order_by(desc('total_quantity_tons'))
        
        combinations_data = []
        for row in combinations_query.all():
            location = row[0]
            variety = row[1]
            qty = safe_decimal_to_float(row[2])
            value = safe_decimal_to_float(row[3])
            reqs = row[4] or 0
            
            combinations_data.append({
                'source_location': location,
                'mango_variety': variety,
                'total_quantity_tons': round(qty, 2),
                'total_trading_value': round(value, 2),
                'sell_request_count': reqs
            })

        # ===== SUMMARY INSIGHTS =====
        # Top source location
        top_source_location = None
        if source_locations_data:
            top_source_location = source_locations_data[0]
        
        # Top variety
        top_variety = None
        if varieties_data:
            top_variety = varieties_data[0]
        
        # Top combination
        top_combination = None
        if combinations_data:
            top_combination = combinations_data[0]

        summary = {
            'top_source_location': top_source_location,
            'top_variety': top_variety,
            'top_combination': top_combination
        }

        return jsonify({
            'success': True,
            'data': {
                'source_locations': source_locations_data,
                'top_varieties': varieties_data,
                'location_variety_combinations': combinations_data,
                'summary': summary
            },
            'filters': {
                'start_date': start_date.isoformat() if start_date else None,
                'end_date': end_date.isoformat() if end_date else None,
                'market': market_filter
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Failed to fetch supply origin analytics: {str(e)}'
        }), 500
