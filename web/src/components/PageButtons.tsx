export function PageButtons({ loading, canPrevious, hasNextPage, previous, next }: { loading: boolean; canPrevious: boolean; hasNextPage: boolean; previous: () => void; next: () => void }) {
  return <div className="flex gap-3 my-3">
    <button disabled={loading || !canPrevious} onClick={previous}>Previous page</button>
    <button disabled={loading || !hasNextPage} onClick={next}>Next page</button>
  </div>;
}
