import ReactDOM from "react-dom";
import { act } from "react-dom/test-utils";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import Login from "./Login";

const { auth } = vi.hoisted(() => {
  window.env.URL = "http://localhost";

  return {
    auth: {
      authenticated: false,
      config: {
        name: "Infra",
        providers: [
          {
            id: "email",
            name: "Email",
            authUrl: "/auth/email",
          },
        ],
      },
      fetchConfig: vi.fn().mockResolvedValue(undefined),
      isFetching: false,
      lastSignedIn: null,
      user: undefined,
    },
  };
});

vi.mock("~/hooks/useStores", () => ({
  default: () => ({ auth }),
}));

vi.mock("~/components/OneTimePasswordInput", () => ({
  OneTimePasswordInput: () => null,
}));

vi.mock("~/components/Input", () => ({
  default: () => null,
}));

vi.mock("~/components/ButtonLarge", () => ({
  default: () => null,
}));

vi.mock("~/components/PageTitle", () => ({
  default: () => null,
}));

vi.mock("~/components/Avatar", () => ({
  AvatarSize: { XXLarge: 48 },
}));

vi.mock("~/components/TeamLogo", () => ({
  default: () => null,
}));

vi.mock("./components/AuthenticationProvider", () => ({
  default: ({ preferOTP }: { preferOTP: boolean }) => (
    <output data-testid="prefer-otp">{String(preferOTP)}</output>
  ),
}));

vi.mock("./components/PasskeyAuthenticationProvider", () => ({
  PasskeyAuthenticationProvider: () => null,
}));

vi.mock("./components/SwitchHostButton", () => ({
  SwitchHostButton: () => null,
}));

describe("Login", () => {
  it("prefers a one-time password for normal web email sign-in", async () => {
    const container = document.createElement("div");

    await act(async () => {
      ReactDOM.render(
        <MemoryRouter>
          <Login />
        </MemoryRouter>,
        container
      );
    });

    expect(
      container.querySelector("[data-testid='prefer-otp']")?.textContent
    ).toBe("true");

    await act(async () => {
      ReactDOM.unmountComponentAtNode(container);
    });
  });
});
