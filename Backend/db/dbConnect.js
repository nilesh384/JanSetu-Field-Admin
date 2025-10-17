import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { Client, Pool } from 'pg';

dotenv.config();

// Configuration for retry logic
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 1000, // Start with 1 second
  maxDelay: 30000,   // Max 30 seconds between retries
  backoffMultiplier: 2, // Exponential backoff
  jitterMax: 1000    // Add randomness to prevent thundering herd
};

// Global connection pool
let pool = null;
let connectionAttempts = 0;
let lastConnectionError = null;

const buildSslConfig = () => {
  // If a CA file path is provided via PG_CA_PATH, use it (recommended for production)
  const caPath = process.env.PG_CA_PATH;
  if (caPath) {
    const resolved = path.resolve(caPath);
    if (fs.existsSync(resolved)) {
      try {
        // Read as Buffer (pg/tls accepts Buffer, string, or array)
        const caBuf = fs.readFileSync(resolved);
        console.log('✅ Using custom Postgres CA from PG_CA_PATH:', resolved);
        // Pass CA as an array to support certificate chains
        return { ca: [caBuf], rejectUnauthorized: true };
      } catch (err) {
        console.error('❌ Error reading PG_CA_PATH file:', err);
        // fall through to other handling
      }
    } else {
      console.warn(`⚠️ PG_CA_PATH provided but file not found at resolved path: ${resolved}`);
    }
  }

  // In production we require proper certificate verification
  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ NODE_ENV=production and no PG_CA_PATH provided - SSL verification will be required.');
    return { rejectUnauthorized: true };
  }

  // Development fallback: disable cert verification to avoid SELF_SIGNED_CERT_IN_CHAIN
  // WARNING: insecure - do NOT use in production
  console.warn('⚠️ Dev fallback: disabling Postgres SSL certificate verification (rejectUnauthorized=false).');
  // Also set the Node TLS global flag to be permissive in development so the underlying
  // TLS layer does not abort the connection for self-signed cert chains. This is
  // intentionally only done for non-production environments.
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.warn('⚠️ NODE_TLS_REJECT_UNAUTHORIZED set to 0 for development (insecure).');
  } catch (e) {
    console.warn('⚠️ Could not set NODE_TLS_REJECT_UNAUTHORIZED:', e);
  }

  return { rejectUnauthorized: false };
};

/**
 * Calculate delay for exponential backoff with jitter
 * @param {number} attempt - Current attempt number (0-based)
 * @returns {number} Delay in milliseconds
 */
const calculateDelay = (attempt) => {
  const exponentialDelay = Math.min(
    RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
    RETRY_CONFIG.maxDelay
  );
  
  // Add jitter to prevent thundering herd problem
  const jitter = Math.random() * RETRY_CONFIG.jitterMax;
  return Math.floor(exponentialDelay + jitter);
};

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Initialize database connection pool with retry logic
 * @returns {Promise<Pool>} PostgreSQL connection pool
 */
const initializePool = async () => {
  const ssl = buildSslConfig();
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔄 Database connection attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}`);
      
      const newPool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl,
        // Connection pool configuration
        max: 20,                     // Maximum number of clients in pool
        idleTimeoutMillis: 30000,    // Close idle clients after 30 seconds
        connectionTimeoutMillis: 10000, // Wait 10 seconds for connection
        // Retry configuration
        retryDelay: 2000,            // Wait 2 seconds between retries within pg
        allowExitOnIdle: false       // Keep pool alive
      });

      // Test the connection
      const testClient = await newPool.connect();
      await testClient.query('SELECT NOW()');
      testClient.release();
      
      console.log('✅ Connected to PostgreSQL database');
      connectionAttempts = 0; // Reset counter on success
      lastConnectionError = null;
      
      // Set up pool error handlers
      newPool.on('error', (err) => {
        console.error('❌ Unexpected database pool error:', err);
        lastConnectionError = err;
      });

      newPool.on('connect', () => {
        console.log('🔗 New database client connected');
      });

      newPool.on('remove', () => {
        console.log('🔌 Database client removed from pool');
      });
      
      return newPool;
      
    } catch (error) {
      connectionAttempts++;
      lastConnectionError = error;
      
      console.error(`❌ Database connection attempt ${attempt + 1} failed:`, error.message);
      
      // Provide detailed error information
      if (error.code === 'ENOTFOUND') {
        console.error('🌐 DNS lookup failed - check your DATABASE_URL hostname');
      } else if (error.code === 'ECONNREFUSED') {
        console.error('🚫 Connection refused - check if database server is running');
      } else if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN') {
        console.error('🔒 SSL certificate issue - check your PG_CA_PATH configuration');
      } else if (error.code === 'ETIMEDOUT') {
        console.error('⏱️ Connection timeout - database server may be slow or unreachable');
      }
      
      // If this is the last attempt, don't wait
      if (attempt === RETRY_CONFIG.maxRetries) {
        console.error(`💥 All ${RETRY_CONFIG.maxRetries + 1} database connection attempts failed`);
        
        // Provide comprehensive troubleshooting information
        if (error.code === 'SELF_SIGNED_CERT_IN_CHAIN' && process.env.PG_CA_PATH) {
          console.error('\n🔍 TROUBLESHOOTING SSL CERTIFICATE ISSUE:');
          console.error('- The provided PG_CA_PATH did not validate the server certificate');
          console.error('- Verify you downloaded the correct CA bundle from your provider (Aiven, etc.)');
          console.error('- Ensure PG_CA_PATH points to the full certificate chain file');
          console.error('- For development only: remove PG_CA_PATH to use insecure fallback');
        }
        
        throw new Error(`Database connection failed after ${RETRY_CONFIG.maxRetries + 1} attempts: ${error.message}`);
      }
      
      // Calculate delay and wait before retry
      const delay = calculateDelay(attempt);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
};

/**
 * Get database connection from pool with automatic retry
 * @returns {Promise<Client>} Database client from pool
 */
const dbConnect = async () => {
  try {
    // Initialize pool if it doesn't exist or has been destroyed
    if (!pool || pool.ended) {
      console.log('🔄 Initializing database connection pool...');
      pool = await initializePool();
    }
    
    // Get client from pool
    const client = await pool.connect();
    
    // Override the client.end() method to release back to pool instead
    const originalEnd = client.end;
    client.end = function() {
      // Release the client back to the pool
      client.release();
    };
    
    return client;
    
  } catch (error) {
    console.error('❌ Failed to get database connection:', error.message);
    
    // Don't crash the application, throw error to be handled by calling code
    throw new Error(`Database connection unavailable: ${error.message}`);
  }
};

/**
 * Gracefully close database pool
 */
const closePool = async () => {
  if (pool && !pool.ended) {
    console.log('🔌 Closing database connection pool...');
    await pool.end();
    console.log('✅ Database pool closed');
  }
};

/**
 * Get database connection status
 * @returns {Object} Connection status information
 */
const getConnectionStatus = () => {
  return {
    isConnected: pool && !pool.ended,
    totalConnections: pool ? pool.totalCount : 0,
    idleConnections: pool ? pool.idleCount : 0,
    waitingClients: pool ? pool.waitingCount : 0,
    attempts: connectionAttempts,
    lastError: lastConnectionError ? lastConnectionError.message : null
  };
};

// Graceful shutdown handlers
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, gracefully closing database connections...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, gracefully closing database connections...');
  await closePool();
  process.exit(0);
});

export default dbConnect;
export { closePool, getConnectionStatus };