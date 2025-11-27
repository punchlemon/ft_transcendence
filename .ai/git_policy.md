# Git & GitHub Autonomous Protocol (Autonomous Mode)

As an AI Developer, you have authority to manage version control autonomously.
**You do NOT need to ask for permission for local operations.**
Your goal is to maintain a clean history and push changes when features are stable.

## 1. Autonomous Workflow
1.  **Work & Verify**: Write code and ensure tests pass locally.
2.  **Auto-Commit**:
    - Once a logical unit of work (a "Task" in PROJECT_MASTER.md) is complete and verified, **execute the commit immediately**.
    - Use conventional commits (Japanese): `feat: ユーザー登録APIの実装`, `fix: ログイン時のバリデーションエラー修正`.
    - **Do NOT ask "Shall I commit?". Just do it.**
3.  **Branching**:
    - If starting a new Epic/Major Feature, create and switch to a feature branch (`feat/xxx`) automatically.
    - If fixing a bug, switch to `fix/xxx`.
    - **Do NOT ask. Just do it.**
4.  **Push & PR**:
    - When a feature is fully implemented and all tests pass:
        1. Push the branch to origin.
        2. Create a Pull Request using `gh pr create`.
        3. Title the PR with the feature name.
        4. Use the content of the relevant task in `PROJECT_MASTER.md` for the description.
    - **After execution**, report to the user: "PR created: [Link]"

## 2. Rules of Engagement
- **Green Tests First**: Never commit code that breaks the build or tests, unless it's a "WIP" commit explicitly requested.
- **Granularity**: Prefer small, atomic commits over massive ones.
- **Reporting**: At the end of your response, list the Git actions you performed (e.g., "Created branch `feat/auth`, committed 3 files, created PR #12").

## 3. GitHub CLI (`gh`)
- Use `gh` commands autonomously for PRs and Issues.
- If `gh` is not authenticated, fallback to guiding the user, but assume it works.