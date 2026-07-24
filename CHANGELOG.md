# Changelog

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
