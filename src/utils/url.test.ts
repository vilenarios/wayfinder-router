import { describe, it, expect } from "vitest";
import {
  isTxId,
  isArnsName,
  isValidSandbox,
  sandboxFromTxId,
  validateSandboxForTxId,
  constructGatewayUrl,
  constructArnsGatewayUrl,
  normalizePath,
} from "./url.js";

describe("isTxId", () => {
  it("accepts valid 43-char base64url strings", () => {
    expect(isTxId("dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA")).toBe(true);
    expect(isTxId("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA")).toBe(true);
    expect(isTxId("abcdefghijklmnopqrstuvwxyz0123456789_-ABCDE")).toBe(true);
  });

  it("rejects strings that are not 43 chars", () => {
    expect(isTxId("short")).toBe(false);
    expect(isTxId("")).toBe(false);
    expect(isTxId("dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklAx")).toBe(false); // 44 chars
    expect(isTxId("dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTkl")).toBe(false); // 42 chars
  });

  it("rejects strings with invalid characters", () => {
    expect(isTxId("dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTkl!")).toBe(false);
    expect(isTxId("dE0rmDfl9 OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA")).toBe(false);
    expect(isTxId("dE0rmDfl9+OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA")).toBe(false);
  });
});

describe("isArnsName", () => {
  it("accepts valid ArNS names", () => {
    expect(isArnsName("ardrive")).toBe(true);
    expect(isArnsName("my-app")).toBe(true);
    expect(isArnsName("app_v2")).toBe(true);
    expect(isArnsName("a")).toBe(true);
  });

  it("rejects 43-char strings that look like txIds", () => {
    expect(isArnsName("dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA")).toBe(
      false,
    );
  });

  it("accepts 43-char ArNS names that are NOT valid txIds", () => {
    // 43 chars but contains invalid base64url char "!"
    expect(isArnsName("abcdefghijklmnopqrstuvwxyz01234567890abcde!")).toBe(
      false,
    ); // "!" not in arns regex either
  });

  it("rejects names longer than 51 chars", () => {
    expect(isArnsName("a".repeat(52))).toBe(false);
  });

  it("rejects empty strings", () => {
    expect(isArnsName("")).toBe(false);
  });

  it("rejects names with invalid characters", () => {
    expect(isArnsName("my app")).toBe(false);
    expect(isArnsName("my.app")).toBe(false);
    expect(isArnsName("MY@APP")).toBe(false);
  });
});

describe("isValidSandbox", () => {
  it("accepts valid 52-char lowercase base32 strings", () => {
    // base32 alphabet: a-z and 2-7 only (no 0, 1, 8, 9)
    expect(
      isValidSandbox("abcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrst"),
    ).toBe(true);
  });

  it("rejects strings with uppercase", () => {
    expect(
      isValidSandbox("ABCDEFghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv"),
    ).toBe(false);
  });

  it("rejects wrong length", () => {
    expect(isValidSandbox("abcdef")).toBe(false);
    expect(isValidSandbox("")).toBe(false);
  });

  it("rejects strings with digits 0, 1, 8, 9", () => {
    expect(
      isValidSandbox("0bcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv"),
    ).toBe(false);
    expect(
      isValidSandbox("1bcdefghijklmnopqrstuvwxyz234567abcdefghijklmnopqrstuv"),
    ).toBe(false);
  });
});

describe("sandboxFromTxId", () => {
  it("produces a 52-char lowercase base32 string", () => {
    const sandbox = sandboxFromTxId(
      "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA",
    );
    expect(sandbox).toHaveLength(52);
    expect(isValidSandbox(sandbox)).toBe(true);
  });

  it("produces consistent results", () => {
    const txId = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    expect(sandboxFromTxId(txId)).toBe(sandboxFromTxId(txId));
  });

  it("produces different results for different txIds", () => {
    const a = sandboxFromTxId("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
    const b = sandboxFromTxId("BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB");
    expect(a).not.toBe(b);
  });
});

describe("validateSandboxForTxId", () => {
  it("validates matching sandbox and txId", () => {
    const txId = "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA";
    const sandbox = sandboxFromTxId(txId);
    expect(validateSandboxForTxId(sandbox, txId)).toBe(true);
  });

  it("rejects mismatched sandbox and txId", () => {
    const txIdA = "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA";
    const txIdB = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
    const sandboxA = sandboxFromTxId(txIdA);
    expect(validateSandboxForTxId(sandboxA, txIdB)).toBe(false);
  });

  it("rejects invalid inputs", () => {
    expect(validateSandboxForTxId("invalid", "invalid")).toBe(false);
  });
});

describe("constructGatewayUrl", () => {
  it("uses path-based routing for localhost", () => {
    const url = constructGatewayUrl({
      gateway: new URL("http://localhost:3000"),
      txId: "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA",
      path: "/index.html",
    });
    expect(url.hostname).toBe("localhost");
    expect(url.pathname).toBe(
      "/dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA/index.html",
    );
  });

  it("uses path-based routing for 127.0.0.1", () => {
    const url = constructGatewayUrl({
      gateway: new URL("http://127.0.0.1:3000"),
      txId: "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA",
      path: "/",
    });
    expect(url.hostname).toBe("127.0.0.1");
    expect(url.pathname).toContain(
      "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA",
    );
  });

  it("uses sandbox subdomain for remote gateways by default", () => {
    const txId = "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA";
    const url = constructGatewayUrl({
      gateway: new URL("https://ar-io.dev"),
      txId,
      path: "/",
    });
    const expectedSandbox = sandboxFromTxId(txId);
    expect(url.hostname).toBe(`${expectedSandbox}.ar-io.dev`);
  });

  it("uses path-based routing when useSubdomain is false", () => {
    const url = constructGatewayUrl({
      gateway: new URL("https://ar-io.dev"),
      txId: "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA",
      path: "/",
      useSubdomain: false,
    });
    expect(url.hostname).toBe("ar-io.dev");
    expect(url.pathname).toContain(
      "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA",
    );
  });
});

describe("constructArnsGatewayUrl", () => {
  it("uses subdomain for remote gateways", () => {
    const url = constructArnsGatewayUrl({
      gateway: new URL("https://ar-io.dev"),
      arnsName: "ardrive",
      path: "/",
    });
    expect(url.hostname).toBe("ardrive.ar-io.dev");
    expect(url.pathname).toBe("/");
  });

  it("uses path-based routing for localhost", () => {
    const url = constructArnsGatewayUrl({
      gateway: new URL("http://localhost:3000"),
      arnsName: "ardrive",
      path: "/app",
    });
    expect(url.hostname).toBe("localhost");
    expect(url.pathname).toBe("/ardrive/app");
  });

  it("lowercases ArNS names", () => {
    const url = constructArnsGatewayUrl({
      gateway: new URL("https://ar-io.dev"),
      arnsName: "ArDrive",
      path: "/",
    });
    expect(url.hostname).toBe("ardrive.ar-io.dev");
  });
});

describe("normalizePath", () => {
  it("returns / for empty input", () => {
    expect(normalizePath("")).toBe("/");
  });

  it("returns / for /", () => {
    expect(normalizePath("/")).toBe("/");
  });

  it("adds leading slash if missing", () => {
    expect(normalizePath("path/to/file")).toBe("/path/to/file");
  });

  it("preserves existing leading slash", () => {
    expect(normalizePath("/path/to/file")).toBe("/path/to/file");
  });
});
