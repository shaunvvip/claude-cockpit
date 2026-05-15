export function osc8(url: string, text: string, supported: boolean): string {
  if (!supported) return text
  const ESC = '\x1b'
  const BEL = '\x07'
  return `${ESC}]8;;${url}${BEL}${text}${ESC}]8;;${BEL}`
}
