import { createAuthClient } from "better-auth/react";
import { withBase } from "./paths";

// Same origin as the page; sign-in goes through the rate-limited auth handler.
export const authClient = createAuthClient({ basePath: withBase("/api/auth") });
