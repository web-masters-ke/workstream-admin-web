# WorkStream Admin Web

Platform operations console for WorkStream system administrators — user / business / agent moderation, KYC review, dispute resolution, payment and payout monitoring, audit logs, and system configuration.

## Stack

- Next.js 14 (App Router) + TypeScript
- Tailwind CSS (custom CSS variable theme, `darkMode: 'class'`)
- Custom theme provider in `src/lib/theme.tsx` (localStorage key `ws-admin-theme`)
- axios with `{success, data, timestamp}` envelope unwrap helper
- Recharts for KPI charts

## Run

```bash
npm install
npm run dev          # http://localhost:3100
```

Other scripts:

```bash
npm run build        # production build
npm run typecheck    # tsc --noEmit
npm run lint
```

## Environment

Copy `.env.local.example` (or use the committed `.env.local`):

```
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

If the backend is unreachable, each page falls back to mock data in `src/lib/mock.ts` so the UI is fully walkable for development.

## Auth

- Login form posts to `/auth/login`, stores JWT in `localStorage` under `ws-admin-token`.
- axios attaches `Authorization: Bearer <token>` automatically.
- 401 responses redirect to `/login`, except for `/auth/*` endpoints — so a wrong-password attempt surfaces the error instead of silently redirecting.
- Dev bypass: type password `admin` on the login form to skip auth and browse the UI with mock data.

## Pages

| Route | Purpose |
|---|---|
| `/login` | JWT login |
| `/` | Overview (KPIs + revenue/GMV chart + risk signals) |
| `/users`, `/users/[id]` | User list + detail, suspend/activate |
| `/businesses`, `/businesses/[id]` | Approve / reject / suspend businesses |
| `/agents`, `/agents/[id]` | KYC review + agent moderation |
| `/tasks` | Cross-platform task audit |
| `/payments` | Transactions, payouts, fees |
| `/disputes` | Dispute queue with resolution notes |
| `/audit-logs` | Tamper-evident admin action log |
| `/system` | Feature flags + pricing rules |

## Project layout

```
src/
├── app/
│   ├── layout.tsx              # root + theme provider
│   ├── login/page.tsx
│   └── (dashboard)/
│       ├── layout.tsx          # sidebar + topbar shell
│       ├── page.tsx            # overview
│       └── ...module pages
├── components/
│   ├── layout/   Sidebar, Topbar, PageHeader
│   └── ui/       Button, Input, Select, Badge, Card, DataTable, Drawer, StatCard
└── lib/
    ├── api.ts    axios + unwrap + tokenStore + 401 interceptor (skips /auth/)
    ├── types.ts  entity interfaces
    ├── theme.tsx custom ThemeProvider
    ├── format.ts date/money/number formatters
    ├── mock.ts   fallback seed data
    └── cn.ts     tailwind-merge helper
```
