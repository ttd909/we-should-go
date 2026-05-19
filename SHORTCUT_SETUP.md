# Save to We Should Go — iOS Shortcut Setup

This guide sets up a share button on your iPhone so you can save a TikTok or Instagram reel directly from those apps — without opening We Should Go first.

Works in: **TikTok, Instagram, Safari**

---

## Before you start

You'll need two things:
1. Your **personal token** from the We Should Go app
2. The **app URL** (ask whoever set up the app — it looks like `https://your-app.vercel.app`)

---

## Step 1 — Find your personal token

1. Open We Should Go in Safari on your phone
2. Tap **Settings** in the navigation bar
3. You'll see a long string of letters and numbers under **Personal API token** — tap **Copy** to copy it
4. Keep this screen open (or paste the token into your Notes app so you don't lose it)

---

## Step 2 — Create the Shortcut

1. Open the **Shortcuts** app on your iPhone (it's built in — search for it if you can't find it)
2. Tap the **+** button in the top right corner
3. Tap **Add Action**

---

## Step 3 — Add each action

Add the following actions **in order**. Tap **Add Action** (or the search bar at the bottom) between each step.

### Action 1: Receive input
- Search for **"Receive"**
- Tap **Receive Input from Share Sheet**
- In the action box, tap where it says the input type, and make sure **URLs** is selected

### Action 2: Get web page details
- Search for **"Get Details of Web Page"**
- Tap it to add it
- In the action box, tap **URL of** and change it to **Page Title**
- This extracts the title of the reel page

### Action 3: Get web page description
- Add another **Get Details of Web Page** action
- This time, change it to **Page Description**

### Action 4: Make a web request (this is the main one)
- Search for **"Get Contents of URL"**
- Tap it to add it
- Tap **URL** and type: `https://YOUR-APP-URL/api/ingest-reel`
  *(Replace YOUR-APP-URL with the actual app URL)*
- Tap **Method** and change it to **POST**
- Tap **Request Body** and change it to **JSON**
- Tap **Add new field** four times and fill in:

  | Key | Value |
  |-----|-------|
  | `url` | Shortcut Input *(tap the variable icon and choose "Shortcut Input")* |
  | `notes` | *(leave empty — type nothing)* |
  | `page_title` | Page Title *(tap the variable icon and choose "Page Title" from Step 2)* |
  | `page_description` | Page Description *(tap the variable icon and choose "Page Description" from Step 3)* |

- Tap **Headers** → **Add new header**
  - Name: `Authorization`
  - Value: `Bearer ` followed by your personal token (paste it here)
  - Example: `Bearer a1b2c3d4e5f6...`

### Action 5: Show a notification
- Search for **"Show Notification"**
- Tap it to add it
- Type the message: `Saved to We Should Go ✓`
- This is shown when the save succeeds

---

## Step 4 — Rename and save

1. Tap the name at the top (it probably says "New Shortcut") and rename it to **Save to We Should Go**
2. Tap **Done** in the top right

---

## Step 5 — Test it

1. Open TikTok or Instagram and find any reel
2. Tap the **Share** button on the reel
3. Scroll through the share sheet and tap **Save to We Should Go**
4. You should see a notification: **Saved to We Should Go ✓**
5. Open We Should Go — the reel should appear in your inbox within a minute or two

---

## Step 6 — Share the Shortcut with others (optional)

If you want someone else (like your partner) to use the same Shortcut:

1. Open the Shortcuts app
2. Long-press **Save to We Should Go** and tap **Share**
3. Tap **Copy iCloud Link**
4. Send that link to them

When they open the link, they can tap **Add Shortcut** to install it.

> **Important:** each person needs to use their own personal token. After installing, the other person should open the Shortcut, edit the Authorization header, and replace the token with theirs from the Settings page.

---

## Troubleshooting

**The share option doesn't appear**
Go to Settings → Shortcuts → turn on **Allow Sharing Shortcuts**, then try again.

**I get "Couldn't save — check your connection"**
- Make sure you're connected to the internet
- Double-check the app URL in Action 4 — no typos, no trailing slash
- Make sure your token starts with `Bearer ` (with a space)

**The reel appears but shows "Review needed"**
This means We Should Go couldn't automatically identify the place. Tap the reel in your inbox to fill in the place name manually.
