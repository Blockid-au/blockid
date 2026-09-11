// Colocated vitest for lib/security/outbound-url.ts (S8-C, 2026-09-11).

import { describe, expect, it } from "vitest";
import { checkOutboundUrl, isForbiddenHostname, isPrivateIp } from "./outbound-url";

describe("isPrivateIp", () => {
  it("flags loopback, RFC1918, link-local / metadata, CGNAT and reserved v4", () => {
    for (const ip of [
      "127.0.0.1", "127.255.255.254", "10.0.0.1", "10.255.255.255", "172.16.0.1", "172.31.255.255",
      "192.168.1.1", "169.254.169.254", "169.254.0.1", "100.64.0.1", "100.127.255.255", "0.0.0.0",
      "224.0.0.1", "255.255.255.255", "192.0.0.1", "198.18.0.1", "192.0.2.1",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("allows public v4", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "172.32.0.1", "172.15.255.255", "100.128.0.1", "13.54.1.1", "203.1.1.1"]) {
      expect(isPrivateIp(ip), ip).toBe(false);
    }
  });

  it("flags loopback, ULA, link-local, multicast, v4-mapped private and NAT64 v6", () => {
    for (const ip of [
      "::1", "::", "fc00::1", "fd12:3456::1", "fe80::1", "fe80::1%eth0", "ff02::1",
      "::ffff:127.0.0.1", "::ffff:169.254.169.254", "::ffff:10.0.0.1", "::ffff:7f00:1", "2001:db8::1", "64:ff9b::a9fe:a9fe",
    ]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
  });

  it("allows public v6 and v4-mapped public", () => {
    expect(isPrivateIp("2404:6800:4006:80c::200e")).toBe(false);
    expect(isPrivateIp("::ffff:8.8.8.8")).toBe(false);
  });

  it("fails closed on garbage", () => {
    expect(isPrivateIp("not-an-ip")).toBe(true);
    expect(isPrivateIp("")).toBe(true);
  });
});

describe("isForbiddenHostname", () => {
  it("refuses internal names, IP literals in private ranges and disguised IPs", () => {
    for (const h of [
      "localhost", "LOCALHOST", "foo.localhost", "printer.local", "db.internal", "metadata", "metadata.google.internal",
      "instance-data", "kubernetes.default.svc", "svc.home.arpa", "127.0.0.1", "[::1]", "169.254.169.254",
      "2130706433", "0x7f000001", "0177.0.0.1", "127.1", "0x7f.0.0.1", "intranet", "",
    ]) {
      expect(isForbiddenHostname(h), h).toBe(true);
    }
  });

  it("allows ordinary public hostnames and public IP literals", () => {
    for (const h of ["business.gov.au", "www.grants.gov.au", "example.com.", "8.8.8.8", "[2404:6800:4006:80c::200e]"]) {
      expect(isForbiddenHostname(h), h).toBe(false);
    }
  });
});

describe("checkOutboundUrl", () => {
  const publicDns = async () => ["13.54.1.1"];

  it("accepts a public https URL whose name resolves publicly", async () => {
    const r = await checkOutboundUrl("https://business.gov.au/grants", { resolve: publicDns });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.addresses).toEqual(["13.54.1.1"]);
  });

  it("refuses non-http schemes, credentials and malformed URLs", async () => {
    expect((await checkOutboundUrl("file:///etc/passwd")).ok).toBe(false);
    expect((await checkOutboundUrl("ftp://business.gov.au/x")).ok).toBe(false);
    expect((await checkOutboundUrl("gopher://business.gov.au/x")).ok).toBe(false);
    const creds = await checkOutboundUrl("https://user:pw@business.gov.au/x", { resolve: publicDns });
    expect(creds.ok).toBe(false);
    if (!creds.ok) expect(creds.reason).toBe("credentials_in_url");
    expect((await checkOutboundUrl("not a url")).ok).toBe(false);
  });

  it("refuses the cloud metadata endpoint and loopback literals without touching DNS", async () => {
    let dnsCalls = 0;
    const spy = async () => { dnsCalls++; return ["8.8.8.8"]; };
    for (const u of ["http://169.254.169.254/latest/meta-data/", "http://127.0.0.1:8000/", "http://[::1]/", "http://localhost:3000/", "http://0x7f000001/"]) {
      const r = await checkOutboundUrl(u, { resolve: spy });
      expect(r.ok, u).toBe(false);
      if (!r.ok) expect(r.reason).toBe("hostname_forbidden");
    }
    expect(dnsCalls).toBe(0);
  });

  it("refuses a public-looking hostname that resolves to a private address (DNS rebinding / internal CNAME)", async () => {
    const r = await checkOutboundUrl("https://evil.example.com/", { resolve: async () => ["8.8.8.8", "169.254.169.254"] });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("private_ip");
      expect(r.detail).toBe("169.254.169.254");
    }
    const v6 = await checkOutboundUrl("https://evil.example.com/", { resolve: async () => ["::ffff:10.0.0.5"] });
    expect(v6.ok).toBe(false);
  });

  it("refuses a name that does not resolve", async () => {
    const r = await checkOutboundUrl("https://nx.example.com/", { resolve: async () => { throw new Error("ENOTFOUND"); } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe("dns_failed");
    const empty = await checkOutboundUrl("https://nx.example.com/", { resolve: async () => [] });
    expect(empty.ok).toBe(false);
  });

  it("skipDns still runs the hostname checks", async () => {
    expect((await checkOutboundUrl("https://business.gov.au/", { skipDns: true })).ok).toBe(true);
    expect((await checkOutboundUrl("https://169.254.169.254/", { skipDns: true })).ok).toBe(false);
  });
});
