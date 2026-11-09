# Host Nova and Nova-Wisp on Fly.io: Click-by-Click Beginner Guide

This guide explains where to go, what to create, and exactly what to type. You will host two separate services on Fly.io:

| Fly.io app | What it does | Example name |
|---|---|---|
| **Nova-Wisp** | WebSocket service for Nova's proxy browser and multiplayer features. Its code is in this repository. | `my-nova-wisp` |
| **Nova** | The website and application, whose code is in [`johnnywalker100/nova`](https://github.com/johnnywalker100/nova). | `my-nova-site` |

These are **two Fly.io apps**, not two GitHub repositories and not two accounts. You create them by running `fly launch` in each downloaded project folder. You do not need to click a “New App” button in the Fly.io website for this guide.

> **Before starting:** You need permission to access the Nova GitHub repository. Fly.io may charge for running apps and machines; check its current pricing before continuing. This setup keeps both apps running so WebSocket connections can work.

## What you need

- A GitHub account with access to [`johnnywalker100/nova`](https://github.com/johnnywalker100/nova).
- A Fly.io account: go to <https://fly.io/> and choose **Sign up** (or **Log in**).
- A computer, internet connection, and about an hour.
- Git, Fly's command-line program (`fly`), and a text editor. This guide uses Visual Studio Code (VS Code).
- Google Cloud and Supabase accounts only if you are setting up Google sign-in and Nova's database features.

If you are using Windows, the instructions below use **PowerShell**. On a Mac, use **Terminal**. Commands are the lines shown in shaded code boxes. Type or paste a command into the terminal and press **Enter**. Do not type the `$` prompt sometimes shown in other tutorials. Run one command at a time and wait for it to finish.

## First: know which window is which

- **Browser:** Used to visit GitHub, Fly.io, Google Cloud, and Supabase websites.
- **Terminal:** A window for commands such as `git clone` and `fly deploy`.
- **Project folder:** A folder on your computer containing downloaded code. The folder name tells Fly which project you are working on.
- **Fly app:** The online service you create and deploy. You will make two, one from each project folder.

The commands below are not entered into the GitHub or Fly.io website. Enter them in your computer's terminal.

## 1. Install the tools and sign in

### Install Git

1. In your browser, open <https://git-scm.com/downloads>.
2. Select your computer's operating system and download/install Git. The default installation choices are fine.
3. Open a terminal:
   - **Windows:** Open the Start menu, type **PowerShell**, and open **Windows PowerShell**.
   - **Mac:** Open **Applications → Utilities → Terminal** (or use Spotlight to search for Terminal).
4. Check Git by typing this and pressing Enter:

```sh
git --version
```

A version number means it worked.

### Install Fly's command-line tool

1. In your browser, open Fly's installation page: <https://fly.io/docs/flyctl/install/>.
2. Follow the instructions for your operating system. This installs Fly's command-line tool, called `fly` or sometimes `flyctl`.
3. Close and reopen your terminal, then check it:

```sh
fly version
```

If your computer says `fly` is not recognized but `flyctl` works, use `flyctl` instead of `fly` in every command in this guide.

### Sign in to Fly

1. In a browser, sign up or log in at <https://fly.io/>.
2. In your terminal, run:

```sh
fly auth login
```

3. A browser page will open. Follow its sign-in/authorization steps. Return to the terminal after it confirms you are signed in.

## 2. Download both projects onto your computer

You need both project folders on your computer before deploying. Do not create the Fly apps yet.

1. Make a folder somewhere easy to find, for example a folder named `nova-deploy` on your Desktop.
2. Open a terminal **in that folder**. One easy way is to open the folder in VS Code, then select **Terminal → New Terminal** from VS Code's top menu. If VS Code asks whether you trust the folder, choose the option to trust it.
3. Check that the terminal is in the `nova-deploy` folder. The terminal prompt normally shows the folder name. If it does not, stop and open the correct folder before continuing.
4. Paste this command and press Enter to download Nova-Wisp:

```sh
git clone https://github.com/coolguy1233455/nova-wisp-test.git
```

5. Paste this next command and press Enter to download Nova:

```sh
git clone https://github.com/johnnywalker100/nova.git
```

If GitHub reports that you do not have permission to access Nova, stop and ask the Nova repository owner for access. Do not continue with only one project.

When both commands finish, your `nova-deploy` folder should contain these two folders:

```text
nova-deploy/
  nova-wisp-test/
  nova/
```

## 3. Create and deploy the Nova-Wisp Fly app

### Open the Nova-Wisp folder

In VS Code, choose **File → Open Folder** and open the `nova-wisp-test` folder inside `nova-deploy`. Then choose **Terminal → New Terminal**. The terminal should now be working in `nova-wisp-test`.

If you already have a terminal open in `nova-deploy`, you can instead enter this command and press Enter:

```sh
cd nova-wisp-test
```

### Add the Dockerfile

1. In VS Code's Explorer panel on the left, click the **New File** icon (a page with a plus sign).
2. Name the file exactly `Dockerfile` — capital D, with no `.txt` at the end. Create it inside `nova-wisp-test`, at the same level as `package.json`.
3. Paste in the following contents and save the file (**Ctrl+S** on Windows/Linux, **Command+S** on Mac):

```dockerfile
FROM node:22-bookworm-slim

WORKDIR /app

COPY . .

RUN npm ci --omit=dev

ENV PORT=8080

EXPOSE 8080

CMD ["npm", "start"]
```

### Create the first Fly app

Make sure the terminal is still in the `nova-wisp-test` folder. Run:

```sh
fly launch --no-deploy
```

Fly will ask questions in the terminal. The exact wording can vary, but make these choices:

- **App name:** Enter a unique name, such as `my-nova-wisp`. If it is already taken, try another name, such as `my-nova-wisp-2026`. Use lowercase letters, numbers, and hyphens; do not use spaces. Write down the exact name.
- **Organization/account:** Choose your personal account unless you intentionally deploy under an organization.
- **Region:** Choose a nearby region. Write down the selected region.
- **Deploy now?** Choose **No**. The command already includes `--no-deploy`; if asked, do not deploy yet.
- **Other optional setup questions:** For this guide, do not add a database or set up a custom domain during launch. Keep the generated configuration and follow the steps below.

This command creates a **Fly app** and a `fly.toml` file in the current project folder. It does not create another folder or a GitHub repository.

### Check the Nova-Wisp settings and deploy

Open `fly.toml` in VS Code. Check that it has your Wisp app name, a Dockerfile build, and port `8080`. Its relevant settings should look like this (keep any other generated settings unless they conflict):

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

Replace the example app name and region with the actual values in your file. Save it. Back in the terminal, still in `nova-wisp-test`, run:

```sh
fly deploy
```

Wait for the deployment to finish successfully. To check it, run:

```sh
fly status
```

Your Wisp app's web address is `https://YOUR-WISP-APP-NAME.fly.dev`. Its WebSocket address, which Nova needs, is:

```text
wss://YOUR-WISP-APP-NAME.fly.dev/wisp/
```

Replace `YOUR-WISP-APP-NAME` with the exact Wisp app name you wrote down. Keep this address handy.

## 4. Prepare and create the Nova Fly app

### Open the Nova project folder

In VS Code, choose **File → Open Folder** and open `nova` (the sibling folder next to `nova-wisp-test`). Then choose **Terminal → New Terminal**. The terminal must be inside `nova` for the commands in this section.

If your terminal is still in `nova-wisp-test`, go up one folder and into Nova:

```sh
cd ../nova
```

### Tell Nova where Nova-Wisp is

In VS Code's Explorer, open `public`, then click `config.js`. Find the line containing `window.NOVA_WISP`. Change its URL to your Wisp address, keeping the quotes, `wss://`, and `/wisp/`:

```js
window.NOVA_WISP = "wss://YOUR-WISP-APP-NAME.fly.dev/wisp/";
```

Replace `YOUR-WISP-APP-NAME` with the Wisp app name you created in step 3. Save `config.js`.

### Create the second Fly app

Check that your terminal is in the `nova` folder, then run:

```sh
fly launch --no-deploy
```

This time create a **different Fly app** for the website. For example, enter `my-nova-site` as the app name. If it is taken, choose another unique name. Choose your account and a nearby region, write down the app name and region, and answer **No** if asked to deploy now. Do not create a database or custom domain during launch for this guide.

You now have two Fly apps:

1. The Wisp app, created while the terminal was in `nova-wisp-test`.
2. The Nova app, created while the terminal was in `nova`.

Open the `fly.toml` inside the `nova` folder. Check that its `app` is your Nova app name and its service uses internal port `8080`. Ensure the HTTP service has `auto_stop_machines = "off"` and `min_machines_running = 1`, as in the Nova-Wisp settings above. Save changes.

## 5. Set Nova's private settings (secrets)

These settings belong on the **Nova Fly app**, not the Wisp app. The commands in this section must be run with the terminal in the `nova` folder. Fly knows which app to update from the `fly.toml` in that folder.

Some Nova features require accounts or configuration outside Fly. If you only want to test the basic deployment, you may deploy first and come back to configure sign-in/database features; however, Nova may show an error or disable features until required settings are provided. Do not invent values for settings you do not understand.

### Values to prepare

- `NOVA_APP_PATH`: A private random string of at least 20 letters/numbers, without spaces or punctuation. Generate it with a password manager.
- `NOVA_SECRET`: A different private random string, at least 32 characters. Generate it with a password manager.
- `NOVA_WORD`: The entrance word and a section from Nova's essay, in the format `word@section`.
- `NOVA_RETURN_WORD`: A separate private return word.
- `NOVA_EMAILS`: Google email address(es) allowed to use the site. For multiple addresses, separate with commas and no spaces.
- `NOVA_ADMINS`: Admin email address(es), normally including your own address.
- `NOVA_APPROVE_PIN`: A private PIN for admin actions.
- `NOVA_GOOGLE_CLIENT_ID`: Google OAuth client ID, if using Google sign-in.
- `NOVA_DB_URL`, `NOVA_DB_ANON`, `NOVA_DB_KEY`: Supabase settings, if using Nova's database features.

**Keep secret values private.** Never add them to this README, source code, GitHub, screenshots, or public chats. Enter real values only into the terminal when setting Fly secrets.

### Optional: set up Google sign-in

If you want Google sign-in, open [Google Cloud Console](https://console.cloud.google.com/) in your browser and select or create a Google Cloud project. Find **Google Auth Platform** (Google may change the menu labels), configure the consent screen as prompted, then create an OAuth client with application type **Web application**. In that client's settings, add:

- **Authorized JavaScript origin:** `https://YOUR-NOVA-APP-NAME.fly.dev`
- **Authorized redirect URI:** `https://YOUR-NOVA-APP-NAME.fly.dev/api/google`

Use your real Nova app name, with no trailing slash on the origin. Copy the client ID (not the client secret) for the `NOVA_GOOGLE_CLIENT_ID` setting. If the Google page asks for information you cannot provide, consult Google's current setup guide rather than guessing.

### Optional: set up Supabase database features

1. Open [Supabase](https://supabase.com/dashboard) and sign in.
2. Create or select the Supabase project intended for Nova.
3. In the Nova project you downloaded, read the database setup instructions and inspect the SQL files in its `db/` folder. Follow those instructions in the Supabase SQL Editor; do not run SQL you have not verified is from Nova's setup.
4. In Supabase's project settings, find the project URL and the anon/public key. Use these for `NOVA_DB_URL` and `NOVA_DB_ANON`.
5. Set `NOVA_DB_KEY` to the private key/secret expected by Nova's database SQL setup. Do not guess this value. Never put a private/service key in a browser file.

### Enter the settings in the terminal

In the terminal inside `nova`, paste each command separately and press Enter. Replace the text inside quotes with your own value; do not include the angle-bracket examples. For example, replace `YOUR_RANDOM_PATH` with the random value you generated:

```sh
fly secrets set NOVA_APP_PATH="YOUR_RANDOM_PATH"
fly secrets set NOVA_SECRET="YOUR_LONG_RANDOM_SECRET"
fly secrets set NOVA_WORD="YOUR_WORD@YOUR_ESSAY_SECTION"
fly secrets set NOVA_RETURN_WORD="YOUR_DIFFERENT_RETURN_WORD"
fly secrets set NOVA_EMAILS="you@example.com"
fly secrets set NOVA_ADMINS="you@example.com"
fly secrets set NOVA_APPROVE_PIN="YOUR_PRIVATE_PIN"
```

If using Google sign-in, also run this after replacing the example:

```sh
fly secrets set NOVA_GOOGLE_CLIENT_ID="YOUR_GOOGLE_CLIENT_ID"
```

If using the database, run these after replacing the examples with the values from Supabase and Nova's database setup:

```sh
fly secrets set NOVA_DB_URL="YOUR_SUPABASE_PROJECT_URL"
fly secrets set NOVA_DB_ANON="YOUR_SUPABASE_ANON_KEY"
fly secrets set NOVA_DB_KEY="YOUR_NOVA_DATABASE_SECRET"
```

A successful command confirms that the secret was set. If you see an error, stop and read it before pasting the next command. Never share the real values in an error report or screenshot.

## 6. Deploy Nova and connect it to Nova-Wisp

### Deploy Nova

Confirm the terminal is in the `nova` folder and run:

```sh
fly deploy
```

When it finishes, open this address in your browser, substituting your Nova app name:

```text
https://YOUR-NOVA-APP-NAME.fly.dev
```

The root page may show Nova's essay or entrance page. The application is behind its access gate.

### Allow Nova to connect to Wisp

Now switch to the Nova-Wisp folder. In the terminal, run:

```sh
cd ../nova-wisp-test
```

Set the allowed website origin on the Wisp app. Use your Nova app name, include `https://`, and do not add a slash at the end:

```sh
fly secrets set ALLOWED_ORIGINS="https://YOUR-NOVA-APP-NAME.fly.dev"
```

Then deploy Wisp again so the setting takes effect:

```sh
fly deploy
```

### Set Nova's multiplayer service address

Switch back to Nova:

```sh
cd ../nova
```

Set the Wisp app's HTTPS address (not the WebSocket address, and do not include `/wisp/`):

```sh
fly secrets set NOVA_MP_URL="https://YOUR-WISP-APP-NAME.fly.dev"
```

Then deploy Nova again:

```sh
fly deploy
```

## 7. Check that the apps work

Replace the example app names with the names you chose and open these links in your browser:

- Nova health check: `https://YOUR-NOVA-APP-NAME.fly.dev/api/health` — expect JSON containing `"ok":true`.
- Wisp status check: `https://YOUR-WISP-APP-NAME.fly.dev/status` — expect JSON containing `"ok":true`.

Then open `https://YOUR-NOVA-APP-NAME.fly.dev`, complete Nova's entrance/sign-in process, and test the Browser feature. If enabled, test a multiplayer game too. A successful Wisp status page alone does not prove a WebSocket connection works.

## If something goes wrong

### “`fly` is not recognized”

The Fly command-line tool is either not installed or the terminal needs restarting. Recheck the installation instructions at <https://fly.io/docs/flyctl/install/>, close/reopen the terminal, and run `fly version`. If only `flyctl` works, use `flyctl` in place of `fly`.

### “Could not find fly.toml” or the wrong app was changed

The terminal is probably in the wrong project folder. In VS Code, use **File → Open Folder** to open the right folder, then **Terminal → New Terminal**. Run Nova commands in `nova`; run Wisp commands in `nova-wisp-test`. Each folder has its own `fly.toml` and points to a different Fly app.

### A Fly app name is already taken

Fly app names must be unique. Run `fly launch --no-deploy` again from the project folder and choose a different name. Keep the Nova and Wisp names different.

### Nova-Wisp deploys, but Nova's Browser does not connect

Check that `public/config.js` in the Nova folder has the correct `wss://YOUR-WISP-APP-NAME.fly.dev/wisp/` URL and that you deployed Nova after changing it. Check that Wisp's `ALLOWED_ORIGINS` is exactly `https://YOUR-NOVA-APP-NAME.fly.dev` (no trailing slash). Check both apps with `fly status` from their respective folders. For logs, run `fly logs` from the folder for the app you want to inspect.

### Google sign-in does not work

Check that `NOVA_GOOGLE_CLIENT_ID` was set on the Nova app, the OAuth client is a Web application, the authorized origin matches the Nova HTTPS address, and the redirect URI exactly ends in `/api/google`. After changing a Fly secret, run `fly deploy` again from `nova`.

### Nova says a setting is missing, or database features do not work

Run `fly secrets list` from the `nova` folder to see secret names (not their values). Check that you completed the matching Google/Supabase setup and set the required values on the Nova app. For app logs, run `fly logs` in the corresponding project folder. Do not paste secret values into a public help request.

## Later updates

When you change a project, open its folder in VS Code and choose **Terminal → New Terminal**, then run:

```sh
fly deploy
```

Run it in `nova` to update Nova, or in `nova-wisp-test` to update Nova-Wisp.
