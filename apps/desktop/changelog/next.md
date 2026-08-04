# What's new in vNEXT_VERSION

## Shiny new things

- Added authenticated Xiaohongshu account search and local subscription imports.
- Added WeChat Official Account discovery, local article imports, and channel session controls.
- Added translation settings directly to the entry-list header.
- Added a real desktop restart action and copyable error details for faster troubleshooting.

## Improvements

- Reuses cached Xiaohongshu sessions and subscriptions so repeated discovery starts faster.
- Keeps locally imported feed entries visible and reusable across the reading workflow.
- Makes channel search cancellation, fallback, and cached-result behavior more predictable.
- Makes desktop development names, Dock icons, logs, and inspection tools behave like the packaged app.

## No longer broken

- Fixed desktop login callbacks in development builds.
- Fixed detached console streams so logging continues after terminal disconnects.
- Fixed translation controls that were blocked by paid gates or unreliable pointer handling.
- Fixed entry-content fallback behavior when a source does not return complete article data.

## Thanks

Thanks to everyone who tested the new local data-source workflows and shared reproducible error details.
