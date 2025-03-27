/**
 * Utility functions for LinkedIn Name Filter
 * Generic helper functions used across the extension
 */

// Debounce function to limit the frequency of function calls
function debounce(func, wait) {
    let timeout;
    return function(...args) {
      const context = this;
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(context, args), wait);
    };
  }
  
  // Throttle function to ensure function is not called more than once in a specified period
  function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
      const context = this;
      if (!inThrottle) {
        func.apply(context, args);
        inThrottle = true;
        setTimeout(() => inThrottle = false, limit);
      }
    };
  }
  
  // Generate a unique ID for filters
  function generateId() {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // Format date for display
  function formatDate(timestamp) {
    if (!timestamp) return '';
    
    const date = new Date(timestamp);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }
  
  // Safely parse JSON with error handling
  function safeJsonParse(str, fallback = null) {
    try {
      return JSON.parse(str);
    } catch (error) {
      console.error('JSON parse error:', error);
      return fallback;
    }
  }
  
  // Deep clone an object
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }
  
  // Check if running in LinkedIn domain
  function isLinkedInDomain() {
    return window.location.hostname.includes('linkedin.com');
  }
  
  // Find closest container based on selectors
  function findClosestElement(element, selectors) {
    if (!element || !selectors || !Array.isArray(selectors)) {
      return null;
    }
    
    let current = element;
    while (current && current !== document.body) {
      for (const selector of selectors) {
        if (current.matches(selector)) {
          return current;
        }
      }
      current = current.parentElement;
    }
    
    return null;
  }
  
  // Get statistics for current day
  function getDailyStatistics(statistics) {
    if (!statistics) return { today: 0, total: 0 };
    
    const today = new Date().setHours(0, 0, 0, 0);
    const lastReset = new Date(statistics.lastReset || 0).setHours(0, 0, 0, 0);
    
    // Reset daily counter if dates don't match
    if (today > lastReset) {
      return {
        today: 0,
        total: statistics.total || 0,
        lastReset: Date.now()
      };
    }
    
    return statistics;
  }
  
  // Log messages with consistent formatting
  function log(level, message, data = null) {
    const prefix = '[LinkedIn Name Filter]';
    
    switch (level) {
      case 'info':
        console.info(`${prefix} ${message}`, data);
        break;
      case 'warn':
        console.warn(`${prefix} ${message}`, data);
        break;
      case 'error':
        console.error(`${prefix} ${message}`, data);
        break;
      default:
        console.log(`${prefix} ${message}`, data);
    }
  }
  
  // Export functions for use in other modules
  export {
    debounce,
    throttle,
    generateId,
    formatDate,
    safeJsonParse,
    deepClone,
    isLinkedInDomain,
    findClosestElement,
    getDailyStatistics,
    log
  };