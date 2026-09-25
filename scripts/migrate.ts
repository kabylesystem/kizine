import { migrate } from "../src/db/client";
await migrate();
console.log("database up to date");
