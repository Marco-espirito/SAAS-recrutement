export type AutomationPredicate = {
  field: string;
  operator: 'equals' | 'not_equals' | 'greater_than' | 'contains';
  value: string | number | boolean;
};

export type AutomationCondition =
  | AutomationPredicate
  | {
      operator: 'all' | 'any';
      conditions: AutomationCondition[];
    };

export function isAutomationCondition(
  value: unknown,
  depth = 0,
): value is AutomationCondition {
  if (!value || typeof value !== 'object' || depth > 4) return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.operator === 'all' || candidate.operator === 'any') {
    return (
      Array.isArray(candidate.conditions) &&
      candidate.conditions.length > 0 &&
      candidate.conditions.length <= 20 &&
      candidate.conditions.every((child) =>
        isAutomationCondition(child, depth + 1),
      )
    );
  }
  return (
    typeof candidate.field === 'string' &&
    candidate.field.length > 0 &&
    candidate.field.length <= 200 &&
    ['equals', 'not_equals', 'greater_than', 'contains'].includes(
      String(candidate.operator),
    ) &&
    ['string', 'number', 'boolean'].includes(typeof candidate.value) &&
    (typeof candidate.value !== 'string' || candidate.value.length <= 500)
  );
}

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
  return conditions.every((condition) => matchesCondition(condition, payload));
}

function matchesCondition(
  condition: AutomationCondition,
  payload: Record<string, unknown>,
): boolean {
  if ('conditions' in condition)
    return condition.operator === 'all'
      ? condition.conditions.every((child) => matchesCondition(child, payload))
      : condition.conditions.some((child) => matchesCondition(child, payload));
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
