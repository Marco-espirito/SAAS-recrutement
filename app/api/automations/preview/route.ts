import { automationPreviewInput } from '@/lib/domain/automation-schema';
import {
  calculateAvailableAt,
  matchesConditions,
} from '@/lib/domain/automation';
import { handleApiError, readJson, requireSession } from '@/lib/server/http';

export async function POST(request: Request) {
  try {
    await requireSession(['OWNER', 'ADMIN', 'RECRUITER']);
    const input = await readJson(request, automationPreviewInput);
    const matches = matchesConditions(input.conditions, input.payload);
    return Response.json({
      matches,
      scheduledAt: matches
        ? calculateAvailableAt(new Date(), input.delayDays).toISOString()
        : null,
      actions: matches ? input.actions : [],
      executed: false,
    });
  } catch (error) {
    return handleApiError(error);
  }
}
