import { getSession } from '@/lib/server/auth';

export async function GET() {
  const user = await getSession();
  return user
    ? Response.json({ user })
    : Response.json({ user: null }, { status: 401 });
}
