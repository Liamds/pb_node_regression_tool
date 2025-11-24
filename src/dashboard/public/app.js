// Dashboard Client Application
const API_BASE = window.location.origin + '/api';
const WS_URL = `ws://${window.location.host}`;

let ws = null;
let allReports = [];
let allReportDetails = new Map(); // Cache for report details
let charts = {}; // Store chart instances
let currentRunningJobId = null; // Track currently running job
let currentFilters = { status: '', baseDate: '', formCode: '' }; // Track current filters

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeTheme();
    initWebSocket();
    loadFilterOptions();
    loadStatistics();
    loadReports();
    
    // Setup search and filters
    document.getElementById('searchInput').addEventListener('input', filterReports);
    document.getElementById('statusFilter').addEventListener('change', async () => {
        currentFilters.status = document.getElementById('statusFilter').value;
        await loadReports(); // Reload reports with filter
    });
    document.getElementById('baseDateFilter').addEventListener('change', async () => {
        currentFilters.baseDate = document.getElementById('baseDateFilter').value;
        await loadReports(); // Reload reports with filter
    });
    document.getElementById('formFilter').addEventListener('change', async () => {
        currentFilters.formCode = document.getElementById('formFilter').value;
        await loadReports(); // Reload reports with filter
    });
});

// Dark Mode
function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    if (savedTheme === 'dark') {
        document.body.classList.add('dark-mode');
    }
}

function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    
    // Recreate charts with new theme colors
    if (charts.varianceTrend) {
        createTrendCharts();
    }
}

// Load filter options from API
async function loadFilterOptions() {
    try {
        const response = await fetch(`${API_BASE}/filters`);
        const data = await response.json();
        
        // Populate base date filter
        const baseDateFilter = document.getElementById('baseDateFilter');
        baseDateFilter.innerHTML = '<option value="">All Base Dates</option>' + 
            data.baseDates.map(date => `<option value="${date}">${date}</option>`).join('');
        
        // Populate form filter
        const formFilter = document.getElementById('formFilter');
        formFilter.innerHTML = '<option value="">All Forms</option>' + 
            data.formCodes.map(form => `<option value="${form.code}">${form.name} (${form.code})</option>`).join('');
    } catch (error) {
        console.error('Error loading filter options:', error);
    }
}

// WebSocket Connection
function initWebSocket() {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
        console.log('WebSocket connected');
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleProgressUpdate(data);
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
    };
    
    ws.onclose = () => {
        console.log('WebSocket disconnected');
        // Reconnect after 5 seconds
        setTimeout(initWebSocket, 5000);
    };
}

// Handle progress updates
function handleProgressUpdate(data) {
    const progressSection = document.getElementById('progressSection');
    const progressFill = document.getElementById('progressFill');
    const progressText = document.getElementById('progressText');
    const progressPercent = document.getElementById('progressPercent');
    const consoleOutput = document.getElementById('consoleOutput');
    
    if (data.type === 'progress') {
        progressSection.style.display = 'block';
        const percent = data.total ? Math.round((data.current / data.total) * 100) : 0;
        progressFill.style.width = percent + '%';
        progressText.textContent = data.currentItem || data.message || 'Processing...';
        progressPercent.textContent = percent + '%';
        
        // Update step indicators
        updateStepIndicators(data.current, data.total);
        
        // Store the running job ID
        if (data.reportId) {
            currentRunningJobId = data.reportId;
        }
    } else if (data.type === 'log') {
        // Append log to console
        const logEntry = document.createElement('div');
        logEntry.className = `log-entry log-${data.logLevel || 'info'}`;
        logEntry.textContent = data.message;
        consoleOutput.appendChild(logEntry);
        
        // Auto-scroll to bottom
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    } else if (data.type === 'complete') {
        progressFill.style.width = '100%';
        progressPercent.textContent = '100%';
        progressText.textContent = 'Analysis completed successfully!';
        
        // Mark all steps as complete
        for (let i = 1; i <= 4; i++) {
            const step = document.getElementById(`step-${i}`);
            if (step) {
                step.classList.add('completed');
                step.querySelector('.step-status').textContent = '✓';
            }
        }
        
        setTimeout(() => {
            progressSection.style.display = 'none';
            resetStepIndicators();
            clearConsole();
            currentRunningJobId = null;
            loadStatistics();
            loadReports();
        }, 3000);
    } else if (data.type === 'error') {
        progressText.textContent = 'Error: ' + (data.message || 'Unknown error');
        progressFill.style.background = 'var(--danger)';
        
        // Mark current step as failed
        const currentStep = getCurrentStep(progressFill.style.width);
        if (currentStep) {
            const step = document.getElementById(`step-${currentStep}`);
            if (step) {
                step.classList.add('failed');
                step.querySelector('.step-status').textContent = '✗';
            }
        }
        
        setTimeout(() => {
            progressSection.style.display = 'none';
            resetStepIndicators();
            clearConsole();
            currentRunningJobId = null;
            loadStatistics();
            loadReports();
        }, 5000);
    }
}

// Update step indicators based on progress
function updateStepIndicators(current, total) {
    // Reset all steps first
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`step-${i}`);
        if (step) {
            step.classList.remove('active', 'completed', 'failed');
            step.querySelector('.step-status').textContent = '⏳';
        }
    }
    
    // Mark completed steps
    for (let i = 1; i < current; i++) {
        const step = document.getElementById(`step-${i}`);
        if (step) {
            step.classList.add('completed');
            step.querySelector('.step-status').textContent = '✓';
        }
    }
    
    // Mark current step as active
    if (current <= total) {
        const step = document.getElementById(`step-${current}`);
        if (step) {
            step.classList.add('active');
            step.querySelector('.step-status').textContent = '⏳';
        }
    }
}

// Get current step from progress percentage
function getCurrentStep(widthPercent) {
    const percent = parseInt(widthPercent);
    if (percent < 25) return 1;
    if (percent < 50) return 2;
    if (percent < 75) return 3;
    if (percent < 100) return 4;
    return null;
}

// Reset step indicators
function resetStepIndicators() {
    for (let i = 1; i <= 4; i++) {
        const step = document.getElementById(`step-${i}`);
        if (step) {
            step.classList.remove('active', 'completed', 'failed');
            step.querySelector('.step-status').textContent = '⏳';
        }
    }
}

// Load statistics
async function loadStatistics() {
    try {
        const params = new URLSearchParams();
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.baseDate) params.append('baseDate', currentFilters.baseDate);
        if (currentFilters.formCode) params.append('formCode', currentFilters.formCode);
        
        const response = await fetch(`${API_BASE}/statistics?${params}`);
        const stats = await response.json();
        
        document.getElementById('totalReports').textContent = stats.totalReports;
        document.getElementById('completedReports').textContent = stats.completedReports;
        document.getElementById('totalVariances').textContent = stats.totalVariances.toLocaleString();
        document.getElementById('totalErrors').textContent = stats.totalValidationErrors.toLocaleString();
    } catch (error) {
        console.error('Error loading statistics:', error);
    }
}

// Load reports
async function loadReports() {
    try {
        const params = new URLSearchParams();
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.baseDate) params.append('baseDate', currentFilters.baseDate);
        if (currentFilters.formCode) params.append('formCode', currentFilters.formCode);
        
        // Add cache buster to ensure fresh data
        params.append('_t', Date.now().toString());
        
        const response = await fetch(`${API_BASE}/reports?${params}`, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            }
        });
        const data = await response.json();
        allReports = data.reports;
        
        console.log(`Loaded ${allReports.length} reports from API`);
        
        displayReports(allReports);
        
        // Load statistics with same filters
        await loadStatistics();
        
        // Load variance data for charts
        await loadVarianceData();
    } catch (error) {
        console.error('Error loading reports:', error);
        document.getElementById('reportsTableBody').innerHTML = `
            <tr><td colspan="8" class="loading-cell">Error loading reports</td></tr>
        `;
    }
}

// Load variance data for charts and caching
async function loadVarianceData() {
    // Clear existing cache when filters change
    allReportDetails.clear();
    
    // Load details for all filtered reports to populate charts
    for (const report of allReports) {
        try {
            const response = await fetch(`${API_BASE}/reports/${report.id}/details`);
            const details = await response.json();
            allReportDetails.set(report.id, details);
        } catch (error) {
            console.error(`Error loading details for report ${report.id}:`, error);
        }
    }
    
    createTrendCharts();
}

// Display reports in table
function displayReports(reports) {
    const tbody = document.getElementById('reportsTableBody');
    
    if (reports.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="loading-cell">No reports found</td></tr>';
        return;
    }
    
    tbody.innerHTML = reports.map(report => `
        <tr>
            <td>${formatDateTime(report.timestamp)}</td>
            <td>${report.baseDate}</td>
            <td>${report.totalReturns}</td>
            <td>${report.totalVariances.toLocaleString()}</td>
            <td>${report.totalValidationErrors.toLocaleString()}</td>
            <td>${formatDuration(report.duration)}</td>
            <td><span class="status-badge status-${report.status}">${report.status}</span></td>
            <td>
                <div class="action-buttons">
                    <button class="btn btn-sm btn-primary" onclick="viewDetails('${report.id}')">
                        View
                    </button>
                    <button class="btn btn-sm btn-secondary" onclick="downloadReport('${report.id}')">
                        Download
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteReport('${report.id}')">
                        Delete
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Filter reports
function filterReports() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    
    let filtered = allReports;
    
    if (searchTerm) {
        filtered = filtered.filter(r => 
            r.baseDate.toLowerCase().includes(searchTerm) ||
            r.id.toLowerCase().includes(searchTerm)
        );
    }
    
    displayReports(filtered);
}

// Create trend charts
function createTrendCharts() {
    if (allReports.length === 0) return;
    
    const isDark = document.body.classList.contains('dark-mode');
    const textColor = isDark ? '#e2e8f0' : '#334155';
    const gridColor = isDark ? '#334155' : '#e2e8f0';
    
    // Sort reports by date
    const sortedReports = [...allReports].sort((a, b) => 
        new Date(a.timestamp) - new Date(b.timestamp)
    );
    
    // Variance Trend Chart
    createChart('varianceTrendChart', {
        type: 'line',
        data: {
            labels: sortedReports.map(r => new Date(r.timestamp).toLocaleDateString()),
            datasets: [{
                label: 'Total Variances',
                data: sortedReports.map(r => r.totalVariances),
                borderColor: '#2563eb',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: getChartOptions('Variances', textColor, gridColor)
    }, 'varianceTrend');
    
    // Error Trend Chart
    createChart('errorTrendChart', {
        type: 'line',
        data: {
            labels: sortedReports.map(r => new Date(r.timestamp).toLocaleDateString()),
            datasets: [{
                label: 'Validation Errors',
                data: sortedReports.map(r => r.totalValidationErrors),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                fill: true
            }]
        },
        options: getChartOptions('Errors', textColor, gridColor)
    }, 'errorTrend');
    
    // Top Forms Chart
    createTopFormsChart(textColor, gridColor);
}

function createTopFormsChart(textColor, gridColor) {
    // Aggregate variance counts by form across all reports
    const formVariances = {};
    
    for (const [reportId, details] of allReportDetails.entries()) {
        if (details && details.results) {
            details.results.forEach(result => {
                const key = `${result.formName} (${result.formCode})`;
                formVariances[key] = (formVariances[key] || 0) + result.varianceCount;
            });
        }
    }
    
    // Get top 10 forms
    const sortedForms = Object.entries(formVariances)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10);
    
    createChart('topFormsChart', {
        type: 'bar',
        data: {
            labels: sortedForms.map(f => f[0]),
            datasets: [{
                label: 'Total Variances',
                data: sortedForms.map(f => f[1]),
                backgroundColor: '#10b981'
            }]
        },
        options: {
            ...getChartOptions('Variances', textColor, gridColor),
            indexAxis: 'y'
        }
    }, 'topForms');
}

function createChart(canvasId, config, chartKey) {
    // Destroy existing chart
    if (charts[chartKey]) {
        charts[chartKey].destroy();
    }
    
    const ctx = document.getElementById(canvasId);
    if (ctx) {
        charts[chartKey] = new Chart(ctx, config);
    }
}

function getChartOptions(yLabel, textColor, gridColor) {
    return {
        responsive: true,
        maintainAspectRatio: true,
        plugins: {
            legend: {
                display: false
            }
        },
        scales: {
            y: {
                beginAtZero: true,
                ticks: { color: textColor },
                grid: { color: gridColor },
                title: {
                    display: true,
                    text: yLabel,
                    color: textColor
                }
            },
            x: {
                ticks: { color: textColor },
                grid: { color: gridColor }
            }
        }
    };
}

// View report details
async function viewDetails(reportId) {
    try {
        const [metadataRes, detailsRes] = await Promise.all([
            fetch(`${API_BASE}/reports/${reportId}`),
            fetch(`${API_BASE}/reports/${reportId}/details`)
        ]);
        
        const metadata = await metadataRes.json();
        const details = await detailsRes.json();
        
        showModal(metadata, details);
    } catch (error) {
        console.error('Error loading report details:', error);
        alert('Error loading report details');
    }
}

// Show modal with details
function showModal(metadata, details) {
    const modal = document.getElementById('detailsModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    
    modalTitle.textContent = `Report: ${metadata.baseDate}`;
    
    modalBody.innerHTML = `
        <div class="detail-section">
            <h3>Summary</h3>
            <div class="detail-grid">
                <div class="detail-item">
                    <div class="detail-label">Report Date</div>
                    <div class="detail-value">${formatDateTime(metadata.timestamp)}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Base Date</div>
                    <div class="detail-value">${metadata.baseDate}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Total Returns</div>
                    <div class="detail-value">${metadata.totalReturns}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Total Variances</div>
                    <div class="detail-value">${metadata.totalVariances.toLocaleString()}</div>
                </div>
                <div class="detail-item">
                    <div class="detail-label">Validation Errors</div>
                    <div class="detail-value">${metadata.totalValidationErrors.toLocaleString()}</div>
                </div>
            </div>
        </div>
        
        <div class="detail-section">
            <h3>Forms Analysis</h3>
            <div class="form-results">
                ${details.results.map(result => `
                    <div class="form-result-card ${result.varianceCount > 0 || result.validationErrorCount > 0 ? 'has-issues' : ''}">
                        <div class="form-result-header">
                            <span class="form-result-name">${result.formName} (${result.formCode})</span>
                            <div style="display: flex; gap: 8px; align-items: center;">
                                ${result.confirmed ? '<span class="status-badge" style="background: #fef3c7; color: #92400e;">Confirmed</span>' : ''}
                                <button class="btn btn-sm btn-secondary" onclick="exportFormCSV('${metadata.id}', '${result.formCode}')" title="Export to CSV">
                                    📥 Export CSV
                                </button>
                            </div>
                        </div>
                        <div class="form-result-stats">
                            <span>📊 ${result.varianceCount} variances</span>
                            <span>❌ ${result.validationErrorCount} errors</span>
                            <span>📅 ${result.comparisonDate} → ${result.baseDate}</span>
                        </div>
                        ${result.topVariances && result.topVariances.length > 0 ? `
                            <details style="margin-top: 12px;">
                                <summary style="cursor: pointer; color: var(--primary);">View Top Variances</summary>
                                <div style="margin-top: 8px; padding-left: 16px;">
                                    <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                                        <thead>
                                            <tr style="border-bottom: 2px solid var(--gray-300); background-color: var(--gray-300);">
                                                <th style="text-align: left; padding: 8px; border-right: 1px solid var(--gray-200); width: 40px;">🚩</th>
                                                <th style="text-align: left; padding: 8px; border-right: 1px solid var(--gray-200)">Cell Reference</th>
                                                <th style="text-align: left; padding: 8px; border-right: 1px solid var(--gray-200)">Cell Description</th>
                                                <th style="text-align: right; padding: 8px; border-right: 1px solid var(--gray-200)">${result.comparisonDate}</th>
                                                <th style="text-align: right; padding: 8px; border-right: 1px solid var(--gray-200)">${result.baseDate}</th>
                                                <th style="text-align: right; padding: 8px; border-right: 1px solid var(--gray-200)">Difference</th>
                                                <th style="text-align: left; padding: 8px; border-right: 1px solid var(--gray-200)">Category</th>
                                                <th style="text-align: left; padding: 8px;">Comment</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            ${result.topVariances.map((v, i) => {
                                                const varianceKey = `${result.formCode}-${v['Cell Reference']}`;
                                                const isFlagged = v.flagged || false;
                                                const category = v.category || 'none';
                                                const comment = v.comment || '';
                                                
                                                return `
                                                <tr style="border-bottom: 1px solid var(--gray-200); background-color: ${i % 2 === 0 ? 'var(--gray-100)' : 'var(--gray-50)'};">
                                                    <td style="text-align: center; padding: 8px; border-right: 1px solid var(--gray-200)">
                                                        <button class="flag-btn ${isFlagged ? 'flagged' : ''}" onclick="toggleFlag('${metadata.id}', '${varianceKey}', this)">
                                                            ${isFlagged ? '🚩' : '⚐'}
                                                        </button>
                                                    </td>
                                                    <td style="text-align: left; padding: 8px; border-right: 1px solid var(--gray-200)">${v['Cell Reference']}</td>
                                                    <td style="text-align: left; padding: 8px; border-right: 1px solid var(--gray-200)">
                                                        ${v['Cell Description'].split('_').map((part, idx, arr) => {
                                                            const indent = '&nbsp;&nbsp;&nbsp;'.repeat(idx);
                                                            const connector = idx === 0 ? '' : (idx === arr.length - 1 ? '└─ ' : '├─ ');
                                                            return `${indent}${connector}${part}`;
                                                        }).join('<br>')}
                                                    </td>
                                                    <td style="text-align: right; padding: 8px; border-right: 1px solid var(--gray-200)">${v[result.comparisonDate] ? Number(v[result.comparisonDate]).toLocaleString() : '-'}</td>
                                                    <td style="text-align: right; padding: 8px; border-right: 1px solid var(--gray-200)">${v[result.baseDate] ? Number(v[result.baseDate]).toLocaleString() : '-'}</td>
                                                    <td style="text-align: right; padding: 8px; border-right: 1px solid var(--gray-200)">${Number(v['Difference']).toLocaleString()}</td>
                                                    <td style="text-align: left; padding: 8px; border-right: 1px solid var(--gray-200)">
                                                        <select class="variance-category" onchange="updateCategory('${metadata.id}', '${varianceKey}', this.value)">
                                                            <option value="none" ${category === 'none' ? 'selected' : ''}>-</option>
                                                            <option value="expected" ${category === 'expected' ? 'selected' : ''}>✓ Expected</option>
                                                            <option value="unexpected" ${category === 'unexpected' ? 'selected' : ''}>⚠ Unexpected</option>
                                                            <option value="resolved" ${category === 'resolved' ? 'selected' : ''}>✓ Resolved</option>
                                                            <option value="investigating" ${category === 'investigating' ? 'selected' : ''}>🔍 Investigating</option>
                                                        </select>
                                                    </td>
                                                    <td style="text-align: left; padding: 8px;">
                                                        <input type="text" 
                                                            class="variance-comment" 
                                                            placeholder="Add comment..."
                                                            value="${comment}"
                                                            onchange="updateComment('${metadata.id}', '${varianceKey}', this.value)">
                                                    </td>
                                                </tr>
                                            `}).join('')}
                                        </tbody>
                                    </table>
                                </div>
                            </details>
                        ` : ''}
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    
    modal.classList.add('show');
}

// Variance interaction functions
async function toggleFlag(reportId, varianceKey, button) {
    const [formCode, cellReference] = varianceKey.split('-');
    const isFlagged = !button.classList.contains('flagged');
    
    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}/annotations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                formCode,
                cellReference,
                flagged: isFlagged,
            }),
        });
        
        if (response.ok) {
            button.textContent = isFlagged ? '🚩' : '⚐';
            button.classList.toggle('flagged', isFlagged);
        } else {
            console.error('Error updating flag');
        }
    } catch (error) {
        console.error('Error updating flag:', error);
    }
}

async function updateCategory(reportId, varianceKey, category) {
    const [formCode, cellReference] = varianceKey.split('-');
    
    try {
        await fetch(`${API_BASE}/reports/${reportId}/annotations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                formCode,
                cellReference,
                category: category === 'none' ? null : category,
            }),
        });
    } catch (error) {
        console.error('Error updating category:', error);
    }
}

async function updateComment(reportId, varianceKey, comment) {
    const [formCode, cellReference] = varianceKey.split('-');
    
    try {
        await fetch(`${API_BASE}/reports/${reportId}/annotations`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                formCode,
                cellReference,
                comment: comment || null,
            }),
        });
    } catch (error) {
        console.error('Error updating comment:', error);
    }
}

// Close modal
function closeModal() {
    document.getElementById('detailsModal').classList.remove('show');
}

// Download report
async function downloadReport(reportId) {
    try {
        window.location.href = `${API_BASE}/reports/${reportId}/download`;
    } catch (error) {
        console.error('Error downloading report:', error);
        alert('Error downloading report');
    }
}

// Export form data to CSV
async function exportFormCSV(reportId, formCode) {
    try {
        window.location.href = `${API_BASE}/reports/${reportId}/export/${formCode}`;
    } catch (error) {
        console.error('Error exporting CSV:', error);
        alert('Error exporting CSV');
    }
}

// Delete report
async function deleteReport(reportId) {
    if (!confirm('Are you sure you want to delete this report?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/reports/${reportId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            loadStatistics();
            loadReports();
        } else {
            alert('Error deleting report');
        }
    } catch (error) {
        console.error('Error deleting report:', error);
        alert('Error deleting report');
    }
}

// Refresh reports
function refreshReports() {
    // Clear all caches
    allReportDetails.clear();
    
    // Reload everything
    loadFilterOptions();
    loadStatistics();
    loadReports();
}

// Run Analysis Modal Functions
function showRunModal() {
    document.getElementById('runModal').classList.add('show');
}

function closeRunModal() {
    document.getElementById('runModal').classList.remove('show');
}

// Run analysis
async function runAnalysis() {
    const configFile = document.getElementById('configFileInput').value.trim();
    const outputFile = document.getElementById('outputFileInput').value.trim();
    
    if (!configFile) {
        alert('Please provide a configuration file');
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/run-analysis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                configFile,
                outputFile: outputFile || undefined,
            }),
        });
        
        const result = await response.json();
        
        if (response.ok) {
            closeRunModal();
            
            // Show progress section
            document.getElementById('progressSection').style.display = 'block';
            document.getElementById('progressText').textContent = 'Starting analysis...';
            document.getElementById('progressPercent').textContent = '0%';
            
            // Store the running job ID
            currentRunningJobId = result.reportId;
            
            // Refresh reports to show the running job
            setTimeout(() => {
                loadReports();
            }, 1000);
        } else {
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error starting analysis:', error);
        alert('Failed to start analysis');
    }
}

// Stop analysis
async function stopAnalysis() {
    if (!currentRunningJobId) {
        return;
    }
    
    if (!confirm('Are you sure you want to stop the running analysis?')) {
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/stop-analysis/${currentRunningJobId}`, {
            method: 'POST',
        });
        
        if (response.ok) {
            console.log('Analysis stopped');
        } else {
            const result = await response.json();
            alert(`Error: ${result.error}`);
        }
    } catch (error) {
        console.error('Error stopping analysis:', error);
        alert('Failed to stop analysis');
    }
}

// Clear console output
function clearConsole() {
    document.getElementById('consoleOutput').innerHTML = '';
}

// Utility functions
function formatDateTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

// Close modal on outside click
window.onclick = (event) => {
    const modal = document.getElementById('detailsModal');
    if (event.target === modal) {
        closeModal();
    }
};