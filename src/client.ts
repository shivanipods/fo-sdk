import type { ContextDocument, ContextEpisode, DatastoreConnector } from './types.js'

const DEFAULT_BASE_URL = 'https://api.foibleai.com/v1'

interface FoClientOptions {
  /** Your Fo API key. Get this from `fo auth` or the Fo dashboard. */
  apiKey: string
  /**
   * Base URL for the Fo API. Defaults to https://api.foibleai.com/v1.
   * Override for self-hosted deployments.
   */
  baseUrl?: string
}

interface IngestResult {
  /** Number of documents successfully ingested */
  ingested: number
  /** Number of documents that were skipped (already up-to-date) */
  skipped: number
}

interface ContextNamespace {
  /**
   * Push episodes into a user's context store.
   *
   * Accepts multiple episode types — no manual serialization required.
   * Idempotent: re-ingesting with the same `id` updates in place.
   * Episodes are immediately available for `search_context` and `qa_context`.
   *
   * @param agentEmail  Agent subdomain (e.g. 'atlas' for atlas@foibleai.com)
   * @param userId      Email address of the user whose context to update
   * @param episodes    Episodes to ingest (max 100 per call)
   *
   * @example
   * ```ts
   * const fo = new FoClient({ apiKey: process.env.FO_API_KEY })
   *
   * await fo.context.ingest('atlas', 'john@acme.com', [
   *   // Plain text or markdown
   *   { type: 'text', id: 'notes-q1', data: '## Q1 priorities\n- Close Acme deal', source: 'notion' },
   *
   *   // Raw JSON object — Fo extracts structure automatically
   *   { type: 'json', id: 'deal_123', data: { name: 'Acme', value: 240000, stage: 'Contract Review' }, source: 'salesforce' },
   *
   *   // Conversation turns — Fo extracts facts and entities
   *   { type: 'messages', id: 'call_456', data: [{ role: 'user', content: 'Acme wants net-60 terms' }], source: 'gong' },
   *
   *   // URL — Fo fetches, parses, and chunks the page
   *   { type: 'url', id: 'acme_website', data: 'https://acme.com/about', source: 'web' },
   * ])
   * ```
   */
  ingest(agentEmail: string, userId: string, episodes: ContextEpisode[]): Promise<IngestResult>

  /**
   * Connect a datastore directly. Fo syncs it on the defined schedule —
   * no ingestion pipeline to maintain.
   *
   * @param agentEmail  Agent subdomain
   * @param connector   Datastore connection config
   *
   * @example
   * ```ts
   * await fo.context.connect('atlas', {
   *   type: 'snowflake',
   *   connectionString: process.env.SNOWFLAKE_DSN,
   *   query: 'SELECT * FROM customers WHERE updated_at > :last_sync',
   *   schedule: '0 * * * *', // hourly
   * })
   *
   * await fo.context.connect('atlas', {
   *   type: 'notion',
   *   apiKey: process.env.NOTION_TOKEN,
   *   schedule: '0 0 * * *', // daily
   * })
   * ```
   */
  connect(agentEmail: string, connector: DatastoreConnector): Promise<void>
}

interface TriggersNamespace {
  /**
   * Fire a named trigger, causing the agent to act on the event immediately.
   *
   * @param agentEmail  Agent subdomain (e.g. 'atlas' for atlas@foibleai.com)
   * @param triggerName Name of the trigger as defined in `defineTrigger()`
   * @param payload     Event payload matching the trigger's schema
   *
   * @example
   * ```ts
   * await fo.triggers.fire('atlas', 'deal_created', {
   *   dealName: 'Acme Enterprise License',
   *   value: 240000,
   * })
   * ```
   */
  fire(agentEmail: string, triggerName: string, payload: Record<string, unknown>): Promise<void>
}

/**
 * Fo platform client for server-side operations.
 *
 * Use this to push data into the context store from your data pipelines,
 * CRM sync jobs, or any server-side process that has information the agent needs.
 *
 * @example
 * ```ts
 * import { FoClient } from '@fo/sdk'
 *
 * const fo = new FoClient({ apiKey: process.env.FO_API_KEY })
 *
 * // Push CRM data into context
 * await fo.context.ingest('atlas', 'john@acme.com', [
 *   { id: 'deal_123', title: 'Acme License', content: '...', source: 'salesforce' },
 * ])
 *
 * // Fire an event trigger
 * await fo.triggers.fire('atlas', 'deal_created', { dealName: 'Acme', value: 240000 })
 * ```
 */
export class FoClient {
  private readonly apiKey: string
  private readonly baseUrl: string

  readonly context: ContextNamespace
  readonly triggers: TriggersNamespace

  constructor(options: FoClientOptions) {
    if (!options.apiKey) {
      throw new Error('FoClient: apiKey is required. Get yours from `fo auth` or the Fo dashboard.')
    }

    this.apiKey = options.apiKey
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, '')

    this.context = {
      ingest: this._ingestContext.bind(this),
      connect: this._connectDatastore.bind(this),
    }

    this.triggers = {
      fire: this._fireTrigger.bind(this),
    }
  }

  private async _request(path: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${path}`
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
        'User-Agent': '@fo/sdk',
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      let message = `Fo API error: ${response.status} ${response.statusText}`
      try {
        const err = await response.json() as { error?: string }
        if (err.error) message = `Fo API error: ${err.error}`
      } catch {
        // ignore JSON parse errors
      }
      throw new Error(message)
    }

    return response.json()
  }

  private async _ingestContext(
    agentEmail: string,
    userId: string,
    episodes: ContextEpisode[]
  ): Promise<IngestResult> {
    if (!agentEmail) throw new Error('fo.context.ingest: agentEmail is required')
    if (!userId) throw new Error('fo.context.ingest: userId is required')
    if (!Array.isArray(episodes) || episodes.length === 0) {
      throw new Error('fo.context.ingest: episodes must be a non-empty array')
    }
    if (episodes.length > 100) {
      throw new Error('fo.context.ingest: maximum 100 episodes per call')
    }

    // Normalize legacy ContextDocument format to TextEpisode for the API
    const normalized = episodes.map((ep) => {
      if ('content' in ep && !('type' in ep)) {
        // Legacy ContextDocument — convert to text episode
        return { type: 'text' as const, id: ep.id, data: ep.content, source: ep.source }
      }
      return ep
    })

    const result = await this._request('/context/ingest', {
      agentEmail,
      userId,
      episodes: normalized,
    })

    return result as IngestResult
  }

  private async _connectDatastore(
    agentEmail: string,
    connector: DatastoreConnector
  ): Promise<void> {
    if (!agentEmail) throw new Error('fo.context.connect: agentEmail is required')
    if (!connector.type) throw new Error('fo.context.connect: connector.type is required')

    await this._request('/context/connect', {
      agentEmail,
      connector,
    })
  }

  private async _fireTrigger(
    agentEmail: string,
    triggerName: string,
    payload: Record<string, unknown>
  ): Promise<void> {
    if (!agentEmail) throw new Error('fo.triggers.fire: agentEmail is required')
    if (!triggerName) throw new Error('fo.triggers.fire: triggerName is required')

    await this._request('/triggers/fire', {
      agentEmail,
      triggerName,
      payload,
    })
  }
}
