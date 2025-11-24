# Configuration Guide

Comprehensive guide to configuring the AgileReporter Variance Analysis Tool.

## Table of Contents

- [Environment Variables](#environment-variables)
- [Configuration File](#configuration-file)
- [Advanced Configuration](#advanced-configuration)
- [Best Practices](#best-practices)
- [Examples](#examples)

## Environment Variables

Environment variables are stored in the `.env` file at the project root.

### Creating .env File

```bash
# Create from template
cat > .env << 'EOF'
# AgileReporter API Configuration
AUTH_URL=https://your-domain.agilereporter.com/agilereporter/oauth/token
API_BASE_URL=https://your-domain.agilereporter.com/agilereporter/rest/api

# Authentication Credentials
APRA_USERNAME=your_username
PASSWORD=your_password
GRANT_TYPE=password
CLIENT_ID=your_client_id
CLIENT_SECRET=your_client_secret

# Excel Document Properties (Optional)
EXCEL_AUTHOR=Your Name
EXCEL_TITLE=Variance Analysis Report
EXCEL_CATEGORY=Regulatory Reporting
EOF
```

### Required Variables

#### AUTH_URL
- **Description**: OAuth token endpoint URL
- **Format**: `https://domain/agilereporter/oauth/token`
- **Example**: `https://company-uat.agilereporter.com/agilereporter/oauth/token`
- **Required**: Yes

#### API_BASE_URL
- **Description**: Base URL for API endpoints
- **Format**: `https://domain/agilereporter/rest/api`
- **Example**: `https://company-uat.agilereporter.com/agilereporter/rest/api`
- **Required**: Yes

#### APRA_USERNAME
- **Description**: Your AgileReporter username
- **Format**: Plain text, no quotes
- **Example**: `john.doe`
- **Required**: Yes

#### PASSWORD
- **Description**: Your AgileReporter password
- **Format**: Plain text, no quotes
- **Example**: `MyP@ssw0rd123`
- **Required**: Yes
- **Security**: Never commit .env to version control

#### GRANT_TYPE
- **Description**: OAuth grant type
- **Format**: Usually `password`
- **Example**: `password`
- **Required**: Yes

#### CLIENT_ID
- **Description**: OAuth client identifier
- **Format**: Provided by AgileReporter
- **Example**: `my-client-app`
- **Required**: Yes

#### CLIENT_SECRET
- **Description**: OAuth client secret
- **Format**: Provided by AgileReporter
- **Example**: `abc123def456`
- **Required**: Yes
- **Security**: Never commit to version control

### Optional Variables

#### EXCEL_AUTHOR
- **Description**: Author name in Excel document properties
- **Default**: Empty string
- **Example**: `John Doe`
- **Required**: No

#### EXCEL_TITLE
- **Description**: Title in Excel document properties
- **Default**: Empty string
- **Example**: `Q2 2025 Variance Analysis`
- **Required**: No

#### EXCEL_CATEGORY
- **Description**: Category in Excel document properties
- **Default**: Empty string
- **Example**: `Regulatory Reporting`
- **Required**: No

### Important Notes

1. **No Quotes**: Values should not be wrapped in quotes
   ```bash
   # Bad
   APRA_USERNAME="john.doe"
   PASSWORD='secret'
   
   # Good
   APRA_USERNAME=john.doe
   PASSWORD=secret
   ```

2. **No Spaces**: No spaces around the equals sign
   ```bash
   # Bad
   APRA_USERNAME = john.doe
   
   # Good
   APRA_USERNAME=john.doe
   ```

3. **No Trailing Spaces**: Avoid trailing whitespace
   ```bash
   # Bad
   APRA_USERNAME=john.doe   
   
   # Good
   APRA_USERNAME=john.doe
   ```

4. **Security**: Add `.env` to `.gitignore`
   ```bash
   echo ".env" >> .gitignore
   ```

---

## Configuration File

The configuration file (typically `config.json`) defines which returns to analyze.

### Basic Structure

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Display Name",
      "code": "FORM_CODE",
      "expectedDate": "2025-06-16",
      "confirmed": true
    }
  ],
  "excluded": []
}
```

### Fields

#### baseDate (Required)
- **Type**: String (ISO date format)
- **Description**: Reference date for the most recent return period
- **Format**: `YYYY-MM-DD`
- **Example**: `"2025-06-30"`
- **Notes**: Must be a valid ISO date

#### returns (Required)
- **Type**: Array of return objects
- **Description**: List of regulatory returns to analyze
- **Minimum**: 1 return
- **Maximum**: No limit (performance considerations apply)

##### Return Object Fields

###### name (Required)
- **Type**: String
- **Description**: Human-readable display name for the return
- **Example**: `"Balance Sheet"`
- **Usage**: Used in reports and dashboard

###### code (Required)
- **Type**: String
- **Description**: AgileReporter form code
- **Format**: Usually starts with `ARF`
- **Example**: `"ARF1100"`
- **Case Sensitive**: Yes

###### expectedDate (Optional)
- **Type**: String (ISO date format)
- **Description**: Expected comparison date for this return
- **Format**: `YYYY-MM-DD`
- **Example**: `"2025-06-16"`
- **Behavior**:
  - If provided: Looks for exact match on this date
  - If not provided: Uses most recent date before `baseDate`
  - If exact match not found: Uses closest date before `expectedDate`

###### confirmed (Optional)
- **Type**: Boolean
- **Description**: Whether this is a confirmed/final submission
- **Default**: `false`
- **Example**: `true`
- **Impact**: Affects Excel tab coloring:
  - Confirmed + differences = RED tab
  - Not confirmed + differences = YELLOW tab
  - No differences = GREEN tab

#### excluded (Optional)
- **Type**: Array of return objects (same structure as `returns`)
- **Description**: Returns to skip during analysis
- **Default**: Empty array `[]`
- **Usage**: Document returns that are not being analyzed
- **Example**:
  ```json
  "excluded": [
    {
      "name": "Old Form",
      "code": "ARF9999",
      "reason": "Deprecated"
    }
  ]
  ```

### Complete Example

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Assets and Liabilities",
      "code": "ARF1100",
      "expectedDate": "2025-06-16",
      "confirmed": true
    },
    {
      "name": "Off-Balance Sheet Business",
      "code": "ARF1180",
      "expectedDate": "2025-06-16",
      "confirmed": true
    },
    {
      "name": "Statement of Financial Performance",
      "code": "ARF2200",
      "expectedDate": "2025-06-15",
      "confirmed": false
    },
    {
      "name": "Capital Adequacy",
      "code": "ARF3300L",
      "confirmed": true
    }
  ],
  "excluded": [
    {
      "name": "Legacy Report",
      "code": "ARF9999",
      "reason": "No longer required"
    }
  ]
}
```

### Multiple Configuration Files

Create different configs for different scenarios:

```bash
# Quarterly analysis
config_q2_2025.json

# Monthly analysis
config_jun_2025.json

# Specific forms only
config_capital.json

# Testing
config_test.json
```

Run with specific config:
```bash
npm run start config_q2_2025.json --output q2_2025_report.xlsx
```

---

## Advanced Configuration

### Code-Level Configuration

Some configuration requires modifying source code.

#### Timeout Values

**File**: `src/api-client.ts`

```typescript
this.axiosInstance = axios.create({
  timeout: 1200000, // 20 minutes in milliseconds
});
```

**Increase for slow networks**:
```typescript
timeout: 3600000, // 60 minutes
```

#### Concurrency Limit

**File**: `src/variance-analyzer.ts`

```typescript
const limit = pLimit(3); // Process 3 returns concurrently
```

**Adjust based on system resources**:
```typescript
const limit = pLimit(5); // More aggressive
const limit = pLimit(1); // Sequential processing
```

#### Retry Logic

**File**: `src/api-client.ts`

```typescript
async getFormAnalysis(
  formCode: string,
  instance1: FormInstance,
  instance2: FormInstance,
  maxRetries: number = 3 // Increase retry attempts
): Promise<Record<string, any>[]>
```

#### Excel Formatting

**File**: `src/config.ts`

```typescript
static readonly COLOR_YELLOW = 'FFFFFF00'; // Yellow
static readonly COLOR_GREEN = 'FF00B050';  // Green
static readonly COLOR_RED = 'FFFF0000';    // Red
```

**Customize colors**:
```typescript
static readonly COLOR_YELLOW = 'FFFFA500'; // Orange
static readonly COLOR_GREEN = 'FF90EE90';  // Light green
```

#### Database Path

**File**: `src/db-manager.ts`

```typescript
constructor(dbPath?: string) {
  this.dbPath = dbPath || join(process.cwd(), 'reports', 'reports.db');
}
```

**Use custom path**:
```typescript
const dbManager = new DatabaseManager('/custom/path/reports.db');
```

#### Dashboard Port

**Default**: 3000

**Change via CLI**:
```bash
npm run dashboard -- --port 8080
```

**Change in code** (`src/dashboard-cli.ts`):
```typescript
.option('-p, --port <number>', 'Server port', '8080') // Default to 8080
```

#### Logging Levels

**File**: `src/logger.ts`

```typescript
export function setupLogging(verbose: boolean = false): winston.Logger {
  const fileLevel = verbose ? 'debug' : 'info';
  const consoleLevel = verbose ? 'debug' : 'info';
```

**Change default levels**:
```typescript
const fileLevel = 'debug'; // Always debug
const consoleLevel = 'warn'; // Only warnings in console
```

#### Log Rotation

**File**: `src/logger.ts`

```typescript
new DailyRotateFile({
  filename: join(logsDir, 'app-%DATE%.log'),
  datePattern: 'YYYY-MM-DD',
  maxSize: '200m',    // Max file size
  maxFiles: '5d',     // Keep 5 days
}),
```

**Adjust retention**:
```typescript
maxSize: '500m',     // Larger files
maxFiles: '30d',     // Keep 30 days
```

### Performance Tuning

#### For Large Reports (20+ forms)

```typescript
// variance-analyzer.ts
const limit = pLimit(5); // Increase concurrency

// api-client.ts
timeout: 3600000, // 60 minute timeout

// excel-exporter.ts
// Consider streaming for very large datasets
```

#### For Slow Networks

```typescript
// api-client.ts
timeout: 7200000, // 120 minute timeout
maxRetries: 5,    // More retries

// variance-analyzer.ts
const limit = pLimit(2); // Reduce concurrency
```

#### For Limited Memory

```typescript
// variance-analyzer.ts
const limit = pLimit(1); // Sequential processing

// Run with increased Node memory:
// NODE_OPTIONS="--max-old-space-size=8192" npm run start config.json
```

---

## Best Practices

### Security

1. **Never commit .env**:
   ```bash
   echo ".env" >> .gitignore
   git rm --cached .env  # If already committed
   ```

2. **Use separate credentials per environment**:
   ```bash
   .env.development
   .env.staging
   .env.production
   ```

3. **Rotate credentials regularly**

4. **Use environment-specific domains**:
   ```bash
   # UAT
   AUTH_URL=https://company-uat.agilereporter.com/...
   
   # Production
   AUTH_URL=https://company.agilereporter.com/...
   ```

### Organization

1. **Naming conventions**:
   ```bash
   config_YYYY-MM-DD_purpose.json
   config_2025-06-30_quarterly.json
   ```

2. **Documentation**:
   ```json
   {
     "_comment": "Q2 2025 Analysis - Run Date: 2025-07-15",
     "baseDate": "2025-06-30",
     "returns": [...]
   }
   ```

3. **Version control configs** (but not .env):
   ```bash
   git add config*.json
   git commit -m "Add Q2 2025 config"
   ```

### Testing

1. **Test configuration**:
   ```bash
   node -e "console.log(JSON.parse(require('fs').readFileSync('config.json')))"
   ```

2. **Validate dates**:
   ```bash
   node -e "new Date('2025-06-30')"  # Should not return Invalid Date
   ```

3. **Test with subset first**:
   ```json
   {
     "baseDate": "2025-06-30",
     "returns": [
       { "name": "Test Form", "code": "ARF1100" }
     ]
   }
   ```

4. **Dry run** (check credentials):
   ```bash
   npm run debug-auth
   ```

### Maintenance

1. **Regular backups**:
   ```bash
   cp config.json config_backup_$(date +%Y%m%d).json
   ```

2. **Document changes**:
   ```json
   {
     "_changelog": [
       "2025-07-15: Added ARF2210",
       "2025-06-30: Updated base date"
     ]
   }
   ```

3. **Clean up old reports**:
   ```bash
   find reports -name "*.xlsx" -mtime +90 -delete
   ```

---

## Examples

### Quarterly Analysis

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Assets and Liabilities",
      "code": "ARF1100",
      "expectedDate": "2025-06-16",
      "confirmed": true
    },
    {
      "name": "Off-Balance Sheet",
      "code": "ARF1180",
      "expectedDate": "2025-06-16",
      "confirmed": true
    },
    {
      "name": "Profit and Loss",
      "code": "ARF2200",
      "expectedDate": "2025-06-15",
      "confirmed": true
    }
  ]
}
```

### Monthly Analysis

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Monthly Assets",
      "code": "ARF1120",
      "expectedDate": "2025-06-16"
    },
    {
      "name": "Monthly Liquidity",
      "code": "ARF2230",
      "expectedDate": "2025-06-15"
    }
  ]
}
```

### Single Form Test

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Test Form",
      "code": "ARF1100",
      "confirmed": false
    }
  ]
}
```

### Multiple Periods

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Quarterly - Q2",
      "code": "ARF1100",
      "expectedDate": "2025-06-16",
      "confirmed": true
    }
  ]
}
```

```json
{
  "baseDate": "2025-03-31",
  "returns": [
    {
      "name": "Quarterly - Q1",
      "code": "ARF1100",
      "expectedDate": "2025-03-16",
      "confirmed": true
    }
  ]
}
```

### Capital Focus

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Capital Adequacy - Level 1",
      "code": "ARF3300L",
      "confirmed": true
    },
    {
      "name": "Capital Adequacy - Level 2",
      "code": "ARF3301L",
      "confirmed": true
    },
    {
      "name": "Capital Adequacy - Level 3",
      "code": "ARF3302L",
      "confirmed": true
    }
  ]
}
```

---

## Validation

### Validate Configuration

```bash
# Check JSON syntax
node -e "console.log(JSON.stringify(JSON.parse(require('fs').readFileSync('config.json')), null, 2))"

# Check required fields
node -e "
const config = JSON.parse(require('fs').readFileSync('config.json'));
if (!config.baseDate) throw new Error('Missing baseDate');
if (!config.returns) throw new Error('Missing returns');
if (config.returns.length === 0) throw new Error('No returns defined');
config.returns.forEach((r, i) => {
  if (!r.name) throw new Error(\`Return \${i} missing name\`);
  if (!r.code) throw new Error(\`Return \${i} missing code\`);
});
console.log('Configuration valid!');
"
```

### Validate Environment

```bash
# Check .env exists
test -f .env && echo "✓ .env found" || echo "✗ .env missing"

# Check required variables
node -e "
require('dotenv').config();
const required = ['AUTH_URL', 'API_BASE_URL', 'APRA_USERNAME', 'PASSWORD', 'CLIENT_ID', 'CLIENT_SECRET'];
required.forEach(v => {
  if (!process.env[v]) throw new Error(\`Missing \${v}\`);
});
console.log('Environment valid!');
"
```

---

## Troubleshooting Configuration

### Common Issues

1. **JSON Parse Error**:
   - Check for trailing commas
   - Validate quotes (use double quotes)
   - Use JSON validator

2. **Authentication Failed**:
   - Verify .env credentials
   - Check for extra spaces
   - Ensure no quotes around values

3. **Form Not Found**:
   - Verify form code spelling
   - Check case sensitivity
   - Confirm form exists in AgileReporter

4. **Date Format Error**:
   - Use ISO format: YYYY-MM-DD
   - Check date is valid
   - Ensure quotes around dates

---

**For more help**: See [README.md](./README.md) or [TROUBLESHOOTING.md](./TROUBLESHOOTING.md)