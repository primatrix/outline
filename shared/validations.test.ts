import { DocumentValidation } from "./validations";

describe("DocumentValidation", () => {
  it("allows collaborative document states up to 5 MiB", () => {
    expect(DocumentValidation.maxStateLength).toBe(5 * 1024 * 1024);
  });
});
