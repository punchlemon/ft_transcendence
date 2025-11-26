# OS Check
UNAME_S := $(shell uname -s)
ifeq ($(UNAME_S),Darwin)
	CLIP = pbcopy
else
	CLIP = xclip -selection clipboard
endif

# Paths
AI_DIR = .ai
DOCS_DIR = docs
MASTER = PROJECT_MASTER.md
ARCH_DOC = README_ARCHITECTURE.md
STACK_DOC = $(AI_DIR)/tech_stack.md

# ==============================================================================
# 1. Daily Development Loop
#    Context: Rules + Tech Stack + Git Policy + Loop + Architecture + Master
# ==============================================================================
ai:
	@echo "Loading FULL context..."
	@if [ ! -f $(MASTER) ]; then echo "❌ Error: $(MASTER) not found. Run 'make ai-init' first."; exit 1; fi
	@if [ ! -f $(STACK_DOC) ]; then echo "❌ Error: $(STACK_DOC) not found. Run 'make ai-init' first."; exit 1; fi
	@if [ ! -f $(ARCH_DOC) ]; then touch $(ARCH_DOC); fi
	
	@# Combine all context files INCLUDING the dynamically created tech stack
	@cat $(AI_DIR)/rules.md $(STACK_DOC) $(AI_DIR)/git_policy.md $(AI_DIR)/loop.md $(ARCH_DOC) $(MASTER) > .ai_prompt_temp
	
	@# Add instruction
	@echo "\n\n--- COMMAND: Read the above rules, tech stack, and state. Execute the next step in the loop. ALL OUTPUT MUST BE IN JAPANESE. ---" >> .ai_prompt_temp
	
	@cat .ai_prompt_temp | $(CLIP)
	@rm .ai_prompt_temp
	@echo "✅ Context copied! Paste to AI."

# ==============================================================================
# 2. Project Initialization
#    Context: Rules + Loop + Subject + Seed (No Tech Stack yet)
# ==============================================================================
ai-init:
	@echo "Initializing project..."
	@if [ ! -f $(DOCS_DIR)/subject.md ]; then echo "❌ Error: $(DOCS_DIR)/subject.md not found. Place the text content of the PDF there."; exit 1; fi

	@# Initial prompt does NOT include tech_stack.md because AI will create it.
	@cat $(AI_DIR)/rules.md $(AI_DIR)/git_policy.md $(AI_DIR)/loop.md $(DOCS_DIR)/subject.md $(AI_DIR)/seed.txt > .ai_prompt_temp
	
	@cat .ai_prompt_temp | $(CLIP)
	@rm .ai_prompt_temp
	@echo "🚀 Initialization prompt copied! Paste to AI to generate 'tech_stack.md' and 'PROJECT_MASTER.md'."