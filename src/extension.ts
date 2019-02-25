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

function formatWith(formatterPath: any, extraParam="") {
  const textEditor = vscode.window.activeTextEditor

  if (textEditor) {
    const text = textEditor.document.getText()
    const formattedText = execSync(`${formatterPath} ${extraParam} <<<'${text}'`).toString()
    const textRange = getFullTextRange(textEditor)

    return [vscode.TextEdit.replace(textRange, formattedText)]
  } else {
    return []
  }
}

export function activate(context: vscode.ExtensionContext) {
  const configuration = vscode.workspace.getConfiguration("ocaml-reason-format")

  vscode.languages.registerDocumentFormattingEditProvider('ocaml', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      const formatter = configuration.get("ocamlformat")
      return formatter ? formatWith(formatter, "/dev/stdin") : []
    }
  })

  vscode.languages.registerDocumentFormattingEditProvider('reason', {
    provideDocumentFormattingEdits(document: vscode.TextDocument): vscode.TextEdit[] {
      const formatter = configuration.get("refmt")
      return formatter ? formatWith(formatter) : []
    }
  })
}

export function deactivate() {}
