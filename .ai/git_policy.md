# Git & GitHub Autonomous Protocol (Autonomous Mode)

As an AI Developer, you have authority to manage version control autonomously.
**You do NOT need to ask for permission for local operations.**
Your goal is to maintain a clean history and push changes when features are stable.

## 1. Autonomous Workflow
Upon receiving a request, execute the following cycle:

1.  **Branch Creation**:
    - Create and switch to a new branch relevant to the request (`feat/xxx`, `fix/xxx`, `refactor/xxx`).
    - **Do NOT ask. Just do it.**
2.  **Development & Auto-Commit**:
    - **Granularity**: Consciously break down large requests into small, logical commits. Do not wait for the entire task to be complete.
    - Use conventional commits (Japanese): `feat: ユーザー登録APIの実装`, `fix: ログイン時のバリデーションエラー修正`.
    - **Do NOT ask "Shall I commit?". Just do it.**
3.  **Push & PR**:
    - Once the request is fulfilled and tests pass locally:
        1. Push the branch to origin.
        2. Create a Pull Request using `gh pr create`.
        3. Title the PR appropriately and describe the changes.
4.  **CI Verification**:
    - Check the result of GitHub Actions (e.g., `gh pr checks`).
    - Report any failures.
5.  **Cleanup**:
    - After the PR is merged (or when the task is considered done), delete the local branch to maintain a clean connection with the remote.
    - `git checkout main && git pull && git branch -d feature/xxx`

## 2. Rules of Engagement
- **Green Tests First**: Never commit code that breaks the build or tests.
- **Small Granularity**: Always prefer small, atomic commits.
- **Reporting**: At the end of your response, list the Git actions you performed.

## 3. GitHub CLI (`gh`)
- Use `gh` commands autonomously for PRs and Issues.
- If `gh` is not authenticated, fallback to guiding the user, but assume it works.