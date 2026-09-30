'use strict';
// The Electron fuses of the shipped executable (docs/SECURITE-CONCEPTION.md), shared by the afterPack hook that flips them
// (build/after-pack.cjs) and the check that reads them back (scripts/check-fuses.mjs). Every fuse of the current
// schema is listed: @electron/fuses' strictlyRequireAllFuses makes a fuse added by an Electron upgrade fail the build
// until someone decides its value here.
//   RunAsNode off                   ELECTRON_RUN_AS_NODE cannot turn the game's executable into node.exe
//   EnableCookieEncryption on       cookies (none today) encrypted at rest with the OS key
//   EnableNodeOptionsEnvironmentVariable off   NODE_OPTIONS is ignored
//   EnableNodeCliInspectArguments off          --inspect and friends are ignored (no debugger attach)
//   EnableEmbeddedAsarIntegrityValidation on   a modified app.asar is refused
//   OnlyLoadAppFromAsar on          the app is loaded from app.asar only (no app folder beside it)
//   LoadBrowserProcessSpecificV8Snapshot off   one V8 snapshot for every process
//   GrantFileProtocolExtraPrivileges off       the page is served by app://, file:// gets no extra rights
//   WasmTrapHandlers on             WebAssembly bounds checks through guard pages (Chromium's default)
const FUSES = {
  RunAsNode: false,
  EnableCookieEncryption: true,
  EnableNodeOptionsEnvironmentVariable: false,
  EnableNodeCliInspectArguments: false,
  EnableEmbeddedAsarIntegrityValidation: true,
  OnlyLoadAppFromAsar: true,
  LoadBrowserProcessSpecificV8Snapshot: false,
  GrantFileProtocolExtraPrivileges: false,
  WasmTrapHandlers: true,
};

module.exports = { FUSES };
