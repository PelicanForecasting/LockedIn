/**
 * Filter Engine for LinkedIn Name Filter
 * Core logic for pattern matching and filtering
 */

// Main filter matching function
function matchesFilter(name, filter) {
    if (!name || typeof name !== 'string' || !filter) {
      return false;
    }
  
    try {
      if (filter.mode === 'substring') {
        if (filter.caseSensitive) {
          return name.includes(filter.pattern);
        } else {
          return name.toLowerCase().includes(filter.pattern.toLowerCase());
        }
      } else if (filter.mode === 'regex') {
        const regex = new RegExp(filter.pattern, filter.caseSensitive ? '' : 'i');
        return regex.test(name);
      }
      return false;
    } catch (error) {
      console.error('Error in filter matching:', error);
      return false;
    }
  }
  
  // Apply all filters to a name
  function shouldFilter(name, filters) {
    if (!name || !filters || !Array.isArray(filters) || filters.length === 0) {
      return false;
    }
  
    for (const filter of filters) {
      if (matchesFilter(name, filter)) {
        return true;
      }
    }
    return false;
  }
  
  // Validate a filter pattern
  function validateFilter(pattern, mode) {
    if (!pattern || pattern.trim() === '') {
      return { valid: false, error: 'Pattern cannot be empty' };
    }
  
    if (mode === 'regex') {
      try {
        new RegExp(pattern);
        return { valid: true };
      } catch (error) {
        return { valid: false, error: `Invalid regex: ${error.message}` };
      }
    }
  
    return { valid: true };
  }
  
  // Extract name from DOM element using various strategies
  function extractName(element) {
    if (!element || !(element instanceof Element)) {
      return null;
    }
  
    const strategies = [
      // Direct text content
      () => element.textContent?.trim(),
      
      // LinkedIn-specific attributes
      () => element.getAttribute('aria-label'),
      () => element.getAttribute('title'),
      () => element.getAttribute('alt'),
      
      // LinkedIn-specific child elements
      () => element.querySelector('[data-test-id="actor-name"]')?.textContent?.trim(),
      () => element.querySelector('.feed-shared-actor__name')?.textContent?.trim(),
      () => element.querySelector('.update-components-actor__name')?.textContent?.trim(),
      
      // Try parent element if this is just a wrapper
      () => element.parentElement?.getAttribute('aria-label'),
      
      // Try finding a name pattern in text (first and last name format)
      () => {
        const text = element.textContent?.trim();
        if (text) {
          const nameParts = text.split(/\s+/);
          if (nameParts.length >= 2) {
            // Check if this looks like a name (first word is capitalized)
            const firstWord = nameParts[0];
            if (firstWord && firstWord[0] === firstWord[0].toUpperCase()) {
              return text;
            }
          }
        }
        return null;
      }
    ];
    
    // Try each strategy until one returns a valid name
    for (const strategy of strategies) {
      const result = strategy();
      if (result) {
        return result;
      }
    }
    
    return null;
  }
  
  // Export functions for use in other modules
  export {
    matchesFilter,
    shouldFilter,
    validateFilter,
    extractName
  };