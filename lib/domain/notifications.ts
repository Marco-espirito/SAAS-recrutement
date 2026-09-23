export const notificationCategories = [
  'REMINDERS',
  'PIPELINE',
  'MENTIONS',
  'DIGEST',
  'SYSTEM',
] as const;
export type NotificationCategory = (typeof notificationCategories)[number];

export const digestFrequencies = ['NEVER', 'DAILY', 'WEEKLY'] as const;
export type DigestFrequency = (typeof digestFrequencies)[number];
