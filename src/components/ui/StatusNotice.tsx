// .status-notice from style.css: the prisoner's current notice (e.g. "Awaiting trial").
export default function StatusNotice({ text }: { text: string | null | undefined }) {
  if (!text) return null
  return <span className="status-notice">{text}</span>
}
