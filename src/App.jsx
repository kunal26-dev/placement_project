import { useCallback, useEffect, useMemo, useState } from 'react'
import { api, download, jsonRequest } from './api'
import './App.css'

const navigation = [
  { id: 'dashboard', label: 'Dashboard', icon: '⌂' },
  { id: 'drives', label: 'Placement drives', icon: '▦' },
  { id: 'questions', label: 'Question bank', icon: '▤' },
  { id: 'resources', label: 'Study resources', icon: '⇩' },
  { id: 'notices', label: 'Notices & updates', icon: '◉' },
  { id: 'roadmap', label: 'Preparation plan', icon: '↗' },
  { id: 'mock', label: 'Mock practice', icon: '◉' },
  { id: 'profile', label: 'My profile', icon: '◎' },
]
const currentYear = new Date().getFullYear()
const greeting = new Intl.DateTimeFormat('en', { hour: 'numeric', hour12: false }).format(new Date())
const greetingLabel = Number(greeting) < 12 ? 'Good morning' : Number(greeting) < 18 ? 'Good afternoon' : 'Good evening'

const emptyDrive = {
  company: '',
  role: '',
  deadline: '',
  status: 'Open',
  location: 'University campus',
  description: '',
  source: 'Placement cell',
  minCgpa: '',
  maxBacklogs: '',
  branches: '',
  skills: '',
  stages: '',
}

function emptyAssessment() {
  return {
    title: '',
    description: '',
    company: '',
    source: 'Placement cell',
    status: 'Draft',
    questions: [{ prompt: '', options: ['', '', '', ''], answerIndex: 0 }],
  }
}

function updateAssessmentQuestion(setForm, questionIndex, key, value) {
  setForm((current) => ({
    ...current,
    questions: current.questions.map((question, index) => index === questionIndex
      ? { ...question, [key]: value }
      : question),
  }))
}

function updateAssessmentOption(setForm, questionIndex, optionIndex, value) {
  setForm((current) => ({
    ...current,
    questions: current.questions.map((question, index) => index === questionIndex
      ? { ...question, options: question.options.map((option, currentOptionIndex) => currentOptionIndex === optionIndex ? value : option) }
      : question),
  }))
}

function initials(name = 'Student') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('')
}

function dateLabel(value) {
  if (!value) return 'Not specified'
  return new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' })
    .format(new Date(`${value.slice(0, 10)}T00:00:00`))
}

function fieldValue(_form, setForm, key, value) {
  setForm((current) => ({ ...current, [key]: value }))
}

function Alert({ message, onDismiss }) {
  if (!message) return null
  return (
    <div className="alert" role="alert">
      <span>{message}</span>
      <button type="button" className="icon-button" aria-label="Dismiss message" onClick={onDismiss}>×</button>
    </div>
  )
}

function AuthScreen({ onAuthenticated, initialError = '' }) {
  const [mode, setMode] = useState('login')
  const [accountType, setAccountType] = useState('student')
  const [form, setForm] = useState({
    name: '',
    email: '',
    password: '',
    branch: 'Computer Science & Engineering',
    cgpa: '7.5',
    graduationYear: '2028',
    backlogs: '0',
    targetRole: 'Software Engineer',
  })
  const [error, setError] = useState(initialError)
  const [busy, setBusy] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function submit(event) {
    event.preventDefault()
    setError('')
    setBusy(true)
    try {
      const registering = mode === 'register'
      const result = await api(registering ? '/auth/register' : '/auth/login', jsonRequest('POST', {
        email: form.email,
        password: form.password,
        ...(!registering ? { expectedRole: accountType === 'coordinator' ? 'admin' : 'student' } : {}),
        ...(registering ? {
          name: form.name,
          profile: {
            branch: form.branch,
            cgpa: Number(form.cgpa),
            graduationYear: Number(form.graduationYear),
            backlogs: Number(form.backlogs),
            targetRole: form.targetRole,
            skills: ['Java', 'SQL'],
          },
        } : {}),
      }))
      onAuthenticated(result)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  function fillDemo(email, password) {
    setForm((current) => ({ ...current, email, password }))
    setAccountType(email.startsWith('admin@') ? 'coordinator' : 'student')
    setMode('login')
    setError('')
  }

  return (
    <main className="auth-page">
      <div className="auth-decoration decoration-one" />
      <div className="auth-decoration decoration-two" />
      <section className="auth-card">
        <div className="brand-lockup">
          <div className="brand-mark">U<span>+</span></div>
          <div>
            <strong>Pathway</strong>
            <small>UNIVERSITY PLACEMENTS</small>
          </div>
        </div>

        <div className="auth-copy">
          <span className="eyebrow">Your next chapter starts here</span>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p>Find the right opportunities, know where you stand, and prepare with purpose.</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Account options">
          <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => { setMode('login'); setError('') }}>Sign in</button>
          {accountType === 'student' && <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => { setMode('register'); setError('') }}>Create account</button>}
        </div>

        <Alert message={error} onDismiss={() => setError('')} />
        {mode === 'login' && (
          <div className="account-type-select" aria-label="Sign in as">
            <button type="button" className={accountType === 'student' ? 'active' : ''} onClick={() => { setAccountType('student'); setError('') }}>Student</button>
            <button type="button" className={accountType === 'coordinator' ? 'active' : ''} onClick={() => { setAccountType('coordinator'); setError('') }}>Placement coordinator</button>
          </div>
        )}
        <form className="auth-form" onSubmit={submit}>
          {mode === 'register' && (
            <label>
              Full name
              <input autoComplete="name" required maxLength={100} value={form.name} onChange={(event) => fieldValue(form, setForm, 'name', event.target.value)} placeholder="Your name" />
            </label>
          )}
          <label>
            University email
            <input type="email" autoComplete="email" required value={form.email} onChange={(event) => fieldValue(form, setForm, 'email', event.target.value)} placeholder="you@university.edu" />
          </label>
          <div className="auth-password-field">
            <label htmlFor="auth-password">Password</label>
            <span className="password-input-wrap">
              <input id="auth-password" type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={8} required value={form.password} onChange={(event) => fieldValue(form, setForm, 'password', event.target.value)} placeholder="At least 8 characters" />
              <button
                type="button"
                className="password-visibility"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </span>
          </div>
          {mode === 'register' && (
            <>
              <label>
                Branch
                <select value={form.branch} onChange={(event) => fieldValue(form, setForm, 'branch', event.target.value)}>
                  <option>Computer Science & Engineering</option>
                  <option>Information Technology</option>
                  <option>Electronics & Communication</option>
                  <option>Electrical Engineering</option>
                  <option>Mechanical Engineering</option>
                </select>
              </label>
              <div className="field-pair">
                <label>CGPA<input type="number" min="0" max="10" step="0.01" required value={form.cgpa} onChange={(event) => fieldValue(form, setForm, 'cgpa', event.target.value)} /></label>
                <label>Graduation year<input type="number" min="2020" max="2040" required value={form.graduationYear} onChange={(event) => fieldValue(form, setForm, 'graduationYear', event.target.value)} /></label>
              </div>
              <label>
                Target role
                <input required value={form.targetRole} onChange={(event) => fieldValue(form, setForm, 'targetRole', event.target.value)} />
              </label>
            </>
          )}
          <button className="button button-green auth-submit" type="submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'login' ? `Sign in as ${accountType === 'coordinator' ? 'coordinator' : 'student'}` : 'Create student account'}
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <details className="demo-access">
          <summary>Open a demo account</summary>
          <p>Seeded sample accounts are provided to explore the student and placement-cell views.</p>
          <div className="demo-buttons">
            <button type="button" onClick={() => fillDemo('student@university.edu', 'Student@123')}>Use student demo</button>
            <button type="button" onClick={() => fillDemo('admin@university.edu', 'Admin@123')}>Use admin demo</button>
          </div>
        </details>
        <p className="auth-footnote">Demo data is illustrative and not verified university placement information.</p>
      </section>
      <aside className="auth-side">
        <div className="auth-side-content">
          <div className="side-symbol">↗</div>
          <span className="eyebrow">Make your next move count</span>
          <h2>One place to go from opportunity to offer.</h2>
          <div className="side-points">
            <div><span>01</span><p>Discover drives that fit your profile</p></div>
            <div><span>02</span><p>See eligibility rules, not guesswork</p></div>
            <div><span>03</span><p>Build a plan and track your progress</p></div>
          </div>
        </div>
        <span className="side-caption">Built for students. Clear for coordinators.</span>
      </aside>
    </main>
  )
}

function App() {
  const [user, setUser] = useState(null)
  const [token, setToken] = useState(() => localStorage.getItem('placement-token'))
  const [dashboard, setDashboard] = useState(null)
  const [screen, setScreen] = useState('dashboard')
  const [questions, setQuestions] = useState([])
  const [resources, setResources] = useState([])
  const [assessments, setAssessments] = useState([])
  const [notices, setNotices] = useState([])
  const [plan, setPlan] = useState([])
  const [adminSummary, setAdminSummary] = useState(null)
  const [loading, setLoading] = useState(Boolean(localStorage.getItem('placement-token')))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const withToken = useCallback((path, options = {}) => api(path, { ...options, token }), [token])

  const loadDashboard = useCallback(async () => {
    const data = await withToken('/dashboard')
    setDashboard(data)
    setUser(data.user)
    if (data.user.role === 'admin') {
      setAdminSummary(await withToken('/admin/summary'))
    }
  }, [withToken])

  useEffect(() => {
    let active = true
    async function restoreSession() {
      if (!token) {
        setLoading(false)
        return
      }
      try {
        const result = await api('/auth/me', { token })
        if (active) {
          setUser(result.user)
          await loadDashboard()
        }
      } catch (requestError) {
        if (active) {
          setUser(null)
          if (requestError.status === 401) {
            localStorage.removeItem('placement-token')
            setToken(null)
          } else {
            setError(requestError.message)
          }
        }
      } finally {
        if (active) setLoading(false)
      }
    }
    restoreSession()
    return () => { active = false }
  }, [loadDashboard, token])

  useEffect(() => {
    if (!user || screen !== 'questions') return
    withToken('/questions')
      .then((result) => setQuestions(result.questions))
      .catch((requestError) => setError(requestError.message))
  }, [screen, user, withToken])

  useEffect(() => {
    if (!user || screen !== 'resources') return
    withToken('/resources')
      .then((result) => setResources(result.resources))
      .catch((requestError) => setError(requestError.message))
  }, [screen, user, withToken])

  useEffect(() => {
    if (!user || screen !== 'mock') return
    withToken('/assessments')
      .then((result) => setAssessments(result.assessments))
      .catch((requestError) => setError(requestError.message))
  }, [screen, user, withToken])

  useEffect(() => {
    if (!user || screen !== 'notices') return
    withToken('/notices')
      .then((result) => setNotices(result.notices))
      .catch((requestError) => setError(requestError.message))
  }, [screen, user, withToken])

  useEffect(() => {
    if (!user || screen !== 'roadmap') return
    withToken('/plan')
      .then((result) => setPlan(result.items))
      .catch((requestError) => setError(requestError.message))
  }, [screen, user, withToken])

  useEffect(() => {
    if (!user || user.role !== 'admin' || screen !== 'admin') return
    withToken('/admin/summary')
      .then((result) => setAdminSummary(result))
      .catch((requestError) => setError(requestError.message))
  }, [screen, user, withToken])

  const dismissMessages = () => {
    setError('')
    setNotice('')
  }

  async function handleAuthenticated(result) {
    localStorage.setItem('placement-token', result.token)
    setToken(result.token)
    setUser(result.user)
    setLoading(true)
    try {
      await loadDashboard()
      setScreen('dashboard')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setLoading(false)
    }
  }

  async function logout() {
    try {
      await withToken('/auth/logout', { method: 'POST' })
    } catch {
      // Clear the local session even if the API is temporarily unavailable.
    }
    localStorage.removeItem('placement-token')
    setToken(null)
    setUser(null)
    setDashboard(null)
    setScreen('dashboard')
  }

  async function refreshDashboard(message) {
    await loadDashboard()
    if (message) setNotice(message)
  }

  async function registerForDrive(drive) {
    setBusy(true)
    try {
      await withToken(`/drives/${drive.id}/register`, { method: 'POST' })
      await refreshDashboard(`Registration saved for ${drive.company}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function unregisterFromDrive(drive) {
    setBusy(true)
    try {
      await withToken(`/drives/${drive.id}/register`, { method: 'DELETE' })
      await refreshDashboard(`Registration withdrawn for ${drive.company}.`)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function saveProfile(profile) {
    setBusy(true)
    try {
      const result = await withToken('/profile', jsonRequest('PUT', profile))
      setUser(result.user)
      await refreshDashboard('Your profile has been updated.')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function updatePlanItem(item, status) {
    try {
      const result = await withToken(`/plan/${item.id}`, jsonRequest('PATCH', { status }))
      setPlan((current) => current.map((planItem) => planItem.id === item.id ? result.item : planItem))
      await loadDashboard()
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createPlanItem(form) {
    setBusy(true)
    try {
      await withToken('/plan', jsonRequest('POST', form))
      const result = await withToken('/plan')
      setPlan(result.items)
      await loadDashboard()
      setNotice('Preparation task added to your plan.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function generatePlanForDrive(driveId) {
    setBusy(true)
    try {
      const result = await withToken('/plan/generate', jsonRequest('POST', { driveId }))
      const planResult = await withToken('/plan')
      setPlan(planResult.items)
      await loadDashboard()
      setNotice(`Generated ${result.items.length} preparation tasks using the recorded ${result.basis.type} for ${result.items[0]?.company || 'your target company'}.`)
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function createQuestion(form) {
    setBusy(true)
    try {
      const result = await withToken('/questions', jsonRequest('POST', form))
      const list = await withToken('/questions')
      setQuestions(list.questions)
      setNotice(result.question.status === 'Approved' ? 'Question added to the repository.' : 'Question submitted for placement-cell review.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function reviewQuestion(question, status) {
    try {
      await withToken(`/questions/${question.id}`, jsonRequest('PATCH', { status }))
      const result = await withToken('/questions')
      setQuestions(result.questions)
      if (user.role === 'admin') {
        const summary = await withToken('/admin/summary')
        setAdminSummary(summary)
      }
      setNotice(`Question marked ${status.toLowerCase()}.`)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  async function createNotice(form) {
    setBusy(true)
    try {
      await withToken('/notices', jsonRequest('POST', form))
      const result = await withToken('/notices')
      setNotices(result.notices)
      const summary = await withToken('/admin/summary')
      setAdminSummary(summary)
      await loadDashboard()
      setNotice('Placement notice published.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function saveNotice(noticeId, form) {
    setBusy(true)
    try {
      await withToken(`/notices/${noticeId}`, jsonRequest('PUT', form))
      const result = await withToken('/notices')
      setNotices(result.notices)
      await loadDashboard()
      setNotice('Placement notice updated.')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setBusy(false)
    }
  }

  async function deleteNotice(notice) {
    try {
      await withToken(`/notices/${notice.id}`, { method: 'DELETE' })
      const result = await withToken('/notices')
      setNotices(result.notices)
      const summary = await withToken('/admin/summary')
      setAdminSummary(summary)
      setNotice('Notice removed.')
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  if (loading) {
    return <div className="loading-screen"><div className="loading-mark">U<span>+</span></div><p>Loading your placement workspace…</p></div>
  }

  if (!user) return <AuthScreen onAuthenticated={handleAuthenticated} initialError={error} />

  const isAdmin = user.role === 'admin'
  const currentNav = isAdmin
    ? [navigation[0], navigation[1], navigation[2], navigation[3], navigation[4], navigation[6], { id: 'admin', label: 'Placement cell', icon: '▣' }]
    : navigation

  return (
    <div className="workspace">
      <aside className="sidebar">
        <a className="brand-lockup sidebar-brand" href="#dashboard" onClick={(event) => { event.preventDefault(); setScreen('dashboard') }}>
          <div className="brand-mark">U<span>+</span></div>
          <div><strong>Pathway</strong><small>PLACEMENT INTELLIGENCE</small></div>
        </a>
        <div className="workspace-label">WORKSPACE</div>
        <nav className="side-nav" aria-label="Main navigation">
          {currentNav.map((item) => (
            <button key={item.id} type="button" className={`side-nav-link ${screen === item.id ? 'active' : ''}`} onClick={() => { setScreen(item.id); dismissMessages() }}>
              <span className="nav-icon" aria-hidden="true">{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'drives' && dashboard?.stats.openDrives > 0 && <span className="nav-count">{dashboard.stats.openDrives}</span>}
            </button>
          ))}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-help">
          <div className="help-mark">?</div>
          <strong>Need a hand?</strong>
          <p>Reach out to your placement coordinator for drive or profile help.</p>
        </div>
        <button type="button" className="user-switch" onClick={logout}>
          <span className="avatar avatar-small">{initials(user.name)}</span>
          <span className="user-switch-copy"><strong>{user.name}</strong><small>{isAdmin ? 'Placement administrator' : 'Student account'}</small></span>
          <span className="logout-icon" aria-hidden="true">↪</span>
        </button>
      </aside>

      <div className="main-column">
        <header className="workspace-header">
          <div className="breadcrumb"><span>Workspace</span><span className="breadcrumb-separator">/</span><strong>{currentNav.find((item) => item.id === screen)?.label || 'Dashboard'}</strong></div>
          <div className="header-actions">
            <span className="live-indicator"><i /> Live workspace</span>
            <button className="header-avatar" type="button" onClick={() => setScreen(isAdmin ? 'admin' : 'profile')} aria-label="Open account">{initials(user.name)}</button>
          </div>
        </header>

        <main className="page-content">
          <Alert message={error} onDismiss={() => setError('')} />
          {notice && <div className="notice" role="status"><span>✓</span>{notice}<button type="button" className="icon-button" aria-label="Dismiss message" onClick={() => setNotice('')}>×</button></div>}

          {screen === 'dashboard' && (
            <Dashboard
              user={user}
              dashboard={dashboard}
              adminSummary={adminSummary}
              onOpenScreen={setScreen}
              onRegister={registerForDrive}
              onUnregister={unregisterFromDrive}
              notices={dashboard?.notices || []}
              busy={busy}
            />
          )}
          {screen === 'drives' && (
            <DrivesPage
              drives={dashboard?.drives || []}
              onRegister={registerForDrive}
              onUnregister={unregisterFromDrive}
              onReload={() => refreshDashboard('Placement drives refreshed.')}
              busy={busy}
              isAdmin={isAdmin}
              onError={setError}
              token={token}
            />
          )}
          {screen === 'questions' && (
            <QuestionsPage
              questions={questions}
              isAdmin={isAdmin}
              busy={busy}
              onSubmit={createQuestion}
              onReview={reviewQuestion}
              onResourcesClick={() => setScreen('resources')}
            />
          )}
          {screen === 'resources' && (
            <ResourcesPage
              resources={resources}
              isAdmin={isAdmin}
              withToken={withToken}
              onError={setError}
              onChanged={(items) => setResources(items)}
            />
          )}
          {screen === 'notices' && (
            <NoticesPage
              notices={notices}
              isAdmin={isAdmin}
              busy={busy}
              onPublish={createNotice}
              onSave={saveNotice}
              onDelete={deleteNotice}
            />
          )}
          {screen === 'roadmap' && !isAdmin && (
            <RoadmapPage
              plan={plan}
              drives={dashboard?.drives || []}
              busy={busy}
              onCreate={createPlanItem}
              onGenerate={generatePlanForDrive}
              onStatusChange={updatePlanItem}
            />
          )}
          {screen === 'mock' && (
            <MockPractice
              isAdmin={isAdmin}
              attempts={dashboard?.attempts || []}
              assessments={assessments}
              onAssessmentsChanged={setAssessments}
              onError={setError}
              onSaved={loadDashboard}
              withToken={withToken}
            />
          )}
          {screen === 'profile' && !isAdmin && (
            <ProfilePage user={user} busy={busy} onSave={saveProfile} skills={dashboard?.skills || []} onError={setError} withToken={withToken} onSkillsSaved={loadDashboard} />
          )}
          {screen === 'admin' && isAdmin && (
            <AdminPage
              summary={adminSummary}
              drives={dashboard?.drives || []}
              onDriveChanged={async (message) => { await loadDashboard(); setAdminSummary(await withToken('/admin/summary')); setNotice(message) }}
              withToken={withToken}
              onError={setError}
            />
          )}
        </main>
      </div>
    </div>
  )
}

function PageHeading({ eyebrow, title, description, action }) {
  return (
    <div className="page-heading">
      <div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
      {action}
    </div>
  )
}

function Dashboard({ user, dashboard, adminSummary, notices, onOpenScreen, onRegister, onUnregister, busy }) {
  const stats = dashboard?.stats || {}
  const openDrives = (dashboard?.drives || []).filter((drive) => drive.status === 'Open').slice(0, 3)
  const completion = stats.totalTasks ? Math.round((stats.completedTasks / stats.totalTasks) * 100) : 0
  const adminMetrics = adminSummary?.metrics || {}
  const displayedStats = user.role === 'admin'
    ? [
        { label: 'Open opportunities', value: adminMetrics.openDriveCount ?? 0, note: 'Accepting applications', icon: '↗', tone: 'green' },
        { label: 'Student accounts', value: adminMetrics.studentCount ?? 0, note: 'Registered in the platform', icon: '◎', tone: 'gray' },
        { label: 'Drive registrations', value: adminMetrics.registrationCount ?? 0, note: 'Student applications', icon: '▣', tone: 'gray' },
        { label: 'Questions to review', value: adminMetrics.pendingQuestionCount ?? 0, note: 'Awaiting placement-cell review', icon: '▤', tone: 'gray' },
      ]
    : [
        { label: 'Open opportunities', value: stats.openDrives ?? 0, note: 'Accepting applications', icon: '↗', tone: 'green' },
        { label: 'Eligible for', value: stats.eligibleDrives ?? 0, note: 'Based on your profile', icon: '✓', tone: 'gray' },
        { label: 'Applications', value: stats.registeredDrives ?? 0, note: 'Drives you joined', icon: '▣', tone: 'gray' },
        { label: 'Plan progress', value: `${completion}%`, note: `${stats.completedTasks ?? 0} tasks completed`, icon: '◷', tone: 'gray' },
      ]
  return (
    <>
      <section className="welcome-strip">
        <div>
          <span className="eyebrow">{user.role === 'admin' ? 'PLACEMENT CELL WORKSPACE' : 'YOUR PLACEMENT JOURNEY'}</span>
          <h1>{user.role === 'admin' ? 'Good to have you here.' : `${greetingLabel}, ${user.name.split(' ')[0]}.`}</h1>
          <p>{user.role === 'admin' ? 'Keep opportunities and student preparation moving forward.' : 'A little progress today moves you closer to the right opportunity.'}</p>
        </div>
        <div className="welcome-date"><span>ACADEMIC YEAR</span><strong>{user.profile?.graduationYear ? `${user.profile.graduationYear - 4} — ${user.profile.graduationYear}` : '2026 — 2027'}</strong><span className="welcome-spark">↗</span></div>
        <div className="welcome-decoration">P</div>
      </section>

      <section className="stat-grid" aria-label="Placement summary">
        {displayedStats.map((stat) => <StatCard key={stat.label} {...stat} />)}
      </section>

      {user.role === 'admin' ? (
        <section className="dashboard-grid">
          <div className="panel panel-large">
            <div className="panel-heading"><div><span className="eyebrow">PLACEMENT CELL</span><h2>Placement operations</h2></div><button className="text-button" type="button" onClick={() => onOpenScreen('admin')}>Open admin workspace →</button></div>
            <p className="panel-description">Manage upcoming drives, review student submissions, and see registration activity.</p>
            <div className="shortcut-grid">
              <button type="button" onClick={() => onOpenScreen('drives')}><span>＋</span><strong>Manage drives</strong><small>Create and update campus opportunities</small></button>
              <button type="button" onClick={() => onOpenScreen('questions')}><span>▤</span><strong>Review questions</strong><small>Check submissions and update the repository</small></button>
              <button type="button" onClick={() => onOpenScreen('admin')}><span>◎</span><strong>Student overview</strong><small>View student profiles and registrations</small></button>
            </div>
          </div>
          <div className="panel">
            <div className="panel-heading"><div><span className="eyebrow">DATA TRANSPARENCY</span><h2>Source labels</h2></div></div>
            <p className="panel-description">Each opportunity and question carries a source label. Sample records are marked and should be replaced with verified placement-cell information.</p>
            <button type="button" className="button button-outline" onClick={() => onOpenScreen('admin')}>Review records <span>→</span></button>
          </div>
        </section>
      ) : (
        <>
          <section className="dashboard-grid">
            <div className="panel panel-large">
              <div className="panel-heading"><div><span className="eyebrow">A GOOD FIT, AT A GLANCE</span><h2>Opportunities for you</h2></div><button className="text-button" type="button" onClick={() => onOpenScreen('drives')}>All opportunities →</button></div>
              <div className="opportunity-list">
                {openDrives.map((drive) => (
                  <article className="opportunity-row" key={drive.id}>
                    <CompanyMark name={drive.company} />
                    <div className="opportunity-copy"><strong>{drive.company}</strong><span>{drive.role}</span></div>
                    <EligibilityBadge status={drive.eligibility.status} />
                    <span className="deadline-copy">Closes {dateLabel(drive.deadline)}</span>
                    {drive.registered ? <button className="registered-label link-button" type="button" disabled={busy} onClick={() => onUnregister(drive)}>✓ Registered · Withdraw</button> : drive.eligibility.status === 'Eligible' && <button className="small-button" type="button" disabled={busy} onClick={() => onRegister(drive)}>Apply</button>}
                  </article>
                ))}
                {openDrives.length === 0 && <EmptyState title="No open drives right now" description="New placement opportunities will appear here." />}
              </div>
            </div>
            <div className="panel readiness-panel">
              <div className="panel-heading"><div><span className="eyebrow">PREPARATION CHECK-IN</span><h2>Skills in focus</h2></div><button type="button" className="plain-icon-button" onClick={() => onOpenScreen('profile')} aria-label="Edit profile">↗</button></div>
              <SkillBars skills={dashboard?.skills || []} compact />
              <button className="text-button readiness-link" type="button" onClick={() => onOpenScreen('profile')}>Update skill progress <span>→</span></button>
            </div>
          </section>

          <section className="dashboard-grid lower-grid">
            <div className="panel">
              <div className="panel-heading"><div><span className="eyebrow">YOUR NEXT STEPS</span><h2>Preparation plan</h2></div><button className="text-button" type="button" onClick={() => onOpenScreen('roadmap')}>View plan →</button></div>
              <div className="mini-plan-list">
                {(dashboard?.plan || []).slice(0, 3).map((item) => (
                  <div className="mini-plan-item" key={item.id}><span className={`task-check ${item.status === 'Done' ? 'checked' : ''}`}>{item.status === 'Done' ? '✓' : ''}</span><div><strong>{item.goal}</strong><small>{item.week} · {item.focus}</small></div><span className={`task-status status-${item.status.toLowerCase().replace(' ', '-')}`}>{item.status}</span></div>
                ))}
                {!dashboard?.plan?.length && <EmptyState title="Your plan is ready to build" description="Add a few focused tasks to get started." />}
              </div>
            </div>
            <div className="panel">
              <div className="panel-heading"><div><span className="eyebrow">FROM THE ARCHIVE</span><h2>Recent questions</h2></div><button className="text-button" type="button" onClick={() => onOpenScreen('questions')}>Browse →</button></div>
              <div className="recent-question-list">
                {(dashboard?.questions || []).slice(0, 3).map((question) => <div className="recent-question" key={question.id}><span className="question-topic-icon">Q</span><div><strong>{question.topic}</strong><small>{question.company} · {question.round}</small></div><span className={`difficulty-tag difficulty-${question.difficulty.toLowerCase()}`}>{question.difficulty}</span></div>)}
                {!dashboard?.questions?.length && <EmptyState title="No questions yet" description="Explore the question bank to add practice material." />}
              </div>
            </div>
            <div className="panel">
              <div className="panel-heading"><div><span className="eyebrow">PLACEMENT CELL UPDATES</span><h2>Notices</h2></div><button className="text-button" type="button" onClick={() => onOpenScreen('notices')}>All notices →</button></div>
              <NoticePreview notices={dashboard?.notices || notices || []} />
            </div>
          </section>
        </>
      )}
      <footer className="page-footer"><span>Pathway Placement Intelligence</span><span>Eligibility is calculated from recorded criteria only. Always confirm official requirements with your placement cell.</span></footer>
    </>
  )
}

function StatCard({ label, value, note, icon, tone }) {
  return <article className="stat-card"><span className={`stat-icon ${tone}`}>{icon}</span><div className="stat-copy"><span>{label}</span><strong>{value}</strong><small>{note}</small></div><span className="stat-trend">↗</span></article>
}

function CompanyMark({ name }) {
  const initials = name.split(/\s+/).map((part) => part[0]).join('').slice(0, 2)
  return <span className="company-mark" aria-hidden="true">{initials}</span>
}

function EligibilityBadge({ status }) {
  const className = status === 'Eligible' ? 'good' : status === 'Not eligible' ? 'bad' : 'uncertain'
  return <span className={`eligibility-badge ${className}`}><i />{status}</span>
}

function EmptyState({ title, description }) {
  return <div className="empty-state"><span>◎</span><strong>{title}</strong><p>{description}</p></div>
}

function DrivesPage({ drives, onRegister, onUnregister, onReload, busy, isAdmin, onError, token }) {
  const [query, setQuery] = useState('')
  const [eligibilityFilter, setEligibilityFilter] = useState('All eligibility')
  const [statusFilter, setStatusFilter] = useState('All drives')
  const filtered = useMemo(() => drives.filter((drive) => {
    const matchesText = `${drive.company} ${drive.role} ${(drive.criteria?.skills || []).join(' ')}`.toLowerCase().includes(query.toLowerCase())
    const matchesEligibility = eligibilityFilter === 'All eligibility' || drive.eligibility.status === eligibilityFilter
    const matchesStatus = statusFilter === 'All drives' || drive.status === statusFilter
    return matchesText && matchesEligibility && matchesStatus
  }), [drives, eligibilityFilter, query, statusFilter])

  async function removeDrive(drive) {
    if (!window.confirm(`Remove the ${drive.company} placement drive? Existing registrations will also be removed.`)) return
    try {
      await api(`/drives/${drive.id}`, { method: 'DELETE', token })
      await onReload()
    } catch (error) {
      onError(error.message)
    }
  }

  return (
    <>
      <PageHeading eyebrow="OPPORTUNITIES" title="Placement drives" description="Explore upcoming opportunities and understand the criteria before you apply." action={<span className="heading-count">{drives.length} opportunities</span>} />
      <div className="filter-toolbar">
        <label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Search company or role" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search company, role, or skill" /></label>
        <select aria-label="Filter eligibility" value={eligibilityFilter} onChange={(event) => setEligibilityFilter(event.target.value)}><option>All eligibility</option><option>Eligible</option><option>Not eligible</option><option>Cannot confirm</option></select>
        <select aria-label="Filter drive status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>All drives</option><option>Open</option><option>Closed</option><option>Coming soon</option></select>
      </div>
      <div className="drive-grid">
        {filtered.map((drive) => (
          <article className="drive-card-full panel" key={drive.id}>
            <div className="drive-card-top"><CompanyMark name={drive.company} /><span className={`drive-status status-${drive.status.toLowerCase().replace(' ', '-')}`}>{drive.status}</span>{isAdmin && <button className="icon-button drive-delete" aria-label={`Delete ${drive.company}`} type="button" onClick={() => removeDrive(drive)}>×</button>}</div>
            <div className="drive-company-title"><h2>{drive.company}</h2><span>{drive.role}</span></div>
            <p className="drive-description">{drive.description}</p>
            <div className="drive-facts"><span><small>Application deadline</small><strong>{dateLabel(drive.deadline)}</strong></span><span><small>Location</small><strong>{drive.location}</strong></span></div>
            <div className="drive-criteria">
              <div className="criteria-title"><strong>Recorded eligibility</strong><EligibilityBadge status={drive.eligibility.status} /></div>
              {drive.eligibility.reasons.map((item) => <div className="criteria-row" key={item.criterion}><span>{item.criterion}</span><span className={item.meets ? 'text-good' : 'text-muted'}>{item.result}</span></div>)}
            </div>
              {drive.criteria.skills.length > 0 && <div className="drive-prep-gap"><strong>Preparation focus</strong><span>{drive.eligibility.missingSkills.length ? `Skills to strengthen: ${drive.eligibility.missingSkills.join(', ')}` : 'Your listed skills match the recorded focus areas.'}</span><div className="tag-row">{drive.criteria.skills.map((skill) => <span className="soft-tag" key={skill}>{skill}</span>)}</div></div>}
              {drive.stages.length > 0 && <div className="drive-stages"><strong>Selection stages</strong><span>{drive.stages.join(' → ')}</span></div>}
              <div className="drive-card-bottom"><span className="source-label">ⓘ {drive.source}</span>{drive.registered ? <button className="registered-label link-button" type="button" disabled={busy} onClick={() => onUnregister(drive)}>✓ Registered · Withdraw</button> : !isAdmin && drive.status === 'Open' && <button type="button" disabled={busy || drive.eligibility.status !== 'Eligible'} className="button button-green button-small" onClick={() => onRegister(drive)}>{drive.eligibility.status === 'Eligible' ? 'Register' : 'Not eligible'}</button>}</div>
          </article>
        ))}
        {!filtered.length && <div className="panel full-span"><EmptyState title="No matching drives" description="Try another search or clear one of the filters." /></div>}
      </div>
    </>
  )
}

function QuestionsPage({ questions, isAdmin, busy, onSubmit, onReview, onResourcesClick }) {
  const [query, setQuery] = useState('')
  const [company, setCompany] = useState('All companies')
  const [year, setYear] = useState('All years')
  const [round, setRound] = useState('All rounds')
  const [topic, setTopic] = useState('All topics')
  const [difficulty, setDifficulty] = useState('All levels')
  const [showForm, setShowForm] = useState(false)
  const companies = useMemo(() => ['All companies', ...new Set(questions.map((question) => question.company))], [questions])
  const years = useMemo(() => ['All years', ...new Set(questions.map((question) => String(question.year)))], [questions])
  const rounds = useMemo(() => ['All rounds', ...new Set(questions.map((question) => question.round))], [questions])
  const topics = useMemo(() => ['All topics', ...new Set(questions.map((question) => question.topic))], [questions])
  const filtered = useMemo(() => questions.filter((question) => {
    const matchesQuery = `${question.company} ${question.topic} ${question.content} ${question.round}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery
      && (company === 'All companies' || question.company === company)
      && (year === 'All years' || String(question.year) === year)
      && (round === 'All rounds' || question.round === round)
      && (topic === 'All topics' || question.topic === topic)
      && (difficulty === 'All levels' || question.difficulty === difficulty)
  }), [company, difficulty, query, questions, round, topic, year])

  return (
    <>
      <PageHeading eyebrow="LEARN FROM EXPERIENCE" title="Question bank" description="Explore past assessment topics and interview prompts. Source labels show where records came from." action={<div className="question-actions"><button className="button button-outline" type="button" onClick={onResourcesClick}>Browse downloadable files</button><button className="button button-green" type="button" onClick={() => setShowForm(!showForm)}>{showForm ? 'Close form' : '＋ Add a question'}</button></div>} />
      {showForm && <QuestionForm busy={busy} onSubmit={async (form) => { if (await onSubmit(form)) setShowForm(false) }} />}
      <section className="panel question-bank-panel">
        <div className="filter-toolbar question-filters">
          <label className="search-field"><span aria-hidden="true">⌕</span><input aria-label="Search questions" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search topic, company, or question" /></label>
          <select aria-label="Filter company" value={company} onChange={(event) => setCompany(event.target.value)}>{companies.map((option) => <option key={option}>{option}</option>)}</select>
          <select aria-label="Filter year" value={year} onChange={(event) => setYear(event.target.value)}>{years.map((option) => <option key={option}>{option}</option>)}</select>
          <select aria-label="Filter round" value={round} onChange={(event) => setRound(event.target.value)}>{rounds.map((option) => <option key={option}>{option}</option>)}</select>
          <select aria-label="Filter topic" value={topic} onChange={(event) => setTopic(event.target.value)}>{topics.map((option) => <option key={option}>{option}</option>)}</select>
          <select aria-label="Filter difficulty" value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option>All levels</option><option>Easy</option><option>Medium</option><option>Hard</option></select>
        </div>
        <div className="question-results-label"><strong>{filtered.length} questions</strong><span>{isAdmin ? 'Includes submissions awaiting review' : 'Student submissions are reviewed before appearing here'}</span></div>
        <div className="question-bank-grid">
          {filtered.map((question) => (
            <article className="question-card" key={question.id}>
              <div className="question-card-head"><span className="soft-tag">{question.company}</span><span className={`difficulty-tag difficulty-${question.difficulty.toLowerCase()}`}>{question.difficulty}</span></div>
              <span className="eyebrow">{question.round} · {question.year}</span>
              <h2>{question.topic}</h2>
              <p>{question.content}</p>
              <div className="question-card-bottom"><span className="source-label">ⓘ {question.source}</span>{question.status === 'Pending review' ? <span className="review-label">Pending review</span> : <span className="approved-label">✓ Reviewed</span>}</div>
              {isAdmin && question.status === 'Pending review' && <button className="button button-green button-small review-button" type="button" onClick={() => onReview(question, 'Approved')}>Approve submission</button>}
            </article>
          ))}
          {!filtered.length && <div className="full-span"><EmptyState title="No questions found" description="Try a different search, or add a new question to the repository." /></div>}
        </div>
      </section>
    </>
  )
}

function NoticePreview({ notices }) {
  const visibleNotices = notices.slice(0, 3)
  if (!visibleNotices.length) return <EmptyState title="No new notices" description="Placement-cell updates will appear here." />
  return (
    <div className="notice-preview-list">
      {visibleNotices.map((notice) => (
        <article className="notice-preview" key={notice.id}>
          <span className="notice-marker">↗</span>
          <div><strong>{notice.title}</strong><p>{notice.message}</p><small>{notice.source} · {dateLabel(notice.created_at || notice.createdAt)}</small></div>
        </article>
      ))}
    </div>
  )
}

function ResourcesPage({ resources, isAdmin, withToken, onError, onChanged }) {
  const [form, setForm] = useState({ title: '', description: '', source: 'Placement cell' })
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  const [fileInputKey, setFileInputKey] = useState(0)

  async function submit(event) {
    event.preventDefault()
    if (!file) {
      onError('Choose a resource file to upload.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      onError('Files must be 10 MB or smaller.')
      return
    }
    setBusy(true)
    try {
      const bytes = new Uint8Array(await file.arrayBuffer())
      let binary = ''
      for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
      }
      await withToken('/resources', jsonRequest('POST', {
        ...form,
        fileName: file.name,
        mimeType: file.type,
        contentBase64: btoa(binary),
      }))
      const result = await withToken('/resources')
      onChanged(result.resources)
      setForm({ title: '', description: '', source: 'Placement cell' })
      setFile(null)
      setFileInputKey((key) => key + 1)
    } catch (requestError) {
      onError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function downloadFile(resource) {
    try {
      const blob = await download(`/resources/${resource.id}/download`)
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = resource.fileName
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (requestError) {
      onError(requestError.message)
    }
  }

  async function deleteResource(resource) {
    if (!window.confirm(`Remove "${resource.title}" from the resource library?`)) return
    try {
      await withToken(`/resources/${resource.id}`, { method: 'DELETE' })
      onChanged(resources.filter((item) => item.id !== resource.id))
    } catch (requestError) {
      onError(requestError.message)
    }
  }

  return (
    <>
      <PageHeading
        eyebrow={isAdmin ? 'PLACEMENT CELL LIBRARY' : 'STUDY MATERIALS'}
        title="Study resources"
        description={isAdmin ? 'Upload verified question papers, guides, spreadsheets, and other placement materials.' : 'View and download placement-cell files in common document formats.'}
        action={<span className="heading-count">{resources.length} files</span>}
      />
      {isAdmin && (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-heading"><div><span className="eyebrow">RESOURCE LIBRARY</span><h2>Upload a study file</h2></div></div>
          <div className="form-grid">
            <label>Title<input required maxLength={120} value={form.title} onChange={(event) => fieldValue(form, setForm, 'title', event.target.value)} /></label>
            <label>Source label<input required maxLength={200} value={form.source} onChange={(event) => fieldValue(form, setForm, 'source', event.target.value)} /></label>
            <label className="form-wide">Description<textarea maxLength={500} rows="2" value={form.description} onChange={(event) => fieldValue(form, setForm, 'description', event.target.value)} /></label>
            <label className="form-wide">File (PDF, Word, Excel, PowerPoint, CSV, Markdown, or text; max 10 MB)
              <input key={fileInputKey} required type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.md,.txt" onChange={(event) => setFile(event.target.files?.[0] || null)} />
            </label>
          </div>
          <button type="submit" className="button button-green" disabled={busy}>{busy ? 'Uploading…' : 'Upload resource'}</button>
        </form>
      )}
      <section className="resource-grid">
        {resources.map((resource) => (
          <article className="panel resource-card" key={resource.id}>
            <div className="resource-file-mark">{resource.fileName.split('.').pop().toUpperCase().slice(0, 4)}</div>
            <div className="resource-card-copy">
              <span className="eyebrow">{resource.source}</span>
              <h2>{resource.title}</h2>
              <p>{resource.description || resource.fileName}</p>
              <small>{resource.fileName} · {(resource.fileSize / (1024 * 1024)).toFixed(resource.fileSize >= 1024 * 1024 ? 1 : 2)} MB</small>
            </div>
            <div className="resource-actions"><button type="button" className="button button-outline" onClick={() => downloadFile(resource)}>Download</button>{isAdmin && <button type="button" className="table-action" onClick={() => deleteResource(resource)}>Remove</button>}</div>
          </article>
        ))}
        {!resources.length && <div className="panel"><EmptyState title="No resources yet" description={isAdmin ? 'Upload a file to make placement materials available to students.' : 'The placement cell has not shared any files yet.'} /></div>}
      </section>
    </>
  )
}

function NoticesPage({ notices, isAdmin, busy, onPublish, onSave, onDelete }) {
  const [showForm, setShowForm] = useState(false)
  const [editingNotice, setEditingNotice] = useState('')
  const [form, setForm] = useState({ title: '', message: '', audience: 'all', source: 'Placement cell' })

  async function submit(event) {
    event.preventDefault()
    const saved = editingNotice ? await onSave(editingNotice, { ...form, status: form.status }) : await onPublish(form)
    if (saved) {
      setForm({ title: '', message: '', audience: 'all', source: 'Placement cell', status: 'Published' })
      setShowForm(false)
      setEditingNotice('')
    }
  }

  function editNotice(notice) {
    setEditingNotice(notice.id)
    setForm({ title: notice.title, message: notice.message, audience: notice.audience, source: notice.source, status: notice.status })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function closeForm() {
    setShowForm(false)
    setEditingNotice('')
    setForm({ title: '', message: '', audience: 'all', source: 'Placement cell', status: 'Published' })
  }

  return (
    <>
      <PageHeading
        eyebrow={isAdmin ? 'PLACEMENT CELL COMMUNICATIONS' : 'STAY IN THE LOOP'}
        title="Notices & updates"
        description={isAdmin ? 'Publish clear updates for students and manage placement-cell announcements.' : 'Deadlines, campus updates, and important placement-cell information in one place.'}
        action={isAdmin && <button className="button button-green" type="button" onClick={() => showForm ? closeForm() : setShowForm(true)}>{showForm ? 'Cancel' : '＋ Publish notice'}</button>}
      />
      {showForm && (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-heading"><div><span className="eyebrow">{editingNotice ? 'EDIT ANNOUNCEMENT' : 'NEW ANNOUNCEMENT'}</span><h2>{editingNotice ? 'Update placement notice' : 'Publish a placement notice'}</h2></div></div>
          <div className="form-grid">
            <label>Title<input required maxLength={120} value={form.title} onChange={(event) => fieldValue(form, setForm, 'title', event.target.value)} /></label>
            <label>Audience<select value={form.audience} onChange={(event) => fieldValue(form, setForm, 'audience', event.target.value)}><option value="all">Everyone</option><option value="students">Students</option></select></label>
            {editingNotice && <label>Status<select value={form.status} onChange={(event) => fieldValue(form, setForm, 'status', event.target.value)}><option>Published</option><option>Draft</option></select></label>}
            <label>Source label<input required maxLength={200} value={form.source} onChange={(event) => fieldValue(form, setForm, 'source', event.target.value)} /></label>
            <label className="form-wide">Notice<textarea required maxLength={2000} rows="4" value={form.message} onChange={(event) => fieldValue(form, setForm, 'message', event.target.value)} /></label>
          </div>
          <p className="form-note">Only publish verified information. Include a clear source label and confirm deadlines before sharing.</p>
          <button type="submit" className="button button-green" disabled={busy}>{busy ? 'Saving…' : editingNotice ? 'Save changes' : 'Publish notice'}</button>
        </form>
      )}
      <section className="notice-page-list">
        {notices.map((notice) => (
          <article className="panel notice-card" key={notice.id}>
            <div className="notice-card-icon">↗</div>
            <div className="notice-card-content">
              <div className="notice-meta"><span>{notice.audience === 'students' ? 'STUDENT UPDATE' : 'PLACEMENT CELL'}</span><span>{dateLabel(notice.created_at || notice.createdAt)}</span></div>
              <h2>{notice.title}</h2>
              <p>{notice.message}</p>
              <div className="notice-card-footer"><span className="source-label">ⓘ {notice.source}</span>{isAdmin && <><span className={`notice-status notice-${notice.status.toLowerCase()}`}>{notice.status}</span><button type="button" className="table-action" onClick={() => editNotice(notice)}>Edit</button><button type="button" className="table-action" onClick={() => onDelete(notice)}>Remove</button></>}</div>
            </div>
          </article>
        ))}
        {!notices.length && <div className="panel"><EmptyState title="No published notices" description="There are no placement updates to show right now." /></div>}
      </section>
    </>
  )
}

function QuestionForm({ busy, onSubmit }) {
  const [form, setForm] = useState({ company: '', year: String(currentYear), round: 'Technical interview', topic: '', content: '', difficulty: 'Medium' })
  async function submit(event) {
    event.preventDefault()
    if (await onSubmit({ ...form, year: Number(form.year) })) {
      setForm({ company: '', year: String(currentYear), round: 'Technical interview', topic: '', content: '', difficulty: 'Medium' })
    }
  }
  return (
    <form className="panel form-panel" onSubmit={submit}>
      <div className="panel-heading"><div><span className="eyebrow">CONTRIBUTE</span><h2>Add a past question</h2></div></div>
      <div className="form-grid">
        <label>Company<input required maxLength={100} value={form.company} onChange={(event) => fieldValue(form, setForm, 'company', event.target.value)} /></label>
        <label>Year<input type="number" min="2000" max={currentYear} required value={form.year} onChange={(event) => fieldValue(form, setForm, 'year', event.target.value)} /></label>
        <label>Round<input required value={form.round} onChange={(event) => fieldValue(form, setForm, 'round', event.target.value)} /></label>
        <label>Topic<input required value={form.topic} onChange={(event) => fieldValue(form, setForm, 'topic', event.target.value)} /></label>
        <label>Difficulty<select value={form.difficulty} onChange={(event) => fieldValue(form, setForm, 'difficulty', event.target.value)}><option>Easy</option><option>Medium</option><option>Hard</option></select></label>
        <label className="form-wide">Question or prompt<textarea required maxLength={2000} rows="3" value={form.content} onChange={(event) => fieldValue(form, setForm, 'content', event.target.value)} /></label>
      </div>
      <p className="form-note">Student submissions are labeled and held for placement-cell review before publication.</p>
      <button type="submit" className="button button-green" disabled={busy}>{busy ? 'Submitting…' : 'Submit question'}</button>
    </form>
  )
}

function RoadmapPage({ plan, drives, busy, onCreate, onGenerate, onStatusChange }) {
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ company: 'General placement preparation', week: '', goal: '', focus: '' })
  const [selectedDriveId, setSelectedDriveId] = useState(drives[0]?.id || '')
  const selectedDrive = drives.find((drive) => drive.id === selectedDriveId)
  const hasSelectedPlan = plan.some((item) => item.company === selectedDrive?.company)
  const completed = plan.filter((item) => item.status === 'Done').length
  async function submit(event) {
    event.preventDefault()
    if (await onCreate(form)) {
      setForm({ company: 'General placement preparation', week: '', goal: '', focus: '' })
      setShowForm(false)
    }
  }
  return (
    <>
      <PageHeading eyebrow="MAKE A PLAN, KEEP MOMENTUM" title="Preparation plan" description="Break your placement preparation into clear steps you can complete and track." action={<button className="button button-green" type="button" onClick={() => setShowForm(!showForm)}>{showForm ? 'Cancel' : '＋ Add a task'}</button>} />
      <section className="plan-summary panel"><div><span className="eyebrow">YOUR PROGRESS</span><h2>{completed} of {plan.length} tasks completed</h2></div><div className="progress-track"><span style={{ width: `${plan.length ? Math.round((completed / plan.length) * 100) : 0}%` }} /></div><strong>{plan.length ? Math.round((completed / plan.length) * 100) : 0}%</strong></section>
      <section className="panel generate-plan-panel">
        <div><span className="eyebrow">PERSONALIZED STARTER ROADMAP</span><h2>Build a plan for a placement drive</h2><p>Uses your profile, recorded drive requirements, and reviewed historical questions. This is a transparent rules-based plan, not an AI prediction.</p></div>
        <div className="generate-plan-actions"><select aria-label="Choose target placement drive" value={selectedDriveId} onChange={(event) => setSelectedDriveId(event.target.value)}><option value="">Choose a drive</option>{drives.map((drive) => <option value={drive.id} key={drive.id}>{drive.company} · {drive.role}</option>)}</select><button className="button button-green" type="button" disabled={busy || !selectedDrive || hasSelectedPlan} onClick={async () => { if (await onGenerate(selectedDriveId)) setShowForm(false) }}>{busy ? 'Building…' : hasSelectedPlan ? 'Plan already exists' : 'Generate plan'}</button></div>
      </section>
      {showForm && (
        <form className="panel form-panel" onSubmit={submit}>
          <div className="panel-heading"><div><span className="eyebrow">MAKE IT YOURS</span><h2>Add a preparation task</h2></div></div>
          <div className="form-grid">
            <label>Target company<input value={form.company} onChange={(event) => fieldValue(form, setForm, 'company', event.target.value)} /></label>
            <label>Week or date<input required placeholder="e.g. Week 5" value={form.week} onChange={(event) => fieldValue(form, setForm, 'week', event.target.value)} /></label>
            <label>Goal<input required value={form.goal} onChange={(event) => fieldValue(form, setForm, 'goal', event.target.value)} /></label>
            <label>Focus areas<input required value={form.focus} onChange={(event) => fieldValue(form, setForm, 'focus', event.target.value)} /></label>
          </div>
          <button className="button button-green" disabled={busy} type="submit">Add to my plan</button>
        </form>
      )}
      <section className="panel roadmap-panel">
        <div className="panel-heading"><div><span className="eyebrow">YOUR ROADMAP</span><h2>All preparation tasks</h2></div><span className="heading-count">{plan.length} tasks</span></div>
        {plan.length ? <div className="roadmap-list">{plan.map((item, index) => (
          <article className="roadmap-item" key={item.id}>
            <span className={`roadmap-step ${item.status === 'Done' ? 'done' : ''}`}>{item.status === 'Done' ? '✓' : String(index + 1).padStart(2, '0')}</span>
            <div className="roadmap-copy"><span className="eyebrow">{item.week} · {item.company}</span><h3>{item.goal}</h3><p>{item.focus}</p></div>
            <select aria-label={`Update status for ${item.goal}`} value={item.status} onChange={(event) => onStatusChange(item, event.target.value)}><option>Planned</option><option>In progress</option><option>Done</option></select>
          </article>
        ))}</div> : <EmptyState title="Your plan is a blank page" description="Add a task to start your placement preparation roadmap." />}
      </section>
    </>
  )
}

function MockPractice({ isAdmin, attempts, assessments, onAssessmentsChanged, onError, onSaved, withToken }) {
  const [form, setForm] = useState(emptyAssessment)
  const [editingId, setEditingId] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [activeAssessment, setActiveAssessment] = useState(null)
  const [questionIndex, setQuestionIndex] = useState(0)
  const [answers, setAnswers] = useState([])
  const [submittedScore, setSubmittedScore] = useState(null)
  const [busy, setBusy] = useState(false)

  async function reload() {
    const result = await withToken('/assessments')
    onAssessmentsChanged(result.assessments)
  }

  function editAssessment(assessment) {
    setEditingId(assessment.id)
    setForm({
      title: assessment.title,
      description: assessment.description,
      company: assessment.company,
      source: assessment.source,
      status: assessment.status,
      questions: assessment.questions.map((question) => ({ ...question, options: [...question.options] })),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function resetForm() {
    setForm(emptyAssessment())
    setEditingId('')
    setShowForm(false)
  }

  async function saveAssessment(event) {
    event.preventDefault()
    setBusy(true)
    try {
      if (editingId) {
        await withToken(`/assessments/${editingId}`, jsonRequest('PUT', form))
      } else {
        await withToken('/assessments', jsonRequest('POST', form))
      }
      await reload()
      resetForm()
    } catch (requestError) {
      onError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  async function removeAssessment(assessment) {
    if (!window.confirm(`Remove "${assessment.title}"?`)) return
    try {
      await withToken(`/assessments/${assessment.id}`, { method: 'DELETE' })
      await reload()
    } catch (requestError) {
      onError(requestError.message)
    }
  }

  function startAssessment(assessment) {
    setActiveAssessment(assessment)
    setQuestionIndex(0)
    setAnswers(Array(assessment.questions.length).fill(null))
    setSubmittedScore(null)
  }

  async function submitAssessment() {
    if (answers.some((answer) => answer === null)) {
      onError('Answer all questions before submitting your mock assessment.')
      return
    }
    setBusy(true)
    try {
      const result = await withToken(`/assessments/${activeAssessment.id}/attempts`, jsonRequest('POST', { answers }))
      setSubmittedScore(result)
      await onSaved()
    } catch (requestError) {
      onError(requestError.message)
    } finally {
      setBusy(false)
    }
  }

  if (isAdmin) {
    return (
      <>
        <PageHeading eyebrow="PLACEMENT CELL" title="Practice mock management" description="Create and publish practice assessments. Correct answers stay private and are scored by the server." action={<button className="button button-green" type="button" onClick={() => showForm ? resetForm() : setShowForm(true)}>{showForm ? 'Cancel' : '＋ Create mock'}</button>} />
        {showForm && (
          <form className="panel form-panel" onSubmit={saveAssessment}>
            <div className="panel-heading"><div><span className="eyebrow">{editingId ? 'UPDATE MOCK' : 'NEW MOCK'}</span><h2>{editingId ? 'Edit practice mock' : 'Create practice mock'}</h2></div></div>
            <div className="form-grid">
              <label>Mock title<input required maxLength={120} value={form.title} onChange={(event) => fieldValue(form, setForm, 'title', event.target.value)} /></label>
              <label>Company or category<input required maxLength={100} value={form.company} onChange={(event) => fieldValue(form, setForm, 'company', event.target.value)} /></label>
              <label>Source label<input required maxLength={200} value={form.source} onChange={(event) => fieldValue(form, setForm, 'source', event.target.value)} /></label>
              <label>Publication status<select value={form.status} onChange={(event) => fieldValue(form, setForm, 'status', event.target.value)}><option>Draft</option><option>Published</option></select></label>
              <label className="form-wide">Description<textarea required maxLength={500} rows="2" value={form.description} onChange={(event) => fieldValue(form, setForm, 'description', event.target.value)} /></label>
            </div>
            <div className="assessment-editor">
              <div className="panel-heading"><h2>Questions ({form.questions.length}/50)</h2><button type="button" className="button button-outline" disabled={form.questions.length >= 50} onClick={() => setForm((current) => ({ ...current, questions: [...current.questions, { prompt: '', options: ['', '', '', ''], answerIndex: 0 }] }))}>＋ Add question</button></div>
              {form.questions.map((question, questionNumber) => (
                <fieldset className="assessment-question-editor" key={questionNumber}>
                  <legend>Question {questionNumber + 1}</legend>
                  <label>Prompt<textarea required maxLength={1000} rows="2" value={question.prompt} onChange={(event) => updateAssessmentQuestion(setForm, questionNumber, 'prompt', event.target.value)} /></label>
                  <div className="assessment-option-grid">{question.options.map((option, optionIndex) => (
                    <label key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}<input required maxLength={240} value={option} onChange={(event) => updateAssessmentOption(setForm, questionNumber, optionIndex, event.target.value)} /></label>
                  ))}</div>
                  <div className="assessment-question-actions">
                    <label>Correct answer<select value={question.answerIndex} onChange={(event) => updateAssessmentQuestion(setForm, questionNumber, 'answerIndex', Number(event.target.value))}>{question.options.map((_, optionIndex) => <option value={optionIndex} key={optionIndex}>Option {String.fromCharCode(65 + optionIndex)}</option>)}</select></label>
                    <button type="button" className="table-action" disabled={form.questions.length <= 1} onClick={() => setForm((current) => ({ ...current, questions: current.questions.filter((_, index) => index !== questionNumber) }))}>Remove question</button>
                  </div>
                </fieldset>
              ))}
            </div>
            <button type="submit" className="button button-green" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Save mock'}</button>
          </form>
        )}
        <section className="resource-grid assessment-admin-list">
          {assessments.map((assessment) => (
            <article className="panel resource-card" key={assessment.id}>
              <div className="resource-file-mark">MC</div><div className="resource-card-copy"><span className="eyebrow">{assessment.company} · {assessment.status}</span><h2>{assessment.title}</h2><p>{assessment.description}</p><small>{assessment.questionCount} questions · {assessment.source}</small></div>
              <div className="resource-actions"><button type="button" className="table-action" onClick={() => editAssessment(assessment)}>Edit</button><button type="button" className="table-action" onClick={() => removeAssessment(assessment)}>Remove</button></div>
            </article>
          ))}
          {!assessments.length && <div className="panel"><EmptyState title="No practice mocks yet" description="Create a mock to let students practice and save their results." /></div>}
        </section>
      </>
    )
  }

  const currentQuestion = activeAssessment?.questions[questionIndex]
  const percentage = submittedScore ? Math.round((submittedScore.score / submittedScore.total) * 100) : null
  return (
    <>
      <PageHeading eyebrow="PRACTICE, REFLECT, IMPROVE" title="Mock practice" description="Choose a placement-cell assessment, submit your answers, and review your saved score." action={<span className="heading-count">{assessments.length} published mocks</span>} />
      {activeAssessment ? (
        <section className="mock-layout">
          <div className="panel mock-panel">
            {submittedScore ? (
              <div className="mock-result"><span className="eyebrow">ASSESSMENT COMPLETE · {activeAssessment.title}</span><div className="result-score">{submittedScore.score}<span>/{submittedScore.total}</span></div><h2>{percentage >= 80 ? 'Strong work.' : percentage >= 60 ? 'Good start. Keep at it.' : 'A useful place to begin.'}</h2><p>You scored {percentage}%. Your result is saved to your progress history.</p><div className="result-actions"><button className="button button-green" type="button" onClick={() => startAssessment(activeAssessment)}>Try again</button><button className="button button-outline" type="button" onClick={() => setActiveAssessment(null)}>Choose another mock</button></div></div>
            ) : (
              <>
                <div className="mock-progress-head"><span className="eyebrow">{activeAssessment.company.toUpperCase()}</span><strong>Question {questionIndex + 1} <span>of {activeAssessment.questions.length}</span></strong></div>
                <div className="progress-track"><span style={{ width: `${((questionIndex + 1) / activeAssessment.questions.length) * 100}%` }} /></div>
                <h2 className="mock-question">{currentQuestion.prompt}</h2>
                <div className="mock-options">{currentQuestion.options.map((option, index) => <button key={`${index}-${option}`} type="button" className={`mock-option ${answers[questionIndex] === index ? 'selected' : ''}`} onClick={() => setAnswers((current) => current.map((answer, answerIndex) => answerIndex === questionIndex ? index : answer))}><span>{String.fromCharCode(65 + index)}</span>{option}</button>)}</div>
                <div className="mock-controls"><span>{answers.filter((answer) => answer !== null).length} of {activeAssessment.questions.length} answered</span><div><button className="button button-outline" type="button" disabled={questionIndex === 0} onClick={() => setQuestionIndex((index) => index - 1)}>Previous</button>{questionIndex < activeAssessment.questions.length - 1 ? <button className="button button-green" type="button" onClick={() => setQuestionIndex((index) => index + 1)}>Next question <span>→</span></button> : <button className="button button-green" type="button" disabled={busy || answers.some((answer) => answer === null)} onClick={submitAssessment}>{busy ? 'Saving…' : 'Submit assessment'}</button>}</div></div>
              </>
            )}
          </div>
          <aside className="panel mock-sidebar"><span className="eyebrow">ASSESSMENT INFO</span><h2>{activeAssessment.title}</h2><p>{activeAssessment.description}</p><div className="mock-info-row"><span>Questions</span><strong>{activeAssessment.questionCount}</strong></div><div className="mock-info-row"><span>Source</span><strong>{activeAssessment.source}</strong></div><div className="mock-info-row"><span>Previous attempts</span><strong>{attempts.length}</strong></div><button className="text-button" type="button" onClick={() => setActiveAssessment(null)}>← All mock assessments</button></aside>
        </section>
      ) : (
        <section className="resource-grid">
          {assessments.map((assessment) => (
            <article className="panel resource-card" key={assessment.id}>
              <div className="resource-file-mark">MC</div><div className="resource-card-copy"><span className="eyebrow">{assessment.company}</span><h2>{assessment.title}</h2><p>{assessment.description}</p><small>{assessment.questionCount} questions · {assessment.source}</small></div>
              <div className="resource-actions"><button type="button" className="button button-green" onClick={() => startAssessment(assessment)}>Start mock</button></div>
            </article>
          ))}
          {!assessments.length && <div className="panel"><EmptyState title="No published mocks" description="Placement-cell practice assessments will appear here when available." /></div>}
        </section>
      )}
      {!activeAssessment && <aside className="panel recent-attempts"><strong>Recent scores</strong>{attempts.slice(0, 5).map((attempt) => <div key={attempt.id}><span>{new Date(attempt.completed_at || attempt.completedAt).toLocaleDateString()}</span><b>{attempt.score}/{attempt.total}</b></div>)}{!attempts.length && <small>Your completed attempts will be saved here.</small>}</aside>}
    </>
  )
}

function ProfilePage({ user, busy, onSave, skills, onError, withToken, onSkillsSaved }) {
  const [form, setForm] = useState({
    name: user.name,
    branch: user.profile?.branch || '',
    cgpa: user.profile?.cgpa ?? '',
    graduationYear: user.profile?.graduationYear ?? '',
    backlogs: user.profile?.backlogs ?? 0,
    targetRole: user.profile?.targetRole || '',
    skills: user.profile?.skills?.join(', ') || '',
  })
  const [savingSkill, setSavingSkill] = useState('')

  async function submit(event) {
    event.preventDefault()
    await onSave({ ...form, cgpa: Number(form.cgpa), graduationYear: Number(form.graduationYear), backlogs: Number(form.backlogs), skills: form.skills.split(',').map((skill) => skill.trim()).filter(Boolean) })
  }

  async function updateSkill(skill, score) {
    setSavingSkill(skill)
    try {
      await withToken(`/progress/${encodeURIComponent(skill)}`, jsonRequest('PUT', { score: Number(score) }))
      await onSkillsSaved()
    } catch (error) {
      onError(error.message)
    } finally {
      setSavingSkill('')
    }
  }

  return (
    <>
      <PageHeading eyebrow="YOUR DETAILS, YOUR DATA" title="My profile" description="Keep your academic information current so eligibility checks can be more useful." action={<span className="profile-private">▣ Private to your account</span>} />
      <div className="profile-layout">
        <form className="panel profile-form" onSubmit={submit}>
          <div className="profile-form-header"><span className="avatar profile-avatar">{initials(user.name)}</span><div><span className="eyebrow">STUDENT PROFILE</span><h2>Academic details</h2></div></div>
          <div className="form-grid">
            <label>Full name<input required value={form.name} onChange={(event) => fieldValue(form, setForm, 'name', event.target.value)} /></label>
            <label>Email address<input disabled value={user.email} /></label>
            <label>Branch<select value={form.branch} onChange={(event) => fieldValue(form, setForm, 'branch', event.target.value)}><option>Computer Science & Engineering</option><option>Information Technology</option><option>Electronics & Communication</option><option>Electrical Engineering</option><option>Mechanical Engineering</option></select></label>
            <label>Target role<input required value={form.targetRole} onChange={(event) => fieldValue(form, setForm, 'targetRole', event.target.value)} /></label>
            <label>CGPA out of 10<input type="number" min="0" max="10" step="0.01" required value={form.cgpa} onChange={(event) => fieldValue(form, setForm, 'cgpa', event.target.value)} /></label>
            <label>Graduation year<input type="number" min="2020" max="2040" required value={form.graduationYear} onChange={(event) => fieldValue(form, setForm, 'graduationYear', event.target.value)} /></label>
            <label>Active backlogs<input type="number" min="0" max="50" required value={form.backlogs} onChange={(event) => fieldValue(form, setForm, 'backlogs', event.target.value)} /></label>
            <label className="form-wide">Skills, separated by commas<input placeholder="Java, SQL, Data Structures & Algorithms" value={form.skills} onChange={(event) => fieldValue(form, setForm, 'skills', event.target.value)} /></label>
          </div>
          <div className="profile-form-footer"><span>Eligibility results use the profile details above and the drive criteria shown by the placement cell.</span><button className="button button-green" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save profile'}</button></div>
        </form>
        <section className="panel skill-editor"><div className="panel-heading"><div><span className="eyebrow">SELF-ASSESSMENT</span><h2>Skill readiness</h2></div></div><p className="panel-description">Adjust your preparation levels to keep your progress view current. This is a self-assessment, not a formal evaluation.</p><div className="skill-editor-list">{skills.map((item) => <SkillEditor key={item.skill} item={item} saving={savingSkill === item.skill} onSave={updateSkill} />)}</div><button className="button button-outline full-width" type="button" onClick={() => window.print()}>Print profile summary</button></section>
      </div>
    </>
  )
}

function SkillEditor({ item, saving, onSave }) {
  return <label className="skill-editor-row"><span><strong>{item.skill}</strong><small>{saving ? 'Saving…' : `${item.score}% readiness`}</small></span><input type="range" min="0" max="100" step="1" defaultValue={item.score} onMouseUp={(event) => onSave(item.skill, event.currentTarget.value)} onTouchEnd={(event) => onSave(item.skill, event.currentTarget.value)} onKeyUp={(event) => onSave(item.skill, event.currentTarget.value)} aria-label={`${item.skill} readiness`} /></label>
}

function SkillBars({ skills, compact = false }) {
  if (!skills.length) return <EmptyState title="No skill data yet" description="Add skill progress from your profile." />
  const visible = compact ? skills.slice(0, 4) : skills
  return <div className={`skill-list ${compact ? 'compact' : ''}`}>{visible.map((skill) => <div className="skill-item" key={skill.skill}><div className="skill-row"><label>{skill.skill}</label><span>{skill.score}%</span></div><div className="skill-bar"><span style={{ width: `${skill.score}%` }} /></div></div>)}</div>
}

function AdminPage({ summary, drives, onDriveChanged, withToken, onError }) {
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState(emptyDrive)
  const [busy, setBusy] = useState(false)
  const metrics = summary?.metrics || {}

  function editDrive(drive) {
    setEditingId(drive.id)
    setForm({
      company: drive.company,
      role: drive.role,
      deadline: drive.deadline.slice(0, 10),
      status: drive.status,
      location: drive.location,
      description: drive.description,
      source: drive.source,
      minCgpa: drive.criteria.minCgpa ?? '',
      maxBacklogs: drive.criteria.maxBacklogs ?? '',
      branches: drive.criteria.branches.join(', '),
      skills: drive.criteria.skills.join(', '),
      stages: drive.stages.join(', '),
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function clearForm() {
    setEditingId('')
    setForm(emptyDrive)
    setShowForm(false)
  }

  async function submit(event) {
    event.preventDefault()
    setBusy(true)
    const payload = {
      ...form,
      minCgpa: form.minCgpa === '' ? null : Number(form.minCgpa),
      maxBacklogs: form.maxBacklogs === '' ? null : Number(form.maxBacklogs),
      branches: form.branches.split(',').map((value) => value.trim()).filter(Boolean),
      skills: form.skills.split(',').map((value) => value.trim()).filter(Boolean),
      stages: form.stages.split(',').map((value) => value.trim()).filter(Boolean),
    }
    try {
      if (editingId) {
        await withToken(`/drives/${editingId}`, jsonRequest('PUT', payload))
      } else {
        await withToken('/drives', jsonRequest('POST', payload))
      }
      clearForm()
      await onDriveChanged(editingId ? 'Placement drive updated.' : 'Placement drive created.')
    } catch (error) {
      onError(error.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHeading eyebrow="PLACEMENT CELL" title="Coordinator workspace" description="Manage official opportunities, monitor registrations, and review student preparation activity." action={<button className="button button-green" type="button" onClick={() => { if (showForm) clearForm(); else setShowForm(true) }}>{showForm ? 'Cancel' : '＋ New drive'}</button>} />
      <section className="admin-metric-grid">{[
        ['All placement drives', metrics.driveCount ?? 0],
        ['Open for registration', metrics.openDriveCount ?? 0],
        ['Student accounts', metrics.studentCount ?? 0],
        ['Registrations', metrics.registrationCount ?? 0],
        ['Questions to review', metrics.pendingQuestionCount ?? 0],
      ].map(([label, value]) => <StatCard key={label} label={label} value={value} note="Live from the database" icon="↗" tone="green" />)}</section>
      {showForm && (
        <form className="panel form-panel admin-drive-form" onSubmit={submit}>
          <div className="panel-heading"><div><span className="eyebrow">{editingId ? 'UPDATE RECORD' : 'CREATE RECORD'}</span><h2>{editingId ? 'Edit placement drive' : 'Add a placement drive'}</h2></div><button className="icon-button" type="button" aria-label="Close form" onClick={clearForm}>×</button></div>
          <div className="form-grid">
            <label>Company<input required value={form.company} onChange={(event) => fieldValue(form, setForm, 'company', event.target.value)} /></label>
            <label>Role<input required value={form.role} onChange={(event) => fieldValue(form, setForm, 'role', event.target.value)} /></label>
            <label>Deadline<input type="date" required value={form.deadline} onChange={(event) => fieldValue(form, setForm, 'deadline', event.target.value)} /></label>
            <label>Status<select value={form.status} onChange={(event) => fieldValue(form, setForm, 'status', event.target.value)}><option>Open</option><option>Coming soon</option><option>Closed</option></select></label>
            <label>Location<input required value={form.location} onChange={(event) => fieldValue(form, setForm, 'location', event.target.value)} /></label>
            <label>Minimum CGPA<input type="number" min="0" max="10" step="0.01" value={form.minCgpa} onChange={(event) => fieldValue(form, setForm, 'minCgpa', event.target.value)} /></label>
            <label>Maximum backlogs<input type="number" min="0" value={form.maxBacklogs} onChange={(event) => fieldValue(form, setForm, 'maxBacklogs', event.target.value)} /></label>
            <label>Eligible branches, comma separated<input value={form.branches} onChange={(event) => fieldValue(form, setForm, 'branches', event.target.value)} /></label>
            <label>Preparation skills, comma separated<input value={form.skills} onChange={(event) => fieldValue(form, setForm, 'skills', event.target.value)} /></label>
            <label>Selection stages, comma separated<input value={form.stages} onChange={(event) => fieldValue(form, setForm, 'stages', event.target.value)} /></label>
            <label>Source label<input required value={form.source} onChange={(event) => fieldValue(form, setForm, 'source', event.target.value)} /></label>
            <label className="form-wide">Description<textarea required rows="3" value={form.description} onChange={(event) => fieldValue(form, setForm, 'description', event.target.value)} /></label>
          </div>
          <div className="form-actions"><span>Use verified placement-cell details and provide an accurate source label.</span><button className="button button-green" type="submit" disabled={busy}>{busy ? 'Saving…' : editingId ? 'Save changes' : 'Create drive'}</button></div>
        </form>
      )}
      <section className="panel admin-table-panel">
        <div className="panel-heading"><div><span className="eyebrow">OPPORTUNITY MANAGEMENT</span><h2>Placement drives</h2></div><span className="heading-count">{drives.length} records</span></div>
        <div className="table-scroll"><table><thead><tr><th>Company / role</th><th>Status</th><th>Deadline</th><th>Eligibility</th><th>Source</th><th>Actions</th></tr></thead><tbody>{drives.map((drive) => <tr key={drive.id}><td><strong>{drive.company}</strong><small>{drive.role}</small></td><td><span className={`drive-status status-${drive.status.toLowerCase().replace(' ', '-')}`}>{drive.status}</span></td><td>{dateLabel(drive.deadline)}</td><td>{drive.criteria.minCgpa ?? '—'} CGPA · {drive.criteria.maxBacklogs ?? '—'} backlog</td><td><span className="source-label">{drive.source}</span></td><td><button className="table-action" type="button" onClick={() => editDrive(drive)}>Edit</button></td></tr>)}</tbody></table></div>
      </section>
      <section className="admin-lower-grid">
        <div className="panel admin-table-panel">
          <div className="panel-heading"><div><span className="eyebrow">STUDENT DIRECTORY</span><h2>Student profiles</h2></div><span className="heading-count">{summary?.students?.length || 0}</span></div>
          <div className="table-scroll"><table><thead><tr><th>Student</th><th>Branch</th><th>CGPA</th><th>Graduation</th></tr></thead><tbody>{(summary?.students || []).map((student) => <tr key={student.id}><td><strong>{student.name}</strong><small>{student.email}</small></td><td>{student.profile.branch}</td><td>{student.profile.cgpa}</td><td>{student.profile.graduationYear}</td></tr>)}</tbody></table>{!summary?.students?.length && <EmptyState title="No student accounts yet" description="Registered students will appear here." />}</div>
        </div>
        <div className="panel">
          <div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>Drive registrations</h2></div></div>
          <div className="recent-registration-list">{(summary?.registrations || []).map((registration, index) => <div className="recent-registration" key={`${registration.name}-${registration.company}-${index}`}><span className="avatar avatar-small">{initials(registration.name)}</span><div><strong>{registration.name}</strong><small>{registration.company} · {registration.role}</small></div></div>)}{!summary?.registrations?.length && <EmptyState title="No registrations yet" description="Student applications will show here." />}</div>
        </div>
      </section>
      <p className="admin-disclaimer">Sample records are marked as sample data. The placement cell should verify records before publishing official notices.</p>
    </>
  )
}

export default App
