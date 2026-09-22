export type AutomationCondition = {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'contains';
  value: string | number | boolean;
};

function readPath(payload: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!current || typeof current !== 'object') return undefined;
    return (current as Record<string, unknown>)[segment];
  }, payload);
}

export function matchesConditions(
  conditions: AutomationCondition[],
  payload: Record<string, unknown>,
) {
  return conditions.every((condition) => {
    const actual = readPath(payload, condition.field);
    if (condition.operator === 'equals') return actual === condition.value;
    if (condition.operator === 'not_equals') return actual !== condition.value;
    if (condition.operator === 'greater_than')
      return (
        typeof actual === 'number' &&
        typeof condition.value === 'number' &&
        actual > condition.value
      );
    if (condition.operator === 'contains') {
      if (typeof actual === 'string')
        return actual
          .toLowerCase()
          .includes(String(condition.value).toLowerCase());
      if (Array.isArray(actual)) return actual.includes(condition.value);
    }
    return false;
  });
}

export function calculateAvailableAt(now: Date, delayDays: number) {
  const result = new Date(now);
  result.setUTCDate(result.getUTCDate() + Math.max(0, delayDays));
  return result;
}

export function retryDelayMinutes(completedAttempts: number, maxAttempts = 3) {
  if (completedAttempts >= maxAttempts) return null;
  return 2 ** completedAttempts;
}
