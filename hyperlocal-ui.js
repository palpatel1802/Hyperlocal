import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    collection,
    doc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function postTypeLabel(type) {
    const map = {
        request_help: "Help needed",
        offer_skill: "Offers",
        share_event: "Event",
        lost_found: "Lost & Found",
        share_local_shop: "Local shop"
    };
    return map[type] || "Post";
}

function timeAgo(ts) {
    if (!ts?.toDate) return "";
    const d = ts.toDate();
    const sec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (sec < 60) return "just now";
    if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
    if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
    if (sec < 604800) return `${Math.floor(sec / 86400)}d ago`;
    return d.toLocaleDateString();
}

function authorFromPost(data) {
    return data.authorName || data.authorUsername || data.userEmail?.split("@")[0] || "Neighbor";
}

const DEFAULT_USER_AVATAR = "images/user-default.svg";

function filterPosts(list, mode) {
    if (mode === "all") return list;
    if (mode === "help")
        return list.filter((p) => p.type === "request_help" || p.type === "lost_found");
    if (mode === "offers")
        return list.filter((p) =>
            ["offer_skill", "share_event", "share_local_shop"].includes(p.type)
        );
    return list;
}

function renderFeedCards(container, posts) {
    if (!container) return;
    if (!posts.length) {
        container.innerHTML = '<p style="grid-column:1/-1;color:#717171;padding:24px;">No posts yet. Create one from the Create tab.</p>';
        return;
    }

    container.innerHTML = posts
        .map((data) => {
            const title = escapeHtml(data.title || "Untitled");
            const author = escapeHtml(authorFromPost(data));
            const desc = escapeHtml((data.description || "").slice(0, 280));
            const pill = escapeHtml(postTypeLabel(data.type));
            const when = timeAgo(data.createdAt) || "recently";
            return `
            <article class="card">
                <div class="card-header">
                    <div class="location-pill">${when}</div>
                    <div class="status-pill">${pill}</div>
                </div>
                <h2 class="card-title">${title}</h2>
                <p class="card-author">${author}</p>
                <p class="card-description">${desc || "—"}</p>
                <div class="card-actions">
                    <div class="action-group">
                        <a href="messages.html" class="action-button">Chat</a>
                        <button type="button" class="action-button" disabled title="Share coming soon">Share</button>
                    </div>
                    <div class="rating">—</div>
                </div>
            </article>`;
        })
        .join("");
}

async function fetchPostsOrdered() {
    const q = query(collection(db, "posts"), orderBy("createdAt", "desc"), limit(80));
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

async function fetchMyPosts(uid) {
    const q = query(collection(db, "posts"), where("uid", "==", uid), limit(80));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    return list;
}

function groupPostsByMonth(posts) {
    const groups = {};
    for (const p of posts) {
        const ts = p.createdAt?.toDate?.();
        const key = ts
            ? ts.toLocaleString("default", { month: "long", year: "numeric" })
            : "Earlier";
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
    }
    return groups;
}

function renderMyPosts(container, posts) {
    if (!container) return;
    if (!posts.length) {
        container.innerHTML = "<p>No posts yet. Create a post from Create.</p>";
        return;
    }
    const grouped = groupPostsByMonth(posts);
    const order = Object.keys(grouped).sort((a, b) => {
        const da = grouped[a][0]?.createdAt?.toDate?.() || 0;
        const db = grouped[b][0]?.createdAt?.toDate?.() || 0;
        return db - da;
    });

    container.innerHTML = order
        .map((monthKey) => {
            const items = grouped[monthKey];
            const cards = items
                .map(
                    (p) => `
                <article class="post-card">
                    <h3 class="post-title">${escapeHtml(p.title || postTypeLabel(p.type))}</h3>
                    <p class="post-description">${escapeHtml((p.description || "").slice(0, 400))}</p>
                    <p class="post-timestamp">${escapeHtml(postTypeLabel(p.type))} · ${timeAgo(p.createdAt) || ""}</p>
                </article>`
                )
                .join("");
            return `
            <div class="month-section">
                <h2 class="month-header">${escapeHtml(monthKey)}</h2>
                <div class="posts-list">${cards}</div>
            </div>`;
        })
        .join("");
}

async function loadCommunityStats(bannerEl) {
    if (!bannerEl) return;
    const numbers = bannerEl.querySelectorAll(".stat-number");
    try {
        const posts = await fetchPostsOrdered();
        const uids = new Set(posts.map((p) => p.uid).filter(Boolean));
        const helpSnap = await getDocs(query(collection(db, "help_history"), limit(200)));
        const helps = helpSnap.docs.map((d) => d.data());
        const weekAgo = Date.now() - 7 * 86400000;
        const helpsWeek = helps.filter((h) => {
            const t = h.timestamp?.toDate?.()?.getTime() || 0;
            return t >= weekAgo;
        }).length;
        const ratings = helps.map((h) => Number(h.rating)).filter((n) => !Number.isNaN(n) && n > 0);
        const avg = ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : "—";

        if (numbers[0]) numbers[0].textContent = String(uids.size || posts.length || 0);
        if (numbers[1]) numbers[1].textContent = String(helpsWeek);
        if (numbers[2]) numbers[2].textContent = String(avg);
    } catch {
        /* keep placeholders */
    }
}

function renderTopHelpers(container, posts) {
    if (!container) return;
    const offerPosts = posts.filter((p) => p.type === "offer_skill");
    const byUser = {};
    for (const p of offerPosts) {
        byUser[p.uid] = (byUser[p.uid] || 0) + 1;
    }
    const sorted = Object.entries(byUser)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    if (!sorted.length) {
        container.innerHTML = "<p>No helper activity yet. Post an offer under Create.</p>";
        return;
    }

    container.innerHTML = sorted
        .map(([uid, count], index) => {
            const sample = offerPosts.find((p) => p.uid === uid);
            const name = escapeHtml(sample?.authorName || sample?.authorUsername || "Member");
            return `
            <article class="helper-card">
                <div class="helper-rank">${index + 1}</div>
                <img class="helper-avatar" src="${DEFAULT_USER_AVATAR}" alt="" />
                <div class="helper-info">
                    <div class="helper-name">${name}</div>
                    <div class="helper-badge">Skill offers shared</div>
                    <div class="helper-stats">
                        <span>${count} offer${count === 1 ? "" : "s"}</span>
                    </div>
                </div>
            </article>`;
        })
        .join("");
}

function renderEventGrid(container, posts) {
    if (!container) return;
    const events = posts.filter((p) => p.type === "share_event");
    if (!events.length) {
        container.innerHTML = "<p>No events yet. Share an event from Create.</p>";
        return;
    }
    container.innerHTML = events
        .map((p) => {
            const loc = escapeHtml(p.location || "");
            const range = [p.startsAt, p.endsAt].filter(Boolean).join(" → ");
            return `
            <article class="event-card">
                <div class="event-content">
                    <h3 class="event-title">${escapeHtml(p.title || "Event")}</h3>
                    <div class="event-meta">
                        <div class="meta-item"><span>${escapeHtml(range || timeAgo(p.createdAt) || "")}</span></div>
                        <div class="meta-item"><span>${loc || "—"}</span></div>
                    </div>
                    <p class="event-attendance">${escapeHtml(authorFromPost(p))}</p>
                    <span class="join-btn" style="opacity:0.85;cursor:default;">From neighborhood posts</span>
                </div>
            </article>`;
        })
        .join("");
}

function renderShopGrid(container, posts) {
    if (!container) return;
    const shops = posts.filter((p) => p.type === "share_local_shop");
    if (!shops.length) {
        container.innerHTML = "<p>No local shops shared yet.</p>";
        return;
    }
    container.innerHTML = shops
        .map((p) => {
            const cat = escapeHtml(p.category || "");
            const loc = escapeHtml(p.location || "");
            return `
            <article class="shop-card">
                <div class="shop-info">
                    <h3 class="shop-name">${escapeHtml(p.title || "Shop")}</h3>
                    <div class="shop-category">${cat || "Shop"}</div>
                    <div class="shop-distance">${loc || "—"}</div>
                    <div class="shop-rating"><span class="rating-value">${escapeHtml(authorFromPost(p))}</span></div>
                </div>
            </article>`;
        })
        .join("");
}

function waitForUser() {
    return new Promise((resolve) => {
        const unsub = onAuthStateChanged(auth, (user) => {
            unsub();
            if (!user) {
                window.location.href = "loginPage.html";
                return;
            }
            resolve(user);
        });
    });
}

async function initProfilePage() {
    const user = await waitForUser();

    const nameEl = document.getElementById("profile-display-name");
    const bioEl = document.getElementById("profile-bio");
    const imgEl = document.getElementById("profile-avatar");
    const helpsEl = document.getElementById("stat-helps");
    const ratingEl = document.getElementById("stat-rating");
    const skillsEl = document.getElementById("profile-skills");
    const achEl = document.getElementById("profile-achievements");

    async function refreshCounts() {
        const myPostsSnap = await getDocs(
            query(collection(db, "posts"), where("uid", "==", user.uid), limit(100))
        );
        const postCount = myPostsSnap.size;

        const helpSnap = await getDocs(
            query(collection(db, "help_history"), where("helperUid", "==", user.uid), limit(100))
        );
        const helpCount = helpSnap.size;
        const ratings = helpSnap.docs
            .map((d) => Number(d.data().rating))
            .filter((n) => !Number.isNaN(n) && n > 0);
        const avgRating = ratings.length
            ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)
            : "—";

        if (helpsEl) helpsEl.textContent = String(helpCount || postCount);
        if (ratingEl) ratingEl.textContent = ratings.length ? `${avgRating} ★` : "—";

        if (achEl) {
            achEl.innerHTML = `
            <div class="achievement"><p class="achievement-name">${postCount} posts shared</p></div>
            <div class="achievement"><p class="achievement-name">${helpCount} helps logged</p></div>
            <div class="achievement"><p class="achievement-name">${ratings.length ? `Avg ${avgRating} ★` : "Rate helps you give"}</p></div>`;
        }
    }

    onSnapshot(doc(db, "users", user.uid), async (snap) => {
        const data = snap.exists() ? snap.data() : {};
        const displayName =
            data.fullName ||
            data.username ||
            user.displayName ||
            user.email?.split("@")[0] ||
            "Member";
        if (nameEl) nameEl.textContent = displayName;
        if (bioEl) bioEl.textContent = data.bio || "Add a short bio from profile setup.";
        if (imgEl) {
            imgEl.src = DEFAULT_USER_AVATAR;
            imgEl.alt = displayName;
        }

        if (skillsEl) {
            const skills = (data.skills || "").split(",").map((s) => s.trim()).filter(Boolean);
            if (skills.length) {
                skillsEl.innerHTML = skills.map((s) => `<span class="skill-badge">${escapeHtml(s)}</span>`).join("");
            } else {
                skillsEl.innerHTML =
                    '<span class="skill-badge" style="opacity:0.7;">Add skills in profile setup</span>';
            }
        }

        await refreshCounts();
    });

    const logoutBtn = document.getElementById("logout-btn");
    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            await signOut(auth);
            window.location.href = "loginPage.html";
        });
    }
}

function route() {
    const page = document.body?.dataset?.page;
    if (!page) return;

    const run = async () => {
        if (page === "profile") {
            await initProfilePage();
            return;
        }

        await waitForUser();

        const posts = await fetchPostsOrdered();

        if (page === "home-all") {
            renderFeedCards(document.getElementById("feed-cards"), filterPosts(posts, "all"));
        } else if (page === "home-help") {
            renderFeedCards(document.getElementById("feed-cards"), filterPosts(posts, "help"));
        } else if (page === "home-offers") {
            renderFeedCards(document.getElementById("feed-cards"), filterPosts(posts, "offers"));
        } else if (page === "my-posts") {
            const user = auth.currentUser;
            if (user) {
                const mine = await fetchMyPosts(user.uid);
                renderMyPosts(document.getElementById("my-posts-container"), mine);
            }
        } else if (page === "community-helpers") {
            await loadCommunityStats(document.getElementById("community-banner"));
            renderTopHelpers(document.getElementById("dynamic-helpers-list"), posts);
        } else if (page === "community-events") {
            await loadCommunityStats(document.getElementById("community-banner"));
            renderEventGrid(document.getElementById("dynamic-events-grid"), posts);
        } else if (page === "community-shops") {
            await loadCommunityStats(document.getElementById("community-banner"));
            renderShopGrid(document.getElementById("dynamic-shops-grid"), posts);
        }
    };

    run().catch(() => {
        const msg = "<p>Could not load data. Check Firestore rules and login.</p>";
        const el = document.getElementById("feed-cards");
        if (el) el.innerHTML = msg;
        const h = document.getElementById("dynamic-helpers-list");
        if (h) h.innerHTML = msg;
        const ev = document.getElementById("dynamic-events-grid");
        if (ev) ev.innerHTML = msg;
        const sh = document.getElementById("dynamic-shops-grid");
        if (sh) sh.innerHTML = msg;
    });
}

route();
