import * as path from 'path'
import * as vscode from 'vscode'
import { execSync } from 'child_process'

function getFullTextRange(textEditor: vscode.TextEditor) {
  const firstLine = textEditor.document.lineAt(0)
  const lastLine = textEditor.document.lineAt(textEditor.document.lineCount - 1)

  return new vscode.Range(
    0,
    firstLine.range.start.character,
    textEditor.document.lineCount - 1,
    lastLine.range.end.character
  )
}

export function activate(context: vscode.ExtensionContext) {
  const configuration = vscode.workspace.getConfiguration("ocaml-reason-format")
  const rootPath = vscode.workspace.rootPath || "";

  vscode.languages.registerDocumentFormattingEditProvider('ocaml', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      const formatterPath = configuration.get<string | undefined>("ocamlformat")
      const formatter = formatterPath ? path.resolve(rootPath, formatterPath) : "ocamlformat"
      const textEditor = vscode.window.activeTextEditor

      if (textEditor) {
        const text = textEditor.document.getText()
        const filePath = textEditor.document.fileName
        const formattedText = execSync(`cd ${rootPath} && ${formatter} --name=${filePath} /dev/stdin <<<'${text}'`, {cwd: rootPath}).toString()
        const textRange = getFullTextRange(textEditor)

        return [vscode.TextEdit.replace(textRange, formattedText)]
      } else {
        return []
      }
    }
  })

  vscode.languages.registerDocumentFormattingEditProvider('reason', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      const formatterPath = configuration.get<string | undefined>("refmt")
      const formatter = formatterPath ? path.resolve(rootPath, formatterPath) : "refmt"
      const textEditor = vscode.window.activeTextEditor

      if (textEditor) {
        const text = textEditor.document.getText()
        const formattedText = execSync(`${formatter} <<<'${text}'`).toString()
        const textRange = getFullTextRange(textEditor)

        return [vscode.TextEdit.replace(textRange, formattedText)]
      } else {
        return []
      }
    }
  })
}

export function deactivate() {}
