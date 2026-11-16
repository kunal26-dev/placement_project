import { randomBytes, randomUUID, scryptSync } from 'node:crypto'
import { GridFSBucket, MongoClient } from 'mongodb'

const now = () => new Date().toISOString()
const makeId = () => randomUUID()
const safePasswordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex')

export async function connectDatabase() {
  const uri = process.env.MONGODB_URI
  if (!uri) throw new Error('MONGODB_URI must be configured before starting the API.')

  const client = new MongoClient(uri)
  await client.connect()
  const database = client.db(process.env.MONGODB_DATABASE || 'placement_platform')
  const collectionNames = [
    'users',
    'sessions',
    'drives',
    'registrations',
    'questions',
    'notices',
    'resources',
    'assessments',
    'assessment_attempts',
    'plan_items',
    'skill_progress',
    'mock_attempts',
  ]
  const collections = Object.fromEntries(
    collectionNames.map((name) => [name, database.collection(name)]),
  )

  await Promise.all([
    collections.users.createIndex({ id: 1 }, { unique: true }),
    collections.users.createIndex({ email: 1 }, { unique: true }),
    collections.sessions.createIndex({ token_hash: 1 }, { unique: true }),
    collections.sessions.createIndex({ expires_at_date: 1 }, { expireAfterSeconds: 0 }),
    collections.drives.createIndex({ id: 1 }, { unique: true }),
    collections.registrations.createIndex({ user_id: 1, drive_id: 1 }, { unique: true }),
    collections.questions.createIndex({ id: 1 }, { unique: true }),
    collections.notices.createIndex({ id: 1 }, { unique: true }),
    collections.resources.createIndex({ id: 1 }, { unique: true }),
    collections.assessments.createIndex({ id: 1 }, { unique: true }),
    collections.assessment_attempts.createIndex({ id: 1 }, { unique: true }),
    collections.plan_items.createIndex({ id: 1 }, { unique: true }),
    collections.skill_progress.createIndex({ user_id: 1, skill: 1 }, { unique: true }),
    collections.mock_attempts.createIndex({ id: 1 }, { unique: true }),
  ])

  const resourceFiles = new GridFSBucket(database, { bucketName: 'resource_files' })
  await seedDatabase(collections)
  return { client, database, collections, resourceFiles }
}

async function seedDatabase(collections) {
  if (await collections.users.countDocuments() === 0) {
    const sampleSource = 'Sample data — replace with verified placement-cell information'
    const student = {
      id: makeId(),
      email: 'student@university.edu',
      name: 'Aarav Sharma',
      role: 'student',
      password_salt: randomBytes(16).toString('hex'),
      profile_json: JSON.stringify({
        branch: 'Computer Science & Engineering',
        cgpa: 8.7,
        graduationYear: 2028,
        backlogs: 0,
        targetRole: 'Software Engineer',
        skills: ['Java', 'Python', 'SQL', 'Data Structures & Algorithms', 'React'],
      }),
      created_at: now(),
    }
    student.password_hash = safePasswordHash('Student@123', student.password_salt)
    const admin = {
      id: makeId(),
      email: 'dbuu2026@gmail.com',
      name: 'Placement Administrator',
      role: 'admin',
      password_salt: randomBytes(16).toString('hex'),
      profile_json: JSON.stringify({ department: 'Placement Cell' }),
      created_at: now(),
    }
    admin.password_hash = safePasswordHash('dbuu2026', admin.password_salt)
    await collections.users.insertMany([student, admin])

    const seedDrives = [
      {
        company: 'Microsoft',
        role: 'Software Engineer',
        deadline: '2026-11-22',
        status: 'Open',
        location: 'University campus',
        description: 'Campus hiring for software engineering roles.',
        min_cgpa: 8,
        branches_json: JSON.stringify(['Computer Science & Engineering', 'Information Technology', 'Electronics & Communication']),
        max_backlogs: 0,
        skills_json: JSON.stringify(['Data Structures & Algorithms', 'Java', 'System Design']),
        stages_json: JSON.stringify(['Online assessment', 'Technical interview 1', 'Technical interview 2', 'HR discussion']),
      },
      {
        company: 'Amazon',
        role: 'SDE Intern',
        deadline: '2026-11-28',
        status: 'Open',
        location: 'University campus',
        description: 'Internship hiring with coding and behavioral rounds.',
        min_cgpa: 8.5,
        branches_json: JSON.stringify(['Computer Science & Engineering', 'Information Technology']),
        max_backlogs: 0,
        skills_json: JSON.stringify(['Data Structures & Algorithms', 'Python', 'DBMS']),
        stages_json: JSON.stringify(['Online assessment', 'Technical interview', 'Leadership principles', 'HR discussion']),
      },
      {
        company: 'Deloitte',
        role: 'Technology Analyst',
        deadline: '2026-12-04',
        status: 'Open',
        location: 'Online + campus',
        description: 'Graduate analyst role combining technology and problem solving.',
        min_cgpa: 7.5,
        branches_json: JSON.stringify(['Computer Science & Engineering', 'Electronics & Communication', 'Electrical Engineering']),
        max_backlogs: 1,
        skills_json: JSON.stringify(['SQL', 'Java', 'Communication']),
        stages_json: JSON.stringify(['Aptitude assessment', 'Technical interview', 'HR discussion']),
      },
      {
        company: 'Infosys',
        role: 'Systems Engineer',
        deadline: '2026-12-12',
        status: 'Coming soon',
        location: 'University campus',
        description: 'Graduate engineering role with aptitude and technical assessments.',
        min_cgpa: 6.5,
        branches_json: JSON.stringify(['Computer Science & Engineering', 'Information Technology', 'Electronics & Communication']),
        max_backlogs: 2,
        skills_json: JSON.stringify(['Java', 'SQL', 'Problem solving']),
        stages_json: JSON.stringify(['Online assessment', 'Technical interview', 'HR discussion']),
      },
    ]
    const driveIds = []
    for (const drive of seedDrives) {
      const id = makeId()
      driveIds.push(id)
      await collections.drives.insertOne({
        id,
        ...drive,
        source: sampleSource,
        created_at: now(),
      })
    }

    const sampleQuestions = [
      ['Microsoft', 2025, 'Coding', 'Dynamic programming', 'Describe an approach to find the longest increasing subsequence in an array.', 'Hard'],
      ['Amazon', 2024, 'Technical interview', 'Database design', 'Explain database normalization and when you would denormalize a schema.', 'Medium'],
      ['Deloitte', 2025, 'Aptitude + technical', 'SQL joins', 'Given two related tables, explain how to return matching and non-matching rows.', 'Easy'],
      ['Infosys', 2023, 'Coding', 'Arrays', 'Describe a linear-time approach to rotate an array by k positions.', 'Medium'],
    ]
    await collections.questions.insertMany(sampleQuestions.map(([company, year, round, topic, content, difficulty]) => ({
      id: makeId(),
      company,
      year,
      round,
      topic,
      content,
      difficulty,
      source: sampleSource,
      status: 'Approved',
      created_by: null,
      created_at: now(),
    })))

    await collections.plan_items.insertMany([
      ['Week 1', 'Build a consistent DSA routine', 'Arrays, strings, and hash maps', 'In progress'],
      ['Week 2', 'Practice trees and graphs', 'Tree traversal, BFS, and DFS', 'Planned'],
      ['Week 3', 'Review core technical concepts', 'Java, SQL, and DBMS', 'Planned'],
      ['Week 4', 'Practice interview communication', 'Mock interviews and reflection', 'Planned'],
    ].map(([week, goal, focus, status]) => ({
      id: makeId(),
      user_id: student.id,
      company: 'General placement preparation',
      week,
      goal,
      focus,
      status,
      created_at: now(),
    })))

    await collections.skill_progress.insertMany([
      ['Data Structures & Algorithms', 68],
      ['Java', 78],
      ['SQL', 64],
      ['System Design', 42],
      ['Communication', 72],
    ].map(([skill, score]) => ({ user_id: student.id, skill, score })))

    await collections.registrations.insertOne({
      user_id: student.id,
      drive_id: driveIds[0],
      created_at: now(),
    })
  }

  if (await collections.notices.countDocuments() === 0) {
    const admin = await collections.users.findOne({ role: 'admin' }, { sort: { created_at: 1 } })
    if (admin) {
      await collections.notices.insertOne({
        id: makeId(),
        title: 'Welcome to Pathway',
        message: 'Placement information shown in this workspace is sample data until verified by your placement cell. Check the source label on each drive and confirm deadlines before applying.',
        audience: 'all',
        source: 'Sample notice — replace with verified placement-cell information',
        status: 'Published',
        created_by: admin.id,
        created_at: now(),
      })
    }
  }
}
