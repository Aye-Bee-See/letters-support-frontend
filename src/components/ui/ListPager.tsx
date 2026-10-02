// Previous / next for the admin lists. Nothing when everything fits on one page,
// unless the URL asks for a page past the end (an old link, or records deleted
// since), which would otherwise leave an empty table and no way back.
export default function ListPager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
  if (page > pages)
    return (
      <div className="queue-pager">
        <span>
          There {pages === 1 ? 'is only 1 page' : `are only ${pages} pages`}.
        </span>
        <button type="button" className="a-btn a-btn-sm" onClick={() => onPage(pages)}>
          Go to page {pages}
        </button>
      </div>
    )
  if (pages <= 1) return null
  return (
    <div className="queue-pager">
      <button type="button" className="a-btn a-btn-sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Previous
      </button>
      <span>
        Page {page} of {pages}
      </span>
      <button type="button" className="a-btn a-btn-sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  )
}
