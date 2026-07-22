import { EventEmitter } from "node:events";
import type http from "node:http";
import type { Duplex } from "node:stream";
import type Koa from "koa";
import init from "./websockets";

const mocks = vi.hoisted(() => ({
  adapterError: vi.fn(),
  metricsGauge: vi.fn(),
  metricsIncrement: vi.fn(),
  queueProcess: vi.fn().mockResolvedValue(undefined),
  serverAdapter: vi.fn(),
  serverOn: vi.fn(),
  shutdownAdd: vi.fn(),
}));

vi.mock("socket.io", () => {
  class Server {
    public engine = { clientsCount: 0 };

    public adapter = mocks.serverAdapter;

    public on = mocks.serverOn;

    public of = () => ({ adapter: { on: mocks.adapterError } });

    constructor(server: EventEmitter) {
      server.on("upgrade", vi.fn());
    }
  }

  return { default: { Server } };
});

vi.mock("socket.io-redis", () => ({
  createAdapter: vi.fn(),
}));

vi.mock("@server/env", () => ({
  default: {
    URL: "https://outline.infiscale-tech.com",
    isCloudHosted: false,
  },
}));

vi.mock("@server/logging/Logger", () => ({
  default: {
    debug: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
  },
}));

vi.mock("@server/logging/Metrics", () => ({
  default: {
    gaugePerInstance: mocks.metricsGauge,
    increment: mocks.metricsIncrement,
  },
}));

vi.mock("@server/logging/tracer", () => ({
  setResource: vi.fn(),
}));

vi.mock("@server/logging/tracing", () => ({
  traceFunction: () => (fn: (...args: never[]) => unknown) => fn,
}));

vi.mock("@server/models", () => ({
  Collection: {},
  Group: {},
}));

vi.mock("@server/policies", () => ({
  can: vi.fn(),
}));

vi.mock("@server/storage/redis", () => ({
  default: {
    defaultClient: {},
    defaultSubscriber: {},
  },
}));

vi.mock("@server/utils/ShutdownHelper", () => ({
  default: { add: mocks.shutdownAdd },
  ShutdownOrder: { normal: 1 },
}));

vi.mock("@server/utils/jwt", () => ({
  getUserForJWT: vi.fn(),
}));

vi.mock("../queues", () => ({
  websocketQueue: () => ({ process: mocks.queueProcess }),
}));

vi.mock("../queues/processors/WebsocketsProcessor", () => ({
  default: class WebsocketsProcessor {},
}));

class TestSocket extends EventEmitter {
  public end = vi.fn();
}

describe("websockets service", () => {
  it("handles a client reset after rejecting an old-origin upgrade", () => {
    const server = new EventEmitter();
    const socket = new TestSocket();

    init({} as Koa, server as http.Server, ["websockets"]);

    const handler = server.listeners("upgrade")[0];
    handler(
      {
        headers: { origin: "https://kb.infiscale.tech" },
        url: "/realtime",
      },
      socket as unknown as Duplex,
      Buffer.alloc(0)
    );

    expect(socket.end).toHaveBeenCalledWith("HTTP/1.1 400 Bad Request\r\n");
    expect(() =>
      socket.emit(
        "error",
        Object.assign(new Error("reset"), { code: "ECONNRESET" })
      )
    ).not.toThrow();
  });
});
