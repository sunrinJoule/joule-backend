// The name is misleading, whatever!!
export default function overwrite(src, content) {
  let dest = Object.assign({}, src);
  for (let key in content) {
    if (content[key] == null) continue;
    dest[key] = content[key];
  }
  return dest;
}
