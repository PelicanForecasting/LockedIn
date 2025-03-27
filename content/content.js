import { shouldFilter, extractName } from '../lib/filter-engine.js';
import { debounce, throttle, findClosestElement, log } from '../lib/utils.js';
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
  
  // Extract name from an element
  function extractName(element) {
    // First try the element's text content
    let name = element.textContent?.trim();
    
    // If no name found directly, try various LinkedIn-specific attributes
    if (!name) {
      name = element.getAttribute('aria-label') || 
             element.getAttribute('title') || 
             element.getAttribute('alt');
    }
    
    // If still no name, try looking at child elements
    if (!name) {
      const nameSpan = element.querySelector('[data-test-id="actor-name"]');
      if (nameSpan) {
        name = nameSpan.textContent?.trim();
      }
    }
    
    // Try specific LinkedIn span structure (for the new format)
    if (!name) {
      const nameSpan = element.querySelector('.hoverable-link-text span[dir="ltr"] span');
      if (nameSpan) {
        name = nameSpan.textContent?.trim();
      }
    }
    
    return name;
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