export const escapeHtml = (value: string): string => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')

export const plainHtml = (value: string): string => value.split('\n').map((line) => `<p style="margin:0;line-height:inherit;">${escapeHtml(line) || '<br>'}</p>`).join('')

// Raw HTML is always text. Only the markup emitted here reaches rich-text.
export const markdownHtml = (value: string): string => {
  const inline = (text: string): string => {
    const code: string[] = []
    let safe = escapeHtml(text).replace(/`([^`]+)`/g, (_match, content: string) => {
      code.push(`<code>${content}</code>`)
      return `\u0000${code.length - 1}\u0000`
    })
    safe = safe.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>').replace(/~~(.+?)~~/g, '<del>$1</del>')
      .replace(/\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g, '<a href="$2">$1</a>')
    return safe.replace(/\u0000(\d+)\u0000/g, (_match, index: string) => code[Number(index)] || '')
  }
  const output: string[] = []
  let codeLines: string[] | null = null
  let list = ''
  const closeList = () => { if (list) output.push(`</${list}>`); list = '' }
  for (const line of value.replace(/\r/g, '').split('\n')) {
    if (/^\s*```/.test(line)) {
      closeList()
      if (codeLines) { output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`); codeLines = null }
      else codeLines = []
      continue
    }
    if (codeLines) { codeLines.push(line); continue }
    const heading = /^(#{1,6})\s+(.+)$/.exec(line)
    const item = /^\s*([-*+] |\d+\. )(.*)$/.exec(line)
    if (item) {
      const kind = /^\d/.test(item[1]) ? 'ol' : 'ul'
      if (list !== kind) { closeList(); list = kind; output.push(`<${kind}>`) }
      output.push(`<li>${inline(item[2]).replace(/^\[x\] /i, '☑ ').replace(/^\[ \] /, '☐ ')}</li>`)
      continue
    }
    closeList()
    if (heading) output.push(`<h${heading[1].length}>${inline(heading[2])}</h${heading[1].length}>`)
    else if (/^> ?/.test(line)) output.push(`<blockquote>${inline(line.replace(/^> ?/, ''))}</blockquote>`)
    else if (/^\s*([-*_])(?:\s*\1){2,}\s*$/.test(line)) output.push('<hr>')
    else output.push(`<p style="margin:0;line-height:inherit;">${inline(line) || '<br>'}</p>`)
  }
  closeList()
  if (codeLines) output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`)
  return output.join('')
}

export const diaryDateParts = (date: string) => {
  const [year, month, day] = date.split('-')
  const weekday = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][new Date(`${date}T12:00:00`).getDay()]
  return { day, monthLabel: `${year}年${Number(month)}月`, weekday }
}
