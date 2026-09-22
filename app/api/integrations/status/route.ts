import { env } from '@/lib/server/env';
import { handleApiError, requireSession } from '@/lib/server/http';

export async function GET() {
  try {
    await requireSession(['OWNER', 'ADMIN']);
    const configuration = env();
    return Response.json({
      integrations: {
        openai: Boolean(configuration.OPENAI_API_KEY),
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
