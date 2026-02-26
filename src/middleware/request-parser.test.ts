import { describe, it, expect } from "vitest";
import { parseRequest } from "./request-parser.js";

const BASE_DOMAIN = "localhost";
const VALID_TX_ID = "dE0rmDfl9_OWjkDznNEXHaSO_JohJbRPlUp8TLBTklA";

function url(path: string, host?: string): URL {
  const h = host || BASE_DOMAIN;
  return new URL(`http://${h}${path}`);
}

describe("parseRequest", () => {
  describe("reserved paths", () => {
    it("identifies /wayfinder/health as reserved", () => {
      const result = parseRequest(
        url("/wayfinder/health"),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      expect(result.type).toBe("reserved");
    });

    it("identifies /wayfinder/metrics as reserved", () => {
      const result = parseRequest(
        url("/wayfinder/metrics"),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      expect(result.type).toBe("reserved");
    });

    it("identifies /graphql as reserved", () => {
      const result = parseRequest(url("/graphql"), BASE_DOMAIN, BASE_DOMAIN);
      expect(result.type).toBe("reserved");
    });

    it("identifies /favicon.ico as reserved", () => {
      const result = parseRequest(
        url("/favicon.ico"),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      expect(result.type).toBe("reserved");
    });

    it("is case-insensitive for reserved paths", () => {
      const result = parseRequest(
        url("/Wayfinder/Health"),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      expect(result.type).toBe("reserved");
    });
  });

  describe("txId path requests", () => {
    it("parses /{txId} as txid request", () => {
      const result = parseRequest(
        url(`/${VALID_TX_ID}`),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      expect(result.type).toBe("txid");
      if (result.type === "txid") {
        expect(result.txId).toBe(VALID_TX_ID);
        expect(result.path).toBe("/");
      }
    });

    it("parses /{txId}/path/to/file as txid with subpath", () => {
      const result = parseRequest(
        url(`/${VALID_TX_ID}/path/to/file`),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      expect(result.type).toBe("txid");
      if (result.type === "txid") {
        expect(result.txId).toBe(VALID_TX_ID);
        expect(result.path).toBe("/path/to/file");
      }
    });

    it("preserves query string in path", () => {
      const result = parseRequest(
        url(`/${VALID_TX_ID}/app?foo=bar`),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      if (result.type === "txid") {
        expect(result.path).toContain("?foo=bar");
      }
    });
  });

  describe("ArNS subdomain requests", () => {
    it("parses subdomain as ArNS name", () => {
      const result = parseRequest(
        url("/", "ardrive.localhost"),
        "ardrive.localhost",
        BASE_DOMAIN,
      );
      expect(result.type).toBe("arns");
      if (result.type === "arns") {
        expect(result.arnsName).toBe("ardrive");
      }
    });

    it("lowercases ArNS names", () => {
      const result = parseRequest(
        url("/", "ArDrive.localhost"),
        "ArDrive.localhost",
        BASE_DOMAIN,
      );
      if (result.type === "arns") {
        expect(result.arnsName).toBe("ardrive");
      }
    });

    it("includes path for subdomain requests", () => {
      const result = parseRequest(
        url("/app/page", "ardrive.localhost"),
        "ardrive.localhost",
        BASE_DOMAIN,
      );
      if (result.type === "arns") {
        expect(result.path).toBe("/app/page");
      }
    });
  });

  describe("root host content", () => {
    it("routes to ArNS name when rootHostContent is a name", () => {
      const result = parseRequest(
        url("/"),
        BASE_DOMAIN,
        BASE_DOMAIN,
        "ardrive",
      );
      expect(result.type).toBe("arns");
      if (result.type === "arns") {
        expect(result.arnsName).toBe("ardrive");
        expect(result.path).toBe("/");
      }
    });

    it("routes to txId when rootHostContent is a txId", () => {
      const result = parseRequest(
        url("/"),
        BASE_DOMAIN,
        BASE_DOMAIN,
        VALID_TX_ID,
      );
      expect(result.type).toBe("txid");
      if (result.type === "txid") {
        expect(result.txId).toBe(VALID_TX_ID);
      }
    });

    it("passes subpaths to root host content", () => {
      const result = parseRequest(
        url("/about"),
        BASE_DOMAIN,
        BASE_DOMAIN,
        "ardrive",
      );
      if (result.type === "arns") {
        expect(result.path).toBe("/about");
      }
    });
  });

  describe("restrictToRootHost mode", () => {
    it("blocks subdomain requests", () => {
      const result = parseRequest(
        url("/", "ardrive.localhost"),
        "ardrive.localhost",
        BASE_DOMAIN,
        "myrootapp",
        true,
      );
      expect(result.type).toBe("blocked");
      if (result.type === "blocked") {
        expect(result.reason).toBe("subdomain_restricted");
      }
    });

    it("blocks txId path requests", () => {
      const result = parseRequest(
        url(`/${VALID_TX_ID}`),
        BASE_DOMAIN,
        BASE_DOMAIN,
        "myrootapp",
        true,
      );
      expect(result.type).toBe("blocked");
      if (result.type === "blocked") {
        expect(result.reason).toBe("txid_path_restricted");
      }
    });

    it("allows reserved paths", () => {
      const result = parseRequest(
        url("/wayfinder/health"),
        BASE_DOMAIN,
        BASE_DOMAIN,
        "myrootapp",
        true,
      );
      expect(result.type).toBe("reserved");
    });

    it("allows root host content at /", () => {
      const result = parseRequest(
        url("/"),
        BASE_DOMAIN,
        BASE_DOMAIN,
        "myrootapp",
        true,
      );
      expect(result.type).toBe("arns");
      if (result.type === "arns") {
        expect(result.arnsName).toBe("myrootapp");
      }
    });
  });

  describe("Arweave API paths", () => {
    it("parses /info as arweave-api", () => {
      const result = parseRequest(url("/info"), BASE_DOMAIN, BASE_DOMAIN);
      expect(result.type).toBe("arweave-api");
    });

    it("parses /peers as arweave-api", () => {
      const result = parseRequest(url("/peers"), BASE_DOMAIN, BASE_DOMAIN);
      expect(result.type).toBe("arweave-api");
    });

    it("parses /tx/{id} as arweave-api", () => {
      const result = parseRequest(
        url(`/tx/${VALID_TX_ID}`),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      expect(result.type).toBe("arweave-api");
      if (result.type === "arweave-api") {
        expect(result.endpoint).toBe("tx");
        expect(result.params.id).toBe(VALID_TX_ID);
      }
    });

    it("parses /tx/{id}/status as arweave-api", () => {
      const result = parseRequest(
        url(`/tx/${VALID_TX_ID}/status`),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      if (result.type === "arweave-api") {
        expect(result.endpoint).toBe("tx-status");
      }
    });

    it("parses /block/height/{h} as arweave-api", () => {
      const result = parseRequest(
        url("/block/height/12345"),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      if (result.type === "arweave-api") {
        expect(result.endpoint).toBe("block-height");
        expect(result.params.height).toBe("12345");
      }
    });

    it("parses /wallet/{addr}/balance as arweave-api", () => {
      const result = parseRequest(
        url(`/wallet/${VALID_TX_ID}/balance`),
        BASE_DOMAIN,
        BASE_DOMAIN,
      );
      if (result.type === "arweave-api") {
        expect(result.endpoint).toBe("wallet-balance");
      }
    });

    it("does not parse arweave-api paths on subdomains", () => {
      const result = parseRequest(
        url("/info", "ardrive.localhost"),
        "ardrive.localhost",
        BASE_DOMAIN,
      );
      // On subdomain, /info is not an arweave-api endpoint
      expect(result.type).not.toBe("arweave-api");
    });
  });

  describe("no content configured", () => {
    it("treats root path as reserved when no rootHostContent", () => {
      const result = parseRequest(url("/"), BASE_DOMAIN, BASE_DOMAIN);
      expect(result.type).toBe("reserved");
    });

    it("treats non-txid paths as reserved", () => {
      const result = parseRequest(url("/about"), BASE_DOMAIN, BASE_DOMAIN);
      expect(result.type).toBe("reserved");
    });
  });
});
