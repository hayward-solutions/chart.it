import type { z } from 'zod'
import { CURRENT_SCHEMA_VERSION, DocumentSchema, type Document } from './schema'

export type MigrationErrorCode = 'notObject' | 'missingVersion' | 'unsupportedVersion' | 'invalid'

export class DocumentMigrationError extends Error {
  readonly code: MigrationErrorCode
  readonly issues: z.core.$ZodIssue[]

  constructor(code: MigrationErrorCode, message: string, issues: z.core.$ZodIssue[] = []) {
    super(message)
    this.name = 'DocumentMigrationError'
    this.code = code
    this.issues = issues
  }
}

type Migration = (input: Record<string, unknown>) => Record<string, unknown>

const migrations: Record<number, Migration> = {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function migrateDocument(input: unknown): Document {
  if (!isRecord(input)) {
    throw new DocumentMigrationError('notObject', 'document must be an object')
  }
  let current = input
  let version = current.schemaVersion
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    throw new DocumentMigrationError('missingVersion', 'document has no integer schemaVersion')
  }
  if (version < 1 || version > CURRENT_SCHEMA_VERSION) {
    throw new DocumentMigrationError('unsupportedVersion', `unsupported schemaVersion ${version}`)
  }
  while (version < CURRENT_SCHEMA_VERSION) {
    const step = migrations[version]
    if (!step) {
      throw new DocumentMigrationError('unsupportedVersion', `no migration from version ${version}`)
    }
    current = { ...step(current), schemaVersion: version + 1 }
    version += 1
  }
  const result = DocumentSchema.safeParse(current)
  if (!result.success) {
    throw new DocumentMigrationError(
      'invalid',
      'document does not match schema',
      result.error.issues,
    )
  }
  return result.data
}

export function isDocumentMigrationError(error: unknown): error is DocumentMigrationError {
  return error instanceof DocumentMigrationError
}
