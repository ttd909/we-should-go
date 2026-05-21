# Save to We Should Go - iOS Shortcut Setup

This guide sets up a share button on your iPhone so you can save a TikTok or Instagram reel directly from those apps, without opening We Should Go first.

Works in: **TikTok, Instagram, Safari**

---

## Before you start

You'll need two things:

1. Your **personal token** from the We Should Go app
2. The **app URL**, usually `https://weshouldgo.app`

---

## Step 1 - Find your personal token

1. Open We Should Go in Safari on your phone
2. Tap **Settings** in the navigation bar
3. Tap **Copy** under **Personal API token**
4. Keep this screen open, or paste the token into Notes temporarily

---

## Step 2 - Create the Shortcut

1. Open the **Shortcuts** app on your iPhone
2. Tap the **+** button in the top right corner
3. Tap **Add Action**

---

## Step 3 - Add each action

Add the following actions **in order**. Tap **Add Action** or use the search bar between each step.

### Action 1: Receive input

- Search for **Receive**
- Tap **Receive Input from Share Sheet**
- Make sure **URLs** is selected as the input type

### Action 2: Get web page title

- Search for **Get Details of Web Page**
- Tap it to add it
- Tap **URL of** and change it to **Page Title**

### Action 3: Get web page description

- Add another **Get Details of Web Page** action
- Change it to **Page Description**

### Action 4: Choose a Dreamlist

This picker lets the Shortcut save to any Dreamlist you belong to.

1. Add **Get Contents of URL**
2. Set URL to:

   `https://YOUR-APP-URL/api/shortcut/dreamlists`

3. Set **Method** to **GET**
4. Add this header:

   | Header | Value |
   |--------|-------|
   | `Authorization` | `Bearer YOUR_PERSONAL_TOKEN` |

5. Add **Get Dictionary from Input**
6. Add **Get Dictionary Value**
   - Dictionary: output from **Get Dictionary from Input**
   - Key: `labels`
7. Add **Choose from List**
   - Prompt: `Save to which Dreamlist?`
8. Add **Get Dictionary Value**
   - Dictionary: output from **Get Dictionary from Input**
   - Key: `ids_by_label`
9. Add another **Get Dictionary Value**
   - Dictionary: output from the `ids_by_label` action
   - Key: the item chosen in **Choose from List**

The result of that last action is the selected `dreamlist_id`.

### Action 5: Save the reel

- Search for **Get Contents of URL**
- Tap it to add it
- Tap **URL** and type:

  `https://YOUR-APP-URL/api/ingest-reel`

- Tap **Method** and change it to **POST**
- Tap **Request Body** and change it to **JSON**
- Add these fields:

  | Key | Value |
  |-----|-------|
  | `url` | Shortcut Input |
  | `notes` | Leave empty |
  | `dreamlist_id` | Selected `dreamlist_id` from Action 4 |
  | `page_title` | Page Title from Action 2 |
  | `page_description` | Page Description from Action 3 |

- Add this header:

  | Header | Value |
  |--------|-------|
  | `Authorization` | `Bearer YOUR_PERSONAL_TOKEN` |

### Action 6: Show a notification

- Search for **Show Notification**
- Tap it to add it
- Type the message: `Saved to We Should Go`

---

## Fast version without the picker

If you skip Action 4 and leave `dreamlist_id` out of the save request, the Shortcut saves to your personal `My Dreamlist`.

---

## Step 4 - Rename and save

1. Tap the name at the top and rename it to **Save to We Should Go**
2. Tap **Done**

---

## Step 5 - Test it

1. Open TikTok or Instagram and find any reel
2. Tap **Share**
3. Tap **Save to We Should Go**
4. Choose a Dreamlist when prompted
5. You should see a notification: **Saved to We Should Go**
6. Open We Should Go and check the selected Dreamlist

---

## Step 6 - Share the Shortcut with others

If you want someone else to use the same Shortcut:

1. Open the Shortcuts app
2. Long-press **Save to We Should Go**
3. Tap **Share**
4. Tap **Copy iCloud Link**
5. Send that link to them

Each person needs to use their own personal token. After installing, they should edit both Authorization headers and replace the token with theirs from Settings.

---

## Troubleshooting

**The share option doesn't appear**

Go to Settings -> Shortcuts -> turn on **Allow Sharing Shortcuts**, then try again.

**The Dreamlist picker fails**

- Check the `/api/shortcut/dreamlists` URL
- Make sure the picker request has the Authorization header
- Make sure the token starts with `Bearer `, including the space

**The reel save fails**

- Check the `/api/ingest-reel` URL
- Make sure the save request also has the Authorization header
- Make sure `dreamlist_id` is the output of the final dictionary lookup in Action 4

**The reel appears but shows "Review needed"**

This means We Should Go could not automatically identify the place. Tap the Idea to fill in the place name manually.
