# Migration Roadmap: Express → Next.js + TanStack + shadcn/ui + oRPC

## Overview

This document outlines the phased approach to migrate from the current Express-based dashboard to a modern Next.js application while maintaining all existing functionality including CLI support.

## Current Architecture

```
┌─────────────────────────────────────────┐
│  CLI (main.ts)                          │
│  - Commander for args                   │
│  - Direct execution                     │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Express Server (dashboard/server.ts)   │
│  - REST API endpoints                   │
│  - WebSocket for real-time              │
│  - Static file serving                  │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Vanilla JS Frontend                    │
│  - Direct DOM manipulation              │
│  - Fetch API                            │
│  - Chart.js                             │
└─────────────────────────────────────────┘
```

## Target Architecture

```
┌─────────────────────────────────────────┐
│  CLI (main.ts)                          │
│  - Unchanged                            │
│  - Can spawn Next.js server             │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  Next.js App Router                     │
│  - Server Components                    │
│  - API Routes (oRPC)                    │
│  - Server Actions                       │
└────────────┬────────────────────────────┘
             │
┌────────────▼────────────────────────────┐
│  React Client Components                │
│  - shadcn/ui components                 │
│  - TanStack Query (data fetching)       │
│  - oRPC client (type-safe API)          │
│  - Recharts (Chart.js replacement)      │
└─────────────────────────────────────────┘
```

## Phase 0: TypeScript Hardening (CURRENT PHASE)

**Goal**: Make codebase 100% type-safe and migration-ready

### Tasks

- [x] Create comprehensive type system (`src/types/index.ts`)
- [x] Add runtime validation with Zod (`src/validation/schemas.ts`)
- [x] Refactor all modules to use strict types
- [x] Add explicit return types to all functions
- [x] Remove all `any` types
- [x] Add JSDoc to all exported functions
- [x] Create dependency injection patterns

### Files to Refactor

1. **src/config.ts**
   - Use Zod for env validation
   - Export typed config objects
   - Remove string trimming in favor of schema coercion

2. **src/api-client.ts**
   - Add explicit return types
   - Validate API responses with Zod
   - Use Result type for error handling
   - Wrap axios with type-safe interface

3. **src/variance-analyzer.ts**
   - Add progress event typing
   - Use Result type for operations
   - Type-safe event emitter

4. **src/excel-exporter.ts**
   - Strict typing for Excel operations
   - Type-safe color constants
   - Explicit error handling

5. **src/db-manager.ts**
   - Type-safe database operations
   - Use branded types for IDs
   - Result type for queries

6. **src/main.ts**
   - Strict CLI typing
   - Type-safe process spawning
   - Explicit error boundaries

## Phase 1: API Layer Extraction

**Goal**: Create a clean API layer compatible with Next.js API routes

### Tasks

- [x] Create `src/api/` directory structure
- [x] Define oRPC-compatible API contracts
- [x] Extract business logic from Express routes
- [x] Create typed service layer
- [x] Implement repository pattern for database
- [x] Add API versioning

### Directory Structure

```
src/
├── api/
│   ├── routers/
│   │   ├── reports.router.ts      # oRPC router for reports
│   │   ├── analysis.router.ts     # oRPC router for analysis
│   │   ├── statistics.router.ts   # oRPC router for stats
│   │   └── index.ts               # Combine all routers
│   ├── procedures/
│   │   ├── getReports.ts          # Individual procedures
│   │   ├── getReportDetails.ts
│   │   ├── runAnalysis.ts
│   │   └── ...
│   └── context.ts                 # oRPC context (auth, db, etc.)
├── services/
│   ├── ReportService.ts           # Business logic
│   ├── AnalysisService.ts
│   └── StatisticsService.ts
├── repositories/
│   ├── ReportRepository.ts        # Data access
│   ├── VarianceRepository.ts
│   └── AnnotationRepository.ts
└── types/
    └── api.ts                     # API-specific types
```

### Example: oRPC Router

```typescript
// src/api/routers/reports.router.ts
import { router, publicProcedure } from '../trpc';
import { z } from 'zod';
import { ReportFiltersSchema } from '../../validation/schemas';

export const reportsRouter = router({
  list: publicProcedure
    .input(ReportFiltersSchema)
    .query(async ({ input, ctx }) => {
      return ctx.reportService.getReports(input);
    }),
    
  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      return ctx.reportService.getReportById(input.id);
    }),
    
  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      return ctx.reportService.deleteReport(input.id);
    }),
});
```

## Phase 2: Next.js Setup (Parallel Development)

**Goal**: Set up Next.js app alongside Express server

### Tasks

- [ ] Create `web/` directory for Next.js app
- [ ] Initialize Next.js with App Router
- [ ] Configure TypeScript
- [ ] Set up path aliases
- [ ] Configure environment variables
- [ ] Install dependencies (shadcn/ui, TanStack Query, oRPC)

### Directory Structure

```
project-root/
├── src/                          # Existing backend
│   ├── api/                      # New API layer
│   ├── services/
│   ├── repositories/
│   ├── dashboard/                # Old Express (deprecated)
│   └── ...
├── web/                          # New Next.js app
│   ├── app/
│   │   ├── (dashboard)/
│   │   │   ├── page.tsx          # Main dashboard
│   │   │   ├── reports/
│   │   │   │   └── [id]/
│   │   │   │       └── page.tsx  # Report details
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   └── trpc/
│   │   │       └── [trpc]/
│   │   │           └── route.ts  # oRPC endpoint
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                   # shadcn/ui components
│   │   ├── charts/               # Chart components
│   │   ├── reports/              # Report components
│   │   └── analysis/             # Analysis components
│   ├── lib/
│   │   ├── trpc/                 # oRPC client setup
│   │   └── utils.ts
│   ├── hooks/
│   │   ├── useReports.ts         # TanStack Query hooks
│   │   └── useAnalysis.ts
│   └── public/
└── package.json
```

### Next.js Configuration

```typescript
// web/next.config.js
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone', // For easier deployment
  experimental: {
    serverActions: true,
  },
  // Proxy API requests to backend during development
  async rewrites() {
    return [
      {
        source: '/api/legacy/:path*',
        destination: 'http://localhost:3001/api/:path*',
      },
    ];
  },
};

export default nextConfig;
```

## Phase 3: Component Migration

**Goal**: Migrate UI to React + shadcn/ui

### Tasks

- [ ] Set up shadcn/ui
- [ ] Create design system
- [ ] Migrate statistics cards
- [ ] Migrate reports table
- [ ] Migrate charts (Chart.js → Recharts)
- [ ] Migrate modals
- [ ] Implement dark mode with next-themes
- [ ] Add loading states
- [ ] Add error boundaries

### Component Examples

#### Statistics Card

```typescript
// web/components/statistics/StatCard.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: {
    value: number;
    isPositive: boolean;
  };
}

export function StatCard({ title, value, icon, trend }: StatCardProps): JSX.Element {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {trend && (
          <p className={`text-xs ${trend.isPositive ? 'text-green-600' : 'text-red-600'}`}>
            {trend.isPositive ? '+' : ''}{trend.value}% from last month
          </p>
        )}
      </CardContent>
    </Card>
  );
}
```

#### Reports Table with TanStack Query

```typescript
// web/components/reports/ReportsTable.tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc/client';
import { DataTable } from '@/components/ui/data-table';
import { columns } from './columns';
import type { ReportFilters } from '@/types';

interface ReportsTableProps {
  filters: ReportFilters;
}

export function ReportsTable({ filters }: ReportsTableProps): JSX.Element {
  const { data, isLoading, error } = trpc.reports.list.useQuery(filters);

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return <div>Error: {error.message}</div>;
  }

  return (
    <DataTable 
      columns={columns} 
      data={data?.reports ?? []} 
    />
  );
}
```

## Phase 4: Real-time Features

**Goal**: Migrate WebSocket functionality

### Options

1. **Server-Sent Events (SSE)** - Simplest, one-way
2. **Socket.io with Next.js** - More complex setup
3. **TanStack Query polling** - Simpler alternative
4. **Vercel's real-time features** - If deploying to Vercel

### Recommended Approach: Server Actions + Polling

```typescript
// web/app/analysis/actions.ts
'use server';

import { revalidatePath } from 'next/cache';
import { AnalysisService } from '@/src/services/AnalysisService';

export async function startAnalysis(formData: FormData): Promise<{ reportId: string }> {
  const configFile = formData.get('configFile') as string;
  const outputFile = formData.get('outputFile') as string | undefined;

  const service = new AnalysisService();
  const reportId = await service.runAnalysis({ configFile, outputFile });

  revalidatePath('/analysis');
  
  return { reportId };
}
```

```typescript
// web/hooks/useAnalysisProgress.ts
import { useQuery } from '@tanstack/react-query';
import { trpc } from '@/lib/trpc/client';

export function useAnalysisProgress(reportId: string | null) {
  return useQuery({
    queryKey: ['analysis-progress', reportId],
    queryFn: () => trpc.analysis.getProgress.query({ reportId: reportId! }),
    enabled: !!reportId,
    refetchInterval: 1000, // Poll every second
  });
}
```

## Phase 5: CLI Integration

**Goal**: Make CLI work with Next.js server

### Approach

The CLI should remain unchanged but can optionally start the Next.js dev server:

```typescript
// src/main.ts (updated)
async function main(): Promise<number> {
  // ... existing CLI logic

  if (options.serve) {
    // Start Next.js server instead of Express
    logger.info('Starting Next.js dashboard...');
    
    const nextServer = spawn('npm', ['run', 'dev:web'], {
      cwd: process.cwd(),
      stdio: 'inherit',
    });

    // Continue with analysis...
  }

  // ... rest of CLI logic
}
```

### Package.json Scripts

```json
{
  "scripts": {
    "dev": "tsx src/main.ts",
    "dev:web": "cd web && next dev -p 3000",
    "dev:full": "concurrently \"npm run dev:web\" \"npm run dev\"",
    "build": "tsc && npm run build:web",
    "build:web": "cd web && next build",
    "start": "node dist/main.js",
    "start:web": "cd web && next start -p 3000",
    "dashboard": "npm run start:web"
  }
}
```

## Phase 6: Testing & Validation

**Goal**: Ensure feature parity

### Test Checklist

- [ ] All API endpoints work identically
- [ ] Report listing and filtering
- [ ] Report details view
- [ ] Variance annotations (flags, categories, comments)
- [ ] CSV export functionality
- [ ] Excel download
- [ ] Chart rendering
- [ ] Dark mode toggle
- [ ] Real-time progress updates
- [ ] CLI analysis execution
- [ ] CLI + dashboard mode
- [ ] Error handling and display
- [ ] Loading states
- [ ] Responsive design

## Phase 7: Deployment

**Goal**: Deploy to production

### Options

1. **Vercel** - Easiest for Next.js
2. **Docker** - Full control
3. **VPS** - Traditional hosting

### Docker Approach (Recommended)

```dockerfile
# Dockerfile
FROM node:18-alpine AS base

# Dependencies
FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

# Builder
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Runner
FROM base AS runner
WORKDIR /app

ENV NODE_ENV production

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/web/.next ./web/.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./

EXPOSE 3000

CMD ["npm", "run", "start:web"]
```

## Phase 8: Cleanup

**Goal**: Remove old code

### Tasks

- [ ] Delete `src/dashboard/` directory
- [ ] Remove Express dependencies
- [ ] Remove Swagger setup (use tRPC panel instead)
- [ ] Update documentation
- [ ] Archive old code (git tag)

## Migration Benefits

### Type Safety
- End-to-end type safety with oRPC
- No more manual API typing
- Compile-time error detection

### Developer Experience
- Hot reload for both frontend and backend
- Better debugging with React DevTools
- Integrated API testing with tRPC panel

### Performance
- React Server Components for faster initial loads
- Automatic code splitting
- Built-in caching with TanStack Query

### Maintainability
- Cleaner component architecture
- Reusable UI components with shadcn/ui
- Better state management
- Easier testing

## Timeline Estimate

- **Phase 0**: 1-2 weeks (TypeScript hardening)
- **Phase 1**: 1-2 weeks (API extraction)
- **Phase 2**: 1 week (Next.js setup)
- **Phase 3**: 2-3 weeks (Component migration)
- **Phase 4**: 1 week (Real-time features)
- **Phase 5**: 1 week (CLI integration)
- **Phase 6**: 1 week (Testing)
- **Phase 7**: 1 week (Deployment)
- **Phase 8**: 1 week (Cleanup)

**Total**: 10-14 weeks

## Risk Mitigation

1. **Parallel Development**: Keep Express server running during migration
2. **Feature Flags**: Use environment variables to toggle between old/new UI
3. **Incremental Rollout**: Migrate one page at a time
4. **Rollback Plan**: Keep old code in separate branch
5. **User Testing**: Beta test with small group before full rollout

## Next Steps

1. Complete Phase 0 (TypeScript hardening)
2. Review and approve architecture
3. Begin Phase 1 (API extraction)
4. Set up CI/CD pipeline
5. Create testing strategy

---

**Document Version**: 1.0  
**Last Updated**: December 2024  
**Status**: Phase 0 - In Progress