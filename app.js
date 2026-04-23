/* ============================================================
   TRUCON — app.js
   Full frontend: auth, posts, health, library, chat, admin
   ============================================================ */
"use strict";

// ── Marked.js markdown parser (loaded from CDN in HTML) ──
// Available as window.marked

// ═══════════════════════════════════════════════════════════
//  STATE
// ═══════════════════════════════════════════════════════════
const State = {
  user: null, // logged-in user object
  token: null, // JWT
  currentView: "home",
  currentPost: null,
  allPosts: [],
  filteredCat: "all",
  chatTopic: "general",
  chatPoller: null,
  chatLastId: 0,
  booksDisplay: [],
  bookViewMode: "grid",
};

// ═══════════════════════════════════════════════════════════
//  API HELPER
// ═══════════════════════════════════════════════════════════
async function api(method, endpoint, body = null) {
  const headers = { "Content-Type": "application/json" };
  if (State.token) headers["Authorization"] = `Bearer ${State.token}`;

  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  try {
    const res = await fetch(endpoint, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  } catch (err) {
    throw err;
  }
}

// ═══════════════════════════════════════════════════════════
//  AUTH
// ═══════════════════════════════════════════════════════════
function loadStoredAuth() {
  try {
    const token = localStorage.getItem("tc_token");
    const user = JSON.parse(localStorage.getItem("tc_user") || "null");
    if (token && user) {
      State.token = token;
      State.user = user;
      updateUserUI();
    }
  } catch {
    /* ignore */
  }
}

function saveAuth(user, token) {
  State.user = user;
  State.token = token;
  localStorage.setItem("tc_token", token);
  localStorage.setItem("tc_user", JSON.stringify(user));
  updateUserUI();
}

function clearAuth() {
  State.user = null;
  State.token = null;
  localStorage.removeItem("tc_token");
  localStorage.removeItem("tc_user");
  updateUserUI();
}

function updateUserUI() {
  const user = State.user;

  // Sidebar user card
  const sidebarUser = document.getElementById("sidebar-user-area");
  const drawerUser = document.getElementById("drawer-user-area");

  const makeUserCard = () => {
    const initials = user
      ? user.name
          .split(" ")
          .map((w) => w[0])
          .join("")
          .slice(0, 2)
          .toUpperCase()
      : "";
    const avatarEl = user?.avatar
      ? `<img src="${user.avatar}" class="user-avatar" alt="">`
      : `<div class="user-avatar-placeholder">${initials}</div>`;

    return `
      <div class="user-card" onclick="showProfileMenu()">
        ${avatarEl}
        <div class="user-info-text">
          <div class="user-name">${user.name}</div>
          <div class="user-handle">@${user.email.split("@")[0]}</div>
        </div>
        ${user.role === "admin" ? `<span class="user-role-badge">Admin</span>` : ""}
      </div>
      <button class="btn-icon" style="width:100%;margin-top:8px;justify-content:center;" onclick="doLogout()">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
        Sign out
      </button>`;
  };

  const makeJoinBtn = () => `
    <button class="btn-join" onclick="openAuth('login')">Sign in / Join Trucon</button>`;

  if (sidebarUser)
    sidebarUser.innerHTML = user ? makeUserCard() : makeJoinBtn();
  if (drawerUser) drawerUser.innerHTML = user ? makeUserCard() : makeJoinBtn();

  // Topbar
  const topbarLogin = document.getElementById("topbar-login-btn");
  if (topbarLogin) topbarLogin.style.display = user ? "none" : "";

  // Admin nav button
  const adminBtn = document.querySelectorAll(".admin-nav-btn");
  adminBtn.forEach(
    (b) => (b.style.display = user?.role === "admin" ? "" : "none"),
  );
}

function doLogout() {
  clearAuth();
  showToast("Signed out", "info");
  switchView("home");
  closeAuthModal();
}

// ── Auth Modal ───────────────────────────────────────────
function openAuth(mode = "login") {
  document.getElementById("auth-overlay").classList.remove("hidden");
  switchAuthTab(mode);
  document.getElementById("auth-email")?.focus();
}

function closeAuthModal() {
  document.getElementById("auth-overlay").classList.add("hidden");
  clearAuthError();
}

function switchAuthTab(mode) {
  const loginTab = document.getElementById("tab-login");
  const registerTab = document.getElementById("tab-register");
  const loginForm = document.getElementById("form-login");
  const regForm = document.getElementById("form-register");

  if (mode === "login") {
    loginTab.classList.add("active");
    registerTab.classList.remove("active");
    loginForm.classList.remove("hidden");
    regForm.classList.add("hidden");
  } else {
    registerTab.classList.add("active");
    loginTab.classList.remove("active");
    regForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  }

  clearAuthError();
}

function showAuthError(msg) {
  const el = document.getElementById("auth-error");
  el.textContent = msg;
  el.classList.remove("hidden");
}

function clearAuthError() {
  const el = document.getElementById("auth-error");
  if (el) {
    el.textContent = "";
    el.classList.add("hidden");
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const btn = document.getElementById("btn-login");

  if (!email || !password) return showAuthError("Please fill in all fields");

  btn.disabled = true;
  btn.textContent = "Signing in…";
  clearAuthError();

  try {
    const data = await api("POST", "/api/auth/login", { email, password });
    saveAuth(data.user, data.token);
    closeAuthModal();
    showToast(`Welcome back, ${data.user.name.split(" ")[0]}!`, "success");
    refreshCurrentView();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Sign In";
  }
}

async function handleRegister(e) {
  e.preventDefault();
  const name = document.getElementById("reg-name").value.trim();
  const email = document.getElementById("reg-email").value.trim();
  const password = document.getElementById("reg-password").value;
  const btn = document.getElementById("btn-register");

  if (!name || !email || !password)
    return showAuthError("Please fill in all fields");

  btn.disabled = true;
  btn.textContent = "Creating account…";
  clearAuthError();

  try {
    const data = await api("POST", "/api/auth/register", {
      name,
      email,
      password,
    });
    saveAuth(data.user, data.token);
    closeAuthModal();
    showToast(
      `Welcome to Trucon, ${data.user.name.split(" ")[0]}! 🎉`,
      "success",
    );
    refreshCurrentView();
  } catch (err) {
    showAuthError(err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create Account";
  }
}

// ═══════════════════════════════════════════════════════════
//  NAVIGATION
// ═══════════════════════════════════════════════════════════
function switchView(view) {
  // Stop chat poller if leaving chat
  if (State.currentView === "chat" && view !== "chat") stopChatPoller();

  State.currentView = view;
  document
    .querySelectorAll(".view")
    .forEach((v) => v.classList.remove("active"));
  const target = document.getElementById(`view-${view}`);
  if (target) target.classList.add("active");

  // Update nav buttons
  document.querySelectorAll(".nav-btn, .bnav-btn").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === view);
  });

  // Scroll main to top
  document.querySelector(".main")?.scrollTo(0, 0);

  // Close drawer
  closeDrawer();

  // Load data for view
  switch (view) {
    case "home":
      loadPosts();
      break;
    case "health":
      loadHealthPosts();
      break;
    case "chat":
      initChat();
      break;
    case "library":
      initLibrary();
      break;
  }
}

function refreshCurrentView() {
  switchView(State.currentView);
}

function showProfileMenu() {
  // Simple toggle logout for now — could expand to a dropdown
}

// Drawer (mobile)
function openDrawer() {
  document.getElementById("sidebar-drawer").classList.add("open");
  document.getElementById("drawer-overlay").classList.add("open");
}

function closeDrawer() {
  document.getElementById("sidebar-drawer")?.classList.remove("open");
  document.getElementById("drawer-overlay")?.classList.remove("open");
}

// ═══════════════════════════════════════════════════════════
//  POSTS — FEED
// ═══════════════════════════════════════════════════════════
async function loadPosts() {
  const feed = document.getElementById("posts-feed");
  if (!feed) return;
  feed.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div> Loading…</div>`;

  try {
    const posts = await api("GET", "/api/posts");
    State.allPosts = posts;
    renderPosts(posts);
  } catch {
    feed.innerHTML = `<div class="empty-state"><p>Could not load posts. Is the server running?</p></div>`;
  }
}

function renderPosts(posts) {
  const feed = document.getElementById("posts-feed");
  if (!feed) return;

  // Apply category filter
  const cat = State.filteredCat;
  const filtered =
    cat === "all" ? posts : posts.filter((p) => p.category === cat);

  if (!filtered.length) {
    feed.innerHTML = `<div class="empty-state">
      <p>No posts in this category yet.</p>
    </div>`;
    return;
  }

  feed.innerHTML = filtered.map((post) => makePostCard(post)).join("");
}

function makePostCard(post) {
  const excerpt = post.content
    .replace(/#+\s/g, "")
    .replace(/\*\*/g, "")
    .replace(/\n/g, " ")
    .slice(0, 160);
  const imgEl = post.image
    ? `<img src="${post.image}" class="post-thumbnail" alt="" onerror="this.style.display='none'">`
    : "";
  const catEl = post.category
    ? `<span class="post-cat">${post.category}</span>`
    : "";
  const titleEl = post.title
    ? `<div class="post-title">${post.title}</div>`
    : "";

  return `
  <article class="post-card" onclick="openPost(${post.id})" data-id="${post.id}">
    <img class="post-avatar" src="${post.avatar}" alt="${post.author}" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(post.author)}&background=2a2a2a&color=c8922a&size=46'">
    <div class="post-body">
      <div class="post-meta">
        <span class="post-author">${post.author}</span>
        ${catEl}
        <span class="post-date">${formatDate(post.date)}</span>
      </div>
      ${titleEl}
      <p class="post-excerpt">${excerpt}</p>
      <div class="post-actions" onclick="event.stopPropagation()">
        <button class="action-btn like-btn" id="like-${post.id}" onclick="toggleLike(${post.id}, this)">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
          <span class="like-count" id="like-count-${post.id}">—</span>
        </button>
        <button class="action-btn comment-btn" onclick="openPost(${post.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          <span id="comment-count-${post.id}">—</span>
        </button>
        <button class="action-btn share-btn" onclick="sharePost(${post.id})">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
          Share
        </button>
      </div>
    </div>
    ${imgEl}
  </article>`;
}

// Load stats for all visible posts
async function loadPostStats() {
  const posts = State.allPosts;
  for (const post of posts) {
    try {
      const stats = await api("GET", `/api/post/${post.id}/stats`);
      const likeEl = document.getElementById(`like-count-${post.id}`);
      const commentEl = document.getElementById(`comment-count-${post.id}`);
      if (likeEl) likeEl.textContent = stats.likes;
      if (commentEl) commentEl.textContent = stats.comments.length;

      // Check if current user has liked
      if (State.user) {
        const hasLiked = stats.comments; // we check from likes array on server-side
        // We'll re-check below
      }
    } catch {
      /* silent */
    }
  }
}

function setCategoryFilter(cat) {
  State.filteredCat = cat;
  document.querySelectorAll(".filter-tag").forEach((t) => {
    t.classList.toggle("active", t.dataset.cat === cat);
  });
  renderPosts(State.allPosts);
}

// ═══════════════════════════════════════════════════════════
//  POST MODAL (full article)
// ═══════════════════════════════════════════════════════════
async function openPost(id) {
  const post = State.allPosts.find((p) => p.id === id);
  if (!post) return;
  State.currentPost = post;

  const overlay = document.getElementById("post-modal");
  overlay.classList.remove("hidden");
  document.body.style.overflow = "hidden";

  // Fill content
  document.getElementById("modal-title").textContent = post.title || "Untitled";
  document.getElementById("modal-author-name").textContent = post.author;
  document.getElementById("modal-author-info").textContent =
    `${post.category || "Article"} · ${formatDate(post.date)}`;

  const artAvatar = document.getElementById("modal-art-avatar");
  artAvatar.src = post.avatar;
  artAvatar.onerror = () =>
    (artAvatar.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(post.author)}&background=2a2a2a&color=c8922a&size=44`);

  const heroImg = document.getElementById("modal-hero-img");
  if (post.image) {
    heroImg.src = post.image;
    heroImg.classList.remove("hidden");
    heroImg.onerror = () => heroImg.classList.add("hidden");
  } else {
    heroImg.classList.add("hidden");
  }

  // Render markdown
  let html = "";
  if (post.video) {
    html += `<div class="video-embed"><iframe src="${post.video}" allowfullscreen></iframe></div>`;
  }
  if (window.marked) {
    html += marked.parse(post.content);
  } else {
    html += `<p>${post.content.replace(/\n/g, "<br>")}</p>`;
  }
  document.getElementById("modal-article-body").innerHTML = html;

  // Load stats
  await loadModalStats(id);

  // Load comments
  await loadComments(id);
}

async function loadModalStats(id) {
  try {
    const stats = await api("GET", `/api/post/${id}/stats`);
    document.getElementById("modal-like-count").textContent = stats.likes;
    document.getElementById("modal-comment-count").textContent =
      stats.comments.length;
    document.getElementById("modal-share-count").textContent = stats.shares;

    const likeBtn = document.getElementById("modal-like-btn");
    if (State.user && stats.comments) {
      // we'll trust the hasLiked endpoint
      try {
        const hl = await api("GET", `/api/post/${id}/hasLiked`);
        likeBtn.classList.toggle("liked", hl.hasLiked);
      } catch {
        /* fine */
      }
    }
  } catch {
    /* silent */
  }
}

function closePost() {
  document.getElementById("post-modal").classList.add("hidden");
  document.body.style.overflow = "";
  State.currentPost = null;
}

async function modalLike() {
  if (!State.user) return openAuth("login");
  const id = State.currentPost?.id;
  if (id == null) return;

  try {
    const res = await api("POST", `/api/post/${id}/like`, {});
    document.getElementById("modal-like-count").textContent = res.likes;
    document
      .getElementById("modal-like-btn")
      .classList.toggle("liked", res.action === "liked");
    // Update feed card
    const likeEl = document.getElementById(`like-count-${id}`);
    if (likeEl) likeEl.textContent = res.likes;
    const feedCard = document.getElementById(`like-${id}`);
    if (feedCard) feedCard.classList.toggle("liked", res.action === "liked");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleLike(id, btn) {
  if (!State.user) return openAuth("login");
  try {
    const res = await api("POST", `/api/post/${id}/like`, {});
    const el = document.getElementById(`like-count-${id}`);
    if (el) el.textContent = res.likes;
    btn.classList.toggle("liked", res.action === "liked");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function sharePost(id) {
  try {
    await api("POST", `/api/post/${id}/share`, {});
    if (navigator.share) {
      await navigator.share({ title: "Trucon", url: window.location.href });
    } else {
      await navigator.clipboard.writeText(window.location.href);
      showToast("Link copied to clipboard", "success");
    }
    const shareEl = document.getElementById("modal-share-count");
    if (shareEl) shareEl.textContent = parseInt(shareEl.textContent || 0) + 1;
  } catch {
    /* user cancelled share */
  }
}

// ── Comments ─────────────────────────────────────────────
async function loadComments(postId) {
  const list = document.getElementById("comments-list");
  if (!list) return;

  try {
    const stats = await api("GET", `/api/post/${postId}/stats`);
    const comments = stats.comments || [];

    if (!comments.length) {
      list.innerHTML = `<p style="color:var(--muted);font-size:0.88rem;">No comments yet. Be the first!</p>`;
      return;
    }

    list.innerHTML = comments.map((c) => makeCommentEl(c)).join("");
  } catch {
    list.innerHTML = "";
  }
}

function makeCommentEl(c) {
  const initials = c.name
    ? c.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";
  const avatarEl = c.avatar
    ? `<img src="${c.avatar}" class="comment-avatar" alt="">`
    : `<div class="comment-avatar-ph">${initials}</div>`;

  return `
  <div class="comment-item">
    ${avatarEl}
    <div class="comment-content">
      <div class="comment-header">
        <span class="comment-name">${escapeHtml(c.name)}</span>
        <span class="comment-time">${timeAgo(c.timestamp)}</span>
      </div>
      <p class="comment-text">${escapeHtml(c.text)}</p>
    </div>
  </div>`;
}

async function submitComment() {
  if (!State.user) return openAuth("login");
  const id = State.currentPost?.id;
  const input = document.getElementById("comment-input");
  const text = input?.value.trim();
  if (!text) return;

  try {
    const res = await api("POST", `/api/post/${id}/comment`, { text });
    input.value = "";
    document.getElementById("modal-comment-count").textContent = res.total;
    const el = document.getElementById(`comment-count-${id}`);
    if (el) el.textContent = res.total;
    // Prepend new comment
    const list = document.getElementById("comments-list");
    const existing = list.innerHTML.includes("No comments")
      ? ""
      : list.innerHTML;
    list.innerHTML = makeCommentEl(res.comment) + existing;
  } catch (err) {
    showToast(err.message, "error");
  }
}

// ═══════════════════════════════════════════════════════════
//  HEALTH SECTION
// ═══════════════════════════════════════════════════════════
async function loadHealthPosts() {
  const feed = document.getElementById("health-feed");
  if (!feed) return;
  feed.innerHTML = `<div class="spinner-wrap"><div class="spinner"></div> Loading…</div>`;

  try {
    const res = await fetch("/api/health-posts");
    const md = await res.text();
    const posts = parseHealthMD(md);

    if (!posts.length) {
      feed.innerHTML = `<div class="empty-state"><p>No health posts yet.</p></div>`;
      return;
    }

    feed.innerHTML = posts.map((p) => makeHealthCard(p)).join("");
  } catch {
    feed.innerHTML = `<div class="empty-state"><p>Could not load health posts.</p></div>`;
  }
}

function parseHealthMD(md) {
  const blocks = md
    .split(/^---\s*$/m)
    .map((b) => b.trim())
    .filter(Boolean);
  return blocks
    .map((block) => {
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
      return { ...meta, content };
    })
    .filter((p) => p.title || p.content);
}

function makeHealthCard(post) {
  const imgEl = post.image
    ? `<img src="${post.image}" class="health-card-img" alt="" onerror="this.style.display='none'">`
    : "";
  const videoEl = post.video
    ? `<div class="health-video"><iframe src="${post.video}" allowfullscreen></iframe></div>`
    : "";
  const bodyHtml = window.marked
    ? marked.parse(post.content)
    : post.content.replace(/\n/g, "<br>");

  return `
  <div class="health-card">
    ${imgEl}
    <div class="health-card-body">
      <div class="health-card-cat">${(post.category || "health").toUpperCase()}</div>
      <h3>${escapeHtml(post.title || "")}</h3>
      <div class="health-card-content">${bodyHtml}${videoEl}</div>
    </div>
  </div>`;
}

// ═══════════════════════════════════════════════════════════
//  LIBRARY / BOOKS
// ═══════════════════════════════════════════════════════════
const CURATED_BOOKS = [
  {
    title: "Mere Christianity",
    author: "C.S. Lewis",
    category: "theology",
    source: "trucon",
    coverImage: "https://covers.openlibrary.org/b/id/8739161-L.jpg",
    downloadUrl:
      "https://archive.org/download/MereChristianity_201602/Mere%20Christianity.pdf",
    description:
      "A case for the Christian faith by one of the 20th century's greatest thinkers.",
    downloads: 0,
  },
  {
    title: "The Federalist Papers",
    author: "Hamilton, Madison & Jay",
    category: "politics",
    source: "trucon",
    coverImage: "https://covers.openlibrary.org/b/id/8222706-L.jpg",
    downloadUrl: "https://www.gutenberg.org/files/1404/1404-h/1404-h.htm",
    description: "Foundational documents of American constitutional democracy.",
    downloads: 0,
  },
  {
    title: "The Republic",
    author: "Plato",
    category: "philosophy",
    source: "trucon",
    coverImage: "https://covers.openlibrary.org/b/id/8171478-L.jpg",
    downloadUrl: "https://www.gutenberg.org/files/1497/1497-h/1497-h.htm",
    description:
      "Plato's masterwork on justice, beauty, equality, politics and epistemology.",
    downloads: 0,
  },
  {
    title: "Things Fall Apart",
    author: "Chinua Achebe",
    category: "history",
    source: "trucon",
    coverImage: "https://covers.openlibrary.org/b/id/8222647-L.jpg",
    downloadUrl: "https://archive.org/details/ThingsFallApart_Achebe",
    description:
      "A landmark of African literature depicting the clash of cultures in Nigeria.",
    downloads: 0,
  },
  {
    title: "Principles of Physics",
    author: "Isaac Newton",
    category: "science",
    source: "trucon",
    coverImage: "https://covers.openlibrary.org/b/id/8224741-L.jpg",
    downloadUrl: "https://www.gutenberg.org/ebooks/28233",
    description:
      "Newton's groundbreaking work on classical mechanics and optics.",
    downloads: 0,
  },
  {
    title: "The Bible (KJV)",
    author: "Various",
    category: "theology",
    source: "trucon",
    coverImage: "https://covers.openlibrary.org/b/id/8091016-L.jpg",
    downloadUrl: "https://www.gutenberg.org/files/10/10-h/10-h.htm",
    description: "The King James Version of the Holy Bible.",
    downloads: 0,
  },
];

let libInitialized = false;

function initLibrary() {
  if (libInitialized) return;
  libInitialized = true;
  State.booksDisplay = [...CURATED_BOOKS];
  renderBooks(State.booksDisplay);
}

async function librarySearch() {
  const q = document.getElementById("lib-search-input")?.value.trim();
  const zlibBtn = document.getElementById("zlib-fallback-link");
  if (zlibBtn) zlibBtn.href = `https://z-library.sk/s/${encodeURIComponent(q)}`;
  if (!q) return;

  const grid = document.getElementById("books-grid");
  if (grid)
    grid.innerHTML = `<div class="spinner-wrap" style="grid-column:1/-1"><div class="spinner"></div> Searching…</div>`;

  const [gutenberg, openLib, zlib] = await Promise.allSettled([
    fetchGutenberg(q),
    fetchOpenLibrary(q),
    fetchZLibrary(q),
  ]);

  const curated = CURATED_BOOKS.filter(
    (b) =>
      b.title.toLowerCase().includes(q.toLowerCase()) ||
      b.author.toLowerCase().includes(q.toLowerCase()),
  );

  const all = [
    ...curated,
    ...(gutenberg.status === "fulfilled" ? gutenberg.value : []),
    ...(openLib.status === "fulfilled" ? openLib.value : []),
    ...(zlib.status === "fulfilled" ? zlib.value : []),
  ];

  State.booksDisplay = shuffleArray(all);
  renderBooks(State.booksDisplay);
}

async function fetchZLibrary(q) {
  try {
    const res = await fetch(`/api/proxy/zlibrary?q=${encodeURIComponent(q)}`);
    const data = await res.json();
    return data;
  } catch {
    return [];
  }
}

async function fetchGutenberg(q) {
  try {
    const res = await fetch(
      `https://gutendex.com/books/?search=${encodeURIComponent(q)}&mime_type=text/html`,
    );
    const data = await res.json();
    return (data.results || []).slice(0, 8).map((b) => ({
      title: b.title,
      author: (b.authors[0]?.name || "Unknown")
        .split(",")
        .reverse()
        .join(" ")
        .trim(),
      category: (b.subjects[0] || "literature")
        .toLowerCase()
        .split("--")[0]
        .trim()
        .slice(0, 20),
      source: "gutenberg",
      coverImage:
        b.formats["image/jpeg"] ||
        `https://placehold.co/200x300/1a1a1a/c8922a?text=${encodeURIComponent(b.title.slice(0, 12))}`,
      downloadUrl:
        b.formats["text/html"] || b.formats["application/pdf"] || "#",
      downloads: b.download_count || 0,
      description: (b.subjects || []).slice(0, 3).join(", "),
    }));
  } catch {
    return [];
  }
}

async function fetchOpenLibrary(q) {
  try {
    const res = await fetch(
      `https://openlibrary.org/search.json?q=${encodeURIComponent(q)}&limit=8&fields=title,author_name,cover_i,subject,key`,
    );
    const data = await res.json();
    return (data.docs || []).slice(0, 8).map((b) => ({
      title: b.title || "Unknown",
      author: (b.author_name || ["Unknown"])[0],
      category:
        (b.subject || ["literature"])[0]?.toLowerCase().slice(0, 20) ||
        "literature",
      source: "openlibrary",
      coverImage: b.cover_i
        ? `https://covers.openlibrary.org/b/id/${b.cover_i}-L.jpg`
        : `https://placehold.co/200x300/1a1a1a/c8922a?text=${encodeURIComponent((b.title || "").slice(0, 12))}`,
      downloadUrl: `https://openlibrary.org${b.key}`,
      downloads: 0,
      description: "",
    }));
  } catch {
    return [];
  }
}

function quickLibSearch(term) {
  const input = document.getElementById("lib-search-input");
  if (input) {
    input.value = term;
    librarySearch();
  }
}

function renderBooks(books) {
  const grid = document.getElementById("books-grid");
  if (!grid) return;

  if (!books.length) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p>No books found. Try a different search.</p></div>`;
    return;
  }

  grid.innerHTML = books
    .map(
      (b) => `
    <div class="book-card" onclick="openBookModal(${escapeAttr(JSON.stringify(b))})">
      <div class="book-cover">
        <img src="${b.coverImage}" alt="${escapeHtml(b.title)}" loading="lazy" onerror="this.src='https://placehold.co/200x300/1a1a1a/c8922a?text=${encodeURIComponent((b.title || "").slice(0, 12))}'">
        <span class="book-badge ${b.source === "trucon" ? "badge-curated" : "badge-external"}">${b.source === "trucon" ? "★ Curated" : b.source}</span>
      </div>
      <div class="book-info">
        <div class="book-title">${escapeHtml(b.title)}</div>
        <div class="book-author">${escapeHtml(b.author)}</div>
        <a href="${b.downloadUrl}" target="_blank" rel="noopener" class="book-download" onclick="event.stopPropagation()">↓ Free Download</a>
      </div>
    </div>`,
    )
    .join("");
}

function openBookModal(book) {
  // For now just open the download link
  if (book.downloadUrl && book.downloadUrl !== "#") {
    window.open(book.downloadUrl, "_blank", "noopener");
  }
}

// ═══════════════════════════════════════════════════════════
//  GLOBAL CHAT
// ═══════════════════════════════════════════════════════════
function initChat() {
  loadChatMessages();
  startChatPoller();
}

function stopChatPoller() {
  if (State.chatPoller) {
    clearInterval(State.chatPoller);
    State.chatPoller = null;
  }
}

function startChatPoller() {
  stopChatPoller();
  State.chatPoller = setInterval(loadChatMessages, 3000);
}

async function loadChatMessages() {
  try {
    const msgs = await api(
      "GET",
      `/api/chat/messages?after=${State.chatLastId}&topic=${State.chatTopic}`,
    );
    if (msgs.length) {
      const container = document.getElementById("chat-messages");
      if (!container) return;
      msgs.forEach((m) => {
        if (m.id > State.chatLastId) {
          State.chatLastId = m.id;
          container.innerHTML += makeChatMsg(m);
        }
      });
      container.scrollTop = container.scrollHeight;
    }
  } catch {
    /* silent */
  }
}

function makeChatMsg(m) {
  const initials = m.name
    ? m.name
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";
  const timeStr = new Date(m.timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  return `
  <div class="chat-msg">
    <div class="chat-msg-header">
      <div class="chat-msg-avatar">${initials}</div>
      <span class="chat-msg-name">${escapeHtml(m.name || "Anonymous")}</span>
      ${m.topic ? `<span class="chat-msg-topic">#${m.topic}</span>` : ""}
      <span class="chat-msg-time">${timeStr}</span>
    </div>
    <div class="chat-msg-text">${escapeHtml(m.text || "")}</div>
  </div>`;
}

async function sendChatMessage() {
  if (!State.user) return openAuth("login");

  const input = document.getElementById("chat-input");
  const text = input?.value.trim();
  if (!text) return;

  input.value = "";
  try {
    await api("POST", "/api/chat/send", { text, topic: State.chatTopic });
    await loadChatMessages();
  } catch (err) {
    showToast(err.message || "Failed to send", "error");
  }
}

function setTopic(topic) {
  State.chatTopic = topic;
  State.chatLastId = 0;
  document
    .querySelectorAll(".topic-chip")
    .forEach((c) => c.classList.toggle("active", c.dataset.topic === topic));
  const container = document.getElementById("chat-messages");
  if (container) container.innerHTML = "";
  loadChatMessages();
}

// ═══════════════════════════════════════════════════════════
//  ADMIN — WRITE POST
// ═══════════════════════════════════════════════════════════
async function submitAdminPost(e) {
  e.preventDefault();
  if (!State.user || State.user.role !== "admin") return openAuth("login");

  const title = document.getElementById("admin-title").value.trim();
  const category = document.getElementById("admin-category").value.trim();
  const image = document.getElementById("admin-image").value.trim();
  const video = document.getElementById("admin-video").value.trim();
  const content = document.getElementById("admin-content").value.trim();
  const btn = document.getElementById("admin-submit-btn");

  if (!title || !content)
    return showToast("Title and content are required", "error");

  btn.disabled = true;
  btn.textContent = "Publishing…";

  try {
    await api("POST", "/api/admin/post", {
      title,
      category,
      image,
      video,
      content,
    });
    showToast("Post published!", "success");
    document.getElementById("admin-title").value = "";
    document.getElementById("admin-category").value = "";
    document.getElementById("admin-image").value = "";
    document.getElementById("admin-video").value = "";
    document.getElementById("admin-content").value = "";
    // Refresh feed
    setTimeout(() => loadPosts(), 500);
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    btn.disabled = false;
    btn.textContent = "Publish Post";
  }
}

// ═══════════════════════════════════════════════════════════
//  RIGHTBAR — TRENDING
// ═══════════════════════════════════════════════════════════
function loadTrending() {
  const el = document.getElementById("trending-list");
  if (!el) return;

  const topics = [
    {
      cat: "Ancient History",
      topic: "Hidden city under Giza",
      count: "1.4K posts",
    },
    { cat: "Theology", topic: "What is biblical truth?", count: "892 posts" },
    { cat: "Identity", topic: "The identity crisis era", count: "741 posts" },
    { cat: "Science", topic: "Zero-point energy field", count: "620 posts" },
    {
      cat: "World Systems",
      topic: "Unseen systems of power",
      count: "510 posts",
    },
    { cat: "Religion", topic: "Is religion necessary?", count: "438 posts" },
  ];

  el.innerHTML = topics
    .map(
      (t) => `
    <div class="trending-item" onclick="setCategoryFilter('${t.cat.toLowerCase()}')">
      <div class="trending-cat">${t.cat}</div>
      <div class="trending-topic">${t.topic}</div>
      <div class="trending-count">${t.count}</div>
    </div>`,
    )
    .join("");
}

// ═══════════════════════════════════════════════════════════
//  ABOUT PAGE
// ═══════════════════════════════════════════════════════════
function loadAbout() {
  // Static — already in HTML
}

// ═══════════════════════════════════════════════════════════
//  UTILITY FUNCTIONS
// ═══════════════════════════════════════════════════════════
function formatDate(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr.replace(/(\d{2})-(\d{2})-(\d{4})/, "$3-$2-$1"));
    if (isNaN(d)) return dateStr;
    return d.toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return dateStr;
  }
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str) {
  return str.replace(/'/g, "&#39;").replace(/"/g, "&quot;");
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Toast notifications ───────────────────────────────────
function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);

  setTimeout(() => toast.remove(), 4000);
}

// ── Server status ping ────────────────────────────────────
async function pingServer() {
  const dot = document.getElementById("status-dot");
  const text = document.getElementById("status-text");
  try {
    await api("GET", "/api/ping");
    if (dot) {
      dot.className = "status-dot online";
    }
    if (text) text.textContent = "Server online";
  } catch {
    if (dot) {
      dot.className = "status-dot offline";
    }
    if (text) text.textContent = "Server offline";
  }
}

// ─── Handle Enter key in inputs ──────────────────────────
function onChatKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    sendChatMessage();
  }
}

function onCommentKeydown(e) {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    submitComment();
  }
}

function onSearchKeydown(e) {
  if (e.key === "Enter") librarySearch();
}

function onPostSearchKeydown(e) {
  const q = e.target.value.trim().toLowerCase();
  if (!q) {
    renderPosts(State.allPosts);
    return;
  }
  const filtered = State.allPosts.filter(
    (p) =>
      p.title.toLowerCase().includes(q) ||
      p.content.toLowerCase().includes(q) ||
      p.author.toLowerCase().includes(q),
  );
  renderPosts(filtered);
}

// ═══════════════════════════════════════════════════════════
//  INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  // Restore auth from localStorage
  loadStoredAuth();

  // Validate token with server
  if (State.token) {
    try {
      const data = await api("GET", "/api/auth/me");
      saveAuth(data.user, State.token);
    } catch {
      clearAuth();
    }
  }

  // Init server ping
  await pingServer();
  setInterval(pingServer, 30000);

  // Trending
  loadTrending();

  // Load initial view
  switchView("home");

  // Load stats after posts render
  setTimeout(loadPostStats, 2000);

  // Keyboard shortcuts for modals
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closePost();
      closeAuthModal();
    }
  });
});
