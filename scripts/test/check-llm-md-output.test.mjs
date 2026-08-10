import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  validateAllModulesFeed,
  validateFileSystemOutput,
  validateHttpOutput,
} from '../check-llm-md-output.mjs';

async function createDistFixture(files) {
  const distDir = await mkdtemp(path.join(tmpdir(), 'wdk-llm-md-'));

  for (const [relativePath, content] of Object.entries(files)) {
    const target = path.join(distDir, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, 'utf8');
  }

  return distDir;
}

test('accepts markdown output for required files without the manifest', async () => {
  const distDir = await createDistFixture({
    'index.md': '# Welcome to WDK (/)\n\nHome content',
    'index.html': '<!DOCTYPE html><html><body>Home page</body></html>',
    '404/index.html': '<!DOCTYPE html><html><body>Not found</body></html>',
    '_not-found/index.html': '<!DOCTYPE html><html><body>Not found</body></html>',
    'sdk/get-started.md': '# Get Started (/sdk/get-started)\n\nArchitecture content',
    'sdk/get-started/index.html': '<!DOCTYPE html><html><body>Get Started</body></html>',
  });

  const errors = await validateFileSystemOutput({ distDir });

  assert.deepEqual(errors, []);
});

test('rejects missing required markdown files', async () => {
  const distDir = await createDistFixture({
    'index.md': '# Welcome to WDK (/)\n\nHome content',
  });

  const errors = await validateFileSystemOutput({ distDir });

  assert(errors.some((error) => error.includes('Missing required Markdown file: sdk/get-started.md')));
});

test('rejects an exported HTML page without a matching markdown file', async () => {
  const distDir = await createDistFixture({
    'index.md': '# Welcome to WDK (/)\n\nHome content',
    'index.html': '<!DOCTYPE html><html><body>Home page</body></html>',
    'sdk/get-started.md': '# Get Started (/sdk/get-started)\n\nArchitecture content',
    'sdk/get-started/index.html': '<!DOCTYPE html><html><body>Get Started</body></html>',
    'sdk/wallet-modules/index.html': '<!DOCTYPE html><html><body>Wallet Modules</body></html>',
  });

  const errors = await validateFileSystemOutput({ distDir });

  assert(errors.some((error) => error.includes('Missing Markdown file for exported HTML page: sdk/wallet-modules.md')));
});

test('rejects leaked manifest and Next 404 HTML in markdown files', async () => {
  const distDir = await createDistFixture({
    'index.md': '# Welcome to WDK (/)\n\nHome content',
    'sdk/get-started.md': '<!DOCTYPE html><title>404: This page could not be found.</title>',
    'llm-md-manifest.json': '[]',
  });

  const errors = await validateFileSystemOutput({ distDir });

  assert(errors.some((error) => error.includes('Temporary manifest was not removed')));
  assert(errors.some((error) => error.includes('contains HTML/Next.js error content')));
});

test('rejects markdown files that duplicate the matching HTML page body', async () => {
  const html = '<!DOCTYPE html><html><body>Get Started</body></html>';
  const distDir = await createDistFixture({
    'index.md': '# Welcome to WDK (/)\n\nHome content',
    'sdk/get-started.md': html,
    'sdk/get-started/index.html': html,
  });

  const errors = await validateFileSystemOutput({ distDir });

  assert(errors.some((error) => error.includes('duplicates HTML output')));
});

test('rejects a successful response for a missing markdown route', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const pathname = new URL(url).pathname;
    const fixtures = {
      '/sdk/get-started.md': {
        ok: true,
        status: 200,
        text: '# Get Started (/sdk/get-started)\n\nArchitecture content',
      },
      '/sdk/get-started/': {
        ok: true,
        status: 200,
        text: '<!DOCTYPE html><html><body>Get Started</body></html>',
      },
      '/does-not-exist.md': {
        ok: true,
        status: 200,
        text: '<!DOCTYPE html><html><body>Fallback</body></html>',
      },
    };
    const fixture = fixtures[pathname];

    return {
      ok: fixture.ok,
      status: fixture.status,
      text: async () => fixture.text,
    };
  };

  try {
    const errors = await validateHttpOutput({ baseUrl: 'http://localhost:8080' });

    assert(errors.some((error) => error.includes('/does-not-exist.md unexpectedly returned HTTP 200')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('accepts one exact All Modules feed with valid internal documentation links', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wdk-all-modules-feed-'));
  const sourcePath = path.join(root, 'content/feeds/all-modules.md');
  const publicPath = path.join(root, 'public/llms-full.txt');
  const distPath = path.join(root, 'dist/llms-full.txt');
  const docsRoot = path.join(root, 'content/docs');
  const source = [
    '## All Modules',
    'URL: https://wdk.tether.io/developers/blocks',
    '',
    '[Core docs](/sdk/core-module/)',
    '',
    '## Community Modules',
    '',
    '| Module | Category | Description | Documentation |',
    '|--------|----------|-------------|---------------|',
    '| [`@example/community`](https://example.com/community) | Wallet | Example | [Core docs](/sdk/core-module/) |',
  ].join('\n');

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await mkdir(path.dirname(publicPath), { recursive: true });
  await mkdir(path.dirname(distPath), { recursive: true });
  await mkdir(path.join(docsRoot, 'sdk/core-module'), { recursive: true });
  await writeFile(sourcePath, `${source}\n`, 'utf8');
  const artifact = `# WDK Documentation\n\nURL: https://docs.wdk.tether.io/sdk/community-modules/wdk-wallet-cosmos\n\n${source}\n\n***\n`;
  await writeFile(publicPath, artifact, 'utf8');
  await writeFile(distPath, artifact, 'utf8');
  await writeFile(path.join(docsRoot, 'sdk/core-module/index.mdx'), '---\ntitle: Core\n---\n', 'utf8');

  const errors = await validateAllModulesFeed({ sourcePath, publicPath, distPath, docsRoot });

  assert.deepEqual(errors, []);
});

test('rejects a duplicated feed and missing internal documentation route', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'wdk-all-modules-feed-'));
  const sourcePath = path.join(root, 'content/feeds/all-modules.md');
  const publicPath = path.join(root, 'public/llms-full.txt');
  const distPath = path.join(root, 'dist/llms-full.txt');
  const docsRoot = path.join(root, 'content/docs');
  const source = [
    '## All Modules',
    'URL: https://wdk.tether.io/developers/blocks',
    '',
    '[Missing docs](/sdk/missing/)',
    '',
    '## Community Modules',
    '',
    '| Module | Category | Description | Documentation |',
  ].join('\n');
  const duplicated = `${source}\n\n***\n\n${source}\n\n***\n\n`;

  await mkdir(path.dirname(sourcePath), { recursive: true });
  await mkdir(path.dirname(publicPath), { recursive: true });
  await mkdir(path.dirname(distPath), { recursive: true });
  await mkdir(docsRoot, { recursive: true });
  await writeFile(sourcePath, `${source}\n`, 'utf8');
  await writeFile(publicPath, duplicated, 'utf8');
  await writeFile(distPath, duplicated, 'utf8');

  const errors = await validateAllModulesFeed({ sourcePath, publicPath, distPath, docsRoot });

  assert(errors.some((error) => error.includes('missing documentation route: /sdk/missing/')));
  assert(errors.some((error) => error.includes('must include the community-module table')));
  assert(errors.some((error) => error.includes('public llms-full artifact must contain exactly one')));
  assert(errors.some((error) => error.includes('built llms-full artifact must contain exactly one')));
});
