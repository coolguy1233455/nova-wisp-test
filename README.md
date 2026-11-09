# Host Nova and Nova-Wisp on Fly.io (Beginner Guide)

This guide walks you through putting **Nova** and this repository, **Nova-Wisp**, online using Fly.io.

You will create **two separate Fly.io apps**:

1. **Nova** — the website and application, from [`johnnywalker100/nova`](https://github.com/johnnywalker100/nova).
2. **Nova-Wisp** — the WebSocket service used by Nova's proxy browser and multiplayer features, from this repository.

> **Important:** You need access to the Nova repository. If GitHub says you do not have permission to clone it, ask the repository owner for access.
>
> Fly.io may charge for apps and machines. Check Fly.io's current pricing before deploying. For WebSockets, keep a machine running rather than allowing the app to stop when idle.

## What you need

- A GitHub account with access to `johnnywalker100/nova`.
- A Fly.io account.
- A computer with:
  - Git installed.
  - A terminal:
    - Windows: PowerShell.
    - macOS: Terminal.
    - Linux: your usual terminal.
  - A text editor. [Visual Studio Code](https://code.visualstudio.com/) is a good choice.
- Access to Google Cloud if you want Google sign-in.
- Access to Supabase and the database setup required by Nova for member, chat, and related features.

You do **not** need to know how to program. This guide gives you the files and commands to use.

## A few words explained

- **Repository (repo):** The project files stored on GitHub.
- **Clone:** Download a repo to your computer so you can deploy it.
- **Terminal:** An app where you type commands.
- **Deploy:** Upload and start your app on Fly.io.
- **Secret:** A private setting such as a password or API key. Do not publish it in GitHub.
- **Origin:** The website address without a path. For example, if the website is `https://my-nova.fly.dev`, its origin is `https://my-nova.fly.dev`.
- **Wisp URL:** Nova connects to the Wisp app at a secure WebSocket address ending in `/wisp/`.

## Part 1: Install the tools

### 1. Install Git

Download Git from [git-scm.com/downloads](https://git-scm.com/downloads) and install it. The default installation choices are usually fine.

After installation, open your terminal and check that Git works:

```sh
git --version
```

You should see a version number. If the command is not recognized, close and reopen the terminal. If it still fails, install Git again.

### 2. Install the Fly.io command-line tool

Follow Fly.io's current installation instructions:

<https://fly.io/docs/flyctl/install/>

The command-line tool may be called `fly` or `flyctl`. This guide uses `fly`. If your installation only recognizes `flyctl`, replace `fly` with `flyctl` in the commands below.

Check that it works:

```sh
fly version
```

### 3. Create or sign in to your Fly.io account

Open <https://fly.io/> and create an account, or sign in to an existing account.

Then sign in from your terminal:

```sh
fly auth login
```

A browser window will open. Follow its instructions. Return to the terminal when it says you are signed in.

## Part 2: Download the two repositories

Choose a folder on your computer where you want to keep the projects. In your terminal, move to that folder. For example:

```sh
cd Desktop
```

If that command does not work on your computer, open the folder in your file manager, then open a terminal in that folder.

Clone the Nova-Wisp repository:

```sh
git clone https://github.com/coolguy1233455/nova-wisp-test.git
```

Clone Nova:

```sh
git clone https://github.com/johnnywalker100/nova.git
```

If you do not have access to Nova, the second command will fail. Ask the owner for access before continuing.

You should now have two project folders next to each other:

```text
nova-wisp-test/
nova/
```

## Part 3: Prepare Nova-Wisp

Nova-Wisp needs a Dockerfile so Fly.io knows how to run it.

### 1. Open the Nova-Wisp folder

In your terminal:

```sh
cd nova-wisp-test
```

Open this folder in your text editor.

### 2. Create a file named `Dockerfile`

Create a new file in the `nova-wisp-test` folder named exactly:

```text
Dockerfile
```

Make sure it is not accidentally named `Dockerfile.txt`.

Put this in the file:

```dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci --omit=dev

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
```

Save the file.

The install step also tries to download the optional WARP helper programs. If those downloads are unavailable, Nova-Wisp is designed to continue without WARP and connect directly instead.

### 3. Create the Nova-Wisp Fly.io app

From inside the `nova-wisp-test` folder, run:

```sh
fly launch --no-deploy
```

Fly.io will ask questions. Choose an app name that is available, such as:

```text
my-nova-wisp
```

Fly.io app names must be unique across Fly.io. If that name is taken, try another, such as `my-nova-wisp-2026`.

Choose a region near you or your users. Write down the app name and region.

If Fly asks whether to deploy now, choose **No**. This guide first needs you to check the configuration.

### 4. Check the Nova-Wisp Fly configuration

The `fly launch` command creates a file named `fly.toml`. Open it in your text editor.

Make sure it points to the Dockerfile and port 8080. The important settings should look like this:

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

Replace `YOUR-WISP-APP-NAME` with the app name Fly gave you. Replace `YOUR-REGION` with the region Fly selected. Keep any other settings Fly created unless they conflict with the settings above.

These settings keep a machine available for WebSocket connections. WebSockets are needed by Nova's proxy and multiplayer features.

### 5. Deploy Nova-Wisp

In your terminal, make sure you are still inside the `nova-wisp-test` folder, then run:

```sh
fly deploy
```

The first deployment may take several minutes. Wait until it reports that deployment succeeded.

Check the app's status:

```sh
fly status
```

View its logs if needed:

```sh
fly logs
```

Your Nova-Wisp address will look like:

```text
https://YOUR-WISP-APP-NAME.fly.dev
```

Its WebSocket address, which Nova will use, will look like:

```text
wss://YOUR-WISP-APP-NAME.fly.dev/wisp/
```

Replace `YOUR-WISP-APP-NAME` with the actual name of your Wisp app. Keep this address handy.

### 6. Allow your Nova website to connect to Nova-Wisp

Nova-Wisp only accepts WebSocket connections from origins you allow. After you deploy Nova in Part 4, set the allowed origin.

For now, you can deploy with the setting in the next section once you know your Nova address. Do not add a trailing slash to the origin.

For example, if Nova's address is:

```text
https://my-nova.fly.dev
```

then the allowed origin is exactly:

```text
https://my-nova.fly.dev
```

## Part 4: Prepare Nova

### 1. Open the Nova folder

In your terminal, go back to the folder containing both projects, then enter the Nova folder:

```sh
cd ../nova
```

If you opened a new terminal or are unsure where you are, use `cd` to navigate to the `nova` folder.

### 2. Point Nova at your Wisp app

Open this file in the Nova folder:

```text
public/config.js
```

Find the line that sets `window.NOVA_WISP` and change it to your Wisp WebSocket URL:

```js
window.NOVA_WISP = "wss://YOUR-WISP-APP-NAME.fly.dev/wisp/";
```

Replace `YOUR-WISP-APP-NAME` with your actual Nova-Wisp app name. Keep the `wss://` at the start and `/wisp/` at the end.

Save the file. This is what tells the Nova website to use your separately hosted Nova-Wisp service.

### 3. Create the Nova Fly.io app

From inside the `nova` folder, run:

```sh
fly launch --no-deploy
```

Choose a different app name from the one you used for Nova-Wisp. For example:

```text
my-nova-site
```

Choose a region. Write down the name and region.

If Fly asks whether to deploy immediately, choose **No**.

Nova already includes a Dockerfile. It runs the Node server on port 8080.

### 4. Check Nova's Fly configuration

Open the `fly.toml` file created in the Nova folder. Make sure the app uses port 8080 and stays running. The relevant settings should look like this:

```toml
app = "YOUR-NOVA-APP-NAME"
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

Use your actual Nova app name and region. Keep other generated settings unless they conflict with these.

## Part 5: Set up Nova's required settings

Nova needs private settings to run its sign-in and member features. Set these on the **Nova app**, not the Nova-Wisp app.

### 1. Choose your app's private values

You will need:

- `NOVA_APP_PATH`: A private path made of at least 20 letters and numbers. It must not include spaces, punctuation, or slashes. Use a password manager to generate a random value. Do not post it publicly.
- `NOVA_SECRET`: A private random secret of at least 32 characters. Use a password manager to generate one. Do not reuse your Google or Supabase password.
- `NOVA_WORD`: The secret entrance word and section used by Nova's entrance page. The expected format is `word@section`; use a section that exists in Nova's essay.
- `NOVA_RETURN_WORD`: A separate private word used to return to Nova after it is hidden.
- `NOVA_EMAILS`: The Google account email address or comma-separated email addresses allowed into your Nova site. Include your own Google account.
- `NOVA_ADMINS`: Your admin email address or addresses. Usually this is the same email address you included in `NOVA_EMAILS`.
- `NOVA_APPROVE_PIN`: A private PIN for admin actions such as approving users. Choose one and keep it private.
- `NOVA_GOOGLE_CLIENT_ID`: A Google OAuth client ID if you want Google sign-in.
- Supabase settings for Nova's database features: `NOVA_DB_URL`, `NOVA_DB_ANON`, and `NOVA_DB_KEY`.

**Never paste real secrets into this README, source code, a public issue, or a public chat.** Enter real values only into your terminal when setting Fly secrets.

### 2. Set up Google's sign-in address

If you want Google sign-in:

1. Set up a Google OAuth client using Google's current Google Auth Platform instructions.
2. Use the **Web application** client type.
3. Add your Nova site's HTTPS origin as an authorized JavaScript origin. For example:
   ```text
   https://YOUR-NOVA-APP-NAME.fly.dev
   ```
4. Add this redirect URI:
   ```text
   https://YOUR-NOVA-APP-NAME.fly.dev/api/google
   ```
5. Copy the client ID. You will set it as `NOVA_GOOGLE_CLIENT_ID` in the next section.

Replace `YOUR-NOVA-APP-NAME` with your real Nova app name. Do not add a trailing slash.

### 3. Set up the database used by Nova

Nova's member, chat, admin, and passkey features use Supabase database functions.

1. Create or open the Supabase project intended for Nova.
2. Use the database setup instructions and SQL files in the Nova repository's `db/` folder. Those files include functions used by Nova; do not skip the database setup if you want those features.
3. Find the Supabase project URL and anon/public key in the Supabase project settings.
4. Set `NOVA_DB_URL` to the project URL.
5. Set `NOVA_DB_ANON` to the anon/public key.
6. Set `NOVA_DB_KEY` to the private key/secret expected by Nova's database SQL setup.

`NOVA_DB_KEY` is a server-side secret. Do not put it in a browser file or publish it. Do not guess its value: use the value expected by the database setup you installed.

### 4. Add secrets to your Nova app

Make sure your terminal is inside the `nova` folder and logged in to Fly.io. Add each secret using the following command, replacing the example value with your own real value:

```sh
fly secrets set NOVA_APP_PATH="YOUR_RANDOM_PATH"
```

```sh
fly secrets set NOVA_SECRET="YOUR_LONG_RANDOM_SECRET"
```

```sh
fly secrets set NOVA_WORD="YOUR_WORD@YOUR_ESSAY_SECTION"
```

```sh
fly secrets set NOVA_RETURN_WORD="YOUR_DIFFERENT_RETURN_WORD"
```

```sh
fly secrets set NOVA_EMAILS="you@example.com"
```

```sh
fly secrets set NOVA_ADMINS="you@example.com"
```

```sh
fly secrets set NOVA_APPROVE_PIN="YOUR_PRIVATE_PIN"
```

If using Google sign-in, also set:

```sh
fly secrets set NOVA_GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
```

Set the database values after completing the database setup:

```sh
fly secrets set NOVA_DB_URL="YOUR_SUPABASE_PROJECT_URL"
```

```sh
fly secrets set NOVA_DB_ANON="YOUR_SUPABASE_ANON_KEY"
```

```sh
fly secrets set NOVA_DB_KEY="YOUR_NOVA_DATABASE_SECRET"
```

If you have more than one allowed or admin email, separate addresses with commas and no spaces, for example:

```sh
fly secrets set NOVA_EMAILS="first@example.com,second@example.com"
```

Fly secrets are private to the Fly app. Do not commit any real values to GitHub. Avoid sharing screenshots that show secret values.

## Part 6: Deploy Nova and connect the two apps

### 1. Deploy Nova

In the `nova` folder, run:

```sh
fly deploy
```

Wait for the deployment to finish.

Check the app:

```sh
fly status
```

Open the Nova address in a browser:

```text
https://YOUR-NOVA-APP-NAME.fly.dev
```

The root page may show Nova's essay or entrance page. Nova's application itself is served behind its access gate.

### 2. Tell Nova-Wisp which Nova origin is allowed

Go back to the Nova-Wisp folder:

```sh
cd ../nova-wisp-test
```

Set the allowed origin, with no trailing slash:

```sh
fly secrets set ALLOWED_ORIGINS="https://YOUR-NOVA-APP-NAME.fly.dev"
```

Replace `YOUR-NOVA-APP-NAME` with your actual Nova app name.

Deploy Nova-Wisp again so the setting takes effect:

```sh
fly deploy
```

If you later use a custom domain for Nova, update `ALLOWED_ORIGINS` to that exact HTTPS origin and deploy Nova-Wisp again.

### 3. Set Nova's multiplayer URL

Nova also needs to know where its multiplayer service is. In your terminal, return to the Nova folder:

```sh
cd ../nova
```

Set `NOVA_MP_URL` to your Nova-Wisp app's HTTPS address, without `/wisp/`:

```sh
fly secrets set NOVA_MP_URL="https://YOUR-WISP-APP-NAME.fly.dev"
```

Replace `YOUR-WISP-APP-NAME` with your actual Nova-Wisp app name.

Deploy Nova again to ensure its configuration is up to date:

```sh
fly deploy
```

## Part 7: Test the deployment

### 1. Check Nova's health

Open this address in your browser, replacing the app name:

```text
https://YOUR-NOVA-APP-NAME.fly.dev/api/health
```

A working Nova server should return a small JSON response containing `"ok":true`.

### 2. Check Nova-Wisp's status

Open:

```text
https://YOUR-WISP-APP-NAME.fly.dev/status
```

It should return JSON with `"ok":true`. A healthy HTTP status page does not, by itself, prove that WebSockets work, so also try Nova's Browser or multiplayer feature.

### 3. Test Nova in your browser

1. Open the Nova website.
2. Use Nova's entrance and sign-in process.
3. Test the Browser feature.
4. If multiplayer is enabled, try a multiplayer game.
5. If Google sign-in does not return to Nova, check the Google OAuth redirect URI and make sure it exactly matches:
   ```text
   https://YOUR-NOVA-APP-NAME.fly.dev/api/google
   ```

## Troubleshooting

### `fly` is not recognized

Install the Fly.io command-line tool, close and reopen your terminal, then try:

```sh
fly version
```

If your computer recognizes `flyctl` instead, use `flyctl` in place of `fly`.

### Nova-Wisp deploys but the browser proxy does not connect

Check all of these:

1. `public/config.js` in the Nova repository contains the correct Wisp URL:
   ```js
   window.NOVA_WISP = "wss://YOUR-WISP-APP-NAME.fly.dev/wisp/";
   ```
2. You deployed Nova again after changing `public/config.js`.
3. Nova-Wisp's `ALLOWED_ORIGINS` exactly matches Nova's origin, including `https://` and excluding any trailing slash.
4. Both apps are running. Check each folder with:
   ```sh
   fly status
   ```
5. Look at Nova-Wisp's logs:
   ```sh
   fly logs
   ```

### Nova says a required setting is missing

Check the secrets on the Nova app, from the `nova` folder:

```sh
fly secrets list
```

This command lists secret names, not their secret values. If a secret is missing, set it again with `fly secrets set NAME="value"` and redeploy.

### Google sign-in does not work

Check that:

- `NOVA_GOOGLE_CLIENT_ID` is set on the Nova Fly app.
- Your Google OAuth client is a Web application.
- Its authorized JavaScript origin is your Nova HTTPS origin.
- Its redirect URI ends with `/api/google`.
- The redirect URI uses your actual Nova app name and matches exactly.

After changing a Fly secret, redeploy Nova:

```sh
fly deploy
```

### Database or member features do not work

Check that:

- You completed the Nova database setup using the database SQL files and instructions in the Nova repository.
- `NOVA_DB_URL`, `NOVA_DB_ANON`, and `NOVA_DB_KEY` are set on the Nova Fly app.
- The database secret matches what you configured in the database SQL setup.
- You are looking at Nova's logs for database errors:
  ```sh
  fly logs
  ```

### See app logs

Run these commands from the correct project folder:

```sh
fly logs
```

For the app's current status:

```sh
fly status
```

For app-specific commands, run:

```sh
fly help
```

## Keeping the apps running

Both Nova and Nova-Wisp need to stay available. In each repository's `fly.toml`, keep the HTTP service configured with an internal port of `8080`. For the WebSocket service, do not configure the app to stop when idle.

## Updating the apps later

When you make changes, open the relevant project folder in your terminal and deploy it again:

```sh
fly deploy
```

Run the command inside `nova/` to deploy Nova, or inside `nova-wisp-test/` to deploy Nova-Wisp.