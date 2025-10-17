import app from './app.js';
import dotenv from 'dotenv';
import redisService from './services/redis.js';

dotenv.config({path: './.env'});

const PORT = process.env.PORT || 4000;

// Global error handlers to prevent crashes
process.on('uncaughtException', (error) => {
  console.error('🚨 Uncaught Exception:', error.message);
  console.error('Stack:', error.stack);
  // Don't exit immediately, log and continue
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit immediately, log and continue
});

// Graceful shutdown handlers
const gracefulShutdown = async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  // Close Redis connection
  await redisService.disconnect();
  
  // Close server and database connections
  if (global.server) {
    global.server.close(() => {
      console.log('✅ HTTP server closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Start server without requiring database connection at startup
const startServer = async () => {
  try {
    // Initialize Redis connection
    console.log('🔄 Initializing Redis...');
    await redisService.connect();
    
    const server = app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📊 Health check available at: http://localhost:${PORT}/api/v1/health`);
      console.log(`🗄️ Database status at: http://localhost:${PORT}/api/v1/health/db`);
      console.log(`🔴 Redis status: ${redisService.isAvailable() ? 'Connected' : 'Disconnected'}`);
    });

    // Handle server errors
    server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use`);
      } else {
        console.error('❌ Server error:', error);
      }
    });

    // Keep reference for graceful shutdown
    global.server = server;

    return server;
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
};

// Start the server
const server = await startServer();

// Export for graceful shutdown
export default server;
