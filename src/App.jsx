import { useEffect, useMemo, useState } from 'react'
import './App.css'
import './AppAdditions.css'
import { deleteRecord, insertRecord, updateBudget, updateRecord } from './services/festivalService'
import { isSupabaseConfigured, supabase } from './services/supabase'
import { useFestivalData } from './hooks/useFestivalData'

const categories = ['Decoration', 'Pooja Items', 'Food', 'Electricity', 'Sound System', 'Cultural Program', 'Transportation', 'Printing', 'Cleaning', 'Maintenance', 'Other']
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`
const isRecoveryUrl = () => window.location.hash.includes('type=recovery') || new URLSearchParams(window.location.search).get('type') === 'recovery'

function App() {
  const [user, setUser] = useState(undefined)
  const [isRecoveringPassword, setIsRecoveringPassword] = useState(isRecoveryUrl)
  const [active, setActive] = useState('Dashboard')
  const [modal, setModal] = useState(null)
  const [editingSponsor, setEditingSponsor] = useState(null)
  const [editingRecord, setEditingRecord] = useState(null)
  const [editingMember, setEditingMember] = useState(null)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState('')
  const [operationError, setOperationError] = useState('')
  const [saving, setSaving] = useState(false)
  const { data, loading, error, syncState, refresh } = useFestivalData(user)
  const isAdmin = data.profile?.role === 'admin' || user?.user_metadata?.role === 'admin'
  const accountId = data.profile?.association_id || user?.user_metadata?.association_id || user?.id
  const youthName = user?.user_metadata?.youth_name || data.profile?.youth_name || 'Youth Association'
  const adminEmail = user?.user_metadata?.admin_email || (isAdmin ? user.email : '')
  const youthEmail = user?.user_metadata?.youth_email || (!isAdmin ? user.email : '')
  const denyChanges = () => { const message = 'You do not have access to make changes. Please report this to the admin.'; setOperationError(message); setToast(message); window.setTimeout(() => setToast(''), 3000) }

  useEffect(() => {
    if (!supabase) { Promise.resolve().then(() => setUser(null)); return undefined }
    supabase.auth.getSession().then(({ data: sessionData }) => setUser(sessionData.session?.user || null))
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || isRecoveryUrl()) setIsRecoveringPassword(true)
      setUser(session?.user || null)
    })
    return () => listener.subscription.unsubscribe()
  }, [])

  const totals = useMemo(() => {
    const sum = (rows, status) => rows.filter(row => !status || row.status === status).reduce((total, row) => total + Number(row.amount || 0), 0)
    const expenses = sum(data.expenses)
    const revenue = sum(data.chandha, 'Received') + sum(data.sponsors, 'Received')
    const pending = sum(data.chandha, 'Pending') + sum(data.sponsors, 'Pending')
    return { revenue, expenses, pending, balance: revenue - expenses, budgetLeft: revenue - expenses, utilization: data.budget ? Math.round(expenses / data.budget * 100) : 0 }
  }, [data])

  const run = async action => {
    try { setSaving(true); setOperationError(''); await action(); setSaving(false); setToast('Record saved successfully.'); window.setTimeout(() => setToast(''), 2500); refresh() }
    catch (saveError) { console.error(saveError); setOperationError(saveError.message || 'Unable to save the record.') }
    finally { setSaving(false) }
  }
  const save = (key, item) => { if (!isAdmin) { denyChanges(); return } return run(async () => {
    const table = key === 'events' ? 'festival_programs' : key === 'members' ? 'team_members' : key
    const payload = key === 'chandha' ? { person_name: item.person, mobile: item.mobile, amount: item.amount, status: item.status, date: item.date, note: item.note } : key === 'expenses' ? { title: item.title, amount: item.amount, category: item.category, note: item.note, spent_by: item.spentById, date: item.date } : key === 'events' ? { day_number: item.day_number, title: item.title, description: item.description, date: item.date, location: item.location, status: 'Planned' } : key === 'members' ? { name: item.name, role: 'Team Member' } : key === 'bookings' ? { person_name: item.person_name, purpose_name: item.purpose_name, mobile: item.mobile, full_payment: item.full_payment, advance_paid: item.advance_paid } : { name: item.name, item: item.item, amount: item.amount, status: item.status, date: item.date, note: item.note }
    await insertRecord(table, payload, user.id, accountId)
    setModal(null)
  }) }
  const editMember = item => { if (!isAdmin) { denyChanges(); return } return run(async () => {
    await updateRecord('team_members', item.id, { name: item.name, role: item.role || 'Team Member', team_name: item.team_name || null }, accountId)
    setEditingMember(null)
  }) }
  const editSponsor = item => { if (!isAdmin) { denyChanges(); return } return run(async () => {
    await updateRecord('sponsors', item.id, { name: item.name, item: item.item, amount: Number(item.amount), status: item.status, date: item.date, note: item.note }, accountId)
    setEditingSponsor(null)
  }) }
  const editRecord = item => { if (!isAdmin) { denyChanges(); return } return run(async () => {
    const table = item.type === 'chandha' ? 'chandha' : 'expenses'
    const payload = table === 'chandha' ? { person_name: item.person, mobile: item.mobile, amount: Number(item.amount), status: item.status, date: item.date, note: item.note } : { title: item.title, amount: Number(item.amount), category: item.category, note: item.note, spent_by: item.spentById, date: item.date }
    await updateRecord(table, item.id, payload, accountId)
    setEditingRecord(null)
  }) }
  const remove = (table, id) => { if (!isAdmin) { denyChanges(); return } const message = table === 'team_members' ? 'Are you want delete the member?' : 'Are you sure you want to delete this record?'; if (window.confirm(message)) run(() => deleteRecord(table, id, accountId)) }
  const receive = (table, id) => { if (!isAdmin) { denyChanges(); return } return run(() => updateRecord(table, id, { status: 'Received' }, accountId)) }
  const setBudget = value => { if (!isAdmin) { denyChanges(); return } return run(() => updateBudget(Number(value), accountId)) }
  const signOut = async () => {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setOperationError(signOutError.message || 'Unable to sign out.')
      return
    }
    setUser(null)
    setMenu(false)
  }

  if (user === undefined) return <main className="login-page"><p>Connecting to the festival database...</p></main>
  if (!isSupabaseConfigured) return <main className="login-page"><div className="login-card"><h1>Database setup required</h1><p className="login-copy">Add Supabase credentials to .env and restart the app.</p></div></main>
  if (isRecoveringPassword) return <UpdatePassword onComplete={() => setIsRecoveringPassword(false)} />
  if (!user) return <Login />

  const nav = ['Dashboard', 'Chandha', 'Expenses', 'Sponsors', 'Team Members', 'Bookings', 'Budget', 'Festival Program', 'Records / Reports']
  return <div className="app-shell">
    <aside className={menu ? 'sidebar open' : 'sidebar'}><div className="brand"><div className="brand-mark">ॐ</div><div><strong>{youthName.toUpperCase()}</strong><small>FESTIVAL MANAGEMENT</small></div></div><nav>{nav.map(item => <button className={active === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => { setActive(item); setMenu(false) }}>{item}</button>)}</nav><div className="sidebar-bottom"><div className="committee"><div className="avatar">{isAdmin ? 'AD' : 'YU'}</div><div><b>{youthName}</b><small>{isAdmin ? 'Admin' : 'Youth'} · {user.email}</small></div></div><div className="account-ids"><small>Admin mail: {adminEmail || 'Not available'}</small><small>Youth mail: {youthEmail || 'Not available'}</small></div><button className="logout" onClick={signOut}>↪ &nbsp; Sign out</button></div></aside>
    <main className="main"><header><button className="hamburger" onClick={() => setMenu(!menu)}>☰</button><div className="crumb">{youthName} <b>/</b> {active}</div><div className="header-actions"><span className="sync">● {syncState}</span><div className="header-avatar">{isAdmin ? 'AD' : 'YU'}</div></div></header>
      <div className="content"><div className="page-heading"><div><p className="eyebrow">{youthName.toUpperCase()} <span>•</span> SHARED DATABASE</p><h1>{active === 'Dashboard' ? `Hi ${youthName}` : active}</h1><p className="subheading">{active === 'Dashboard' ? 'Here’s the financial pulse of your festival.' : 'Keep every detail accounted for, together.'}</p></div>{active === 'Chandha' ? <div className="heading-actions"><button className="secondary" onClick={() => isAdmin ? setModal('ChandhaCollection') : denyChanges()}>＋ Add chanda</button><button className="primary" onClick={() => isAdmin ? setModal('Income') : denyChanges()}>＋ Add income</button></div> : ['Expenses', 'Sponsors', 'Bookings'].includes(active) && <button className="primary" onClick={() => isAdmin ? setModal(active) : denyChanges()}>＋ Add {active === 'Expenses' ? 'expense' : active === 'Bookings' ? 'booking' : 'sponsor'}</button>}</div>
        {(error || operationError) && <p className="login-error">{operationError || error}</p>}
        {loading ? <section className="panel loading">Loading {active}...</section> : <Page active={active} data={data} totals={totals} query={query} setQuery={setQuery} setActive={setActive} receive={receive} remove={remove} editSponsor={setEditingSponsor} editRecord={setEditingRecord} setBudget={setBudget} isAdmin={isAdmin} openEvent={() => isAdmin ? setModal('Event') : denyChanges()} openMember={() => isAdmin ? setModal('Member') : denyChanges()} editMember={member => isAdmin ? setEditingMember(member) : denyChanges()} />}
      </div><footer className="app-footer">Developed by FirstgenAI Technologies <span>·</span> Contact - 9000278794 - Ganesh <span>·</span> 9515531463 - B. Sankeerth</footer>
    </main>
      {modal === 'ChandhaCollection' && <ChandhaForm mode="collection" onClose={() => setModal(null)} onSave={save} />}{modal === 'Income' && <ChandhaForm mode="income" onClose={() => setModal(null)} onSave={save} />}{modal === 'Event' && <EventForm onClose={() => setModal(null)} onSave={save} />}{modal === 'Member' && <MemberForm onClose={() => setModal(null)} onSave={save} saving={saving} />}{modal === 'Bookings' && <BookingForm onClose={() => setModal(null)} onSave={save} />}{modal && !['ChandhaCollection', 'Income', 'Event', 'Member', 'Bookings'].includes(modal) && <RecordForm type={modal} members={data.members} onClose={() => setModal(null)} onSave={save} />}{editingSponsor && <SponsorEditForm sponsor={editingSponsor} onClose={() => setEditingSponsor(null)} onSave={editSponsor} />}{editingRecord && <RecordEditForm record={editingRecord} members={data.members} onClose={() => setEditingRecord(null)} onSave={editRecord} />}{editingMember && <MemberEditForm member={editingMember} onClose={() => setEditingMember(null)} onSave={editMember} saving={saving} />}{toast && <div className="toast">✓ &nbsp;{toast}</div>}
  </div>
}

function Login() {
  const [mode, setMode] = useState('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const submit = async event => { event.preventDefault(); setError(''); setMessage(''); const { error: authError } = await supabase.auth.signInWithPassword({ email, password }); if (authError) setError(authError.message) }
  const reset = async event => { event.preventDefault(); setError(''); const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin }); if (resetError) setError(resetError.message); else { setMode('login'); setMessage('Password reset instructions sent to your email.') } }
  if (mode === 'signup') return <CreateAccount onBack={message => { setMode('login'); setError(''); setMessage(message || '') }} />
  return <main className="login-page"><form className="login-card" onSubmit={mode === 'reset' ? reset : submit}><div className="brand-mark">ॐ</div><p className="eyebrow">YOUTH ASSOCIATION</p><h1>{mode === 'reset' ? 'Reset password' : 'Welcome back'}</h1><p className="login-copy">{mode === 'reset' ? 'Enter your email to receive reset instructions.' : 'Sign in to the shared festival records.'}</p><label>Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label>{mode !== 'reset' && <label>Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>}{error && <p className="login-error">{error}</p>}{message && <p className="login-success">{message}</p>}<button className="primary" type="submit">{mode === 'reset' ? 'Send reset link' : 'Login'}</button>{mode === 'login' && <><button className="text-btn auth-link" type="button" onClick={() => setMode('reset')}>Forgot password?</button><button className="secondary auth-secondary" type="button" onClick={() => setMode('signup')}>Create Account</button></>}{mode === 'reset' && <button className="text-btn auth-link" type="button" onClick={() => setMode('login')}>Back to login</button>}</form></main>
}

function UpdatePassword({ onComplete }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)

  const submit = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    if (password !== confirmation) {
      setError('Passwords do not match.')
      return
    }
    setSaving(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setSaving(false)
    if (updateError) {
      setError(updateError.message)
      return
    }
    setMessage('Your password has been updated. You can now sign in with the new password.')
    await supabase.auth.signOut()
    window.setTimeout(onComplete, 1200)
  }

  return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="brand-mark">ॐ</div><p className="eyebrow">ACCOUNT RECOVERY</p><h1>Set new password</h1><p className="login-copy">Choose a new password for your festival account.</p><label>New password<input required minLength="6" type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><label>Confirm new password<input required minLength="6" type="password" value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>{error && <p className="login-error">{error}</p>}{message && <p className="login-success">{message}</p>}<button className="primary" type="submit" disabled={saving}>{saving ? 'Updating...' : 'Update password'}</button></form></main>
}

function CreateAccount({ onBack }) {
  const [form, setForm] = useState({})
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const update = event => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = async event => {
    event.preventDefault()
    setError('')
    setMessage('')
    const adminMail = form.admin_email?.trim().toLowerCase()
    const youthMail = form.youth_email?.trim().toLowerCase()
    if (adminMail === youthMail) { setError('Admin mail id and Youth mail id must be different.'); return }
    if (form.admin_password !== form.admin_password_confirm || form.youth_password !== form.youth_password_confirm) { setError('Passwords do not match.'); return }
    const associationId = crypto.randomUUID()
    const accountMetadata = { youth_name: form.youth_name, association_id: associationId, admin_email: adminMail, youth_email: youthMail }
    const admin = await supabase.auth.signUp({ email: adminMail, password: form.admin_password, options: { data: { ...accountMetadata, role: 'admin' } } })
    if (admin.error) { setError(admin.error.message.includes('already') ? 'Admin mail id already exists. Please use another email.' : admin.error.message); return }
    if (admin.data.user && admin.data.user.identities?.length === 0) { setError('Admin mail id already exists. Please use another email.'); return }
    const youth = await supabase.auth.signUp({ email: youthMail, password: form.youth_password, options: { data: { ...accountMetadata, role: 'youth' } } })
    if (youth.error) { setError(youth.error.message.includes('already') ? 'Youth mail id already exists. Please use another email.' : youth.error.message); await supabase.auth.signOut(); return }
    if (youth.data.user && youth.data.user.identities?.length === 0) { setError('Youth mail id already exists. Please use another email.'); await supabase.auth.signOut(); return }
    await supabase.auth.signOut()
    const login = await supabase.auth.signInWithPassword({ email: adminMail, password: form.admin_password })
    if (login.error) { onBack(`Accounts created. Admin mail: ${adminMail}. Youth mail: ${youthMail}. Disable email confirmation in Supabase Auth to log in directly.`); return }
    onBack('Accounts created. You are signed in with the Admin mail id.')
  }
  return <main className="login-page"><form className="login-card account-card" onSubmit={submit}><div className="brand-mark">ॐ</div><p className="eyebrow">NEW ASSOCIATION</p><h1>Create Account</h1><label>Youth Name<input required name="youth_name" onChange={update} /></label><label>Admin Mail id<input required type="email" name="admin_email" onChange={update} /></label><label>Admin password<input required type="password" name="admin_password" onChange={update} /></label><label>Confirm admin password<input required type="password" name="admin_password_confirm" onChange={update} /></label><label>Youth mail id<input required type="email" name="youth_email" onChange={update} /></label><label>Youth password<input required type="password" name="youth_password" onChange={update} /></label><label>Confirm youth password<input required type="password" name="youth_password_confirm" onChange={update} /></label>{error && <p className="login-error">{error}</p>}{message && <p className="login-success">{message}</p>}<button className="primary" type="submit">Create Account</button><button className="text-btn auth-link" type="button" onClick={onBack}>Back to login</button></form></main>
}
function Page({ active, data, totals, query, setQuery, setActive, receive, remove, editSponsor, editRecord, openEvent, openMember, editMember }) { if (active === 'Dashboard') return <><Dashboard data={data} totals={totals} setActive={setActive} /><PendingList expenses={data.expenses} chandha={data.chandha} receive={receive} /></>; if (['Chandha', 'Expenses', 'Sponsors'].includes(active)) return <Ledger title={active} type={active.toLowerCase()} rows={data[active.toLowerCase()]} query={query} setQuery={setQuery} receive={receive} remove={remove} editSponsor={editSponsor} editRecord={editRecord} />; if (active === 'Team Members') return <Team data={data} openMember={openMember} editMember={editMember} remove={remove} />; if (active === 'Bookings') return <Bookings rows={data.bookings} />; if (active === 'Budget') return <Budget totals={totals} />; if (active === 'Festival Program') return <Program events={data.events} openEvent={openEvent} />; return <Reports data={data} totals={totals} /> }
function Dashboard({ data, totals, setActive }) { const cards = [['Total revenue', totals.revenue, 'gold'], ['Total expenses', totals.expenses, 'red'], ['Available balance', totals.balance, 'green'], ['Pending amount', totals.pending, 'cream']]; return <><section className="stat-grid">{cards.map(([label, value, tone]) => <div className={`stat-card ${tone}`} key={label}><span>{label}</span><strong>{money(value)}</strong><small>Calculated from database records</small></div>)}</section><section className="dashboard-grid"><div className="panel financial-panel"><div className="panel-head"><div><h2>Financial overview</h2><p>Live revenue against expenses</p></div></div><div className="chart"><div className="y-labels"><span>₹60k</span><span>₹40k</span><span>₹20k</span><span>₹0</span></div><div className="bars">{[.42, .55, .38, .68, .48, .76, .58, .88, .64, .72].map((height, index) => <div className="bar-group" key={index}><div className="bar revenue" style={{ height: `${Math.min(totals.revenue / 60000, 1) * height * 100}%` }} /><div className="bar expense" style={{ height: `${Math.min(totals.expenses / 60000, 1) * height * 100}%` }} /></div>)}</div></div><div className="chart-legend">● Revenue <b>● Expenses</b></div></div><div className="panel budget-panel"><h2>Budget health</h2><p>Festival allocation</p><div className="ring" style={{ '--progress': `${Math.min(totals.utilization, 100) * 3.6}deg` }}><div><strong>{totals.utilization}%</strong><small>utilized</small></div></div><div className="budget-numbers"><div><span>Spent</span><b>{money(totals.expenses)}</b></div><div><span>Remaining</span><b className="green-text">{money(totals.budgetLeft)}</b></div><div><span>Total budget</span><b>{money(data.budget)}</b></div></div><button className="text-btn" onClick={() => setActive('Budget')}>Manage budget →</button></div></section><section className="lower-grid"><div className="panel"><div className="panel-head"><div><h2>Recent expenses</h2><p>Latest outgoing payments</p></div></div>{data.expenses.slice(0, 5).map(item => <div className="mini-row" key={item.id}><span>{item.title}<small>{item.date}</small></span><strong>{money(item.amount)}</strong></div>)}</div><div className="panel"><h2>Expense categories</h2>{[...new Set(data.expenses.map(item => item.category).filter(Boolean))].map(category => <div className="mini-row" key={category}><span>{category}</span><strong>{money(data.expenses.filter(item => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div>)}</div></section></> }
function PendingList({ expenses, chandha, receive }) { const pending = [...expenses.filter(item => item.status === 'Pending').map(item => ({ ...item, label: item.title, type: 'Expense' })), ...chandha.filter(item => item.status === 'Pending').map(item => ({ ...item, label: item.person_name, type: 'Chandha' }))]; return <section className="panel pending-panel"><div className="panel-head"><div><h2>Pending payments</h2><p>Expenses and Chandha still awaiting payment.</p></div></div>{pending.length ? pending.map(item => <div className="mini-row" key={`${item.type}-${item.id}`}><span>{item.label}<small>{item.type}{item.date ? ` · ${item.date}` : ''}</small></span><strong className="pending-amount">{money(item.amount)}</strong>{item.type === 'Chandha' && <button className="receive" onClick={() => receive('chandha', item.id)}>Receive</button>}</div>) : <p className="empty">No pending payments.</p>}</section> }
function Ledger({ title, type, rows, query, setQuery, receive, remove, editSponsor, editRecord }) { const filtered = rows.filter(item => (item.person_name || item.name || item.title || '').toLowerCase().includes(query.toLowerCase())); return <section className="panel ledger"><div className="table-tools"><h2>{title}</h2><label className="search">⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search records" /></label></div><div className="table-wrap"><table><thead><tr><th>{type === 'expenses' ? 'Expense' : type === 'chandha' ? 'Contributor' : 'Sponsor'}</th><th>{type === 'expenses' ? 'Category' : type === 'chandha' ? 'Mobile' : 'Sponsored item'}</th><th>Amount</th><th>{type === 'expenses' ? 'Spent by' : 'Status'}</th><th>Date</th><th /></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><b>{item.person_name || item.name || item.title}</b><small>{item.note}</small></td><td>{item.category || item.mobile || item.item}</td><td><strong>{money(item.amount)}</strong></td><td>{type === 'expenses' ? item.spentBy : <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>}</td><td>{item.date}</td><td><span className="row-actions">{['chandha', 'expenses'].includes(type) && <button className="row-edit" aria-label="Edit record" title="Edit record" onClick={() => editRecord({ ...item, type })}>✎</button>}{type === 'sponsors' && <button className="row-edit" aria-label="Edit sponsor" title="Edit sponsor" onClick={() => editSponsor(item)}>✎</button>}{item.status === 'Pending' && <button className="receive" onClick={() => receive(type, item.id)}>Receive</button>}<button className="row-delete" aria-label="Delete record" title="Delete record" onClick={() => remove(type, item.id)}>⌫</button></span></td></tr>)}</tbody></table></div>{!filtered.length && <p className="empty">No records found.</p>}</section> }
function RecordForm({ type, members, onClose, onSave }) { const [form, setForm] = useState({ status: 'Received', date: new Date().toISOString().slice(0, 10) }); const update = event => setForm({ ...form, [event.target.name]: event.target.value }); const expense = type === 'Expenses'; const key = expense ? 'expenses' : type.toLowerCase(); const submit = event => { event.preventDefault(); onSave(key, expense ? { ...form, amount: Number(form.amount), spentById: form.spentBy } : { ...form, person: form.person, name: form.name, amount: Number(form.amount) }) }; return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW RECORD</p><h2>Add {type.toLowerCase()}</h2></div><button type="button" onClick={onClose}>×</button></div>{expense ? <><input required name="title" onChange={update} placeholder="Expense name / item" /><div className="form-row"><input required type="number" name="amount" onChange={update} placeholder="Amount (₹)" /><select required name="category" defaultValue="" onChange={update}><option value="" disabled>Category</option>{categories.map(category => <option key={category}>{category}</option>)}</select></div><select required name="spentBy" defaultValue="" onChange={update}><option value="" disabled>Spent by</option>{members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></> : <><input required name={key === 'chandha' ? 'person' : 'name'} onChange={update} placeholder={key === 'chandha' ? 'Contributor name' : 'Sponsor name'} /><input required type="number" name="amount" onChange={update} placeholder="Amount (₹)" /><input name={key === 'chandha' ? 'mobile' : 'item'} onChange={update} placeholder={key === 'chandha' ? 'Mobile' : 'Sponsored item'} /><select name="status" onChange={update} defaultValue="Received"><option>Received</option><option>Pending</option></select></>}<button className="primary" type="submit">Save record</button></form></div> }
function Team({ data, openMember, editMember, remove }) { return <section className="team-page"><div className="panel-head"><div><h2>Team members</h2><p>People managing the festival.</p></div><button className="primary" onClick={openMember}>＋ Add member</button></div><div className="team-grid">{data.members.map(member => { const expenses = data.expenses.filter(item => item.spent_by === member.id); return <article className="member-card" key={member.id}><button className="member-edit-target" type="button" onClick={() => editMember(member)}><div className="member-avatar">{member.name.slice(0, 2).toUpperCase()}</div><h3>{member.name}</h3></button><button className="icon-delete member-delete" type="button" aria-label={`Delete ${member.name}`} title="Delete member" onClick={() => remove('team_members', member.id)}>⌫</button><p>{member.role}</p>{member.team_name && <small className="member-team-name">{member.team_name}</small>}<div className="member-stats"><span>{expenses.length} expenses</span><strong>{money(expenses.reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div></article> })}</div>{!data.members.length && <p className="empty">No team members yet. Add the people who use this festival account.</p>}</section> }
function Budget({ totals }) { return <section className="budget-page"><div className="stat-grid compact"><div className="stat-card cream"><span>Total revenue</span><strong>{money(totals.revenue)}</strong></div><div className="stat-card red"><span>Total expenses</span><strong>{money(totals.expenses)}</strong></div><div className="stat-card green"><span>Remaining budget</span><strong>{money(totals.budgetLeft)}</strong></div><div className="stat-card gold"><span>Pending revenue</span><strong>{money(totals.pending)}</strong></div></div></section> }
function Program({ events, openEvent }) { return <section className="panel events-list"><div className="panel-head"><div><h2>Festival program</h2><p>Shared schedule from Supabase.</p></div><button className="primary" onClick={openEvent}>＋ Add program</button></div>{events.length ? events.map(event => <div className="program-row" key={event.id}><div className="program-number">{String(event.day_number).padStart(2, '0')}</div><div><p>DAY {event.day_number}</p><h3>{event.title}</h3><span>{event.description || event.location}</span></div></div>) : <p className="empty">No events added yet. Add a program when the schedule is ready.</p>}</section> }
function Reports({ data, totals }) { return <section className="reports"><div className="panel report-cover"><h2>Financial transparency report</h2><p>All figures are calculated from Supabase records.</p></div><div className="report-cards"><div className="panel"><span>Total revenue</span><strong>{money(totals.revenue)}</strong></div><div className="panel"><span>Total chandha</span><strong>{money(data.chandha.reduce((sum, row) => sum + Number(row.amount), 0))}</strong></div><div className="panel"><span>Total expenses</span><strong>{money(totals.expenses)}</strong></div></div></section> }

function EventForm({ onClose, onSave }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10) })
  const update = event => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = event => { event.preventDefault(); onSave('events', form) }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW EVENT</p><h2>Add program</h2></div><button type="button" onClick={onClose}>×</button></div><div className="form-row"><input required type="number" min="1" name="day_number" onChange={update} placeholder="Day number" /><input required type="date" name="date" value={form.date} onChange={update} /></div><input required name="title" onChange={update} placeholder="Event title" /><input name="description" onChange={update} placeholder="Description" /><input name="location" onChange={update} placeholder="Location" /><div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Submit</button></div></form></div>
}

function ChandhaForm({ mode, onClose, onSave }) {
  const collection = mode === 'collection'
  const [teamName, setTeamName] = useState('')
  const [form, setForm] = useState({ status: 'Received', date: new Date().toISOString().slice(0, 10) })
  useEffect(() => { supabase.auth.getUser().then(({ data }) => setTeamName(data.user?.user_metadata?.youth_name || '')) }, [])
  const update = event => setForm({ ...form, [event.target.name]: event.target.value })
  const sendWhatsApp = () => {
    const digits = (form.mobile || '').replace(/\D/g, '')
    const phone = digits.length === 10 ? `91${digits}` : digits
    if (!phone || !form.person || !form.amount || form.status !== 'Received') return
    const message = `Hi ${form.person}, Happy Vinayaka Chaturthi! Thank you for contributing ₹${form.amount}. Thank you from Team ${teamName || 'Vigneshwara Youth Association'}.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }
  const submit = event => {
    event.preventDefault()
    onSave('chandha', { person: collection ? form.person : form.source, mobile: form.mobile, amount: Number(form.amount), status: form.status, note: form.note, date: form.date })
  }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW RECORD</p><h2>Add {collection ? 'chanda' : 'income'}</h2></div><button type="button" onClick={onClose}>×</button></div>{collection ? <><input required name="person" onChange={update} placeholder="Contributor name" /><input required name="mobile" onChange={update} placeholder="Mobile number" /><input required type="number" name="amount" onChange={update} placeholder="Amount contributed (₹)" /><select name="status" onChange={update} defaultValue="Received"><option>Received</option><option>Pending</option></select>{form.status === 'Received' && <button className="secondary whatsapp-btn" type="button" onClick={sendWhatsApp}>Send WhatsApp message</button>}</> : <><input required name="source" onChange={update} placeholder="Income name / source" /><input required type="number" name="amount" onChange={update} placeholder="Amount received (₹)" /><input required name="note" onChange={update} placeholder="Note" /><select name="status" onChange={update} defaultValue="Received"><option>Received</option><option>Pending</option></select></>}<div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Submit</button></div></form></div>
}

function MemberForm({ onClose, onSave, saving }) {
  const [form, setForm] = useState({})
  const update = event => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = event => { event.preventDefault(); onSave('members', form) }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW MEMBER</p><h2>Add member</h2></div><button type="button" onClick={onClose}>×</button></div><input required name="name" onChange={update} placeholder="Name" /><div className="form-actions"><button className="secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Add member'}</button></div></form></div>
}

function MemberEditForm({ member, onClose, onSave, saving }) {
  const [form, setForm] = useState({ ...member, photo_position: member.photo_position || 'center' })
  const update = event => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = event => { event.preventDefault(); onSave(form) }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">EDIT MEMBER</p><h2>{member.name}</h2></div><button type="button" onClick={onClose}>×</button></div><input required name="name" value={form.name || ''} onChange={update} placeholder="Name" /><input name="role" value={form.role || ''} onChange={update} placeholder="Role (optional)" /><input name="team_name" value={form.team_name || ''} onChange={update} placeholder="Team name (optional)" /><div className="form-actions"><button className="secondary" type="button" onClick={onClose} disabled={saving}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button></div></form></div>
}

function Bookings({ rows }) { return <section className="panel ledger"><div className="table-tools"><h2>Bookings</h2></div><div className="table-wrap"><table><thead><tr><th>Person</th><th>Purpose</th><th>Mobile</th><th>Full payment</th><th>Advance</th><th>Balance</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><b>{row.person_name}</b></td><td>{row.purpose_name}</td><td>{row.mobile}</td><td>{money(row.full_payment)}</td><td>{money(row.advance_paid)}</td><td><strong>{money(row.balance_amount)}</strong></td></tr>)}</tbody></table></div>{!rows.length && <p className="empty">No bookings added yet.</p>}</section> }

function BookingForm({ onClose, onSave }) { const [form, setForm] = useState({ full_payment: '', advance_paid: '' }); const update = event => setForm({ ...form, [event.target.name]: event.target.value }); const balance = Number(form.full_payment || 0) - Number(form.advance_paid || 0); const submit = event => { event.preventDefault(); onSave('bookings', { ...form, full_payment: Number(form.full_payment), advance_paid: Number(form.advance_paid) }) }; return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW BOOKING</p><h2>Add booking</h2></div><button type="button" onClick={onClose}>×</button></div><input required name="person_name" onChange={update} placeholder="Person name" /><input required name="purpose_name" onChange={update} placeholder="Purpose name" /><input required name="mobile" onChange={update} placeholder="Mobile number" /><div className="form-row"><input required min="0" type="number" name="full_payment" onChange={update} placeholder="Full payment (₹)" /><input required min="0" type="number" name="advance_paid" onChange={update} placeholder="Advance paid (₹)" /></div><p className="balance-preview">Balance amount: <strong>{money(balance)}</strong></p><div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Submit</button></div></form></div> }

function RecordEditForm({ record, members, onClose, onSave }) { const expense = record.type === 'expenses'; const [form, setForm] = useState({ ...record, person: record.person_name, spentById: record.spent_by }); const update = event => setForm({ ...form, [event.target.name]: event.target.value }); const submit = event => { event.preventDefault(); onSave({ ...form, person: form.person, amount: Number(form.amount) }); }; return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">EDIT RECORD</p><h2>Update {expense ? 'expense' : 'chandha'}</h2></div><button type="button" onClick={onClose}>×</button></div>{expense ? <><input required name="title" value={form.title || ''} onChange={update} placeholder="Expense name / item" /><div className="form-row"><input required type="number" name="amount" value={form.amount || ''} onChange={update} placeholder="Amount (₹)" /><select required name="category" value={form.category || ''} onChange={update}>{categories.map(category => <option key={category}>{category}</option>)}</select></div><select required name="spentById" value={form.spentById || ''} onChange={update}><option value="" disabled>Spent by</option>{members.map(member => <option value={member.id} key={member.id}>{member.name}</option>)}</select></> : <><input required name="person" value={form.person || ''} onChange={update} placeholder="Contributor name" /><input required name="mobile" value={form.mobile || ''} onChange={update} placeholder="Mobile" /><input required type="number" name="amount" value={form.amount || ''} onChange={update} placeholder="Amount (₹)" /><select name="status" value={form.status || 'Received'} onChange={update}><option>Received</option><option>Pending</option></select></>}<div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save changes</button></div></form></div> }

function SponsorEditForm({ sponsor, onClose, onSave }) {
  const [form, setForm] = useState({ ...sponsor })
  const update = event => setForm({ ...form, [event.target.name]: event.target.value })
  const submit = event => { event.preventDefault(); onSave(form) }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">EDIT SPONSOR</p><h2>Update sponsor</h2></div><button type="button" onClick={onClose}>×</button></div><input required name="name" value={form.name || ''} onChange={update} placeholder="Sponsor name" /><input name="item" value={form.item || ''} onChange={update} placeholder="Sponsored item" /><input required type="number" name="amount" value={form.amount || ''} onChange={update} placeholder="Amount (₹)" /><select name="status" value={form.status || 'Received'} onChange={update}><option>Received</option><option>Pending</option></select><div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Save changes</button></div></form></div>
}

export default App
