interface AuditChanges {
  attributes: object;
  previous: object;
}

interface AuditChange {
  attribute: string;
  previousValue: string;
  value: string;
}

const sensitiveAttributeNames = [
  "apikey",
  "authorization",
  "key",
  "password",
  "secret",
  "token",
];

/**
 * Formats an audit event's changed values for display without exposing secrets.
 *
 * @param changes - the attributes before and after the audited operation.
 * @returns the display-safe changes in their recorded order.
 */
export function getAuditChanges(changes: AuditChanges | null): AuditChange[] {
  if (!changes) {
    return [];
  }

  const previousValues = new Map(Object.entries(changes.previous));

  return Object.entries(changes.attributes).map(([attribute, value]) => ({
    attribute,
    previousValue: formatAuditValue(attribute, previousValues.get(attribute)),
    value: formatAuditValue(attribute, value),
  }));
}

/**
 * Appends only new records returned by a paginated query.
 *
 * @param current - the records already displayed for the query.
 * @param next - the next page returned by the query.
 * @returns the combined records without duplicate identifiers.
 */
export function appendUniqueById<T extends { id: string }>(
  current: T[],
  next: T[]
): T[] {
  const currentIds = new Set(current.map((item) => item.id));

  return [...current, ...next.filter((item) => !currentIds.has(item.id))];
}

function formatAuditValue(attribute: string, value: unknown): string {
  if (isSensitiveAttribute(attribute)) {
    return "[redacted]";
  }

  if (value === null || value === undefined) {
    return "—";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value) ?? "—";
}

function isSensitiveAttribute(attribute: string): boolean {
  const normalizedAttribute = attribute.toLowerCase().replace(/[^a-z]/g, "");

  return sensitiveAttributeNames.some((name) =>
    normalizedAttribute.includes(name)
  );
}
