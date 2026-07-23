import mailer from "@server/emails/mailer";
import BaseEmail, { EmailMessageCategory, type EmailProps } from "./BaseEmail";

class TestEmail extends BaseEmail<EmailProps> {
  protected get category() {
    return EmailMessageCategory.Internal;
  }

  protected subject() {
    return "Test email";
  }

  protected preview() {
    return "Test preview";
  }

  protected renderAsText() {
    return "Test body";
  }

  protected render() {
    return <p>Test body</p>;
  }
}

describe("BaseEmail", () => {
  it("sends every template as plain text", async () => {
    const sendMail = vi.spyOn(mailer, "sendMail").mockResolvedValue();

    await new TestEmail({
      to: "test@example.com",
      language: "en_US",
    }).send();

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        plainTextOnly: true,
        text: "Test body",
      })
    );

    sendMail.mockRestore();
  });
});
