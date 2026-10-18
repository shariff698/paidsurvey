"""
InsightPro Survey API — Flask backend
Endpoints:
  GET  /api/till    -> returns configured till number
  POST /api/signup  -> create user, return session token
  POST /api/pay     -> verify token, simulate M-Pesa payment
Run:
  pip install -r requirements.txt
  python app.py
"""
import os
import secrets
import time
from functools import wraps
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow frontend on any origin (tighten in production)

# ---------- CONFIG ----------
TILL_NUMBER = os.environ.get("TILL_NUMBER", "6054123")

# In-memory stores (swap for a real DB in production)
USERS = {}        # email -> { name, password_hash, created_at }
SESSIONS = {}     # token -> { email, paid, created_at }
PAYMENTS = []     # audit log

# Simple token lifetime (seconds)
SESSION_TTL = 60 * 60 * 2  # 2 hours


# ---------- Helpers ----------
def hash_password(pw: str) -> str:
    """Demo only — DO NOT use plain SHA in production. Use bcrypt/argon2."""
    import hashlib
    return hashlib.sha256(pw.encode("utf-8")).hexdigest()


def new_token() -> str:
    return secrets.token_urlsafe(32)


def make_session(email: str) -> str:
    token = new_token()
    SESSIONS[token] = {
        "email": email,
        "paid": False,
        "created_at": time.time(),
    }
    return token


def get_session(token: str):
    s = SESSIONS.get(token)
    if not s:
        return None
    if time.time() - s["created_at"] > SESSION_TTL:
        SESSIONS.pop(token, None)
        return None
    return s


def require_token(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Missing or invalid Authorization header"}), 401
        token = auth.split(" ", 1)[1].strip()
        session = get_session(token)
        if not session:
            return jsonify({"error": "Session expired or invalid"}), 401
        request.session_data = session
        request.session_token = token
        return f(*args, **kwargs)
    return wrapper


# ---------- Routes ----------
@app.route("/api/till", methods=["GET"])
def get_till():
    return jsonify({"till": TILL_NUMBER})


@app.route("/api/signup", methods=["POST"])
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = (data.get("password") or "")

    if not name or not email or not password:
        return jsonify({"error": "name, email and password are required"}), 400
    if "@" not in email or len(email) < 5:
        return jsonify({"error": "Invalid email address"}), 400
    if len(password) < 6:
        return jsonify({"error": "Password must be at least 6 characters"}), 400
    if email in USERS:
        return jsonify({"error": "An account with this email already exists"}), 409

    USERS[email] = {
        "name": name,
        "password_hash": hash_password(password),
        "created_at": time.time(),
    }
    token = make_session(email)
    return jsonify({
        "message": "Signup successful",
        "token": token,
        "user": {"name": name, "email": email},
    }), 201


@app.route("/api/pay", methods=["POST"])
@require_token
def pay():
    data = request.get_json(silent=True) or {}
    phone = (data.get("phone") or "").strip()
    pin = (data.get("pin") or "").strip()

    digits = "".join(ch for ch in phone if ch.isdigit())
    if len(digits) < 9:
        return jsonify({"error": "Invalid phone number"}), 400
    if len(pin) != 4 or not pin.isdigit():
        return jsonify({"error": "PIN must be exactly 4 digits"}), 400

    # DEMO ONLY — this does not contact M-Pesa. It simulates success.
    # In production, integrate the real Daraja API and verify the callback.
    session = request.session_data
    if session["paid"]:
        return jsonify({
            "message": "Already paid — full access granted",
            "paid": True,
        }), 200

    session["paid"] = True
    PAYMENTS.append({
        "email": session["email"],
        "phone": digits,
        "amount": 250,          # KES, demo
        "status": "success",
        "ts": time.time(),
        "till": TILL_NUMBER,
    })

    return jsonify({
        "message": "Payment successful — full access granted",
        "paid": True,
        "receipt": f"RCPT-{secrets.token_hex(4).upper()}",
    }), 200


@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "users": len(USERS), "payments": len(PAYMENTS)})


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"🐍 InsightPro Flask backend on http://localhost:{port}")
    print(f"   Till number: {TILL_NUMBER}")
    app.run(host="0.0.0.0", port=port, debug=True)
