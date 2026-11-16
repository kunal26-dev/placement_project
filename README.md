# Pathway — University Placement Intelligence

A full-stack placement preparation application built with React, Vite, and a MongoDB-backed Node API.

## Requirements

- Node.js 22.13 or newer
- A MongoDB database (local MongoDB or MongoDB Atlas)
- npm

## Start the application

Set `MONGODB_URI` to your MongoDB connection string, then install dependencies and start both the API and frontend. For a local MongoDB server in PowerShell:

```powershell
$env:MONGODB_URI = "mongodb://127.0.0.1:27017/placement_platform"
npm install
npm run dev:all
```

For Atlas, use the connection string from your Atlas cluster instead. Keep the URI private and configure the Atlas network access list to allow connections from your API host.

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). The API is available at `http://127.0.0.1:3001/api`. Set `MONGODB_DATABASE` to override the default database name `placement_platform`.

Accounts, profiles, drives, registrations, questions, preparation tasks, mocks, scores, and uploaded resources are stored in MongoDB. Resource file contents use GridFS. A new empty database is seeded with demo records on first start; existing SQLite files are not imported.

To run the API and frontend separately, set `MONGODB_URI` in the API terminal and use `npm run server`; run `npm run dev` in another terminal. To build the frontend, run `npm run build`; to run the API tests, run `npm test`.
For a production-style local run, build with `npm run build` and then start the combined static app and API with `npm start`.

## Deploy the frontend to Vercel

The frontend, Node API, and MongoDB database are separate deployment components. MongoDB Atlas can host the database, but it does not host this project's Node API. Deploy the API to a Node host that can run `npm start`, and configure:

- `MONGODB_URI`: the Atlas connection string (keep it secret).
- `MONGODB_DATABASE`: optional database name; defaults to `placement_platform`.
- `CORS_ORIGIN`: the exact frontend origin, such as `https://your-project.vercel.app` (no trailing slash). Include custom domains as a comma-separated list.

The Vercel project root must be the folder containing `package.json`; use build command `npm run build` and output directory `dist`. Set the Vercel environment variable `VITE_API_BASE_URL` to the API service origin (for example `https://your-api.example.com`), without `/api`, then redeploy. The frontend appends `/api` automatically.

The included `render.yaml` is an optional paid Render API configuration. After deployment, set its MongoDB and CORS environment variables, then verify `https://<your-api-host>/api/health` returns `{"status":"ok","database":"mongodb"}`. Configure production coordinator credentials and replace or remove demonstration seed accounts before opening the site to students.

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

Resource uploads are limited to supported document formats and 10 MB per file. Uploaded files are stored in MongoDB GridFS; include the MongoDB database in backups and restrict access to the database credentials.

## Data integrity

The initial drives and historical questions are **illustrative sample data**. They are labeled in the app and must be replaced with verified university placement-cell information before being presented as official. The app does not connect to an external placement service or generate verified placement data.

For production deployment, configure HTTPS, replace the demo credentials, back up MongoDB, and add your university's approved identity, privacy, and data-retention policies.
