const { Redis } = require('@upstash/redis');
require('dotenv').config();

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Cache manager for scraping results
 */
const cache = {
  /**
   * Get data from cache
   * @param {string} key 
   */
  async get(key) {
    try {
      const data = await redis.get(key);
      return data;
    } catch (error) {
      console.error('Redis Get Error:', error);
      return null;
    }
  },

  /**
   * Set data in cache
   * @param {string} key 
   * @param {any} value 
   * @param {number} ttl In seconds (default 24h)
   */
  async set(key, value, ttl = 86400) {
    try {
      await redis.set(key, value, { ex: ttl });
    } catch (error) {
      console.error('Redis Set Error:', error);
    }
  },

  /**
   * Generate a cache key for a search or extraction
   * @param {string} provider 
   * @param {string} type 'search' or 'extract'
   * @param {string} query 
   */
  generateKey(provider, type, query) {
    // Normalize query to avoid cache misses due to casing/whitespace
    const normalized = query.toLowerCase().trim().replace(/\s+/g, '_');
    return `mv:${provider}:${type}:${normalized}`;
  }
};

module.exports = cache;
