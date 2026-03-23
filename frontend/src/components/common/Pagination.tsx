import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  itemsPerPage: number;
  onPageChange: (page: number) => void;
  onItemsPerPageChange?: (limit: number) => void;
  showItemsPerPage?: boolean;
  itemsPerPageOptions?: number[];
}

export default function Pagination({
  currentPage,
  totalPages,
  totalItems,
  itemsPerPage,
  onPageChange,
  onItemsPerPageChange,
  showItemsPerPage = true,
  itemsPerPageOptions = [10, 25, 50, 100]
}: PaginationProps) {
  // Calculate the range of items being displayed
  const startItem = totalItems === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = Math.min(currentPage * itemsPerPage, totalItems);

  // Generate page numbers to display
  const getPageNumbers = () => {
    const pages = [];
    // Responsive max visible pages
    const isMobile = window.innerWidth < 640;
    const maxVisible = isMobile ? 5 : 7;
    const halfVisible = Math.floor(maxVisible / 2);

    let start = Math.max(1, currentPage - halfVisible);
    let end = Math.min(totalPages, currentPage + halfVisible);

    // Adjust if we're near the beginning or end
    if (currentPage <= halfVisible) {
      end = Math.min(totalPages, maxVisible);
    } else if (currentPage >= totalPages - halfVisible) {
      start = Math.max(1, totalPages - maxVisible + 1);
    }

    // Add first page and ellipsis if needed
    if (start > 1) {
      pages.push(1);
      if (start > 2) pages.push('...');
    }

    // Add page numbers
    for (let i = start; i <= end; i++) {
      pages.push(i);
    }

    // Add ellipsis and last page if needed
    if (end < totalPages) {
      if (end < totalPages - 1) pages.push('...');
      pages.push(totalPages);
    }

    return pages;
  };

  if (totalPages <= 1 && !showItemsPerPage) {
    return null; // Don't show pagination if there's only one page
  }

  return (
    <div className="flex flex-col lg:flex-row items-center justify-between gap-2 sm:gap-4 py-2 sm:py-3">
      {/* Items per page selector */}
      {showItemsPerPage && onItemsPerPageChange && (
        <div className="flex items-center gap-2 order-2 lg:order-1">
          <label htmlFor="items-per-page" className="text-xs sm:text-sm text-gray-600 hidden sm:inline">
            Items per page:
          </label>
          <label htmlFor="items-per-page" className="text-xs sm:text-sm text-gray-600 sm:hidden">
            Per page:
          </label>
          <select
            id="items-per-page"
            value={itemsPerPage}
            onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
            className="px-2 sm:px-3 py-1 border border-gray-300 rounded-md text-xs sm:text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
          >
            {itemsPerPageOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Page info and controls */}
      <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4 order-1 lg:order-2">
        {/* Item count */}
        <span className="text-xs sm:text-sm text-gray-600">
          {totalItems === 0 ? (
            'No items'
          ) : (
            <>
              <span className="hidden sm:inline">Showing {startItem}-{endItem} of {totalItems}</span>
              <span className="sm:hidden">{startItem}-{endItem} of {totalItems}</span>
            </>
          )}
        </span>

        {/* Page navigation */}
        {totalPages > 1 && (
          <div className="flex items-center gap-0.5 sm:gap-1">
            {/* First page - hidden on mobile */}
            <button
              onClick={() => onPageChange(1)}
              disabled={currentPage === 1}
              className="hidden sm:block p-1 sm:p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="First page"
            >
              <ChevronsLeft className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
            </button>

            {/* Previous page */}
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={currentPage === 1}
              className="p-1 sm:p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-0.5 sm:gap-1">
              {getPageNumbers().map((page, index) => (
                <React.Fragment key={index}>
                  {page === '...' ? (
                    <span className="px-1 sm:px-2 py-0.5 sm:py-1 text-xs sm:text-sm text-gray-400">...</span>
                  ) : (
                    <button
                      onClick={() => onPageChange(page as number)}
                      className={`px-2 sm:px-3 py-0.5 sm:py-1 text-xs sm:text-sm rounded-md transition-colors ${
                        currentPage === page
                          ? 'bg-primary text-white font-medium'
                          : 'hover:bg-gray-100 text-gray-700'
                      }`}
                    >
                      {page}
                    </button>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Next page */}
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="p-1 sm:p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
            </button>

            {/* Last page - hidden on mobile */}
            <button
              onClick={() => onPageChange(totalPages)}
              disabled={currentPage === totalPages}
              className="hidden sm:block p-1 sm:p-1.5 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              aria-label="Last page"
            >
              <ChevronsRight className="h-3.5 sm:h-4 w-3.5 sm:w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}