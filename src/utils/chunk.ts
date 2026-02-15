export function chunkText(text: string, maxLen = 1900): string[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [""];
  }

  const chunks: string[] = [];
  let remaining = trimmed;

  while (remaining.length > maxLen) {
    let splitAt = remaining.lastIndexOf("\n", maxLen);
    if (splitAt < Math.floor(maxLen * 0.5)) {
      splitAt = remaining.lastIndexOf(" ", maxLen);
    }
    if (splitAt < 0) {
      splitAt = maxLen;
    }

    const head = remaining.slice(0, splitAt).trim();
    if (head) {
      chunks.push(head);
    }

    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
