import React from "react";

interface SkeletonProps {
  className?: string;
  width?: string | number;
  height?: string | number;
  rounded?: boolean;
  animate?: boolean;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  className = "",
  width,
  height,
  rounded = false,
  animate = true,
}) => {
  const baseClasses = `bg-gray-200 ${animate ? "animate-pulse" : ""} ${
    rounded ? "rounded-full" : "rounded"
  }`;
  const style: React.CSSProperties = {};

  if (width) style.width = typeof width === "number" ? `${width}px` : width;
  if (height)
    style.height = typeof height === "number" ? `${height}px` : height;

  return <div className={`${baseClasses} ${className}`} style={style} />;
};

// Metric Card Skeleton
export const MetricCardSkeleton: React.FC = () => (
  <div className="bg-white rounded-lg shadow-sm p-6 border-l-4 border-gray-200">
    <div className="flex items-center justify-between">
      <div className="flex-1">
        <Skeleton className="h-4 w-24 mb-2" />
        <Skeleton className="h-8 w-16 mb-1" />
        <Skeleton className="h-3 w-20" />
      </div>
      <div className="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center">
        <Skeleton className="w-6 h-6" />
      </div>
    </div>
  </div>
);

// Order Card Skeleton
export const OrderCardSkeleton: React.FC = () => (
  <div className="p-4 bg-white border-b border-gray-200 animate-pulse">
    <div className="flex items-start justify-between">
      <div className="flex items-start space-x-3 flex-1">
        <Skeleton className="w-4 h-4 mt-1 rounded" />
        <div className="flex-1">
          <div className="flex items-start justify-between mb-2">
            <div>
              <Skeleton className="h-4 w-32 mb-1" />
              <Skeleton className="h-3 w-48" />
            </div>
            <Skeleton className="h-3 w-16" />
          </div>

          <div className="p-3 bg-gray-50 rounded-lg mb-3">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center space-x-2">
                <Skeleton className="w-4 h-4" />
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-5 w-16 rounded-full" />
              </div>
              <Skeleton className="h-4 w-16" />
            </div>

            <div className="grid grid-cols-2 gap-2 mb-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-3 w-20" />
            </div>

            <div className="p-2 bg-white rounded border border-gray-200">
              <Skeleton className="h-3 w-20 mb-1" />
              <Skeleton className="h-4 w-full" />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <Skeleton className="h-8 w-20 rounded" />
            <Skeleton className="h-8 w-16 rounded" />
            <Skeleton className="h-8 w-16 rounded" />
          </div>
        </div>
      </div>
    </div>
  </div>
);

// Table Row Skeleton
export const TableRowSkeleton: React.FC = () => (
  <tr className="animate-pulse">
    <td className="px-6 py-4">
      <Skeleton className="h-4 w-24 mb-1" />
      <Skeleton className="h-3 w-32" />
    </td>
    <td className="px-6 py-4">
      <Skeleton className="h-4 w-28 mb-1" />
      <Skeleton className="h-3 w-36" />
      <Skeleton className="h-3 w-16" />
    </td>
    <td className="px-6 py-4">
      <Skeleton className="h-4 w-32 mb-1" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-1" />
        <Skeleton className="h-3 w-8" />
      </div>
    </td>
    <td className="px-6 py-4">
      <div className="flex items-center space-x-2">
        <Skeleton className="w-4 h-4" />
        <Skeleton className="h-4 w-16" />
      </div>
    </td>
    <td className="px-6 py-4">
      <Skeleton className="h-4 w-12" />
    </td>
    <td className="px-6 py-4 text-right">
      <Skeleton className="h-6 w-12 ml-auto" />
    </td>
  </tr>
);

// Order Table Skeleton
export const OrderTableSkeleton: React.FC<{ rows?: number }> = ({
  rows = 5,
}) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
    {/* Header skeleton */}
    <div className="p-6 border-b border-gray-200">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-8 w-20 rounded" />
      </div>
      <Skeleton className="h-10 w-full rounded-lg" />
    </div>

    {/* Table skeleton */}
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {Array.from({ length: 6 }).map((_, i) => (
              <th key={i} className="px-6 py-3 text-left">
                <Skeleton className="h-3 w-20" />
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {Array.from({ length: rows }).map((_, i) => (
            <TableRowSkeleton key={i} />
          ))}
        </tbody>
      </table>
    </div>

    {/* Pagination skeleton */}
    <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
      <Skeleton className="h-4 w-48" />
      <div className="flex items-center space-x-2">
        <Skeleton className="h-8 w-16 rounded" />
        <Skeleton className="h-8 w-12 rounded" />
      </div>
    </div>
  </div>
);

// Dashboard Header Skeleton
export const DashboardHeaderSkeleton: React.FC = () => (
  <div className="flex items-center justify-between animate-pulse">
    <div>
      <Skeleton className="h-8 w-48 mb-2" />
      <Skeleton className="h-4 w-64" />
    </div>
    <div className="flex items-center space-x-3">
      <Skeleton className="h-10 w-10 rounded-lg" />
      <Skeleton className="h-10 w-20 rounded-lg" />
      <Skeleton className="h-10 w-20 rounded-lg" />
    </div>
  </div>
);

// Pending Orders Section Skeleton
export const PendingOrdersSkeleton: React.FC<{ orders?: number }> = ({
  orders = 3,
}) => (
  <div className="bg-white rounded-lg shadow-sm border border-gray-200">
    <div className="p-6 border-b border-gray-200">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Skeleton className="w-5 h-5" />
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-5 w-8 rounded-full" />
        </div>
        <div className="flex items-center space-x-2">
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>

    <div className="divide-y divide-gray-200">
      {Array.from({ length: orders }).map((_, i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  </div>
);

// Order Details Modal Skeleton
export const OrderModalSkeleton: React.FC = () => (
  <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between animate-pulse">
        <div>
          <Skeleton className="h-6 w-32 mb-1" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="w-6 h-6" />
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 animate-pulse">
        {/* Status Banner */}
        <div className="p-4 rounded-lg bg-gray-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Skeleton className="w-6 h-6" />
              <div>
                <Skeleton className="h-4 w-24 mb-1" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton className="h-8 w-24 rounded" />
              <Skeleton className="h-8 w-24 rounded" />
            </div>
          </div>
        </div>

        {/* Information panels */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="bg-gray-50 rounded-lg p-4">
              <Skeleton className="h-5 w-32 mb-3" />
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, j) => (
                  <div key={j} className="flex justify-between">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Upsell details */}
        <div className="bg-white border border-gray-200 rounded-lg p-6">
          <Skeleton className="h-6 w-32 mb-4" />
          <div className="flex items-start space-x-4">
            <Skeleton className="w-24 h-24 rounded-lg" />
            <div className="flex-1">
              <Skeleton className="h-5 w-48 mb-2" />
              <Skeleton className="h-4 w-32 mb-2" />
              <Skeleton className="h-4 w-full mb-3" />
              <div className="flex items-center space-x-4">
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-6 w-12 rounded-full" />
              </div>
            </div>
          </div>
        </div>

        {/* Admin section */}
        <div className="space-y-4">
          <Skeleton className="h-5 w-24" />
          <div>
            <Skeleton className="h-4 w-20 mb-1" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between animate-pulse">
        <Skeleton className="h-8 w-16 rounded" />
        <div className="flex items-center space-x-2">
          <Skeleton className="h-8 w-24 rounded" />
          <Skeleton className="h-8 w-24 rounded" />
        </div>
      </div>
    </div>
  </div>
);

// Full Dashboard Skeleton
export const OrdersDashboardSkeleton: React.FC = () => (
  <div className="space-y-6">
    <DashboardHeaderSkeleton />

    {/* Metrics Cards */}
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <MetricCardSkeleton key={i} />
      ))}
    </div>

    {/* Pending Orders */}
    <PendingOrdersSkeleton />

    {/* All Orders */}
    <OrderTableSkeleton />
  </div>
);

export const PersonCardSkeleton: React.FC = () => {
  return (
    <div className="space-y-3">
      {[...Array(5)].map((_, idx) => (
        <span
          key={idx}
          className="w-full h-24 rounded border border-g bg-white animate-pulse px-3 py-2 flex items-center gap-x-2"
        >
          <span className="space-y-2">
            <h1 className="w-32 h-5 rounded-full bg-gray-200"></h1>
            <p className="w-28 h-2 rounded-full bg-gray-200"></p>
            <p className="w-28 h-2 rounded-full bg-gray-200"></p>
          </span>
        </span>
      ))}
    </div>
  );
};

export const PersonDataCardSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse p-6 space-y-4">
      <div className="h-5 w-40 bg-gray-200 rounded"></div>

      {[...Array(3)].map((_, i) => (
        <div key={i} className="flex items-center justify-end py-2">
          {i === 0 && (
            <div className="flex items-center space-x-3 w-1/2">
              <div className="h-8 w-24 bg-gray-200 rounded"></div>
            </div>
          )}

          <div className="h-4 w-1/2 bg-gray-200 rounded"></div>
        </div>
      ))}
    </div>
  );
};

export const VerticalCardsSkeleton: React.FC = () => {
  return (
    <div className="space-y-4">
      {[...Array(3)].map((_, i) => (
        <div className="animate-pulse border rounded-lg p-6 space-y-4">
          {/* Title */}
          <div className="h-5 w-40 bg-gray-200 rounded"></div>

          {/* Rows */}
          <div key={i} className="flex items-center justify-between py-2">
            <div className="flex items-center space-x-3">
              <div className="h-6 w-6 bg-gray-200 rounded"></div>
              <div className="h-4 w-24 bg-gray-200 rounded"></div>
            </div>
            <div className="h-4 w-32 bg-gray-200 rounded"></div>
          </div>

          {/* Edit button */}
          <div className="flex justify-end">
            <div className="h-8 w-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const CalendarSkeleton: React.FC = () => {
  return (
    <div className="animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b">
        <div className="flex items-center space-x-2">
          <div className="h-8 w-8 bg-gray-200 rounded"></div>
          <div className="h-8 w-16 bg-gray-200 rounded"></div>
          <div className="h-8 w-8 bg-gray-200 rounded"></div>
        </div>
        <div className="h-5 w-40 bg-gray-200 rounded"></div>
      </div>

      {/* Calendar Grid Header */}
      <div className="flex border-b">
        {[...Array(31)].map((_, i) => (
          <div
            key={i}
            className="flex flex-col items-center px-3 py-2 border-r"
          >
            <div className="h-3 w-6 bg-gray-200 rounded"></div>
            <div className="h-4 w-4 bg-gray-200 rounded mt-1"></div>
          </div>
        ))}
      </div>

      {/* Rows */}
      {[...Array(5)].map((_, i) => (
        <div key={i} className="flex border-b">
          {/* Left Column (Avatar + Name) */}
          <div className="w-48 flex items-center space-x-3 px-4 py-3">
            <div className="h-6 w-6 bg-gray-200 rounded-full"></div>
            <div className="h-4 w-32 bg-gray-200 rounded"></div>
          </div>

          {/* Calendar Cells */}
          <div className="flex flex-1 relative">
            {/* Full-width faded background */}
            <div className="absolute top-0 left-0 right-0 bottom-0 bg-gray-50"></div>

            {/* Example placeholder event bar */}
            <div className="absolute top-3 left-1/4 h-6 w-1/3 bg-gray-200 rounded-full"></div>
          </div>
        </div>
      ))}
    </div>
  );
};

export const HorizontalCardSkeleton: React.FC = () => {
  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <div
          key={i}
          className="w-full flex items-center justify-between p-3 rounded-lg border border-[#E2E8F0] gap-4 animate-pulse"
        >
          <div className="w-full h-5 bg-gray-200 rounded"></div>
          <div className="h-5 w-20 bg-gray-200 rounded"></div>
          <span className="flex items-center gap-x-2 min-w-max">
            <div className="w-8 h-8 p-2 border border-[#E2E8F0] rounded-xl bg-gray-200"></div>
            <div className="w-8 h-8 p-2 border border-[#E2E8F0] rounded-xl bg-gray-200"></div>
          </span>
        </div>
      ))}
    </div>
  );
};

export const TableLoader = () => {
  const columns = 6;
  const rows = 7;

  return (
    <div className="border border-gray-100 rounded overflow-hidden">
      <table className="w-full">
        <thead className="animate-pulse">
          <tr>
            {Array.from({ length: columns }).map((_, idx) => (
              <th key={idx} className="py-4 px-6">
                <p className="h-4 bg-[#71717A]/20 rounded-full"></p>
              </th>
            ))}
            <th className="py-4 px-6">
              <p className="h-4 bg-[#71717A]/20 rounded-full"></p>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 animate-pulse">
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex} className="py-4 px-6">
                  <p className="h-4 bg-[#09090B]/20 rounded-full"></p>
                </td>
              ))}
              <td className="py-4 px-6">
                <p className="h-4 bg-[#09090B]/20 rounded-full"></p>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default {
  Skeleton,
  MetricCardSkeleton,
  OrderCardSkeleton,
  TableRowSkeleton,
  OrderTableSkeleton,
  DashboardHeaderSkeleton,
  PendingOrdersSkeleton,
  OrderModalSkeleton,
  OrdersDashboardSkeleton,
  PersonCardSkeleton,
  PersonDataCardSkeleton,
  VerticalCardsSkeleton,
  CalendarSkeleton,
  HorizontalCardSkeleton,
  TableLoader,
};
