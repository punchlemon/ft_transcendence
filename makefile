# OS Check
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	CLIP = pbcopy
else
	CLIP = xclip -selection clipboard
endif

# Paths (Relative to root)
RULES = .ai/rules.md
STACK = .ai/tech_stack.md
MODULES = .ai/selected_modules.md
POLICY = .ai/git_policy.md
LOOP = .ai/loop.md
SUBJECT = docs/subject.md
MASTER = PROJECT_MASTER.md
ARCH = README_ARCHITECTURE.md

# ==============================================================================
# 1. Daily Development Loop
#    Generates a prompt that references files instead of dumping content.
# ==============================================================================
ai:
	@echo "Generating reference prompt..."
	
	@# Create a prompt that tells Copilot to look at specific files
	@echo "Please execute the next step of the autonomous loop based on the context of these files:" > .ai_prompt_temp
	@echo "" >> .ai_prompt_temp
	@echo "Context Files:" >> .ai_prompt_temp
	@echo "- Rules: #$(RULES)" >> .ai_prompt_temp
	@echo "- Tech Stack: #$(STACK)" >> .ai_prompt_temp
	@echo "- Selected Modules: #$(MODULES)" >> .ai_prompt_temp
	@echo "- Git Policy: #$(POLICY)" >> .ai_prompt_temp
	@echo "- Execution Loop: #$(LOOP)" >> .ai_prompt_temp
	@echo "- Subject: #$(SUBJECT)" >> .ai_prompt_temp
	@echo "- Architecture: #$(ARCH)" >> .ai_prompt_temp
	@echo "- Project Master: #$(MASTER)" >> .ai_prompt_temp
	@echo "" >> .ai_prompt_temp
	@echo "YOUR CORE MISSION:" >> .ai_prompt_temp
	@echo "1. ANALYZE the current state in #$(MASTER)." >> .ai_prompt_temp
	@echo "2. IF the 'Next Actions' are done, YOU MUST UPDATE #$(MASTER) immediately." >> .ai_prompt_temp
	@echo "   - Mark tasks as [x]." >> .ai_prompt_temp
	@echo "   - Create NEW 'Next Actions' based on the roadmap." >> .ai_prompt_temp
	@echo "   - Change the 'Current Focus' phase if necessary." >> .ai_prompt_temp
	@echo "3. EXECUTE the new action." >> .ai_prompt_temp
	@echo "" >> .ai_prompt_temp
	@echo "INSTRUCTION: Read the files, UPDATE the plan if needed, and WRITE CODE. Do not wait for permission to update the plan." >> .ai_prompt_temp
	@echo "ALL OUTPUT MUST BE IN JAPANESE." >> .ai_prompt_temp

	@cat .ai_prompt_temp | $(CLIP)
	@rm .ai_prompt_temp
	@echo "✅ Reference prompt copied!"
	@echo "👉 Paste into Copilot Chat. If files aren't automatically linked, type '#' to reference them."

# ==============================================================================
# 2. Project Initialization
# ==============================================================================
ai-init:
	@echo "Initializing project..."
	@# For initialization, we still dump content because files might not exist/be indexed yet.
	@cat .ai/rules.md .ai/git_policy.md .ai/loop.md docs/subject.md .ai/seed.txt > .ai_prompt_temp
	
	@cat .ai_prompt_temp | $(CLIP)
	@rm .ai_prompt_temp
	@echo "🚀 Initialization prompt copied! Paste to AI."