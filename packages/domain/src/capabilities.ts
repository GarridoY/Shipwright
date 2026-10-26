/** Fail closed when runtime capabilities are unavailable or requirement data is malformed. */
export function supportsCapabilities(required: unknown, supported: readonly string[] | undefined): boolean {
  return Array.isArray(required) && required.every((item) => typeof item === 'string') &&
    supported !== undefined && required.every((item: string) => supported.includes(item));
}
