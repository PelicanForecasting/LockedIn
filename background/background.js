// Default state
const defaultState = {
    masterEnabled: true,
    filters: [],
    statistics: {
      today: 0,
      total: 0,
      lastReset: Date.now()
    },
    temporaryBypass: false
  };
  
  // Initialize when extension is installed or updated
  chrome.runtime.onInstalled.addListener(() => {
    chrome.storage.local.get(['filters', 'masterEnabled', 'statistics'], (data) => {
      // Set default values for anything not in storage
      const state = {
        masterEnabled: data.masterEnabled !== undefined ? data.masterEnabled : defaultState.masterEnabled,
        filters: data.filters || defaultState.filters,
        statistics: data.statistics || defaultState.statistics,
        temporaryBypass: false // Always reset temporary bypass on restart
      };
      
      chrome.storage.local.set(state);
    });
  });
  
  // Listen for messages from content scripts or popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    // Handle statistics updates from content script
    if (message.action === 'updateStatistics') {
      chrome.storage.local.get(['statistics'], (data) => {
        const statistics = data.statistics || defaultState.statistics;
        
        // Update counts
        statistics.today += message.count || 1;
        statistics.total += message.count || 1;
        statistics.lastReset = statistics.lastReset || Date.now();
        
        // Save updated statistics
        chrome.storage.local.set({ statistics });
        
        // Respond to confirm update
        sendResponse({ success: true });
      });
      
      // Return true to indicate we will send a response asynchronously
      return true;
    }
    
    // Request for current state from content script
    if (message.action === 'getState') {
      chrome.storage.local.get(['filters', 'masterEnabled', 'temporaryBypass'], (data) => {
        sendResponse({
          masterEnabled: data.masterEnabled !== undefined ? data.masterEnabled : defaultState.masterEnabled,
          filters: data.filters || defaultState.filters,
          temporaryBypass: data.temporaryBypass || defaultState.temporaryBypass
        });
      });
      
      // Return true to indicate we will send a response asynchronously
      return true;
    }
  });