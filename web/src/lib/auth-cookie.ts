// Name of the app session cookie. Lives in its own dependency-free module so
// the edge proxy (src/proxy.ts, S9-A CSRF gate) can read it without pulling
// in lib/auth.ts — which imports `server-only`, bcrypt, Supabase, referrals
// and the nurture queue. lib/auth.ts re-exports it, so every existing
// `import { SESSION_COOKIE } from "@/lib/auth"` keeps working.
export const SESSION_COOKIE = "blockid_session";
