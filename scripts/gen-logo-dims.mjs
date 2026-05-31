import sharp from "sharp";
import { promises as fs } from "fs";
import path from "path";
const SRC = path.join(process.cwd(), "public", "logos", "clientes");
const OUT = path.join(process.cwd(), "src", "lib", "logo-dims.json");
const EXT = new Set([".avif",".png",".jpg",".jpeg"]);
const files = (await fs.readdir(SRC)).filter(f=>EXT.has(path.extname(f).toLowerCase()));
const map = {};
for (const f of files){ try{ const m=await sharp(path.join(SRC,f)).metadata(); if(m.width&&m.height) map[`/logos/clientes/${f}`]=[m.width,m.height]; }catch(e){console.warn("skip",f,e.message);} }
await fs.writeFile(OUT, JSON.stringify(map)+"\n");
console.log("logo-dims:", Object.keys(map).length);
