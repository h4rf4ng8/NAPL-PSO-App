import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from './ui/button';
import { Pagination, PaginationContent, PaginationItem } from './ui/pagination';

export function PageButtons({ loading, canPrevious, hasNextPage, previous, next }: { loading: boolean; canPrevious: boolean; hasNextPage: boolean; previous: () => void; next: () => void }) {
  return <Pagination className="my-4 justify-start" aria-label="Results pages">
    <PaginationContent className="flex-wrap gap-2">
      <PaginationItem><Button variant="outline" disabled={loading || !canPrevious} onClick={previous}><ChevronLeft />Previous page</Button></PaginationItem>
      <PaginationItem><Button variant="outline" disabled={loading || !hasNextPage} onClick={next}>Next page<ChevronRight /></Button></PaginationItem>
    </PaginationContent>
  </Pagination>;
}
