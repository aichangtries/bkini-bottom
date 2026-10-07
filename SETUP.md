# B-kini Bottom — setup guide

B-kini Bottom keeps track of whose turn it is for Room B's chores and supplies, and pings the right person on their iPhone.

It's built from three free services, so there's no App Store, no subscription and no server to run:

| Piece | What it does | Cost |
|---|---|---|
| **GitHub Pages** | Hosts the app so every iPhone can install it to the Home Screen | Free |
| **Firebase Firestore** | Stores the house data long-term and syncs it between phones instantly | Free (Spark plan) |
| **ntfy** (iPhone app) | Delivers notifications to each roommate | Free |
| **GitHub Actions** | Runs once a day at 9:00 AM to send due, overdue and "hasn't been done for 2 weeks" reminders | Free |

**Part A** is done once, by one person, ideally on a laptop (about 20 minutes).
**Part B** is done by everyone on their own iPhone (about 5 minutes).

---

## Part A — One-time setup (one person)

### A1. Create the Firebase database

1. Go to **console.firebase.google.com** and sign in with a Google account.
2. Click **Create a project**. Name it `bkini-bottom`. You can turn Google Analytics **off** — the app doesn't use it.
3. In the left menu open **Build → Firestore Database → Create database**.
   - Location: pick **asia-southeast1 (Singapore)** (closest to the Philippines). This can't be changed later.
   - Choose **Start in production mode**.
4. When the database opens, go to the **Rules** tab. Delete everything there, paste the contents of `firestore.rules` from this folder, and click **Publish**.
5. Click the **gear icon → Project settings**. Under **Your apps**, click the **web icon `</>`**. Name it `B-kini Bottom`, leave "Firebase Hosting" unticked, and click **Register app**.
6. Firebase shows a block of code with `const firebaseConfig = { ... }`. Open `config.js` from this folder in any text editor and copy over these four values: `apiKey`, `authDomain`, `projectId`, `appId`. Save the file.

> These Firebase values aren't passwords — they're meant to be public. What keeps your house private is the **house code** the app generates in step A3.

### A2. Put the app online with GitHub Pages

1. Make a free account at **github.com** (if you're a student, the GitHub Student Pack is a nice bonus but not needed).
2. Click **+ → New repository**. Name: `bkini-bottom`. Set it to **Public** (free Pages needs this). Click **Create repository**.
3. On the new repo page click **uploading an existing file**. Drag in everything from this folder:
   `index.html`, `logic.js`, `config.js` (the one you edited), `sw.js`, `manifest.webmanifest`, `firestore.rules`, `SETUP.md`, `README.md`, and the `icons` and `scripts` folders.
   Click **Commit changes**.
4. The `.github` folder is hidden on most computers, so add it by hand: click **Add file → Create new file**, type the name exactly as
   `.github/workflows/reminders.yml`
   (typing the `/` creates the folders), paste the contents of that file from this folder, and click **Commit changes**.
5. Go to **Settings → Pages**. Under **Build and deployment**, set Source to **Deploy from a branch**, Branch to **main** and folder **/ (root)**, then **Save**.
6. After a minute or two the page shows your app's address, like
   `https://YOUR-USERNAME.github.io/bkini-bottom/`
   Send this link to the group chat.

### A3. Create the house

Do **Part B** below on your own iPhone. When you open the app the first time, tap **Create our house**, type everyone's names, pick starter tasks and tap **Create house**.

Then open the **House** tab and tap **Share** next to the house code to send it to your roommates.

### A4. Turn on the daily reminders

1. In your GitHub repo go to **Settings → Secrets and variables → Actions → New repository secret**.
   - Name: `HOUSE_CODE`
   - Secret: paste the house code from the app's House tab.
   Click **Add secret**.
2. Open the **Actions** tab. If GitHub asks, click **I understand my workflows, go ahead and enable them**.
3. Click **Daily reminders → Run workflow → Run workflow** to test it. After it finishes (green check), click into it to see which reminders it sent. From now on it runs by itself every morning at about 9:00 AM.

> GitHub pauses scheduled jobs on repos that have had no activity for 60 days, and emails you when it does. If that happens, open the **Actions** tab and re-enable "Daily reminders" — or just edit `README.md` once a month to keep the repo active.

---

## Part B — Every roommate, on their own iPhone

Needs iOS 16.4 or newer (Settings → General → About → iOS Version).

1. **Install ntfy.** In the App Store search for **ntfy** (the icon is a white bell on green/teal, by Philipp Heckel). Open it once and tap **Allow** when it asks to send notifications.
2. **Open the app link in Safari.** It must be Safari — Chrome and other browsers on iPhone can't install apps to the Home Screen.
3. **Add it to your Home Screen.** Tap the **Share** button (the square with an arrow, at the bottom of the screen), scroll down, tap **Add to Home Screen**, then **Add**. The B-kini Bottom icon appears on your Home Screen.
4. **Open it from the Home Screen icon**, not from Safari. (The installed app keeps its own storage, separate from Safari.)
5. **Join the house.** Tap **Join with a house code** and paste the code from the group chat. (The first person taps **Create our house** instead — see A3.)
6. **Pick your name** so the app knows which turns and notifications are yours.
7. **Subscribe to your notifications.** In B-kini Bottom go to **House → Notifications on this phone**.
   - Tap **Copy** next to "Just for you".
   - Switch to **ntfy**, tap **+**, paste it into **Topic**, leave the server as `ntfy.sh`, and tap **Subscribe**.
   - Do the same for **Whole-house alerts**.
8. Back in B-kini Bottom, tap **Send me a test**. A notification should arrive within a few seconds.

Optional: in iPhone **Settings → Notifications → ntfy**, turn on **Time Sensitive Notifications** so reminders get through Focus modes.

---

## How turns work

**Chores vs. things to buy.** A chore has a **Done** button. A supply has **We ran out** — anyone can tap it, and the person whose turn it is gets notified right away. When they've restocked, they tap **Bought**, and the next person is up for the next time you run out.

**Schedules.** "On a schedule" tasks repeat every N days and get reminders the day before, on the day, and every few days while overdue. "Only when needed" tasks only wake up when someone flags them.

**Two kinds of rotation.**
- *Next person after each time* — e.g. bathroom: whoever cleans it, the next person is up.
- *Same person for a stretch* — e.g. sweeping: one person is on duty for a whole week, then it moves on automatically.

**Covering and skipping, kept fair.**
- If someone else does your task, tap **Someone else did it…** and choose who. You now owe them a turn, and the app automatically gives you *their* next turn of that task. Tick **No payback needed** if it was just a favor.
- If you can't do your turn, tap **Pass my turn**. It goes to the next person, and you'll take their next turn.
- The History tab shows who owes whom, a full log with dates of who did what, and a 30-day count per person.

**Away for a while?** House → Edit a roommate → **Away for now**. They're skipped in every rotation until you untick it. Pause individual tasks (e.g. during semester break) from the task's Edit screen.

**House-wide alarms.** Each task has "Warn everyone after (days)". If the bathroom hasn't been cleaned in 14 days, or trash bags have been out for 3 days, everyone gets an alert like "Clean the bathroom hasn't been done for 2 weeks", repeated weekly until it's done.

---

## Good to know

- **Your data** lives only in your own Firebase project. House → **Export a backup** saves a copy; **Delete house and all data** removes it for everyone, permanently.
- **The house code is the key.** Anyone who has it can see and change your house, and the notification topics include it. Keep it in your group chat, not on social media.
- **Changing the app later.** Edit files on GitHub (pencil icon) and commit. Phones pick up the new version the next time the app is opened (sometimes it takes closing and reopening twice).
- **Different reminder time.** Edit the `cron` line in `.github/workflows/reminders.yml`. It's in UTC: `0 1 * * *` is 9:00 AM in the Philippines, `0 12 * * *` would be 8:00 PM.
- **Trying it without setup.** If `config.js` is still empty, the app offers a demo that runs on one phone only (no syncing, no notifications).

## Troubleshooting

| Problem | Fix |
|---|---|
| "Sharing between phones isn't set up yet" | `config.js` on GitHub still has empty values. Re-check step A1.6 and that you uploaded the edited file. |
| "Couldn't create the house: Missing or insufficient permissions" | The Firestore rules weren't published. Redo step A1.4. |
| No notifications | In ntfy, check the topic is spelled exactly as in the app (use Copy). Check iPhone Settings → Notifications → ntfy is allowed. Use **Send me a test**. |
| Daily reminders job fails | Open the failed run in the Actions tab. "HOUSE_CODE is not set" means step A4.1 is missing. |
| App shows an old version | Close it from the app switcher and open it again. |
| Joined on Safari but the Home Screen app asks again | Expected — the Home Screen app has its own storage. Join once more from the Home Screen app. |
