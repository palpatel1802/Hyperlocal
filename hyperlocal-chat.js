import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    limit,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    updateDoc,
    where,
    writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}

function threadDocId(uidA, uidB) {
    const ids = [uidA, uidB].sort();
    return `${ids[0]}__${ids[1]}`;
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

async function findUserByEmail(emailNorm) {
    const q = query(collection(db, "users"), where("email", "==", emailNorm), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const d = snap.docs[0];
    return { uid: d.id, ...d.data() };
}

async function fetchDisplayName(uid) {
    const snap = await getDoc(doc(db, "users", uid));
    if (!snap.exists()) return "Neighbor";
    const d = snap.data();
    return d.fullName || d.username || d.email?.split("@")[0] || "Neighbor";
}

async function ensureThread(meUid, peerUid, subject) {
    const tid = threadDocId(meUid, peerUid);
    const ref = doc(db, "threads", tid);
    const existing = await getDoc(ref);
    const memberUids = [meUid, peerUid].sort();
    if (!existing.exists()) {
        const unreadByUid = {};
        unreadByUid[meUid] = 0;
        unreadByUid[peerUid] = 0;
        await setDoc(ref, {
            memberUids,
            subject: subject || "",
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
            unreadByUid
        });
    } else if (subject && !(existing.data().subject || "").trim()) {
        await updateDoc(ref, { subject });
    }
    return tid;
}

function wireNewChatModal() {
    const modal = document.getElementById("new-chat-modal");
    const openBtn = document.getElementById("btn-new-chat");
    const closeBtn = document.getElementById("new-chat-close");
    const backdrop = document.getElementById("new-chat-backdrop");
    const form = document.getElementById("new-chat-form");
    if (!modal || !form) return;

    const open = () => {
        modal.hidden = false;
    };
    const close = () => {
        modal.hidden = true;
    };

    openBtn?.addEventListener("click", open);
    closeBtn?.addEventListener("click", close);
    backdrop?.addEventListener("click", close);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        const emailInput = document.getElementById("new-chat-email");
        const subInput = document.getElementById("new-chat-subject");
        const emailNorm = (emailInput?.value || "").trim().toLowerCase();
        const subject = (subInput?.value || "").trim();
        if (!emailNorm) {
            alert("Enter the neighbor’s email.");
            return;
        }
        const me = auth.currentUser;
        if (!me) return;
        try {
            const peer = await findUserByEmail(emailNorm);
            if (!peer) {
                alert("No account found with that email. They must sign up with the same address.");
                return;
            }
            if (peer.uid === me.uid) {
                alert("You cannot start a chat with yourself.");
                return;
            }
            const tid = await ensureThread(me.uid, peer.uid, subject);
            window.location.href = `chatPage.html?thread=${encodeURIComponent(tid)}`;
        } catch (err) {
            alert(err?.message || "Could not start chat.");
        }
    });
}

function threadsQuery(uid) {
    return query(
        collection(db, "threads"),
        where("memberUids", "array-contains", uid),
        orderBy("updatedAt", "desc"),
        limit(60)
    );
}

async function threadsQueryFallback(uid) {
    const q = query(collection(db, "threads"), where("memberUids", "array-contains", uid), limit(60));
    const snap = await getDocs(q);
    const list = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
    list.sort((a, b) => {
        const ta = a.data.updatedAt?.toMillis?.() || a.data.createdAt?.toMillis?.() || 0;
        const tb = b.data.updatedAt?.toMillis?.() || b.data.createdAt?.toMillis?.() || 0;
        return tb - ta;
    });
    return list;
}

async function buildInboxRow(threadId, data, myUid) {
    const otherUid = (data.memberUids || []).find((u) => u !== myUid) || "";
    const peerName = otherUid ? await fetchDisplayName(otherUid) : "Chat";
    const preview = (data.lastMessagePreview || "").trim() || "No messages yet";
    const when = data.updatedAt?.toDate
        ? data.updatedAt.toDate().toLocaleString()
        : data.createdAt?.toDate
          ? data.createdAt.toDate().toLocaleString()
          : "";
    const unread = Number(data.unreadByUid?.[myUid] || 0);
    return { threadId, peerName, preview, when, unread, otherUid };
}

function renderInboxRows(container, rows, mode) {
    if (!container) return;
    const filtered =
        mode === "unread" ? rows.filter((r) => r.unread > 0) : rows;

    if (!filtered.length) {
        container.innerHTML =
            '<p style="color:#717171;padding:16px;">No chats yet. Use <strong>+ New chat</strong> with a neighbor’s signup email.</p>';
        return;
    }

    container.innerHTML = filtered
        .map(
            (r) => `
        <article class="inbox-row" data-thread="${escapeHtml(r.threadId)}">
            <a class="inbox-row-main" href="chatPage.html?thread=${encodeURIComponent(r.threadId)}">
                <div class="inbox-peer">${escapeHtml(r.peerName)}</div>
                <div class="inbox-preview">${escapeHtml(r.preview)}</div>
                <div class="inbox-meta">${escapeHtml(r.when)}${r.unread > 0 ? ` · <span class="inbox-unread-badge">${r.unread}</span>` : ""}</div>
            </a>
            <button type="button" class="chat-remove-btn" data-remove-thread="${escapeHtml(r.threadId)}" aria-label="Remove chat">✕</button>
        </article>`
        )
        .join("");

    container.querySelectorAll("[data-remove-thread]").forEach((btn) => {
        btn.addEventListener("click", async (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            const tid = btn.getAttribute("data-remove-thread");
            if (!tid || !confirm("Remove this chat from your inbox?")) return;
            try {
                await deleteDoc(doc(db, "threads", tid));
            } catch (err) {
                alert(err?.message || "Could not remove chat.");
            }
        });
    });
}

async function updateInboxBadges(allRows) {
    const all = allRows.length;
    const unread = allRows.filter((r) => r.unread > 0).length;
    const elAll = document.getElementById("inbox-badge-all");
    const elUn = document.getElementById("inbox-badge-unread");
    if (elAll) elAll.textContent = String(all);
    if (elUn) elUn.textContent = String(unread);
}

async function initInbox(mode) {
    const container = document.getElementById("chat-inbox-list");
    const user = await waitForUser();
    wireNewChatModal();

    let unsub = null;
    const q = threadsQuery(user.uid);

    unsub = onSnapshot(
        q,
        async (snap) => {
            const rows = [];
            for (const d of snap.docs) {
                rows.push(await buildInboxRow(d.id, d.data(), user.uid));
            }
            renderInboxRows(container, rows, mode);
            await updateInboxBadges(rows);
        },
        async () => {
            const list = await threadsQueryFallback(user.uid);
            const rows = [];
            for (const item of list) {
                rows.push(await buildInboxRow(item.id, item.data, user.uid));
            }
            renderInboxRows(container, rows, mode);
            await updateInboxBadges(rows);
        }
    );

    window.addEventListener("beforeunload", () => {
        if (typeof unsub === "function") unsub();
    });
}

async function clearMyUnread(threadRef, threadSnap, myUid) {
    if (!threadSnap.exists()) return;
    const data = threadSnap.data();
    const unreadByUid = { ...(data.unreadByUid || {}) };
    unreadByUid[myUid] = 0;
    await updateDoc(threadRef, { unreadByUid });
}

async function initChatRoom() {
    const params = new URLSearchParams(window.location.search);
    const tid = params.get("thread");
    if (!tid) {
        window.location.href = "messages.html";
        return;
    }

    const user = await waitForUser();
    const threadRef = doc(db, "threads", tid);
    const threadSnap = await getDoc(threadRef);
    if (!threadSnap.exists() || !(threadSnap.data().memberUids || []).includes(user.uid)) {
        alert("Chat not found.");
        window.location.href = "messages.html";
        return;
    }

    await clearMyUnread(threadRef, threadSnap, user.uid);

    const otherUid = (threadSnap.data().memberUids || []).find((u) => u !== user.uid);
    const nameEl = document.getElementById("chat-peer-name");
    const statusEl = document.getElementById("chat-peer-status");
    if (otherUid) {
        const name = await fetchDisplayName(otherUid);
        if (nameEl) nameEl.textContent = name;
        if (statusEl) statusEl.textContent = threadSnap.data().subject || "Direct message";
    }

    const listEl = document.getElementById("chat-messages");
    const inputEl = document.getElementById("chat-message-input");
    const sendBtn = document.getElementById("chat-send-btn");
    const delBtn = document.getElementById("chat-delete-thread");

    const msgsRef = collection(db, "threads", tid, "messages");
    const qMsgs = query(msgsRef, orderBy("createdAt", "asc"), limit(200));

    onSnapshot(qMsgs, (snap) => {
        if (!listEl) return;
        if (snap.empty) {
            listEl.innerHTML = '<p style="color:#717171;padding:16px;">No messages yet. Say hello below.</p>';
            return;
        }
        listEl.innerHTML = snap.docs
            .map((d) => {
                const m = d.data();
                const mine = m.senderUid === user.uid;
                const text = escapeHtml(m.text || "");
                return `<div class="msg ${mine ? "msg-mine" : "msg-theirs"}"><div class="msg-bubble">${text}</div></div>`;
            })
            .join("");
        listEl.scrollTop = listEl.scrollHeight;
    });

    async function send() {
        const text = (inputEl?.value || "").trim();
        if (!text) return;
        inputEl.value = "";
        const tRef = doc(db, "threads", tid);
        const tSnap = await getDoc(tRef);
        if (!tSnap.exists()) return;
        const data = tSnap.data();
        const other = (data.memberUids || []).find((u) => u !== user.uid);
        const unreadByUid = { ...(data.unreadByUid || {}) };
        if (other) unreadByUid[other] = Number(unreadByUid[other] || 0) + 1;
        unreadByUid[user.uid] = 0;

        await addDoc(msgsRef, {
            senderUid: user.uid,
            text,
            createdAt: serverTimestamp()
        });
        await updateDoc(tRef, {
            updatedAt: serverTimestamp(),
            lastMessagePreview: text.slice(0, 140),
            lastSenderUid: user.uid,
            unreadByUid
        });
    }

    sendBtn?.addEventListener("click", () => send().catch((e) => alert(e.message)));
    inputEl?.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            send().catch((err) => alert(err.message));
        }
    });

    delBtn?.addEventListener("click", async () => {
        if (!confirm("Delete this chat for everyone?")) return;
        try {
            const pageSize = 400;
            for (;;) {
                const snap = await getDocs(query(msgsRef, limit(pageSize)));
                if (snap.empty) break;
                const batch = writeBatch(db);
                snap.docs.forEach((d) => batch.delete(d.ref));
                await batch.commit();
                if (snap.size < pageSize) break;
            }
            await deleteDoc(threadRef);
            window.location.href = "messages.html";
        } catch (e) {
            alert(e?.message || "Could not delete chat.");
        }
    });
}

function route() {
    const kind = document.body?.dataset?.chatPage;
    if (!kind) return;
    if (kind === "inbox-all") {
        initInbox("all").catch(() => {
            const el = document.getElementById("chat-inbox-list");
            if (el) el.innerHTML = "<p>Could not load chats. Check Firestore rules and indexes.</p>";
        });
    } else if (kind === "inbox-unread") {
        initInbox("unread").catch(() => {
            const el = document.getElementById("chat-inbox-list");
            if (el) el.innerHTML = "<p>Could not load chats. Check Firestore rules and indexes.</p>";
        });
    } else if (kind === "chat-room") {
        initChatRoom().catch((e) => alert(e?.message || "Chat failed to load."));
    }
}

route();
