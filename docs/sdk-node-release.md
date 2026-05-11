# Node.js SDK — Release Process

## How publishing works

The `flowmesh-node` package is published to npmjs.com automatically by a GitHub Actions workflow.
The workflow only triggers when you push a git tag matching `sdk-node-v*` — it never runs on regular commits or merges.

You are always in control of when a version ships.

---

## Releasing a new version

### Step 1 — bump the version

Edit `packages/sdk-node/package.json` and update the `version` field:

```json
{
  "version": "0.2.0"
}
```

Follow [Semantic Versioning](https://semver.org):

| Bump | When |
|---|---|
| `PATCH` (e.g. `0.1.1`) | Bug fix — no new methods or options |
| `MINOR` (e.g. `0.2.0`) | New method, new option, backwards-compatible change |
| `MAJOR` (e.g. `1.0.0`) | Breaking change — removed method, renamed option, different return shape |

### Step 2 — commit the version bump

```bash
git add packages/sdk-node/package.json
git commit -m "chore(sdk-node): bump version to 0.2.0"
```

### Step 3 — run the release script

```bash
make sdk-node-release
```

This reads the version from `packages/sdk-node/package.json`, creates the matching git tag, and pushes it to GitHub. The publish workflow starts automatically.

You can verify the tag was created:
```bash
git tag --list "sdk-node-v*"
```

### Step 4 — confirm on npmjs.com

After the workflow completes (usually under 2 minutes), the new version appears at:
`https://www.npmjs.com/package/flowmesh-node`

---

## What the publish workflow does

Defined in `.github/workflows/publish-sdk-node.yml`:

1. Runs `pnpm --filter flowmesh-node test` — blocks publish if any test fails
2. Runs `pnpm --filter flowmesh-node build` — compiles TypeScript to `dist/`
3. Runs `pnpm --filter flowmesh-node publish` — pushes to the npm registry

If tests fail, nothing is published. The tag remains but you can fix the code, delete the tag, re-tag, and push again.

---

## npm token rotation

The `NPM_TOKEN` GitHub secret expires every 90 days. When it expires, the publish step fails with an auth error.

To rotate:
1. Go to npmjs.com → avatar → Access Tokens → Generate New Token (Granular)
2. Set Packages and scopes → Read and write → All packages → 90 days
3. Copy the token
4. Go to GitHub repo → Settings → Secrets and variables → Actions → update `NPM_TOKEN`

Set a calendar reminder 85 days after each rotation.

---

## Recovering from a failed publish

If the tag was pushed but publish failed (auth error, test failure, build error):

```bash
# Delete the remote tag
git push origin --delete sdk-node-v0.2.0

# Delete the local tag
git tag -d sdk-node-v0.2.0

# Fix the issue, then re-tag and push
make sdk-node-release
```

npm will reject publishing the same version twice — if publish partially succeeded, bump the patch version before retrying.
