export class CacheKeyFactory {
  constructor(
    private readonly service: string,
    private readonly domain: string,
  ) {}

  /** config:pipeline:ws-123:abc-def */
  one(id: string, workspaceId?: string): string {
    return workspaceId
      ? `${this.service}:${this.domain}:${workspaceId}:${id}`
      : `${this.service}:${this.domain}:${id}`
  }

  /** config:pipeline:ws-123:list */
  list(workspaceId?: string): string {
    return workspaceId
      ? `${this.service}:${this.domain}:${workspaceId}:list`
      : `${this.service}:${this.domain}:list`
  }

  /** config:pipeline:ws-123:* — use with Redis SCAN for bulk invalidation */
  pattern(workspaceId?: string): string {
    return workspaceId
      ? `${this.service}:${this.domain}:${workspaceId}:*`
      : `${this.service}:${this.domain}:*`
  }
}
