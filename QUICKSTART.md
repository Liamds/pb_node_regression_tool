# Quick Start Guide

Get up and running with the AgileReporter Variance Analysis tool in 5 minutes.

## 1. Prerequisites

Check you have Node.js installed (v18 or higher):

```bash
node --version
# Should show v18.x.x or higher
```

If not installed, download from: https://nodejs.org/

## 2. Install Dependencies

```bash
npm install
```

This installs all required packages (~2-3 minutes).

## 3. Configure Environment

### Copy the template:
```bash
cp .env.example .env
```

### Edit `.env` with your credentials:
```bash
nano .env  # or use your favorite editor
```

**Required variables:**
```bash
AUTH_URL=https://policebank-uat.agilereporter.com/agilereporter/oauth/token
APRA_USERNAME=your_username_here
PASSWORD=your_password_here
GRANT_TYPE=password
CLIENT_ID=AgileREPORTER
CLIENT_SECRET=your_secret_here
API_BASE_URL=https://policebank-uat.agilereporter.com/agilereporter/rest/api
```

⚠️ **Important**: No quotes around values, no spaces!

## 4. Verify Setup

```bash
npm run check-env
```

Expected output: All ✓ checkmarks, no errors.

## 5. Test Authentication

```bash
npm run debug-auth
```

Expected output: At least one test shows "✓ PASSED" and you see a token.

## 6. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript (~30 seconds).

## 7. Create Config File

Create `config.json`:

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "1180",
      "code": "ARF1180",
      "expectedDate": "2025-06-16",
      "confirmed": true
    },
    {
      "name": "2200",
      "code": "ARF2200",
      "expectedDate": "2025-06-15"
    }
  ]
}
```

## 8. Run Analysis

```bash
npm start config.json
```

**First run will:**
1. Authenticate (5-10 seconds)
2. Fetch form data (varies by API)
3. Generate Excel file (10-30 seconds)

**Output:**
- Console logs showing progress
- Excel file: `variance_results.xlsx`
- Logs in `logs/` directory

## 9. Check Results

Open `variance_results.xlsx`:

- **Summary tab** (first): Overview of all forms
- **Form tabs**: Detailed variance data
- **Validation tabs**: Any errors found

### Tab Colors:
- 🟢 Green = No differences
- 🟡 Yellow = Differences found  
- 🔴 Red = Confirmed return with differences

## Common Commands

```bash
# Run with custom output filename
npm start config.json -o june_report.xlsx

# Run with detailed logging
npm start config.json --verbose

# Development mode (auto-recompile)
npm run dev config.json

# Check environment setup
npm run check-env

# Test authentication
npm run debug-auth

# Clean and rebuild
npm run clean && npm run build
```

## Troubleshooting

### ❌ Authentication fails
```bash
# Check credentials
npm run check-env

# Test different methods
npm run debug-auth
```

### ❌ Module not found
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### ❌ TypeScript errors
```bash
# Rebuild from scratch
npm run clean
npm run build
```

### ❌ Excel file not created
- Check disk space
- Check file permissions
- Look for errors in `logs/errors-YYYY-MM-DD.log`

## Directory Structure

```
├── src/              # Source code (TypeScript)
├── dist/             # Compiled code (JavaScript) - created by build
├── logs/             # Application logs - created at runtime
├── config.json       # Your analysis configuration
├── .env              # Your environment variables (DO NOT COMMIT)
├── package.json      # Dependencies and scripts
└── *.xlsx            # Generated Excel files
```

## Next Steps

- Read [README.md](README.md) for full documentation
- Read [MIGRATION_GUIDE.md](MIGRATION_GUIDE.md) if coming from Python
- Customize `config.json` for your needs
- Set up automated runs (cron job, scheduled task)

## Help

**Check logs:**
```bash
# Application log
tail -f logs/app-$(date +%Y-%m-%d).log

# Errors only
tail -f logs/errors-$(date +%Y-%m-%d).log
```

**Get help:**
```bash
npm start --help
```

---

That's it! You're ready to generate variance analysis reports. 🎉