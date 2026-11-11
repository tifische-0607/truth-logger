import css from '@/styles.css?raw'

function token(name: string): string {
  const match = css.match(new RegExp(`--email-${name}:\\s*(#[a-fA-F0-9]+)`))
  const value = match?.[1]
  if (!value) throw new Error(`Missing email design token: ${name}`)
  return value
}

export const main = { backgroundColor: token('background'), fontFamily: 'Inter, Arial, sans-serif' }
export const container = { maxWidth: '560px', padding: '32px 25px' }
export const h1 = { fontFamily: 'Space Grotesk, Arial, sans-serif', fontSize: '24px', fontWeight: 'bold' as const, color: token('heading'), margin: '0 0 20px' }
export const text = { fontSize: '16px', color: token('body'), lineHeight: '1.5', margin: '0 0 25px' }
export const button = { backgroundColor: token('primary'), color: token('background'), fontSize: '16px', borderRadius: '8px', padding: '14px 24px', textDecoration: 'none' }
export const footer = { fontSize: '14px', color: token('muted'), lineHeight: '1.5', margin: '30px 0 0' }
export const link = { color: token('primary'), textDecoration: 'underline' }
export const codeStyle = { ...h1, fontFamily: 'Courier, monospace' }
export const darkModeCss = ''