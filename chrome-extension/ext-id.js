// ext-id.js
// Tiny module so options/popup can import the current extension id without
// re-implementing the chrome.runtime.id boilerplate.
export const EXT_ID = chrome.runtime.id;
