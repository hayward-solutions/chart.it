export type ExportErrorCode = 'render' | 'clipboard' | 'import' | 'unsupported'

export class ExportError extends Error {
  readonly code: ExportErrorCode

  constructor(code: ExportErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options)
    this.name = 'ExportError'
    this.code = code
  }
}

export function isExportError(error: unknown): error is ExportError {
  return error instanceof ExportError
}
