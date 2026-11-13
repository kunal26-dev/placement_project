import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { after, before, test } from 'node:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

let serverProcess
let baseUrl
let temporaryDirectory
let studentToken
let adminToken

async function availablePort() {
  const listener = createServer()
  await new Promise((resolve, reject) => {
    listener.once('error', reject)
    listener.listen(0, '127.0.0.1', resolve)
  })
  const { port } = listener.address()
  await new Promise((resolve) => listener.close(resolve))
  return port
}

async function api(path, { token, raw = false, ...options } = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers }
  if (token) headers.Authorization = `Bearer ${token}`
  const response = await fetch(`${baseUrl}/api${path}`, { ...options, headers })
  if (raw) return response
  const body = await response.json()
  return { response, body }
}

before(async () => {
  temporaryDirectory = await mkdtemp(join(tmpdir(), 'placement-platform-test-'))
  const port = await availablePort()
  baseUrl = `http://127.0.0.1:${port}`
  serverProcess = spawn(process.execPath, ['server/index.js'], {
    cwd: process.cwd(),
    env: { ...process.env, API_PORT: String(port), DATABASE_PATH: join(temporaryDirectory, 'test.db') },
    stdio: 'ignore',
  })

  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (serverProcess.exitCode !== null) throw new Error(`API process exited with code ${serverProcess.exitCode}`)
    try {
      const response = await fetch(`${baseUrl}/api/health`)
      if (response.ok) return
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
  }
  throw new Error('API did not start in time.')
})

after(async () => {
  if (serverProcess && serverProcess.exitCode === null) {
    serverProcess.kill()
    await new Promise((resolve) => serverProcess.once('exit', resolve))
  }
  if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true })
})

test('student and placement-cell workflows persist and enforce access rules', async () => {
  const registrationPayload = {
    name: 'New Test Student',
    email: 'new-student@university.edu',
    password: 'StudentTest@123',
    profile: {
      branch: 'Computer Science & Engineering',
      cgpa: 8,
      graduationYear: 2028,
      backlogs: 0,
      targetRole: 'Software Engineer',
      skills: ['Java'],
    },
  }
  const accountRegistration = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify(registrationPayload),
  })
  assert.equal(accountRegistration.response.status, 201)
  assert.equal(accountRegistration.body.user.email, registrationPayload.email)

  const duplicateRegistration = await api('/auth/register', {
    method: 'POST',
    body: JSON.stringify(registrationPayload),
  })
  assert.equal(duplicateRegistration.response.status, 409)
  assert.equal(duplicateRegistration.body.error, 'An account with this email already exists.')

  const login = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student@university.edu', password: 'Student@123' }),
  })
  assert.equal(login.response.status, 200)
  studentToken = login.body.token

  const incorrectRole = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'student@university.edu', password: 'Student@123', expectedRole: 'admin' }),
  })
  assert.equal(incorrectRole.response.status, 403)

  const dashboard = await api('/dashboard', { token: studentToken })
  assert.equal(dashboard.response.status, 200)
  assert.ok(dashboard.body.drives.length >= 4)
  assert.equal(dashboard.body.stats.registeredDrives, 1)
  assert.equal(dashboard.body.drives[0].eligibility.status, 'Eligible')

  const unauthorized = await api('/admin/summary', { token: studentToken })
  assert.equal(unauthorized.response.status, 403)

  const profile = await api('/profile', {
    token: studentToken,
    method: 'PUT',
    body: JSON.stringify({
      name: 'Aarav Sharma',
      branch: 'Computer Science & Engineering',
      cgpa: 9.1,
      graduationYear: 2028,
      backlogs: 0,
      targetRole: 'Software Engineer',
      skills: ['Java', 'SQL'],
    }),
  })
  assert.equal(profile.response.status, 200)
  assert.equal(profile.body.user.profile.cgpa, 9.1)

  const progress = await api('/progress', { token: studentToken })
  assert.ok(progress.body.skills.some((skill) => skill.skill === 'Java'))
  assert.ok(progress.body.skills.some((skill) => skill.skill === 'SQL'))

  const amazonDrive = dashboard.body.drives.find((drive) => drive.company === 'Amazon')
  const generatedPlan = await api('/plan/generate', {
    token: studentToken,
    method: 'POST',
    body: JSON.stringify({ driveId: amazonDrive.id }),
  })
  assert.equal(generatedPlan.response.status, 201)
  assert.ok(generatedPlan.body.items.length > 0)
  assert.equal(generatedPlan.body.basis.type, 'rules and recorded data')

  const duplicatePlan = await api('/plan/generate', {
    token: studentToken,
    method: 'POST',
    body: JSON.stringify({ driveId: amazonDrive.id }),
  })
  assert.equal(duplicatePlan.response.status, 409)

  const task = await api('/plan', {
    token: studentToken,
    method: 'POST',
    body: JSON.stringify({ company: 'TestCo', week: 'Week 9', goal: 'Review graphs', focus: 'BFS and DFS' }),
  })
  assert.equal(task.response.status, 201)
  const plan = await api('/plan', { token: studentToken })
  assert.ok(plan.body.items.some((item) => item.id === task.body.item.id))

  const score = await api('/progress/Data%20Structures%20%26%20Algorithms', {
    token: studentToken,
    method: 'PUT',
    body: JSON.stringify({ score: 81 }),
  })
  assert.equal(score.response.status, 200)
  assert.equal(score.body.score, 81)

  const attempt = await api('/mock-attempts', {
    token: studentToken,
    method: 'POST',
    body: JSON.stringify({ score: 4, total: 5 }),
  })
  assert.equal(attempt.response.status, 201)

  const studentNotices = await api('/notices', { token: studentToken })
  assert.equal(studentNotices.response.status, 200)
  assert.ok(studentNotices.body.notices.length >= 1)

  const adminLogin = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dbuu2026@gmail.com', password: 'dbuu2026' }),
  })
  assert.equal(adminLogin.response.status, 200)
  adminToken = adminLogin.body.token
  const coordinatorRoleMismatch = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dbuu2026@gmail.com', password: 'dbuu2026', expectedRole: 'student' }),
  })
  assert.equal(coordinatorRoleMismatch.response.status, 403)
  const incorrectPasswordRoleAttempt = await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dbuu2026@gmail.com', password: 'Incorrect@123', expectedRole: 'student' }),
  })
  assert.equal(incorrectPasswordRoleAttempt.response.status, 401)

  const summary = await api('/admin/summary', { token: adminToken })
  assert.equal(summary.response.status, 200)
  assert.ok(summary.body.metrics.studentCount >= 1)

  const newDrive = await api('/drives', {
    token: adminToken,
    method: 'POST',
    body: JSON.stringify({
      company: 'TestCo',
      role: 'Graduate Engineer',
      deadline: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
      status: 'Open',
      location: 'Campus',
      description: 'Test placement drive',
      source: 'Test fixture',
      minCgpa: 7,
      maxBacklogs: 0,
      branches: ['Computer Science & Engineering'],
      skills: ['Java'],
      stages: ['Interview'],
    }),
  })
  assert.equal(newDrive.response.status, 201)

  const registration = await api(`/drives/${newDrive.body.drive.id}/register`, {
    token: studentToken,
    method: 'POST',
  })
  assert.equal(registration.response.status, 200)
  const studentDashboard = await api('/dashboard', { token: studentToken })
  assert.ok(studentDashboard.body.drives.find((drive) => drive.id === newDrive.body.drive.id).registered)

  const forbiddenNotice = await api('/notices', {
    token: studentToken,
    method: 'POST',
    body: JSON.stringify({ title: 'Unapproved', message: 'Students cannot publish official notices.' }),
  })
  assert.equal(forbiddenNotice.response.status, 403)

  const publishedNotice = await api('/notices', {
    token: adminToken,
    method: 'POST',
    body: JSON.stringify({
      title: 'Test placement notice',
      message: 'This announcement is visible to students.',
      audience: 'students',
      source: 'Test placement cell',
      status: 'Published',
    }),
  })
  assert.equal(publishedNotice.response.status, 201)
  const updatedNotices = await api('/notices', { token: studentToken })
  assert.ok(updatedNotices.body.notices.some((notice) => notice.id === publishedNotice.body.notice.id))
  const editedNotice = await api(`/notices/${publishedNotice.body.notice.id}`, {
    token: adminToken,
    method: 'PUT',
    body: JSON.stringify({
      title: 'Updated test placement notice',
      message: 'The notice has been updated by the placement cell.',
      audience: 'students',
      source: 'Test placement cell',
      status: 'Published',
    }),
  })
  assert.equal(editedNotice.response.status, 200)
  assert.equal(editedNotice.body.notice.title, 'Updated test placement notice')

  const question = await api('/questions', {
    token: studentToken,
    method: 'POST',
    body: JSON.stringify({
      company: 'TestCo',
      year: 2025,
      round: 'Technical',
      topic: 'Graphs',
      content: 'Explain breadth-first search.',
      difficulty: 'Easy',
    }),
  })
  assert.equal(question.response.status, 201)
  assert.equal(question.body.question.status, 'Pending review')

  const approved = await api(`/questions/${question.body.question.id}`, {
    token: adminToken,
    method: 'PATCH',
    body: JSON.stringify({ status: 'Approved' }),
  })
  assert.equal(approved.response.status, 200)
  assert.equal(approved.body.question.status, 'Approved')

  const assessment = await api('/assessments', {
    token: adminToken,
    method: 'POST',
    body: JSON.stringify({
      title: 'Test mock',
      description: 'A mock used to verify server-side scoring.',
      company: 'TestCo',
      source: 'Test fixture',
      status: 'Published',
      questions: [
        { prompt: 'Choose the correct option.', options: ['First', 'Second'], answerIndex: 1 },
        { prompt: 'Another question.', options: ['Yes', 'No'], answerIndex: 0 },
      ],
    }),
  })
  assert.equal(assessment.response.status, 201)
  assert.equal(assessment.body.assessment.questions[0].answerIndex, 1)

  const studentAssessments = await api('/assessments', { token: studentToken })
  assert.equal(studentAssessments.response.status, 200)
  assert.equal(studentAssessments.body.assessments[0].questions[0].answerIndex, undefined)
  const scoredAttempt = await api(`/assessments/${assessment.body.assessment.id}/attempts`, {
    token: studentToken,
    method: 'POST',
    body: JSON.stringify({ answers: [1, 0], score: 0 }),
  })
  assert.equal(scoredAttempt.response.status, 201)
  assert.equal(scoredAttempt.body.score, 2)

  const hiddenDraft = await api('/assessments', {
    token: adminToken,
    method: 'POST',
    body: JSON.stringify({
      title: 'Draft mock',
      description: 'Not visible to students.',
      company: 'TestCo',
      source: 'Test fixture',
      status: 'Draft',
      questions: [{ prompt: 'Question?', options: ['A', 'B'], answerIndex: 0 }],
    }),
  })
  assert.equal(hiddenDraft.response.status, 201)
  const studentAssessmentsAfterDraft = await api('/assessments', { token: studentToken })
  assert.equal(studentAssessmentsAfterDraft.body.assessments.length, 1)

  const resourceBytes = Buffer.from('%PDF-1.4 test resource', 'utf8')
  const uploadedResource = await api('/resources', {
    token: adminToken,
    method: 'POST',
    body: JSON.stringify({
      title: 'Test resource',
      description: 'A downloadable PDF resource.',
      source: 'Test fixture',
      fileName: 'practice.pdf',
      mimeType: 'application/pdf',
      contentBase64: resourceBytes.toString('base64'),
    }),
  })
  assert.equal(uploadedResource.response.status, 201)
  const studentResources = await api('/resources', { token: studentToken })
  assert.ok(studentResources.body.resources.some((resource) => resource.id === uploadedResource.body.resource.id))
  const downloadResponse = await api(`/resources/${uploadedResource.body.resource.id}/download`, { token: studentToken, raw: true })
  assert.equal(downloadResponse.status, 200)
  assert.equal(downloadResponse.headers.get('content-disposition').includes('practice.pdf'), true)
  assert.deepEqual(Buffer.from(await downloadResponse.arrayBuffer()), resourceBytes)
  const unsupportedUpload = await api('/resources', {
    token: adminToken,
    method: 'POST',
    body: JSON.stringify({
      title: 'Unsupported file',
      fileName: 'payload.exe',
      contentBase64: 'YQ==',
    }),
  })
  assert.equal(unsupportedUpload.response.status, 400)
  const oversizedUpload = await api('/resources', {
    token: adminToken,
    method: 'POST',
    body: JSON.stringify({
      title: 'Oversized file',
      fileName: 'large.pdf',
      mimeType: 'application/pdf',
      contentBase64: Buffer.alloc(10 * 1024 * 1024 + 1).toString('base64'),
    }),
  })
  assert.equal(oversizedUpload.response.status, 413)

  const adminDriveUpdate = await api(`/drives/${newDrive.body.drive.id}`, {
    token: adminToken,
    method: 'PUT',
    body: JSON.stringify({
      ...newDrive.body.drive,
      minCgpa: 7.5,
      maxBacklogs: 1,
      branches: ['Computer Science & Engineering'],
      skills: ['Java', 'SQL'],
      stages: ['Assessment', 'Interview'],
    }),
  })
  assert.equal(adminDriveUpdate.response.status, 200)
  assert.equal(adminDriveUpdate.body.drive.criteria.minCgpa, 7.5)

  const logout = await api('/auth/logout', { token: studentToken, method: 'POST' })
  assert.equal(logout.response.status, 200)
  const loggedOut = await api('/dashboard', { token: studentToken })
  assert.equal(loggedOut.response.status, 401)
})
