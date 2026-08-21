import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'http'
import type { AddressInfo } from 'net'

export interface ChatCompletionFixture {
  status?: number
  headers?: Record<string, string>
  body?: string
  sseEvents?: string[]
  rawBody?: string
  handler?: (req: IncomingMessage, res: ServerResponse) => void
}

export interface RecordedRequest {
  method: string
  url: string
  body: unknown
  headers: IncomingMessage['headers']
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk: Buffer | string) => {
      data += chunk.toString()
    })
    req.on('end', () => {
      if (!data) {
        resolve(undefined)
        return
      }
      try {
        resolve(JSON.parse(data))
      } catch {
        resolve(data)
      }
    })
  })
}

export class MockOpenAiServer {
  private server: Server | undefined
  private fixture: ChatCompletionFixture = {}
  private recorded: RecordedRequest[] = []

  get requests(): readonly RecordedRequest[] {
    return this.recorded
  }

  get requestCount(): number {
    return this.recorded.length
  }

  async start(fixture: ChatCompletionFixture = {}): Promise<string> {
    this.fixture = fixture
    this.recorded = []

    this.server = createServer((req, res) => {
      void this.handle(req, res)
    })

    await new Promise<void>((resolve) => {
      this.server!.listen(0, '127.0.0.1', resolve)
    })

    const address = this.server.address() as AddressInfo
    return `http://127.0.0.1:${address.port}/v1`
  }

  async stop(): Promise<void> {
    if (!this.server) return
    await new Promise<void>((resolve) => {
      this.server!.close(() => resolve())
      this.server!.closeAllConnections()
    })
    this.server = undefined
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const body = await readBody(req)
    this.recorded.push({ method: req.method ?? '', url: req.url ?? '', body, headers: req.headers })

    if (this.fixture.handler) {
      this.fixture.handler(req, res)
      return
    }

    const status = this.fixture.status ?? 200
    const headers = this.fixture.headers ?? {}

    if (this.fixture.sseEvents) {
      res.writeHead(status, { 'Content-Type': 'text/event-stream', ...headers })
      for (const event of this.fixture.sseEvents) {
        res.write(`data: ${event}\n\n`)
      }
      res.write('data: [DONE]\n\n')
      res.end()
      return
    }

    if (this.fixture.rawBody !== undefined) {
      res.writeHead(status, headers)
      res.end(this.fixture.rawBody)
      return
    }

    res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
    res.end(this.fixture.body ?? JSON.stringify({ error: { message: 'mock error' } }))
  }
}
