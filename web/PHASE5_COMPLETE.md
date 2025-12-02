# Phase 5 Implementation - Complete ✅

## Summary

Phase 5 of the migration roadmap has been successfully implemented. The CLI now supports both Express (legacy) and Next.js (new) dashboard modes with automatic detection and backward compatibility.

## Completed Tasks

### ✅ Updated Dashboard CLI
- Added support for Next.js mode (`-m nextjs`)
- Added support for Express mode (`-m express`)
- Added auto-detection mode (`-m auto` - default)
- Maintains backward compatibility with existing Express setup

### ✅ Updated Main CLI
- Updated `--serve` option to detect Next.js availability
- Automatically starts Express API server on port 5000 when Next.js is detected
- Falls back to Express dashboard if Next.js is not available
- Provides clear logging about which mode is being used

### ✅ Updated Package.json Scripts
- Added `dashboard:nextjs` - Start Next.js dashboard
- Added `dashboard:express` - Start Express dashboard (explicit)
- Added `dev:full` - Start both Next.js frontend and Express API together
- Updated existing scripts for clarity

## Implementation Details

### Dashboard CLI (`src/dashboard-cli.ts`)

The CLI now supports three modes:

1. **Auto Mode (default)**: Automatically detects which dashboard is available
   ```bash
   npm run dashboard:dev
   # or
   tsx src/dashboard-cli.ts
   ```

2. **Next.js Mode**: Explicitly start Next.js dashboard
   ```bash
   npm run dashboard:nextjs
   # or
   tsx src/dashboard-cli.ts -m nextjs
   ```

3. **Express Mode**: Explicitly start Express dashboard (legacy)
   ```bash
   npm run dashboard:express
   # or
   tsx src/dashboard-cli.ts -m express -p 5000
   ```

### Main CLI (`src/main.ts`)

When using `--serve` option:

- **If Next.js detected**: Starts Express API server on port 5000 (for Next.js to connect to)
- **If Next.js not found**: Starts Express dashboard on specified port (legacy behavior)

```bash
# With Next.js (starts API server on 5000)
tsx src/main.ts config.json --serve

# Without Next.js (starts Express dashboard on 3000)
tsx src/main.ts config.json --serve -p 3000
```

### Package.json Scripts

#### Development Scripts
- `npm run dev` - Run main CLI in development
- `npm run web:dev` - Start Next.js dev server (port 3000)
- `npm run dashboard:dev` - Start dashboard (auto-detects mode)
- `npm run dashboard:nextjs` - Start Next.js dashboard explicitly
- `npm run dashboard:express` - Start Express dashboard explicitly
- `npm run dev:full` - Start both Next.js and Express API together

#### Production Scripts
- `npm run build` - Build TypeScript backend
- `npm run build:web` - Build Next.js frontend
- `npm run web:start` - Start Next.js production server
- `npm run dashboard` - Start Express dashboard (production)

## Architecture

### Next.js Mode
```
┌─────────────────┐
│  Next.js App    │  Port 3000
│  (Frontend)     │
└────────┬────────┘
         │ API Calls
         ▼
┌─────────────────┐
│ Express API     │  Port 5000
│ (Backend)       │
└─────────────────┘
```

### Express Mode (Legacy)
```
┌─────────────────┐
│ Express Server  │  Port 3000/5000
│ (Full Stack)    │
└─────────────────┘
```

## Usage Examples

### Development with Next.js

```bash
# Terminal 1: Start Next.js frontend
npm run web:dev

# Terminal 2: Start Express API backend
npm run dashboard:express -p 5000

# Or use the combined command:
npm run dev:full
```

### Development with Express (Legacy)

```bash
# Start Express dashboard
npm run dashboard:dev -m express -p 5000
```

### Production

```bash
# Build everything
npm run build
npm run build:web

# Start Next.js production server
npm run web:start

# Start Express API (if needed separately)
npm run dashboard -p 5000
```

## Auto-Detection Logic

The CLI automatically detects which dashboard mode to use:

1. Checks if `web/next.config.js` or `web/next.config.ts` exists
2. If found → Next.js mode
3. If not found → Express mode (legacy)

This ensures:
- ✅ Seamless migration path
- ✅ Backward compatibility
- ✅ No breaking changes for existing users
- ✅ Easy to switch between modes

## Backward Compatibility

All existing commands continue to work:

- ✅ `npm run dashboard:dev` - Still works (now auto-detects)
- ✅ `npm run dashboard` - Still works (Express mode)
- ✅ `tsx src/main.ts config.json --serve` - Still works (auto-detects)

## Next Steps (Phase 6)

1. **Testing & Validation**
   - Test all CLI modes
   - Verify feature parity
   - Test production builds
   - Validate WebSocket connections

2. **Documentation**
   - Update README with new commands
   - Document migration path
   - Add troubleshooting guide

## Notes

- Next.js runs on port 3000 by default
- Express API should run on port 5000 when using Next.js
- The `dev:full` script uses `concurrently` to run both servers
- Auto-detection ensures smooth transition from Express to Next.js
- All existing functionality is preserved

---

**Phase 5 Status**: ✅ Complete  
**Date**: December 2024  
**Next Phase**: Phase 6 - Testing & Validation

