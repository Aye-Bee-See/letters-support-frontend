// .tag-cloud / .tag from style.css (prisoner tiles, profile interests).
export default function TagCloud({ tags }: { tags: string[] | null | undefined }) {
  if (!tags?.length) return null
  return (
    <div className="tag-cloud">
      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </div>
  )
}
