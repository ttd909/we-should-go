import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // API routes handle their own auth so callers like iOS Shortcuts get JSON
  // errors instead of a browser-oriented redirect to /login.
  if (pathname.startsWith('/api/')) {
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Must call getUser() not getSession() to avoid trusting a stale JWT
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isAuthRoute = [
    '/login',
    '/signup',
    '/forgot-password',
    '/reset-password',
    '/auth',
  ].some((route) => pathname === route || pathname.startsWith(`${route}/`))

  if (!user && !isAuthRoute) {
    const url = request.nextUrl.clone()
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(next)}`
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
