import 'server-only';
import { env } from './env';

export function emailProviderConfigured() {
  const configuration = env();
  return Boolean(
    configuration.EMAIL_PROVIDER_URL && configuration.EMAIL_PROVIDER_API_KEY,
  );
}

export async function sendSystemEmail(input: {
  to: string;
  subject: string;
  text: string;
}) {
  const configuration = env();
  if (
    !configuration.EMAIL_PROVIDER_URL ||
    !configuration.EMAIL_PROVIDER_API_KEY
  )
    return false;
  const response = await fetch(configuration.EMAIL_PROVIDER_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${configuration.EMAIL_PROVIDER_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error('Email provider rejected the message');
  return true;
}
