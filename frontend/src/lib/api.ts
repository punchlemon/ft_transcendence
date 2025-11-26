import axios from 'axios'

const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api'
})

export const fetchHealth = async () => {
  const response = await apiClient.get('/api/health')
  return response.data as { status: string; timestamp: string }
}
