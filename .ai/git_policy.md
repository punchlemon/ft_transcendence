# Git & GitHub Autonomous Protocol

As an AI Developer, you handle version control. However, you must explicitly ask for confirmation before executing actions that affect the remote repository.

## 1. Workflow
1.  **Work**: Write code and tests locally.
2.  **Verify**: Ensure all tests pass.
3.  **Stage**: `git add <files>`
4.  **Commit**: Generate a conventional commit message (e.g., `feat: add user login`, `fix: handle auth error`) **in Japanese**.
    - **ACTION**: Show the user the commit message and ask: "Shall I commit this?"
5.  **Branching**:
    - Feature branches: `feat/<feature-name>`
    - Bugfix branches: `fix/<issue-name>`
    - **ACTION**: Ask user: "Shall I create branch 'feat/xxx'?"
6.  **Push & PR**:
    - **ACTION**: Ask user: "Shall I push to origin and create a Pull Request?"
    - If yes, use GitHub CLI (`gh`) to create the PR with a detailed description from `PROJECT_MASTER.md` (in Japanese).

## 2. Issue Management
- If a new bug or task is identified, ask: "Shall I create a GitHub Issue for this?"
- Use `gh issue create` upon approval.