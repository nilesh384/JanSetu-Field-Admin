import redis from 'redis';
import dotenv from 'dotenv';

dotenv.config();

class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  async connect() {
    try {
      // Correct configuration for node-redis v4
      this.client = redis.createClient({
        url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
        socket: {
          connectTimeout: 60000,
          // The modern reconnectStrategy replaces the old retry_strategy
          reconnectStrategy: (retries) => {
            if (retries > 10) {
              console.error('❌ Too many retries, Redis connection terminated.');
              return new Error('Too many retries.');
            }
            // Reconnect every 1 second
            return 1000;
          }
        }
      });

      // Handle connection events
      this.client.on('connect', () => {
        console.log('🔗 Connecting to Redis...');
      });

      this.client.on('ready', () => {
        console.log('✅ Redis connected successfully');
        this.isConnected = true;
      });

      this.client.on('error', (err) => {
        console.error('❌ Redis client error:', err.message);
        this.isConnected = false;
      });

      this.client.on('end', () => {
        console.log('🔌 Redis connection closed');
        this.isConnected = false;
      });

      // NOTE: The 'reconnecting' event does not exist in v4.
      // The reconnectStrategy and error handlers are used instead.

      // Connect to Redis
      await this.client.connect();
      
    } catch (error) {
      console.error('❌ Failed to connect to Redis initially:', error.message);
      this.isConnected = false;
    }
  }

  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.quit();
      console.log('🔌 Redis disconnected');
    }
  }

  // Check if Redis is available
  isAvailable() {
    return this.client && this.isConnected;
  }

  // Set data with expiration (TTL in seconds)
  async set(key, value, ttl = 3600) {
    if (!this.isAvailable()) {
      console.warn('Redis not available, skipping cache set');
      return false;
    }

    try {
      const stringValue = typeof value === 'string' ? value : JSON.stringify(value);
      await this.client.setEx(key, ttl, stringValue);
      return true;
    } catch (error) {
      console.error('Redis SET error:', error.message);
      return false;
    }
  }

  // Get data
  async get(key) {
    if (!this.isAvailable()) {
      console.warn('Redis not available, skipping cache get');
      return null;
    }

    try {
      const value = await this.client.get(key);
      if (value === null) return null;
      
      // Try to parse JSON, return string if parsing fails
      try {
        return JSON.parse(value);
      } catch {
        return value;
      }
    } catch (error) {
      console.error('Redis GET error:', error.message);
      return null;
    }
  }

  // Delete data (supports single key or array of keys)
  async del(keyOrKeys) {
    if (!this.isAvailable()) {
      console.warn('Redis not available, skipping cache delete');
      return false;
    }

    try {
      if (Array.isArray(keyOrKeys)) {
        if (keyOrKeys.length === 0) return true;
        await this.client.del(keyOrKeys);
        return true;
      } else {
        await this.client.del(keyOrKeys);
        return true;
      }
    } catch (error) {
      console.error('Redis DEL error:', error.message);
      return false;
    }
  }

  // Check if key exists
  async exists(key) {
    if (!this.isAvailable()) {
      return false;
    }

    try {
      const result = await this.client.exists(key);
      return result === 1;
    } catch (error) {
      console.error('Redis EXISTS error:', error.message);
      return false;
    }
  }

  // Delete a single key (alias for del)
  async delete(key) {
    return await this.del(key);
  }

  // Delete all keys matching a pattern
  async deletePattern(pattern) {
    if (!this.isAvailable()) {
      console.warn('Redis not available, skipping pattern delete');
      return false;
    }

    try {
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await this.client.del(keys);
        console.log(`🗑️ Deleted ${keys.length} keys matching pattern: ${pattern}`);
      }
      return true;
    } catch (error) {
      console.error('Redis DELETE PATTERN error:', error.message);
      return false;
    }
  }

  // Scan keys matching a pattern
  async scanKeys(pattern) {
    if (!this.isAvailable()) {
      return [];
    }

    try {
      const keys = [];
      let cursor = '0'; // Start with string cursor
      
      do {
        const result = await this.client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100
        });
        cursor = result.cursor;
        keys.push(...result.keys);
      } while (cursor !== '0'); // Compare with string

      return keys;
    } catch (error) {
      console.error('Redis SCAN error:', error.message);
      return [];
    }
  }

  // Increment counter (useful for rate limiting)
  async increment(key, ttl = 3600) {
    if (!this.isAvailable()) {
      return 1;
    }

    try {
      const result = await this.client.incr(key);
      if (result === 1) {
        await this.client.expire(key, ttl);
      }
      return result;
    } catch (error) {
      console.error('Redis INCR error:', error.message);
      return 1;
    }
  }

  // Cache helper methods for common use cases
  
  // Cache user data
  async cacheUser(userId, userData, ttl = 1800) { // 30 minutes
    return await this.set(`user:${userId}`, userData, ttl);
  }

  async getCachedUser(userId) {
    return await this.get(`user:${userId}`);
  }

  async invalidateUser(userId) {
    return await this.del(`user:${userId}`);
  }

  // Cache OTP
  async cacheOTP(phoneNumber, otp, ttl = 300) { // 5 minutes
    return await this.set(`otp:${phoneNumber}`, otp, ttl);
  }

  async getCachedOTP(phoneNumber) {
    return await this.get(`otp:${phoneNumber}`);
  }

  async invalidateOTP(phoneNumber) {
    return await this.del(`otp:${phoneNumber}`);
  }

  // Cache reports
  async cacheReports(key, reports, ttl = 600) { // 10 minutes
    return await this.set(`reports:${key}`, reports, ttl);
  }

  async getCachedReports(key) {
    return await this.get(`reports:${key}`);
  }

  async invalidateAdminReports(adminId = null) {
    try {
      // If specific adminId provided, delete only that admin's caches
      // Otherwise, delete all admin report caches (use with caution)
      const pattern = adminId ? `reports:admin_reports:${adminId}:*` : `reports:admin_reports:*`;
      
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await this.del(keys);
        console.log(`🗑️ Invalidated ${keys.length} admin report cache entries`);
      }
      return keys.length;
    } catch (error) {
      console.warn('⚠️ Failed to invalidate admin reports cache:', error.message);
      return 0;
    }
  }

  // Rate limiting
  async checkRateLimit(identifier, limit = 10, window = 300) { // 10 requests per 5 minutes
    const key = `rate_limit:${identifier}`;
    const current = await this.increment(key, window);
    return {
      allowed: current <= limit,
      current,
      limit,
      resetTime: Date.now() + (window * 1000)
    };
  }

  // Session management
  async setSession(sessionId, sessionData, ttl = 86400) { // 24 hours
    return await this.set(`session:${sessionId}`, sessionData, ttl);
  }

  async getSession(sessionId) {
    return await this.get(`session:${sessionId}`);
  }

  async invalidateSession(sessionId) {
    return await this.del(`session:${sessionId}`);
  }

  // Generic pattern invalidation method
  async invalidatePattern(pattern) {
    try {
      const keys = await this.scanKeys(pattern);
      if (keys.length > 0) {
        await this.del(keys);
        console.log(`🗑️ Invalidated ${keys.length} cache entries matching pattern: ${pattern}`);
      }
      return keys.length;
    } catch (error) {
      console.warn(`⚠️ Failed to invalidate pattern ${pattern}:`, error.message);
      return 0;
    }
  }
}

// Create singleton instance
const redisService = new RedisService();

export default redisService;
