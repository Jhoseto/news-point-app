export function localCompassAllowed(headers: Pick<Headers, "get">): boolean {
  const host = "localhost:3000";
  const forwardedHost = headers.get("x-forwarded-host");
  const peer = headers.get("x-forwarded-for");
  return process.env.NODE_ENV === "development" && headers.get("host") === host &&
    (!forwardedHost || forwardedHost === host) && (!peer || ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(peer));
}
