/** Shared attribution for generated documents; never modify original evidence bytes. */
export const DOCUMENT_FOOTER = 'Produced by FridayAnalytics.org';

/** Second footer line on every generated document. No tax number, phone or address. */
export const DOCUMENT_COMPANY_LINE =
  'Friday Analytics Sdn. Bhd. · Company Reg. No. 202601040549 (1702644-K) · www.fridayanalytics.org';

/** Both footer lines, for plain-text documents (manifests, notes, Markdown). */
export const DOCUMENT_FOOTER_TEXT = `${DOCUMENT_FOOTER}\n${DOCUMENT_COMPANY_LINE}`;
