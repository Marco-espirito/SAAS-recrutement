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
        googleOAuth: Boolean(
          configuration.GOOGLE_OAUTH_CLIENT_ID &&
          configuration.GOOGLE_OAUTH_CLIENT_SECRET &&
          configuration.APP_ENCRYPTION_KEY,
        ),
        microsoftOAuth: Boolean(
          configuration.MICROSOFT_OAUTH_CLIENT_ID &&
          configuration.MICROSOFT_OAUTH_CLIENT_SECRET &&
          configuration.APP_ENCRYPTION_KEY,
        ),
        slackOAuth: Boolean(
          configuration.SLACK_OAUTH_CLIENT_ID &&
          configuration.SLACK_OAUTH_CLIENT_SECRET &&
          configuration.APP_ENCRYPTION_KEY,
        ),
      },
    });
  } catch (error) {
    return handleApiError(error);
  }
}
