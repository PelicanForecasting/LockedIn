
import { validateFilter } from '/workspaces/LockedIn/lib/filter-engine'
import { generateId, formatDate, deepClone } from '/workspaces/LockedIn/lib/utils';
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
    testName: document.getElementById('testName'),
    testBtn: document.getElementById('testBtn'),
    resultText: document.getElementById('resultText'),
    matchedBy: document.getElementById('matchedBy'),
    postsToday: document.getElementById('postsToday'),
    postsTotal: document.getElementById('postsTotal'),
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
    elements.postsToday.textContent = state.statistics.today;
    elements.postsTotal.textContent = state.statistics.total;
    
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
    elements.testBtn.addEventListener('click', testFilter);
    
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
  }
  
  // Validate filter input
  function validateFilterInput() {
    const pattern = elements.filterPattern.value.trim();
    const mode = elements.matchingMode.value;
    
    if (pattern === '') {
      elements.validationFeedback.textContent = '';
      elements.validationFeedback.className = 'validation-feedback';
      return false;
    }
    
    if (mode === 'regex') {
      try {
        new RegExp(pattern);
        elements.validationFeedback.textContent = '✓ Valid regex pattern';
        elements.validationFeedback.className = 'validation-feedback valid-input';
        updateLivePreview();
        return true;
      } catch (error) {
        elements.validationFeedback.textContent = '✗ Invalid regex pattern';
        elements.validationFeedback.className = 'validation-feedback invalid-input';
        return false;
      }
    } else {
      elements.validationFeedback.textContent = '✓ Valid pattern';
      elements.validationFeedback.className = 'validation-feedback valid-input';
      updateLivePreview();
      return true;
    }
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
    if (pattern === '') return;
    
    if (!validateFilterInput()) return;
    
    const filter = {
      id: Date.now().toString(),
      pattern,
      mode: elements.matchingMode.value,
      caseSensitive: elements.caseSensitive.checked
    };
    
    state.filters.push(filter);
    saveState();
    
    // Clear input
    elements.filterPattern.value = '';
    elements.validationFeedback.textContent = '';
    elements.validationFeedback.className = 'validation-feedback';
    
    // Update UI
    renderFilterList();
    
    // Notify content script about the new filter
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
  function testFilter() {
    const name = elements.testName.value.trim();
    if (name === '') {
      elements.resultText.textContent = 'Enter a name to test';
      elements.matchedBy.textContent = 'None';
      return;
    }
    
    let matched = false;
    let matchingFilter = null;
    
    for (const filter of state.filters) {
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
          matched = false;
        }
      }
      
      if (matched) {
        matchingFilter = filter;
        break;
      }
    }
    
    if (matched && matchingFilter) {
      elements.resultText.textContent = 'This name would be filtered';
      elements.resultText.style.color = '#e74c3c';
      elements.matchedBy.textContent = `"${matchingFilter.pattern}" (${matchingFilter.mode})`;
    } else {
      elements.resultText.textContent = 'This name would not be filtered';
      elements.resultText.style.color = '#27ae60';
      elements.matchedBy.textContent = 'None';
    }
  }
  
  // Reset statistics
  function resetStatistics() {
    state.statistics.today = 0;
    state.statistics.total = 0;
    state.statistics.lastReset = Date.now();
    saveState();
    
    // Update UI
    elements.postsToday.textContent = '0';
    elements.postsTotal.textContent = '0';
    
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