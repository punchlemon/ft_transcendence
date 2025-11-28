import { ActiveSessionsPanel } from '../components/settings/ActiveSessionsPanel'

const SettingsPage = () => {
  return (
    <div className="mx-auto max-w-3xl px-6 py-8">
      <h1 className="mb-8 text-2xl font-bold text-slate-900">Account Settings</h1>
      
      <div className="space-y-8">
        {/* Future: 2FA Setup Section */}
        
        <ActiveSessionsPanel />
      </div>
    </div>
  )
}

export default SettingsPage
