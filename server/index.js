import { createServer } from 'node:http'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { dirname, extname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

const port = Number(process.env.PORT || process.env.API_PORT || 3001)
const databasePath = resolve(process.env.DATABASE_PATH || 'data/placement.db')
const uploadsDirectory = resolve(dirname(databasePath), 'uploads')
const staticDirectory = resolve('dist')
const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
mkdirSync(dirname(databasePath), { recursive: true })
mkdirSync(uploadsDirectory, { recursive: true })

const db = new DatabaseSync(databasePath)
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('student', 'admin')),
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS drives (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    deadline TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Open', 'Closed', 'Coming soon')),
    location TEXT NOT NULL,
    description TEXT NOT NULL,
    source TEXT NOT NULL,
    min_cgpa REAL,
    branches_json TEXT NOT NULL,
    max_backlogs INTEGER,
    skills_json TEXT NOT NULL,
    stages_json TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS registrations (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    drive_id TEXT NOT NULL REFERENCES drives(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (user_id, drive_id)
  );
  CREATE TABLE IF NOT EXISTS questions (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    year INTEGER NOT NULL,
    round TEXT NOT NULL,
    topic TEXT NOT NULL,
    content TEXT NOT NULL,
    difficulty TEXT NOT NULL CHECK (difficulty IN ('Easy', 'Medium', 'Hard')),
    source TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Approved', 'Pending review')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS notices (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    audience TEXT NOT NULL CHECK (audience IN ('all', 'students')),
    source TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Published', 'Draft')),
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    source TEXT NOT NULL,
    uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    company TEXT NOT NULL,
    questions_json TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Draft', 'Published')),
    source TEXT NOT NULL,
    created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS assessment_attempts (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    completed_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS plan_items (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company TEXT NOT NULL,
    week TEXT NOT NULL,
    goal TEXT NOT NULL,
    focus TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('Planned', 'In progress', 'Done')),
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS skill_progress (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill TEXT NOT NULL,
    score INTEGER NOT NULL CHECK (score BETWEEN 0 AND 100),
    PRIMARY KEY (user_id, skill)
  );
  CREATE TABLE IF NOT EXISTS mock_attempts (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    score INTEGER NOT NULL,
    total INTEGER NOT NULL,
    completed_at TEXT NOT NULL
  );
`)

const now = () => new Date().toISOString()
const makeId = () => randomUUID()
const hashToken = (token) => createHash('sha256').update(token).digest('hex')
const safePasswordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex')
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
const FILE_TYPES = {
  '.csv': ['text/csv', 'text/plain'],
  '.doc': ['application/msword'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  '.md': ['text/markdown', 'text/plain'],
  '.pdf': ['application/pdf'],
  '.ppt': ['application/vnd.ms-powerpoint'],
  '.pptx': ['application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  '.txt': ['text/plain'],
  '.xls': ['application/vnd.ms-excel'],
  '.xlsx': ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
}

class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

function seedUser({ email, name, role, password, profile }) {
  const salt = randomBytes(16).toString('hex')
  db.prepare(`
    INSERT INTO users (id, email, name, role, password_salt, password_hash, profile_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(makeId(), email, name, role, salt, safePasswordHash(password, salt), JSON.stringify(profile), now())
}

if (db.prepare('SELECT COUNT(*) AS count FROM users').get().count === 0) {
  seedUser({
    email: 'student@university.edu',
    name: 'Aarav Sharma',
    role: 'student',
    password: 'Student@123',
    profile: {
      branch: 'Computer Science & Engineering',
      cgpa: 8.7,
      graduationYear: 2028,
      backlogs: 0,
      targetRole: 'Software Engineer',
      skills: ['Java', 'Python', 'SQL', 'Data Structures & Algorithms', 'React'],
    },
  })
  seedUser({
    email: 'dbuu2026@gmail.com',
    name: 'Placement Administrator',
    role: 'admin',
    password: 'dbuu2026',
    profile: { department: 'Placement Cell' },
  })

  const student = db.prepare('SELECT id FROM users WHERE email = ?').get('student@university.edu')
  const sampleSource = 'Sample data — replace with verified placement-cell information'
  const seedDrives = [
    {
      company: 'Microsoft',
      role: 'Software Engineer',
      deadline: '2026-11-22',
      status: 'Open',
      location: 'University campus',
      description: 'Campus hiring for software engineering roles.',
      source: sampleSource,
      minCgpa: 8,
      branches: ['Computer Science & Engineering', 'Information Technology', 'Electronics & Communication'],
      maxBacklogs: 0,
      skills: ['Data Structures & Algorithms', 'Java', 'System Design'],
      stages: ['Online assessment', 'Technical interview 1', 'Technical interview 2', 'HR discussion'],
    },
    {
      company: 'Amazon',
      role: 'SDE Intern',
      deadline: '2026-11-28',
      status: 'Open',
      location: 'University campus',
      description: 'Internship hiring with coding and behavioral rounds.',
      source: sampleSource,
      minCgpa: 8.5,
      branches: ['Computer Science & Engineering', 'Information Technology'],
      maxBacklogs: 0,
      skills: ['Data Structures & Algorithms', 'Python', 'DBMS'],
      stages: ['Online assessment', 'Technical interview', 'Leadership principles', 'HR discussion'],
    },
    {
      company: 'Deloitte',
      role: 'Technology Analyst',
      deadline: '2026-12-04',
      status: 'Open',
      location: 'Online + campus',
      description: 'Graduate analyst role combining technology and problem solving.',
      source: sampleSource,
      minCgpa: 7.5,
      branches: ['Computer Science & Engineering', 'Electronics & Communication', 'Electrical Engineering'],
      maxBacklogs: 1,
      skills: ['SQL', 'Java', 'Communication'],
      stages: ['Aptitude assessment', 'Technical interview', 'HR discussion'],
    },
    {
      company: 'Infosys',
      role: 'Systems Engineer',
      deadline: '2026-12-12',
      status: 'Coming soon',
      location: 'University campus',
      description: 'Graduate engineering role with aptitude and technical assessments.',
      source: sampleSource,
      minCgpa: 6.5,
      branches: ['Computer Science & Engineering', 'Information Technology', 'Electronics & Communication'],
      maxBacklogs: 2,
      skills: ['Java', 'SQL', 'Problem solving'],
      stages: ['Online assessment', 'Technical interview', 'HR discussion'],
    },
  ]

  const insertDrive = db.prepare(`
    INSERT INTO drives
      (id, company, role, deadline, status, location, description, source, min_cgpa,
       branches_json, max_backlogs, skills_json, stages_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const firstDriveIds = []
  for (const drive of seedDrives) {
    const id = makeId()
    firstDriveIds.push(id)
    insertDrive.run(
      id, drive.company, drive.role, drive.deadline, drive.status, drive.location,
      drive.description, drive.source, drive.minCgpa, JSON.stringify(drive.branches),
      drive.maxBacklogs, JSON.stringify(drive.skills), JSON.stringify(drive.stages), now(),
    )
  }

  const sampleQuestions = [
    ['Microsoft', 2025, 'Coding', 'Dynamic programming', 'Describe an approach to find the longest increasing subsequence in an array.', 'Hard'],
    ['Amazon', 2024, 'Technical interview', 'Database design', 'Explain database normalization and when you would denormalize a schema.', 'Medium'],
    ['Deloitte', 2025, 'Aptitude + technical', 'SQL joins', 'Given two related tables, explain how to return matching and non-matching rows.', 'Easy'],
    ['Infosys', 2023, 'Coding', 'Arrays', 'Describe a linear-time approach to rotate an array by k positions.', 'Medium'],
  ]
  const insertQuestion = db.prepare(`
    INSERT INTO questions
      (id, company, year, round, topic, content, difficulty, source, status, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Approved', ?, ?)
  `)
  for (const [company, year, round, topic, content, difficulty] of sampleQuestions) {
    insertQuestion.run(
      makeId(), company, year, round, topic, content, difficulty,
      sampleSource, null, now(),
    )
  }

  const insertPlan = db.prepare(`
    INSERT INTO plan_items (id, user_id, company, week, goal, focus, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)
  ;[
    ['Week 1', 'Build a consistent DSA routine', 'Arrays, strings, and hash maps', 'In progress'],
    ['Week 2', 'Practice trees and graphs', 'Tree traversal, BFS, and DFS', 'Planned'],
    ['Week 3', 'Review core technical concepts', 'Java, SQL, and DBMS', 'Planned'],
    ['Week 4', 'Practice interview communication', 'Mock interviews and reflection', 'Planned'],
  ].forEach(([week, goal, focus, status]) => {
    insertPlan.run(makeId(), student.id, 'General placement preparation', week, goal, focus, status, now())
  })

  const insertSkill = db.prepare('INSERT INTO skill_progress (user_id, skill, score) VALUES (?, ?, ?)')
  for (const [skill, score] of [
    ['Data Structures & Algorithms', 68],
    ['Java', 78],
    ['SQL', 64],
    ['System Design', 42],
    ['Communication', 72],
  ]) {
    insertSkill.run(student.id, skill, score)
  }

  const registerStudent = db.prepare('INSERT INTO registrations (user_id, drive_id, created_at) VALUES (?, ?, ?)')
  registerStudent.run(student.id, firstDriveIds[0], now())
}

if (db.prepare('SELECT COUNT(*) AS count FROM notices').get().count === 0) {
  const admin = db.prepare("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").get()
  if (admin) {
    db.prepare(`
      INSERT INTO notices (id, title, message, audience, source, status, created_by, created_at)
      VALUES (?, ?, ?, 'all', ?, 'Published', ?, ?)
    `).run(
      makeId(),
      'Welcome to Pathway',
      'Placement information shown in this workspace is sample data until verified by your placement cell. Check the source label on each drive and confirm deadlines before applying.',
      'Sample notice — replace with verified placement-cell information',
      admin.id,
      now(),
    )
  }
}

function toUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    profile: JSON.parse(row.profile_json),
    createdAt: row.created_at,
  }
}

function jsonResponse(response, status, value) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  })
  response.end(JSON.stringify(value))
}

function applyCors(request, response) {
  const origin = request.headers.origin
  if (!origin) return true

  const localDevelopmentOrigin = configuredCorsOrigins.length === 0
    && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin)
  if (!configuredCorsOrigins.includes(origin) && !localDevelopmentOrigin) return false

  response.setHeader('Access-Control-Allow-Origin', origin)
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  response.setHeader('Access-Control-Allow-Headers', 'Accept, Authorization, Content-Type')
  response.setHeader('Access-Control-Max-Age', '86400')
  response.setHeader('Vary', 'Origin')
  return true
}

async function serveStatic(pathname, method, response) {
  let decodedPath
  try {
    decodedPath = decodeURIComponent(pathname)
  } catch {
    throw new HttpError(400, 'Invalid URL path.')
  }

  const relativePath = decodedPath === '/' ? 'index.html' : decodedPath.replace(/^[/\\]+/, '')
  let filePath = resolve(staticDirectory, relativePath)
  if (filePath !== staticDirectory && !filePath.startsWith(`${staticDirectory}\\`) && !filePath.startsWith(`${staticDirectory}/`)) {
    throw new HttpError(400, 'Invalid URL path.')
  }

  try {
    if (!(await stat(filePath)).isFile()) throw new HttpError(404, 'File not found.')
  } catch (error) {
    if (error instanceof HttpError) throw error
    if (error.code !== 'ENOENT') throw error
    if (/\.[^/\\]+$/.test(relativePath)) throw new HttpError(404, 'File not found.')
    filePath = resolve(staticDirectory, 'index.html')
    try {
      await stat(filePath)
    } catch (staticError) {
      if (staticError.code !== 'ENOENT') throw staticError
      throw new HttpError(404, 'Built application not found. Run `npm run build` first.')
    }
  }

  const contentTypes = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.woff2': 'font/woff2',
  }
  const content = await readFile(filePath)
  response.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
  })
  response.end(method === 'HEAD' ? undefined : content)
}

async function readBody(request, maxBytes = 1_000_000) {
  const chunks = []
  let size = 0
  for await (const chunk of request) {
    size += chunk.length
    if (size > maxBytes) throw new HttpError(413, 'Request body is too large.')
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.')
  }
}

async function readObjectBody(request, maxBytes) {
  const body = await readBody(request, maxBytes)
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Request body must be a JSON object.')
  }
  return body
}

function requireText(value, label, maxLength = 200) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new HttpError(400, `${label} is required and must be under ${maxLength} characters.`)
  }
  return value.trim()
}

function validateProfile(profile) {
  const name = requireText(profile.name, 'Name', 100)
  const branch = requireText(profile.branch, 'Branch', 120)
  const cgpa = Number(profile.cgpa)
  const graduationYear = Number(profile.graduationYear)
  const backlogs = Number(profile.backlogs)
  const targetRole = requireText(profile.targetRole, 'Target role', 100)
  const skills = Array.isArray(profile.skills)
    ? [...new Set(profile.skills.map((skill) => requireText(skill, 'Skill', 60)))].slice(0, 30)
    : []

  if (!Number.isFinite(cgpa) || cgpa < 0 || cgpa > 10) throw new HttpError(400, 'CGPA must be between 0 and 10.')
  if (!Number.isInteger(graduationYear) || graduationYear < 2020 || graduationYear > 2040) {
    throw new HttpError(400, 'Enter a valid graduation year.')
  }
  if (!Number.isInteger(backlogs) || backlogs < 0 || backlogs > 50) throw new HttpError(400, 'Backlogs must be a non-negative whole number.')

  return { name, branch, cgpa, graduationYear, backlogs, targetRole, skills }
}

function assessEligibility(user, drive) {
  const profile = user.profile || {}
  const checks = [
    {
      label: 'CGPA',
      known: Number.isFinite(Number(profile.cgpa)) && drive.minCgpa != null,
      meets: Number(profile.cgpa) >= drive.minCgpa,
      requirement: `Minimum CGPA: ${drive.minCgpa ?? 'not specified'}`,
    },
    {
      label: 'Branch',
      known: Boolean(profile.branch),
      meets: drive.branches.length === 0 || drive.branches.includes(profile.branch),
      requirement: drive.branches.length ? `Eligible branches: ${drive.branches.join(', ')}` : 'No branch restriction listed',
    },
    {
      label: 'Backlogs',
      known: Number.isInteger(Number(profile.backlogs)) && drive.maxBacklogs != null,
      meets: Number(profile.backlogs) <= drive.maxBacklogs,
      requirement: `Maximum active backlogs: ${drive.maxBacklogs ?? 'not specified'}`,
    },
  ]
  const failed = checks.filter((check) => check.known && !check.meets)
  const unknown = checks.filter((check) => !check.known)
  const status = failed.length > 0 ? 'Not eligible' : unknown.length > 0 ? 'Cannot confirm' : 'Eligible'
  return {
    status,
    reasons: checks.map((check) => ({
      criterion: check.label,
      requirement: check.requirement,
      result: !check.known ? 'Cannot confirm from your profile' : check.meets ? 'Meets requirement' : 'Does not meet requirement',
      meets: check.known && check.meets,
    })),
    missingSkills: drive.skills.filter((skill) => !(profile.skills || []).some(
      (studentSkill) => studentSkill.toLocaleLowerCase() === skill.toLocaleLowerCase(),
    )),
  }
}

function toDrive(row, user) {
  const drive = {
    id: row.id,
    company: row.company,
    role: row.role,
    deadline: row.deadline,
    status: row.status,
    location: row.location,
    description: row.description,
    source: row.source,
    criteria: {
      minCgpa: row.min_cgpa,
      branches: JSON.parse(row.branches_json),
      maxBacklogs: row.max_backlogs,
      skills: JSON.parse(row.skills_json),
    },
    stages: JSON.parse(row.stages_json),
    createdAt: row.created_at,
    registered: Boolean(db.prepare('SELECT 1 FROM registrations WHERE user_id = ? AND drive_id = ?').get(user.id, row.id)),
  }
  return { ...drive, eligibility: assessEligibility(user, drive.criteria) }
}

function toQuestion(row) {
  return {
    id: row.id,
    company: row.company,
    year: row.year,
    round: row.round,
    topic: row.topic,
    content: row.content,
    difficulty: row.difficulty,
    source: row.source,
    status: row.status,
    createdAt: row.created_at,
  }
}

function currentUser(request) {
  const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) throw new HttpError(401, 'Please sign in to continue.')
  const session = db.prepare(`
    SELECT users.* FROM sessions
    JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).get(hashToken(token), now())
  if (!session) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  return { ...toUser(session), token }
}

function requireRole(user, role) {
  if (user.role !== role) throw new HttpError(403, 'You do not have permission to perform this action.')
}

function makeSession(userId) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(hashToken(token), userId, expiresAt)
  return { token, expiresAt }
}

function dashboardData(user) {
  const drives = db.prepare('SELECT * FROM drives ORDER BY deadline ASC').all().map((row) => toDrive(row, user))
  const questions = db.prepare(`
    SELECT * FROM questions WHERE status = 'Approved' ORDER BY year DESC, created_at DESC LIMIT 6
  `).all().map(toQuestion)
  const plan = db.prepare('SELECT * FROM plan_items WHERE user_id = ? ORDER BY created_at, week').all(user.id)
  const skills = db.prepare('SELECT skill, score FROM skill_progress WHERE user_id = ? ORDER BY skill').all(user.id)
  const registrations = db.prepare('SELECT drive_id, created_at FROM registrations WHERE user_id = ?').all(user.id)
  const attempts = db.prepare('SELECT id, score, total, completed_at FROM mock_attempts WHERE user_id = ? ORDER BY completed_at DESC LIMIT 5').all(user.id)
  const notices = db.prepare(`
    SELECT id, title, message, audience, source, status, created_at
    FROM notices WHERE status = 'Published' AND (audience = 'all' OR ? = 'admin')
    ORDER BY created_at DESC LIMIT 5
  `).all(user.role)

  return {
    user: { ...user, token: undefined },
    drives,
    questions,
    plan,
    skills,
    registrations,
    attempts,
    notices,
    stats: {
      openDrives: drives.filter((drive) => drive.status === 'Open').length,
      eligibleDrives: drives.filter((drive) => drive.eligibility.status === 'Eligible').length,
      registeredDrives: registrations.length,
      completedTasks: plan.filter((item) => item.status === 'Done').length,
      totalTasks: plan.length,
    },
  }
}

function driveInput(body) {
  const company = requireText(body.company, 'Company', 100)
  const role = requireText(body.role, 'Role', 120)
  const deadline = requireText(body.deadline, 'Deadline', 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(deadline) || Number.isNaN(Date.parse(`${deadline}T00:00:00Z`))) {
    throw new HttpError(400, 'Deadline must be a valid date in YYYY-MM-DD format.')
  }
  const status = body.status
  if (!['Open', 'Closed', 'Coming soon'].includes(status)) throw new HttpError(400, 'Choose a valid drive status.')
  const list = (value, label, max = 20) => {
    if (!Array.isArray(value) || value.length > max) throw new HttpError(400, `${label} must be a list.`)
    return [...new Set(value.map((item) => requireText(item, label, 100)))]
  }
  const minCgpa = body.minCgpa === '' || body.minCgpa == null ? null : Number(body.minCgpa)
  const maxBacklogs = body.maxBacklogs === '' || body.maxBacklogs == null ? null : Number(body.maxBacklogs)
  if (minCgpa != null && (!Number.isFinite(minCgpa) || minCgpa < 0 || minCgpa > 10)) throw new HttpError(400, 'Minimum CGPA must be between 0 and 10.')
  if (maxBacklogs != null && (!Number.isInteger(maxBacklogs) || maxBacklogs < 0)) throw new HttpError(400, 'Maximum backlogs must be a non-negative whole number.')
  return {
    company,
    role,
    deadline,
    status,
    location: requireText(body.location || 'University campus', 'Location', 120),
    description: requireText(body.description || 'Placement drive', 'Description', 500),
    source: requireText(body.source || 'Placement cell', 'Source', 200),
    minCgpa,
    branches: list(body.branches ?? [], 'Branch'),
    maxBacklogs,
    skills: list(body.skills ?? [], 'Skill'),
    stages: list(body.stages ?? [], 'Stage'),
  }
}

function assessmentInput(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'Practice mock details must be a JSON object.')
  }
  const title = requireText(body.title, 'Mock title', 120)
  const description = requireText(body.description, 'Mock description', 500)
  const company = requireText(body.company || 'General practice', 'Company or category', 100)
  const source = requireText(body.source || 'Placement cell', 'Mock source', 200)
  const status = body.status
  if (!['Draft', 'Published'].includes(status)) throw new HttpError(400, 'Choose whether this mock is a draft or published.')
  if (!Array.isArray(body.questions) || body.questions.length < 1 || body.questions.length > 50) {
    throw new HttpError(400, 'A practice mock must contain between 1 and 50 questions.')
  }
  const questions = body.questions.map((question, index) => {
    if (!question || typeof question !== 'object' || Array.isArray(question)) {
      throw new HttpError(400, `Question ${index + 1} must be an object.`)
    }
    const prompt = requireText(question.prompt, `Question ${index + 1}`, 1000)
    if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 6) {
      throw new HttpError(400, `Question ${index + 1} must have between 2 and 6 answer options.`)
    }
    const options = question.options.map((option) => requireText(option, 'Answer option', 240))
    const answerIndex = Number(question.answerIndex)
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
      throw new HttpError(400, `Choose a valid correct answer for question ${index + 1}.`)
    }
    return { prompt, options, answerIndex }
  })
  return { title, description, company, source, status, questions }
}

function toAssessment(row, includeAnswers = false) {
  const questions = JSON.parse(row.questions_json)
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    company: row.company,
    questionCount: questions.length,
    questions: questions.map(({ prompt, options, answerIndex }) => ({
      prompt,
      options,
      ...(includeAnswers ? { answerIndex } : {}),
    })),
    status: row.status,
    source: row.source,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function resourceMetadata(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    fileName: row.original_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    source: row.source,
    uploadedAt: row.created_at,
  }
}

const server = createServer(async (request, response) => {
  try {
    if (!applyCors(request, response)) {
      return jsonResponse(response, 403, { error: 'Request origin is not allowed.' })
    }
    if (request.method === 'OPTIONS') {
      response.writeHead(204)
      return response.end()
    }

    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`)
    const pathname = url.pathname
    const method = request.method || 'GET'

    if (method === 'GET' && pathname === '/api/health') {
      return jsonResponse(response, 200, { status: 'ok', database: 'sqlite' })
    }

    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = await readBody(request)
      const email = requireText(body.email, 'Email', 254).toLowerCase()
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address.')
      if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128) {
        throw new HttpError(400, 'Password must be between 8 and 128 characters.')
      }
      const profile = validateProfile({ ...body.profile, name: body.name })
      const id = makeId()
      const salt = randomBytes(16).toString('hex')
      try {
        db.prepare(`
          INSERT INTO users (id, email, name, role, password_salt, password_hash, profile_json, created_at)
          VALUES (?, ?, ?, 'student', ?, ?, ?, ?)
        `).run(id, email, profile.name, salt, safePasswordHash(body.password, salt), JSON.stringify(profile), now())
      } catch (error) {
        if (error.errcode === 2067) throw new HttpError(409, 'An account with this email already exists.')
        throw error
      }
      const session = makeSession(id)
      const user = toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(id))
      const insertSkill = db.prepare('INSERT OR IGNORE INTO skill_progress (user_id, skill, score) VALUES (?, ?, 0)')
      for (const skill of profile.skills) insertSkill.run(id, skill)
      return jsonResponse(response, 201, { user, ...session })
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readBody(request)
      const email = requireText(body.email, 'Email', 254).toLowerCase()
      const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email)
      if (!row || typeof body.password !== 'string') throw new HttpError(401, 'Email or password is incorrect.')
      if (body.expectedRole && !['student', 'admin'].includes(body.expectedRole)) {
        throw new HttpError(400, 'Choose a valid account type.')
      }
      const supplied = Buffer.from(safePasswordHash(body.password, row.password_salt), 'hex')
      const expected = Buffer.from(row.password_hash, 'hex')
      if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
        throw new HttpError(401, 'Email or password is incorrect.')
      }
      if (body.expectedRole && row.role !== body.expectedRole) {
        throw new HttpError(403, body.expectedRole === 'admin'
          ? 'This account does not have placement-cell access.'
          : 'This is a placement-cell account. Choose coordinator sign in.')
      }
      const session = makeSession(row.id)
      return jsonResponse(response, 200, { user: toUser(row), ...session })
    }

    if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api')) {
      await serveStatic(pathname, method, response)
      return
    }

    const user = currentUser(request)

    if (method === 'GET' && pathname === '/api/auth/me') {
      return jsonResponse(response, 200, { user: { ...user, token: undefined } })
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(user.token))
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/dashboard') {
      return jsonResponse(response, 200, dashboardData(user))
    }

    if (method === 'GET' && pathname === '/api/profile') {
      return jsonResponse(response, 200, { user: { ...user, token: undefined } })
    }

    if (method === 'PUT' && pathname === '/api/profile') {
      requireRole(user, 'student')
      const body = await readBody(request)
      const profile = validateProfile(body)
      const updateProfile = db.prepare('UPDATE users SET name = ?, profile_json = ? WHERE id = ?')
      const addSkill = db.prepare('INSERT OR IGNORE INTO skill_progress (user_id, skill, score) VALUES (?, ?, 0)')
      const deleteSkill = db.prepare('DELETE FROM skill_progress WHERE user_id = ? AND skill = ?')
      const existingSkills = db.prepare('SELECT skill FROM skill_progress WHERE user_id = ?').all(user.id)
      db.exec('BEGIN')
      try {
        updateProfile.run(profile.name, JSON.stringify(profile), user.id)
        for (const skill of profile.skills) addSkill.run(user.id, skill)
        for (const { skill } of existingSkills) {
          if (!profile.skills.includes(skill)) deleteSkill.run(user.id, skill)
        }
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      return jsonResponse(response, 200, { user: toUser(db.prepare('SELECT * FROM users WHERE id = ?').get(user.id)) })
    }

    if (method === 'GET' && pathname === '/api/drives') {
      const drives = db.prepare('SELECT * FROM drives ORDER BY deadline ASC').all().map((row) => toDrive(row, user))
      return jsonResponse(response, 200, { drives })
    }

    if (method === 'POST' && pathname === '/api/drives') {
      requireRole(user, 'admin')
      const drive = driveInput(await readBody(request))
      const id = makeId()
      db.prepare(`
        INSERT INTO drives
          (id, company, role, deadline, status, location, description, source, min_cgpa,
           branches_json, max_backlogs, skills_json, stages_json, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, drive.company, drive.role, drive.deadline, drive.status, drive.location,
        drive.description, drive.source, drive.minCgpa, JSON.stringify(drive.branches),
        drive.maxBacklogs, JSON.stringify(drive.skills), JSON.stringify(drive.stages), now(),
      )
      return jsonResponse(response, 201, { drive: toDrive(db.prepare('SELECT * FROM drives WHERE id = ?').get(id), user) })
    }

    const driveRoute = pathname.match(/^\/api\/drives\/([^/]+)(?:\/(register))?$/)
    if (driveRoute && driveRoute[2] === 'register' && method === 'POST') {
      requireRole(user, 'student')
      const driveRow = db.prepare('SELECT * FROM drives WHERE id = ?').get(driveRoute[1])
      if (!driveRow) throw new HttpError(404, 'Placement drive not found.')
      const drive = toDrive(driveRow, user)
      if (drive.status !== 'Open') throw new HttpError(409, 'Registration is not open for this drive.')
      if (Date.parse(`${drive.deadline}T23:59:59Z`) < Date.now()) throw new HttpError(409, 'The registration deadline for this drive has passed.')
      if (drive.eligibility.status !== 'Eligible') throw new HttpError(409, 'You must meet all listed eligibility criteria to register.')
      db.prepare('INSERT OR IGNORE INTO registrations (user_id, drive_id, created_at) VALUES (?, ?, ?)')
        .run(user.id, drive.id, now())
      return jsonResponse(response, 200, { registered: true })
    }

    if (driveRoute && driveRoute[2] === 'register' && method === 'DELETE') {
      requireRole(user, 'student')
      const result = db.prepare('DELETE FROM registrations WHERE user_id = ? AND drive_id = ?')
        .run(user.id, driveRoute[1])
      if (!result.changes) throw new HttpError(404, 'You are not registered for this drive.')
      return jsonResponse(response, 200, { registered: false })
    }

    if (driveRoute && !driveRoute[2] && method === 'PUT') {
      requireRole(user, 'admin')
      const drive = driveInput(await readBody(request))
      const result = db.prepare(`
        UPDATE drives SET company = ?, role = ?, deadline = ?, status = ?, location = ?,
          description = ?, source = ?, min_cgpa = ?, branches_json = ?, max_backlogs = ?,
          skills_json = ?, stages_json = ? WHERE id = ?
      `).run(
        drive.company, drive.role, drive.deadline, drive.status, drive.location,
        drive.description, drive.source, drive.minCgpa, JSON.stringify(drive.branches),
        drive.maxBacklogs, JSON.stringify(drive.skills), JSON.stringify(drive.stages), driveRoute[1],
      )
      if (!result.changes) throw new HttpError(404, 'Placement drive not found.')
      return jsonResponse(response, 200, { drive: toDrive(db.prepare('SELECT * FROM drives WHERE id = ?').get(driveRoute[1]), user) })
    }

    if (driveRoute && !driveRoute[2] && method === 'DELETE') {
      requireRole(user, 'admin')
      const result = db.prepare('DELETE FROM drives WHERE id = ?').run(driveRoute[1])
      if (!result.changes) throw new HttpError(404, 'Placement drive not found.')
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/notices') {
      const notices = user.role === 'admin'
        ? db.prepare('SELECT * FROM notices ORDER BY created_at DESC').all()
        : db.prepare("SELECT * FROM notices WHERE status = 'Published' AND audience IN ('all', 'students') ORDER BY created_at DESC").all()
      return jsonResponse(response, 200, { notices })
    }

    if (method === 'POST' && pathname === '/api/notices') {
      requireRole(user, 'admin')
      const body = await readObjectBody(request)
      const title = requireText(body.title, 'Notice title', 120)
      const message = requireText(body.message, 'Notice message', 2000)
      const audience = body.audience ?? 'all'
      const status = body.status ?? 'Published'
      if (!['all', 'students'].includes(audience)) throw new HttpError(400, 'Choose a valid notice audience.')
      if (!['Published', 'Draft'].includes(status)) throw new HttpError(400, 'Choose a valid notice status.')
      const source = requireText(body.source || 'Placement cell', 'Notice source', 200)
      const id = makeId()
      db.prepare(`
        INSERT INTO notices (id, title, message, audience, source, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, title, message, audience, source, status, user.id, now())
      return jsonResponse(response, 201, { notice: db.prepare('SELECT * FROM notices WHERE id = ?').get(id) })
    }

    const noticeRoute = pathname.match(/^\/api\/notices\/([^/]+)$/)
    if (noticeRoute && method === 'PUT') {
      requireRole(user, 'admin')
      const body = await readObjectBody(request)
      const title = requireText(body.title, 'Notice title', 120)
      const message = requireText(body.message, 'Notice message', 2000)
      const audience = body.audience
      const status = body.status
      const source = requireText(body.source, 'Notice source', 200)
      if (!['all', 'students'].includes(audience)) throw new HttpError(400, 'Choose a valid notice audience.')
      if (!['Published', 'Draft'].includes(status)) throw new HttpError(400, 'Choose a valid notice status.')
      const result = db.prepare(`
        UPDATE notices SET title = ?, message = ?, audience = ?, source = ?, status = ?
        WHERE id = ?
      `).run(title, message, audience, source, status, noticeRoute[1])
      if (!result.changes) throw new HttpError(404, 'Notice not found.')
      return jsonResponse(response, 200, { notice: db.prepare('SELECT * FROM notices WHERE id = ?').get(noticeRoute[1]) })
    }
    if (noticeRoute && method === 'DELETE') {
      requireRole(user, 'admin')
      const result = db.prepare('DELETE FROM notices WHERE id = ?').run(noticeRoute[1])
      if (!result.changes) throw new HttpError(404, 'Notice not found.')
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/resources') {
      const resources = db.prepare('SELECT * FROM resources ORDER BY created_at DESC').all()
      return jsonResponse(response, 200, { resources: resources.map(resourceMetadata) })
    }

    if (method === 'POST' && pathname === '/api/resources') {
      requireRole(user, 'admin')
      const body = await readObjectBody(request, Math.ceil(MAX_UPLOAD_BYTES * 4 / 3) + 32_000)
      const title = requireText(body.title, 'Resource title', 120)
      const description = body.description === '' || body.description === undefined
        ? ''
        : requireText(body.description, 'Resource description', 500)
      const source = requireText(body.source || 'Placement cell', 'Resource source', 200)
      const originalName = requireText(body.fileName, 'File name', 255).split(/[\\/]/).pop()
      const extension = extname(originalName).toLowerCase()
      const allowedTypes = FILE_TYPES[extension]
      if (!allowedTypes) throw new HttpError(400, 'This file format is not supported. Upload PDF, Office, CSV, Markdown, or text files.')
      const mimeType = typeof body.mimeType === 'string' && body.mimeType ? body.mimeType : allowedTypes[0]
      if (!allowedTypes.includes(mimeType) && mimeType !== 'application/octet-stream') {
        throw new HttpError(400, 'The selected file type does not match its file extension.')
      }
      if (typeof body.contentBase64 !== 'string') {
        throw new HttpError(400, 'Choose a valid file to upload.')
      }
      if (body.contentBase64.length > Math.ceil(MAX_UPLOAD_BYTES / 3) * 4) {
        throw new HttpError(413, 'Files must be between 1 byte and 10 MB.')
      }
      if (!body.contentBase64.length || body.contentBase64.length % 4 !== 0
        || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.contentBase64)) {
        throw new HttpError(400, 'Choose a valid file to upload.')
      }
      const file = Buffer.from(body.contentBase64, 'base64')
      if (!file.length || file.length > MAX_UPLOAD_BYTES || file.toString('base64') !== body.contentBase64) {
        throw new HttpError(413, 'Files must be between 1 byte and 10 MB.')
      }
      const id = makeId()
      const storedName = `${id}${extension}`
      const filePath = resolve(uploadsDirectory, storedName)
      await writeFile(filePath, file, { flag: 'wx' })
      try {
        db.prepare(`
          INSERT INTO resources
            (id, title, description, original_name, stored_name, mime_type, file_size, source, uploaded_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(id, title, description, originalName, storedName, allowedTypes.includes(mimeType) ? mimeType : allowedTypes[0], file.length, source, user.id, now())
      } catch (error) {
        await unlink(filePath)
        throw error
      }
      return jsonResponse(response, 201, { resource: resourceMetadata(db.prepare('SELECT * FROM resources WHERE id = ?').get(id)) })
    }

    const resourceDownloadRoute = pathname.match(/^\/api\/resources\/([^/]+)\/download$/)
    if (resourceDownloadRoute && method === 'GET') {
      const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceDownloadRoute[1])
      if (!resource) throw new HttpError(404, 'Resource not found.')
      const file = await readFile(resolve(uploadsDirectory, resource.stored_name))
      const filename = resource.original_name.replace(/[\r\n"]/g, '_')
      response.writeHead(200, {
        'Content-Type': resource.mime_type,
        'Content-Length': file.length,
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(resource.original_name)}`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store',
      })
      response.end(file)
      return
    }

    const resourceRoute = pathname.match(/^\/api\/resources\/([^/]+)$/)
    if (resourceRoute && method === 'DELETE') {
      requireRole(user, 'admin')
      const resource = db.prepare('SELECT * FROM resources WHERE id = ?').get(resourceRoute[1])
      if (!resource) throw new HttpError(404, 'Resource not found.')
      await unlink(resolve(uploadsDirectory, resource.stored_name))
      db.prepare('DELETE FROM resources WHERE id = ?').run(resource.id)
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/assessments') {
      const rows = user.role === 'admin'
        ? db.prepare('SELECT * FROM assessments ORDER BY created_at DESC').all()
        : db.prepare("SELECT * FROM assessments WHERE status = 'Published' ORDER BY created_at DESC").all()
      return jsonResponse(response, 200, { assessments: rows.map((row) => toAssessment(row, user.role === 'admin')) })
    }

    if (method === 'POST' && pathname === '/api/assessments') {
      requireRole(user, 'admin')
      const assessment = assessmentInput(await readObjectBody(request))
      const id = makeId()
      const timestamp = now()
      db.prepare(`
        INSERT INTO assessments (id, title, description, company, questions_json, status, source, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(id, assessment.title, assessment.description, assessment.company, JSON.stringify(assessment.questions), assessment.status, assessment.source, user.id, timestamp, timestamp)
      return jsonResponse(response, 201, { assessment: toAssessment(db.prepare('SELECT * FROM assessments WHERE id = ?').get(id), true) })
    }

    const assessmentAttemptRoute = pathname.match(/^\/api\/assessments\/([^/]+)\/attempts$/)
    if (assessmentAttemptRoute && method === 'POST') {
      requireRole(user, 'student')
      const assessmentRow = db.prepare("SELECT * FROM assessments WHERE id = ? AND status = 'Published'").get(assessmentAttemptRoute[1])
      if (!assessmentRow) throw new HttpError(404, 'Published practice mock not found.')
      const assessment = toAssessment(assessmentRow, true)
      const body = await readObjectBody(request)
      if (!Array.isArray(body.answers) || body.answers.length !== assessment.questions.length) {
        throw new HttpError(400, 'Submit an answer for every question.')
      }
      const score = assessment.questions.reduce((total, question, index) =>
        total + (Number.isInteger(body.answers[index]) && body.answers[index] === question.answerIndex ? 1 : 0), 0)
      const completedAt = now()
      db.prepare(`
        INSERT INTO assessment_attempts (id, assessment_id, user_id, score, total, completed_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(makeId(), assessment.id, user.id, score, assessment.questions.length, completedAt)
      db.prepare('INSERT INTO mock_attempts (id, user_id, score, total, completed_at) VALUES (?, ?, ?, ?, ?)')
        .run(makeId(), user.id, score, assessment.questions.length, completedAt)
      return jsonResponse(response, 201, { score, total: assessment.questions.length, completedAt })
    }

    const assessmentRoute = pathname.match(/^\/api\/assessments\/([^/]+)$/)
    if (assessmentRoute && method === 'PUT') {
      requireRole(user, 'admin')
      const assessment = assessmentInput(await readObjectBody(request))
      const result = db.prepare(`
        UPDATE assessments SET title = ?, description = ?, company = ?, questions_json = ?,
          status = ?, source = ?, updated_at = ? WHERE id = ?
      `).run(assessment.title, assessment.description, assessment.company, JSON.stringify(assessment.questions),
        assessment.status, assessment.source, now(), assessmentRoute[1])
      if (!result.changes) throw new HttpError(404, 'Practice mock not found.')
      return jsonResponse(response, 200, { assessment: toAssessment(db.prepare('SELECT * FROM assessments WHERE id = ?').get(assessmentRoute[1]), true) })
    }
    if (assessmentRoute && method === 'DELETE') {
      requireRole(user, 'admin')
      const result = db.prepare('DELETE FROM assessments WHERE id = ?').run(assessmentRoute[1])
      if (!result.changes) throw new HttpError(404, 'Practice mock not found.')
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/questions') {
      const questions = user.role === 'admin'
        ? db.prepare('SELECT * FROM questions ORDER BY year DESC, created_at DESC').all()
        : db.prepare("SELECT * FROM questions WHERE status = 'Approved' ORDER BY year DESC, created_at DESC").all()
      return jsonResponse(response, 200, { questions: questions.map(toQuestion) })
    }

    if (method === 'POST' && pathname === '/api/questions') {
      const body = await readBody(request)
      const company = requireText(body.company, 'Company', 100)
      const year = Number(body.year)
      if (!Number.isInteger(year) || year < 2000 || year > new Date().getFullYear()) throw new HttpError(400, 'Enter a valid question year.')
      const round = requireText(body.round, 'Round', 100)
      const topic = requireText(body.topic, 'Topic', 120)
      const content = requireText(body.content, 'Question text', 2000)
      const difficulty = body.difficulty
      if (!['Easy', 'Medium', 'Hard'].includes(difficulty)) throw new HttpError(400, 'Choose a valid difficulty.')
      const status = user.role === 'admin' ? 'Approved' : 'Pending review'
      const id = makeId()
      db.prepare(`
        INSERT INTO questions
          (id, company, year, round, topic, content, difficulty, source, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id, company, year, round, topic, content, difficulty,
        user.role === 'admin' ? 'Placement cell' : `Student submission — ${user.name}`,
        status, user.id, now(),
      )
      return jsonResponse(response, 201, { question: toQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(id)) })
    }

    const questionRoute = pathname.match(/^\/api\/questions\/([^/]+)$/)
    if (questionRoute && method === 'PATCH') {
      requireRole(user, 'admin')
      const body = await readBody(request)
      const status = body.status
      if (!['Approved', 'Pending review'].includes(status)) throw new HttpError(400, 'Choose a valid review status.')
      const result = db.prepare('UPDATE questions SET status = ? WHERE id = ?').run(status, questionRoute[1])
      if (!result.changes) throw new HttpError(404, 'Question not found.')
      return jsonResponse(response, 200, { question: toQuestion(db.prepare('SELECT * FROM questions WHERE id = ?').get(questionRoute[1])) })
    }

    if (method === 'GET' && pathname === '/api/plan') {
      requireRole(user, 'student')
      const items = db.prepare('SELECT * FROM plan_items WHERE user_id = ? ORDER BY created_at, week').all(user.id)
      return jsonResponse(response, 200, { items })
    }

    if (method === 'POST' && pathname === '/api/plan/generate') {
      requireRole(user, 'student')
      const body = await readBody(request)
      const driveRow = db.prepare('SELECT * FROM drives WHERE id = ?').get(body.driveId)
      if (!driveRow) throw new HttpError(404, 'Choose an existing placement drive to build a plan.')
      const drive = toDrive(driveRow, user)
      const existing = db.prepare('SELECT COUNT(*) AS count FROM plan_items WHERE user_id = ? AND company = ?')
        .get(user.id, drive.company)
      if (existing.count > 0) throw new HttpError(409, `A preparation plan for ${drive.company} already exists. Add or update tasks in your plan instead.`)

      const history = db.prepare(`
        SELECT topic, round FROM questions
        WHERE company = ? AND status = 'Approved'
        ORDER BY year DESC, created_at DESC LIMIT 10
      `).all(drive.company)
      const missingSkills = drive.eligibility.missingSkills
      const tasks = missingSkills.length
        ? missingSkills.map((skill, index) => {
            const relatedTopic = history.find((question) => question.topic.toLocaleLowerCase().includes(skill.toLocaleLowerCase())
              || skill.toLocaleLowerCase().includes(question.topic.toLocaleLowerCase()))
            return {
              week: `Week ${index + 1}`,
              goal: `Strengthen ${skill} for ${drive.company}`,
              focus: relatedTopic
                ? `Review ${relatedTopic.topic}, then practice questions from the ${relatedTopic.round.toLowerCase()} round.`
                : `Study the recorded ${skill} requirement and complete focused practice exercises.`,
            }
          })
        : [
            {
              week: 'Week 1',
              goal: `Practice the ${drive.company} selection process`,
              focus: drive.stages.length
                ? `Prepare for the recorded stages: ${drive.stages.join(', ')}.`
                : 'Review your strongest skills and practice a technical mock assessment.',
            },
            {
              week: 'Week 2',
              goal: `Review ${drive.company} interview topics`,
              focus: history.length
                ? `Practice historical topics: ${[...new Set(history.map((question) => question.topic))].slice(0, 4).join(', ')}. Past questions are not guarantees of future assessments.`
                : `Practice the skills recorded for the role: ${drive.criteria.skills.join(', ') || 'general technical fundamentals'}.`,
            },
          ]

      const insert = db.prepare(`
        INSERT INTO plan_items (id, user_id, company, week, goal, focus, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Planned', ?)
      `)
      db.exec('BEGIN')
      try {
        for (const task of tasks) insert.run(makeId(), user.id, drive.company, task.week, task.goal, task.focus, now())
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
      const items = db.prepare('SELECT * FROM plan_items WHERE user_id = ? AND company = ? ORDER BY created_at, week')
        .all(user.id, drive.company)
      return jsonResponse(response, 201, {
        items,
        basis: {
          type: 'rules and recorded data',
          source: drive.source,
          historicalQuestionCount: history.length,
          missingSkills,
        },
      })
    }

    if (method === 'POST' && pathname === '/api/plan') {
      requireRole(user, 'student')
      const body = await readBody(request)
      const company = requireText(body.company || 'General placement preparation', 'Target company', 120)
      const week = requireText(body.week, 'Week', 80)
      const goal = requireText(body.goal, 'Goal', 200)
      const focus = requireText(body.focus, 'Focus', 300)
      const id = makeId()
      db.prepare(`
        INSERT INTO plan_items (id, user_id, company, week, goal, focus, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'Planned', ?)
      `).run(id, user.id, company, week, goal, focus, now())
      return jsonResponse(response, 201, { item: db.prepare('SELECT * FROM plan_items WHERE id = ?').get(id) })
    }

    const planRoute = pathname.match(/^\/api\/plan\/([^/]+)$/)
    if (planRoute && method === 'PATCH') {
      requireRole(user, 'student')
      const body = await readBody(request)
      if (!['Planned', 'In progress', 'Done'].includes(body.status)) throw new HttpError(400, 'Choose a valid task status.')
      const result = db.prepare('UPDATE plan_items SET status = ? WHERE id = ? AND user_id = ?')
        .run(body.status, planRoute[1], user.id)
      if (!result.changes) throw new HttpError(404, 'Preparation task not found.')
      return jsonResponse(response, 200, { item: db.prepare('SELECT * FROM plan_items WHERE id = ?').get(planRoute[1]) })
    }

    if (planRoute && method === 'DELETE') {
      requireRole(user, 'student')
      const result = db.prepare('DELETE FROM plan_items WHERE id = ? AND user_id = ?').run(planRoute[1], user.id)
      if (!result.changes) throw new HttpError(404, 'Preparation task not found.')
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/progress') {
      requireRole(user, 'student')
      const skills = db.prepare('SELECT skill, score FROM skill_progress WHERE user_id = ? ORDER BY skill').all(user.id)
      const attempts = db.prepare('SELECT id, score, total, completed_at FROM mock_attempts WHERE user_id = ? ORDER BY completed_at DESC LIMIT 20').all(user.id)
      return jsonResponse(response, 200, { skills, attempts })
    }

    const skillRoute = pathname.match(/^\/api\/progress\/([^/]+)$/)
    if (skillRoute && method === 'PUT') {
      requireRole(user, 'student')
      const skill = decodeURIComponent(skillRoute[1])
      requireText(skill, 'Skill', 60)
      const body = await readBody(request)
      const score = Number(body.score)
      if (!Number.isInteger(score) || score < 0 || score > 100) throw new HttpError(400, 'Score must be between 0 and 100.')
      db.prepare(`
        INSERT INTO skill_progress (user_id, skill, score) VALUES (?, ?, ?)
        ON CONFLICT(user_id, skill) DO UPDATE SET score = excluded.score
      `).run(user.id, skill, score)
      return jsonResponse(response, 200, { skill, score })
    }

    if (method === 'POST' && pathname === '/api/mock-attempts') {
      requireRole(user, 'student')
      const body = await readBody(request)
      const score = Number(body.score)
      const total = Number(body.total)
      if (!Number.isInteger(score) || !Number.isInteger(total) || total < 1 || score < 0 || score > total || total > 100) {
        throw new HttpError(400, 'Submit a valid mock assessment score.')
      }
      const attempt = { id: makeId(), userId: user.id, score, total, completedAt: now() }
      db.prepare('INSERT INTO mock_attempts (id, user_id, score, total, completed_at) VALUES (?, ?, ?, ?, ?)')
        .run(attempt.id, attempt.userId, attempt.score, attempt.total, attempt.completedAt)
      return jsonResponse(response, 201, { attempt })
    }

    if (method === 'GET' && pathname === '/api/admin/summary') {
      requireRole(user, 'admin')
      const driveCount = db.prepare('SELECT COUNT(*) AS count FROM drives').get().count
      const openDriveCount = db.prepare("SELECT COUNT(*) AS count FROM drives WHERE status = 'Open'").get().count
      const studentCount = db.prepare("SELECT COUNT(*) AS count FROM users WHERE role = 'student'").get().count
      const registrationCount = db.prepare('SELECT COUNT(*) AS count FROM registrations').get().count
      const pendingQuestionCount = db.prepare("SELECT COUNT(*) AS count FROM questions WHERE status = 'Pending review'").get().count
      const publishedNoticeCount = db.prepare("SELECT COUNT(*) AS count FROM notices WHERE status = 'Published'").get().count
      const students = db.prepare("SELECT id, email, name, profile_json, created_at FROM users WHERE role = 'student' ORDER BY created_at DESC").all()
        .map((row) => ({ id: row.id, email: row.email, name: row.name, profile: JSON.parse(row.profile_json), createdAt: row.created_at }))
      const registrations = db.prepare(`
        SELECT registrations.created_at, users.name, drives.company, drives.role
        FROM registrations JOIN users ON users.id = registrations.user_id
        JOIN drives ON drives.id = registrations.drive_id
        ORDER BY registrations.created_at DESC LIMIT 10
      `).all()
      return jsonResponse(response, 200, {
        metrics: { driveCount, openDriveCount, studentCount, registrationCount, pendingQuestionCount, publishedNoticeCount },
        students,
        registrations,
      })
    }

    return jsonResponse(response, 404, { error: 'API route not found.' })
  } catch (error) {
    if (error instanceof HttpError) return jsonResponse(response, error.status, { error: error.message })
    console.error('API request failed:', error)
    return jsonResponse(response, 500, { error: 'The server could not complete this request.' })
  }
})

server.listen(port, '0.0.0.0', () => {
  console.log(`Placement API listening on http://127.0.0.1:${port}`)
  console.log(`SQLite database: ${databasePath}`)
})

function closeServer() {
  server.close(() => {
    db.close()
    process.exit(0)
  })
}

process.on('SIGINT', closeServer)
process.on('SIGTERM', closeServer)
