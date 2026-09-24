// .tag inside .tag-cloud (prisoner tiles) or .interests-cloud (profile), from style.css.
export default function TagCloud({
  tags,
  className = 'tag-cloud',
}: {
  tags: string[] | null | undefined
  className?: 'tag-cloud' | 'interests-cloud'
}) {
  if (!tags?.length) return null
  return (
    <div className={className}>
      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </div>
  )
}
