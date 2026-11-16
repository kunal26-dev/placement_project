import { createServer } from 'node:http'
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { extname, resolve } from 'node:path'
import { connectDatabase } from './database.js'

const port = Number(process.env.PORT || process.env.API_PORT || 3001)
const staticDirectory = resolve('dist')
const configuredCorsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)
const { client, database, collections, resourceFiles } = await connectDatabase()
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

function withoutMongoId(document) {
  if (!document) return document
  const { _id, ...value } = document
  return value
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
      known: Number.isFinite(Number(profile.cgpa)) && drive.min_cgpa != null,
      meets: Number(profile.cgpa) >= drive.min_cgpa,
      requirement: `Minimum CGPA: ${drive.min_cgpa ?? 'not specified'}`,
    },
    {
      label: 'Branch',
      known: Boolean(profile.branch),
      meets: JSON.parse(drive.branches_json).length === 0 || JSON.parse(drive.branches_json).includes(profile.branch),
      requirement: JSON.parse(drive.branches_json).length
        ? `Eligible branches: ${JSON.parse(drive.branches_json).join(', ')}`
        : 'No branch restriction listed',
    },
    {
      label: 'Backlogs',
      known: Number.isInteger(Number(profile.backlogs)) && drive.max_backlogs != null,
      meets: Number(profile.backlogs) <= drive.max_backlogs,
      requirement: `Maximum active backlogs: ${drive.max_backlogs ?? 'not specified'}`,
    },
  ]
  const failed = checks.filter((check) => check.known && !check.meets)
  const unknown = checks.filter((check) => !check.known)
  const status = failed.length > 0 ? 'Not eligible' : unknown.length > 0 ? 'Cannot confirm' : 'Eligible'
  const skills = JSON.parse(drive.skills_json)
  return {
    status,
    reasons: checks.map((check) => ({
      criterion: check.label,
      requirement: check.requirement,
      result: !check.known ? 'Cannot confirm from your profile' : check.meets ? 'Meets requirement' : 'Does not meet requirement',
      meets: check.known && check.meets,
    })),
    missingSkills: skills.filter((skill) => !(profile.skills || []).some(
      (studentSkill) => studentSkill.toLocaleLowerCase() === skill.toLocaleLowerCase(),
    )),
  }
}

async function toDrive(row, user) {
  const branches = JSON.parse(row.branches_json)
  const skills = JSON.parse(row.skills_json)
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
      branches,
      maxBacklogs: row.max_backlogs,
      skills,
    },
    stages: JSON.parse(row.stages_json),
    createdAt: row.created_at,
    registered: Boolean(await collections.registrations.findOne({ user_id: user.id, drive_id: row.id })),
  }
  return { ...drive, eligibility: assessEligibility(user, row) }
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

async function currentUser(request) {
  const token = request.headers.authorization?.match(/^Bearer (.+)$/i)?.[1]
  if (!token) throw new HttpError(401, 'Please sign in to continue.')
  const session = await collections.sessions.findOne({ token_hash: hashToken(token), expires_at: { $gt: now() } })
  const row = session && await collections.users.findOne({ id: session.user_id })
  if (!row) throw new HttpError(401, 'Your session has expired. Please sign in again.')
  return { ...toUser(row), token }
}

function requireRole(user, role) {
  if (user.role !== role) throw new HttpError(403, 'You do not have permission to perform this action.')
}

async function makeSession(userId) {
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await collections.sessions.insertOne({
    token_hash: hashToken(token),
    user_id: userId,
    expires_at: expiresAt,
    expires_at_date: new Date(expiresAt),
  })
  return { token, expiresAt }
}

async function findRows(name, filter = {}, sort, limit) {
  let cursor = collections[name].find(filter)
  if (sort) cursor = cursor.sort(sort)
  if (limit) cursor = cursor.limit(limit)
  return cursor.toArray()
}

async function dashboardData(user) {
  const [driveRows, questionRows, plan, skills, registrations, attempts, notices] = await Promise.all([
    findRows('drives', {}, { deadline: 1 }),
    findRows('questions', { status: 'Approved' }, { year: -1, created_at: -1 }, 6),
    findRows('plan_items', { user_id: user.id }, { created_at: 1, week: 1 }),
    findRows('skill_progress', { user_id: user.id }, { skill: 1 }),
    findRows('registrations', { user_id: user.id }),
    findRows('mock_attempts', { user_id: user.id }, { completed_at: -1 }, 5),
    findRows('notices', { status: 'Published', ...(user.role === 'admin' ? {} : { audience: 'all' }) }, { created_at: -1 }, 5),
  ])
  const drives = await Promise.all(driveRows.map((row) => toDrive(row, user)))
  const cleanPlan = plan.map(withoutMongoId)
  const cleanSkills = skills.map(withoutMongoId)
  const cleanAttempts = attempts.map(withoutMongoId)
  const cleanNotices = notices.map(withoutMongoId)

  return {
    user: { ...user, token: undefined },
    drives,
    questions: questionRows.map(toQuestion),
    plan: cleanPlan,
    skills: cleanSkills,
    registrations: registrations.map(withoutMongoId),
    attempts: cleanAttempts,
    notices: cleanNotices,
    stats: {
      openDrives: drives.filter((drive) => drive.status === 'Open').length,
      eligibleDrives: drives.filter((drive) => drive.eligibility.status === 'Eligible').length,
      registeredDrives: registrations.length,
      completedTasks: cleanPlan.filter((item) => item.status === 'Done').length,
      totalTasks: cleanPlan.length,
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
    min_cgpa: minCgpa,
    branches_json: JSON.stringify(list(body.branches ?? [], 'Branch')),
    max_backlogs: maxBacklogs,
    skills_json: JSON.stringify(list(body.skills ?? [], 'Skill')),
    stages_json: JSON.stringify(list(body.stages ?? [], 'Stage')),
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
  return { title, description, company, source, status, questions_json: JSON.stringify(questions) }
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

async function storeResourceFile(id, name, file) {
  const stream = resourceFiles.openUploadStreamWithId(id, name)
  await new Promise((resolve, reject) => {
    stream.once('error', reject)
    stream.once('finish', resolve)
    stream.end(file)
  })
}

async function readResourceFile(id) {
  const stream = resourceFiles.openDownloadStream(id)
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks)
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
      await database.command({ ping: 1 })
      return jsonResponse(response, 200, { status: 'ok', database: 'mongodb' })
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
      const row = {
        id,
        email,
        name: profile.name,
        role: 'student',
        password_salt: salt,
        password_hash: safePasswordHash(body.password, salt),
        profile_json: JSON.stringify(profile),
        created_at: now(),
      }
      try {
        await collections.users.insertOne(row)
      } catch (error) {
        if (error.code === 11000) throw new HttpError(409, 'An account with this email already exists.')
        throw error
      }
      const session = await makeSession(id)
      if (profile.skills.length) {
        await collections.skill_progress.insertMany(profile.skills.map((skill) => ({ user_id: id, skill, score: 0 })))
      }
      return jsonResponse(response, 201, { user: toUser(row), ...session })
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await readBody(request)
      const email = requireText(body.email, 'Email', 254).toLowerCase()
      const row = await collections.users.findOne({ email })
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
      const session = await makeSession(row.id)
      return jsonResponse(response, 200, { user: toUser(row), ...session })
    }

    if ((method === 'GET' || method === 'HEAD') && !pathname.startsWith('/api')) {
      await serveStatic(pathname, method, response)
      return
    }

    const user = await currentUser(request)

    if (method === 'GET' && pathname === '/api/auth/me') {
      return jsonResponse(response, 200, { user: { ...user, token: undefined } })
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      await collections.sessions.deleteOne({ token_hash: hashToken(user.token) })
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/dashboard') {
      return jsonResponse(response, 200, await dashboardData(user))
    }

    if (method === 'GET' && pathname === '/api/profile') {
      return jsonResponse(response, 200, { user: { ...user, token: undefined } })
    }

    if (method === 'PUT' && pathname === '/api/profile') {
      requireRole(user, 'student')
      const profile = validateProfile(await readBody(request))
      const updated = await collections.users.updateOne(
        { id: user.id },
        { $set: { name: profile.name, profile_json: JSON.stringify(profile) } },
      )
      if (!updated.matchedCount) throw new HttpError(404, 'User not found.')
      if (profile.skills.length) {
        await collections.skill_progress.bulkWrite(profile.skills.map((skill) => ({
          updateOne: {
            filter: { user_id: user.id, skill },
            update: { $setOnInsert: { score: 0 } },
            upsert: true,
          },
        })))
      }
      await collections.skill_progress.deleteMany({
        user_id: user.id,
        skill: { $nin: profile.skills },
      })
      const row = await collections.users.findOne({ id: user.id })
      return jsonResponse(response, 200, { user: toUser(row) })
    }

    if (method === 'GET' && pathname === '/api/drives') {
      const rows = await findRows('drives', {}, { deadline: 1 })
      const drives = await Promise.all(rows.map((row) => toDrive(row, user)))
      return jsonResponse(response, 200, { drives })
    }

    if (method === 'POST' && pathname === '/api/drives') {
      requireRole(user, 'admin')
      const drive = driveInput(await readBody(request))
      const row = { id: makeId(), ...drive, created_at: now() }
      await collections.drives.insertOne(row)
      return jsonResponse(response, 201, { drive: await toDrive(row, user) })
    }

    const driveRoute = pathname.match(/^\/api\/drives\/([^/]+)(?:\/(register))?$/)
    if (driveRoute && driveRoute[2] === 'register' && method === 'POST') {
      requireRole(user, 'student')
      const driveRow = await collections.drives.findOne({ id: driveRoute[1] })
      if (!driveRow) throw new HttpError(404, 'Placement drive not found.')
      const drive = await toDrive(driveRow, user)
      if (drive.status !== 'Open') throw new HttpError(409, 'Registration is not open for this drive.')
      if (Date.parse(`${drive.deadline}T23:59:59Z`) < Date.now()) throw new HttpError(409, 'The registration deadline for this drive has passed.')
      if (drive.eligibility.status !== 'Eligible') throw new HttpError(409, 'You must meet all listed eligibility criteria to register.')
      try {
        await collections.registrations.insertOne({ user_id: user.id, drive_id: drive.id, created_at: now() })
      } catch (error) {
        if (error.code !== 11000) throw error
      }
      return jsonResponse(response, 200, { registered: true })
    }

    if (driveRoute && driveRoute[2] === 'register' && method === 'DELETE') {
      requireRole(user, 'student')
      const result = await collections.registrations.deleteOne({ user_id: user.id, drive_id: driveRoute[1] })
      if (!result.deletedCount) throw new HttpError(404, 'You are not registered for this drive.')
      return jsonResponse(response, 200, { registered: false })
    }

    if (driveRoute && !driveRoute[2] && method === 'PUT') {
      requireRole(user, 'admin')
      const drive = driveInput(await readBody(request))
      const result = await collections.drives.updateOne({ id: driveRoute[1] }, { $set: drive })
      if (!result.matchedCount) throw new HttpError(404, 'Placement drive not found.')
      return jsonResponse(response, 200, {
        drive: await toDrive(await collections.drives.findOne({ id: driveRoute[1] }), user),
      })
    }

    if (driveRoute && !driveRoute[2] && method === 'DELETE') {
      requireRole(user, 'admin')
      const result = await collections.drives.deleteOne({ id: driveRoute[1] })
      if (!result.deletedCount) throw new HttpError(404, 'Placement drive not found.')
      await collections.registrations.deleteMany({ drive_id: driveRoute[1] })
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/notices') {
      const filter = user.role === 'admin'
        ? {}
        : { status: 'Published', audience: { $in: ['all', 'students'] } }
      const notices = await findRows('notices', filter, { created_at: -1 })
      return jsonResponse(response, 200, { notices: notices.map(withoutMongoId) })
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
      const row = {
        id: makeId(),
        title,
        message,
        audience,
        source: requireText(body.source || 'Placement cell', 'Notice source', 200),
        status,
        created_by: user.id,
        created_at: now(),
      }
      await collections.notices.insertOne(row)
      return jsonResponse(response, 201, { notice: row })
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
      const result = await collections.notices.updateOne(
        { id: noticeRoute[1] },
        { $set: { title, message, audience, status, source } },
      )
      if (!result.matchedCount) throw new HttpError(404, 'Notice not found.')
      return jsonResponse(response, 200, {
        notice: withoutMongoId(await collections.notices.findOne({ id: noticeRoute[1] })),
      })
    }

    if (noticeRoute && method === 'DELETE') {
      requireRole(user, 'admin')
      const result = await collections.notices.deleteOne({ id: noticeRoute[1] })
      if (!result.deletedCount) throw new HttpError(404, 'Notice not found.')
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/resources') {
      const resources = await findRows('resources', {}, { created_at: -1 })
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
      if (typeof body.contentBase64 !== 'string') throw new HttpError(400, 'Choose a valid file to upload.')
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
      const row = {
        id,
        title,
        description,
        original_name: originalName,
        stored_name: storedName,
        mime_type: allowedTypes.includes(mimeType) ? mimeType : allowedTypes[0],
        file_size: file.length,
        source,
        uploaded_by: user.id,
        created_at: now(),
      }
      await storeResourceFile(id, storedName, file)
      try {
        await collections.resources.insertOne(row)
      } catch (error) {
        await resourceFiles.delete(id)
        throw error
      }
      return jsonResponse(response, 201, { resource: resourceMetadata(row) })
    }

    const resourceDownloadRoute = pathname.match(/^\/api\/resources\/([^/]+)\/download$/)
    if (resourceDownloadRoute && method === 'GET') {
      const resource = await collections.resources.findOne({ id: resourceDownloadRoute[1] })
      if (!resource) throw new HttpError(404, 'Resource not found.')
      const file = await readResourceFile(resource.id)
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
      const resource = await collections.resources.findOne({ id: resourceRoute[1] })
      if (!resource) throw new HttpError(404, 'Resource not found.')
      await resourceFiles.delete(resource.id)
      await collections.resources.deleteOne({ id: resource.id })
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/assessments') {
      const filter = user.role === 'admin' ? {} : { status: 'Published' }
      const rows = await findRows('assessments', filter, { created_at: -1 })
      return jsonResponse(response, 200, { assessments: rows.map((row) => toAssessment(row, user.role === 'admin')) })
    }

    if (method === 'POST' && pathname === '/api/assessments') {
      requireRole(user, 'admin')
      const assessment = assessmentInput(await readObjectBody(request))
      const timestamp = now()
      const row = {
        id: makeId(),
        title: assessment.title,
        description: assessment.description,
        company: assessment.company,
        questions_json: assessment.questions_json,
        status: assessment.status,
        source: assessment.source,
        created_by: user.id,
        created_at: timestamp,
        updated_at: timestamp,
      }
      await collections.assessments.insertOne(row)
      return jsonResponse(response, 201, { assessment: toAssessment(row, true) })
    }

    const assessmentAttemptRoute = pathname.match(/^\/api\/assessments\/([^/]+)\/attempts$/)
    if (assessmentAttemptRoute && method === 'POST') {
      requireRole(user, 'student')
      const assessmentRow = await collections.assessments.findOne({
        id: assessmentAttemptRoute[1],
        status: 'Published',
      })
      if (!assessmentRow) throw new HttpError(404, 'Published practice mock not found.')
      const assessment = toAssessment(assessmentRow, true)
      const body = await readObjectBody(request)
      if (!Array.isArray(body.answers) || body.answers.length !== assessment.questions.length) {
        throw new HttpError(400, 'Submit an answer for every question.')
      }
      const score = assessment.questions.reduce((total, question, index) =>
        total + (Number.isInteger(body.answers[index]) && body.answers[index] === question.answerIndex ? 1 : 0), 0)
      const completedAt = now()
      await collections.assessment_attempts.insertOne({
        id: makeId(),
        assessment_id: assessment.id,
        user_id: user.id,
        score,
        total: assessment.questions.length,
        completed_at: completedAt,
      })
      await collections.mock_attempts.insertOne({
        id: makeId(),
        user_id: user.id,
        score,
        total: assessment.questions.length,
        completed_at: completedAt,
      })
      return jsonResponse(response, 201, { score, total: assessment.questions.length, completedAt })
    }

    const assessmentRoute = pathname.match(/^\/api\/assessments\/([^/]+)$/)
    if (assessmentRoute && method === 'PUT') {
      requireRole(user, 'admin')
      const assessment = assessmentInput(await readObjectBody(request))
      const result = await collections.assessments.updateOne(
        { id: assessmentRoute[1] },
        {
          $set: {
            title: assessment.title,
            description: assessment.description,
            company: assessment.company,
            questions_json: assessment.questions_json,
            status: assessment.status,
            source: assessment.source,
            updated_at: now(),
          },
        },
      )
      if (!result.matchedCount) throw new HttpError(404, 'Practice mock not found.')
      return jsonResponse(response, 200, {
        assessment: toAssessment(await collections.assessments.findOne({ id: assessmentRoute[1] }), true),
      })
    }
    if (assessmentRoute && method === 'DELETE') {
      requireRole(user, 'admin')
      const result = await collections.assessments.deleteOne({ id: assessmentRoute[1] })
      if (!result.deletedCount) throw new HttpError(404, 'Practice mock not found.')
      await collections.assessment_attempts.deleteMany({ assessment_id: assessmentRoute[1] })
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/questions') {
      const filter = user.role === 'admin' ? {} : { status: 'Approved' }
      const questions = await findRows('questions', filter, { year: -1, created_at: -1 })
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
      const row = {
        id: makeId(),
        company,
        year,
        round,
        topic,
        content,
        difficulty,
        source: user.role === 'admin' ? 'Placement cell' : `Student submission — ${user.name}`,
        status: user.role === 'admin' ? 'Approved' : 'Pending review',
        created_by: user.id,
        created_at: now(),
      }
      await collections.questions.insertOne(row)
      return jsonResponse(response, 201, { question: toQuestion(row) })
    }

    const questionRoute = pathname.match(/^\/api\/questions\/([^/]+)$/)
    if (questionRoute && method === 'PATCH') {
      requireRole(user, 'admin')
      const body = await readBody(request)
      const status = body.status
      if (!['Approved', 'Pending review'].includes(status)) throw new HttpError(400, 'Choose a valid review status.')
      const result = await collections.questions.updateOne({ id: questionRoute[1] }, { $set: { status } })
      if (!result.matchedCount) throw new HttpError(404, 'Question not found.')
      return jsonResponse(response, 200, {
        question: toQuestion(await collections.questions.findOne({ id: questionRoute[1] })),
      })
    }

    if (method === 'GET' && pathname === '/api/plan') {
      requireRole(user, 'student')
      const items = await findRows('plan_items', { user_id: user.id }, { created_at: 1, week: 1 })
      return jsonResponse(response, 200, { items: items.map(withoutMongoId) })
    }

    if (method === 'POST' && pathname === '/api/plan/generate') {
      requireRole(user, 'student')
      const body = await readBody(request)
      const driveRow = await collections.drives.findOne({ id: body.driveId })
      if (!driveRow) throw new HttpError(404, 'Choose an existing placement drive to build a plan.')
      const drive = await toDrive(driveRow, user)
      const existingCount = await collections.plan_items.countDocuments({ user_id: user.id, company: drive.company })
      if (existingCount > 0) throw new HttpError(409, `A preparation plan for ${drive.company} already exists. Add or update tasks in your plan instead.`)
      const history = await findRows(
        'questions',
        { company: drive.company, status: 'Approved' },
        { year: -1, created_at: -1 },
        10,
      )
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
      const items = tasks.map((task) => ({
        id: makeId(),
        user_id: user.id,
        company: drive.company,
        ...task,
        status: 'Planned',
        created_at: now(),
      }))
      await collections.plan_items.insertMany(items)
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
      const item = {
        id: makeId(),
        user_id: user.id,
        company: requireText(body.company || 'General placement preparation', 'Target company', 120),
        week: requireText(body.week, 'Week', 80),
        goal: requireText(body.goal, 'Goal', 200),
        focus: requireText(body.focus, 'Focus', 300),
        status: 'Planned',
        created_at: now(),
      }
      await collections.plan_items.insertOne(item)
      return jsonResponse(response, 201, { item })
    }

    const planRoute = pathname.match(/^\/api\/plan\/([^/]+)$/)
    if (planRoute && method === 'PATCH') {
      requireRole(user, 'student')
      const body = await readBody(request)
      if (!['Planned', 'In progress', 'Done'].includes(body.status)) throw new HttpError(400, 'Choose a valid task status.')
      const result = await collections.plan_items.updateOne(
        { id: planRoute[1], user_id: user.id },
        { $set: { status: body.status } },
      )
      if (!result.matchedCount) throw new HttpError(404, 'Preparation task not found.')
      return jsonResponse(response, 200, {
        item: withoutMongoId(await collections.plan_items.findOne({ id: planRoute[1] })),
      })
    }

    if (planRoute && method === 'DELETE') {
      requireRole(user, 'student')
      const result = await collections.plan_items.deleteOne({ id: planRoute[1], user_id: user.id })
      if (!result.deletedCount) throw new HttpError(404, 'Preparation task not found.')
      return jsonResponse(response, 200, { success: true })
    }

    if (method === 'GET' && pathname === '/api/progress') {
      requireRole(user, 'student')
      const [skills, attempts] = await Promise.all([
        findRows('skill_progress', { user_id: user.id }, { skill: 1 }),
        findRows('mock_attempts', { user_id: user.id }, { completed_at: -1 }, 20),
      ])
      return jsonResponse(response, 200, {
        skills: skills.map(withoutMongoId),
        attempts: attempts.map(withoutMongoId),
      })
    }

    const skillRoute = pathname.match(/^\/api\/progress\/([^/]+)$/)
    if (skillRoute && method === 'PUT') {
      requireRole(user, 'student')
      const skill = decodeURIComponent(skillRoute[1])
      requireText(skill, 'Skill', 60)
      const body = await readBody(request)
      const score = Number(body.score)
      if (!Number.isInteger(score) || score < 0 || score > 100) throw new HttpError(400, 'Score must be between 0 and 100.')
      await collections.skill_progress.updateOne(
        { user_id: user.id, skill },
        { $set: { score }, $setOnInsert: { user_id: user.id, skill } },
        { upsert: true },
      )
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
      await collections.mock_attempts.insertOne({
        id: attempt.id,
        user_id: attempt.userId,
        score: attempt.score,
        total: attempt.total,
        completed_at: attempt.completedAt,
      })
      return jsonResponse(response, 201, { attempt })
    }

    if (method === 'GET' && pathname === '/api/admin/summary') {
      requireRole(user, 'admin')
      const [
        driveCount,
        openDriveCount,
        studentCount,
        registrationCount,
        pendingQuestionCount,
        publishedNoticeCount,
        studentRows,
        registrationRows,
      ] = await Promise.all([
        collections.drives.countDocuments(),
        collections.drives.countDocuments({ status: 'Open' }),
        collections.users.countDocuments({ role: 'student' }),
        collections.registrations.countDocuments(),
        collections.questions.countDocuments({ status: 'Pending review' }),
        collections.notices.countDocuments({ status: 'Published' }),
        findRows('users', { role: 'student' }, { created_at: -1 }),
        findRows('registrations', {}, { created_at: -1 }, 10),
      ])
      const students = studentRows.map((row) => ({
        id: row.id,
        email: row.email,
        name: row.name,
        profile: JSON.parse(row.profile_json),
        createdAt: row.created_at,
      }))
      const registrations = await Promise.all(registrationRows.map(async (registration) => {
        const [registeredUser, drive] = await Promise.all([
          collections.users.findOne({ id: registration.user_id }),
          collections.drives.findOne({ id: registration.drive_id }),
        ])
        return registeredUser && drive
          ? { created_at: registration.created_at, name: registeredUser.name, company: drive.company, role: drive.role }
          : null
      }))
      return jsonResponse(response, 200, {
        metrics: { driveCount, openDriveCount, studentCount, registrationCount, pendingQuestionCount, publishedNoticeCount },
        students,
        registrations: registrations.filter(Boolean),
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
  console.log(`MongoDB database: ${database.databaseName}`)
})

async function closeServer() {
  server.close(async () => {
    await client.close()
    process.exit(0)
  })
}

process.on('SIGINT', closeServer)
process.on('SIGTERM', closeServer)
