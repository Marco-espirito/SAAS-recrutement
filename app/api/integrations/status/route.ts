import { env } from '@/lib/server/env';
import { resolveAiProvider } from '@/lib/server/ai';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    await requireSession(['OWNER', 'ADMIN']);
    const configuration = env();
    return Response.json({
      integrations: {
        ai: Boolean(resolveAiProvider()),
        email: Boolean(
          configuration.EMAIL_PROVIDER_URL &&
          configuration.EMAIL_PROVIDER_API_KEY,
        ),
        jobs: Boolean(
          configuration.JOBS_PROVIDER_URL &&
          configuration.JOBS_PROVIDER_API_KEY,
        ),
        calendar: Boolean(
          configuration.CALENDAR_PROVIDER_URL &&
          configuration.CALENDAR_PROVIDER_API_KEY,
        ),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
