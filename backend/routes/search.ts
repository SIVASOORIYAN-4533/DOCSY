import { Router } from "express";
import { searchDocuments } from "../db/repository";
import { authenticateToken } from "../middleware/auth";

const router = Router();

router.get("/", authenticateToken, async (req, res) => {
  if (!req.user) {
    res.sendStatus(401);
    return;
  }

  const rawQuery = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const docs = await searchDocuments(req.user.id, rawQuery);

  res.json(docs);
});

export default router;
