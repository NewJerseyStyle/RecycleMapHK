# Mobile builds

The `Build Mobile Apps` GitHub Actions workflow wraps this PWA with Capacitor. It runs on pushes to `main`, relevant pull requests, and manual dispatches.

## Build artifacts

- Android: a directly installable debug APK and an unsigned release AAB.
- iOS: an unsigned device `.app` archive plus the generated Xcode project. Apple signing is required before installation on a physical device or submission.

Download completed builds from the workflow run's **Artifacts** section. Store publishing jobs are present as disabled drafts in `.github/workflows/build_mobile.yml`; keep them disabled until app IDs, store listings, signing credentials, and repository secrets are ready.

The native identifier is `io.github.newjerseystyle.recyclemaphk`. Confirm it before registering either store listing, because changing it later requires coordinated changes in Capacitor and both store portals.

## Local preparation

Run `npm ci` and `npm run build:web` to create the PWA bundle in `dist/`. The workflow then generates disposable native projects, permissions, icons, and splash assets before compiling each platform.
