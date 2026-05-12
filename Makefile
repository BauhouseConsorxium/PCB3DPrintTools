.PHONY: dev build test clean install

install:
	npm install

dev:
	npx vite

build:
	npx vite build

test:
	npx vitest run

clean:
	rm -rf dist
