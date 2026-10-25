# Magic Window

Peer into history! Hang windows on your walls and look into ancient Rome (117 CE), Constantinople (1200s) and New York (1920s).

**Live app:** https://prevattj21.github.io/magic-window/ (open in Chrome on an ARCore phone and tap View in AR). Every push to `main` redeploys it through GitHub Actions.

## Run your own copy (AR mode)

WebXR only runs on a secure (HTTPS) address, so the folder has to be hosted first. Pick one route.

**Route A: Netlify Drop (about 2 minutes, free account)**
1. Unzip `magic-window-site.zip`.
2. On your computer, open https://app.netlify.com/drop and drag the unzipped folder onto the page.
3. Netlify gives you an address like `https://something.netlify.app`. Open it in **Chrome** on your phone.
4. Tap **View in AR**, point at a wall and move slowly until the outline appears, then tap.

**Route B: GitHub Pages**
1. Create a public repository and upload the contents of the folder (keep `index.html` at the top level).
2. Go to Settings → Pages, set the source to the main branch, and save.
3. Open `https://<your-username>.github.io/<repo>/` in Chrome on your phone.

**Route C: USB cable, no hosting**
1. Serve the folder on your computer: `npx serve -l 8080` (or `python3 -m http.server 8080`) inside it.
2. Enable USB debugging on the phone, connect it, and open `chrome://inspect/#devices` in desktop Chrome.
3. Click **Port forwarding**, add `8080 → localhost:8080`, and enable it.
4. On the phone, open `http://localhost:8080` in Chrome. Chrome treats localhost as secure, so AR works.

Your phone must support Google Play Services for AR (ARCore). Check the list at https://developers.google.com/ar/devices.

## Controls

| Where | Action | Result |
| --- | --- | --- |
| AR | Choose an era, aim at a wall, tap | Opens a window there |
| AR | Aim at the floor and tap | Stands a window upright at eye level |
| Preview | Drag | Look around |
| Preview | Tap the floor, scroll, or WASD / arrow keys | Walk |
| Preview | Tap a wall | Hang a window of the selected era |
| Preview | Tap an existing window | Swap it to the selected era |
| Both | Reset | Removes every window |
| Both | HD / Lite | Full or reduced resolution |

Add `?fps=1` to the address to show a frame-rate counter for performance testing.

## Install as an app

Once hosted, Chrome on Android offers **Install app** from its menu. That gives a home-screen icon, full-screen launch and offline use. The Play Store package (milestone M5) wraps this same site as a Trusted Web Activity with Bubblewrap or PWABuilder.

## Project layout

- `index.html`: page, UI and styles
- `src/main.js`: renderer, AR session, wall hit-testing, placement, preview gallery, stencil portal rendering
- `src/frames.js`: window shapes, stencil masks, room-side frames, curtains and plaques
- `src/util.js`: low-poly geometry builder, sky, clouds, birds, smoke, walkers
- `src/eras/*.js`: one file per era scene
- `sw.js`, `manifest.webmanifest`, `icons/`: installable-app support
