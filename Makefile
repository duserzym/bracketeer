.PHONY: setup dev test check e2e build desktop

setup:
	pnpm install

dev:
	pnpm dev

test: check
	$(MAKE) e2e

check:
	pnpm format:check
	pnpm lint
	pnpm check
	pnpm test

e2e:
	pnpm e2e

build:
	pnpm build

desktop:
	@echo "The desktop build arrives in milestone 4."
	@exit 1
