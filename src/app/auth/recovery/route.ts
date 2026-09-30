import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const tokenHash = request.nextUrl.searchParams.get('token_hash')
  const type = request.nextUrl.searchParams.get('type')
  const failure = new URL('/auth/forgot-password?error=recovery', request.url)

  if (!tokenHash || type !== 'recovery') {
    return NextResponse.redirect(failure)
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'recovery',
  })

  const response = NextResponse.redirect(error ? failure : new URL('/auth/reset-password', request.url))
  response.headers.set('Cache-Control', 'no-store')
  response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}
