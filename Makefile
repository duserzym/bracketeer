.PHONY: setup dev test check rust-check e2e build web icons desktop windows mac-app clean-build

WINDOWS_PATH := /opt/homebrew/opt/llvm/bin:/opt/homebrew/opt/lld/bin:$(PATH)

setup:
	pnpm install

dev:
	pnpm dev

test: check
	$(MAKE) build
	pnpm build:desktop
	$(MAKE) web
	node scripts/check-budgets.mjs
	$(MAKE) e2e

check:
	pnpm format:check
	pnpm lint
	pnpm check
	pnpm test
	$(MAKE) rust-check

rust-check: icons
	cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
	cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
	cargo test --manifest-path src-tauri/Cargo.toml

e2e:
	pnpm e2e $(E2E_ARGS)

build: public/favicon.svg
	pnpm build

web: public/favicon.svg
	pnpm build:web

src-tauri/assets-icon.svg public/favicon.svg: src-tauri/icon/make_icon.py
	python3 -I src-tauri/icon/make_icon.py

icons: src-tauri/icons/icon.png

src-tauri/icons/icon.png: src-tauri/assets-icon.svg
	cargo tauri icon src-tauri/assets-icon.svg -o src-tauri/icons
	rm -rf src-tauri/icons/android src-tauri/icons/ios
	touch src-tauri/build.rs

# Sign macOS builds with the lab's code-signing certificate when this Mac has it
# ("UPb Lab Code Signing" in the login keychain; ~/Github/lab-builds/SIGNING.md), so
# keychain permissions survive rebuilds and updates. Elsewhere builds stay ad hoc.
LAB_SIGNING_IDENTITY ?= $(shell security find-identity -p codesigning 2>/dev/null | grep -q '"UPb Lab Code Signing"' && echo 'UPb Lab Code Signing')
SIGN_ENV = $(if $(LAB_SIGNING_IDENTITY),APPLE_SIGNING_IDENTITY="$(LAB_SIGNING_IDENTITY)")

desktop: icons
	pnpm build:desktop
	CI=true $(SIGN_ENV) cargo tauri build --bundles app,dmg

windows: icons
	pnpm build:desktop
	PATH="$(WINDOWS_PATH)" cargo tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle
	mkdir -p dist/windows
	cp src-tauri/target/x86_64-pc-windows-msvc/release/bracketeer.exe dist/windows/bracketeer.exe

mac-app: desktop
	mkdir -p dist/macos
	ditto src-tauri/target/release/bundle/macos/bracketeer.app dist/macos/bracketeer.app
	cp src-tauri/target/release/bundle/dmg/*.dmg dist/macos/

# After a major update (AGENTS.md): drop compilation output once the app is
# installed. A Windows build only in target/ is first copied to dist/windows/.
WIN_EXE := src-tauri/target/x86_64-pc-windows-msvc/release/bracketeer.exe
clean-build:
	@if pgrep -f "$(CURDIR)/src-tauri/target/" >/dev/null; then echo "A build is writing to $(CURDIR)/src-tauri/target; not cleaning."; exit 1; fi
	@df -h / | awk 'NR==2 {print "Free on /: " $$4 " (before)"}'
	@if [ -f $(WIN_EXE) ] && ! cmp -s $(WIN_EXE) dist/windows/bracketeer.exe; then mkdir -p dist/windows && cp $(WIN_EXE) dist/windows/bracketeer.exe && echo "Kept the Windows build as dist/windows/bracketeer.exe"; fi
	rm -rf ./src-tauri/target
	@df -h / | awk 'NR==2 {print "Free on /: " $$4 " (after)"}'
