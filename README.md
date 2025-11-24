# AgileReporter Variance Analysis Tool

A comprehensive TypeScript-based tool for analyzing variances in regulatory returns from AgileReporter API, with an interactive web dashboard for monitoring and managing analysis reports.

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Dashboard](#dashboard)
- [API Reference](#api-reference)
- [Development](#development)
- [Troubleshooting](#troubleshooting)
- [License](#license)

## 🎯 Overview

This tool automates the process of comparing regulatory returns between different time periods, identifying variances, and generating comprehensive Excel reports. It's specifically designed for financial institutions submitting returns through AgileReporter.

### Key Capabilities

- **Automated Variance Detection**: Compare returns across time periods to identify differences
- **Validation Error Reporting**: Capture and report validation failures
- **Excel Report Generation**: Create formatted, color-coded Excel workbooks with filters and tables
- **Interactive Dashboard**: Monitor analysis progress, view reports, and annotate variances
- **Persistent Storage**: SQLite database for historical analysis tracking
- **Concurrent Processing**: Analyze multiple returns in parallel for faster completion

## ✨ Features

### Analysis Engine

- **Multi-Return Processing**: Analyze multiple regulatory returns in a single run
- **Intelligent Instance Matching**: Automatically find and compare the correct time periods
- **Variance Calculation**: Compute absolute and percentage differences
- **Validation Integration**: Execute validation rules and capture errors
- **Progress Tracking**: Real-time progress updates with multi-bar visualization

### Excel Reports

- **Color-Coded Tabs**:
  - 🔴 **Red**: Confirmed returns with differences (requires attention)
  - 🟡 **Yellow**: Non-confirmed returns with differences
  - 🟢 **Green**: No differences found
- **Formatted Tables**: Auto-formatted Excel tables with filters
- **Summary Sheet**: Overview of all forms with variance and error counts
- **Validation Error Sheets**: Detailed breakdown of validation failures
- **Custom Metadata**: Document properties for categorization

### Web Dashboard

- **Real-Time Monitoring**: Live progress updates via WebSocket
- **Report History**: View all historical analysis reports
- **Interactive Charts**: Trend analysis of variances and errors over time
- **Variance Annotations**: Flag, categorize, and comment on specific variances
- **CSV Export**: Export individual form variances to CSV
- **Advanced Filtering**: Filter reports by status, base date, or form code
- **Dark Mode**: Toggle between light and dark themes

### Data Management

- **SQLite Database**: Efficient storage of report metadata and details
- **Variance Annotations**: Persistent storage of flags, categories, and comments
- **Automatic Cleanup**: Optional retention policy for old reports
- **Report Caching**: Quick access to historical data

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Web Dashboard (Port 3000)                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │  Statistics  │  │   Reports    │  │    Charts    │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │ WebSocket + REST API
┌────────────────▼────────────────────────────────────────────┐
│                    Express Server                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │     API      │  │  WebSocket   │  │   Static     │      │
│  │   Endpoints  │  │   Handler    │  │    Files     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│                  Analysis Engine                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Variance   │  │  Validation  │  │    Excel     │      │
│  │   Analyzer   │  │   Handler    │  │   Exporter   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│                 AgileReporter API Client                     │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    OAuth     │  │   Returns    │  │  Validation  │      │
│  │     Auth     │  │   Fetcher    │  │   Executor   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└────────────────┬────────────────────────────────────────────┘
                 │
┌────────────────▼────────────────────────────────────────────┐
│                SQLite Database (reports.db)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │   Reports    │  │   Variances  │  │ Annotations  │      │
│  │   Metadata   │  │    Details   │  │    (Flags)   │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
└─────────────────────────────────────────────────────────────┘
```

## 📦 Prerequisites

- **Node.js**: >= 18.0.0
- **npm**: >= 9.0.0
- **AgileReporter Account**: Valid credentials with API access
- **Network Access**: HTTPS access to AgileReporter API

## 🚀 Installation

### 1. Clone the Repository

```bash
git clone <repository-url>
cd agilereporter-variance-analysis
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Create Directory Structure

```bash
npm run setup
```

This creates:
- `src/dashboard/public/` - Dashboard static files
- `reports/` - Output directory for Excel files and database

### 4. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript and copies static assets to `dist/`.

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the root directory:

```bash
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
```

### Configuration File

Create a `config.json` file to define your analysis:

```json
{
  "baseDate": "2025-06-30",
  "returns": [
    {
      "name": "Balance Sheet",
      "code": "ARF1100",
      "expectedDate": "2025-06-16",
      "confirmed": true
    },
    {
      "name": "Income Statement",
      "code": "ARF2200",
      "expectedDate": "2025-06-15",
      "confirmed": false
    }
  ],
  "excluded": []
}
```

**Configuration Fields**:

- `baseDate`: The reference date for the most recent return
- `returns`: Array of return configurations
  - `name`: Display name for the return
  - `code`: AgileReporter form code
  - `expectedDate`: (Optional) Expected comparison date
  - `confirmed`: Whether this is a confirmed submission
- `excluded`: Array of returns to skip (same structure as `returns`)

## 💻 Usage

### Command Line Interface

#### Run Complete Analysis

```bash
# Using built version
npm run start config.json

# With custom output file
npm run start config.json --output my_report.xlsx

# With verbose logging
npm run start config.json --verbose

# Run with dashboard
npm run start config.json --serve --port 3000
```

#### Development Mode

```bash
# Run with hot reload
npm run dev config.json --verbose
```

#### Dashboard Only

```bash
# Start standalone dashboard
npm run dashboard

# Custom port
npm run dashboard -- --port 8080
```

### Command Line Options

```
Usage: variance-analysis [options] <config>

Arguments:
  config                  Path to JSON configuration file

Options:
  -o, --output <file>     Output Excel file path (default: "variance_results.xlsx")
  -v, --verbose           Enable verbose logging (DEBUG level)
  --no-progress           Disable progress bar
  -s, --serve             Start dashboard server after analysis
  -p, --port <number>     Dashboard server port (default: "3000")
  -h, --help              Display help information
```

### Analysis Workflow

1. **Authentication**: Authenticates with AgileReporter API using OAuth
2. **Form Version Retrieval**: Fetches all available versions for each return
3. **Instance Matching**: Identifies base and comparison instances
4. **Variance Analysis**: Compares cell values between instances
5. **Validation Execution**: Runs validation rules on base instance
6. **Excel Generation**: Creates formatted workbook with results
7. **Database Storage**: Saves metadata and details for dashboard

## 🖥️ Dashboard

### Accessing the Dashboard

1. **Start the Dashboard**:
   ```bash
   npm run dashboard
   ```

2. **Open in Browser**:
   Navigate to `http://localhost:3000`

### Dashboard Features

#### Statistics Overview
- Total reports generated
- Completed analyses
- Total variances detected
- Total validation errors

#### Trend Analysis
- **Variance Trend Chart**: Track variances over time
- **Error Trend Chart**: Monitor validation errors
- **Top Forms Chart**: Identify forms with most variances

#### Report Management
- **Search & Filter**: Find reports by date, status, or form
- **View Details**: Interactive modal with full report data
- **Download Excel**: Get original Excel workbook
- **Export CSV**: Export individual form data
- **Delete Reports**: Clean up old reports

#### Live Analysis Monitoring
- **Progress Tracking**: Real-time progress with step indicators
- **Console Output**: Live log streaming
- **Stop Analysis**: Cancel running analyses

#### Variance Annotations
- **Flag Variances**: Mark important differences
- **Categorize**: Label variances (Expected, Unexpected, Resolved, Investigating)
- **Add Comments**: Document explanations and follow-ups

### Running Analysis from Dashboard

1. Click "▶️ Run Analysis" button
2. Enter configuration file path (e.g., `config.json`)
3. Optionally specify output filename
4. Click "Start Analysis"
5. Monitor progress in real-time
6. View completed report when finished

## 📚 API Reference

See [API_REFERENCE.md](./API_REFERENCE.md) for complete API documentation.

### Quick Reference

#### Get All Reports
```http
GET /api/reports?status=completed&baseDate=2025-06-30
```

#### Get Report Details
```http
GET /api/reports/{reportId}/details
```

#### Update Variance Annotation
```http
POST /api/reports/{reportId}/annotations
Content-Type: application/json

{
  "formCode": "ARF1100",
  "cellReference": "Cell_A123",
  "flagged": true,
  "category": "investigating",
  "comment": "Checking with operations team"
}
```

#### Export Form to CSV
```http
GET /api/reports/{reportId}/export/{formCode}
```

## 🔧 Development

### Project Structure

```
.
├── src/
│   ├── main.ts                 # CLI entry point
│   ├── config.ts               # Configuration management
│   ├── api-client.ts           # AgileReporter API client
│   ├── variance-analyzer.ts    # Core analysis engine
│   ├── excel-exporter.ts       # Excel report generator
│   ├── data-processor.ts       # Data processing utilities
│   ├── db-manager.ts           # SQLite database manager
│   ├── report-saver.ts         # Report persistence
│   ├── logger.ts               # Winston logging
│   ├── progress-bar.ts         # CLI progress bars
│   ├── models.ts               # TypeScript interfaces
│   ├── dashboard/
│   │   ├── server.ts           # Express server
│   │   └── public/
│   │       ├── index.html      # Dashboard UI
│   │       ├── app.js          # Dashboard logic
│   │       └── styles.css      # Dashboard styles
│   └── types/
│       └── sqljs.d.ts          # Type definitions
├── config.json                 # Analysis configuration
├── .env                        # Environment variables
├── package.json                # Dependencies
├── tsconfig.json               # TypeScript config
└── README.md                   # This file
```

### Adding New Features

See [DEVELOPMENT.md](./DEVELOPMENT.md) for detailed development guidelines.

### Running Tests

```bash
# Run type checking
npm run build

# Run linting
npm run lint
```

### Debugging

Enable verbose logging for detailed output:

```bash
npm run start config.json --verbose
```

Check logs in `logs/` directory:
- `app-YYYY-MM-DD.log` - All logs
- `errors-YYYY-MM-DD.log` - Error logs only

## 🐛 Troubleshooting

### Common Issues

#### Authentication Failures

**Symptom**: "Authentication failed" error

**Solutions**:
1. Verify `.env` credentials are correct
2. Check network connectivity to AgileReporter
3. Ensure client ID and secret are valid
4. Try manual authentication test:
   ```bash
   npm run debug-auth
   ```

#### Database Locked Errors

**Symptom**: "database is locked" error

**Solutions**:
1. Close any programs accessing `reports/reports.db`
2. Stop the dashboard server
3. Delete `reports/reports.db` and restart (will lose history)

#### Excel File Not Found

**Symptom**: Cannot download Excel file from dashboard

**Solutions**:
1. Ensure the analysis completed successfully
2. Check `reports/` directory for the Excel file
3. Verify file permissions

#### Port Already in Use

**Symptom**: "EADDRINUSE: address already in use"

**Solutions**:
1. Stop other processes using port 3000
2. Use a different port: `npm run dashboard -- --port 8080`

#### WebSocket Connection Issues

**Symptom**: Dashboard not updating in real-time

**Solutions**:
1. Check browser console for errors
2. Ensure firewall allows WebSocket connections
3. Try refreshing the page
4. Check that the server is running

### Performance Optimization

For large reports with many forms:

1. **Increase Concurrency**: Modify `p-limit` in `variance-analyzer.ts`:
   ```typescript
   const limit = pLimit(5); // Increase from 3 to 5
   ```

2. **Adjust Timeout**: Modify timeout in `api-client.ts`:
   ```typescript
   timeout: 1800000, // 30 minutes instead of 20
   ```

3. **Reduce Logging**: Run without `--verbose` flag

### Getting Help

1. Check [TROUBLESHOOTING.md](./TROUBLESHOOTING.md) for more solutions
2. Review logs in `logs/` directory
3. Enable verbose mode for detailed diagnostics
4. Check AgileReporter API documentation

## 📄 License

MIT License - See LICENSE file for details

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## 📧 Support

For issues and questions:
- Create an issue in the repository
- Check existing documentation
- Review troubleshooting guide

## 🗺️ Roadmap

- [ ] Email notifications for completed reports
- [ ] Scheduled analysis runs
- [ ] Multi-user authentication
- [ ] Report comparison across periods
- [ ] Advanced variance filtering
- [ ] Custom report templates
- [ ] PDF report generation
- [ ] API rate limiting configuration

## 📝 Changelog

See [CHANGELOG.md](./CHANGELOG.md) for version history and release notes.

---

**Version**: 1.0.0  
**Last Updated**: November 2024  
**Maintainer**: [Your Name/Team]