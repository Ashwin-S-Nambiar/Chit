import { encode } from './vendor/uqr.js';

export function qrPath(text) {
  const { data, size } = encode(text, { ecc: 'L', border: 0 });
  let d = '';
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y][x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < size && data[y][x]) x++;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  }
  return { d, size };
}
