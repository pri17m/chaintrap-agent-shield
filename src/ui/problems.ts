import * as vscode from "vscode";

import type { Finding } from "../types";



export class ProblemsReporter {

  constructor(private readonly collection: vscode.DiagnosticCollection) {}



  refresh(findings: Finding[]): void {

    this.collection.clear();

    const byPath = new Map<string, vscode.Diagnostic[]>();

    for (const f of findings) {

      if (f.acknowledged && (f.severity === "critical" || f.severity === "high")) {

        continue;

      }

      let severity: vscode.DiagnosticSeverity;

      if (f.severity === "critical" || f.severity === "high") {

        severity = vscode.DiagnosticSeverity.Error;

      } else if (f.severity === "info" && f.unverifiedOnline) {

        severity = vscode.DiagnosticSeverity.Warning;

      } else if (f.severity === "info") {

        continue;

      } else {

        severity = vscode.DiagnosticSeverity.Warning;

      }

      const uri = vscode.Uri.file(f.path);

      const diag = new vscode.Diagnostic(new vscode.Range(0, 0, 0, 120), `${f.title}: ${f.message}`, severity);

      diag.source = "Chaintrap";

      diag.code = f.osvIds?.[0] || f.surface;

      const list = byPath.get(uri.fsPath) || [];

      list.push(diag);

      byPath.set(uri.fsPath, list);

    }

    for (const [fsPath, diags] of byPath) {

      this.collection.set(vscode.Uri.file(fsPath), diags);

    }

  }

}


