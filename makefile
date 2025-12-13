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
	@echo "Generating context prompt..."
	
	@# Create a prompt that tells Copilot to look at specific files
	@echo "Please understand the context of the project from these files to help me with my task:" > .ai_prompt_temp
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
	@echo "INSTRUCTIONS:" >> .ai_prompt_temp
	@echo "1. Read the files above to understand the project status and rules." >> .ai_prompt_temp
	@echo "2. Wait for my specific instructions which I will provide after this prompt." >> .ai_prompt_temp
	@echo "3. Continue to follow the Git Policy and Project Master for progress tracking." >> .ai_prompt_temp
	@echo "" >> .ai_prompt_temp
	@echo "ALL OUTPUT MUST BE IN JAPANESE." >> .ai_prompt_temp
	@echo "" >> .ai_prompt_temp
	@echo "My Request:" >> .ai_prompt_temp

	@cat .ai_prompt_temp | $(CLIP)
	@rm .ai_prompt_temp
	@echo "✅ Context prompt copied!"
	@echo "👉 Paste into Copilot Chat and add your specific instructions."

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

# ==============================================================================
# 3. Docker Compose Commands
# ==============================================================================

up:
	@echo "Starting development environment..."
	@docker compose up --build
	@echo "✅ Development environment is up!"

down:
	@echo "Stopping development environment..."
	@docker compose down
	@echo "✅ Development environment is down!"

.PHONY: ai ai-init up down