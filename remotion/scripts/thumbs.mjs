// Contact sheets of the footage so cut points (startFromSeconds) can be
// chosen without scrubbing manually: 6×6 grids, one frame every 4s.
import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.join(root, ".thumbs");
fs.mkdirSync(out, { recursive: true });

execFileSync(
  "ffmpeg",
  [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    path.join(root, "public", "footage.mp4"),
    "-vf",
    "fps=1/4,scale=320:-1,tile=6x6",
    "-frames:v",
    "4",
    path.join(out, "sheet_%02d.jpg"),
  ],
  { stdio: "inherit" },
);

console.log("Sheets:", fs.readdirSync(out).join(", "));
