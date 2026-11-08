.DEFAULT_GOAL := dev

NPM ?= npm
NODE ?= node
PORT ?= 4173

.PHONY: help prerequisites setup dev start build build-cdn check test test-wasm test-browser setup-browser test-playwright check-crystal clean

help:
	@printf '%s\n' \
	  'make / make dev     Install dependencies, build, and serve the app' \
	  'make setup          Install pinned npm dependencies (Node.js >= 22)' \
	  'make build          Build dist/ with the local Crystal/Wasm compiler' \
	  'make build-cdn      Build dist/ using the CDN compiler' \
	  'make check          Check JavaScript, JSON, and generated code' \
	  'make test           Run checks and JavaScript unit tests' \
	  'make test-wasm      Compile the examples with the real Wasm compiler' \
	  'make test-browser   Build and run Chrome WebGL/compiler tests (CHROME_BIN)' \
	  'make setup-browser  Install Chromium for Playwright (first time only)' \
	  'make test-playwright Build and run Playwright UI/compiler tests' \
	  'make check-crystal  Run native Crystal format, Ameba, and specs' \
	  'make clean          Remove the generated dist/ directory' \
	  'PORT=4180 make      Serve on a different port; Ctrl+C stops the server'

prerequisites:
	@command -v $(NODE) >/dev/null 2>&1 || { echo 'Node.js >= 22 is required. Install Node.js 24 LTS, then run make again.' >&2; exit 1; }
	@$(NODE) -e 'if (Number(process.versions.node.split(".")[0]) < 22) { console.error("Node.js >= 22 is required. Install Node.js 24 LTS, then run make again."); process.exit(1); }'
	@command -v $(NPM) >/dev/null 2>&1 || { echo 'npm is required. Install it with Node.js, then run make again.' >&2; exit 1; }

setup: node_modules/.make-install-stamp

node_modules/.make-install-stamp: package.json package-lock.json | prerequisites
	$(NPM) ci --ignore-scripts
	@touch $@

build: setup
	$(NPM) run build

# CDN mode deliberately works without installing the compiler package locally.
build-cdn: prerequisites
	$(NPM) run build:cdn

dev start: build
	PORT=$(PORT) $(NPM) run dev

check: setup
	$(NPM) run check

test: check
	$(NPM) test

test-wasm: setup
	$(NPM) run test:wasm

test-browser: build
	$(NPM) run test:browser

setup-browser: setup
	$(NPM) exec -- playwright install chromium

test-playwright: build
	$(NPM) run test:playwright

check-crystal:
	@command -v crystal >/dev/null 2>&1 && command -v shards >/dev/null 2>&1 || { echo 'Install Crystal >= 1.17 and shards to run native checks.' >&2; exit 1; }
	shards install --frozen
	crystal tool format --check src spec examples
	bin/ameba
	crystal spec --error-trace

clean:
	rm -rf dist
