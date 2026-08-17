# Mac DMG releases

Creating a GitHub Release is what builds the DMG. You do not build or upload the installer yourself. The [Mac DMG](./.github/workflows/mac-dmg.yml) workflow runs on `macos-latest`, compiles the Swift helper, packages a **universal** (Apple Silicon + Intel) Electron app, and attaches:

`Nudgeboard-<version>-mac-universal.dmg`

to that release.

Follow the numbered steps from top to bottom. Creating the GitHub Release is what starts the DMG build.

---

## 1. One-time setup (do this before the first DMG release)

Nothing extra is required for an unsigned DMG:

- The workflow file is `.github/workflows/mac-dmg.yml`.
- GitHub Actions must be enabled on the repo (default for public repos).
- No Apple certificates or GitHub secrets are needed for the current unsigned build.
- Builds run on GitHub’s macOS runners. A local Mac is optional.

First-time checklist:

- [ ] `.github/workflows/mac-dmg.yml` is on the default branch (or on the branch you tag).
- [ ] `desktop-app/package.json` has a real version you intend to ship (not a leftover `1.0.0` if that was never released).
- [ ] You can create GitHub Releases on this repo.

Optional local smoke-test on a Mac, before you trust CI:

```bash
cd desktop-app
npm ci
npm run make:dmg
```

The DMG lands under `desktop-app/out/make/`. CI still produces the copy that goes on the GitHub Release.

---

## 2. Bump the desktop app version

The version baked into the app and the DMG filename comes from `desktop-app/package.json`, not from the GitHub tag text alone.

```bash
cd desktop-app
npm version 1.1.0 --no-git-tag-version
```

`--no-git-tag-version` only updates `package.json` and `package-lock.json`. You will create the git tag in the GitHub Release UI (step 4), not here.

Replace `1.1.0` with the version you are shipping. Follow semver (`major.minor.patch`).

---

## 3. Commit the version bump

From the repo root, on the branch you will tag:

```bash
git add desktop-app/package.json desktop-app/package-lock.json
git commit -m "Release 1.1.0"
```

The GitHub Release tag must point at **this** commit (or a later commit that still has this version). If you tag an older commit, the Action builds the old version and then fails the version check.

This commit must also include `.github/workflows/mac-dmg.yml` the first time you ship this flow.

---

## 4. Create the GitHub Release (this triggers the DMG)

The workflow listens for `release: created`. Drafts count. Publishing later does not rebuild.

1. Push the version commit if you have not already:
   ```bash
   git push origin HEAD
   ```
2. GitHub → **Releases** → **Draft a new release**.
3. **Choose a tag** → type `v1.1.0` (same number as `package.json`, with a `v` prefix) → **Create new tag** on the branch that contains the version commit.
4. Set the release title to the same version (`1.1.0` or `v1.1.0`).
5. Paste notes (what changed, Gatekeeper right-click Open if you want).
6. Click **Publish release** (or **Save draft** if you want to inspect the DMG before making it public).

Do not attach a DMG in this form. The Action uploads it.

Use a tag of the form `v<package.json version>`. Examples:

| `desktop-app/package.json` | GitHub tag |
| :--- | :--- |
| `1.0.0` | `v1.0.0` |
| `1.1.0` | `v1.1.0` |

The workflow fails if those two numbers disagree, so the binary version and the download name stay in sync.

---

## 5. Confirm the DMG on the release

After you create the release:

1. Open the repo **Actions** tab and wait for **Mac DMG** to finish on the tag you just published.
2. Refresh the GitHub Release page. The asset `Nudgeboard-<version>-mac-universal.dmg` should be listed.
3. Download it, open the DMG, drag **Nudgeboard** into **Applications**, and launch it.
4. Pair a phone on the same Wi-Fi and press one tile to confirm the Mac helper still works.

If the job failed because the tag did not match `desktop-app/package.json`, delete that GitHub Release (and the tag if you created a bad one), then start again from step 2.

macOS Gatekeeper will warn that the app is unsigned. That is expected until Apple code signing is added. First launch: right-click the app → **Open** → **Open**.

---

## What the Action does

On `release: created`:

1. Checks out the tagged commit.
2. Installs Node 22 and `desktop-app` dependencies (`npm ci`).
3. Asserts `package.json` version equals the tag without the `v`.
4. Runs `npm run make:dmg` (universal darwin, DMG maker only). Electron Forge’s `generateAssets` hook compiles `native/mac/nudgeboard-mac.swift` into a universal helper before packaging.
5. Renames the artifact to `Nudgeboard-<version>-mac-universal.dmg`.
6. Uploads it onto the same GitHub Release (`gh release upload --clobber`).

Typical runtime is 10–20 minutes.

---

## Troubleshooting

| Symptom | What to do |
| :--- | :--- |
| Workflow never starts | The file must exist on the tagged commit. Confirm the tag points at a commit that includes `.github/workflows/mac-dmg.yml`. |
| Version mismatch error | Tag `vX.Y.Z` must match `desktop-app/package.json`. Bump, commit, retag. |
| No DMG on the release | Open the failed **Mac DMG** job logs. Re-run the job after a runner flake; `--clobber` replaces a partial upload. |
| App is “damaged” or blocked | Unsigned build. On current macOS: System Settings → Privacy & Security → Open Anyway, or remove quarantine: `xattr -cr /Applications/Nudgeboard.app`. |
| App quits immediately (Code Signature Invalid) | Fuse flips invalidated Electron’s signature and ad-hoc re-sign failed. Re-sign this copy: `codesign --sign - --force --deep --timestamp=none /Applications/Nudgeboard.app`. Then rebuild the DMG so CI signs it. |
| Intel Mac cannot open it | You tagged a commit from before this workflow, or the make step was not `--arch=universal`. Rebuild from current `make:dmg`. |

Code signing and notarization are not part of this pipeline. Add Apple Developer ID signing later if you want Gatekeeper to stay silent.
