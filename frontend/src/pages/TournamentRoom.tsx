// TournamentRoom UI removed. If this component is ever rendered, redirect to home.
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export default function TournamentRoomPage() {
  const navigate = useNavigate()
  useEffect(() => {
    navigate('/', { replace: true })
  }, [navigate])
  return null
}
