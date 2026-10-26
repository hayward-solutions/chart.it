const ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567'

export function newId(prefix: string): string {
  let out = ''
  const bytes = new Uint8Array(10)
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Math.floor(Math.random() * 256)
    }
  }
  for (const byte of bytes) {
    out += ALPHABET[byte % ALPHABET.length]
  }
  return `${prefix}_${out}`
}
