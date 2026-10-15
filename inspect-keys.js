const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const db = new DatabaseSync(path.join(process.env.APPDATA, "run-routermod", "db", "routermod.sqlite"));
const r = db.prepare("SELECT data FROM providerConnections WHERE provider='antigravity' LIMIT 1").all()[0];
const d = JSON.parse(r.data);
console.log("KEYS:", Object.keys(d).join(", "));
console.log("accessToken:", d.accessToken ? "yes" : "no");
console.log("refreshToken:", d.refreshToken ? "yes" : "no");
console.log("cookies:", d.cookies ? JSON.stringify(d.cookies).slice(0, 200) : "NONE");
