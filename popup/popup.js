// Utility functions from utils.js
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// Filter validation from filter-engine.js
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

// State management
let state = {
    masterEnabled: true,
    filters: [],
    statistics: {
      today: 0,
      total: 0,
      lastReset: Date.now()
    },
    temporaryBypass: false
  };
  
  // DOM Elements
  const elements = {
    masterToggle: document.getElementById('masterToggle'),
    filterPattern: document.getElementById('filterPattern'),
    matchingMode: document.getElementById('matchingMode'),
    caseSensitive: document.getElementById('caseSensitive'),
    addFilterBtn: document.getElementById('addFilterBtn'),
    filtersList: document.getElementById('filtersList'),
    validationFeedback: document.getElementById('validationFeedback'),
    previewResult1: document.getElementById('previewResult1'),
    previewResult2: document.getElementById('previewResult2'),
    testInput: document.getElementById('testInput'),
    testBtn: document.getElementById('testBtn'),
    testResult: document.getElementById('testResult'),
    statsToday: document.getElementById('statsToday'),
    statsTotal: document.getElementById('statsTotal'),
    resetStatsBtn: document.getElementById('resetStatsBtn'),
    exportBtn: document.getElementById('exportBtn'),
    importBtn: document.getElementById('importBtn'),
    importFile: document.getElementById('importFile'),
    clearAllBtn: document.getElementById('clearAllBtn'),
    temporaryBypass: document.getElementById('temporaryBypass')
  };
  
  // Initialize the popup
  async function initializePopup() {
    // Load state from storage
    try {
      const data = await chrome.storage.local.get(['filters', 'masterEnabled', 'statistics', 'temporaryBypass']);
      if (data.filters) state.filters = data.filters;
      if (data.masterEnabled !== undefined) state.masterEnabled = data.masterEnabled;
      if (data.statistics) state.statistics = data.statistics;
      if (data.temporaryBypass !== undefined) state.temporaryBypass = data.temporaryBypass;
      
      // Check if we need to reset daily stats
      const today = new Date().setHours(0, 0, 0, 0);
      const lastResetDay = new Date(state.statistics.lastReset).setHours(0, 0, 0, 0);
      if (today > lastResetDay) {
        state.statistics.today = 0;
        state.statistics.lastReset = Date.now();
        saveState();
      }
    } catch (error) {
      console.error('Failed to load state:', error);
    }
    
    // Update UI based on loaded state
    updateUI();
    
    // Add event listeners
    setupEventListeners();
  }
  
  // Update the UI with current state
  function updateUI() {
    // Update master toggle
    elements.masterToggle.checked = state.masterEnabled;
    
    // Update temporary bypass
    elements.temporaryBypass.checked = state.temporaryBypass;
    
    // Update filter list
    renderFilterList();
    
    // Update statistics
    elements.statsToday.textContent = state.statistics.today;
    elements.statsTotal.textContent = state.statistics.total;
    
    // Update live preview
    updateLivePreview();
  }
  
  // Render the list of filters
  function renderFilterList() {
    elements.filtersList.innerHTML = '';
    
    if (state.filters.length === 0) {
      const emptyItem = document.createElement('li');
      emptyItem.textContent = 'No filters added yet.';
      emptyItem.style.padding = '10px';
      emptyItem.style.textAlign = 'center';
      emptyItem.style.fontStyle = 'italic';
      emptyItem.style.color = '#888';
      elements.filtersList.appendChild(emptyItem);
      return;
    }
    
    state.filters.forEach((filter, index) => {
      const li = document.createElement('li');
      li.className = 'filter-item';
      
      const filterInfo = document.createElement('div');
      filterInfo.className = 'filter-info';
      
      const pattern = document.createElement('span');
      pattern.className = 'filter-pattern';
      pattern.textContent = filter.pattern;
      
      const type = document.createElement('span');
      type.className = 'filter-type';
      type.textContent = `${filter.mode}${filter.caseSensitive ? ' (case sensitive)' : ''}`;
      
      filterInfo.appendChild(pattern);
      filterInfo.appendChild(type);
      
      const removeBtn = document.createElement('button');
      removeBtn.className = 'remove-btn';
      removeBtn.textContent = '×';
      removeBtn.setAttribute('data-index', index);
      removeBtn.addEventListener('click', (e) => {
        const idx = parseInt(e.target.getAttribute('data-index'));
        removeFilter(idx);
      });
      
      li.appendChild(filterInfo);
      li.appendChild(removeBtn);
      elements.filtersList.appendChild(li);
    });
  }
  
  // Setup all event listeners
  function setupEventListeners() {
    // Master toggle
    elements.masterToggle.addEventListener('change', () => {
      state.masterEnabled = elements.masterToggle.checked;
      saveState();
      
      // Notify content script about the state change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateState', 
            state: { masterEnabled: state.masterEnabled }
          });
        }
      });
    });
    
    // Filter pattern input validation
    elements.filterPattern.addEventListener('input', validateFilterInput);
    elements.matchingMode.addEventListener('change', validateFilterInput);
    
    // Add filter button
    elements.addFilterBtn.addEventListener('click', addFilter);
    
    // Test button
    elements.testBtn.addEventListener('click', testName);
    
    // Reset stats button
    elements.resetStatsBtn.addEventListener('click', resetStatistics);
    
    // Export button
    elements.exportBtn.addEventListener('click', exportFilters);
    
    // Import button and file input
    elements.importBtn.addEventListener('click', () => {
      elements.importFile.click();
    });
    
    elements.importFile.addEventListener('change', importFilters);
    
    // Clear all button
    elements.clearAllBtn.addEventListener('click', clearAllFilters);
    
    // Temporary bypass
    elements.temporaryBypass.addEventListener('change', () => {
      state.temporaryBypass = elements.temporaryBypass.checked;
      saveState();
      
      // Notify content script about the state change
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, { 
            action: 'updateState', 
            state: { temporaryBypass: state.temporaryBypass }
          });
        }
      });
    });
    
    // Make sure filter pattern input has real-time validation
    elements.filterPattern.addEventListener('input', validateFilterInput);
    
    // Make sure matching mode and case sensitivity update live preview
    elements.matchingMode.addEventListener('change', updateLivePreview);
    elements.caseSensitive.addEventListener('change', updateLivePreview);
  }
  
  // Validate filter input in real-time
  function validateFilterInput() {
    const pattern = elements.filterPattern.value.trim();
    const mode = elements.matchingMode.value;
    
    if (!pattern) {
      elements.validationFeedback.textContent = '';
      elements.validationFeedback.classList.remove('validation-error');
      elements.addFilterBtn.disabled = true;
      return;
    }
    
    const validation = validateFilter(pattern, mode);
    elements.validationFeedback.textContent = validation.message || '';
    
    if (validation.valid) {
      elements.validationFeedback.classList.remove('validation-error');
      elements.addFilterBtn.disabled = false;
    } else {
      elements.validationFeedback.classList.add('validation-error');
      elements.addFilterBtn.disabled = true;
    }
    
    updateLivePreview();
  }
  
  // Update live preview
  function updateLivePreview() {
    const pattern = elements.filterPattern.value.trim();
    if (pattern === '') {
      elements.previewResult1.textContent = 'No match';
      elements.previewResult1.className = 'preview-result not-matched';
      elements.previewResult2.textContent = 'No match';
      elements.previewResult2.className = 'preview-result not-matched';
      return;
    }
    
    const mode = elements.matchingMode.value;
    const caseSensitive = elements.caseSensitive.checked;
    
    const testNames = ['John Smith', 'Kumar Patel'];
    const results = [elements.previewResult1, elements.previewResult2];
    
    testNames.forEach((name, index) => {
      let matches = false;
      
      if (mode === 'substring') {
        if (caseSensitive) {
          matches = name.includes(pattern);
        } else {
          matches = name.toLowerCase().includes(pattern.toLowerCase());
        }
      } else if (mode === 'regex') {
        try {
          const regex = new RegExp(pattern, caseSensitive ? '' : 'i');
          matches = regex.test(name);
        } catch (error) {
          matches = false;
        }
      }
      
      if (matches) {
        results[index].textContent = 'Match';
        results[index].className = 'preview-result matched';
      } else {
        results[index].textContent = 'No match';
        results[index].className = 'preview-result not-matched';
      }
    });
  }
  
  // Add a new filter
  function addFilter() {
    const pattern = elements.filterPattern.value.trim();
    const mode = elements.matchingMode.value;
    const caseSensitive = elements.caseSensitive.checked;
    
    // Validate the filter
    const validation = validateFilter(pattern, mode);
    if (!validation.valid) {
      // Show validation error
      elements.validationFeedback.textContent = validation.message;
      elements.validationFeedback.classList.add('validation-error');
      return;
    }
    
    // Create new filter
    const newFilter = {
      id: generateId(),
      pattern,
      mode,
      caseSensitive,
      createdAt: Date.now()
    };
    
    // Add to state
    state.filters.push(newFilter);
    
    // Save state
    saveState();
    
    // Update UI
    elements.filterPattern.value = '';
    elements.validationFeedback.textContent = '';
    elements.validationFeedback.classList.remove('validation-error');
    renderFilterList();
    updateLivePreview();
    
    // Notify content script
    notifyContentScript();
  }
  
  // Remove a filter
  function removeFilter(index) {
    state.filters.splice(index, 1);
    saveState();
    
    // Update UI
    renderFilterList();
    
    // Notify content script about the change
    notifyContentScript();
  }
  
  // Test a filter against a name
  function testName() {
    const nameToTest = elements.testInput.value.trim();
    const result = elements.testResult;
    
    if (!nameToTest) {
      result.textContent = 'Enter a name to test';
      result.className = 'test-neutral';
      return;
    }
    
    // Check if name matches any filter
    const matchedFilter = state.filters.find(filter => {
      if (filter.mode === 'substring') {
        if (filter.caseSensitive) {
          return nameToTest.includes(filter.pattern);
        } else {
          return nameToTest.toLowerCase().includes(filter.pattern.toLowerCase());
        }
      } else if (filter.mode === 'regex') {
        try {
          const regex = new RegExp(filter.pattern, filter.caseSensitive ? '' : 'i');
          return regex.test(nameToTest);
        } catch (e) {
          return false;
        }
      }
      return false;
    });
    
    if (matchedFilter) {
      result.textContent = `Matched by: ${matchedFilter.pattern}`;
      result.className = 'test-match';
    } else {
      result.textContent = 'No match';
      result.className = 'test-no-match';
    }
  }
  
  // Reset statistics
  function resetStatistics() {
    state.statistics.today = 0;
    state.statistics.total = 0;
    state.statistics.lastReset = Date.now();
    saveState();
    
    // Update UI
    elements.statsToday.textContent = '0';
    elements.statsTotal.textContent = '0';
    
    // Notify content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { action: 'resetStatistics' });
      }
    });
  }
  
  // Export filters
  function exportFilters() {
    const data = {
      filters: state.filters,
      exportDate: new Date().toISOString()
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = 'linkedin-name-filters.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // Import filters
  function importFilters(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(event) {
      try {
        const data = JSON.parse(event.target.result);
        if (Array.isArray(data.filters)) {
          state.filters = data.filters;
          saveState();
          renderFilterList();
          notifyContentScript();
          alert('Filters imported successfully!');
        } else {
          throw new Error('Invalid file format');
        }
      } catch (error) {
        alert('Failed to import filters. Please check the file format.');
        console.error('Import error:', error);
      }
    };
    reader.readAsText(file);
    e.target.value = null; // Reset file input
  }
  
  // Clear all filters
  function clearAllFilters() {
    if (confirm('Are you sure you want to clear all filters?')) {
      state.filters = [];
      saveState();
      renderFilterList();
      notifyContentScript();
    }
  }
  
  // Save state to chrome.storage
  function saveState() {
    chrome.storage.local.set({
      masterEnabled: state.masterEnabled,
      filters: state.filters,
      statistics: state.statistics,
      temporaryBypass: state.temporaryBypass
    });
  }
  
  // Notify content script about changes
  function notifyContentScript() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { 
          action: 'updateFilters', 
          filters: state.filters
        });
      }
    });
  }
  
  // Initialize when DOM is loaded
  document.addEventListener('DOMContentLoaded', initializePopup);