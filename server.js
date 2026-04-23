// server.js — Trucon Backend (with Email Auth)
"use strict";

const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const cheerio = require("cheerio");
const nodeFetch = require("node-fetch");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || "trucon-jwt-secret-2026-change-in-prod";

// ── File paths ────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "data.json");
const USERS_FILE = path.join(__dirname, "users.json");
const POSTS_MD = path.join(__dirname, "posts.md");
const HEALTH_MD = path.join(__dirname, "health-posts.md");

// ── Bootstrap data files ──────────────────────────────────
[DATA_FILE, USERS_FILE].forEach((file) => {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(
      file,
      JSON.stringify(file === DATA_FILE ? { posts: {} } : [], null, 2),
    );
  }
});

// ─────────────────────────────────────────────────────────
//  HELPERS — DATA.JSON  (likes, shares, comments)
// ─────────────────────────────────────────────────────────
function readData() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    if (raw.posts) {
      Object.keys(raw.posts).forEach((id) => {
        const p = raw.posts[id];
        if (p.likes && Array.isArray(p.likes)) p.likes = new Set(p.likes);
        else p.likes = new Set();
      });
    }
    return raw;
  } catch {
    return { posts: {} };
  }
}

function writeData(data) {
  const safe = JSON.stringify(
    data,
    (_, v) => (v instanceof Set ? [...v] : v),
    2,
  );
  fs.writeFileSync(DATA_FILE, safe);
}

function getPostData(postId) {
  const data = readData();
  if (!data.posts[postId]) {
    data.posts[postId] = { likes: new Set(), shares: 0, comments: [] };
  }
  return data;
}

// ─────────────────────────────────────────────────────────
//  HELPERS — USERS.JSON
// ─────────────────────────────────────────────────────────
function readUsers() {
  try {
    return JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

function findUserByEmail(email) {
  return readUsers().find((u) => u.email.toLowerCase() === email.toLowerCase());
}

function findUserById(id) {
  return readUsers().find((u) => u.id === id);
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

// ─────────────────────────────────────────────────────────
//  AUTH MIDDLEWARE
// ─────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No token provided" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
  }
}

function adminMiddleware(req, res, next) {
  authMiddleware(req, res, () => {
    if (req.user.role !== "admin")
      return res.status(403).json({ error: "Admin access required" });
    next();
  });
}

// ─────────────────────────────────────────────────────────
//  MIDDLEWARE SETUP
// ─────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(express.static(path.join(__dirname)));

// ─────────────────────────────────────────────────────────
//  AUTH ROUTES
// ─────────────────────────────────────────────────────────

// POST /api/auth/register
app.post("/api/auth/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res
        .status(400)
        .json({ error: "Name, email, and password are required" });

    if (password.length < 8)
      return res
        .status(400)
        .json({ error: "Password must be at least 8 characters" });

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email))
      return res.status(400).json({ error: "Invalid email address" });

    if (findUserByEmail(email))
      return res
        .status(409)
        .json({ error: "An account with this email already exists" });

    const passwordHash = await bcrypt.hash(password, 12);
    const users = readUsers();

    const newUser = {
      id: generateId(),
      name: name.trim(),
      email: email.toLowerCase().trim(),
      passwordHash,
      avatar: null,
      role: users.length === 0 ? "admin" : "user", // first user is admin
      createdAt: new Date().toISOString(),
    };

    users.push(newUser);
    writeUsers(users);

    const { passwordHash: _, ...safeUser } = newUser;
    const token = jwt.sign(
      { id: newUser.id, email: newUser.email, role: newUser.role },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.status(201).json({ ok: true, user: safeUser, token });
  } catch (err) {
    console.error("Register error:", err);
    res.status(500).json({ error: "Server error during registration" });
  }
});

// POST /api/auth/login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password)
      return res.status(400).json({ error: "Email and password are required" });

    const user = findUserByEmail(email);
    if (!user)
      return res
        .status(401)
        .json({ error: "No account found with that email" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Incorrect password" });

    const { passwordHash: _, ...safeUser } = user;
    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: "30d" },
    );

    res.json({ ok: true, user: safeUser, token });
  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ error: "Server error during login" });
  }
});

// GET /api/auth/me
app.get("/api/auth/me", authMiddleware, (req, res) => {
  const user = findUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  const { passwordHash: _, ...safeUser } = user;
  res.json({ ok: true, user: safeUser });
});

// PATCH /api/auth/profile  (update name/avatar)
app.patch("/api/auth/profile", authMiddleware, (req, res) => {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === req.user.id);
  if (idx === -1) return res.status(404).json({ error: "User not found" });

  const { name, avatar } = req.body;
  if (name) users[idx].name = name.trim();
  if (avatar) users[idx].avatar = avatar;

  writeUsers(users);
  const { passwordHash: _, ...safeUser } = users[idx];
  res.json({ ok: true, user: safeUser });
});

// ─────────────────────────────────────────────────────────
//  UTILITY ROUTES
// ─────────────────────────────────────────────────────────
app.get("/api/ping", (req, res) => res.json({ ok: true, ts: Date.now() }));

// ─────────────────────────────────────────────────────────
//  POSTS (Markdown-sourced)
// ─────────────────────────────────────────────────────────
app.get("/api/posts-md", (req, res) => {
  if (fs.existsSync(POSTS_MD))
    res.type("text/markdown").send(fs.readFileSync(POSTS_MD, "utf8"));
  else res.status(404).json({ error: "posts.md not found" });
});

app.get("/api/health-posts", (req, res) => {
  if (fs.existsSync(HEALTH_MD))
    res.type("text/markdown").send(fs.readFileSync(HEALTH_MD, "utf8"));
  else res.status(404).json({ error: "health-posts.md not found" });
});

// Parse posts.md and return JSON
app.get("/api/posts", (req, res) => {
  if (!fs.existsSync(POSTS_MD)) return res.json([]);
  const md = fs.readFileSync(POSTS_MD, "utf8");
  const blocks = md
    .split(/^---\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);

  const posts = blocks
    .map((block, idx) => {
      const lines = block.split(/\r?\n/);
      const meta = {};
      let i = 0;
      while (i < lines.length && lines[i].trim() !== "") {
        const m = lines[i].match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (m) {
          meta[m[1].toLowerCase()] = m[2].trim();
          i++;
        } else break;
      }
      const content = lines.slice(i).join("\n").trim();
      if (!content && !meta.title) return null;
      return {
        id: idx,
        title: meta.title || "",
        date: meta.date || "",
        category: (meta.category || "").toLowerCase(),
        image: meta.image || "",
        video: meta.video || "",
        author: meta.author || "Bakama Justin",
        avatar: meta.avatar || "pics/k.png",
        content,
      };
    })
    .filter(Boolean)
    .reverse();

  res.json(posts);
});

// ─────────────────────────────────────────────────────────
//  POST STATS: LIKES, SHARES, COMMENTS
// ─────────────────────────────────────────────────────────
app.get("/api/post/:id/stats", (req, res) => {
  const data = getPostData(String(req.params.id));
  const post = data.posts[String(req.params.id)];
  res.json({
    likes: post.likes.size,
    shares: post.shares || 0,
    comments: post.comments || [],
  });
});

app.post("/api/post/:id/like", authMiddleware, (req, res) => {
  const postId = String(req.params.id);
  const userId = req.user.id;

  const data = getPostData(postId);
  const post = data.posts[postId];

  let action = "liked";
  if (post.likes.has(userId)) {
    post.likes.delete(userId);
    action = "unliked";
  } else post.likes.add(userId);

  writeData(data);
  res.json({
    ok: true,
    action,
    likes: post.likes.size,
    hasLiked: post.likes.has(userId),
  });
});

app.get("/api/post/:id/hasLiked", authMiddleware, (req, res) => {
  const postId = String(req.params.id);
  const data = getPostData(postId);
  const post = data.posts[postId];
  res.json({
    hasLiked: post.likes.has(req.user.id),
    totalLikes: post.likes.size,
  });
});

app.post("/api/post/:id/share", (req, res) => {
  const postId = String(req.params.id);
  const data = getPostData(postId);
  data.posts[postId].shares = (data.posts[postId].shares || 0) + 1;
  writeData(data);
  res.json({ ok: true, shares: data.posts[postId].shares });
});

app.post("/api/post/:id/comment", authMiddleware, (req, res) => {
  const postId = String(req.params.id);
  const { text } = req.body;
  if (!text?.trim())
    return res.status(400).json({ error: "Comment text required" });

  const user = findUserById(req.user.id);
  const data = getPostData(postId);
  const comment = {
    id: Date.now(),
    userId: req.user.id,
    name: user?.name || "Anonymous",
    avatar: user?.avatar || null,
    text: text.trim(),
    timestamp: new Date().toISOString(),
  };

  data.posts[postId].comments.push(comment);
  writeData(data);
  res.json({ ok: true, comment, total: data.posts[postId].comments.length });
});

// ─────────────────────────────────────────────────────────
//  ADMIN — WRITE A POST (appends to posts.md)
// ─────────────────────────────────────────────────────────
app.post("/api/admin/post", adminMiddleware, (req, res) => {
  const { title, category, image, video, content } = req.body;
  if (!title || !content)
    return res.status(400).json({ error: "Title and content required" });

  const user = findUserById(req.user.id);
  const dateStr = new Date().toISOString().split("T")[0];
  const block = `\n---\n\ntitle: ${title}\ndate: ${dateStr}\ncategory: ${category || ""}\nauthor: ${user?.name || "Admin"}\navatar: ${user?.avatar || "pics/k.png"}\nimage: ${image || ""}\nvideo: ${video || ""}\n\n${content}\n`;

  fs.appendFileSync(POSTS_MD, block);
  res.json({ ok: true, message: "Post published" });
});

// ─────────────────────────────────────────────────────────
//  CHAT
// ─────────────────────────────────────────────────────────
const chatMessages = [];

app.get("/api/chat/messages", (req, res) => {
  const after = parseInt(req.query.after) || 0;
  const topic = req.query.topic;
  let filtered = chatMessages.filter((m) => m.id > after);
  if (topic) filtered = filtered.filter((m) => m.topic === topic);
  res.json(filtered);
});

app.post("/api/chat/send", authMiddleware, (req, res) => {
  const user = findUserById(req.user.id);
  const message = {
    ...req.body,
    id: Date.now(),
    timestamp: Date.now(),
    userId: req.user.id,
    name: user?.name || "Anonymous",
    avatar: user?.avatar || null,
  };
  chatMessages.push(message);
  if (chatMessages.length > 500) chatMessages.shift();
  res.json({ ok: true, message });
});

app.delete("/api/chat/messages/:id", adminMiddleware, (req, res) => {
  const idx = chatMessages.findIndex((m) => m.id === parseInt(req.params.id));
  if (idx !== -1) {
    chatMessages.splice(idx, 1);
    res.json({ ok: true });
  } else res.status(404).json({ error: "Message not found" });
});

// ─────────────────────────────────────────────────────────
//  RSS
// ─────────────────────────────────────────────────────────
app.get("/rss.xml", (req, res) => {
  const { generateRSSFeed } = require("./rss");
  const md = fs.existsSync(POSTS_MD) ? fs.readFileSync(POSTS_MD, "utf8") : "";
  const posts = md
    .split(/^---\s*$/m)
    .map((b, i) => {
      const lines = b.trim().split(/\r?\n/);
      const meta = {};
      let j = 0;
      while (j < lines.length && lines[j].trim() !== "") {
        const m = lines[j].match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
        if (m) {
          meta[m[1].toLowerCase()] = m[2].trim();
          j++;
        } else break;
      }
      return {
        id: i,
        title: meta.title || "",
        date: meta.date || "",
        author: meta.author || "",
        category: meta.category || "",
        content: lines.slice(j).join(" "),
        image: meta.image || "",
      };
    })
    .filter((p) => p.title);

  const rss = generateRSSFeed(posts);
  res.type("application/rss+xml").send(rss);
});
app.get("/api/proxy/zlibrary", async (req, res) => {
  const query = req.query.q;
  if (!query) return res.json([]);

  let browser;
  try {
    const puppeteer = require("puppeteer");

    browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();

    // Pretend to be a real browser
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    );

    // Go to search page and wait for books to load
    await page.goto(`https://z-library.sk/s/${encodeURIComponent(query)}`, {
      waitUntil: "networkidle2",
      timeout: 15000,
    });

    // Wait for z-bookcard elements to appear
    await page.waitForSelector("z-bookcard", { timeout: 8000 }).catch(() => {});

    // Extract all book data directly from the page
    const books = await page.evaluate(() => {
      const cards = document.querySelectorAll("z-bookcard");
      const results = [];

      cards.forEach((el, i) => {
        if (i >= 12) return;

        const href = el.getAttribute("href") || "";
        const publisher = el.getAttribute("publisher") || "";
        const year = el.getAttribute("year") || "";
        const language = el.getAttribute("language") || "";
        const extension = el.getAttribute("extension") || "";
        const filesize = el.getAttribute("filesize") || "";
        const isbn = el.getAttribute("isbn") || "";

        // Cover
        const img = el.querySelector("img");
        const cover = img?.getAttribute("data-src") || img?.src || "";

        // Title from the visible text or href slug
        const titleEl = el.querySelector("h3, .title, [class*='title']");
        let title = titleEl?.innerText?.trim() || "";
        if (!title) {
          title =
            href
              .split("/")
              .pop()
              ?.replace(".html", "")
              ?.replace(/-/g, " ")
              ?.replace(/\b\w/g, (c) => c.toUpperCase()) || "";
        }

        // Author from publisher field
        const parts = publisher.split(",");
        const author =
          parts.length > 1
            ? parts.slice(0, -1).join(",").trim()
            : publisher.trim() || "Unknown";

        if (!title) return;

        results.push({
          title,
          author,
          category: "zlibrary",
          source: "zlibrary",
          coverImage: cover.startsWith("http")
            ? cover
            : cover
              ? `https://z-library.sk${cover}`
              : "",
          downloadUrl: href.startsWith("http")
            ? href
            : `https://z-library.sk${href}`,
          downloads: 0,
          description: [
            year ? `Published ${year}` : "",
            extension ? extension.toUpperCase() : "",
            filesize || "",
            language || "",
          ]
            .filter(Boolean)
            .join(" · "),
        });
      });

      return results;
    });

    console.log(`✅ Z-Library: ${books.length} results for "${query}"`);
    res.json(books);
  } catch (err) {
    console.error("❌ Z-Library error:", err.message);
    res.json([]);
  } finally {
    if (browser) await browser.close();
  }
});
// ─────────────────────────────────────────────────────────
//  START SERVER
// ─────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n✅  Trucon server running at http://localhost:${PORT}`);
  console.log(`📁  Serving static files from: ${__dirname}\n`);
});
