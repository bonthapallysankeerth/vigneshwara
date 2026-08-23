import { useEffect, useMemo, useState } from 'react'
import './App.css'
import './AppAdditions.css'
import { deleteRecord, insertRecord, updateBudget, updateRecord } from './services/festivalService'
import { isSupabaseConfigured, supabase } from './services/supabase'
import { useFestivalData } from './hooks/useFestivalData'

const categories = ['Decoration', 'Pooja Items', 'Food', 'Electricity', 'Sound System', 'Cultural Program', 'Transportation', 'Printing', 'Cleaning', 'Maintenance', 'Other']
const money = value => `₹${Number(value || 0).toLocaleString('en-IN')}`

function App() {
  const [user, setUser] = useState(undefined)
  const [active, setActive] = useState('Dashboard')
  const [modal, setModal] = useState(null)
  const [query, setQuery] = useState('')
  const [menu, setMenu] = useState(false)
  const [toast, setToast] = useState('')
  const [operationError, setOperationError] = useState('')
  const { data, loading, error, syncState, refresh } = useFestivalData(user)

  useEffect(() => {
    if (!supabase) { Promise.resolve().then(() => setUser(null)); return undefined }
    supabase.auth.getSession().then(({ data: sessionData }) => setUser(sessionData.session?.user || null))
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user || null))
    return () => listener.subscription.unsubscribe()
  }, [])

  const totals = useMemo(() => {
    const sum = (rows, status) => rows.filter(row => !status || row.status === status).reduce((total, row) => total + Number(row.amount || 0), 0)
    const expenses = sum(data.expenses)
    const revenue = sum(data.chandha, 'Received') + sum(data.sponsors, 'Received')
    const pending = sum(data.chandha, 'Pending') + sum(data.sponsors, 'Pending')
    return { revenue, expenses, pending, balance: revenue - expenses, budgetLeft: data.budget - expenses, utilization: data.budget ? Math.round(expenses / data.budget * 100) : 0 }
  }, [data])

  const run = async action => {
    try { setOperationError(''); await action(); await refresh(); setToast('Record saved successfully.'); window.setTimeout(() => setToast(''), 2500) }
    catch (saveError) { console.error(saveError); setOperationError(saveError.message || 'Unable to save the record.') }
  }
  const save = (key, item) => run(async () => {
    const table = key === 'events' ? 'festival_programs' : key
    const payload = key === 'chandha' ? { person_name: item.person, mobile: item.mobile, amount: item.amount, status: item.status, date: item.date, note: item.note } : key === 'expenses' ? { title: item.title, amount: item.amount, category: item.category, note: item.note, spent_by: item.spentById, date: item.date } : key === 'events' ? { day_number: item.day_number, title: item.title, description: item.description, date: item.date, location: item.location, status: 'Planned' } : { name: item.name, item: item.item, amount: item.amount, status: item.status, date: item.date, note: item.note }
    await insertRecord(table, payload, user.id)
    setModal(null)
  })
  const remove = (table, id) => { if (window.confirm('Are you sure you want to delete this record?')) run(() => deleteRecord(table, id)) }
  const receive = (table, id) => run(() => updateRecord(table, id, { status: 'Received' }))
  const setBudget = value => run(() => updateBudget(Number(value), user.id))
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
  if (!user) return <Login />

  const nav = ['Dashboard', 'Chandha', 'Expenses', 'Sponsors', 'Team Members', 'Budget', 'Festival Program', 'Records / Reports']
  return <div className="app-shell">
    <aside className={menu ? 'sidebar open' : 'sidebar'}><div className="brand"><div className="brand-mark">ॐ</div><div><strong>VIGNESHWARA<br />YOUTH</strong><small>FESTIVAL MANAGEMENT</small></div></div><div className="festival-chip"><span className="live-dot" /> FESTIVAL 2026 <b>10 DAYS</b></div><nav>{nav.map(item => <button className={active === item ? 'nav-item active' : 'nav-item'} key={item} onClick={() => { setActive(item); setMenu(false) }}>{item}</button>)}</nav><div className="sidebar-bottom"><div className="committee"><div className="avatar">VT</div><div><b>Vigneshwara Team</b><small>{user.email}</small></div></div><button className="logout" onClick={signOut}>↪ &nbsp; Sign out</button></div></aside>
    <main className="main"><header><button className="hamburger" onClick={() => setMenu(!menu)}>☰</button><div className="crumb">Festival Management <b>/</b> {active}</div><div className="header-actions"><span className="sync">● {syncState}</span><div className="header-avatar">VT</div></div></header>
      <div className="content"><div className="page-heading"><div><p className="eyebrow">FESTIVAL MANAGEMENT <span>•</span> SHARED DATABASE</p><h1>{active === 'Dashboard' ? 'Hi Vigneshwara Team' : active}</h1><p className="subheading">{active === 'Dashboard' ? 'Here’s the financial pulse of your festival.' : 'Keep every detail accounted for, together.'}</p></div>{active === 'Chandha' ? <div className="heading-actions"><button className="secondary" onClick={() => setModal('ChandhaCollection')}>＋ Add chanda</button><button className="primary" onClick={() => setModal('Income')}>＋ Add income</button></div> : ['Expenses', 'Sponsors'].includes(active) && <button className="primary" onClick={() => setModal(active)}>＋ Add {active === 'Expenses' ? 'expense' : 'sponsor'}</button>}</div>
        {(error || operationError) && <p className="login-error">{operationError || error}</p>}
        {loading ? <section className="panel loading">Loading {active}...</section> : <Page active={active} data={data} totals={totals} query={query} setQuery={setQuery} setActive={setActive} receive={receive} remove={remove} setBudget={setBudget} openEvent={() => setModal('Event')} />}
      </div>
    </main>
    {modal === 'ChandhaCollection' && <ChandhaForm mode="collection" onClose={() => setModal(null)} onSave={save} />}{modal === 'Income' && <ChandhaForm mode="income" onClose={() => setModal(null)} onSave={save} />}{modal === 'Event' && <EventForm onClose={() => setModal(null)} onSave={save} />}{modal && !['ChandhaCollection', 'Income', 'Event'].includes(modal) && <RecordForm type={modal} members={data.members} onClose={() => setModal(null)} onSave={save} />}{toast && <div className="toast">✓ &nbsp;{toast}</div>}
  </div>
}

function Login() { const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [error, setError] = useState(''); const submit = async event => { event.preventDefault(); const { error: authError } = await supabase.auth.signInWithPassword({ email, password }); if (authError) setError(authError.message) }; return <main className="login-page"><form className="login-card" onSubmit={submit}><div className="brand-mark">ॐ</div><p className="eyebrow">VIGNESHWARA YOUTH</p><h1>Welcome back</h1><p className="login-copy">Sign in to the shared festival records.</p><label>Email<input required type="email" value={email} onChange={event => setEmail(event.target.value)} /></label><label>Password<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>{error && <p className="login-error">{error}</p>}<button className="primary" type="submit">Sign in</button></form></main> }
function Page({ active, data, totals, query, setQuery, setActive, receive, remove, setBudget, openEvent }) { if (active === 'Dashboard') return <Dashboard data={data} totals={totals} setActive={setActive} />; if (['Chandha', 'Expenses', 'Sponsors'].includes(active)) return <Ledger title={active} type={active.toLowerCase()} rows={data[active.toLowerCase()]} query={query} setQuery={setQuery} receive={receive} remove={remove} />; if (active === 'Team Members') return <Team data={data} />; if (active === 'Budget') return <Budget data={data} totals={totals} setBudget={setBudget} />; if (active === 'Festival Program') return <Program events={data.events} openEvent={openEvent} />; return <Reports data={data} totals={totals} /> }
function Dashboard({ data, totals, setActive }) { const cards = [['Total revenue', totals.revenue, 'gold'], ['Total expenses', totals.expenses, 'red'], ['Available balance', totals.balance, 'green'], ['Pending amount', totals.pending, 'cream']]; return <><section className="stat-grid">{cards.map(([label, value, tone]) => <div className={`stat-card ${tone}`} key={label}><span>{label}</span><strong>{money(value)}</strong><small>Calculated from database records</small></div>)}</section><section className="dashboard-grid"><div className="panel financial-panel"><div className="panel-head"><div><h2>Financial overview</h2><p>Live revenue against expenses</p></div></div><div className="chart"><div className="y-labels"><span>₹60k</span><span>₹40k</span><span>₹20k</span><span>₹0</span></div><div className="bars">{[.42, .55, .38, .68, .48, .76, .58, .88, .64, .72].map((height, index) => <div className="bar-group" key={index}><div className="bar revenue" style={{ height: `${Math.min(totals.revenue / 60000, 1) * height * 100}%` }} /><div className="bar expense" style={{ height: `${Math.min(totals.expenses / 60000, 1) * height * 100}%` }} /></div>)}</div></div><div className="chart-legend">● Revenue <b>● Expenses</b></div></div><div className="panel budget-panel"><h2>Budget health</h2><p>Festival allocation</p><div className="ring" style={{ '--progress': `${Math.min(totals.utilization, 100) * 3.6}deg` }}><div><strong>{totals.utilization}%</strong><small>utilized</small></div></div><div className="budget-numbers"><div><span>Spent</span><b>{money(totals.expenses)}</b></div><div><span>Remaining</span><b className="green-text">{money(totals.budgetLeft)}</b></div><div><span>Total budget</span><b>{money(data.budget)}</b></div></div><button className="text-btn" onClick={() => setActive('Budget')}>Manage budget →</button></div></section><section className="lower-grid"><div className="panel"><div className="panel-head"><div><h2>Recent expenses</h2><p>Latest outgoing payments</p></div></div>{data.expenses.slice(0, 5).map(item => <div className="mini-row" key={item.id}><span>{item.title}<small>{item.date}</small></span><strong>{money(item.amount)}</strong></div>)}</div><div className="panel"><h2>Expense categories</h2>{[...new Set(data.expenses.map(item => item.category).filter(Boolean))].map(category => <div className="mini-row" key={category}><span>{category}</span><strong>{money(data.expenses.filter(item => item.category === category).reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div>)}</div></section></> }
function Ledger({ title, type, rows, query, setQuery, receive, remove }) { const filtered = rows.filter(item => (item.person_name || item.name || item.title || '').toLowerCase().includes(query.toLowerCase())); return <section className="panel ledger"><div className="table-tools"><h2>{title}</h2><label className="search">⌕<input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search records" /></label></div><div className="table-wrap"><table><thead><tr><th>{type === 'expenses' ? 'Expense' : type === 'chandha' ? 'Contributor' : 'Sponsor'}</th><th>{type === 'expenses' ? 'Category' : type === 'chandha' ? 'Mobile' : 'Sponsored item'}</th><th>Amount</th><th>{type === 'expenses' ? 'Spent by' : 'Status'}</th><th>Date</th><th /></tr></thead><tbody>{filtered.map(item => <tr key={item.id}><td><b>{item.person_name || item.name || item.title}</b><small>{item.note}</small></td><td>{item.category || item.mobile || item.item}</td><td><strong>{money(item.amount)}</strong></td><td>{type === 'expenses' ? item.spentBy : <span className={`status ${item.status.toLowerCase()}`}>{item.status}</span>}</td><td>{item.date}</td><td>{item.status === 'Pending' && <button className="receive" onClick={() => receive(type, item.id)}>Receive</button>}<button className="delete" onClick={() => remove(type, item.id)}>Delete</button></td></tr>)}</tbody></table></div>{!filtered.length && <p className="empty">No records found.</p>}</section> }
function RecordForm({ type, members, onClose, onSave }) { const [form, setForm] = useState({ status: 'Received', date: new Date().toISOString().slice(0, 10) }); const update = event => setForm({ ...form, [event.target.name]: event.target.value }); const expense = type === 'Expenses'; const key = expense ? 'expenses' : type.toLowerCase(); const submit = event => { event.preventDefault(); onSave(key, expense ? { ...form, amount: Number(form.amount), spentById: form.spentBy } : { ...form, person: form.person, name: form.name, amount: Number(form.amount) }) }; return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW RECORD</p><h2>Add {type.toLowerCase()}</h2></div><button type="button" onClick={onClose}>×</button></div>{expense ? <><input required name="title" onChange={update} placeholder="Expense name / item" /><div className="form-row"><input required type="number" name="amount" onChange={update} placeholder="Amount (₹)" /><select required name="category" defaultValue="" onChange={update}><option value="" disabled>Category</option>{categories.map(category => <option key={category}>{category}</option>)}</select></div><select required name="spentBy" defaultValue="" onChange={update}><option value="" disabled>Spent by</option>{members.map((member, index) => <option value={member.id} key={member.id}>{member.name} — Team Member #{index + 1}</option>)}</select></> : <><input required name={key === 'chandha' ? 'person' : 'name'} onChange={update} placeholder={key === 'chandha' ? 'Contributor name' : 'Sponsor name'} /><input required type="number" name="amount" onChange={update} placeholder="Amount (₹)" /><input name={key === 'chandha' ? 'mobile' : 'item'} onChange={update} placeholder={key === 'chandha' ? 'Mobile' : 'Sponsored item'} /><select name="status" onChange={update} defaultValue="Received"><option>Received</option><option>Pending</option></select></>}<button className="primary" type="submit">Save record</button></form></div> }
function Team({ data }) { return <section className="team-grid">{data.members.map(member => { const expenses = data.expenses.filter(item => item.spent_by === member.id); return <div className="member-card" key={member.id}><div className="member-avatar">{member.name.slice(0, 2).toUpperCase()}</div><h3>{member.name}</h3><p>{member.role}</p><div className="member-stats"><span>{expenses.length} expenses</span><strong>{money(expenses.reduce((sum, item) => sum + Number(item.amount), 0))}</strong></div></div> })}</section> }
function Budget({ data, totals, setBudget }) { const [value, setValue] = useState(data.budget); return <section className="budget-page"><div className="panel budget-hero"><div><p className="eyebrow">FINANCIAL CONTROL</p><h2>Know where every rupee stands.</h2><p>Set the total budget for the celebration.</p></div><div className="big-budget"><span>Total budget</span><strong>{money(data.budget)}</strong><input type="number" value={value} onChange={event => setValue(event.target.value)} onBlur={() => setBudget(value)} /></div></div><div className="stat-grid compact"><div className="stat-card cream"><span>Total revenue</span><strong>{money(totals.revenue)}</strong></div><div className="stat-card red"><span>Total expenses</span><strong>{money(totals.expenses)}</strong></div><div className="stat-card green"><span>Remaining budget</span><strong>{money(totals.budgetLeft)}</strong></div><div className="stat-card gold"><span>Pending revenue</span><strong>{money(totals.pending)}</strong></div></div></section> }
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
  const [form, setForm] = useState({ status: 'Received', date: new Date().toISOString().slice(0, 10) })
  const update = event => setForm({ ...form, [event.target.name]: event.target.value })
  const sendWhatsApp = () => {
    const digits = (form.mobile || '').replace(/\D/g, '')
    const phone = digits.length === 10 ? `91${digits}` : digits
    if (!phone || !form.person || !form.amount || form.status !== 'Received') return
    const message = `Happy Vinayaka Chaturthi ${form.person}! Thank you for contributing ₹${form.amount}. Thank you from Team Vigneshwara Youth Association.`
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, '_blank', 'noopener,noreferrer')
  }
  const submit = event => {
    event.preventDefault()
    onSave('chandha', { person: collection ? form.person : form.source, mobile: form.mobile, amount: Number(form.amount), status: form.status, note: form.note, date: form.date })
  }
  return <div className="modal-backdrop"><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">NEW RECORD</p><h2>Add {collection ? 'chanda' : 'income'}</h2></div><button type="button" onClick={onClose}>×</button></div>{collection ? <><input required name="person" onChange={update} placeholder="Contributor name" /><input required name="mobile" onChange={update} placeholder="Mobile number" /><input required type="number" name="amount" onChange={update} placeholder="Amount contributed (₹)" /><select name="status" onChange={update} defaultValue="Received"><option>Received</option><option>Pending</option></select>{form.status === 'Received' && <button className="secondary whatsapp-btn" type="button" onClick={sendWhatsApp}>Send WhatsApp message</button>}</> : <><input required name="source" onChange={update} placeholder="Income name / source" /><input required type="number" name="amount" onChange={update} placeholder="Amount received (₹)" /><input required name="note" onChange={update} placeholder="Note" /><select name="status" onChange={update} defaultValue="Received"><option>Received</option><option>Pending</option></select></>}<div className="form-actions"><button className="secondary" type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit">Submit</button></div></form></div>
}

export default App
