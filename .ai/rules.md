# 1. Core Philosophy (基本哲学)

* **Robustness (堅牢性)**: Code must be resilient to changes. Use dependency injection and strict typing.
* **Readability (可読性)**: Code is read more often than written. Clarity > Cleverness.
* **Test-Driven (テスト駆動)**: No code exists without a reason (test).
* **Self-Documenting Structure (自己文書化)**: The directory structure must reflect the architecture clearly.

# 2. Architecture & Tech Stack (Dynamic)

* **Single Source of Truth**: You MUST strictly adhere to the technology stack defined in **`.ai/tech_stack.md`**.
* **Consistency**: Do not introduce libraries or frameworks that contradict the defined stack unless explicit approval is granted.

# 3. Coding Standards & The "Explanation Block"

Every source file MUST end with a detailed explanation block in Japanese.

**Format Requirement:**

\`\`\`typescript
// (Code content...)

/*
解説:

1) import ...
  - (なぜこのインポートが必要か)

2) function definition ...
  - (ロジックの説明)
  - (なぜこのアプローチを選んだか)

3) export ...
  - (このモジュールの使い方)
*/
\`\`\`

* **Comments**: **ALL comments in the code (including TSDoc) must be in Japanese.**
* **Explanation Block**: Must be in Japanese as shown above.
* **Variable Names**: Descriptive and explicit in English (e.g., `isUserLoggedIn` instead of `flag`).

# 4. Testing Rules

* **Why-Test**: Every test file must start with a comment explaining *why* these tests are necessary and what scenarios they cover (in Japanese).

* **Scope**:
    * Unit Tests: For all business logic.
    * Integration Tests: For all API endpoints.

# 5. Documentation Maintenance

* **README_ARCHITECTURE.md**: You MUST update this file whenever you create a new directory or add a significant file. It must explain "Why this directory exists" and "What belongs here" (in Japanese).

* **PROJECT_MASTER.md**: Always update the progress before ending a session.

# 6. Communication Language (Strict)

* **Chat & Reports**: All communication with the user, including progress reports, Git commit messages proposals, and reasoning, **MUST be in Japanese**.
* **Documentation**: All documentation (PROJECT_MASTER.md, READMEs, etc.) **MUST be in Japanese**.