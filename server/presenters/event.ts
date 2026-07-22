import type { Event } from "@server/models";
import presentUser from "./user";

type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONValue[]
  | { [key: string]: JSONValue };

const sensitiveAttributeNames = [
  "apikey",
  "authorization",
  "credential",
  "cookie",
  "key",
  "password",
  "secret",
  "token",
];

export default function presentEvent(event: Event, isAdmin = false) {
  return {
    id: event.id,
    name: event.name,
    modelId: event.modelId,
    userId: event.userId,
    actorId: event.actorId,
    collectionId: event.collectionId,
    documentId: event.documentId,
    createdAt: event.createdAt,
    data: event.data,
    actor: presentUser(event.actor),
    ...(isAdmin
      ? {
          actorIpAddress: event.ip || undefined,
          changes: event.changes
            ? redactSensitiveValues(event.changes)
            : undefined,
        }
      : {}),
  };
}

function redactSensitiveValues(
  value: JSONValue,
  attribute?: string
): JSONValue {
  if (attribute && isSensitiveAttribute(attribute)) {
    return "[redacted]";
  }

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitiveValues(item));
  }

  if (typeof value !== "object" || value === null) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([name, nestedValue]) => [
      name,
      redactSensitiveValues(nestedValue, name),
    ])
  );
}

function isSensitiveAttribute(attribute: string): boolean {
  const normalizedAttribute = attribute.toLowerCase().replace(/[^a-z]/g, "");

  return sensitiveAttributeNames.some((name) =>
    normalizedAttribute.includes(name)
  );
}
