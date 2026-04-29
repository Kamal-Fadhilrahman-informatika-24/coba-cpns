require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const { apiLimiter } = require('./middleware/rateLimiter');
const { setupSocketHandlers } = require('./sockets/matchmaking');

// ─────────────────────────────────────────────────────────────────────────
// Validate required env vars early — fail fast
// ─────────────────────────────────────────────────────────────────────────
const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET'];
for (const key of REQUIRED_ENV) {
  if (!process.env[key]) {
    console.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Express + HTTP server setup
// ─────────────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5500';
const ALLOWED_ORIGINS = [
  CLIENT_URL,
  'http://127.0.0.1:5500',
  'http://localhost:3000',
  'http://localhost:5500'
];

// ─── Security middleware ──────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS blocked for origin: ${origin}`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Apply general rate limit to all /api routes
app.use('/api', apiLimiter);

// ─── Health check ─────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    uptime: Math.floor(process.uptime()) + 's'
  });
});

// ─── API Routes ───────────────────────────────────────────────────────
app.use('/api/auth', require('./routes/auth'));
app.use('/api/user', require('./routes/user'));
app.use('/api/test', require('./routes/test'));

// ─── 404 handler ──────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.path}` });
});

// ─── Global error handler ─────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Don't leak stack traces in production
  const isDev = process.env.NODE_ENV !== 'production';
  console.error('[server error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(isDev && { stack: err.stack })
  });
});

// ─── Socket.IO ────────────────────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  maxHttpBufferSize: 1e6 // 1MB
});

setupSocketHandlers(io);

// ─── Start server ─────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT, 10) || 3001;
server.listen(PORT, () => {
  console.log(`\n🚀 NumTest CPNS Backend`);
  console.log(`   ├─ HTTP:    http://localhost:${PORT}`);
  console.log(`   ├─ Health:  http://localhost:${PORT}/health`);
  console.log(`   ├─ Socket:  ws://localhost:${PORT}`);
  console.log(`   ├─ CORS:    ${ALLOWED_ORIGINS.join(', ')}`);
  console.log(`   └─ Env:     ${process.env.NODE_ENV || 'development'}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });
});

module.exports = { app, server, io };
