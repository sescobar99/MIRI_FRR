import fs from "fs";
import path from "path";

const dir = "docs/";

const files = fs.readdirSync(dir);

for (const file of files) {
    if (file.startsWith("suzanne_ck")) {
        const fullPath = path.join(dir, file);

        console.log("Removing:", fullPath);
        fs.rmSync(fullPath, { force: true });
    }
}

fs.rmSync(path.join(dir, "suzanne.blend"), { force: true });