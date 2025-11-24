# API Reference

Complete API documentation for the AgileReporter Variance Analysis Dashboard.

## Base URL

```
http://localhost:3000/api
```

## Authentication

The API currently does not require authentication. All endpoints are accessible without tokens.

## Endpoints

### Health Check

Check server health and availability.

```http
GET /api/health
```

**Response**
```json
{
  "status": "ok",
  "timestamp": "2025-11-24T10:30:00.000Z"
}
```

---

### Reports

#### Get All Reports

Retrieve a list of all analysis reports with optional filtering.

```http
GET /api/reports
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status: `completed`, `running`, `failed` |
| `baseDate` | string | Filter by base date (ISO format: YYYY-MM-DD) |
| `formCode` | string | Filter by form code (e.g., ARF1100) |

**Example Request**
```http
GET /api/reports?status=completed&baseDate=2025-06-30
```

**Response**
```json
{
  "reports": [
    {
      "id": "report-1700000000000-abc123",
      "timestamp": "2025-11-24T10:00:00.000Z",
      "baseDate": "2025-06-30",
      "totalReturns": 24,
      "totalVariances": 145,
      "totalValidationErrors": 3,
      "configFile": "config.json",
      "outputFile": "variance_results.xlsx",
      "duration": 180000,
      "status": "completed"
    }
  ]
}
```

---

#### Get Report by ID

Retrieve detailed metadata for a specific report.

```http
GET /api/reports/:id
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Report ID |

**Example Request**
```http
GET /api/reports/report-1700000000000-abc123
```

**Response**
```json
{
  "id": "report-1700000000000-abc123",
  "timestamp": "2025-11-24T10:00:00.000Z",
  "baseDate": "2025-06-30",
  "totalReturns": 24,
  "totalVariances": 145,
  "totalValidationErrors": 3,
  "configFile": "config.json",
  "outputFile": "variance_results.xlsx",
  "duration": 180000,
  "status": "completed"
}
```

**Error Responses**

| Status Code | Description |
|-------------|-------------|
| 404 | Report not found |
| 500 | Server error |

---

#### Get Report Details

Retrieve detailed form-level data including top variances for each form.

```http
GET /api/reports/:id/details
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Report ID |

**Example Request**
```http
GET /api/reports/report-1700000000000-abc123/details
```

**Response**
```json
{
  "results": [
    {
      "id": 1,
      "reportId": "report-1700000000000-abc123",
      "formName": "Balance Sheet",
      "formCode": "ARF1100",
      "confirmed": true,
      "varianceCount": 23,
      "validationErrorCount": 1,
      "baseDate": "2025-06-30",
      "comparisonDate": "2025-03-31",
      "topVariances": [
        {
          "Cell Reference": "Cell_A123",
          "Cell Description": "Total Assets_Current Assets_Cash",
          "2025-03-31": "5000000",
          "2025-06-30": "5500000",
          "Difference": "500000",
          "% Difference": "10.00",
          "flagged": true,
          "category": "investigating",
          "comment": "Large cash increase"
        }
      ]
    }
  ]
}
```

**Response Fields**

- `topVariances`: Limited to 100 largest non-zero, non-subtotal variances per form
- `flagged`: Boolean indicating if variance is flagged
- `category`: One of: `null`, `expected`, `unexpected`, `resolved`, `investigating`
- `comment`: User-provided comment text

---

#### Download Report Excel File

Download the original Excel workbook for a report.

```http
GET /api/reports/:id/download
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Report ID |

**Example Request**
```http
GET /api/reports/report-1700000000000-abc123/download
```

**Response**

Binary Excel file (.xlsx) with appropriate content-disposition header.

**Error Responses**

| Status Code | Description |
|-------------|-------------|
| 404 | Report or Excel file not found |
| 500 | Server error |

---

#### Export Form Variances to CSV

Export all variances for a specific form as CSV.

```http
GET /api/reports/:id/export/:formCode
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Report ID |
| `formCode` | string | Form code (e.g., ARF1100) |

**Example Request**
```http
GET /api/reports/report-1700000000000-abc123/export/ARF1100
```

**Response**

CSV file with columns:
- Cell Reference
- Cell Description
- {Comparison Date} (value)
- {Base Date} (value)
- Difference
- % Difference
- Flagged
- Category
- Comment

**Example CSV**
```csv
Cell Reference,Cell Description,2025-03-31,2025-06-30,Difference,% Difference,Flagged,Category,Comment
Cell_A123,"Total Assets_Current Assets_Cash",5000000,5500000,500000,10.00,Yes,investigating,"Large cash increase"
```

---

#### Delete Report

Permanently delete a report and all associated data.

```http
DELETE /api/reports/:id
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Report ID |

**Example Request**
```http
DELETE /api/reports/report-1700000000000-abc123
```

**Response**
```json
{
  "success": true
}
```

**Note**: This operation cascades and deletes:
- Report metadata
- Form details
- Variance data
- Annotations (flags, categories, comments)
- Validation errors

---

### Annotations

#### Update Variance Annotation

Add or update flags, categories, and comments for a specific variance.

```http
POST /api/reports/:id/annotations
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Report ID |

**Request Body**

```json
{
  "formCode": "ARF1100",
  "cellReference": "Cell_A123",
  "flagged": true,
  "category": "investigating",
  "comment": "Large cash increase - verifying with finance team"
}
```

**Body Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `formCode` | string | Yes | Form code |
| `cellReference` | string | Yes | Cell reference |
| `flagged` | boolean | No | Whether variance is flagged |
| `category` | string | No | Category: `expected`, `unexpected`, `resolved`, `investigating`, or `null` |
| `comment` | string | No | Comment text or `null` |

**Example Request**
```http
POST /api/reports/report-1700000000000-abc123/annotations
Content-Type: application/json

{
  "formCode": "ARF1100",
  "cellReference": "Cell_A123",
  "flagged": true,
  "category": "expected",
  "comment": "Seasonal increase confirmed"
}
```

**Response**
```json
{
  "success": true
}
```

**Notes**:
- Annotations persist across dashboard sessions
- Updates are immediate (no save button required)
- Partial updates supported (only include fields to change)

---

### Statistics

#### Get Statistics

Retrieve aggregated statistics with optional filtering.

```http
GET /api/statistics
```

**Query Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter by status |
| `baseDate` | string | Filter by base date |
| `formCode` | string | Filter by form code |

**Example Request**
```http
GET /api/statistics?status=completed&baseDate=2025-06-30
```

**Response**
```json
{
  "totalReports": 10,
  "completedReports": 9,
  "failedReports": 1,
  "runningReports": 0,
  "totalVariances": 1245,
  "totalValidationErrors": 23,
  "avgDuration": 185
}
```

**Response Fields**

| Field | Type | Description |
|-------|------|-------------|
| `totalReports` | number | Total number of reports |
| `completedReports` | number | Successfully completed reports |
| `failedReports` | number | Failed reports |
| `runningReports` | number | Currently running reports |
| `totalVariances` | number | Sum of all variances across reports |
| `totalValidationErrors` | number | Sum of all validation errors |
| `avgDuration` | number | Average duration in seconds |

---

### Filters

#### Get Filter Options

Retrieve available filter values for reports.

```http
GET /api/filters
```

**Response**
```json
{
  "baseDates": [
    "2025-06-30",
    "2025-03-31",
    "2024-12-31"
  ],
  "formCodes": [
    {
      "code": "ARF1100",
      "name": "Balance Sheet"
    },
    {
      "code": "ARF2200",
      "name": "Income Statement"
    }
  ]
}
```

**Use Case**: Populate dropdown filters in the dashboard UI.

---

### Analysis Control

#### Run Analysis

Start a new variance analysis job.

```http
POST /api/run-analysis
```

**Request Body**

```json
{
  "configFile": "config.json",
  "outputFile": "report_2025-06-30.xlsx"
}
```

**Body Fields**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `configFile` | string | Yes | Path to configuration JSON file |
| `outputFile` | string | No | Output Excel filename (auto-generated if omitted) |

**Example Request**
```http
POST /api/run-analysis
Content-Type: application/json

{
  "configFile": "config.json",
  "outputFile": "q2_2025_analysis.xlsx"
}
```

**Response**
```json
{
  "success": true,
  "reportId": "report-1700000000000-xyz789"
}
```

**Process**:
1. Validates configuration file exists and is readable
2. Spawns child process to run analysis
3. Returns immediately with report ID
4. Progress updates sent via WebSocket

**Error Responses**

| Status Code | Description |
|-------------|-------------|
| 400 | Invalid request (missing configFile or invalid path) |
| 500 | Server error |

---

#### Stop Analysis

Stop a currently running analysis job.

```http
POST /api/stop-analysis/:id
```

**Path Parameters**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Report ID of running job |

**Example Request**
```http
POST /api/stop-analysis/report-1700000000000-xyz789
```

**Response**
```json
{
  "success": true
}
```

**Error Responses**

| Status Code | Description |
|-------------|-------------|
| 404 | Job not found (not running or invalid ID) |
| 500 | Server error |

**Notes**:
- Terminates the analysis process immediately
- Partial results are not saved
- WebSocket clients receive error notification

---

## WebSocket API

Real-time progress updates are sent via WebSocket connection.

### Connection

```javascript
const ws = new WebSocket('ws://localhost:3000');
```

### Message Format

All messages are JSON objects with a `type` field.

#### Progress Update

```json
{
  "type": "progress",
  "current": 2,
  "total": 4,
  "currentItem": "[Analyzing Returns] Processing: ARF1100",
  "message": "Analyzing returns...",
  "reportId": "report-1700000000000-xyz789"
}
```

**Fields**:
- `type`: Always `"progress"`
- `current`: Current step number (1-4)
- `total`: Total steps (always 4)
- `currentItem`: Descriptive status message
- `message`: Short status message
- `reportId`: Associated report ID

#### Log Message

```json
{
  "type": "log",
  "reportId": "report-1700000000000-xyz789",
  "message": "✓ Authentication successful",
  "logLevel": "info"
}
```

**Fields**:
- `type`: Always `"log"`
- `reportId`: Associated report ID
- `message`: Log message text
- `logLevel`: One of `"info"`, `"warn"`, `"error"`, `"debug"`

#### Completion

```json
{
  "type": "complete",
  "current": 4,
  "total": 4,
  "reportId": "report-1700000000000-xyz789",
  "message": "Analysis completed successfully"
}
```

#### Error

```json
{
  "type": "error",
  "reportId": "report-1700000000000-xyz789",
  "message": "Authentication failed: Invalid credentials"
}
```

### Example Client

```javascript
const ws = new WebSocket('ws://localhost:3000');

ws.onopen = () => {
  console.log('Connected to dashboard');
};

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  
  switch (data.type) {
    case 'progress':
      console.log(`Progress: ${data.current}/${data.total} - ${data.currentItem}`);
      break;
    case 'log':
      console.log(`[${data.logLevel}] ${data.message}`);
      break;
    case 'complete':
      console.log('Analysis complete!');
      break;
    case 'error':
      console.error('Analysis failed:', data.message);
      break;
  }
};

ws.onerror = (error) => {
  console.error('WebSocket error:', error);
};

ws.onclose = () => {
  console.log('Disconnected from dashboard');
};
```

---

## Error Handling

### Standard Error Response

All error responses follow this format:

```json
{
  "error": "Description of what went wrong"
}
```

### HTTP Status Codes

| Code | Meaning |
|------|---------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| "Report not found" | Invalid report ID | Verify report ID exists |
| "Excel file not found" | File deleted or analysis failed | Re-run analysis |
| "Invalid file path" | Security violation | Use relative paths only |
| "Job not found" | Process not running | Check process is active |
| "configFile is required" | Missing required field | Include configFile in request |

---

## Rate Limiting

Currently, no rate limiting is implemented. All endpoints can be called freely.

**Recommendation**: For production use, implement rate limiting to prevent abuse.

---

## CORS

CORS is enabled for all origins. The server accepts requests from any domain.

**Configuration**: See `src/dashboard/server.ts` to modify CORS settings.

---

## Data Retention

Reports are stored indefinitely unless manually deleted. Consider implementing automatic cleanup:

```typescript
// In report-saver.ts
await reportSaver.cleanupOldReports(20); // Keep last 20 reports
```

---

## Security Considerations

1. **Authentication**: Currently no authentication required
   - Add authentication middleware for production
   - Implement user sessions

2. **File Path Validation**: Server validates paths to prevent directory traversal
   - All paths normalized and checked against working directory

3. **SQL Injection**: Uses parameterized queries throughout
   - All database operations use prepared statements

4. **WebSocket**: No authentication on WebSocket connections
   - Consider adding token-based authentication

---

## Performance Tips

1. **Filtering**: Use query parameters to reduce response size
   ```http
   GET /api/reports?status=completed&baseDate=2025-06-30
   ```

2. **Pagination**: Not currently implemented
   - Consider adding for large report sets

3. **Caching**: Dashboard caches report details
   - Use browser cache for static assets

4. **Concurrent Requests**: Server handles concurrent requests
   - No explicit rate limiting

---

## Examples

### Complete Workflow

```javascript
// 1. Check server health
const health = await fetch('/api/health').then(r => r.json());

// 2. Get available filters
const filters = await fetch('/api/filters').then(r => r.json());

// 3. Start new analysis
const analysis = await fetch('/api/run-analysis', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ configFile: 'config.json' })
}).then(r => r.json());

// 4. Monitor via WebSocket
const ws = new WebSocket('ws://localhost:3000');
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'complete') {
    // 5. Get report details
    fetch(`/api/reports/${data.reportId}/details`)
      .then(r => r.json())
      .then(details => console.log(details));
  }
};

// 6. Annotate variance
await fetch(`/api/reports/${analysis.reportId}/annotations`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    formCode: 'ARF1100',
    cellReference: 'Cell_A123',
    flagged: true,
    category: 'investigating',
    comment: 'Needs review'
  })
});

// 7. Export to CSV
window.location.href = `/api/reports/${analysis.reportId}/export/ARF1100`;
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | Nov 2024 | Initial release |

---

**Need Help?** See [README.md](./README.md) for general documentation or [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for common issues.