import { supabase } from './supabase'

const tables = ['chandha', 'expenses', 'sponsors', 'festival_programs']

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  return supabase
}

export async function fetchFestivalData() {
  const client = requireClient()
  const [chandha, expenses, sponsors, members, budget, programs] = await Promise.all([
    client.from('chandha').select('*').order('created_at', { ascending: false }),
    client.from('expenses').select('*, team_members(id, name, role)').order('created_at', { ascending: false }),
    client.from('sponsors').select('*').order('created_at', { ascending: false }),
    client.from('team_members').select('*').order('created_at'),
    client.from('budget').select('*').order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('festival_programs').select('*').order('day_number'),
  ])
  const result = [chandha, expenses, sponsors, members, budget, programs].find(entry => entry.error)
  if (result) throw result.error
  return {
    chandha: chandha.data || [],
    expenses: (expenses.data || []).map(row => ({ ...row, spentBy: row.team_members?.name || 'Unassigned', spentById: row.spent_by })),
    sponsors: sponsors.data || [],
    members: members.data || [],
    budget: Number(budget.data?.total_budget || 0),
    events: programs.data || [],
  }
}

export async function insertRecord(table, payload, userId) {
  const client = requireClient()
  const { data, error } = await client.from(table).insert({ ...payload, created_by: userId }).select().single()
  if (error) throw error
  return data
}

export async function updateRecord(table, id, payload) {
  const client = requireClient()
  const { data, error } = await client.from(table).update(payload).eq('id', id).select().single()
  if (error) throw error
  return data
}

export async function deleteRecord(table, id) {
  const client = requireClient()
  const { error } = await client.from(table).delete().eq('id', id)
  if (error) throw error
}

export async function updateBudget(value, userId) {
  const client = requireClient()
  const { data: existing, error: readError } = await client.from('budget').select('id').limit(1).maybeSingle()
  if (readError) throw readError
  const query = existing
    ? client.from('budget').update({ total_budget: value, updated_by: userId }).eq('id', existing.id)
    : client.from('budget').insert({ total_budget: value, updated_by: userId })
  const { data, error } = await query.select().single()
  if (error) throw error
  return data
}

export function subscribeToFestivalData(onChange) {
  if (!supabase) return () => {}
  const channel = supabase.channel('festival-data')
  tables.concat('budget').forEach(table => channel.on('postgres_changes', { event: '*', schema: 'public', table }, onChange))
  channel.subscribe()
  return () => { supabase.removeChannel(channel) }
}