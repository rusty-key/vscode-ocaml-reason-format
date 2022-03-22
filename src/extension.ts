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

log.appendLine(`Loading extension...`)

export async function activate(context: vscode.ExtensionContext) {
  const configuration = vscode.workspace.getConfiguration('ocaml-reason-format')
  const rootPath = vscode.workspace.rootPath || ''

  log.appendLine(`Activating extension...`)
  const ourTmpDir = await prepareTmpDir()
  log.appendLine(`Using tmpDir ${ourTmpDir}`)

  const disposable1 = vscode.languages.registerDocumentFormattingEditProvider(
    { language: 'ocaml', scheme: 'file' },
    {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
      ): Promise<vscode.TextEdit[]> {
        const formatterPath = configuration.get<string | undefined>(
          'ocamlformat',
        )
        const formatter = formatterPath
          ? path.resolve(rootPath, formatterPath)
          : 'ocamlformat'
        const textEditor = vscode.window.activeTextEditor

        if (textEditor) {
          log.appendLine(`Formatting document with '${formatter}'...`)

          const filePath = textEditor.document.fileName
          const extName = path.extname(filePath)
          const tmpFilePath = `${path.join(ourTmpDir, uuid.v4())}${extName}`

          await prepareTmpDir()

          const command = `cd ${rootPath} && ${formatter} ${filePath} > ${tmpFilePath}`
          log.appendLine('`' + command + `'`)
          await exec(command)

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

  const disposable2 = vscode.languages.registerDocumentFormattingEditProvider(
    { language: 'reason', scheme: 'file' },
    {
      async provideDocumentFormattingEdits(
        document: vscode.TextDocument,
      ): Promise<vscode.TextEdit[]> {
        const formatterPath = configuration.get<string | undefined>('refmt')
        const formatter = formatterPath
          ? path.resolve(rootPath, formatterPath)
          : 'refmt'
        const textEditor = vscode.window.activeTextEditor

        if (textEditor) {
          log.appendLine(`Formatting document with '${formatter}'...`)

          const filePath = textEditor.document.fileName
          const extName = path.extname(filePath)
          const tmpFilePath = `${path.join(ourTmpDir, uuid.v4())}${extName}`

          prepareTmpDir()
          log.appendLine(`Copying '${filePath}' to '${tmpFilePath}'...`)
          await copyFile(filePath, tmpFilePath)

          const command = `${formatter} ${tmpFilePath}`
          log.appendLine('`' + command + `'`)
          await exec(command)

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

  context.subscriptions.push(disposable1, disposable2)
}

export function deactivate() {}
