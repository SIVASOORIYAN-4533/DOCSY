import fs from "fs";
import path from "path";
import multer from "multer";
import { env } from "../config/env";

const uploadsDir = path.resolve(process.cwd(), env.uploadDir);
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (_req, file, cb) => {
    const safeOriginalName = file.originalname.replace(/[^\w.-]/g, "_");
    cb(null, `${Date.now()}-${safeOriginalName}`);
  },
});

export const upload = multer({ storage });
