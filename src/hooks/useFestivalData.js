import { useEffect, useState } from 'react'
import { fetchFestivalData, subscribeToFestivalData } from '../services/festivalService'
import { isSupabaseConfigured, supabase } from '../services/supabase'

export function useFestivalData(user) {
  const [data, setData] = useState({ chandha: [], sponsors: [], expenses: [], events: [], bookings: [], members: [], budget: 0, profile: null, accountProfiles: [] })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [syncState, setSyncState] = useState('Connecting...')
  const refresh = async () => {
    try { setLoading(true); setError(''); setData(await fetchFestivalData(user.user_metadata?.association_id || user.id, user.id)); setSyncState('All changes saved') }
    catch (loadError) { console.error(loadError); setError('Unable to connect to the festival database. Please check your internet connection.'); setSyncState('Database unavailable') }
    finally { setLoading(false) }
  }
  useEffect(() => {
    if (!user || !isSupabaseConfigured) return undefined
    Promise.resolve().then(refresh)
    return subscribeToFestivalData(refresh)
  }, [user])
  useEffect(() => {
    if (!supabase || !user) return undefined
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => { if (!session) window.location.reload() })
    return () => listener.subscription.unsubscribe()
  }, [user])
  return { data, loading, error, syncState, refresh, setError }
}