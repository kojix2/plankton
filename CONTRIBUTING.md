# Contributing

Keep the compiler boundary honest: source must be compiled by Crystal/Wasm, not
interpreted by JavaScript or silently replaced with a bundled preview. The preview
badge and no-auto-run behavior for shares/drafts are part of the contract.

Run the checks listed in README. Native format/Ameba/spec, real Wasm examples and
browser integration all gate Pages deployment. Keep generated method wrappers in
sync with `schema/operations.json`. Add both shader tests and real Crystal
integration examples for a new opcode. Document differences from Hydra explicitly.

UI translations live in `web/locales/`. Add every key to all nine locales, preserving
`{placeholder}` names. Do not translate source code, protocol keys or shader names.
Localize display strings with `textContent`, not interpolated HTML. English is the
default even on a non-English browser; an explicit selection is remembered.

Simple is best. Keep the interface minimal: neutral surfaces, plain controls, and
compact readable type. Use color and visual emphasis for syntax, errors, focus,
or operation state.
Avoid decorative logos, shadows, blur, animations, and promotional headings.

Code introduced from another project needs attribution and a compatible license;
this independent renderer does not carry the Hydra or p5.js runtime. Retain all
upstream toolchain notices when distributing a built site. Dependency upgrades need
real compiler/browser tests; do not update just the package version in isolation.
