import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { ResetPasswordForm } from '@/components/ResetPasswordForm'

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) redirect('/auth/forgot-password?error=recovery')

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-2xl font-bold mb-2">Choose a new password</h1>
      <p className="text-sm text-zinc-400 mb-6">Enter your new password twice to confirm it.</p>
      <ResetPasswordForm />
    </div>
  )
}
