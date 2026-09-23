import { readClientPortal } from '@/lib/server/client-portal';
import { handleApiError } from '@/lib/server/http';
import { rateLimit } from '@/lib/server/rate-limit';

export async function GET(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    await rateLimit(
      `portal:${request.headers.get('x-forwarded-for')?.split(',')[0] ?? 'unknown'}`,
      60,
      3_600,
    );
    const data = await readClientPortal(token);
    return Response.json(data, {
      headers: {
        'cache-control': 'no-store',
        'referrer-policy': 'no-referrer',
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
