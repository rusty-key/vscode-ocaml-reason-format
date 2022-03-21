import * as path from 'path'
import * as vscode from 'vscode'
import * as process from 'child_process'
import * as fs from 'fs'
import * as uuid from 'uuid'

const tmpDir = '/tmp/vscode-ocaml-reason-format'

function prepareTmpDir() {
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true })
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

export function activate(context: vscode.ExtensionContext) {
  const configuration = vscode.workspace.getConfiguration('ocaml-reason-format')
  const rootPath = vscode.workspace.rootPath || ''

  const disposable1 = vscode.languages.registerDocumentFormattingEditProvider(
    'ocaml',
    {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument,
      ): vscode.TextEdit[] {
        const formatterPath = configuration.get<string | undefined>(
          'ocamlformat',
        )
        const formatter = formatterPath
          ? path.resolve(rootPath, formatterPath)
          : 'ocamlformat'
        const textEditor = vscode.window.activeTextEditor

        if (textEditor) {
          const filePath = textEditor.document.fileName
          const extName = path.extname(filePath)
          const tmpFilePath = `${path.join(tmpDir, uuid.v4())}${extName}`

          prepareTmpDir()
          process.execSync(
            `cd ${rootPath} && ${formatter} ${filePath} > ${tmpFilePath}`,
          )

          const formattedText = fs.readFileSync(tmpFilePath, 'utf8')
          const textRange = getFullTextRange(textEditor)

          return [vscode.TextEdit.replace(textRange, formattedText)]
        } else {
          return []
        }
      },
    },
  )

  const disposable2 = vscode.languages.registerDocumentFormattingEditProvider(
    'reason',
    {
      provideDocumentFormattingEdits(
        document: vscode.TextDocument,
      ): vscode.TextEdit[] {
        const formatterPath = configuration.get<string | undefined>('refmt')
        const formatter = formatterPath
          ? path.resolve(rootPath, formatterPath)
          : 'refmt'
        const textEditor = vscode.window.activeTextEditor

        if (textEditor) {
          const filePath = textEditor.document.fileName
          const extName = path.extname(filePath)
          const tmpFilePath = `${path.join(tmpDir, uuid.v4())}${extName}`

          prepareTmpDir()
          fs.copyFileSync(filePath, tmpFilePath)
          process.execSync(`${formatter} ${tmpFilePath}`).toString()

          const formattedText = fs.readFileSync(tmpFilePath, 'utf8')
          const textRange = getFullTextRange(textEditor)

          fs.unlinkSync(tmpFilePath)

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
