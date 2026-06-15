# Hyperlocal Firebase Setup

## 1) Create Firebase project
- Open Firebase Console and create a project.
- Add a **Web App** inside that project.

## 2) Enable products
- Authentication -> Sign-in method -> enable **Email/Password**.
- Firestore Database -> create database.

## 3) Paste web config
- Open `firebase-config.js`.
- Replace these placeholders with your real values:
  - `YOUR_API_KEY`
  - `YOUR_PROJECT_ID`
  - `YOUR_MESSAGING_SENDER_ID`
  - `YOUR_APP_ID`

## 4) Apply security rules
- Firestore rules: copy/paste from `firestore.rules`.

## 5) Run locally with server
Do not open HTML directly with `file://`.

Run:

```bash
python3 -m http.server 5500
```

Then open:

```txt
http://localhost:5500/signupPage.html
```

## 6) Backend-integrated pages
**Forms (writes)** — `hyperlocal-backend.js`
- `signupPage.html`
- `loginPage.html`
- `profileCreationPage.html`
- `requestHelpPage.html`
- `offerSkillPage.html`
- `shareEventPage.html`
- `lost&FoundPage.html`
- `shareLocalShopPage.html`
- `helpedPage.html` (log help + lists)

**Feeds, profile & community (reads)** — `hyperlocal-ui.js`
- `homeAllPage.html`, `homeHelpPage.html`, `homeOffersPage.html`
- `profilePage.html`
- `myPostPage.html`
- `communityHelperPage.html`, `communityEventPage.html`, `communityLocalShopPage.html`

## 7) Stored collections
- Firestore: `users`, `posts`, `help_history`, `threads` (each thread has a `messages` subcollection)

## Chat
- Inbox: `messages.html` (all) and `messagesUnread.html` (unread only).
- Legacy URLs `chatInboxPage.html` / `chatInboxUnreadPage.html` redirect to those pages.
- Script: `hyperlocal-chat.js` (loaded from inbox and `chatPage.html`).
- **New chat:** enter the other person’s **signup email** (must match `users.email`, stored lowercase).
- Deploy **`firestore.rules`** so `threads` and `messages` are allowed.
- If the console asks for a composite index (e.g. `threads`: `memberUids` + `updatedAt`), use the link it provides.

## Notes
- This project stores data in **Auth + Firestore only** (no Storage uploads in this setup).
- Community and home feeds are built from **`posts`** and **`help_history`** at runtime—there is no baked-in demo neighbor list in the HTML.
