/**
 * InsightPro Survey API — Node.js / Express backend
 * Endpoints:
 *   GET  /api/till    -> till number
 *   POST /api/signup  -> register + issue token
 *   POST /api/pay     -> verify token, simulate M-Pesa payment
 *
 * Run:
 *   npm install
 *   npm start
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

// ---------- CONFIG ----------
const PORT = process.env.PORT || 3000;
const TILL_NUMBER = process.env.TILL_NUMBER || '6054123';
const SESSION_TTL_MS = (Number(process.env.SESSION_TTL_SECONDS) || 7200) * 1000;

// In-memory stores (replace with a real DB in production)
const users = new Map();      // email -> { name, passwordHash, createdAt }
const sessions = new Map();   // token -> { email, paid, createdAt }
const payments = [];          // audit log

// ---------- Helpers ----------
function hashPassword(pw) {
  // Demo only — use bcrypt/argon2 in production!
  return crypto.createHash('sha256').update(pw).digest('hex');
}

function newToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function makeSession(email) {
  const token = newToken();
  sessions.set(token, { email, paid: false, createdAt: Date.now() });
  return token;
}

function getSession(token) {
  const s = sessions.get(token);
  if (!s) return null;
  if (Date.now() - s.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function requireToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!auth.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const token = auth.slice(7).trim();
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Session expired or invalid' });
  }
  req.session = session;
  req.token = token;
  next();
}

// ---------- Routes ----------
app.get('/api/till', (req, res) => {
  res.json({ till: TILL_NUMBER });
});

app.post('/api/signup', (req, res) => {
  const { name, email, password } = req.body || {};

  const cleanName = (name || '').trim();
  const cleanEmail = (email || '').trim().toLowerCase();
  const cleanPassword = password || '';

  if (!cleanName || !cleanEmail || !cleanPassword) {
    return res.status(400).json({ error: 'name, email and password are required' });
  }
  if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (cleanPassword.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (users.has(cleanEmail)) {
    return res.status(409).json({ error: 'An account with this email already exists' });
  }

  users.set(cleanEmail, {
    name: cleanName,
    passwordHash: hashPassword(cleanPassword),
    createdAt: Date.now(),
  });

  const token = makeSession(cleanEmail);
  return res.status(201).json({
    message: 'Signup successful',
    token,
    user: { name: cleanName, email: cleanEmail },
  });
});

app.post('/api/pay', requireToken, (req, res) => {
  const { phone, pin } = req.body || {};
  const digits = String(phone || '').replace(/\D/g, '');
  const cleanPin = String(pin || '').trim();

  if (digits.length < 9) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }
  if (cleanPin.length !== 4 || !/^\d{4}$/.test(clean
