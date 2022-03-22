import { tmpdir } from 'os'
import * as fs from 'fs'
import * as path from 'path'
import * as process from 'child_process'
import * as util from 'util'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

const exec = util.promisify(process.exec),
  { copyFile, mkdir, mkdtemp, readFile, unlink } = fs.promises

let log = vscode.window.createOutputChannel('ocaml-reason-format')

function isDisabled(config: vscode.WorkspaceConfiguration): boolean {
  return config.get<boolean | undefined>('enabled') === false
}

const ourTmpDirFormat = path.join(tmpdir(), 'vscode-ocaml-reason-format-')

async function prepareTmpDir() {
  try {
    return await mkdtemp(ourTmpDirFormat)
  } catch (err) {
    log.appendLine(`Error creating ${ourTmpDirFormat}XXXXXX: ${err}`)
    throw err
  }
}

function getFullTextRange(textEditor: vscode.TextEditor) {
  const firstLine = textEditor.document.lineAt(0)
  const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1)

  return new vscode.Range(
    0,
    firstLine.range.start.character,
    textEditor.document.lineCount - 1,
    lastLine.range.end.character,
  )
}

let knownToBeEnabled = false,
  ocamlFormatterDisposable: vscode.Disposable,
  reasonFormatterDisposable: vscode.Disposable

function registerOcamlFormatter(ctx: vscode.ExtensionContext, tmpDir: string) {
  ocamlFormatterDisposable =
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: 'ocaml', scheme: 'file' },
      {
        async provideDocumentFormattingEdits(
          document: vscode.TextDocument,
        ): Promise<vscode.TextEdit[] | undefined> {
          const config = vscode.workspace.getConfiguration(
            'ocaml-reason-format',
          )
          if (isDisabled(config)) {
            log.appendLine(`Extension disabled by user configuration.`)
            return
          }

          const rootPath = vscode.workspace.rootPath || ''

          const formatterPath = config.get<string | undefined>('ocamlformat')
          const formatter = formatterPath
            ? path.resolve(rootPath, formatterPath)
            : 'ocamlformat'
          const textEditor = vscode.window.activeTextEditor

          if (textEditor) {
            log.appendLine(`Formatting document with '${formatter}'...`)

            const filePath = textEditor.document.fileName
            const extName = path.extname(filePath)
            const tmpFilePath = `${path.join(tmpDir, uuid.v4())}${extName}`

            await prepareTmpDir()

            const command = `cd ${rootPath} && ${formatter} ${filePath} > ${tmpFilePath}`
            log.appendLine('`' + command + `'`)
            try {
              await exec(command)
            } catch (e) {
              log.appendLine(e.stderr)
              vscode.window.showErrorMessage(e.stderr)
              throw e
            }

            // TODO: Replace this with `document.getText()`, lest it break Format On Save:
            //   <https://github.com/microsoft/vscode/issues/90273#issuecomment-584087026>
            const formattedText = await readFile(tmpFilePath, 'utf8')
            const textRange = getFullTextRange(textEditor)

            return [vscode.TextEdit.replace(textRange, formattedText)]
          } else {
            return []
          }
        },
      },
    )

  ctx.subscriptions.push(ocamlFormatterDisposable)
}

function registerReasonFormatter(ctx: vscode.ExtensionContext, tmpDir: string) {
  reasonFormatterDisposable =
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: 'reason', scheme: 'file' },
      {
        async provideDocumentFormattingEdits(
          document: vscode.TextDocument,
        ): Promise<vscode.TextEdit[] | undefined> {
          const config = vscode.workspace.getConfiguration(
            'ocaml-reason-format',
          )
          if (isDisabled(config)) {
            log.appendLine(`Extension disabled by user configuration.`)
            return
          }

          const rootPath = vscode.workspace.rootPath || ''

          const formatterPath = config.get<string | undefined>('refmt')
          const formatter = formatterPath
            ? path.resolve(rootPath, formatterPath)
            : 'refmt'
          const textEditor = vscode.window.activeTextEditor

          if (textEditor) {
            log.appendLine(`Formatting document with '${formatter}'...`)

            const filePath = textEditor.document.fileName
            const extName = path.extname(filePath)
            const tmpFilePath = `${path.join(tmpDir, uuid.v4())}${extName}`

            prepareTmpDir()
            log.appendLine(`Copying '${filePath}' to '${tmpFilePath}'...`)
            await copyFile(filePath, tmpFilePath)

            const command = `${formatter} ${tmpFilePath}`
            log.appendLine('`' + command + `'`)
            try {
              await exec(command)
            } catch (e) {
              log.appendLine(e.stderr)
              vscode.window.showErrorMessage(e.stderr)
              throw e
            }

            // TODO: Replace this with `document.getText()`, lest it break Format On Save:
            //   <https://github.com/microsoft/vscode/issues/90273#issuecomment-584087026>
            const formattedText = await readFile(tmpFilePath, 'utf8')
            const textRange = getFullTextRange(textEditor)

            log.appendLine(`Deleting '${tmpFilePath}'...`)
            unlink(tmpFilePath)

            return [vscode.TextEdit.replace(textRange, formattedText)]
          } else {
            return []
          }
        },
      },
    )

  ctx.subscriptions.push(reasonFormatterDisposable)
}

log.appendLine(`Loading extension...`)

export async function activate(ctx: vscode.ExtensionContext) {
  log.appendLine(`Activating extension...`)

  const ourTmpDir = await prepareTmpDir()
  log.appendLine(`Using tmpDir ${ourTmpDir}`)

  const config = vscode.workspace.getConfiguration('ocaml-reason-format')
  if (isDisabled(config)) {
    log.appendLine(`Extension disabled by user configuration.`)
    return
  }

  registerOcamlFormatter(ctx, ourTmpDir)
  registerReasonFormatter(ctx, ourTmpDir)
  knownToBeEnabled = true

  const configChangedDisposable = vscode.workspace.onDidChangeConfiguration(
    (ev) => {
      const affectsEnabledStatus = ev.affectsConfiguration(
        'ocaml-reason-format.enabled',
      )

      if (affectsEnabledStatus) {
        const config = vscode.workspace.getConfiguration('ocaml-reason-format')
        if (knownToBeEnabled && isDisabled(config)) {
          log.appendLine(`Extension became disabled; un-registering.`)
          knownToBeEnabled = false
          if (ocamlFormatterDisposable) ocamlFormatterDisposable.dispose()
          if (reasonFormatterDisposable) reasonFormatterDisposable.dispose()
        } else if (!knownToBeEnabled && !isDisabled(config)) {
          log.appendLine(`Extension became enabled; re-registering.`)
          knownToBeEnabled = true
          return activate(ctx)
        }
      }
    },
  )

  ctx.subscriptions.push(configChangedDisposable)
}

export function deactivate() {}
