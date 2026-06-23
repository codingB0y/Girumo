const express = require("express");
const app = express();

app.use(express.json());

app.post("/api/groups", (req, res) => {
  console.log("groups:", req.body);
  res.json({ ok: true });
});

app.post("/api/session", (req, res) => {
  res.json({ ok: true });
});

app.post("/api/leads", (req, res) => {
  res.json({ ok: true });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log("API rodando na porta", PORT);
});