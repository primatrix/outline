import { describe, expect, it } from "vitest";
import { appendUniqueById, getAuditChanges } from "./AuditLogUtils";

describe("getAuditChanges", () => {
  it("redacts sensitive values while retaining the changed field name", () => {
    expect(
      getAuditChanges({
        attributes: {
          name: "Updated workspace",
          accessToken: "new-access-token",
          api_key: "new-api-key",
        },
        previous: {
          name: "Original workspace",
          accessToken: "old-access-token",
          api_key: "old-api-key",
        },
      })
    ).toEqual([
      {
        attribute: "name",
        previousValue: "Original workspace",
        value: "Updated workspace",
      },
      {
        attribute: "accessToken",
        previousValue: "[redacted]",
        value: "[redacted]",
      },
      {
        attribute: "api_key",
        previousValue: "[redacted]",
        value: "[redacted]",
      },
    ]);
  });
});

describe("appendUniqueById", () => {
  it("preserves the audit query pages without adding duplicate events", () => {
    expect(
      appendUniqueById(
        [{ id: "event-1", name: "users.signin" }],
        [
          { id: "event-2", name: "users.signout" },
          { id: "event-1", name: "users.signin" },
        ]
      )
    ).toEqual([
      { id: "event-1", name: "users.signin" },
      { id: "event-2", name: "users.signout" },
    ]);
  });
});
