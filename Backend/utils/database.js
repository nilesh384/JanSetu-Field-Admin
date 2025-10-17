/**
 * Database operation utilities with retry logic and error handling
 */

/**
 * Execute a database operation with automatic retry and error handling
 * @param {Function} operation - Async function that performs the database operation
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @param {string} options.operationName - Name of the operation for logging
 * @returns {Promise} Result of the database operation
 */
export const executeWithRetry = async (operation, options = {}) => {
  const {
    maxRetries = 3,
    retryDelay = 1000,
    operationName = 'Database operation'
  } = options;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      const isLastAttempt = attempt === maxRetries;
      
      // Log the error
      console.error(`❌ ${operationName} failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      
      // Check if error is retryable
      const isRetryable = isRetryableError(error);
      
      if (!isRetryable || isLastAttempt) {
        // Don't retry for non-retryable errors or if this is the last attempt
        console.error(`💥 ${operationName} failed permanently:`, error.message);
        throw error;
      }
      
      // Wait before retry
      console.log(`⏳ Retrying ${operationName} in ${retryDelay}ms...`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
};

/**
 * Determine if an error is retryable
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is retryable
 */
const isRetryableError = (error) => {
  // Network and connection errors are retryable
  const retryableCodes = [
    'ENOTFOUND',      // DNS lookup failed
    'ECONNREFUSED',   // Connection refused
    'ETIMEDOUT',      // Connection timeout
    'ECONNRESET',     // Connection reset
    'EHOSTUNREACH',   // Host unreachable
    'ENETDOWN',       // Network is down
    'ENETUNREACH',    // Network unreachable
    '57P03',          // Database not ready
    '53300',          // Too many connections
    '08006',          // Connection failure
    '08001',          // Unable to connect
    '08004'           // Server rejected connection
  ];

  // Connection-related error messages
  const retryableMessages = [
    'Database connection unavailable',
    'Connection terminated unexpectedly',
    'Connection pool exhausted',
    'Server connection closed unexpectedly',
    'Connection timeout'
  ];

  // Check error code
  if (error.code && retryableCodes.includes(error.code)) {
    return true;
  }

  // Check error message
  if (error.message && retryableMessages.some(msg => error.message.includes(msg))) {
    return true;
  }

  // Default to not retryable for unknown errors
  return false;
};

/**
 * Wrapper for database operations that handles connection and cleanup
 * @param {Function} operation - Function that takes a database client and performs operations
 * @param {Object} options - Options for retry logic
 * @returns {Promise} Result of the operation
 */
export const withDatabaseClient = async (operation, options = {}) => {
  return executeWithRetry(async () => {
    const dbConnect = (await import('../db/dbConnect.js')).default;
    let client = null;
    
    try {
      client = await dbConnect();
      const result = await operation(client);
      return result;
    } finally {
      // Always release the client back to pool
      if (client) {
        try {
          client.end(); // This releases back to pool due to our override
        } catch (releaseError) {
          console.error('⚠️ Error releasing database client:', releaseError.message);
        }
      }
    }
  }, {
    operationName: options.operationName || 'Database operation',
    ...options
  });
};

/**
 * Enhanced error handler for database operations
 * @param {Error} error - The error to handle
 * @param {string} operation - Name of the operation that failed
 * @returns {Object} Formatted error response
 */
export const handleDatabaseError = (error, operation = 'Database operation') => {
  console.error(`❌ ${operation} error:`, error);
  
  // Map database errors to user-friendly messages
  if (error.code === '23505') {
    return {
      success: false,
      message: 'This record already exists',
      error: 'DUPLICATE_ENTRY'
    };
  }
  
  if (error.code === '23503') {
    return {
      success: false,
      message: 'Referenced record not found',
      error: 'FOREIGN_KEY_VIOLATION'
    };
  }
  
  if (error.code === '23502') {
    return {
      success: false,
      message: 'Required field is missing',
      error: 'NOT_NULL_VIOLATION'
    };
  }
  
  if (error.message && error.message.includes('Database connection unavailable')) {
    return {
      success: false,
      message: 'Database temporarily unavailable. Please try again later.',
      error: 'DATABASE_UNAVAILABLE'
    };
  }
  
  // Default error response
  return {
    success: false,
    message: 'Database operation failed. Please try again.',
    error: error.message || 'UNKNOWN_DATABASE_ERROR'
  };
};