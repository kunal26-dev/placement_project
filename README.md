# Pathway — University Placement Intelligence

A full-stack placement preparation application built with React, Vite, and a persistent SQLite API.

## Requirements

- Node.js 22.13 or newer (the API uses Node's built-in `node:sqlite` module)
- npm

## Start the application

From this directory, install dependencies and start both the API and frontend:

```sh
npm install
npm run dev:all
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API is available at `http://127.0.0.1:3001/api`.

The local database is created at `data/placement.db` the first time the API starts. Accounts, profiles, drives, registrations, questions, preparation tasks, mock assessments, and scores are saved there. Uploaded resources are stored under `data/uploads/`; both persist after restarting the app.

To run the API and frontend separately, use `npm run server` and `npm run dev` in two terminals. To build the frontend, run `npm run build`; to run the API smoke tests, run `npm test`.
For a production-style local run, build with `npm run build` and then start the combined static app and API with `npm start`.

## Deploy the frontend to Vercel

The Vercel frontend needs a reachable API. Vercel's static frontend deployment does not run this project's persistent Node/SQLite API, so requests such as account creation return a Vercel 404 until an API host is configured.

This project includes a Render Blueprint in `render.yaml` for the API. It runs the existing Node server with a persistent disk for the SQLite database and uploaded files. A Render plan that supports persistent disks is required; the disk is mounted at `/var/data`.

1. Deploy the project to Vercel with the Vercel project root set to `placement-platform`, build command `npm run build`, and output directory `dist`.
2. Deploy `render.yaml` as a Blueprint in Render. Set `CORS_ORIGIN` to the exact Vercel site origin, for example `https://your-project.vercel.app` (no trailing slash). Include any custom domain origins as a comma-separated list.
3. After the Render service is available, set the Vercel environment variable `VITE_API_BASE_URL` to the Render service origin, for example `https://placement-platform-api.onrender.com`. Do not add `/api`; the frontend adds it automatically. Redeploy the Vercel project after changing the variable.
4. Verify the API at `https://<your-render-service>.onrender.com/api/health`, then try creating a student account on the Vercel site.

The API uses the configured `DATABASE_PATH`; uploaded resources are stored alongside that database on the persistent disk. Configure production coordinator credentials and replace or remove demonstration seed accounts before opening the site to students.

## Demo access

| Role | Email | Password |
| --- | --- | --- |
| Student | `student@university.edu` | `Student@123` |
| Placement administrator | `dbuu2026@gmail.com` | `dbuu2026` |

These are local demonstration credentials. Change them or remove the seeded accounts before deploying the app.

## Included features

- Student registration, login, and session persistence
- Separate student and placement-coordinator sign-in; coordinator accounts are created by the placement cell, not public registration
- Student academic profile and editable skill-readiness self-assessment
- Placement-drive search and filters with rule-based eligibility explanations
- Student drive registration and placement-cell drive management
- Searchable prior-question repository with company, year, round, topic, and difficulty filters
- Moderation of student question submissions
- Placement-cell notices, with student and all-user audiences, and coordinator editing
- Placement-cell resource uploads with authenticated student downloads (PDF, Word, Excel, PowerPoint, CSV, Markdown, and text; maximum 10 MB per file)
- Coordinator-created draft and published practice mocks, with server-side scoring and saved student results
- Personal preparation roadmaps with editable task status
- Recorded drive selection stages and skill-specific preparation gaps
- Student score history for coordinator-published practice mocks
- Placement-cell overview of student profiles and drive registrations

Eligibility is calculated only from the recorded CGPA, branch, and backlog rules. Missing criteria are not treated as verified. Students should confirm official requirements with their placement cell.

The current build uses transparent rules and self-assessment data; it does not connect to an LLM, university portal, document retrieval service, or external placement API. Sample drives, questions, and the welcome notice are not official. Replace them with verified data before using the app for university decisions.

Resource uploads are limited to supported document formats and 10 MB per file. The API stores files under the directory adjacent to the configured SQLite database; include that directory in backups and restrict access to the application host.

## Data integrity

The initial drives and historical questions are **illustrative sample data**. They are labeled in the app and must be replaced with verified university placement-cell information before being presented as official. The app does not connect to an external placement service or generate verified placement data.

For production deployment, configure HTTPS, replace the local demo credentials, back up the SQLite database, and add your university's approved identity, privacy, and data-retention policies.
