import { auth, db } from "./firebase-config.js";
import {
    createUserWithEmailAndPassword,
    onAuthStateChanged,
    signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
    addDoc,
    collection,
    deleteField,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    serverTimestamp,
    setDoc,
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

function alertError(error) {
    const message = error?.message || "Something went wrong. Please try again.";
    alert(message);
}

function requireAuth() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);

    return new Promise((resolve) => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            unsubscribe();
            if (!user) {
                alert("Please login first.");
                window.location.href = "loginPage.html";
                return;
            }
            resolve(user);
        });
    });
}

function setLoading(button, isLoading, defaultText) {
    if (!button) return;
    button.disabled = isLoading;
    button.textContent = isLoading ? "Please wait..." : defaultText;
}

function getValue(id) {
    const element = document.getElementById(id);
    return element ? element.value.trim() : "";
}

function wireFileNamePreview() {
    const photoInput = document.getElementById("photo");
    const fileName = document.querySelector(".file-name");
    if (!photoInput || !fileName) return;

    photoInput.addEventListener("change", () => {
        fileName.textContent = photoInput.files?.[0]?.name || "No file chosen";
    });
}

function wireSignup() {
    const form = document.getElementById("signup-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "SIGN-UP");

        const username = getValue("username");
        const email = getValue("email");
        const password = getValue("password");

        if (!username || !email || !password) {
            alert("Please fill all required fields.");
            setLoading(submitButton, false, "SIGN-UP");
            return;
        }

        try {
            const emailNorm = email.trim().toLowerCase();
            const userCredential = await createUserWithEmailAndPassword(auth, emailNorm, password);
            const { uid } = userCredential.user;

            await setDoc(
                doc(db, "users", uid),
                {
                    uid,
                    username,
                    email: emailNorm,
                    createdAt: serverTimestamp()
                },
                { merge: true }
            );

            window.location.href = "profileCreationPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "SIGN-UP");
        }
    });
}

function wireLogin() {
    const form = document.getElementById("login-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "LOG-IN");

        const email = getValue("email").toLowerCase();
        const password = getValue("password");

        if (!email || !password) {
            alert("Please enter email and password.");
            setLoading(submitButton, false, "LOG-IN");
            return;
        }

        try {
            await signInWithEmailAndPassword(auth, email, password);
            window.location.href = "homeAllPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "LOG-IN");
        }
    });
}

function wireProfileCreation() {
    const form = document.getElementById("profile-form");
    if (!form) return;
    wireFileNamePreview();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "SUBMIT");

        try {
            const user = await requireAuth();
            const fullName = getValue("fullname");
            const contact = getValue("contact");
            const bio = getValue("bio");
            const address = getValue("address");
            const skills = getValue("skills");

            if (!fullName || !contact || !address) {
                alert("Please fill name, contact and address.");
                setLoading(submitButton, false, "SUBMIT");
                return;
            }

            await setDoc(
                doc(db, "users", user.uid),
                {
                    uid: user.uid,
                    email: (user.email || "").trim().toLowerCase(),
                    fullName,
                    contact,
                    bio,
                    address,
                    skills,
                    photoURL: deleteField(),
                    avatarPreset: deleteField(),
                    updatedAt: serverTimestamp()
                },
                { merge: true }
            );

            window.location.href = "homeAllPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "SUBMIT");
        }
    });
}

async function createPost(type, data) {
    const user = await requireAuth();
    const userSnap = await getDoc(doc(db, "users", user.uid));
    const u = userSnap.exists() ? userSnap.data() : {};
    const authorName = u.fullName || u.username || user.email?.split("@")[0] || "Member";
    const authorUsername = u.username || "";

    await addDoc(collection(db, "posts"), {
        uid: user.uid,
        userEmail: user.email || "",
        authorName,
        authorUsername,
        type,
        imageUrl: "",
        ...data,
        createdAt: serverTimestamp()
    });
}

function wireRequestHelp() {
    const form = document.getElementById("request-help-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "POST");

        try {
            await createPost("request_help", {
                title: getValue("title"),
                description: getValue("description"),
                category: getValue("category")
            });
            window.location.href = "homeAllPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "POST");
        }
    });
}

function wireOfferSkill() {
    const form = document.getElementById("offer-skill-form");
    if (!form) return;
    wireFileNamePreview();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "POST");

        try {
            await createPost(
                "offer_skill",
                {
                    title: getValue("skill-title"),
                    description: getValue("description"),
                    category: getValue("category"),
                    availability: getValue("availability"),
                    location: getValue("location")
                }
            );
            window.location.href = "homeAllPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "POST");
        }
    });
}

function wireShareEvent() {
    const form = document.getElementById("share-event-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "POST");

        try {
            const eventTypeEl = document.querySelector("input[name='event-type']:checked");
            await createPost("share_event", {
                title: getValue("event-title"),
                description: getValue("description"),
                location: getValue("location"),
                startsAt: getValue("event-start"),
                endsAt: getValue("event-end"),
                eventType: eventTypeEl ? eventTypeEl.value : ""
            });
            window.location.href = "homeAllPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "POST");
        }
    });
}

function wireLostFound() {
    const form = document.getElementById("lost-found-form");
    if (!form) return;
    wireFileNamePreview();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "POST");

        try {
            const itemType = document.querySelector("input[name='item-type']:checked");
            await createPost(
                "lost_found",
                {
                    itemType: itemType ? itemType.value : "",
                    title: getValue("item-name"),
                    description: getValue("description"),
                    location: getValue("location")
                }
            );
            window.location.href = "homeAllPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "POST");
        }
    });
}

function wireShareLocalShop() {
    const form = document.getElementById("share-local-shop-form");
    if (!form) return;
    wireFileNamePreview();

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "POST");

        try {
            await createPost(
                "share_local_shop",
                {
                    title: getValue("shop-name"),
                    description: getValue("description"),
                    category: getValue("category"),
                    availability: getValue("availability"),
                    location: getValue("location")
                }
            );
            window.location.href = "homeAllPage.html";
        } catch (error) {
            alertError(error);
            setLoading(submitButton, false, "POST");
        }
    });
}

function renderHelpedHistory(items, containerEl) {
    const container = containerEl || document.getElementById("helped-history-list");
    if (!container) return;

    if (!items.length) {
        container.innerHTML = "<p>No logged help yet. Use the form above to record help you gave.</p>";
        return;
    }

    container.innerHTML = items
        .map((entry) => {
            const personName = escapeHtml(entry.personName || "Neighbor");
            const rating = escapeHtml(entry.rating ?? "-");
            const serviceTitle = escapeHtml(entry.serviceTitle || "Help activity");
            const timestamp = escapeHtml(
                entry.timestamp?.toDate?.().toLocaleString() || "Time not available"
            );
            return `
            <article class="helped-card">
                <div class="helped-card-header">
                    <p class="person-name">${personName}</p>
                    <div class="rating">
                        <span>${rating}</span>
                        <span class="rating-star">★</span>
                    </div>
                </div>
                <h3 class="service-title">${serviceTitle}</h3>
                <p class="timestamp">${timestamp}</p>
            </article>
        `;
        })
        .join("");
}

function renderPostActivity(posts) {
    const container = document.getElementById("helped-posts-activity");
    if (!container) return;
    if (!posts.length) {
        container.innerHTML = "<p>No posts yet. Create one from Create.</p>";
        return;
    }
    const typeLabel = (t) =>
        ({
            request_help: "Help needed",
            offer_skill: "Offer skill",
            share_event: "Event",
            lost_found: "Lost & Found",
            share_local_shop: "Local shop"
        }[t] || t || "Post");
    container.innerHTML = posts
        .map((p) => {
            const title = escapeHtml(p.title || typeLabel(p.type));
            const when = escapeHtml(p.createdAt?.toDate?.().toLocaleString() || "");
            return `
            <article class="helped-card">
                <div class="helped-card-header">
                    <p class="person-name">${escapeHtml(typeLabel(p.type))}</p>
                </div>
                <h3 class="service-title">${title}</h3>
                <p class="timestamp">${when}</p>
            </article>`;
        })
        .join("");
}

function sortByTimestampDesc(items) {
    return items.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
}

async function wireHelpHistory() {
    const listHelp = document.getElementById("helped-history-list");
    const listPosts = document.getElementById("helped-posts-activity");
    if (!listHelp && !listPosts) return;

    try {
        const user = await requireAuth();
        const historyQuery = query(
            collection(db, "help_history"),
            where("helperUid", "==", user.uid),
            limit(30)
        );

        const snap = await getDocs(historyQuery);
        let items = snap.docs.map((docItem) => docItem.data());
        items = sortByTimestampDesc(items);
        renderHelpedHistory(items, listHelp);

        const postsQuery = query(collection(db, "posts"), where("uid", "==", user.uid), limit(25));
        const postSnap = await getDocs(postsQuery);
        let posts = postSnap.docs.map((docItem) => ({ id: docItem.id, ...docItem.data() }));
        posts.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
        renderPostActivity(posts);
    } catch (error) {
        alertError(error);
    }
}

function wireLogHelp() {
    const form = document.getElementById("log-help-form");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const submitButton = form.querySelector("button[type='submit']");
        setLoading(submitButton, true, "Save");

        try {
            const user = await requireAuth();
            const serviceTitle = getValue("help-service-title");
            const personName = getValue("help-person-name");
            const rating = Number(getValue("help-rating")) || 0;

            if (!serviceTitle) {
                alert("Please enter what you helped with.");
                setLoading(submitButton, false, "Save");
                return;
            }

            await addDoc(collection(db, "help_history"), {
                helperUid: user.uid,
                serviceTitle,
                personName: personName || "Neighbor",
                rating: rating || null,
                timestamp: serverTimestamp()
            });

            form.reset();
            await wireHelpHistory();
        } catch (error) {
            alertError(error);
        } finally {
            setLoading(submitButton, false, "Save");
        }
    });
}

function init() {
    wireSignup();
    wireLogin();
    wireProfileCreation();
    wireRequestHelp();
    wireOfferSkill();
    wireShareEvent();
    wireLostFound();
    wireShareLocalShop();
    wireLogHelp();
    wireHelpHistory();
}

init();
