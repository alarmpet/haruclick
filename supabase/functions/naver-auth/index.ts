
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// 1. Setup Supabase Client
// Edge Runtime automatically provides these env vars
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const supabaseServiceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''

// Admin Client (for user management)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey)

// Public Client (for signing in)
const supabasePublic = createClient(supabaseUrl, supabaseAnonKey)

serve(async (req) => {
  try {
    const { accessToken } = await req.json()

    if (!accessToken) {
      throw new Error('No access token provided')
    }

    // 2. Verify Token with Naver
    const naverResponse = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    })
    const naverData = await naverResponse.json()

    if (naverData.resultcode !== '00') {
      throw new Error(`Naver API Error: ${naverData.message}`)
    }

    const { email, id: naverId, name, profile_image, mobile } = naverData.response

    if (!email) {
      throw new Error('Email is required from Naver Account')
    }

    // 3. Find or Create User
    // We try to sign in first? No, we don't know the password.
    // We check if user exists.
    const { data: { users }, error: listError } = await supabaseAdmin.auth.admin.listUsers()

    // In production with many users, use 'getUserByEmail' if available or just try create.
    let user = users.find((u) => u.email === email)
    let userId = ''

    // IMPORTANT: We generate a random password to facilitate sign-in
    // This password is effectively transient as the user login via OAuth primarily.
    const tempPassword = crypto.randomUUID() + crypto.randomUUID()

    if (user) {
      userId = user.id
      // Update User: Set metadata AND reset password to known random value
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
        email_confirm: true,
        user_metadata: { naver_id: naverId, full_name: name, avatar_url: profile_image, phone: mobile }
      })
      if (updateError) throw updateError
    } else {
      // Create User
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: { naver_id: naverId, full_name: name, avatar_url: profile_image, phone: mobile }
      })
      if (createError) throw createError
      userId = newUser.user.id
    }

    // 4. Sign In to get Session
    // Now that we set the password, we can sign in to get a valid session token properly mint by GoTrue
    const { data: sessionData, error: signInError } = await supabasePublic.auth.signInWithPassword({
      email,
      password: tempPassword
    })

    if (signInError) throw signInError

    // Return the session
    return new Response(
      JSON.stringify({
        session: sessionData.session
      }),
      { headers: { 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
