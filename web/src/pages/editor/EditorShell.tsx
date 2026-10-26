import { useQueryClient } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { getDocument, queryKeys, useRestoreVersion } from '@/api'
import { ConfirmDialog, Tooltip, buttonVariants } from '@/components/ui'
import { EditorCanvas, useEditorApi, useEditorStoreApi } from '@/editor'
import { cn } from '@/lib/cn'
import { importDocumentJson } from '@/export'
import { layoutDocument, tidyEdges } from '@/layout'
import type { Document } from '@/model'
import {
  ConflictBanner,
  EditorLayout,
  ExportDialog,
  SaveVersionDialog,
  ShareDialog,
  ShortcutsDialog,
  VersionHistory,
  type ExportOptions,
} from '@/panels'
import type { Autosave, AutosaveStatus } from './autosave'
import { slugify } from './capture'
import { EditorActions } from './EditorActions'
import { copyDiagramAsPng, exportDiagram } from './exportDiagram'
import type { LayoutAlgorithm, LayoutDirection } from './LayoutMenu'

type EditorShellProps = {
  documentId: string
  autosave: Autosave
  status: AutosaveStatus
}

function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false
  }
  return (
    target.isContentEditable ||
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT'
  )
}

export function EditorShell({ documentId, autosave, status }: EditorShellProps) {
  const api = useEditorApi()
  const store = useEditorStoreApi()
  const client = useQueryClient()
  const restore = useRestoreVersion()
  const fileInput = useRef<HTMLInputElement>(null)

  const [exportOpen, setExportOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const [saveVersionOpen, setSaveVersionOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<Document | null>(null)
  const [resolving, setResolving] = useState(false)
  const [layoutBusy, setLayoutBusy] = useState(false)

  const title = api.document.title

  useEffect(() => {
    document.title = `${title} - Chart.it`
    return () => {
      document.title = 'Chart.it'
    }
  }, [title])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === '?' && !event.metaKey && !event.ctrlKey && !isEditable(event.target)) {
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const adoptServerDocument = async () => {
    const fresh = await getDocument(documentId)
    store.getState().replaceDocument(fresh.content, { silent: true })
    autosave.reset(fresh.version)
    client.setQueryData(queryKeys.document(documentId), fresh)
    return fresh
  }

  const reload = async () => {
    setResolving(true)
    try {
      await adoptServerDocument()
      toast.success('Loaded the latest version')
    } catch (error) {
      toast.error(`Could not reload: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      setResolving(false)
    }
  }

  const overwrite = async () => {
    setResolving(true)
    try {
      const version = autosave.conflictVersion() ?? (await getDocument(documentId)).version
      await autosave.overwrite(version)
    } catch (error) {
      toast.error(
        `Could not overwrite: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    } finally {
      setResolving(false)
    }
  }

  const restoreVersion = async (version: number) => {
    await autosave.flush()
    await restore.mutateAsync({ id: documentId, version })
    await adoptServerDocument()
    toast.success(`Restored version ${version}`)
  }

  const saveNamedVersion = async (label: string) => {
    const ok = await autosave.flush({ label, document: store.getState().document })
    if (ok) {
      toast.success(`Saved version "${label}"`)
    } else {
      toast.error('Could not save the version. Check the save status and try again.')
    }
    return ok
  }

  const selectedNodeIds = () => store.getState().selection.nodes

  const handleExport = async (options: ExportOptions) => {
    await exportDiagram(options, store.getState().document, selectedNodeIds())
  }

  const copyPng = () => copyDiagramAsPng(store.getState().document, selectedNodeIds())

  const applyArranged = (arranged: Document, snapshot: Document) => {
    if (store.getState().document !== snapshot) {
      toast.error('The diagram changed while it was being arranged. Try again.')
      return false
    }
    store.getState().applyLayout(arranged)
    return true
  }

  const runLayout = async (algorithm: LayoutAlgorithm, direction: LayoutDirection) => {
    const snapshot = store.getState().document
    const selected = selectedNodeIds()
    setLayoutBusy(true)
    const toastId = toast.loading('Arranging diagram...')
    try {
      const arranged = await layoutDocument(snapshot, {
        algorithm,
        direction,
        ...(selected.length >= 2 ? { onlySelected: selected } : {}),
      })
      if (applyArranged(arranged, snapshot)) {
        window.requestAnimationFrame(() => api.fitView())
      }
    } catch (error) {
      toast.error(`Could not arrange: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      toast.dismiss(toastId)
      setLayoutBusy(false)
    }
  }

  const runTidyEdges = async () => {
    const snapshot = store.getState().document
    try {
      applyArranged(await tidyEdges(snapshot), snapshot)
    } catch (error) {
      toast.error(
        `Could not tidy edges: ${error instanceof Error ? error.message : 'unknown error'}`,
      )
    }
  }

  const resetRoutes = () => {
    const { document, selection } = store.getState()
    const chosen = new Set(selection.edges)
    store
      .getState()
      .setEdgeWaypoints(
        document.edges
          .filter((edge) => chosen.size === 0 || chosen.has(edge.id))
          .map((edge) => ({ id: edge.id, waypoints: undefined })),
      )
  }

  const applyImport = (imported: Document) => {
    store.getState().replaceDocument(imported)
    store.getState().clearSelection()
    window.requestAnimationFrame(() => api.fitView())
    toast.success(`Imported "${imported.title}"`)
  }

  const confirmImport = async () => {
    const imported = pendingImport
    setPendingImport(null)
    if (!imported) {
      return
    }
    const backedUp = await autosave.flush({
      label: 'Before import',
      document: store.getState().document,
    })
    if (backedUp) {
      applyImport(imported)
    } else {
      toast.error('Could not save a backup of the current diagram, so nothing was imported')
    }
  }

  const onFileChosen = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) {
      return
    }
    try {
      const imported = await importDocumentJson(file)
      if (store.getState().document.nodes.length > 0) {
        setPendingImport(imported)
      } else {
        applyImport(imported)
      }
    } catch (error) {
      toast.error(
        `Could not import: ${error instanceof Error ? error.message : 'not a valid diagram file'}`,
      )
    }
  }

  return (
    <>
      <EditorLayout
        api={api}
        saveStatus={status}
        backSlot={
          <Tooltip content="Back to diagrams">
            <Link
              to="/"
              aria-label="Back to diagrams"
              className={cn(buttonVariants({ variant: 'ghost', size: 'iconSm' }))}
            >
              <ArrowLeft />
            </Link>
          </Tooltip>
        }
        actions={
          <EditorActions
            status={status}
            layoutBusy={layoutBusy}
            onLayout={(algorithm, direction) => void runLayout(algorithm, direction)}
            onTidyEdges={() => void runTidyEdges()}
            onResetRoutes={resetRoutes}
            onCopyPng={() => void copyPng()}
            onRetry={() => void autosave.flush()}
            onExport={() => setExportOpen(true)}
            onImport={() => fileInput.current?.click()}
            onSaveVersion={() => setSaveVersionOpen(true)}
            onHistory={() => setHistoryOpen(true)}
            onShare={() => setShareOpen(true)}
            onShortcuts={() => setShortcutsOpen(true)}
          />
        }
      >
        {status === 'conflict' ? (
          <div className="pointer-events-none absolute inset-x-0 top-3 z-20 flex justify-center px-4">
            <ConflictBanner
              className="pointer-events-auto"
              busy={resolving}
              onReload={() => void reload()}
              onOverwrite={() => void overwrite()}
            />
          </div>
        ) : null}
        <EditorCanvas />
      </EditorLayout>

      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        aria-label="Import JSON file"
        data-testid="import-input"
        className="hidden"
        onChange={(event) => void onFileChosen(event)}
      />
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        defaultFilename={slugify(title)}
        hasSelection={api.selection.nodes.length + api.selection.edges.length > 0}
        onExport={handleExport}
      />
      <ShareDialog documentId={documentId} open={shareOpen} onOpenChange={setShareOpen} />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
      <VersionHistory
        documentId={documentId}
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestore={restoreVersion}
        onRequestSave={() => setSaveVersionOpen(true)}
      />
      <SaveVersionDialog
        open={saveVersionOpen}
        onOpenChange={setSaveVersionOpen}
        onSave={saveNamedVersion}
      />
      <ConfirmDialog
        open={pendingImport !== null}
        onOpenChange={(open) => {
          if (!open) {
            setPendingImport(null)
          }
        }}
        title="Replace this diagram?"
        description="Importing replaces everything on the canvas. The current diagram is saved first as a version named Before import."
        confirmLabel="Replace"
        destructive
        onConfirm={() => void confirmImport()}
      />
    </>
  )
}
