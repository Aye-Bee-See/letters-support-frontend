// Previous / next for the admin lists. Nothing when everything fits on one page.
export default function ListPager({ page, pages, onPage }: { page: number; pages: number; onPage: (page: number) => void }) {
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
