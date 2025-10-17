import { Router } from "express";
import { getConnectionStatus, getPool } from "../db/utils.js";
import redisService from "../services/redis.js";

const router = Router();

/**
 * Health check endpoint
 * GET /api/v1/health
 */
router.get("/", async (req, res) => {
  try {
    const dbStatus = getConnectionStatus();
    const redisStatus = redisService.isAvailable();
    
    const healthData = {
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        connected: dbStatus.isConnected,
        totalConnections: dbStatus.totalConnections,
        idleConnections: dbStatus.idleConnections,
        waitingClients: dbStatus.waitingClients,
        connectionAttempts: dbStatus.attempts,
        lastError: dbStatus.lastError
      },
      redis: {
        connected: redisStatus,
        status: redisStatus ? 'Connected' : 'Disconnected'
      },
      environment: process.env.NODE_ENV || 'development'
    };

    // If database is not connected, return 503 Service Unavailable
    if (!dbStatus.isConnected) {
      return res.status(503).json({
        ...healthData,
        status: "unhealthy",
        message: "Database connection unavailable"
      });
    }

    res.status(200).json(healthData);
  } catch (error) {
    console.error('❌ Health check error:', error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

/**
 * Database connectivity test endpoint
 * GET /api/v1/health/db
 */
router.get("/db", async (req, res) => {
  try {
    // Test database connection using the centralized pool
    const pool = getPool();
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');
    
    res.status(200).json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      database: {
        connected: true,
        currentTime: result.rows[0].current_time,
        version: result.rows[0].pg_version,
        ...getConnectionStatus()
      }
    });
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    res.status(503).json({
      status: "unhealthy",
      timestamp: new Date().toISOString(),
      database: {
        connected: false,
        error: error.message,
        ...getConnectionStatus()
      }
    });
  }
});

export default router;