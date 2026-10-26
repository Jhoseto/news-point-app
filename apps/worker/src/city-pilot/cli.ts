import { loadRootEnv } from "@newspoint/db/node";

loadRootEnv();
const { run } = await import("./run");

run().catch((error) => { console.error(error); process.exitCode = 1; });
