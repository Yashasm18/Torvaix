# Changelog

## [0.3.0](https://github.com/Yashasm18/Torvaix/compare/v0.2.0...v0.3.0) (2026-08-04)


### Features

* **graph:** dynamic route rendering, graph unit tests, and write-path architecture sync ([be988db](https://github.com/Yashasm18/Torvaix/commit/be988db056ecdd7b24dec0fbeda38446dba0f4dd))
* **graph:** production enterprise upgrade with DB indexing, edge reinforcement, ego graph queries, and hybrid RAG context ([b7315e4](https://github.com/Yashasm18/Torvaix/commit/b7315e4135cdf0218787671f42c81bfce1b73b55))
* **memory:** add Hybrid Retrieval Engine (BM25 + Qdrant Vector RAG with RRF) ([c074d6a](https://github.com/Yashasm18/Torvaix/commit/c074d6a4216639582c23aca671b3f154ba78e78d))
* **memory:** add hybrid retrieval engine with BM25 and RRF ([7f69a0a](https://github.com/Yashasm18/Torvaix/commit/7f69a0ad88238d0f65cea0c57672317e394b1992))
* **security:** add HTTP security headers for web application protection ([751e412](https://github.com/Yashasm18/Torvaix/commit/751e4125ca2f18e79a129b555c3d938e8b56ab72))
* **security:** add HTTP security headers for web application protection ([a91e6ba](https://github.com/Yashasm18/Torvaix/commit/a91e6ba17bf27176478a401c5c57904cb7a79ed4))


### Bug Fixes

* **ci:** build Docker images on native runners ([5d8a416](https://github.com/Yashasm18/Torvaix/commit/5d8a416caae9222f4cd54179b11864dd83d8ff65))
* **ci:** lowercase GHCR image name ([c825025](https://github.com/Yashasm18/Torvaix/commit/c825025f99a0fcf15d5e65c8dcda2d4bf38da46d))
* **ci:** lowercase GHCR image name ([ed652a2](https://github.com/Yashasm18/Torvaix/commit/ed652a2de9f9693c15c2d61579ba139e17496c9c))
* **ci:** publish Docker images from native runners ([cce4f3f](https://github.com/Yashasm18/Torvaix/commit/cce4f3fab76d3031618a3e126c5f30911cd6d0ae))


### Documentation

* **readme:** add Knowledge Graph backend API endpoint examples ([46da5de](https://github.com/Yashasm18/Torvaix/commit/46da5de9c0e9fda6544ec093281d3f120dd5e195))


### Maintenance

* organize repository structure ([b070540](https://github.com/Yashasm18/Torvaix/commit/b07054074694445ec0d649fce54e09430fc62277))
* organize repository structure , cleanup enabled! ([4e53631](https://github.com/Yashasm18/Torvaix/commit/4e536315efe559865a8a702408e961aff25148bd))

## [0.2.0](https://github.com/Yashasm18/Torvaix/compare/v0.1.0...v0.2.0) (2026-07-14)


### Features

* **agent:** inject Torvaix identity system prompt into memory and execution nodes ([0bc5a1d](https://github.com/Yashasm18/Torvaix/commit/0bc5a1df806d950cc3b9059eec73cdb0a88fa923))
* **core:** implement multi-tenant workspace isolation and fix CI test contract ([c5b8611](https://github.com/Yashasm18/Torvaix/commit/c5b86112c347f7d7a2f3289162689643f809a847))
* **hardening:** core infrastructure hardening - v0.2.0 ([ae18792](https://github.com/Yashasm18/Torvaix/commit/ae1879202c22d245afe637e8371a0cfdfa7f5ede))
* improve execution agent UX for file writes and repo analysis ([9869ac2](https://github.com/Yashasm18/Torvaix/commit/9869ac223b2a6a3469cbb0be8d976e7a5d02893d))
* **landing:** replace testimonials with interactive Memory Fragments carousel ([be6259a](https://github.com/Yashasm18/Torvaix/commit/be6259a794abef5fe1470d3f697a065fa4c3e685))
* **memory:** add fast-path keyword routing for persistent memory writes ([0a66121](https://github.com/Yashasm18/Torvaix/commit/0a661218a8d3c70f2e72246eb03b4c8d0c945c16))


### Bug Fixes

* add dedicated nodeRepoAnalysis with hard control-flow termination — no LLM loop possible ([6e1ea87](https://github.com/Yashasm18/Torvaix/commit/6e1ea87379c893999d4c9fb129d9fe0ec75c9eec))
* add deterministic identity fast-path and tighten system prompt ([71703ed](https://github.com/Yashasm18/Torvaix/commit/71703ed0e0daa09ace92107d82e2bb4f2c39c2f5))
* add terminal condition to repo_scan to prevent infinite execution loop ([1fde10d](https://github.com/Yashasm18/Torvaix/commit/1fde10d206a5cf83cba8f85aa5a9c8e3e59c5f4b))
* add terminal condition to write_file to prevent agent execution looping ([046d34c](https://github.com/Yashasm18/Torvaix/commit/046d34c370ca386f97e07ccf8e91b72a76088eda))
* **agent:** clean up tsconfig to resolve VS Code schema error ([166fed6](https://github.com/Yashasm18/Torvaix/commit/166fed6e0205ada520f5d75d9d5e6fb076b440f5))
* **agent:** resolve typescript errors and missing types ([1b08810](https://github.com/Yashasm18/Torvaix/commit/1b0881094a5b7f5997332e17209f95f1e1ad3bba))
* **ci:** move release-please changelog config and align tag format ([98cb70c](https://github.com/Yashasm18/Torvaix/commit/98cb70caed215ef778b66be6db4407972f91bdab))
* **ci:** sync lockfile and restore green GitHub Actions workflows ([e7c614b](https://github.com/Yashasm18/Torvaix/commit/e7c614bd3974a6844e092c1ba0efe15ffa7d916e))
* ensure robust deterministic identity fast-path ([f3b58ad](https://github.com/Yashasm18/Torvaix/commit/f3b58ad2cbab48e1143eb34b07fb5e7d5870e5ac))
* implement TraceCollector class — was missing, causing runtime crash on agent server ([688e774](https://github.com/Yashasm18/Torvaix/commit/688e774ba71b956e7956584b05557293527121ab))
* **lint:** escape jsx quotes and clean warnings ([ed5793b](https://github.com/Yashasm18/Torvaix/commit/ed5793b46a21b02c62a2bf4e9b3014d9b595840a))
* **stream:** update vercel ai sdk stream markers and auth proxy fallback ([b6a0bf6](https://github.com/Yashasm18/Torvaix/commit/b6a0bf6808f646eda5c28a591a28408fa287968d))
* **test:** close provider describe block and stabilize CI ([0196b64](https://github.com/Yashasm18/Torvaix/commit/0196b640435a2dcf710f35cfe6494b21dbf611ed))
* **test:** resolve vitest aliases and provider fallback assertions ([9d47a8b](https://github.com/Yashasm18/Torvaix/commit/9d47a8b236c768c189620eab8bdcd8324e09dbef))
* use deterministic bypass for repo_scan to guarantee control-flow termination ([e20684e](https://github.com/Yashasm18/Torvaix/commit/e20684ecda9e440f7f001ba42d584316638928b0))


### Maintenance

* **audit:** final high-value tests & documentation ([3fb594a](https://github.com/Yashasm18/Torvaix/commit/3fb594a865cf5374ba7c3d19ff123a91a5358d26))
* **release:** Final V1 Audit & Patch (Phases 3-7) ([7163d7d](https://github.com/Yashasm18/Torvaix/commit/7163d7d7121da5eeac59e1ce1bbfd07c9493be10))
