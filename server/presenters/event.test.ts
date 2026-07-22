import { Event, User } from "@server/models";
import presentEvent from "./event";

describe("presentEvent", () => {
  it("redacts sensitive audit changes before returning them to admins", () => {
    const event = Event.build({
      id: "event-id",
      name: "webhookSubscriptions.create",
      ip: "127.0.0.1",
      changes: {
        attributes: {
          name: "Operations webhook",
          secret: "new-secret",
          accessToken: "new-access-token",
          password: "new-password",
          nested: {
            api_key: "new-api-key",
          },
        },
        previous: {
          name: "Original webhook",
          secret: "old-secret",
          accessToken: "old-access-token",
          password: "old-password",
          nested: {
            api_key: "old-api-key",
          },
        },
      },
    });
    event.actor = User.build({
      id: "user-id",
      name: "Admin",
    });

    const result = presentEvent(event, true);

    expect(result.changes).toEqual({
      attributes: {
        name: "Operations webhook",
        secret: "[redacted]",
        accessToken: "[redacted]",
        password: "[redacted]",
        nested: {
          api_key: "[redacted]",
        },
      },
      previous: {
        name: "Original webhook",
        secret: "[redacted]",
        accessToken: "[redacted]",
        password: "[redacted]",
        nested: {
          api_key: "[redacted]",
        },
      },
    });
  });
});
