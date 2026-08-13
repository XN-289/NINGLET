export function slugify(title) {
  return String(title).toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function hash6(s) {
  // FNV-1a 32-bit，取低 24 位转 6 位 hex
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return (h & 0xffffff).toString(16).padStart(6, '0');
}

export function makeBookId(title) {
  const slug = slugify(title);
  return slug.length > 0 ? slug : 'book-' + hash6(title);
}

export function isValidBookId(id) {
  return typeof id === 'string'
    && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id)
    && !id.includes('..');
}
