// Utility functions from utils.js
function debounce(func, wait) {
  let timeout;
  return function(...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

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

// Filter functions from filter-engine.js
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

// State management
let state = {
    masterEnabled: true,
    filters: [],
    temporaryBypass: false,
    nameCache: new Map()
  };
  
  // Constants for performance tuning
  const BATCH_SIZE = 20;
  const MAX_CACHE_SIZE = 1000;
  const CACHE_CLEANUP_THRESHOLD = 800;
  
  // Initialize the content script
  async function initialize() {
    // Request initial state from background script
    chrome.runtime.sendMessage({ action: 'getState' }, (response) => {
      if (response) {
        state.masterEnabled = response.masterEnabled;
        state.filters = response.filters;
        state.temporaryBypass = response.temporaryBypass;
        
        // Set up the observer once we have the state
        setupMutationObserver();
        
        // Process existing content
        processExistingContent();
      }
    });
    
    // Listen for messages from popup or background
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.action === 'updateFilters') {
        state.filters = message.filters;
        state.nameCache.clear(); // Clear cache when filters change
        processExistingContent(); // Reprocess page with new filters
      }
      
      if (message.action === 'updateState') {
        if (message.state.masterEnabled !== undefined) {
          state.masterEnabled = message.state.masterEnabled;
          processExistingContent(); // Reprocess page with new state
        }
        
        if (message.state.temporaryBypass !== undefined) {
          state.temporaryBypass = message.state.temporaryBypass;
          processExistingContent(); // Reprocess page with new state
        }
      }
      
      if (message.action === 'resetStatistics') {
        // Nothing to do in content script for this action
      }
      
      sendResponse({ success: true });
    });
  }
  
  // Set up mutation observer to detect new content
  function setupMutationObserver() {
    const observer = new MutationObserver((mutations) => {
      // Use requestAnimationFrame to batch DOM operations
      requestAnimationFrame(() => {
        // Collect elements to process
        const elementsToProcess = new Set();// Process added nodes
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            for (const node of mutation.addedNodes) {
              if (node.nodeType === Node.ELEMENT_NODE) {
                // Find all name-containing elements
                const nameElements = findNameElements(node);
                nameElements.forEach(el => elementsToProcess.add(el));
              }
            }
          }
        }
        
        // Process collected elements in batches
        if (elementsToProcess.size > 0) {
          processBatch(Array.from(elementsToProcess));
        }
      });
    });
  
    // Configure observer for optimal performance
    observer.observe(document.body, {
      childList: true,   // Watch for added/removed nodes
      subtree: true,     // Look at entire DOM tree
      attributes: false, // Don't need attributes for name detection
      characterData: false // Don't need text changes
    });
  }
  
  // Process existing content on the page
  function processExistingContent() {
    // Find all name elements in the current page
    const nameElements = findNameElements(document.body);
    
    // Process them in batches
    if (nameElements.length > 0) {
      processBatch(nameElements);
    }
  }
  
  // Find elements containing names
  function findNameElements(rootElement) {
    const elements = [];
    
    // LinkedIn-specific selectors for name elements
    const selectors = [
      // Feed posts authors
      '.feed-shared-actor__name',
      '.update-components-actor__name',
      '.update-components-actor__title',
      // Profile cards
      '.artdeco-entity-lockup__title',
      // Comments
      '.comments-post-meta__name',
      // Search results
      '.entity-result__title-text a',
      // Connection cards
      '.discover-entity-type-card__info-container a',
      // Notifications
      '.nt-card__text a'
    ];
    
    // Query for all potential name elements
    selectors.forEach(selector => {
      const found = rootElement.querySelectorAll(selector);
      if (found.length > 0) {
        elements.push(...found);
      }
    });
    
    return elements;
  }
  
  // Process elements in batches to maintain performance
  function processBatch(elements, startIndex = 0) {
    // If filtering is disabled, don't process anything
    if (!state.masterEnabled || state.temporaryBypass) {
      return;
    }
    
    const endIndex = Math.min(startIndex + BATCH_SIZE, elements.length);
    const batch = elements.slice(startIndex, endIndex);
    
    // Process current batch
    batch.forEach(element => {
      if (shouldFilterElement(element)) {
        hideElement(element);
      }
    });
    
    // Process next batch if more elements remain
    if (endIndex < elements.length) {
      setTimeout(() => {
        processBatch(elements, endIndex);
      }, 0);
    }
    
    // Manage cache size
    if (state.nameCache.size > MAX_CACHE_SIZE) {
      pruneCache();
    }
  }
  
  // Determine if an element should be filtered based on the name it contains
  function shouldFilterElement(element) {
    // Extract name from element
    const name = extractName(element);
    if (!name) return false;
    
    // Check cache first
    if (state.nameCache.has(name)) {
      return state.nameCache.get(name);
    }
    
    // Apply filters to name
    for (const filter of state.filters) {
      let matched = false;
      
      if (filter.mode === 'substring') {
        if (filter.caseSensitive) {
          matched = name.includes(filter.pattern);
        } else {
          matched = name.toLowerCase().includes(filter.pattern.toLowerCase());
        }
      } else if (filter.mode === 'regex') {
        try {
          const regex = new RegExp(filter.pattern, filter.caseSensitive ? '' : 'i');
          matched = regex.test(name);
        } catch (error) {
          console.error('Invalid regex pattern:', filter.pattern);
          matched = false;
        }
      }
      
      if (matched) {
        // Store result in cache
        state.nameCache.set(name, true);
        return true;
      }
    }
    
    // No match found
    state.nameCache.set(name, false);
    return false;
  }
  
  // Hide an element that matches our filters
  function hideElement(element) {
    // Find the post container to hide
    let container = findPostContainer(element);
    
    if (container) {
      // Add our custom class to hide the element
      container.classList.add('lnf-filtered-content');
      
      // If the element isn't already marked as filtered
      if (!container.dataset.lnfFiltered) {
        container.dataset.lnfFiltered = 'true';
        
        // Update statistics
        updateStatistics();
      }
    }
  }
  
  // Find the container element for a post
  function findPostContainer(element) {
    // LinkedIn-specific container selectors, from most specific to most general
    const containerSelectors = [
      '.feed-shared-update-v2',
      '.occurrence-update',
      '.artdeco-card',
      '.feed-shared-update',
      '.update-components-actor',
      '.entity-result',
      '.artdeco-entity-lockup',
      '.discover-entity-type-card',
      '.update-components-actor__meta-link'
    ];
    
    // Start from the element and search up the DOM tree
    let current = element;
    while (current && current !== document.body) {
      // Check if current element matches any of our container selectors
      for (const selector of containerSelectors) {
        if (current.matches(selector)) {
          return current;
        }
      }
      current = current.parentElement;
    }
    
    // If no suitable container found, just return the element itself
    return element;
  }
  
  // Update statistics when content is filtered
  function updateStatistics() {
    chrome.runtime.sendMessage({ 
      action: 'updateStatistics', 
      count: 1
    });
  }
  
  // Prune the cache when it gets too large
  function pruneCache() {
    const entries = Array.from(state.nameCache.entries());
    const entriesToRemove = entries.slice(0, entries.length - CACHE_CLEANUP_THRESHOLD);
    
    for (const [key] of entriesToRemove) {
      state.nameCache.delete(key);
    }
  }
  
  // Initialize the content script
  initialize();