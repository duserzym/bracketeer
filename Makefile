.PHONY: setup dev test check rust-check e2e build web icons desktop windows mac-app

WINDOWS_PATH := /opt/homebrew/opt/llvm/bin:/opt/homebrew/opt/lld/bin:$(PATH)

setup:
	pnpm install

dev:
	pnpm dev

test: check
	$(MAKE) web
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
	pnpm e2e

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

desktop: icons
	pnpm build:desktop
	CI=true cargo tauri build --bundles app,dmg

windows: icons
	pnpm build:desktop
	PATH="$(WINDOWS_PATH)" cargo tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle
	mkdir -p dist/windows
	cp src-tauri/target/x86_64-pc-windows-msvc/release/bracketeer.exe dist/windows/bracketeer.exe

mac-app: desktop
	mkdir -p dist/macos
	ditto src-tauri/target/release/bundle/macos/bracketeer.app dist/macos/bracketeer.app
	cp src-tauri/target/release/bundle/dmg/*.dmg dist/macos/
