# Next.js Dashboard Setup Guide

## Phase 2 Implementation

This directory contains the Next.js application for the variance analysis dashboard, set up as part of Phase 2 of the migration roadmap.

## Getting Started

### Prerequisites

- Node.js 18+ 
- npm or yarn

### Installation

1. Navigate to the web directory:
```bash
cd web
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env.local
```

4. Update `.env.local` with your API URL:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

### Development

Run the development server:
```bash
npm run dev
```

Or from the root directory:
```bash
npm run web:dev
```

The app will be available at `http://localhost:3000`

### Building for Production

```bash
npm run build
npm start
```

## Directory Structure

```
web/
├── app/                    # Next.js App Router
│   ├── (dashboard)/       # Dashboard route group
│   ├── layout.tsx          # Root layout
│   ├── page.tsx           # Home page
│   ├── providers.tsx      # React Query & Theme providers
│   └── globals.css        # Global styles
├── components/            # React components
│   └── ui/               # shadcn/ui components
├── hooks/                # Custom React hooks
├── lib/                  # Utilities and configurations
├── types/                # TypeScript type definitions
└── public/               # Static assets
```

## Current Status

✅ Phase 2 Complete:
- Next.js App Router setup
- TypeScript configuration
- Path aliases configured
- Tailwind CSS configured
- TanStack Query setup
- Theme provider (next-themes)
- Basic UI components (Button, Card)
- API client structure
- Custom hooks for data fetching

## Next Steps (Phase 3)

- [ ] Set up oRPC for type-safe API calls
- [ ] Migrate statistics cards
- [ ] Migrate reports table
- [ ] Migrate charts (Chart.js → Recharts)
- [ ] Migrate modals
- [ ] Implement full dark mode
- [ ] Add loading states
- [ ] Add error boundaries

## Notes

- The API client (`lib/api-client.ts`) is a temporary implementation using fetch. It will be replaced with oRPC in Phase 3.
- UI components are basic implementations. Full shadcn/ui setup will be completed in Phase 3.
- The dashboard runs alongside the Express server during migration.

