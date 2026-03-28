import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { db } from "./db.js";

const JWT_SECRET = process.env.JWT_SECRET ?? "push-rummy-dev-secret";

const USERNAME_MAX = 64;

export type AuthUser = {
  id: string;
  username: string;
};

export function registerUser(usernameRaw: string, password: string): AuthUser {
  if (typeof usernameRaw !== "string" || typeof password !== "string") {
    throw new Error("Invalid request");
  }
  const username = usernameRaw.trim().toLowerCase();
  if (!username || username.length < 3) throw new Error("Username must be at least 3 characters");
  if (username.length > USERNAME_MAX) throw new Error(`Username must be at most ${USERNAME_MAX} characters`);
  if (!password || password.length < 6) throw new Error("Password must be at least 6 characters");
  if (password.length > 128) throw new Error("Password is too long");

  const exists = db.prepare("SELECT id FROM users WHERE username = ?").get(username) as { id: string } | undefined;
  if (exists) throw new Error("Username already exists");

  const id = `u_${Math.random().toString(36).slice(2, 11)}`;
  const hash = bcrypt.hashSync(password, 10);
  const now = new Date().toISOString();
  db.prepare("INSERT INTO users (id, username, password_hash, created_at) VALUES (?, ?, ?, ?)").run(id, username, hash, now);
  db.prepare("INSERT INTO player_ratings (user_id) VALUES (?)").run(id);
  db.prepare("INSERT INTO player_records (user_id) VALUES (?)").run(id);
  return { id, username };
}

export function loginUser(usernameRaw: string, password: string): AuthUser {
  if (typeof usernameRaw !== "string" || typeof password !== "string") {
    throw new Error("Invalid credentials");
  }
  const username = usernameRaw.trim().toLowerCase();
  if (username.length > USERNAME_MAX) throw new Error("Invalid credentials");
  if (password.length > 128) throw new Error("Invalid credentials");
  const row = db.prepare("SELECT id, username, password_hash FROM users WHERE username = ?").get(username) as
    | { id: string; username: string; password_hash: string }
    | undefined;
  if (!row) throw new Error("Invalid credentials");
  if (!bcrypt.compareSync(password, row.password_hash)) throw new Error("Invalid credentials");
  return { id: row.id, username: row.username };
}

export function signAuthToken(user: AuthUser): string {
  return jwt.sign({ sub: user.id, username: user.username }, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyAuthToken(token: string): AuthUser {
  const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; username: string };
  return { id: decoded.sub, username: decoded.username };
}
