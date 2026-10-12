import { readFileSync, writeFileSync } from "node:fs";

const path = "scripts/wp-import/src/category-map.ts";
const voice = "\u0413\u043b\u0430\u0441\u044a\u0442 \u043d\u0430 \u0438\u0441\u0442\u0438\u043d\u0430\u0442\u0430";
let source = readFileSync(path, "utf8");
source = source.replace(/glasat-na-istinata", label: "[^"]+"/, `glasat-na-istinata", label: "${voice}"`);
source = source.replace('  "na-fokus",\n', "");
source = source.replace('  "glasat-na-istinata",\n', "");
writeFileSync(path, source);
