/**
 * Decodes a GitHub Contents API file payload (`repos.getContent` on a file) to UTF-8 text.
 *
 * @see docs/adrs/0001-no-pr-head-execution.md
 */
export const decodeGithubRepositoryContentFile = (
  contentsApiResponse: unknown,
  requestedFilePath: string,
): string => {
  if (Array.isArray(contentsApiResponse)) {
    throw new TypeError(`${requestedFilePath} is a directory, not a file.`);
  }
  if (typeof contentsApiResponse !== "object" || contentsApiResponse === null) {
    throw new TypeError(`Unexpected response when reading ${requestedFilePath}.`);
  }
  const fileRecord = contentsApiResponse as Record<string, unknown>;
  if (fileRecord.type !== "file") {
    throw new TypeError(`${requestedFilePath} is not a file (type=${String(fileRecord.type)}).`);
  }
  const encoding = fileRecord.encoding;
  const base64Content = fileRecord.content;
  if (encoding !== "base64" || typeof base64Content !== "string") {
    throw new TypeError(`${requestedFilePath} could not be read as base64-encoded file content.`);
  }
  const normalizedBase64 = base64Content.replace(/\s/g, "");
  return Buffer.from(normalizedBase64, "base64").toString("utf8");
};
