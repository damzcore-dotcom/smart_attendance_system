# Tech Stack Specification: Smart Attendance Pro

This document outlines the technical architecture for implementing the Smart Attendance Pro system based on the established designs and blueprint.

## 1. Frontend Architecture (Web & Mobile)
- **Framework:** React 19 ( leveraging the latest concurrent features and Server Components where applicable).
- **Build Tool:** Vite (for near-instant HMR and optimized production builds).
- **Styling:** Tailwind CSS (utility-first approach matching our design system tokens).
- **Navigation:** React Router DOM (client-side routing for SPA experience).
- **Mobile Native Bridge:** Capacitor (wrapping the web app for Android/iOS deployment).
- **UI Components:** 
    - **Icons:** Lucide React & Heroicons.
    - **Charts:** Recharts (for attendance trends and metrics).
- **State Management:** TanStack Query (React Query) for efficient server-state handling.

## 2. Backend & Data Layer
- **Runtime:** Node.js.
- **Framework:** Express.js (RESTful API architecture).
- **ORM:** Prisma (PostgreSQL or MySQL recommended for relational data).
- **Asset Handling:** Multer (handling multipart/form-data for face enrollment and attachments).
- **Image Processing:** Sharp (resizing/optimizing selfies before storage/analysis).
- **Scheduled Tasks:** Node-cron (for daily attendance reports, resetting leave balances, and automated late calculations).

## 3. Integration & Biometrics
- **Authentication:** JWT (JSON Web Tokens) for secure API access.
- **Face Recognition:** Integration with external APIs (e.g., AWS Rekognition, Azure Face API) or a self-hosted Python-based Face Engine.
- **GPS Logic:** Implementation of the Haversine formula within the Backend Logic layer to validate geofence coordinates.

## 4. Deployment Strategy
- **Frontend:** Vercel or Netlify for high-availability web hosting.
- **Backend:** Heroku, Railway, or AWS EC2/Lambda.
- **Database:** Supabase or Managed PostgreSQL.
