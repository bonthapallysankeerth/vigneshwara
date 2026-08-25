import { supabase } from './supabase'

const tables = ['chandha', 'expenses', 'sponsors', 'festival_programs', 'bookings', 'team_members']

const requireClient = () => {
  if (!supabase) throw new Error('Supabase is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to .env.')
  return supabase
}

export async function fetchFestivalData(ownerId, userId = ownerId) {
  const client = requireClient()
  const [chandha, expenses, sponsors, members, budget, programs, bookings, profile] = await Promise.all([
    client.from('chandha').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    client.from('expenses').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    client.from('sponsors').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    client.from('team_members').select('*').eq('owner_id', ownerId).order('created_at'),
    client.from('budget').select('*').eq('owner_id', ownerId).order('updated_at', { ascending: false }).limit(1).maybeSingle(),
    client.from('festival_programs').select('*').eq('owner_id', ownerId).order('day_number'),
    client.from('bookings').select('*').eq('owner_id', ownerId).order('created_at', { ascending: false }),
    client.from('user_profiles').select('*').eq('association_id', ownerId),
  ])
  const result = [chandha, expenses, sponsors, members, budget, programs, bookings, profile].find(entry => entry.error)
  if (result) throw result.error
  const memberById = new Map((members.data || []).map(member => [member.id, member]))
  return {
    chandha: chandha.data || [],
    expenses: (expenses.data || []).map(row => ({ ...row, spentBy: memberById.get(row.spent_by)?.name || 'Unassigned', spentById: row.spent_by })),
    sponsors: sponsors.data || [],
    members: members.data || [],
    budget: Number(budget.data?.total_budget || 0),
    events: programs.data || [],
    bookings: bookings.data || [],
    profile: profile.data?.find(item => item.id === userId) || null,
    accountProfiles: profile.data || [],
  }
}

export async function insertRecord(table, payload, userId, ownerId = userId) {
  const client = requireClient()
  const record = { ...payload, owner_id: ownerId }
  if (table !== 'team_members') record.created_by = userId
  const { data, error } = await client.from(table).insert(record).select().single()
  if (error) throw error
  return data
}

export async function updateRecord(table, id, payload, userId) {
  const client = requireClient()
  const { data, error } = await client.from(table).update(payload).eq('id', id).eq('owner_id', userId).select().single()
  if (error) throw error
  return data
}

export async function deleteRecord(table, id, userId) {
  const client = requireClient()
  const { error } = await client.from(table).delete().eq('id', id).eq('owner_id', userId)
  if (error) throw error
}

export async function updateBudget(value, userId) {
  const client = requireClient()
  const { data: existing, error: readError } = await client.from('budget').select('id').eq('owner_id', userId).limit(1).maybeSingle()
  if (readError) throw readError
  const query = existing
    ? client.from('budget').update({ total_budget: value, updated_by: userId }).eq('id', existing.id).eq('owner_id', userId)
    : client.from('budget').insert({ total_budget: value, updated_by: userId, owner_id: userId })
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