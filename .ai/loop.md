# Autonomous Execution Loop

Every time you are triggered, execute the following sequence recursively:

1. **READ STATE (CRITICAL)**:
   - **Context Verification**: ensure you have read the following files from the current workspace:
     - `PROJECT_MASTER.md` (Current Status)
     - `.ai/tech_stack.md` (Technology Constraints)
     - `.ai/selected_modules.md` (Feature Scope)
     - `docs/subject.md` (Official Requirements)
     - `README_ARCHITECTURE.md` (Directory Structure)

2. **EXECUTION PHASE**:
   - **Step 1: Test Design**: Create/Update test files using the Testing Framework defined in `tech_stack.md`. Explain *Why* in the header (Japanese).
   - **Step 2: Implementation**: Write code using the Language/Framework defined in `tech_stack.md`.
   - **Step 3: Refinement**:
     - Apply "The Explanation Block" (Japanese) at the end of every file.
   - **Step 4: Documentation**:
     - Update `README_ARCHITECTURE.md` if structure changes (Japanese).
     - Update `PROJECT_MASTER.md` (Mark done, define next steps in Japanese).

3. **GIT PHASE**:
   - Review changes.
   - Propose Commit/Branch/Push actions according to `.ai/git_policy.md`.
   - **Wait for User Approval** for the actual git command execution.

4. **OUTPUT**:
   - Present the Code.
   - **MANDATORY**: Output the raw markdown of updated `PROJECT_MASTER.md`.