import { Pool } from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

// Global connection pool instance
let pool = null;

// Configuration for retry logic
const RETRY_CONFIG = {
  maxRetries: 5,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  jitterMax: 1000
};

const buildSslConfig = () => {
  const caPath = process.env.PG_CA_PATH;
  if (caPath) {
    const resolved = path.resolve(caPath);
    if (fs.existsSync(resolved)) {
      try {
        const caBuf = fs.readFileSync(resolved);
        console.log('✅ Using custom Postgres CA from PG_CA_PATH:', resolved);
        return { ca: [caBuf], rejectUnauthorized: true };
      } catch (err) {
        console.error('❌ Error reading PG_CA_PATH file:', err);
      }
    } else {
      console.warn(`⚠️ PG_CA_PATH provided but file not found at resolved path: ${resolved}`);
    }
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn('⚠️ NODE_ENV=production and no PG_CA_PATH provided - SSL verification will be required.');
    return { rejectUnauthorized: true };
  }

  console.warn('⚠️ Dev fallback: disabling Postgres SSL certificate verification (rejectUnauthorized=false).');
  try {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    console.warn('⚠️ NODE_TLS_REJECT_UNAUTHORIZED set to 0 for development (insecure).');
  } catch (e) {
    console.warn('⚠️ Could not set NODE_TLS_REJECT_UNAUTHORIZED:', e);
  }

  return { rejectUnauthorized: false };
};

const calculateDelay = (attempt) => {
  const exponentialDelay = Math.min(
    RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt),
    RETRY_CONFIG.maxDelay
  );
  const jitter = Math.random() * RETRY_CONFIG.jitterMax;
  return Math.floor(exponentialDelay + jitter);
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Initialize the database connection pool
 * This should be called once when the application starts
 */
export const initializeDatabase = async () => {
  if (pool) {
    console.log('✅ Database pool already initialized');
    return pool;
  }

  const ssl = buildSslConfig();
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔄 Database connection attempt ${attempt + 1}/${RETRY_CONFIG.maxRetries + 1}`);
      
      pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl,
        max: 20,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        allowExitOnIdle: false
      });

      // Test the connection
      const testClient = await pool.connect();
      await testClient.query('SELECT NOW()');
      testClient.release();
      
      console.log('✅ Database pool initialized successfully');
      
      // Set up pool error handlers
      pool.on('error', (err) => {
        console.error('❌ Unexpected database pool error:', err);
      });

      pool.on('connect', () => {
        console.log('🔗 New database client connected to pool');
      });

      pool.on('remove', () => {
        console.log('🔌 Database client removed from pool');
      });
      
      return pool;
      
    } catch (error) {
      console.error(`❌ Database connection attempt ${attempt + 1} failed:`, error.message);
      
      if (attempt === RETRY_CONFIG.maxRetries) {
        console.error(`💥 All ${RETRY_CONFIG.maxRetries + 1} database connection attempts failed`);
        throw new Error(`Database initialization failed after ${RETRY_CONFIG.maxRetries + 1} attempts: ${error.message}`);
      }
      
      const delay = calculateDelay(attempt);
      console.log(`⏳ Retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
};

/**
 * Get the database pool instance
 * Throws error if pool is not initialized
 */
export const getPool = () => {
  if (!pool) {
    throw new Error('Database pool not initialized. Call initializeDatabase() first.');
  }
  return pool;
};

/**
 * Execute a database query using the connection pool
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object>} Query result
 */
export const query = async (text, params = []) => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    const result = await client.query(text, params);
    return result;
  } catch (error) {
    console.error('❌ Database query error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Execute multiple queries in a transaction
 * @param {Function} callback - Function that receives client and executes queries
 * @returns {Promise<any>} Result from callback
 */
export const transaction = async (callback) => {
  const pool = getPool();
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Transaction error:', error);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Execute a query that returns a single row
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Object|null>} Single row result or null
 */
export const queryOne = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows.length > 0 ? result.rows[0] : null;
};

/**
 * Execute a query that returns multiple rows
 * @param {string} text - SQL query string
 * @param {Array} params - Query parameters
 * @returns {Promise<Array>} Array of rows
 */
export const queryMany = async (text, params = []) => {
  const result = await query(text, params);
  return result.rows;
};

/**
 * Close the database pool (for graceful shutdown)
 */
export const closeDatabase = async () => {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✅ Database pool closed');
  }
};

/**
 * Check if database pool is healthy
 */
export const isHealthy = async () => {
  try {
    const pool = getPool();
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    console.error('❌ Database health check failed:', error);
    return false;
  }
};

/**
 * Get connection status information
 */
export const getConnectionStatus = () => {
  try {
    const currentPool = getPool();
    
    if (!currentPool) {
      return {
        isConnected: false,
        totalConnections: 0,
        idleConnections: 0,
        waitingClients: 0,
        attempts: 0,
        lastError: 'Pool not initialized'
      };
    }

    return {
      isConnected: true,
      totalConnections: currentPool.totalCount || 0,
      idleConnections: currentPool.idleCount || 0,
      waitingClients: currentPool.waitingCount || 0,
      attempts: 1,
      lastError: null
    };
  } catch (error) {
    return {
      isConnected: false,
      totalConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      attempts: 0,
      lastError: error.message
    };
  }
};