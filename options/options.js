// DOM Elements
const elements = {
    viewDataBtn: document.getElementById('viewDataBtn'),
    dataViewer: document.getElementById('dataViewer'),
    dataContent: document.getElementById('dataContent'),
    clearDataBtn: document.getElementById('clearDataBtn'),
    batchSize: document.getElementById('batchSize'),
    batchSizeValue: document.getElementById('batchSizeValue')
  };
  
  // Initialize the options page
  function initializeOptions() {
    // Load current settings
    chrome.storage.local.get(['batchSize'], (data) => {
      if (data.batchSize) {
        elements.batchSize.value = data.batchSize;
        elements.batchSizeValue.textContent = data.batchSize;
      }
    });
    
    // Add event listeners
    setupEventListeners();
  }
  
  // Set up all event listeners
  function setupEventListeners() {
    // View data button
    elements.viewDataBtn.addEventListener('click', viewStoredData);
    
    // Clear data button
    elements.clearDataBtn.addEventListener('click', clearAllData);
    
    // Batch size slider
    elements.batchSize.addEventListener('input', updateBatchSize);
  }
  
  // View all stored data
  async function viewStoredData() {
    // Get all stored data
    chrome.storage.local.get(null, (data) => {
      // Format the data as JSON
      const formattedData = JSON.stringify(data, null, 2);
      
      // Display in the viewer
      elements.dataContent.textContent = formattedData;
      elements.dataViewer.style.display = 'block';
    });
  }
  
  // Clear all stored data
  function clearAllData() {
    if (confirm('Are you sure you want to clear all stored data? This will remove all your filters and statistics.')) {
      chrome.storage.local.clear(() => {
        alert('All data has been cleared.');
        elements.dataViewer.style.display = 'none';
      });
    }
  }
  
  // Update batch size setting
  function updateBatchSize() {
    const value = elements.batchSize.value;
    elements.batchSizeValue.textContent = value;
    
    chrome.storage.local.set({ batchSize: parseInt(value) });
  }
  
  // Initialize when DOM is loaded
  document.addEventListener('DOMContentLoaded', initializeOptions);