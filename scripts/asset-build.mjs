import { createHash } from 'node:crypto';
import { posix } from 'node:path';
const imports = /(\b(?:from|import)\s*)(['"])(\.\/[^'"]+)\2/g;
// A dependency's content-based filename becomes part of its parent's content,
// so changing a leaf also invalidates every importing entry point.
export function fingerprintAssets(sources) {
  const output = new Map(), visiting = new Set();
  function build(name) {
    if (output.has(name)) return output.get(name);
    if (visiting.has(name)) throw new Error(`Circular asset imports: ${name}`);
    if (!sources.has(name)) throw new Error(`Missing imported asset: ${name}`);
    visiting.add(name);
    let content = Buffer.from(sources.get(name));
    if (name.endsWith('.js')) {
      const text = content.toString('utf8').replace(imports, (match, prefix, quote, specifier) => {
        const pathname = specifier.split(/[?#]/)[0];
        const dependency = posix.normalize(posix.join(posix.dirname(name), pathname));
        const built = build(dependency);
        const relative = posix.relative(posix.dirname(name), built.filename);
        return `${prefix}${quote}${relative.startsWith('.') ? relative : `./${relative}`}${specifier.slice(pathname.length)}${quote}`;
      });
      content = Buffer.from(text);
    }
    const extension = posix.extname(name);
    const hash = createHash('sha256').update(content).digest('hex').slice(0, 12);
    const filename = `${name.slice(0, -extension.length)}.${hash}${extension}`;
    const asset = { filename, content };
    output.set(name, asset); visiting.delete(name);
    return asset;
  }
  for (const name of [...sources.keys()].sort()) build(name);
  return output;
}
export function rewritePageAssets(html, assets) {
  return html.replace(/(\b(?:src|href)=["'])assets\/([^"'?#]+)([^"']*)(["'])/g, (match, prefix, name, suffix, quote) => {
    const asset = assets.get(name);
    if (!asset) throw new Error(`Unknown page asset: ${name}`);
    return `${prefix}assets/${asset.filename}${suffix}${quote}`;
  });
}
