import { Client } from "@shared/types";
import mailer from "@server/emails/mailer";
import SigninEmail from "./SigninEmail";

describe("SigninEmail", () => {
  it("sends a plain-text message for mail clients with limited MIME support", async () => {
    const sendMail = vi.spyOn(mailer, "sendMail").mockResolvedValue();

    await new SigninEmail({
      to: "test@example.com",
      language: "en_US",
      teamUrl: "http://outline.example.com",
      client: Client.Web,
      verificationCode: "123456",
    }).send();

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        plainTextOnly: true,
        text: expect.stringContaining("123456"),
      })
    );

    sendMail.mockRestore();
  });
});
