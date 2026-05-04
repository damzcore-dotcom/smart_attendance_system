# Smart Attendance Pro - Implementation Plan & Folder Structure

This plan outlines the dual-track architecture for the Smart Attendance Pro system, separating the high-performance React frontend from the robust Node.js backend, with specific guidance for Antigravity integration.

## 1. Frontend Structure (React 19 + Vite + Tailwind)
Focused on a modular component-based architecture to support Web, Desktop, and Mobile (via Capacitor).

```text
/frontend
├── src/
│   ├── assets/             # Branding, logos, and global images
│   ├── components/         # Shared UI (Buttons, Cards, Inputs)
│   │   ├── common/         # Atomic UI elements
│   │   ├── layout/         # SideBar, TopNav, BottomNav
│   │   └── widgets/        # Attendance status cards, charts
│   ├── hooks/              # Custom React hooks (useLocation, useAuth)
│   ├── pages/              # Screen-level components
│   │   ├── admin/          # Dashboard, Employees, Settings
│   │   ├── employee/       # Mobile Home, Attendance, Profile
│   │   └── kiosk/          # Scanning, Feedback screens
│   ├── services/           # API integration logic (Axios/Fetch)
│   ├── store/              # Global state (Zustand or Context API)
│   ├── styles/             # Tailwind global CSS
│   └── App.jsx             # Root router and providers
├── tailwind.config.js      # Custom theme tokens (#006C49)
├── vite.config.js          # Build optimizations
└── capacitor.config.json   # Native mobile configuration
```

## 2. Backend Structure (Node.js + Express + Prisma)
Designed for scalability, security, and real-time biometric data processing.

```text
/backend
├── prisma/
│   └── schema.prisma       # Database models and relations
├── src/
│   ├── controllers/        # Business logic for each route
│   ├── middleware/         # Auth (JWT), Multer file handling
│   ├── routes/             # API endpoint definitions
│   ├── services/           # Biometric API calls & GPS logic
│   ├── utils/              # Haversine formula, cron job helpers
│   └── index.js            # Express server entry point
├── .env                    # Database URL & API Keys
└── package.json            # Scripts for migration & dev
```

## 3. Antigravity Execution Plan

### Phase 1: Data & Logic Initialization (Antigravity)
1. **Schema Sync:** Map the `prisma/schema.prisma` definitions to Antigravity tables (`tb_karyawan`, `tb_absensi`, `tb_shift`).
2. **Logic Builder:** Implement the "Automatic Late Calculation" logic in Antigravity's backend layer using the `Grace Period` settings.
3. **API Mapping:** Define the REST endpoints in Antigravity to match the `services/` folder in the React frontend.

### Phase 2: Frontend Implementation
1. **UI Assembly:** Use the provided HTML/CSS designs to build the React components in the `/pages` directory.
2. **State Sync:** Connect the frontend forms (Leave Request, Employee Enrollment) to the Antigravity API endpoints.
3. **Hardware Integration:** Use Capacitor plugins for GPS access (Mobile) and Camera access (Kiosk).

### Phase 3: Automation & Testing
1. **Cron Setup:** Configure `node-cron` in the backend to trigger daily attendance summaries at 23:59.
2. **Biometric Validation:** Test the Face Engine API integration with `Match Score > 90%` threshold.
3. **Geofence Test:** Validate the Haversine distance check against the configured `tb_lokasi` radius.
