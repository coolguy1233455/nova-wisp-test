# Host Nova and Nova-Wisp on Fly.io from an iPad (Browser-Only Guide)

This version is for someone using an **iPad, a web browser, and no locally installed apps**. It uses GitHub Codespaces as a computer in the cloud. You open it in your browser; the terminal and project files run there, not on your iPad. You do not need to install Git, VS Code, or Fly's command-line tool on the iPad.

You will create **two separate Fly.io apps**:

| Fly.io app | What it does | Example name |
|---|---|---|
| **Nova-Wisp** | WebSocket service for Nova's proxy browser and multiplayer features. Its code is in this repository. | `my-nova-wisp` |
| **Nova** | The website and application, from [`johnnywalker100/nova`](https://github.com/johnnywalker100/nova). | `my-nova-site` |

These are two online apps, not iPad apps. You create them by running `flyctl launch` from the matching project folder in the Codespaces terminal. You do **not** click “New App” on Fly.io for this guide.

> **Before starting:** You need access to the Nova repository and a GitHub account that can use Codespaces. Codespaces and Fly.io have usage limits and may require billing setup. Check their current pricing before continuing. Fly.io may charge to keep the apps running.

## What you need on your iPad

- Safari or another web browser.
- A GitHub account with access to [`johnnywalker100/nova`](https://github.com/johnnywalker100/nova).
- A Fly.io account at <https://fly.io/>.
- A GitHub Codespaces allowance or billing setup. If GitHub says you cannot create a codespace, check the account's Codespaces quota/billing settings.
- Google Cloud and Supabase accounts only if you want Google sign-in and Nova's database features.

**Important:** Use GitHub **Codespaces**, not the `github.dev` editor. The `github.dev` editor can edit files but does not provide the terminal needed to deploy. Codespaces provides both the editor and terminal in your browser.

## The two browser pages you will use

1. **GitHub Codespaces:** Open the repository in a browser-based editor. In that editor, use **Terminal → New Terminal** to type commands. Commands in shaded boxes go into that terminal, one at a time, followed by Enter. Do not type the backticks around them.
2. **Fly.io dashboard:** Sign in at <https://fly.io/>. The command-line tool you run in Codespaces will create the Fly apps and deploy them.

Keep the Codespaces browser tab open while working. If you close it, reopen your codespace from the repository's **Code → Codespaces** menu.

## 1. Open a Codespace in your browser

1. In Safari, open this repository: <https://github.com/coolguy1233455/nova-wisp-test>.
2. Sign in to GitHub if asked.
3. On the repository page, tap the green **Code** button.
4. Tap the **Codespaces** tab in the menu.
5. Tap **Create codespace on main**. If the branch name shown is different, choose the repository's default branch.
6. Wait for the browser editor to load. This may take a few minutes. You should see files on the left and menus across the top.
7. In the top menu, tap **Terminal → New Terminal**. A terminal panel should appear at the bottom. This is where you enter the commands in this guide.

If you do not see a Codespaces tab or GitHub will not create one, Codespaces may not be enabled or available on your account. You cannot deploy using only GitHub's file editor; you need a browser-based terminal such as Codespaces or access to a computer with a terminal.

The codespace starts with this repository checked out in a folder named `nova-wisp-test`. Later, we will download Nova next to it.

## 2. Sign in to Fly and download Nova

First create/sign in to your Fly.io account in another browser tab at <https://fly.io/>. Then return to the Codespaces terminal.

### Install Fly's command-line tool inside Codespaces

This installs the tool in the remote Codespaces environment, **not on your iPad**. In the Codespaces terminal, run:

```sh
curl -L https://fly.io/install.sh | sh
```

Then make the command available in this terminal and check it:

```sh
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
flyctl version
```

If you open a new terminal later and it says `flyctl` is not found, run the two `export` lines again.

Sign in:

```sh
flyctl auth login
```

If Codespaces cannot automatically open the sign-in page, look in the terminal for a Fly.io login link. Copy that link, open it in a new Safari tab, and complete sign-in. Return to the Codespaces tab afterward. If no link appears or sign-in fails, follow Fly's current CLI sign-in help at <https://fly.io/docs/flyctl/>.

Now download Nova into the parent workspace so it sits beside Nova-Wisp. Run these commands separately:

```sh
cd /workspaces
git clone https://github.com/johnnywalker100/nova.git
```

If GitHub says you do not have permission to access Nova, stop and ask the repository owner for access. The folders should now be:

```text
/workspaces/
  nova-wisp-test/  (the repository opened in Codespaces)
  nova/            (the Nova repository you just cloned)
```

## 3. Prepare and create the Nova-Wisp Fly app

### Create the Dockerfile in the browser editor

1. In the files panel on the left, open the `nova-wisp-test` folder if it is not already open.
2. In the Explorer panel, tap the **New File** icon (a page with a plus sign).
3. Name the file exactly `Dockerfile` (capital D, no `.txt`) and create it in the top level of `nova-wisp-test`, beside `package.json`.
4. Paste this into the file and save it. On an iPad keyboard, use the editor's **File → Save** menu if the usual keyboard shortcut is unavailable.

```dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci --omit=dev

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
```

The install step also tries to download optional WARP helper programs. If those downloads are unavailable, Nova-Wisp is designed to continue without WARP and connect directly instead.

### Create the Nova-Wisp app

In the terminal, enter the Wisp folder and start Fly's setup:

```sh
cd /workspaces/nova-wisp-test
flyctl launch --no-deploy
```

Fly will ask questions in the terminal. The wording can vary. Choose:

- **App name:** A unique name, such as `my-nova-wisp`. If it is taken, try `my-nova-wisp-2026`. Use lowercase letters/numbers/hyphens, no spaces. Write down the exact name.
- **Organization/account:** Your personal account unless you intentionally use an organization.
- **Region:** A nearby region. Write it down.
- **Deploy now?:** Choose **No** if asked. We will check the settings first.
- **Database or custom domain:** Do not add these for this guide.

This creates a Fly app and a `fly.toml` file in the Nova-Wisp folder. It does not create an iPad app.

### Check the settings and deploy Nova-Wisp

In the Explorer, open `nova-wisp-test/fly.toml`. Check that it uses your app name and has settings like these. Replace the example app name and region with the values Fly selected; keep other generated settings unless they conflict.

```toml
app = "YOUR-WISP-APP-NAME"
primary_region = "YOUR-REGION"

[build]
  dockerfile = "Dockerfile"

[env]
  PORT = "8080"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "off"
  auto_start_machines = true
  min_machines_running = 1
```

Save the file. In the terminal, run:

```sh
flyctl deploy
```

Wait for success, then check the app:

```sh
flyctl status
```

Write down your Wisp address. If your app name is `my-nova-wisp`, the addresses are:

```text
Website/status address: https://my-nova-wisp.fly.dev
Nova WebSocket address: wss://my-nova-wisp.fly.dev/wisp/
```

Use your actual app name, not the example. Keep the WebSocket address handy.

## 4. Prepare and create the Nova Fly app

### Edit Nova's Wisp address

In the Explorer, open `nova/public/config.js`. Find the line containing `window.NOVA_WISP` and set it to your real Wisp WebSocket address. Keep the quotation marks, `wss://`, and `/wisp/`:

```js
window.NOVA_WISP = "wss://YOUR-WISP-APP-NAME.fly.dev/wisp/";
```

Save the file.

### Create the Nova app

In the terminal, run:

```sh
cd /workspaces/nova
flyctl launch --no-deploy
```

This is the **second, separate Fly app**. Choose a different unique app name, such as `my-nova-site`, and write it down. Choose your account and a nearby region. Choose **No** if asked to deploy now; do not add a database or custom domain during launch.

Open `nova/fly.toml` in the Explorer. Check that the app name is your Nova name and the HTTP service uses port `8080`. It should stay running: check `auto_stop_machines = "off"` and `min_machines_running = 1`. Save any changes.

At this point the two app names are:

- **Nova-Wisp:** `YOUR-WISP-APP-NAME`
- **Nova:** `YOUR-NOVA-APP-NAME`

Keep track of which is which. Commands run in `nova-wisp-test` affect Wisp; commands run in `nova` affect Nova.

## 5. Set Nova's private settings

Run these settings on the **Nova app**, not Wisp. The terminal must be inside `/workspaces/nova`; the `fly.toml` there tells Fly which app to update.

Some values require setting up Google Cloud or Supabase first. Do not guess missing values. If you are only testing, you can deploy first and return to optional integrations later, but sign-in/database features may not work until configured.

Prepare these values:

- `NOVA_APP_PATH`: Private random string of at least 20 letters/numbers, no spaces or punctuation.
- `NOVA_SECRET`: Different private random string of at least 32 characters.
- `NOVA_WORD`: Entrance word and a section from Nova's essay, format `word@section`.
- `NOVA_RETURN_WORD`: A separate private return word.
- `NOVA_EMAILS`: Google email address(es) allowed to use the site. Separate multiple emails with commas and no spaces.
- `NOVA_ADMINS`: Admin email address(es), usually including your own.
- `NOVA_APPROVE_PIN`: Private PIN for admin actions.
- `NOVA_GOOGLE_CLIENT_ID`: Google OAuth client ID if you use Google sign-in.
- `NOVA_DB_URL`, `NOVA_DB_ANON`, `NOVA_DB_KEY`: Supabase settings if you use database features.

**Keep secret values private.** Do not put them in this README, source code, GitHub, screenshots, or public chats. Enter real values only into the Codespaces terminal when setting Fly secrets.

### Optional: Google sign-in

In Safari, open [Google Cloud Console](https://console.cloud.google.com/) and select/create a project. Find **Google Auth Platform** (menu wording may vary), configure the consent screen as prompted, and create an OAuth client of type **Web application**. Add:

- Authorized JavaScript origin: `https://YOUR-NOVA-APP-NAME.fly.dev`
- Authorized redirect URI: `https://YOUR-NOVA-APP-NAME.fly.dev/api/google`

Replace the example with your Nova app name. Do not add a trailing slash to the origin. Copy the client ID (not a client secret); you will set it as `NOVA_GOOGLE_CLIENT_ID` below. If Google's screens differ, follow Google's current instructions rather than guessing.

### Optional: Supabase database

1. Open [Supabase](https://supabase.com/dashboard) in Safari and create/select a project for Nova.
2. In the Nova folder in Codespaces, read its database setup instructions and inspect the SQL files in `nova/db/`.
3. Follow Nova's instructions to install the SQL using Supabase's SQL Editor. Do not run SQL unless it is from Nova's setup and you understand it is intended for this database.
4. In Supabase project settings, find the project URL and anon/public key for `NOVA_DB_URL` and `NOVA_DB_ANON`.
5. Set `NOVA_DB_KEY` to the private key/secret required by Nova's SQL setup. Do not guess. Never place a private/service key in a browser file.

### Enter the Nova secrets

Return to the Codespaces terminal and make sure it is in the Nova folder:

```sh
cd /workspaces/nova
```

Paste and run each command separately, replacing the example text with your own value:

```sh
flyctl secrets set NOVA_APP_PATH="YOUR_RANDOM_PATH"
flyctl secrets set NOVA_SECRET="YOUR_LONG_RANDOM_SECRET"
flyctl secrets set NOVA_WORD="YOUR_WORD@YOUR_ESSAY_SECTION"
flyctl secrets set NOVA_RETURN_WORD="YOUR_DIFFERENT_RETURN_WORD"
flyctl secrets set NOVA_EMAILS="you@example.com"
flyctl secrets set NOVA_ADMINS="you@example.com"
flyctl secrets set NOVA_APPROVE_PIN="YOUR_PRIVATE_PIN"
```

If using Google sign-in, also run:

```sh
flyctl secrets set NOVA_GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
```

If using the database, run these with your actual Supabase/Nova values:

```sh
flyctl secrets set NOVA_DB_URL="YOUR_SUPABASE_PROJECT_URL"
flyctl secrets set NOVA_DB_ANON="YOUR_SUPABASE_ANON_KEY"
flyctl secrets set NOVA_DB_KEY="YOUR_NOVA_DATABASE_SECRET"
```

A successful command confirms the secret was set. If one fails, stop and read the message before continuing. Do not share real values in screenshots or help requests.

## 6. Deploy Nova and connect the apps

### Deploy Nova

Confirm the terminal is in `/workspaces/nova`, then run:

```sh
flyctl deploy
```

After it succeeds, open `https://YOUR-NOVA-APP-NAME.fly.dev` in Safari, replacing the example name with your actual Nova app name. The root page may show Nova's essay or entrance page; the application is behind its access gate.

### Allow Nova to connect to Wisp

In the terminal, switch to the Wisp folder:

```sh
cd /workspaces/nova-wisp-test
```

Set the allowed website origin. Use the Nova app name, include `https://`, and do not put a slash at the end:

```sh
flyctl secrets set ALLOWED_ORIGINS="https://YOUR-NOVA-APP-NAME.fly.dev"
```

Then deploy Wisp again:

```sh
flyctl deploy
```

### Set Nova's multiplayer URL

Switch back to Nova and set the Wisp app's HTTPS address (not the WebSocket address; do not include `/wisp/`):

```sh
cd /workspaces/nova
flyctl secrets set NOVA_MP_URL="https://YOUR-WISP-APP-NAME.fly.dev"
flyctl deploy
```

## 7. Test the deployment

Open these in Safari, replacing the example names with your actual app names:

- Nova health: `https://YOUR-NOVA-APP-NAME.fly.dev/api/health` — expect JSON containing `"ok":true`.
- Wisp status: `https://YOUR-WISP-APP-NAME.fly.dev/status` — expect JSON containing `"ok":true`.

Then open the Nova website, complete its entrance/sign-in process, and test the Browser feature. If enabled, test a multiplayer game. A healthy Wisp status page alone does not prove WebSockets work.

## Troubleshooting

### I cannot find the terminal

In the Codespaces editor's top menu, choose **Terminal → New Terminal**. Make sure the browser tab is the Codespaces editor, not the ordinary GitHub file page or `github.dev`.

### Codespaces says I cannot create a codespace

Check your GitHub Codespaces quota, billing settings, and repository access. Codespaces use GitHub's cloud resources and may not be free for every account. If it is not available, you will need another browser-based computer/terminal or a regular computer; editing files on GitHub alone is not enough to deploy these services.

### `flyctl` is not found

In the Codespaces terminal, run:

```sh
export FLYCTL_INSTALL="$HOME/.fly"
export PATH="$FLYCTL_INSTALL/bin:$PATH"
flyctl version
```

If the tool is not installed in the current codespace, repeat the installation command in Part 2.

### “Could not find fly.toml” or the wrong app was changed

The terminal is in the wrong project folder. Before Nova commands run `cd /workspaces/nova`; before Wisp commands run `cd /workspaces/nova-wisp-test`. Each folder has its own `fly.toml` and Fly app.

### A Fly app name is already taken

Choose another unique name. The Nova and Wisp app names must be different.

### Nova's Browser does not connect to Wisp

Check that `nova/public/config.js` has the correct `wss://YOUR-WISP-APP-NAME.fly.dev/wisp/` address, and that Nova was deployed after the change. Check Wisp's `ALLOWED_ORIGINS` exactly matches Nova's HTTPS origin with no trailing slash. Check `flyctl status` and `flyctl logs` from the matching project folder.

### Google sign-in or database features do not work

Check that the related secrets were set on the Nova app (from `/workspaces/nova`), and that Google/Supabase setup was completed. `flyctl secrets list` shows secret names, not values. After changing a secret or Nova configuration, deploy Nova again.

## Later updates

Keep using the Codespace in your browser. Open a terminal in the matching folder and run:

```sh
cd /workspaces/nova
flyctl deploy
```

That updates Nova. To update Nova-Wisp instead, run:

```sh
cd /workspaces/nova-wisp-test
flyctl deploy
```

Codespaces can stop after being idle. Reopen the codespace from the repository's **Code → Codespaces** menu when you want to continue. If you create a new codespace, you may need to reinstall `flyctl` and clone Nova again.
