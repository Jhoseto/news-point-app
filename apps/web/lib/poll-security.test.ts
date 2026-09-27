import { it,expect } from "vitest";
import { normalizePollIp,pollHash,signVoter,verifyVoter } from "./poll-security";
const key="test-only-signing-key-not-a-secret-1234567890";
it("accepts signed identities and rejects unsigned/tampered ones",()=>{const token=signVoter(key);expect(verifyVoter(key,token)).toHaveLength(48);expect(verifyVoter(key,token.replace(/^./,token[0]==="a"?"b":"a"))).toBeNull();expect(verifyVoter("different-key",token)).toBeNull();expect(verifyVoter(key,undefined)).toBeNull();});
it("rejects expired and future cookies",()=>{const now=Date.now();expect(verifyVoter(key,signVoter(key,now-367*86400000),now)).toBeNull();expect(verifyVoter(key,signVoter(key,now+120000),now)).toBeNull();});
it("separates hashes across polls and purposes",()=>{expect(pollHash(key,"ip:one","127.0.0.1")).not.toBe(pollHash(key,"ip:two","127.0.0.1"));expect(pollHash(key,"voter:one","127.0.0.1")).not.toBe(pollHash(key,"ip:one","127.0.0.1"));});
it.each([null,"","unknown","1.2.3.4, 5.6.7.8","127.0.0.1:80","::1%lo","999.1.1.1"])("rejects ambiguous/untrusted IP %s",value=>expect(normalizePollIp(value)).toBeNull());
it("canonicalizes IPv6 and mapped IPv4 so alternate spellings share a cap",()=>{expect(normalizePollIp("2001:0db8:0:0:0:0:0:1")).toBe("2001:db8::1");expect(normalizePollIp("::ffff:192.0.2.1")).toBe("192.0.2.1");expect(normalizePollIp("::ffff:c000:201")).toBe("192.0.2.1");});
