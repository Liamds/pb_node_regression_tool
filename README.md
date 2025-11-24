# AgileReporter Variance Analysis Tool

A Node.js/TypeScript application for generating variance analysis reports from the AgileReporter API. This tool compares form instances across different time periods and exports the results to formatted Excel files with validation errors.

## Features

- 🔐 **Secure Authentication** - OAuth2 password grant flow
- 📊 **Variance Analysis** - Compare form instances across time periods
- ✅ **Validation Checks** - Identify and report validation errors
- 📈 **Excel Export** - Formatted Excel files with:
  - Color-coded tabs (Green/Yellow/Red)
  - Auto-filtering on difference columns
  - Summary sheet with overview
  - Separate validation error sheets
- 🪵 **Comprehensive Logging** - Rotating file logs with console output
- 🔄 **Retry Logic** - Automatic retry for network failures

## Prerequisites

- **Node.js** >= 18.0.0
- **npm** or **pnpm** package manager

## Installation

1. **Clone the repository**:
   ```bash
   git clone <repository-url>
   cd agilereporter-variance-analysis
   ```

2. **Install dependencies**:
   ```bash
   npm install
   # or
   pnpm install
   ```

3. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

4. **Edit `.env` file** with your credentials:
   ```bash
   AUTH_URL=https://policebank-uat.agilereporter.com/agilereporter/oauth/token
   APRA_USERNAME=your_username
   PASSWORD=your_password
   GRANT_TYPE=password
   CLIENT_ID=AgileREPORTER
   CLIENT_SECRET=your_client_secret
   API_BASE_URL=https://policebank-uat.agilereporter.com/agilereporter/rest/api
   ```

   **Important**: Do NOT quote values, and ensure no trailing spaces.

## Configuration

Create a `config.json` file with the returns to analyze:

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

**Fields**:
- `baseDate`: The reference date for analysis
- `returns`: Array of return configurations
  - `code`: AgileReporter form code
  - `name`: Display name
  - `expectedDate`: Expected submission date (optional)
  - `confirmed`: Whether the return is confirmed/finalized (affects color coding)

## Usage

### Build the Project

```bash
npm run build
```

### Run Variance Analysis

```bash
npm start config.json
# or with custom output file
npm start config.json -o my_report.xlsx
# or verbose logging
npm start config.json --verbose
```

### Development Mode (with hot reload)

```bash
npm run dev config.json
```

### Check Environment Configuration

```bash
npm run check-env
```

This validates your `.env` file and configuration loading.

### Debug Authentication

```bash
npm run debug-auth
```

Tests different authentication methods to troubleshoot connection issues.

## Command Line Options

```bash
variance-analysis <config> [options]

Arguments:
  config                Path to JSON configuration file

Options:
  -o, --output <file>   Output Excel file path (default: "variance_results.xlsx")
  -v, --verbose         Enable verbose logging (DEBUG level)
  -h, --help            Display help information
  -V, --version         Display version number
```

## Quick Reference
| What you want | Command |
|---------------|---------|
| Dev mode, default output | ```npm run dev -- config.json``` |
| Dev mode, custom output output | ```npm run dev -- config.json -o example.xlsx``` |
| Dev mode, verbose | ```npm run dev -- config.json -v``` |
| Dev mode, both | ```npm run dev -- config.json -o example.xlsx -v``` |
| Productio mode | ```npm start -- config.json -o example.xlsx``` |
| Direct ececution | ```npx tsx rc/main.ts config -o example.xlsx -v``` |

## Output

### Excel File Structure

The tool generates an Excel file with:

1. **Summary Sheet** (first tab)
   - Overview of all forms
   - Variance counts
   - Validation error counts
   - Color-coded rows (red = issues, green = no issues)

2. **Form Variance Sheets**
   - One sheet per form
   - Columns: Cell Reference, Cell Description, dates, Difference, % Difference
   - Auto-filtered to show only non-zero differences
   - Subtotals excluded from filter

3. **Validation Error Sheets** (if errors exist)
   - Form_ValidationErrors sheets
   - Details of failed validations
   - Referenced cells and values

### Tab Color Coding

- 🔴 **RED**: Confirmed return with differences (requires attention)
- 🟡 **YELLOW**: Differences found
- 🟢 **GREEN**: No differences

## Logging

Logs are written to:
- **Console**: INFO level (DEBUG with `--verbose`)
- **logs/app-YYYY-MM-DD.log**: All logs (rotating daily, 5 day retention)
- **logs/errors-YYYY-MM-DD.log**: ERROR level only

Log files rotate automatically with a 200MB size limit.

## Project Structure

```
├── src/
│   ├── api-client.ts          # AgileReporter API client
│   ├── config.ts              # Configuration management
│   ├── data-processor.ts      # Data processing utilities
│   ├── excel-exporter.ts      # Excel file generation
│   ├── logger.ts              # Logging setup
│   ├── main.ts                # Application entry point
│   ├── models.ts              # TypeScript interfaces
│   ├── variance-analyzer.ts   # Analysis logic
│   ├── check-env.ts           # Environment checker
│   └── debug-auth.ts          # Authentication debugger
├── logs/                      # Log files (auto-created)
├── config.json                # Analysis configuration
├── .env                       # Environment variables (create from .env.example)
├── .env.example               # Environment template
├── package.json               # Dependencies
├── tsconfig.json              # TypeScript configuration
└── README.md                  # This file
```

## Architecture

### Key Components

1. **AgileReporterClient** (`api-client.ts`)
   - Handles all API communication
   - OAuth2 authentication
   - Form versions, variance data, validation results
   - Retry logic for network failures

2. **VarianceAnalyzer** (`variance-analyzer.ts`)
   - Orchestrates the analysis process
   - Finds comparison instances
   - Collects variance and validation data

3. **ExcelExporter** (`excel-exporter.ts`)
   - Generates formatted Excel files
   - Applies color coding and filtering
   - Creates summary and detail sheets

4. **DataProcessor** (`data-processor.ts`)
   - Utility functions for data manipulation
   - Date comparisons
   - Sheet name sanitization
   - Difference detection

### Technology Stack

- **TypeScript**: Type-safe JavaScript
- **axios**: HTTP client (replaced Python's http.client)
- **exceljs**: Excel file generation (replaced openpyxl)
- **winston**: Logging framework (replaced Python's logging)
- **date-fns**: Date manipulation
- **commander**: CLI argument parsing
- **dotenv**: Environment variable management

## Conversion Notes

### Python → Node.js Mappings

| Python | Node.js | Reason |
|--------|---------|--------|
| `http.client` | `axios` | Modern Promise-based HTTP client |
| `openpyxl` | `exceljs` | Active Excel library with streaming support |
| `logging` | `winston` | Industry-standard Node.js logging |
| `dataclasses` | TypeScript interfaces | Native type safety |
| `urllib.parse` | `URLSearchParams` | Built-in URL encoding |

### Key Differences

1. **Async/Await**: All I/O operations use Promises instead of blocking calls
2. **Type Safety**: TypeScript provides compile-time type checking
3. **Module System**: ES modules (`import`/`export`) instead of Python imports
4. **Error Handling**: Try/catch with Promise rejection handling
5. **Configuration**: Environment variables managed via dotenv

## Troubleshooting

### Authentication Fails

1. Run `npm run check-env` to verify environment variables
2. Run `npm run debug-auth` to test different auth methods
3. Check credentials in `.env` file
4. Ensure no trailing spaces or quotes in `.env` values

### Excel Export Fails

- Check disk space
- Verify write permissions in output directory
- Check for invalid sheet names

### Network Timeouts

- Long-running API calls have 20-minute timeouts
- Retry logic automatically retries 3 times
- Check network connectivity and firewall settings

### Module Not Found Errors

- Ensure you've run `npm install`
- Try deleting `node_modules` and reinstalling
- Verify Node.js version >= 18.0.0

## Development

### Linting

```bash
npm run lint
```

### Clean Build Artifacts

```bash
npm run clean
```

### Adding New Returns

Edit `config.json` and add to the `returns` array:

```json
{
  "name": "NewForm",
  "code": "ARFNewForm",
  "expectedDate": "2025-06-30",
  "confirmed": false
}
```

## License

MIT

## Support

For issues or questions:
1. Check logs in `logs/` directory
2. Run diagnostic scripts (`check-env`, `debug-auth`)
3. Review this README
4. Contact your system administrator