// Generates URL-safe TEXT IDs matching the project's existing convention
// Standard alphabet: 0-9, a-z, A-Z, _, - (length: 11 characters)

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_-";

export function generateTextId(prefix = "") {
  let id = "";
  const len = 11;
  for (let i = 0; i < len; i++) {
    const randIdx = Math.floor(Math.random() * ALPHABET.length);
    id += ALPHABET[randIdx];
  }
  return prefix ? `${prefix}_${id}` : id;
}

export function generateAssociationId() {
  return generateTextId();
}

export function generatePersonId() {
  return generateTextId();
}

export function generateShareId() {
  return generateTextId();
}

export function generateContributorId() {
  return generateTextId();
}

export function generatePaymentId() {
  return generateTextId();
}
