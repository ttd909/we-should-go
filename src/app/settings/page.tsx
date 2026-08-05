import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { CopyToken } from '@/components/settings/copy-token'
import { ChangePasswordForm } from '@/components/settings/change-password-form'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('personal_api_token')
    .eq('id', user.id)
    .single()

  return (
    <main className="max-w-2xl mx-auto px-4 py-8 space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-medium">Personal API token</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Use this token in the iOS Shortcut to save reels directly from TikTok, Instagram, or Facebook
            without opening the app. Treat it like a password — it grants access to your Dreamlists.
          </p>
        </div>

        {profile?.personal_api_token ? (
          <CopyToken token={profile.personal_api_token} />
        ) : (
          <p className="text-sm text-muted-foreground">Token not available.</p>
        )}

        <div className="text-xs text-muted-foreground space-y-1 pt-1">
          <p><strong>How to use:</strong> In the iOS Shortcut, paste this token into the Authorization field as <code>Bearer &lt;token&gt;</code>.</p>
          <p>Android users who install the PWA get share-sheet access automatically — no token needed.</p>
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-base font-medium">Account</h2>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <ChangePasswordForm />
      </section>
    </main>
  )
}
