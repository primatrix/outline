import mailer from "@server/emails/mailer";
import InviteEmail from "./InviteEmail";

describe("InviteEmail", () => {
  it("sends a plain-text message for mail clients with limited MIME support", async () => {
    const sendMail = vi.spyOn(mailer, "sendMail").mockResolvedValue();

    await new InviteEmail({
      to: "test@example.com",
      language: "en_US",
      name: "Test Editor",
      actorName: "Admin",
      actorEmail: "admin@example.com",
      teamName: "Infra",
      teamUrl: "http://outline.example.com",
    }).send();

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        plainTextOnly: true,
        text: expect.stringContaining("http://outline.example.com"),
      })
    );

    sendMail.mockRestore();
  });
});
