import { DocumentMigrationError, migrateDocument, type Document } from '@/model'
import { ExportError } from './errors'

export function exportDocumentJson(doc: Document): Blob {
  return new Blob([JSON.stringify(doc, null, 2)], { type: 'application/json' })
}

function readText(file: Blob): Promise<string> {
  if (typeof file.text === 'function') {
    return file.text()
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      resolve(String(reader.result))
    }
    reader.onerror = () => {
      reject(new ExportError('import', 'The file could not be read'))
    }
    reader.readAsText(file)
  })
}

export async function importDocumentJson(file: File): Promise<Document> {
  const text = await readText(file)
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new ExportError('import', 'The file is not valid JSON', { cause: error })
  }
  try {
    return migrateDocument(parsed)
  } catch (error) {
    if (error instanceof DocumentMigrationError) {
      throw new ExportError('import', `The file is not a Chart.it document: ${error.message}`, {
        cause: error,
      })
    }
    throw error
  }
}
