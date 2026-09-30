'use strict';
// electron-builder afterPack hook: flips the Electron fuses of the packaged executable (build/fuses.cjs) after the
// app.asar integrity resource is embedded and before the executable's resources are edited (icon, version strings).
// strictlyRequireAllFuses: a fuse added by an Electron upgrade fails the build until build/fuses.cjs decides it.
// scripts/check-fuses.mjs reads them back from the built executable.
const path = require('node:path');
const { FUSES } = require('./fuses.cjs');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') throw new Error('only the Windows build is configured');
  const { flipFuses, FuseVersion, FuseV1Options } = await import('@electron/fuses');
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  const config = { version: FuseVersion.V1, strictlyRequireAllFuses: true };
  for (const [name, on] of Object.entries(FUSES)) {
    if (!(name in FuseV1Options)) throw new Error(`unknown fuse ${name}`);
    config[FuseV1Options[name]] = on;
  }
  const slices = await flipFuses(exe, config);
  if (slices !== 1) throw new Error(`expected one fuse wire in ${path.basename(exe)}, found ${slices}`);
};
