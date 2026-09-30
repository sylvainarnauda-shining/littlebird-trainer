#!/usr/bin/env node
// The software bill of materials of the shipped programs (CycloneDX 1.6 JSON): what the installer, the portable zip
// and the browser page contain besides the project's own code. The app has no npm runtime dependency, so the list is
// short and written from the pinned facts rather than from the development lockfile: the Electron runtime (version and
// the sha256 of its official release zip, from the pinned electron package's checksums.json) and three.js (the
// vendored file's sha256, pinned in publish-policy.json). Deterministic: the serial number derives from the content and
// the timestamp is SOURCE_DATE_EPOCH (else the last commit's time).
//   node scripts/sbom.mjs [--out release]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { sourceEpoch } from './make-web-zip.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));

export function sbom({ epoch }) {
  const pkg = read('package.json');
  const electron = read('node_modules/electron/package.json').version;
  const electronZip = `electron-v${electron}-win32-x64.zip`;
  const electronSha = read('node_modules/electron/checksums.json')[electronZip];
  const threeSha = read('publish-policy.json').vendorChecksums['src/vendor/three.min.js'];
  if (!electronSha || !threeSha) throw new Error('pinned checksums missing');
  const mit = [{ license: { id: 'MIT' } }];
  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: '1.6',
    version: 1,
    metadata: {
      timestamp: new Date(epoch * 1000).toISOString().replace('.000Z', 'Z'),
      tools: {
        components: [{ type: 'application', name: 'littlebird-trainer scripts/sbom.mjs', version: pkg.version }],
      },
      component: {
        type: 'application',
        'bom-ref': `pkg:github/sylvainarnauda-shining/littlebird-trainer@v${pkg.version}`,
        name: pkg.productName,
        version: pkg.version,
        licenses: mit,
        purl: `pkg:github/sylvainarnauda-shining/littlebird-trainer@v${pkg.version}`,
        externalReferences: [{ type: 'vcs', url: 'https://github.com/sylvainarnauda-shining/littlebird-trainer' }],
      },
    },
    components: [
      {
        type: 'framework',
        'bom-ref': `pkg:npm/electron@${electron}`,
        name: 'electron',
        version: electron,
        description: 'Desktop runtime (Chromium and Node.js) of the Windows installer and portable zip',
        licenses: mit,
        purl: `pkg:npm/electron@${electron}`,
        hashes: [{ alg: 'SHA-256', content: electronSha }],
        externalReferences: [
          {
            type: 'distribution',
            url: `https://github.com/electron/electron/releases/download/v${electron}/${electronZip}`,
          },
          { type: 'website', url: 'https://www.electronjs.org' },
        ],
      },
      {
        type: 'library',
        'bom-ref': 'pkg:npm/three@0.160.0',
        name: 'three',
        version: '0.160.0',
        description: 'three.js r160 (build/three.min.js), inlined in the page',
        licenses: mit,
        purl: 'pkg:npm/three@0.160.0',
        hashes: [{ alg: 'SHA-256', content: threeSha }],
        externalReferences: [{ type: 'website', url: 'https://threejs.org' }],
      },
    ],
    dependencies: [
      {
        ref: `pkg:github/sylvainarnauda-shining/littlebird-trainer@v${pkg.version}`,
        dependsOn: [`pkg:npm/electron@${electron}`, 'pkg:npm/three@0.160.0'],
      },
    ],
  };
  const h = crypto.createHash('sha256').update(JSON.stringify(doc)).digest('hex');
  const uuid = `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-${((parseInt(h[16], 16) & 3) | 8).toString(16)}${h.slice(17, 20)}-${h.slice(20, 32)}`;
  return { serialNumber: `urn:uuid:${uuid}`, ...doc };
}

function main() {
  const argv = process.argv.slice(2);
  const out = argv.includes('--out') ? path.resolve(argv[argv.indexOf('--out') + 1]) : path.join(ROOT, 'release');
  const { version } = read('package.json');
  const file = path.join(out, `LittleBird-Trainer-${version}.sbom.cdx.json`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(file, JSON.stringify(sbom({ epoch: sourceEpoch() }), null, 1) + '\n');
  console.log(`sbom: ${path.basename(file)}`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
