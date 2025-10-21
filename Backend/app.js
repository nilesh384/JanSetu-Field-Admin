import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { initializeDatabase, closeDatabase } from "./db/utils.js";

const app = express();

// Initialize database connection pool
const initApp = async () => {
  try {
    await initializeDatabase();
    console.log('🚀 Database initialized successfully');
  } catch (error) {
    console.error('💥 Failed to initialize database:', error);
    process.exit(1);
  }
};

// Initialize database when app starts
initApp();

app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Admin-Id'],
}));

// Preflight requests are handled by the cors middleware above
app.use(express.json({ limit: '20mb' }));
app.use(cookieParser())

// Import Routes
import userRouter from "./routes/users.routes.js";
import otpRouter from "./routes/otp.routes.js";
import reportsRouter from "./routes/reports.routes.js";
import healthRouter from "./routes/health.routes.js";
import adminRouter from "./routes/admin.routes.js";
import messagesRouter from "./routes/messages.routes.js";
import socialRouter from "./routes/social.routes.js";
import notificationsRouter from "./routes/notifications.routes.js";
import fieldAdminRouter from "./routes/fieldAdmin.routes.js";


//routes declaration
app.use("/api/v1/users", userRouter);
app.use("/api/v1/otp", otpRouter);
app.use("/api/v1/reports", reportsRouter);
app.use("/api/v1/health", healthRouter);
app.use("/api/v1/admin", adminRouter);
app.use("/api/v1/messages", messagesRouter);
app.use("/api/v1/social", socialRouter);
app.use("/api/v1/notifications", notificationsRouter);
app.use("/api/v1/field-admin", fieldAdminRouter);



app.get("/", (req, res) => {
  res.send("Hello World!");
});


// Database error handling middleware
app.use((err, req, res, next) => {
    // Log the error for debugging
    console.error('🚨 Error caught by middleware:', {
        message: err.message,
        code: err.code,
        url: req.url,
        method: req.method,
        timestamp: new Date().toISOString()
    });

    // Database connection errors
    if (err.message && err.message.includes('Database connection unavailable')) {
        return res.status(503).json({
            success: false,
            message: 'Database temporarily unavailable. Please try again later.',
            error: 'DATABASE_UNAVAILABLE',
            retryAfter: 30 // seconds
        });
    }

    // PostgreSQL specific errors
    if (err.code) {
        switch (err.code) {
            case 'ENOTFOUND':
                return res.status(503).json({
                    success: false,
                    message: 'Database server not reachable',
                    error: 'DATABASE_DNS_ERROR'
                });
            case 'ECONNREFUSED':
                return res.status(503).json({
                    success: false,
                    message: 'Database connection refused',
                    error: 'DATABASE_CONNECTION_REFUSED'
                });
            case 'ETIMEDOUT':
                return res.status(503).json({
                    success: false,
                    message: 'Database connection timeout',
                    error: 'DATABASE_TIMEOUT'
                });
            case '28000': // Invalid authorization
                return res.status(503).json({
                    success: false,
                    message: 'Database authentication failed',
                    error: 'DATABASE_AUTH_ERROR'
                });
            case '57P03': // Cannot connect now
                return res.status(503).json({
                    success: false,
                    message: 'Database is not ready to accept connections',
                    error: 'DATABASE_NOT_READY'
                });
        }
    }

    // Default error handling
    const statusCode = err.statusCode || 500;

    // Check if headers have already been sent
    if (res.headersSent) {
        console.error('⚠️ Headers already sent, cannot send error response:', err.message);
        return;
    }

    return res.status(statusCode).json({
        success: false,
        message: err.message || "Internal Server Error",
        errors: err.errors || [],
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
    });
});

// Graceful shutdown handling
const gracefulShutdown = async (signal) => {
    console.log(`🛑 Received ${signal}. Starting graceful shutdown...`);
    
    try {
        await closeDatabase();
        console.log('✅ Database connections closed');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during graceful shutdown:', error);
        process.exit(1);
    }
};

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export default app;