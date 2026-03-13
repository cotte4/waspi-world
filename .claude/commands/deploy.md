# Deploy to GitHub

Push all changes in this project (including the `waspi-world` submodule) to GitHub.

## Steps

1. **Check status** — run `git status` in the root repo AND inside `waspi-world/` to see what's changed.

2. **Submodule first** — if `waspi-world` has unstaged or uncommitted changes:
   - Stage all modified and untracked files (never stage `.env` or files with secrets)
   - Commit with a meaningful message describing *why* the changes were made
   - Push: `git push origin main` from inside `waspi-world/`

3. **Parent repo** — in the root repo:
   - Stage changes (submodule pointer update, any root-level file changes)
   - Commit with a meaningful message
   - Pull with rebase if needed: `git pull origin main --rebase`
   - Push: `git push origin main`

4. **Confirm** — show the user the final `git log --oneline -3` for both repos so they can verify what was pushed.

## Rules
- Never commit `.env` files or API keys
- Always stage specific files, never `git add -A` blindly
- If the push is rejected, pull with rebase before retrying
- Remote: `https://github.com/cotte4/waspi-world.git`
