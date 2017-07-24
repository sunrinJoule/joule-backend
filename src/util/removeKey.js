export default function removeKey(src, key) {
  let dest = Object.assign({}, src);
  delete dest[key];
  return dest;
}
