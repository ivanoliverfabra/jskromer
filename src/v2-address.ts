// Source: https://github.com/Twijn/kromer/blob/main/src/lib/v2Address.ts

import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";

function sha256Hex(input: string): string {
  const bytes = utf8ToBytes(input);
  return bytesToHex(sha256(bytes));
}

function makeAddressByte(byteVal: number): string {
  const b = 48 + Math.floor(byteVal / 7); // 48 = '0'
  if (b + 39 > 122) return String.fromCharCode(101); // 'e' (special overflow case)
  if (b > 57) return String.fromCharCode(b + 39); // map to 'a'..'z'
  return String.fromCharCode(b); // '0'..'9'
}

export function generateAddressV2(privateKey: string, prefix = "k"): string {
  if (!privateKey) {
    throw "Private key must be a non-empty string";
  }

  const protein: string[] = new Array(9).fill("");
  let stick = sha256Hex(sha256Hex(privateKey)); // double-sha on the plain privateKey string

  for (let n = 0; n < 9; n++) {
    protein[n] = stick.slice(0, 2);
    stick = sha256Hex(sha256Hex(stick));
  }

  // 2) greedily construct 9 address characters
  let n = 0;
  let out = prefix;
  while (n < 9) {
    // Lua uses string.sub(stick, 1 + (2*n), 2 + (2*n)) (1-based indexing)
    const idx1 = 1 + 2 * n; // 1-based
    const start = idx1 - 1; // convert to 0-based slice
    const end = idx1 + 1; // exclusive
    const byteHex = stick.slice(start, end);
    if (byteHex.length < 2) {
      // if we ran out of bytes in stick, advance stick by single sha and try again
      stick = sha256Hex(stick);
      continue;
    }

    const link = (parseInt(byteHex, 16) % 9) >>> 0; // 0..8
    if (protein[link] && protein[link] !== "") {
      const byteVal = parseInt(protein[link], 16);
      out += makeAddressByte(byteVal);
      protein[link] = ""; // consume this protein slot
      n++;
    } else {
      // chosen protein slot already consumed; advance stick (single sha)
      stick = sha256Hex(stick);
    }
  }

  return out;
}

export default generateAddressV2;