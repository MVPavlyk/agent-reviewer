import { readFileSync } from 'node:fs';
import type { Finding } from '../review/reduce';

export interface SummaryOptions {
  maxFindings: number;
  promptTemplatePath: string;
}

export function loadPromptTemplate(path: string): string {
  return readFileSync(path, 'utf8');
}

function severityWeight(finding: Finding): number {
  switch (finding.severity) {
    case 'critical':
      return 3;
    case 'warning':
      return 2;
    default:
      return 1;
  }
}

export function rankFindings(findings: Finding[], options: SummaryOptions): Finding[] {
  return [...findings].sort((a, b) => severityWeight(b) - severityWeight(a)).slice(0, options.maxFindings);
}

export async function summarizeViaModel(findings: Finding[], template: string): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const prompt = template.replace('{{findings}}', JSON.stringify(findings));

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'anthropic/claude-3.5-sonnet',
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  const data = await response.json();
  return data.choices[0].message.content;
}

export function buildSummary(findings: Finding[], options: SummaryOptions): Promise<string> {
  const template = loadPromptTemplate(options.promptTemplatePath);
  const ranked = rankFindings(findings, options);
  return summarizeViaModel(ranked, template);
}
